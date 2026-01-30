defmodule Cybernetic.Archeology.DynamicCollector do
  @moduledoc """
  Ephemeral dynamic trace collector for runtime execution flow analysis.

  This module captures execution traces using :telemetry events to identify
  dynamic dispatch patterns and dependencies that static analysis cannot detect.

  ## Overview

  The collector spans from HTTP/AMQP entry points through VSM message handlers
  and internal service bridges, correlating disjoint events via trace IDs.

  ## Architecture

  * **GenServer**: Manages trace collection lifecycle
  * **ETS Table**: In-memory span buffering (type: :bag for multiple spans per trace_id)
  * **Trace ID Correlation**: Groups spans by trace_id from OpenTelemetry context
  * **LRU Eviction**: Maintains max trace count to prevent memory exhaustion

  ## Usage

  Start the collector:

      {:ok, pid} = DynamicCollector.start_link()

  Collect traces:

      # Generate some traffic...
      DynamicCollector.get_traces()
      #=> [%{trace_id: "abc123", spans: [...], ...}]

  Stop and export:

      DynamicCollector.stop_and_export("dynamic-traces.json")

  ## Data Format

  Spans are stored with the following structure:

      %{
        trace_id: "trace_id_from_context_or_generated",
        span_id: "unique_span_id",
        parent_span_id: "parent_span_id_or_nil",
        module: "Elixir.Cybernetic.VSM.System1.MessageHandler",
        function: "handle_message",
        arity: 3,
        file: "lib/cybernetic/vsm/system1/message_handler.ex",
        line: 11,
        timestamp: System.system_time(:microsecond),
        duration_us: 1234,
        metadata: %{
          operation: "operation",
          system: :s1,
          entry_point_type: :amqp
        }
      }

  ## Memory Management

  * Max traces: 1000 (configurable via `:max_traces` option)
  * ETS table: In-memory only, ephemeral
  * Auto-eviction: LRU when limit reached

  ## Example

      # Start collector
      {:ok, pid} = DynamicCollector.start_link(max_traces: 500)

      # Generate synthetic traffic (HTTP + AMQP)
      Cybernetic.Archeology.TrafficGenerator.generate_http()
      Cybernetic.Archeology.TrafficGenerator.generate_amqp()

      # Export traces to JSON
      DynamicCollector.export_traces("dynamic-traces.json")

      # Stop collector
      DynamicCollector.stop()

  """
  use GenServer
  require Logger

  @default_max_traces 1000
  @table_name :dynamic_traces

  defstruct [:trace_table, :active_traces, :max_traces, :handlers]

  # Client API

  @doc """
  Start the DynamicCollector GenServer.

  ## Options

  * `:max_traces` - Maximum number of traces to store (default: 1000)
  * `:name` - Registered name for the GenServer (default: __MODULE__)

  ## Example

      {:ok, pid} = DynamicCollector.start_link(max_traces: 500)
  """
  def start_link(opts \\ []) do
    name = Keyword.get(opts, :name, __MODULE__)
    GenServer.start_link(__MODULE__, opts, name: name)
  end

  @doc """
  Stop the collector.
  """
  def stop do
    GenServer.stop(__MODULE__)
  end

  @doc """
  Get all collected traces grouped by trace_id.

  ## Returns

  List of trace maps with grouped spans:

      [
        %{
          trace_id: "abc123",
          entry_point: %{type: :amqp, module: "...", function: "..."},
          spans: [%{span_id: "...", module: "...", function: "...", ...}],
          span_count: 5
        },
        ...
      ]

  """
  def get_traces do
    GenServer.call(__MODULE__, :get_traces)
  end

  @doc """
  Export traces to JSON file.

  ## Options

  * `:output` - Output file path (default: "dynamic-traces.json")

  ## Returns

  `:ok` on success, `{:error, reason}` on failure.

  """
  def export_traces(output \\ "dynamic-traces.json") do
    GenServer.call(__MODULE__, {:export, output})
  end

  @doc """
  Stop collector and export traces to JSON file.

  ## Options

  * `:output` - Output file path (default: "dynamic-traces.json")

  ## Returns

  `:ok` on success, `{:error, reason}` on failure.

  """
  def stop_and_export(output \\ "dynamic-traces.json") do
    GenServer.call(__MODULE__, {:stop_and_export, output}, :infinity)
  end

  @doc """
  Attach a custom telemetry event handler.

  ## Parameters

  * `event_name` - Telemetry event name (e.g., `[:cybernetic, :archeology, :span]`)
  * `handler_fun` - Function of arity 4: `(event_name, measurements, metadata, config) -> :ok`

  ## Example

      DynamicCollector.attach_handler(
        [:my_app, :custom_event],
        &MyModule.handle_event/4
      )
  """
  def attach_handler(event_name, handler_fun) when is_function(handler_fun, 4) do
    GenServer.call(__MODULE__, {:attach_handler, event_name, handler_fun})
  end

  # Server Callbacks

  @impl true
  def init(opts) do
    max_traces = Keyword.get(opts, :max_traces, @default_max_traces)

    # Create ETS table for span buffering (bag type allows multiple spans per trace_id)
    trace_table = :ets.new(@table_name, [:named_table, :public, :bag])

    # Attach to span telemetry events
    attach_span_handlers()

    state = %__MODULE__{
      trace_table: trace_table,
      active_traces: %{},
      max_traces: max_traces,
      handlers: %{}
    }

    Logger.info(
      "Dynamic trace collector started: max_traces=#{max_traces}, table=#{inspect(trace_table)}"
    )

    {:ok, state}
  end

  @impl true
  def handle_call(:get_traces, _from, state) do
    traces = build_trace_list(state)
    {:reply, traces, state}
  end

  @impl true
  def handle_call({:export, output}, _from, state) do
    result = do_export(state, output)
    {:reply, result, state}
  end

  @impl true
  def handle_call({:stop_and_export, output}, from, state) do
    # Export first
    result = do_export(state, output)

    # Then stop
    GenServer.reply(from, result)
    {:stop, :normal, state}
  end

  @impl true
  def handle_call({:attach_handler, event_name, handler_fun}, _from, state) do
    handler_id = {:custom, event_name}

    case :telemetry.attach(handler_id, event_name, handler_fun, nil) do
      :ok ->
        new_handlers = Map.put(state.handlers, handler_id, {event_name, handler_fun})
        {:reply, :ok, %{state | handlers: new_handlers}}

      {:error, reason} ->
        Logger.error("Failed to attach handler to #{inspect(event_name)}: #{inspect(reason)}")
        {:reply, {:error, reason}, state}
    end
  end

  @impl true
  def handle_info({:span_event, span_data}, state) do
    # Store span in ETS table
    :ets.insert(state.trace_table, {span_data.trace_id, span_data})

    # Update active traces with LRU timestamp
    new_active_traces =
      Map.put(state.active_traces, span_data.trace_id, System.system_time(:millisecond))

    # Check if we need to evict old traces
    final_state = maybe_evict_traces(%{state | active_traces: new_active_traces})

    {:noreply, final_state}
  end

  # Private Functions

  defp attach_span_handlers do
    # Attach to :telemetry.span events
    # These are emitted by :telemetry.span/3 calls
    handler_id = {:dynamic_tracer, :span}

    :telemetry.attach(
      handler_id,
      [:cybernetic, :archeology, :span],
      &__MODULE__.handle_span_event/4,
      nil
    )

    # Also attach to existing telemetry events we want to capture
    # These will be converted to spans
    existing_events = [
      {[:cyb, :amqp, :publish], :amqp_publish},
      {[:cyb, :amqp, :consume], :amqp_consume},
      {[:cybernetic, :edge, :endpoint, :stop], :phoenix_request}
    ]

    Enum.each(existing_events, fn {event_name, type} ->
      :telemetry.attach(
        {:dynamic_tracer, type},
        event_name,
        &__MODULE__.handle_telemetry_event/4,
        type
      )
    end)

    Logger.debug("Attached dynamic tracer to telemetry events")
  end

  @doc false
  def handle_span_event(_event_name, measurements, metadata, _config) do
    # Extract span context from measurements/metadata
    trace_id = get_trace_id(metadata)
    parent_span_id = get_parent_span_id(metadata)
    span_id = generate_span_id()

    # Get caller information from stacktrace
    {module, function, arity, file, line} = get_caller_info(metadata)

    span = %{
      trace_id: trace_id,
      span_id: span_id,
      parent_span_id: parent_span_id,
      module: module,
      function: function,
      arity: arity,
      file: file,
      line: line,
      timestamp: Map.get(measurements, :start_time, System.system_time(:microsecond)),
      duration_us: Map.get(measurements, :duration, 0),
      metadata: metadata
    }

    # Send to collector
    send(__MODULE__, {:span_event, span})

    :ok
  end

  @doc false
  def handle_telemetry_event(event_name, measurements, metadata, type) do
    # Convert existing telemetry events to spans
    trace_id = get_trace_id(metadata)
    span_id = generate_span_id()

    # Extract relevant info based on event type
    {module, function, arity, file, line} = extract_event_info(event_name, metadata, type)

    span = %{
      trace_id: trace_id,
      span_id: span_id,
      parent_span_id: nil,
      module: module,
      function: function,
      arity: arity,
      file: file,
      line: line,
      timestamp: Map.get(metadata, :time, System.system_time(:microsecond)),
      duration_us: Map.get(measurements, :duration, 0),
      metadata: Map.put(metadata, :event_type, type)
    }

    # Send to collector
    send(__MODULE__, {:span_event, span})

    :ok
  end

  defp get_trace_id(metadata) do
    # Try to get trace_id from OpenTelemetry context
    case Cybernetic.Telemetry.OTEL.current_ids() do
      %{trace_id: trace_id} when is_binary(trace_id) and trace_id != "" ->
        trace_id

      _ ->
        # Fallback: generate trace_id from metadata or random
        Map.get(metadata, :trace_id) || generate_trace_id()
    end
  end

  defp get_parent_span_id(metadata) do
    # Try to get parent span_id from metadata first
    case Map.get(metadata, :parent_span_id) do
      parent_id when is_binary(parent_id) and parent_id != "" ->
        parent_id

      _ ->
        # Try to get current OTEL span ID as parent
        case Cybernetic.Telemetry.OTEL.current_ids() do
          %{span_id: span_id} when is_binary(span_id) and span_id != "" ->
            span_id

          _ ->
            nil
        end
    end
  end

  defp generate_trace_id do
    # Generate a unique trace ID (16 bytes, hex encoded)
    :crypto.strong_rand_bytes(16)
    |> Base.encode16(case: :lower)
  end

  defp generate_span_id do
    # Generate a unique span ID (8 bytes, hex encoded)
    :crypto.strong_rand_bytes(8)
    |> Base.encode16(case: :lower)
  end

  defp get_caller_info(metadata) do
    # Try to get caller info from metadata, or extract from stacktrace
    case Map.get(metadata, :caller_info) do
      {module, function, arity, file, line} ->
        {module, function, arity, file, line}

      _ ->
        # Fallback to stacktrace
        case Process.info(self(), :current_stacktrace) do
          {:current_stacktrace, stacktrace} when is_list(stacktrace) ->
            # Skip the first few frames (this function, GenServer, etc.)
            caller_frame =
              stacktrace
              |> Enum.drop(5)
              |> Enum.find(fn
                {m, _f, _a, _loc} when is_atom(m) -> not (m == __MODULE__ or m == GenServer)
                _ -> false
              end)

            case caller_frame do
              {module, function, arity, [file: file, line: line]} ->
                {inspect(module), Atom.to_string(function), arity, file, line}

              _ ->
                {"unknown", "unknown", 0, "unknown", 0}
            end

          _ ->
            {"unknown", "unknown", 0, "unknown", 0}
        end
    end
  end

  defp extract_event_info(_event_name, metadata, type) do
    case type do
      :amqp_publish ->
        module = Map.get(metadata, :module, "Elixir.Cybernetic.Core.Transport.AMQP")
        function = "publish"
        arity = 2
        file = "lib/cybernetic/core/transport/amqp.ex"
        line = 0
        {module, function, arity, file, line}

      :amqp_consume ->
        module = Map.get(metadata, :module, "Elixir.Cybernetic.Core.Transport.AMQP.Consumer")
        function = "handle_info"
        arity = 2
        file = "lib/cybernetic/core/transport/amqp/consumer.ex"
        line = 0
        {module, function, arity, file, line}

      :phoenix_request ->
        # Extract from conn struct
        conn = Map.get(metadata, :conn)
        _route = Map.get(conn || %{}, :route_path, "/unknown")
        module = "Elixir.Cybernetic.Edge.Gateway.Endpoint"
        function = "call"
        arity = 2
        file = "lib/cybernetic/edge/gateway/endpoint.ex"
        line = 0
        {module, function, arity, file, line}

      _ ->
        {"unknown", "unknown", 0, "unknown", 0}
    end
  end

  defp build_trace_list(state) do
    # Group spans by trace_id
    :ets.tab2list(state.trace_table)
    |> Enum.group_by(fn {trace_id, _span} -> trace_id end, fn {_trace_id, span} -> span end)
    |> Enum.map(fn {trace_id, spans} ->
      # Sort spans by timestamp
      sorted_spans = Enum.sort_by(spans, & &1.timestamp)

      # Find entry point (first span with entry_point_type metadata)
      entry_point =
        Enum.find(sorted_spans, fn span ->
          Map.get(span.metadata, :entry_point_type)
        end)

      %{
        trace_id: trace_id,
        entry_point: extract_entry_point(entry_point),
        spans: sorted_spans,
        span_count: length(sorted_spans)
      }
    end)
    |> Enum.sort_by(& &1.trace_id)
  end

  defp extract_entry_point(nil), do: nil

  defp extract_entry_point(span) do
    %{
      type: Map.get(span.metadata, :entry_point_type, :unknown),
      module: span.module,
      function: span.function,
      arity: span.arity
    }
  end

  defp maybe_evict_traces(state) do
    trace_count = map_size(state.active_traces)

    if trace_count > state.max_traces do
      # Evict oldest traces (LRU)
      evict_count = trace_count - state.max_traces

      evicted =
        state.active_traces
        |> Enum.sort_by(fn {_trace_id, timestamp} -> timestamp end)
        |> Enum.take(evict_count)

      Enum.each(evicted, fn {trace_id, _timestamp} ->
        :ets.delete(state.trace_table, trace_id)
      end)

      new_active_traces =
        Enum.reduce(evicted, state.active_traces, fn {trace_id, _}, acc ->
          Map.delete(acc, trace_id)
        end)

      Logger.debug("Evicted #{evict_count} old traces (LRU)")

      %{state | active_traces: new_active_traces}
    else
      state
    end
  end

  defp do_export(state, output) do
    traces = build_trace_list(state)

    entry_points =
      traces
      |> Enum.map(fn t ->
        case t.entry_point do
          nil -> :unknown
          entry -> Map.get(entry, :type, :unknown)
        end
      end)
      |> Enum.uniq()

    output_data = %{
      summary: %{
        trace_count: length(traces),
        total_spans: Enum.sum(Enum.map(traces, & &1.span_count)),
        entry_points_covered: entry_points
      },
      traces: traces
    }

    case File.write(output, Jason.encode!(output_data, pretty: true)) do
      :ok ->
        Logger.info("Exported #{length(traces)} traces to #{output}")
        :ok

      {:error, reason} ->
        Logger.error("Failed to export traces: #{inspect(reason)}")
        {:error, reason}
    end
  end
end
