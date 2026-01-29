defmodule Cybernetic.Core.MCP.Hermes.Registry do
  @moduledoc """
  Hermes MCP tool registry for AI agent capabilities.
  Manages tool discovery, registration, and invocation.
  """
  use GenServer
  require Logger

  @registry_table :hermes_tools
  @default_timeout 30_000
  @ready_event [:cybernetic, :mcp_registry, :ready]

  defmodule Tool do
    @type t :: %__MODULE__{
            name: String.t(),
            description: String.t(),
            parameters: map(),
            handler: {module(), atom()},
            capabilities: list(String.t()),
            metadata: map()
          }

    defstruct [:name, :description, :parameters, :handler, :capabilities, metadata: %{}]
  end

  def start_link(opts) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  def init(_opts) do
    # P1 Fix: Use :protected - only GenServer writes, clients can read
    :ets.new(@registry_table, [:named_table, :protected, :set, {:read_concurrency, true}])

    # Register builtin tools after init
    Process.send_after(self(), :register_builtin_tools, 100)

    {:ok,
     %{
       tools: %{},
       invocations: %{},
       stats: %{total_calls: 0, success: 0, failure: 0}
     }}
  end

  # Public API

  @doc "Register a new tool"
  def register_tool(name, description, parameters, handler, opts \\ []) do
    GenServer.call(__MODULE__, {:register_tool, name, description, parameters, handler, opts})
  end

  @doc "List all available tools"
  def list_tools do
    GenServer.call(__MODULE__, :list_tools)
  end

  @doc "List all available tools, raising on error"
  def list_tools! do
    case list_tools() do
      {:ok, tools} -> tools
      {:error, reason} -> raise "Failed to list tools: #{inspect(reason)}"
    end
  end

  @doc "Wait for registry to be ready with builtin tools"
  def await_ready(timeout \\ 2_000) do
    if registry_ready?() do
      :ok
    else
      ref = make_ref()
      parent = self()

      :telemetry.attach(
        {:mcp_ready, ref},
        @ready_event,
        &__MODULE__.handle_mcp_ready/4,
        parent
      )

      receive do
        {:mcp_ready, _count} ->
          :telemetry.detach({:mcp_ready, ref})
          :ok
      after
        timeout ->
          :telemetry.detach({:mcp_ready, ref})
          {:error, :timeout}
      end
    end
  end

  @doc "Telemetry handler for MCP ready events"
  def handle_mcp_ready(_event, measurements, _metadata, parent) do
    send(parent, {:mcp_ready, measurements.count})
  end

  @doc "Get tool details"
  def get_tool(name) do
    case :ets.lookup(@registry_table, name) do
      [{^name, tool}] -> {:ok, tool}
      [] -> {:error, :not_found}
    end
  end

  @doc "Invoke a tool by name"
  def invoke_tool(name, params, context \\ %{}) do
    GenServer.call(__MODULE__, {:invoke_tool, name, params, context}, @default_timeout)
  end

  @doc "Get tool statistics"
  def get_stats do
    GenServer.call(__MODULE__, :get_stats)
  end

  # Callbacks

  def handle_call({:register_tool, name, description, parameters, handler, opts}, _from, state) do
    tool = %Tool{
      name: name,
      description: description,
      parameters: parameters,
      handler: handler,
      capabilities: Keyword.get(opts, :capabilities, []),
      metadata: Keyword.get(opts, :metadata, %{})
    }

    :ets.insert(@registry_table, {name, tool})
    new_state = put_in(state.tools[name], tool)

    Logger.info("Registered MCP tool: #{name}")
    {:reply, {:ok, tool}, new_state}
  end

  def handle_call(:list_tools, _from, state) do
    tools =
      :ets.tab2list(@registry_table)
      |> Enum.map(fn {_name, tool} -> tool end)

    {:reply, {:ok, tools}, state}
  end

  def handle_call({:invoke_tool, name, params, context}, from, state) do
    case get_tool(name) do
      {:ok, tool} ->
        # Track invocation
        invocation_id = generate_invocation_id()

        invocation = %{
          id: invocation_id,
          tool: name,
          params: params,
          context: context,
          started_at: System.monotonic_time(:millisecond),
          from: from
        }

        new_state = put_in(state.invocations[invocation_id], invocation)

        # P0 Fix: Capture registry pid before spawning task
        # (self() inside Task refers to Task's own pid, not registry)
        registry_pid = self()

        Task.start(fn ->
          result = invoke_handler(tool, params, context)
          send(registry_pid, {:invocation_complete, invocation_id, result})
        end)

        {:reply, {:ok, invocation_id}, new_state}

      {:error, :not_found} = error ->
        {:reply, error, state}
    end
  end

  def handle_call(:get_stats, _from, state) do
    {:reply, {:ok, state.stats}, state}
  end

  def handle_info(:register_builtin_tools, state) do
    tools_registered = register_builtin_tools()
    :telemetry.execute(@ready_event, %{count: tools_registered}, %{})
    {:noreply, state}
  end

  def handle_info({:invocation_complete, invocation_id, result}, state) do
    case Map.get(state.invocations, invocation_id) do
      nil ->
        {:noreply, state}

      invocation ->
        # Update stats
        stats =
          case result do
            {:ok, _} -> Map.update!(state.stats, :success, &(&1 + 1))
            {:error, _} -> Map.update!(state.stats, :failure, &(&1 + 1))
          end
          |> Map.update!(:total_calls, &(&1 + 1))

        # Clean up invocation
        new_state =
          state
          |> Map.put(:stats, stats)
          |> update_in([:invocations], &Map.delete(&1, invocation_id))

        # Emit telemetry
        duration = System.monotonic_time(:millisecond) - invocation.started_at

        :telemetry.execute(
          [:mcp, :tool, :invocation],
          %{duration: duration},
          %{tool: invocation.tool, success: match?({:ok, _}, result)}
        )

        {:noreply, new_state}
    end
  end

  # Private functions

  defp registry_ready? do
    case :ets.whereis(@registry_table) do
      :undefined ->
        false

      _ ->
        :ets.info(@registry_table, :size) > 0
    end
  rescue
    ArgumentError -> false
  end

  defp register_builtin_tools do
    tools = [
      # VSM Tools
      {"vsm_query",
       %Tool{
         name: "vsm_query",
         description: "Query VSM system state",
         parameters: %{system: :string, query: :string},
         handler: {Cybernetic.Apps.VSM.Query, :execute},
         capabilities: ["vsm", "query", "state"]
       }},

      # CRDT Tools
      {"crdt_merge",
       %Tool{
         name: "crdt_merge",
         description: "Merge CRDT states",
         parameters: %{state1: :map, state2: :map},
         handler: {Cybernetic.Core.CRDT.Graph, :merge},
         capabilities: ["crdt", "merge", "distributed"]
       }},
      {"crdt_query",
       %Tool{
         name: "crdt_query",
         description: "Query CRDT graph",
         parameters: %{query: :string, params: :map},
         handler: {Cybernetic.Core.CRDT.Graph, :query},
         capabilities: ["crdt", "query", "graph"]
       }},

      # Telemetry Tools
      {"telemetry_emit",
       %Tool{
         name: "telemetry_emit",
         description: "Emit telemetry event",
         parameters: %{event: :string, measurements: :map, metadata: :map},
         handler: {Cybernetic.Core.Telemetry, :emit},
         capabilities: ["telemetry", "metrics", "events"]
       }},

      # Security Tools
      {"generate_nonce",
       %Tool{
         name: "generate_nonce",
         description: "Generate cryptographic nonce",
         parameters: %{},
         handler: {Cybernetic.Core.Security.NonceBloom, :generate_nonce},
         capabilities: ["security", "nonce", "crypto"]
       }},

      # Telegram Tools
      {"send_telegram",
       %Tool{
         name: "send_telegram",
         description: "Send message via Telegram",
         parameters: %{chat_id: :string, text: :string, options: :map},
         handler: {Cybernetic.Apps.Telegram.Client, :send_message},
         capabilities: ["telegram", "messaging", "notification"]
       }}
    ]

    # Insert directly into ETS to avoid self-call
    Enum.each(tools, fn {name, tool} ->
      :ets.insert(@registry_table, {name, tool})
    end)

    tools_count = length(tools)
    Logger.info("Registered #{tools_count} builtin MCP tools")

    # P1 Fix: Return count for telemetry metric (was returning :ok from Logger.info)
    tools_count
  end

  defp invoke_handler(%Tool{handler: {module, function}}, params, context) do
    try do
      # Add context to params if the handler supports it
      args =
        if function_exported?(module, function, 2) do
          [params, context]
        else
          [params]
        end

      result = apply(module, function, args)
      {:ok, result}
    rescue
      e ->
        Logger.error("Tool invocation failed: #{inspect(e)}")
        {:error, e}
    end
  end

  defp generate_invocation_id do
    "inv_#{System.unique_integer([:positive, :monotonic])}_#{:rand.uniform(999_999)}"
  end
end
