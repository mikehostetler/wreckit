defmodule Cybernetic.Health.Collector do
  @moduledoc """
  Collects and aggregates system metrics for health monitoring.
  """
  use GenServer
  require Logger

  # 10 seconds
  @collection_interval 10_000
  # 1 hour in milliseconds
  @retention_period 3_600_000

  defstruct [
    :metrics,
    :history,
    :start_time
  ]

  # Public API

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  def current_metrics do
    GenServer.call(__MODULE__, :current_metrics)
  catch
    :exit, _ -> %{error: "Collector not running"}
  end

  def metrics_history(duration_ms \\ 300_000) do
    GenServer.call(__MODULE__, {:history, duration_ms})
  catch
    :exit, _ -> []
  end

  def aggregate_metrics(metric_name, duration_ms \\ 60_000) do
    GenServer.call(__MODULE__, {:aggregate, metric_name, duration_ms})
  catch
    :exit, _ -> %{error: "Collector not running"}
  end

  # Server Callbacks

  @impl true
  def init(_opts) do
    state = %__MODULE__{
      metrics: %{},
      history: [],
      start_time: System.system_time(:millisecond)
    }

    # Schedule first collection
    Process.send_after(self(), :collect, 1000)

    # Attach telemetry handlers
    attach_telemetry_handlers()

    Logger.info("Health Collector initialized")
    {:ok, state}
  end

  @impl true
  def handle_call(:current_metrics, _from, state) do
    {:reply, state.metrics, state}
  end

  @impl true
  def handle_call({:history, duration_ms}, _from, state) do
    cutoff_time = System.system_time(:millisecond) - duration_ms

    recent_history =
      Enum.filter(state.history, fn {timestamp, _} ->
        timestamp > cutoff_time
      end)

    {:reply, recent_history, state}
  end

  @impl true
  def handle_call({:aggregate, metric_name, duration_ms}, _from, state) do
    cutoff_time = System.system_time(:millisecond) - duration_ms

    values =
      state.history
      |> Enum.filter(fn {timestamp, _} -> timestamp > cutoff_time end)
      |> Enum.map(fn {_, metrics} -> Map.get(metrics, metric_name) end)
      |> Enum.reject(&is_nil/1)

    aggregate =
      if Enum.empty?(values) do
        %{count: 0}
      else
        %{
          count: length(values),
          min: Enum.min(values),
          max: Enum.max(values),
          avg: Enum.sum(values) / length(values),
          sum: Enum.sum(values)
        }
      end

    {:reply, aggregate, state}
  end

  @impl true
  def handle_info(:collect, state) do
    # Collect current metrics
    metrics = collect_all_metrics(state)

    # Add to history with timestamp
    timestamp = System.system_time(:millisecond)
    new_history = [{timestamp, metrics} | state.history]

    # Prune old entries
    cutoff_time = timestamp - @retention_period

    pruned_history =
      Enum.filter(new_history, fn {ts, _} ->
        ts > cutoff_time
      end)

    new_state = %{state | metrics: metrics, history: pruned_history}

    # Broadcast metrics update
    broadcast_metrics(metrics)

    # Schedule next collection
    Process.send_after(self(), :collect, @collection_interval)

    {:noreply, new_state}
  end

  @impl true
  def handle_info({:telemetry_event, measurements, _metadata}, state) do
    # Handle telemetry events
    updated_metrics = Map.merge(state.metrics, measurements)
    {:noreply, %{state | metrics: updated_metrics}}
  end

  # Private Functions

  defp collect_all_metrics(state) do
    %{
      # System metrics
      uptime_ms: System.system_time(:millisecond) - state.start_time,
      memory_usage_mb: :erlang.memory(:total) / 1_048_576,
      process_count: length(Process.list()),

      # AMQP metrics
      amqp_connections: count_amqp_connections(),
      amqp_channels: count_amqp_channels(),

      # VSM metrics
      vsm_messages_processed: get_vsm_message_count(),
      s4_requests: get_s4_request_count(),
      s4_memory_entries: get_memory_entry_count(),

      # Performance metrics
      scheduler_utilization: :scheduler.utilization(1),
      reductions: :erlang.statistics(:reductions) |> elem(0),

      # Custom application metrics
      active_episodes: count_active_episodes(),
      provider_stats: get_provider_stats()
    }
  end

  defp count_amqp_connections do
    # Count AMQP connections
    length(
      Process.list()
      |> Enum.filter(fn pid ->
        case Process.info(pid, :registered_name) do
          {:registered_name, name} when is_atom(name) ->
            String.contains?(Atom.to_string(name), "amqp_connection")

          _ ->
            false
        end
      end)
    )
  end

  defp count_amqp_channels do
    # Count AMQP channels
    length(
      Process.list()
      |> Enum.filter(fn pid ->
        case Process.info(pid, :registered_name) do
          {:registered_name, name} when is_atom(name) ->
            String.contains?(Atom.to_string(name), "amqp_channel")

          _ ->
            false
        end
      end)
    )
  end

  defp get_vsm_message_count do
    # Get message count from VSM layers
    [:system1, :system2, :system3, :system4, :system5]
    |> Enum.map(fn _layer ->
      # This would query each VSM layer for message counts
      # Placeholder
      0
    end)
    |> Enum.sum()
  end

  defp get_s4_request_count do
    try do
      stats = Cybernetic.VSM.System4.Service.stats()
      Map.get(stats, :total_requests, 0)
    rescue
      _ -> 0
    end
  end

  defp get_memory_entry_count do
    try do
      stats = Cybernetic.VSM.System4.Memory.stats()
      Map.get(stats, :total_entries, 0)
    rescue
      _ -> 0
    end
  end

  defp count_active_episodes do
    try do
      stats = Cybernetic.VSM.System4.Memory.stats()
      Map.get(stats, :active_episodes, 0)
    rescue
      _ -> 0
    end
  end

  defp get_provider_stats do
    try do
      stats = Cybernetic.VSM.System4.Service.stats()
      Map.get(stats, :by_provider, %{})
    rescue
      _ -> %{}
    end
  end

  defp attach_telemetry_handlers do
    events = [
      [:cybernetic, :vsm, :message],
      [:cybernetic, :s4, :request],
      [:cybernetic, :health, :status_change]
    ]

    Enum.each(events, fn event ->
      :telemetry.attach(
        "collector-#{inspect(event)}",
        event,
        &__MODULE__.handle_telemetry_event/4,
        nil
      )
    end)
  end

  def handle_telemetry_event(_event_name, measurements, metadata, _config) do
    send(self(), {:telemetry_event, measurements, metadata})
  end

  defp broadcast_metrics(metrics) do
    :telemetry.execute(
      [:cybernetic, :health, :metrics],
      metrics,
      %{timestamp: System.system_time(:millisecond)}
    )
  end
end
