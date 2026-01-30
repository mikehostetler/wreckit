defmodule Cybernetic.Telemetry.BatchedCollector do
  @moduledoc """
  High-performance batched telemetry collector.
  Reduces telemetry overhead by batching events and flushing periodically
  or when batch size thresholds are reached.
  """
  use GenServer
  require Logger

  @default_batch_size 100
  # 5 seconds
  @default_flush_interval 5_000
  @default_max_memory_mb 50

  defstruct [
    :batch_size,
    :flush_interval,
    :max_memory_bytes,
    :current_batch,
    :flush_timer,
    :handlers,
    :stats
  ]

  def start_link(opts \\ []) do
    name = Keyword.get(opts, :name, __MODULE__)
    GenServer.start_link(__MODULE__, opts, name: name)
  end

  def init(opts) do
    batch_size = Keyword.get(opts, :batch_size, @default_batch_size)
    flush_interval = Keyword.get(opts, :flush_interval, @default_flush_interval)
    max_memory_mb = Keyword.get(opts, :max_memory_mb, @default_max_memory_mb)

    state = %__MODULE__{
      batch_size: batch_size,
      flush_interval: flush_interval,
      max_memory_bytes: max_memory_mb * 1024 * 1024,
      current_batch: [],
      flush_timer: schedule_flush(flush_interval),
      handlers: %{},
      stats: init_stats()
    }

    # Attach to telemetry events
    attach_telemetry_handlers()

    Logger.info(
      "Batched telemetry collector started: batch_size=#{batch_size}, flush_interval=#{flush_interval}ms"
    )

    {:ok, state}
  end

  @doc """
  Add a custom handler for processed batches.
  """
  def add_handler(name, handler_fun) when is_function(handler_fun, 1) do
    GenServer.cast(__MODULE__, {:add_handler, name, handler_fun})
  end

  @doc """
  Remove a handler.
  """
  def remove_handler(name) do
    GenServer.cast(__MODULE__, {:remove_handler, name})
  end

  @doc """
  Get collector statistics.
  """
  def get_stats do
    GenServer.call(__MODULE__, :get_stats)
  end

  @doc """
  Force flush current batch.
  """
  def flush do
    GenServer.cast(__MODULE__, :force_flush)
  end

  # GenServer callbacks

  def handle_cast({:telemetry_event, event_name, measurements, metadata}, state) do
    event = %{
      name: event_name,
      measurements: measurements,
      metadata: metadata,
      timestamp: System.system_time(:microsecond)
    }

    new_batch = [event | state.current_batch]
    new_stats = update_stats(state.stats, :events_received, 1)

    # Check if we should flush
    should_flush = should_flush_batch?(new_batch, state)

    if should_flush do
      flush_batch(new_batch, state)

      new_state = %{
        state
        | current_batch: [],
          stats: update_stats(new_stats, :batches_flushed, 1),
          flush_timer: schedule_flush(state.flush_interval)
      }

      {:noreply, new_state}
    else
      new_state = %{state | current_batch: new_batch, stats: new_stats}
      {:noreply, new_state}
    end
  end

  def handle_cast({:add_handler, name, handler_fun}, state) do
    # Log if overwriting existing handler
    if Map.has_key?(state.handlers, name) do
      Logger.warning("Overwriting existing batched telemetry handler: #{inspect(name)}")
    end

    new_handlers = Map.put(state.handlers, name, handler_fun)
    {:noreply, %{state | handlers: new_handlers}}
  end

  def handle_cast({:remove_handler, name}, state) do
    new_handlers = Map.delete(state.handlers, name)
    {:noreply, %{state | handlers: new_handlers}}
  end

  def handle_cast(:force_flush, state) do
    if length(state.current_batch) > 0 do
      flush_batch(state.current_batch, state)
      new_stats = update_stats(state.stats, :forced_flushes, 1)

      new_state = %{
        state
        | current_batch: [],
          stats: new_stats,
          flush_timer: schedule_flush(state.flush_interval)
      }

      {:noreply, new_state}
    else
      {:noreply, state}
    end
  end

  def handle_call(:get_stats, _from, state) do
    current_stats = %{
      current_batch_size: length(state.current_batch),
      memory_usage_bytes: estimate_memory_usage(state.current_batch),
      handlers_count: map_size(state.handlers)
    }

    full_stats = Map.merge(state.stats, current_stats)
    {:reply, full_stats, state}
  end

  def handle_info(:flush_timer, state) do
    if length(state.current_batch) > 0 do
      flush_batch(state.current_batch, state)
      new_stats = update_stats(state.stats, :timer_flushes, 1)

      new_state = %{
        state
        | current_batch: [],
          stats: new_stats,
          flush_timer: schedule_flush(state.flush_interval)
      }

      {:noreply, new_state}
    else
      new_state = %{state | flush_timer: schedule_flush(state.flush_interval)}
      {:noreply, new_state}
    end
  end

  # Private helper functions

  defp attach_telemetry_handlers do
    # Attach to key telemetry events
    events = [
      [:cyb, :s2, :reserve],
      [:cyb, :ratelimiter, :decision],
      [:cyb, :amqp, :publish],
      [:cyb, :amqp, :batch_publish],
      [:cyb, :crdt_cache, :hit],
      [:cyb, :crdt_cache, :miss],
      [:cyb, :crdt_cache, :put],
      [:cyb, :crdt_cache, :eviction],
      [:vsm, :s1, :operation],
      [:vsm, :s2, :coordination],
      [:vsm, :s3, :control],
      [:vsm, :s4, :intelligence],
      [:vsm, :s4, :intervention],
      [:vsm, :s4, :optimization],
      [:vsm, :s5, :policy],
      [:cybernetic, :wasm, :validator],
      [:cybernetic, :system3, :health]
    ]

    # Use a stable handler ID to prevent duplicates
    handler_id = :batched_collector_main

    # Detach any existing handler with this ID first
    :telemetry.detach(handler_id)

    :telemetry.attach_many(
      handler_id,
      events,
      &__MODULE__.handle_telemetry_event/4,
      nil
    )

    Logger.debug("Attached batched collector to #{length(events)} telemetry events")
  end

  @doc false
  def handle_telemetry_event(event_name, measurements, metadata, _config) do
    GenServer.cast(__MODULE__, {:telemetry_event, event_name, measurements, metadata})
  end

  defp should_flush_batch?(batch, state) do
    cond do
      length(batch) >= state.batch_size ->
        true

      estimate_memory_usage(batch) > state.max_memory_bytes ->
        true

      true ->
        false
    end
  end

  defp flush_batch(batch, state) do
    start_time = System.monotonic_time(:microsecond)

    # Sort batch by timestamp for consistent processing
    sorted_batch = Enum.sort_by(batch, & &1.timestamp)

    # Process with each handler
    Enum.each(state.handlers, fn {handler_name, handler_fun} ->
      try do
        handler_fun.(sorted_batch)
      rescue
        error ->
          Logger.error("Telemetry handler #{handler_name} failed: #{inspect(error)}")
      end
    end)

    # Default processing - emit aggregated metrics
    process_batch_aggregations(sorted_batch)

    flush_duration = System.monotonic_time(:microsecond) - start_time

    # Emit flush metrics
    :telemetry.execute(
      [:cyb, :telemetry, :batch_flush],
      %{
        count: length(batch),
        duration_us: flush_duration,
        throughput: length(batch) / (flush_duration / 1_000_000)
      },
      %{batch_size: length(batch)}
    )

    Logger.debug("Flushed telemetry batch: #{length(batch)} events in #{flush_duration}μs")
  end

  defp process_batch_aggregations(batch) do
    # Group events by name for aggregation
    grouped = Enum.group_by(batch, & &1.name)

    Enum.each(grouped, fn {event_name, events} ->
      aggregated_metrics = aggregate_events(event_name, events)
      # Emit aggregated metrics to external systems (Prometheus, etc.)
      emit_aggregated_metrics(event_name, aggregated_metrics)
    end)
  end

  defp aggregate_events(event_name, events) do
    case event_name do
      [:cyb, :s2, :reserve] ->
        %{
          total_reserves: length(events),
          avg_duration: avg_measurement(events, :duration),
          success_rate: success_rate(events, :granted)
        }

      [:cyb, :ratelimiter, :decision] ->
        %{
          total_decisions: length(events),
          allow_rate: success_rate(events, :allow),
          avg_tokens: avg_measurement(events, :tokens)
        }

      [:cyb, :amqp, :publish] ->
        %{
          total_publishes: length(events),
          total_bytes: sum_measurement(events, :bytes),
          avg_latency: avg_measurement(events, :latency_us)
        }

      [:cyb, :crdt_cache, :hit] ->
        %{hit_count: length(events)}

      [:cyb, :crdt_cache, :miss] ->
        %{miss_count: length(events)}

      _ ->
        # Generic aggregation for unknown events
        %{
          count: length(events),
          avg_timestamp: avg_measurement(events, fn e -> e.timestamp end)
        }
    end
  end

  defp emit_aggregated_metrics(event_name, metrics) do
    # Send to external monitoring systems
    # This could be Prometheus, StatsD, etc.

    # For now, just emit as telemetry for other collectors
    :telemetry.execute([:cyb, :telemetry, :aggregated], metrics, %{
      source_event: event_name,
      aggregation_window: "batch"
    })
  end

  defp avg_measurement(events, key) when is_atom(key) do
    values =
      Enum.map(events, fn event ->
        Map.get(event.measurements, key, 0)
      end)

    if length(values) > 0 do
      Enum.sum(values) / length(values)
    else
      0
    end
  end

  defp avg_measurement(events, fun) when is_function(fun) do
    values = Enum.map(events, fun)

    if length(values) > 0 do
      Enum.sum(values) / length(values)
    else
      0
    end
  end

  defp sum_measurement(events, key) do
    Enum.reduce(events, 0, fn event, acc ->
      acc + Map.get(event.measurements, key, 0)
    end)
  end

  defp success_rate(events, metadata_key) do
    successes =
      Enum.count(events, fn event ->
        Map.get(event.metadata, metadata_key, false)
      end)

    if length(events) > 0 do
      successes / length(events)
    else
      0
    end
  end

  defp estimate_memory_usage(batch) do
    # Rough estimation - could be more precise
    Enum.reduce(batch, 0, fn event, acc ->
      acc + :erlang.external_size(event)
    end)
  end

  defp schedule_flush(interval) do
    Process.send_after(self(), :flush_timer, interval)
  end

  defp init_stats do
    %{
      events_received: 0,
      batches_flushed: 0,
      timer_flushes: 0,
      forced_flushes: 0,
      started_at: System.system_time(:microsecond)
    }
  end

  defp update_stats(stats, key, increment) do
    Map.update(stats, key, increment, &(&1 + increment))
  end
end
