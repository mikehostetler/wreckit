defmodule Cybernetic.Core.Goldrush.Plugins.TelemetryAlgedonic do
  @moduledoc """
  Goldrush plugin that converts telemetry events into algedonic signals.
  Implements pain/pleasure signals for VSM S4 (Intelligence) based on system health.
  """
  @behaviour Cybernetic.Core.Plugins.Behaviour

  use GenServer
  require Logger
  alias Cybernetic.Core.Transport.AMQP.Publisher

  @telemetry_events [
    [:cybernetic, :*],
    [:amqp, :message, :*],
    [:vsm, :*, :*],
    [:telegram, :*, :*]
  ]

  # Error rate above this triggers pain signal
  @pain_threshold 0.3
  # Success rate above this triggers pleasure signal
  @pleasure_threshold 0.95
  # 1 minute sliding window
  @window_size 60_000

  defmodule State do
    defstruct [
      :window_start,
      events: [],
      metrics: %{
        success: 0,
        failure: 0,
        latency_sum: 0,
        latency_count: 0
      },
      algedonic_state: :neutral
    ]
  end

  # Plugin Behaviour Implementation

  @impl true
  def init_plugin(opts) do
    {:ok, opts}
  end

  @impl true
  def activate(config) do
    {:ok, _pid} = start_link(config)
    :ok
  end

  @impl true
  def deactivate(_config) do
    GenServer.stop(__MODULE__)
  end

  @impl true
  def info do
    %{
      name: "Telemetry Algedonic",
      version: "1.0.0",
      description: "Converts telemetry into VSM algedonic signals",
      capabilities: ["telemetry", "algedonic", "vsm", "goldrush"]
    }
  end

  # GenServer Implementation

  def start_link(opts) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @impl GenServer
  def init(_opts) do
    # Attach to telemetry events
    :telemetry.attach_many(
      "telemetry-algedonic",
      @telemetry_events,
      &__MODULE__.handle_telemetry_event/4,
      nil
    )

    # Schedule window cleanup
    Process.send_after(self(), :cleanup_window, @window_size)

    {:ok, %State{window_start: System.monotonic_time(:millisecond)}}
  end

  # Telemetry Handler

  def handle_telemetry_event(event_name, measurements, metadata, _config) do
    GenServer.cast(__MODULE__, {:telemetry_event, event_name, measurements, metadata})
  end

  # Callbacks

  @impl GenServer
  def handle_cast({:telemetry_event, event_name, measurements, metadata}, state) do
    event = %{
      name: event_name,
      measurements: measurements,
      metadata: metadata,
      timestamp: System.monotonic_time(:millisecond)
    }

    new_state =
      state
      |> add_event(event)
      |> update_metrics(event)
      |> check_algedonic_triggers()

    {:noreply, new_state}
  end

  @impl GenServer
  def handle_info(:cleanup_window, state) do
    now = System.monotonic_time(:millisecond)
    cutoff = now - @window_size

    # Remove old events
    filtered_events =
      Enum.filter(state.events, fn event ->
        event.timestamp > cutoff
      end)

    # Recalculate metrics
    new_state =
      %State{
        window_start: cutoff,
        events: filtered_events,
        metrics: recalculate_metrics(filtered_events),
        algedonic_state: state.algedonic_state
      }
      |> check_algedonic_triggers()

    # Schedule next cleanup
    Process.send_after(self(), :cleanup_window, @window_size)

    {:noreply, new_state}
  end

  # Private Functions

  defp add_event(state, event) do
    %{state | events: [event | state.events]}
  end

  defp update_metrics(state, event) do
    metrics = state.metrics

    # Update based on event type
    metrics =
      case event.name do
        [:amqp, :message, :processed] ->
          Map.update!(metrics, :success, &(&1 + 1))

        [:amqp, :message, :error] ->
          Map.update!(metrics, :failure, &(&1 + 1))

        [:amqp, :message, :replay] ->
          Map.update!(metrics, :failure, &(&1 + 1))

        _ ->
          metrics
      end

    # Update latency if present
    metrics =
      if latency = event.measurements[:duration] || event.measurements[:latency] do
        metrics
        |> Map.update!(:latency_sum, &(&1 + latency))
        |> Map.update!(:latency_count, &(&1 + 1))
      else
        metrics
      end

    %{state | metrics: metrics}
  end

  defp check_algedonic_triggers(state) do
    total = state.metrics.success + state.metrics.failure

    if total > 0 do
      success_rate = state.metrics.success / total

      avg_latency =
        if state.metrics.latency_count > 0 do
          state.metrics.latency_sum / state.metrics.latency_count
        else
          0
        end

      new_algedonic_state =
        cond do
          success_rate < @pain_threshold ->
            emit_pain_signal(success_rate, avg_latency, state.metrics)
            :pain

          success_rate > @pleasure_threshold ->
            emit_pleasure_signal(success_rate, avg_latency, state.metrics)
            :pleasure

          true ->
            :neutral
        end

      if new_algedonic_state != state.algedonic_state do
        Logger.info("Algedonic state changed: #{state.algedonic_state} -> #{new_algedonic_state}")
      end

      %{state | algedonic_state: new_algedonic_state}
    else
      state
    end
  end

  defp emit_pain_signal(success_rate, avg_latency, metrics) do
    severity = calculate_pain_severity(success_rate)

    signal = %{
      type: "algedonic.pain",
      severity: severity,
      success_rate: success_rate,
      avg_latency: avg_latency,
      metrics: metrics,
      timestamp: DateTime.utc_now(),
      recommendations: generate_pain_recommendations(success_rate, avg_latency)
    }

    # Get exchange names from config
    exchanges = Application.get_env(:cybernetic, :amqp)[:exchanges] || %{}
    events_exchange = Map.get(exchanges, :events, "cyb.events")

    # Route pain signals based on severity
    case severity do
      :critical ->
        # Critical pain: Route to S5 (Policy) for system-wide changes
        Publisher.publish(events_exchange, signal, routing_key: "vsm.s5.algedonic.pain.critical")
        Logger.error("CRITICAL PAIN signal sent to S5 Policy: success_rate=#{success_rate}")

      :severe ->
        # Severe pain: Route to S3 (Control) for intervention
        Publisher.publish(events_exchange, signal, routing_key: "vsm.s3.algedonic.pain.severe")
        Logger.warning("SEVERE PAIN signal sent to S3 Control: success_rate=#{success_rate}")

      _ ->
        # Mild/moderate pain: Route to S4 (Intelligence) for analysis
        Publisher.publish(events_exchange, signal, routing_key: "vsm.s4.algedonic.pain")

        Logger.warning(
          "PAIN signal sent to S4 Intelligence: success_rate=#{success_rate}, severity=#{severity}"
        )
    end

    # Emit telemetry event
    :telemetry.execute(
      [:goldrush, :algedonic, :pain],
      %{severity: signal.severity, success_rate: success_rate},
      signal
    )
  end

  defp emit_pleasure_signal(success_rate, avg_latency, metrics) do
    intensity = calculate_pleasure_intensity(success_rate)

    signal = %{
      type: "algedonic.pleasure",
      intensity: intensity,
      success_rate: success_rate,
      avg_latency: avg_latency,
      metrics: metrics,
      timestamp: DateTime.utc_now(),
      recommendations: generate_pleasure_recommendations(success_rate, avg_latency)
    }

    # Get exchange names from config
    exchanges = Application.get_env(:cybernetic, :amqp)[:exchanges] || %{}
    events_exchange = Map.get(exchanges, :events, "cyb.events")

    # Route pleasure signals based on intensity
    case intensity do
      :euphoric ->
        # Euphoric pleasure: Route to S5 (Policy) for optimization opportunities
        Publisher.publish(events_exchange, signal,
          routing_key: "vsm.s5.algedonic.pleasure.euphoric"
        )

        Logger.info("EUPHORIC PLEASURE signal sent to S5 Policy: success_rate=#{success_rate}")

      :high ->
        # High pleasure: Route to both S4 (Intelligence) and S5 (Policy)
        Publisher.publish(events_exchange, signal, routing_key: "vsm.s4.algedonic.pleasure.high")
        Publisher.publish(events_exchange, signal, routing_key: "vsm.s5.algedonic.pleasure.high")

        Logger.info(
          "HIGH PLEASURE signal sent to S4 Intelligence & S5 Policy: success_rate=#{success_rate}"
        )

      _ ->
        # Moderate/mild pleasure: Route to S4 (Intelligence) for analysis
        Publisher.publish(events_exchange, signal, routing_key: "vsm.s4.algedonic.pleasure")

        Logger.info(
          "PLEASURE signal sent to S4 Intelligence: success_rate=#{success_rate}, intensity=#{intensity}"
        )
    end

    # Emit telemetry event
    :telemetry.execute(
      [:goldrush, :algedonic, :pleasure],
      %{intensity: signal.intensity, success_rate: success_rate},
      signal
    )
  end

  defp calculate_pain_severity(success_rate) do
    cond do
      success_rate < 0.1 -> :critical
      success_rate < 0.2 -> :severe
      success_rate < 0.3 -> :moderate
      true -> :mild
    end
  end

  defp calculate_pleasure_intensity(success_rate) do
    cond do
      success_rate > 0.99 -> :euphoric
      success_rate > 0.97 -> :high
      success_rate > 0.95 -> :moderate
      true -> :mild
    end
  end

  defp generate_pain_recommendations(success_rate, avg_latency) do
    recommendations = []

    recommendations =
      if success_rate < 0.5 do
        ["Investigate message processing failures" | recommendations]
      else
        recommendations
      end

    recommendations =
      if avg_latency > 1000 do
        ["Optimize message processing latency" | recommendations]
      else
        recommendations
      end

    if recommendations == [] do
      ["Monitor system health metrics closely"]
    else
      recommendations
    end
  end

  defp generate_pleasure_recommendations(_success_rate, _avg_latency) do
    [
      "System performing optimally",
      "Consider increasing throughput capacity",
      "Document current configuration for future reference"
    ]
  end

  defp recalculate_metrics(events) do
    Enum.reduce(events, %{success: 0, failure: 0, latency_sum: 0, latency_count: 0}, fn event,
                                                                                        acc ->
      acc =
        case event.name do
          [:amqp, :message, :processed] -> Map.update!(acc, :success, &(&1 + 1))
          [:amqp, :message, :error] -> Map.update!(acc, :failure, &(&1 + 1))
          [:amqp, :message, :replay] -> Map.update!(acc, :failure, &(&1 + 1))
          _ -> acc
        end

      if latency = event.measurements[:duration] || event.measurements[:latency] do
        acc
        |> Map.update!(:latency_sum, &(&1 + latency))
        |> Map.update!(:latency_count, &(&1 + 1))
      else
        acc
      end
    end)
  end
end
