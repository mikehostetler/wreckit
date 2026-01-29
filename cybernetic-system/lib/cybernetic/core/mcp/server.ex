defmodule Cybernetic.Core.MCP.Server do
  @moduledoc """
  Hermes MCP Server implementation with VSM tools.
  Integrates with existing registry.
  """

  # Note: Uncomment when Hermes.Server is available
  # use Hermes.Server,
  #   name: "Cybernetic aMCP Server",
  #   version: "1.0.0",
  #   capabilities: [:tools]

  alias Cybernetic.Core.MCP.Hermes.Registry
  require Logger

  # For now, implement a compatibility layer
  def init(_client, frame) do
    register_tools(frame)
    {:ok, frame}
  end

  def handle_tool(name, args, frame) do
    case Registry.invoke_tool(name, args) do
      {:ok, result} ->
        {:ok, result, frame}

      {:error, reason} ->
        {:error, reason, frame}
    end
  end

  defp register_tools(frame) do
    tools = [
      %{
        name: "vsm_query",
        description: "Query VSM system state",
        input_schema: %{
          system: %{type: "string", required: true},
          query: %{type: "string", required: true}
        },
        handler: &handle_vsm_query/2
      },
      %{
        name: "crdt_merge",
        description: "Merge CRDT states",
        input_schema: %{
          state1: %{type: "map", required: true},
          state2: %{type: "map", required: true}
        },
        handler: &handle_crdt_merge/2
      },
      %{
        name: "telemetry_probe",
        description: "Probe telemetry metrics",
        input_schema: %{
          selector: %{type: "string", required: true}
        },
        handler: &handle_telemetry_probe/2
      },
      %{
        name: "send_telegram",
        description: "Send message via Telegram",
        input_schema: %{
          chat_id: %{type: "string", required: true},
          text: %{type: "string", required: true},
          options: %{type: "map", required: false}
        },
        handler: &handle_send_telegram/2
      }
    ]

    Enum.each(tools, fn tool ->
      Registry.register_tool(
        tool.name,
        tool.description,
        tool.input_schema,
        tool.handler
      )
    end)

    frame
  end

  # Tool handlers
  defp handle_vsm_query(%{system: system, query: query}, _context) do
    case system do
      "s1" -> query_system1(query)
      "s2" -> query_system2(query)
      "s3" -> query_system3(query)
      "s4" -> query_system4(query)
      "s5" -> query_system5(query)
      _ -> {:error, "Unknown system: #{system}"}
    end
  end

  defp handle_crdt_merge(%{state1: state1, state2: state2}, _context) do
    # Call CRDT graph merge
    merged =
      Map.merge(state1, state2, fn _k, v1, v2 ->
        # Simple merge strategy - prefer newer
        if v1[:timestamp] > v2[:timestamp], do: v1, else: v2
      end)

    {:ok, merged}
  end

  defp handle_telemetry_probe(%{selector: selector}, _context) do
    # Collect telemetry metrics
    measurements =
      :telemetry.execute(
        [:cybernetic, :probe],
        %{timestamp: System.system_time(:millisecond)},
        %{selector: selector}
      )

    {:ok, %{selector: selector, measurements: measurements}}
  end

  defp handle_send_telegram(%{chat_id: chat_id, text: text} = params, _context) do
    options = params[:options] || %{}

    # Route through S1 Telegram agent
    GenServer.cast(
      Cybernetic.VSM.System1.Agents.TelegramAgent,
      {:send_message, chat_id, text, options}
    )

    {:ok, %{status: "queued", chat_id: chat_id}}
  end

  # VSM Query helpers
  defp query_system1(query) do
    case query do
      "status" ->
        {:ok, %{status: "operational", agents: 5, queue_depth: 0}}

      "agents" ->
        {:ok, %{agents: ["telegram", "amqp", "web", "cli", "api"]}}

      _ ->
        {:error, "Unknown S1 query: #{query}"}
    end
  end

  defp query_system2(query) do
    case query do
      "coordination" ->
        {:ok, %{active_coordinators: 2, load_balanced: true}}

      _ ->
        {:ok, %{status: "coordinating"}}
    end
  end

  defp query_system3(query) do
    case query do
      "policies" ->
        {:ok, %{active_policies: 10, enforcement: "strict"}}

      _ ->
        {:ok, %{status: "monitoring"}}
    end
  end

  defp query_system4(query) do
    case query do
      "intelligence" ->
        {:ok, %{models_loaded: 3, inference_ready: true}}

      _ ->
        {:ok, %{status: "analyzing"}}
    end
  end

  defp query_system5(query) do
    case query do
      "identity" ->
        {:ok, %{name: "Cybernetic", version: "1.0.0", purpose: "coordination"}}

      _ ->
        {:ok, %{status: "governing"}}
    end
  end
end
