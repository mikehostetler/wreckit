defmodule Cybernetic.Integrations.OhMyOpencode.MCPProvider do
  @moduledoc """
  Hermes MCP server that exposes Cybernetic platform tools to oh-my-opencode.

  This is a thin adapter around `Cybernetic.MCP.Tool` implementations and is
  intended to be mounted via Hermes StreamableHTTP (`/mcp`).
  """

  use Hermes.Server,
    name: "cybernetic",
    version: "0.1.0",
    capabilities: [:tools]

  alias Cybernetic.MCP.Tools.{CodeAnalysisTool, DatabaseTool}
  alias Cybernetic.VSM.System3.RateLimiter
  alias Hermes.Server.Response

  @tool_specs %{
    "code_analysis.analyze" => %{
      tool: CodeAnalysisTool,
      operation: "analyze",
      description: "Analyze code and return metrics, complexity, and patterns.",
      requires_auth?: false,
      input_schema: %{
        code: {:string, description: "Source code to analyze."},
        file_path: {:string, description: "Path to source file to analyze (server-local)."},
        language: {:string, description: "Optional language hint (e.g., elixir, javascript)."}
      }
    },
    "code_analysis.generate" => %{
      tool: CodeAnalysisTool,
      operation: "generate",
      description: "Generate code from a template.",
      requires_auth?: false,
      input_schema: %{
        template:
          {:required, :string, description: "Template name (e.g., genserver, mcp_tool, test)."},
        context: {:required, {:map, :any}, description: "Template context map."},
        language: {:string, description: "Optional language hint (default: elixir)."}
      }
    },
    "code_analysis.refactor" => %{
      tool: CodeAnalysisTool,
      operation: "refactor",
      description: "Apply a refactoring pattern to code.",
      requires_auth?: false,
      input_schema: %{
        code: {:required, :string, description: "Source code to refactor."},
        pattern: {:required, :string, description: "Refactoring pattern identifier."},
        selection: {:string, description: "Optional selection string for refactoring."}
      }
    },
    "code_analysis.security_scan" => %{
      tool: CodeAnalysisTool,
      operation: "security_scan",
      description: "Scan code for common security issues.",
      requires_auth?: false,
      input_schema: %{
        code: {:string, description: "Source code to scan."},
        directory: {:string, description: "Directory path to scan (server-local)."}
      }
    },
    "database.query" => %{
      tool: DatabaseTool,
      operation: "query",
      description: "Execute a database query (requires authorization).",
      requires_auth?: true,
      input_schema: %{
        sql: {:required, :string, description: "SQL query string."},
        database: {:string, description: "Optional database name/alias."}
      }
    },
    "database.schema" => %{
      tool: DatabaseTool,
      operation: "schema",
      description: "Inspect or modify schema (admin-only).",
      requires_auth?: true,
      input_schema: %{
        action:
          {:required, {:enum, ["list", "describe", "create", "drop"]},
           description: "Schema action to perform."},
        table: {:string, description: "Table name (required for describe/drop)."},
        schema_definition: {{:map, :any}, description: "Schema definition payload (for create)."}
      }
    },
    "database.transaction" => %{
      tool: DatabaseTool,
      operation: "transaction",
      description: "Execute multiple database operations in a transaction.",
      requires_auth?: true,
      input_schema: %{
        operations:
          {:required, {:list, {:map, :any}}, description: "List of operations to execute."}
      }
    },
    "database.analyze" => %{
      tool: DatabaseTool,
      operation: "analyze",
      description: "Analyze a table (requires read access).",
      requires_auth?: true,
      input_schema: %{
        table: {:required, :string, description: "Table name."},
        metrics: {:required, {:list, :string}, description: "List of metric names."}
      }
    }
  }

  @tool_names Map.keys(@tool_specs)

  @impl true
  def init(_client_info, frame) do
    frame =
      Enum.reduce(@tool_names, frame, fn tool_name, frame ->
        spec = Map.fetch!(@tool_specs, tool_name)

        register_tool(frame, tool_name,
          description: spec.description,
          input_schema: spec.input_schema,
          annotations: %{
            "x-cybernetic-auth-required" => spec.requires_auth?,
            "x-cybernetic-operation" => spec.operation,
            "x-cybernetic-tool" => tool_name |> String.split(".") |> List.first()
          }
        )
      end)

    {:ok, frame}
  end

  @impl true
  def handle_tool_call(tool_name, params, frame) when is_binary(tool_name) and is_map(params) do
    with {:ok, spec} <- fetch_tool_spec(tool_name),
         :ok <- enforce_auth(spec, frame),
         :ok <- enforce_rate_limit(tool_name, frame),
         {:ok, result} <- invoke_tool(spec, params, frame) do
      {:reply, Response.tool() |> Response.structured(result), frame}
    else
      {:error, reason} ->
        {:reply, Response.tool() |> Response.error(format_error(reason)), frame}
    end
  end

  def handle_tool_call(tool_name, _params, frame) do
    {:reply,
     Response.tool()
     |> Response.error("Invalid tool call: #{inspect(tool_name)}"), frame}
  end

  defp fetch_tool_spec(tool_name) do
    case Map.fetch(@tool_specs, tool_name) do
      {:ok, spec} -> {:ok, spec}
      :error -> {:error, :unknown_tool}
    end
  end

  defp enforce_auth(%{requires_auth?: false}, _frame), do: :ok

  defp enforce_auth(%{requires_auth?: true}, frame) do
    if is_map(frame.assigns[:auth_context]) do
      :ok
    else
      {:error, :unauthorized}
    end
  end

  defp enforce_rate_limit(tool_name, frame) do
    env = Application.get_env(:cybernetic, :environment, :prod)
    rate_limiter = frame.assigns[:rate_limiter] || RateLimiter
    client_id = client_id(frame)

    try do
      # Per-client budgets are keyed by tuple: {:mcp_tools, client_id}
      case RateLimiter.request_tokens(rate_limiter, {:mcp_tools, client_id}, tool_name, :normal) do
        :ok ->
          :ok

        {:error, :rate_limited} ->
          {:error, :rate_limited}

        {:error, :unknown_budget} ->
          if env == :prod, do: {:error, :rate_limited}, else: :ok

        {:error, other} ->
          if env == :prod, do: {:error, other}, else: :ok
      end
    rescue
      _ ->
        if env == :prod, do: {:error, :rate_limited}, else: :ok
    end
  end

  defp client_id(frame) do
    case frame.assigns[:auth_context] do
      %{user_id: user_id} when is_binary(user_id) and user_id != "" ->
        user_id

      _ ->
        case frame.private[:session_id] do
          session_id when is_binary(session_id) and session_id != "" -> session_id
          _ -> "unknown"
        end
    end
  end

  defp invoke_tool(%{tool: tool, operation: operation}, params, frame) do
    params = stringify_keys(params)
    context = tool_context(frame)

    case tool.execute(operation, params, context) do
      {:ok, result} when is_map(result) -> {:ok, result}
      {:ok, other} -> {:ok, %{result: other}}
      {:error, reason} -> {:error, reason}
    end
  end

  defp tool_context(frame) do
    auth_context = frame.assigns[:auth_context]

    %{
      actor: actor_from_auth(auth_context),
      auth_context: auth_context,
      tenant_id: frame.assigns[:tenant_id]
    }
  end

  defp actor_from_auth(%{metadata: %{username: username}})
       when is_binary(username) and username != "",
       do: username

  defp actor_from_auth(%{user_id: user_id}) when is_binary(user_id) and user_id != "",
    do: user_id

  defp actor_from_auth(_), do: nil

  defp stringify_keys(value) when is_map(value) do
    Map.new(value, fn
      {k, v} when is_atom(k) -> {Atom.to_string(k), stringify_keys(v)}
      {k, v} when is_binary(k) -> {k, stringify_keys(v)}
      {k, v} -> {to_string(k), stringify_keys(v)}
    end)
  end

  defp stringify_keys(value) when is_list(value), do: Enum.map(value, &stringify_keys/1)
  defp stringify_keys(value), do: value

  defp format_error(:unknown_tool), do: "Unknown tool"
  defp format_error(:unauthorized), do: "Unauthorized"
  defp format_error(:rate_limited), do: "Rate limited"
  defp format_error(error) when is_binary(error), do: error
  defp format_error(error), do: inspect(error)
end
