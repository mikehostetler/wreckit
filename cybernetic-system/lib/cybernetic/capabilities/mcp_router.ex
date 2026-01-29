defmodule Cybernetic.Capabilities.MCPRouter do
  @moduledoc """
  Unified MCP (Model Context Protocol) router for tool dispatch.

  Routes tool calls to registered MCP servers, handles authentication,
  rate limiting, and provides a unified interface for tool discovery.

  ## Configuration

      config :cybernetic, Cybernetic.Capabilities.MCPRouter,
        default_timeout: 30_000,
        rate_limit: 100  # requests per minute per client

  ## Example

      # Register an MCP server
      {:ok, _} = MCPRouter.register_server(%{
        name: "github",
        url: "http://localhost:3000",
        tools: ["create_issue", "list_repos", "search_code"]
      })

      # Call a tool
      {:ok, result} = MCPRouter.call_tool("create_issue", %{
        repo: "owner/repo",
        title: "Bug report",
        body: "Description..."
      })

      # List available tools
      tools = MCPRouter.list_tools()
  """
  use GenServer

  require Logger

  alias Cybernetic.Capabilities.Validation

  # Token storage - maps server_name -> encrypted token ref
  @token_table :mcp_router_tokens

  @type server_config :: %{
          name: String.t(),
          url: String.t(),
          tools: [String.t()],
          auth: map() | nil,
          metadata: map()
        }

  @type tool_result :: {:ok, term()} | {:error, term()}

  @telemetry [:cybernetic, :capabilities, :mcp_router]

  # Client API

  @doc "Start the MCP router"
  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts \\ []) do
    name = Keyword.get(opts, :name, __MODULE__)
    GenServer.start_link(__MODULE__, opts, name: name)
  end

  @doc "Register an MCP server"
  @spec register_server(map()) :: {:ok, server_config()} | {:error, term()}
  def register_server(config) do
    GenServer.call(__MODULE__, {:register_server, config})
  end

  @doc "Unregister an MCP server"
  @spec unregister_server(String.t()) :: :ok | {:error, :not_found}
  def unregister_server(name) do
    GenServer.call(__MODULE__, {:unregister_server, name})
  end

  @doc "Call a tool by name"
  @spec call_tool(String.t(), map(), keyword()) :: tool_result()
  def call_tool(tool_name, args, opts \\ []) do
    GenServer.call(__MODULE__, {:call_tool, tool_name, args, opts}, :timer.seconds(60))
  end

  @doc "List all available tools"
  @spec list_tools() :: [map()]
  def list_tools do
    GenServer.call(__MODULE__, :list_tools)
  end

  @doc "List registered servers"
  @spec list_servers() :: [server_config()]
  def list_servers do
    GenServer.call(__MODULE__, :list_servers)
  end

  @doc "Get tool info by name"
  @spec get_tool(String.t()) :: {:ok, map()} | {:error, :not_found}
  def get_tool(tool_name) do
    GenServer.call(__MODULE__, {:get_tool, tool_name})
  end

  @doc "Health check for a server"
  @spec health_check(String.t()) :: {:ok, map()} | {:error, term()}
  def health_check(server_name) do
    GenServer.call(__MODULE__, {:health_check, server_name})
  end

  # Server Callbacks

  @impl true
  def init(opts) do
    Logger.info("MCP Router starting")

    # Create ETS table for secure token storage (not in GenServer state)
    :ets.new(@token_table, [:named_table, :private, :set])

    state = %{
      servers: %{},
      tool_index: %{},
      default_timeout: Keyword.get(opts, :default_timeout, 30_000),
      rate_limits: %{},
      rate_limit_max: Keyword.get(opts, :rate_limit, 100),
      stats: %{
        calls: 0,
        successes: 0,
        failures: 0
      }
    }

    # Schedule rate limit reset
    schedule_rate_limit_reset()

    {:ok, state}
  end

  @impl true
  def handle_call({:register_server, config}, _from, state) do
    with {:ok, server} <- validate_server_config(config) do
      # Build tool index entries
      new_tool_index =
        Enum.reduce(server.tools, state.tool_index, fn tool, acc ->
          Map.put(acc, tool, server.name)
        end)

      new_state = %{
        state
        | servers: Map.put(state.servers, server.name, server),
          tool_index: new_tool_index
      }

      Logger.info("MCP server registered",
        name: server.name,
        tools: length(server.tools)
      )

      {:reply, {:ok, server}, new_state}
    else
      {:error, _} = error -> {:reply, error, state}
    end
  end

  @impl true
  def handle_call({:unregister_server, name}, _from, state) do
    case Map.get(state.servers, name) do
      nil ->
        {:reply, {:error, :not_found}, state}

      server ->
        # Remove tool index entries
        new_tool_index =
          Enum.reduce(server.tools, state.tool_index, fn tool, acc ->
            Map.delete(acc, tool)
          end)

        new_state = %{
          state
          | servers: Map.delete(state.servers, name),
            tool_index: new_tool_index
        }

        Logger.info("MCP server unregistered", name: name)
        {:reply, :ok, new_state}
    end
  end

  @impl true
  def handle_call({:call_tool, tool_name, args, opts}, _from, state) do
    start_time = System.monotonic_time(:millisecond)
    client_id = Keyword.get(opts, :client_id, "default")
    timeout = Keyword.get(opts, :timeout, state.default_timeout)

    # Sanitize tool name to prevent path traversal
    sanitized_tool = Validation.sanitize_name(tool_name)

    with :ok <- Validation.validate_args_size(args),
         {:ok, server_name} <- find_server_for_tool(sanitized_tool, state),
         {:ok, server} <- get_server(server_name, state),
         :ok <- check_rate_limit(client_id, state) do
      result = dispatch_tool_call(server, sanitized_tool, args, timeout)

      {new_stats, success} =
        case result do
          {:ok, _} ->
            {Map.update!(state.stats, :successes, &(&1 + 1)), true}

          {:error, _} ->
            {Map.update!(state.stats, :failures, &(&1 + 1)), false}
        end

      new_state = %{
        state
        | stats: Map.update!(new_stats, :calls, &(&1 + 1)),
          rate_limits: increment_rate_limit(state.rate_limits, client_id)
      }

      emit_telemetry(:call_tool, start_time, %{
        tool: tool_name,
        server: server_name,
        success: success
      })

      {:reply, result, new_state}
    else
      {:error, _} = error ->
        emit_telemetry(:call_tool, start_time, %{
          tool: tool_name,
          error: true
        })

        {:reply, error, state}
    end
  end

  @impl true
  def handle_call(:list_tools, _from, state) do
    tools =
      Enum.map(state.tool_index, fn {tool_name, server_name} ->
        server = Map.get(state.servers, server_name)

        %{
          name: tool_name,
          server: server_name,
          url: server && server.url
        }
      end)

    {:reply, tools, state}
  end

  @impl true
  def handle_call(:list_servers, _from, state) do
    servers = Map.values(state.servers)
    {:reply, servers, state}
  end

  @impl true
  def handle_call({:get_tool, tool_name}, _from, state) do
    case Map.get(state.tool_index, tool_name) do
      nil ->
        {:reply, {:error, :not_found}, state}

      server_name ->
        server = Map.get(state.servers, server_name)

        {:reply,
         {:ok,
          %{
            name: tool_name,
            server: server_name,
            url: server && server.url
          }}, state}
    end
  end

  @impl true
  def handle_call({:health_check, server_name}, _from, state) do
    case Map.get(state.servers, server_name) do
      nil ->
        {:reply, {:error, :not_found}, state}

      server ->
        result = perform_health_check(server)
        {:reply, result, state}
    end
  end

  @impl true
  def handle_info(:reset_rate_limits, state) do
    schedule_rate_limit_reset()
    {:noreply, %{state | rate_limits: %{}}}
  end

  # Private Functions

  @spec validate_server_config(map()) :: {:ok, server_config()} | {:error, term()}
  defp validate_server_config(config) do
    with :ok <- Validation.validate_required(config, [:name, :url, :tools]),
         :ok <- Validation.validate_name(config[:name]),
         :ok <- Validation.validate_url(config[:url]),
         :ok <- Validation.validate_tools(config[:tools]) do
      # Store auth tokens securely in ETS (not in GenServer state)
      auth_ref = store_auth_securely(config[:name], config[:auth])

      server = %{
        name: config[:name],
        url: config[:url],
        tools: config[:tools],
        # Only stores reference, not actual token
        auth: auth_ref,
        metadata: config[:metadata] || %{}
      }

      {:ok, server}
    end
  end

  @spec store_auth_securely(String.t(), map() | nil) :: :none | {:ref, String.t()}
  defp store_auth_securely(_name, nil), do: :none

  defp store_auth_securely(name, auth) when is_map(auth) do
    # Store in private ETS table, return reference
    ref = "auth_#{name}_#{:erlang.unique_integer([:positive])}"
    :ets.insert(@token_table, {ref, auth})
    {:ref, ref}
  end

  defp store_auth_securely(_name, _), do: :none

  @spec get_auth(server_config()) :: map() | nil
  defp get_auth(%{auth: :none}), do: nil

  defp get_auth(%{auth: {:ref, ref}}) do
    case :ets.lookup(@token_table, ref) do
      [{^ref, auth}] -> auth
      [] -> nil
    end
  end

  defp get_auth(_), do: nil

  @spec find_server_for_tool(String.t(), map()) :: {:ok, String.t()} | {:error, :tool_not_found}
  defp find_server_for_tool(tool_name, state) do
    case Map.get(state.tool_index, tool_name) do
      nil -> {:error, :tool_not_found}
      server_name -> {:ok, server_name}
    end
  end

  @spec get_server(String.t(), map()) :: {:ok, server_config()} | {:error, :server_not_found}
  defp get_server(name, state) do
    case Map.get(state.servers, name) do
      nil -> {:error, :server_not_found}
      server -> {:ok, server}
    end
  end

  @spec check_rate_limit(String.t(), map()) :: :ok | {:error, :rate_limited}
  defp check_rate_limit(client_id, state) do
    current = Map.get(state.rate_limits, client_id, 0)

    if current >= state.rate_limit_max do
      {:error, :rate_limited}
    else
      :ok
    end
  end

  @spec increment_rate_limit(map(), String.t()) :: map()
  defp increment_rate_limit(rate_limits, client_id) do
    Map.update(rate_limits, client_id, 1, &(&1 + 1))
  end

  @spec dispatch_tool_call(server_config(), String.t(), map(), timeout()) :: tool_result()
  defp dispatch_tool_call(server, tool_name, args, timeout) do
    url = "#{server.url}/tools/#{tool_name}"

    # Retrieve auth from secure storage
    auth = get_auth(server)

    headers =
      case auth do
        %{type: "bearer", token: token} ->
          [{"authorization", "Bearer #{token}"}]

        %{type: "api_key", key: key, header: header} ->
          [{header, key}]

        _ ->
          []
      end

    body = Jason.encode!(%{arguments: args})

    case Req.post(url,
           body: body,
           headers: [{"content-type", "application/json"} | headers],
           receive_timeout: timeout
         ) do
      {:ok, %{status: status, body: response_body}} when status in 200..299 ->
        {:ok, response_body}

      {:ok, %{status: status, body: body}} ->
        {:error, {:http_error, status, body}}

      {:error, reason} ->
        {:error, {:request_failed, reason}}
    end
  rescue
    e ->
      Logger.error("MCP tool call failed", error: inspect(e))
      {:error, {:exception, Exception.message(e)}}
  end

  @spec perform_health_check(server_config()) :: {:ok, map()} | {:error, term()}
  defp perform_health_check(server) do
    url = "#{server.url}/health"

    case Req.get(url, receive_timeout: 5_000) do
      {:ok, %{status: 200, body: body}} ->
        {:ok, %{status: :healthy, response: body}}

      {:ok, %{status: status}} ->
        {:error, {:unhealthy, status}}

      {:error, reason} ->
        {:error, {:unreachable, reason}}
    end
  rescue
    e ->
      {:error, {:exception, Exception.message(e)}}
  end

  @spec schedule_rate_limit_reset() :: reference()
  defp schedule_rate_limit_reset do
    Process.send_after(self(), :reset_rate_limits, :timer.minutes(1))
  end

  @spec emit_telemetry(atom(), integer(), map()) :: :ok
  defp emit_telemetry(event, start_time, metadata) do
    duration = System.monotonic_time(:millisecond) - start_time

    :telemetry.execute(
      @telemetry ++ [event],
      %{duration: duration},
      metadata
    )
  end
end
