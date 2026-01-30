defmodule Cybernetic.Core.Resilience.CircuitBreakerAlerts do
  @moduledoc """
  Alerting system for circuit breaker state changes and health degradation.

  Monitors circuit breaker metrics and triggers alerts when:
  - Circuit breakers transition to critical states
  - Multiple providers become unhealthy simultaneously
  - Provider recovery patterns indicate instability
  - Health scores drop below operational thresholds
  """
  use GenServer
  require Logger

  # 5 minutes between duplicate alerts
  @alert_cooldown_ms 300_000
  @critical_health_threshold 0.2
  @warning_health_threshold 0.5
  # Alert when 2+ providers are unhealthy
  @multiple_failure_threshold 2

  defstruct [
    # Map of alert_key -> last_sent_timestamp
    :alert_history,
    # Current state of each provider
    :provider_states,
    # List of alert handler functions
    :alert_handlers
  ]

  # Public API

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  def register_alert_handler(handler_fn) when is_function(handler_fn, 2) do
    GenServer.call(__MODULE__, {:register_handler, handler_fn})
  end

  def get_alert_status do
    GenServer.call(__MODULE__, :get_status)
  end

  # GenServer Callbacks

  @impl true
  def init(_opts) do
    state = %__MODULE__{
      alert_history: %{},
      provider_states: %{},
      alert_handlers: [&default_alert_handler/2]
    }

    # Subscribe to circuit breaker telemetry
    attach_telemetry_handlers()

    Logger.info("Circuit breaker alerting system initialized")
    {:ok, state}
  end

  @impl true
  def handle_call({:register_handler, handler_fn}, _from, state) do
    new_handlers = [handler_fn | state.alert_handlers]
    new_state = %{state | alert_handlers: new_handlers}
    {:reply, :ok, new_state}
  end

  @impl true
  def handle_call(:get_status, _from, state) do
    status = %{
      active_alerts: count_active_alerts(state.alert_history),
      provider_states: state.provider_states,
      registered_handlers: length(state.alert_handlers)
    }

    {:reply, status, state}
  end

  @impl true
  def handle_info({:circuit_breaker_event, provider, event_type, metadata}, state) do
    new_state = process_circuit_breaker_event(state, provider, event_type, metadata)
    {:noreply, new_state}
  end

  @impl true
  def handle_info({:health_update, health_data}, state) do
    new_state = process_health_update(state, health_data)
    {:noreply, new_state}
  end

  @impl true
  def terminate(_reason, _state) do
    # Detach telemetry handlers
    :telemetry.detach(:circuit_breaker_alerts)
    :telemetry.detach(:circuit_breaker_health_alerts)
    :ok
  end

  # Private Functions

  defp attach_telemetry_handlers do
    # Listen for circuit breaker state changes
    :telemetry.attach(
      :circuit_breaker_alerts,
      [:cyb, :circuit_breaker, :opened],
      &__MODULE__.handle_circuit_breaker_opened/4,
      __MODULE__
    )

    # Listen for health updates
    :telemetry.attach(
      :circuit_breaker_health_alerts,
      [:cybernetic, :health, :circuit_breakers],
      &__MODULE__.handle_circuit_breaker_health/4,
      __MODULE__
    )
  end

  @doc false
  def handle_circuit_breaker_opened(_event, measurements, metadata, server) do
    send(
      server,
      {:circuit_breaker_event, Map.get(metadata, :circuit_breaker), :opened,
       %{measurements: measurements, metadata: metadata}}
    )
  end

  @doc false
  def handle_circuit_breaker_health(_event, measurements, metadata, server) do
    send(server, {:health_update, %{measurements: measurements, metadata: metadata}})
  end

  defp process_circuit_breaker_event(state, provider, event_type, data) do
    current_time = System.monotonic_time(:millisecond)

    # Update provider state
    new_provider_states =
      Map.put(state.provider_states, provider, %{
        event: event_type,
        timestamp: current_time,
        health_score: get_in(data, [:metadata, :health_score]),
        state: get_in(data, [:metadata, :state])
      })

    new_state = %{state | provider_states: new_provider_states}

    # Check for alerting conditions
    case event_type do
      :opened ->
        health_score = get_in(data, [:metadata, :health_score]) || 0.0

        cond do
          health_score < @critical_health_threshold ->
            send_alert_if_needed(new_state, {:critical_circuit_breaker, provider}, %{
              severity: :critical,
              message:
                "Circuit breaker #{provider} opened with critical health score #{health_score}",
              provider: provider,
              health_score: health_score,
              timestamp: current_time
            })

          health_score < @warning_health_threshold ->
            send_alert_if_needed(new_state, {:warning_circuit_breaker, provider}, %{
              severity: :warning,
              message: "Circuit breaker #{provider} opened with low health score #{health_score}",
              provider: provider,
              health_score: health_score,
              timestamp: current_time
            })

          true ->
            send_alert_if_needed(new_state, {:info_circuit_breaker, provider}, %{
              severity: :info,
              message: "Circuit breaker #{provider} opened (health score: #{health_score})",
              provider: provider,
              health_score: health_score,
              timestamp: current_time
            })
        end

      _ ->
        new_state
    end
  end

  defp process_health_update(state, health_data) do
    measurements = health_data.measurements
    metadata = health_data.metadata

    critical_count = Map.get(measurements, :critical_count, 0)
    degraded_count = Map.get(measurements, :degraded_count, 0)
    total_count = Map.get(measurements, :total_count, 0)
    overall_status = get_in(metadata, [:overall_status])

    current_time = System.monotonic_time(:millisecond)

    new_state =
      cond do
        # Critical: Multiple providers in critical state
        critical_count >= @multiple_failure_threshold ->
          send_alert_if_needed(state, :multiple_critical_providers, %{
            severity: :critical,
            message:
              "#{critical_count} out of #{total_count} circuit breakers are in critical state",
            critical_count: critical_count,
            total_count: total_count,
            individual_status: get_in(metadata, [:individual_status]),
            timestamp: current_time
          })

        # Warning: Multiple providers degraded or overall health degraded
        degraded_count + critical_count >= @multiple_failure_threshold ->
          send_alert_if_needed(state, :multiple_degraded_providers, %{
            severity: :warning,
            message:
              "#{degraded_count + critical_count} out of #{total_count} circuit breakers are unhealthy",
            unhealthy_count: degraded_count + critical_count,
            total_count: total_count,
            overall_status: overall_status,
            timestamp: current_time
          })

        # Info: System recovery
        overall_status == :healthy and critical_count == 0 and degraded_count == 0 ->
          send_alert_if_needed(state, :providers_recovered, %{
            severity: :info,
            message: "All circuit breakers have recovered to healthy state",
            total_count: total_count,
            timestamp: current_time
          })

        true ->
          state
      end

    new_state
  end

  defp send_alert_if_needed(state, alert_key, alert_data) do
    current_time = System.monotonic_time(:millisecond)
    last_sent = Map.get(state.alert_history, alert_key, 0)

    if current_time - last_sent > @alert_cooldown_ms do
      # Send alert to all registered handlers
      Enum.each(state.alert_handlers, fn handler ->
        try do
          handler.(alert_key, alert_data)
        rescue
          error ->
            Logger.error("Alert handler failed: #{inspect(error)}")
        end
      end)

      # Update alert history
      new_alert_history = Map.put(state.alert_history, alert_key, current_time)
      %{state | alert_history: new_alert_history}
    else
      # Cooldown period active, skip alert
      state
    end
  end

  defp count_active_alerts(alert_history) do
    current_time = System.monotonic_time(:millisecond)
    cutoff_time = current_time - @alert_cooldown_ms

    alert_history
    |> Enum.count(fn {_key, timestamp} -> timestamp > cutoff_time end)
  end

  defp default_alert_handler(alert_key, alert_data) do
    severity = alert_data.severity
    message = alert_data.message

    # Log the alert
    case severity do
      :critical ->
        Logger.error("[CIRCUIT BREAKER ALERT] #{message}", alert_data)

      :warning ->
        Logger.warning("[CIRCUIT BREAKER ALERT] #{message}", alert_data)

      :info ->
        Logger.info("[CIRCUIT BREAKER ALERT] #{message}", alert_data)
    end

    # Emit telemetry for external alerting systems
    :telemetry.execute(
      [:cybernetic, :alerts, :circuit_breaker],
      %{severity_numeric: severity_to_numeric(severity)},
      Map.put(alert_data, :alert_key, alert_key)
    )
  end

  defp severity_to_numeric(:critical), do: 3
  defp severity_to_numeric(:warning), do: 2
  defp severity_to_numeric(:info), do: 1
end
