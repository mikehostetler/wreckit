defmodule Cybernetic.Telemetry.Prometheus do
  @moduledoc """
  Prometheus metrics exporter for Cybernetic telemetry.
  Automatically instruments telemetry events and exports them to Prometheus.
  """
  use GenServer
  require Logger

  def metrics do
    [
      # VSM System Metrics
      Telemetry.Metrics.counter("cybernetic.s1.message_processed.count",
        tags: [:type, :status],
        description: "S1 messages processed"
      ),
      Telemetry.Metrics.distribution("cybernetic.s1.message_processed.duration",
        tags: [:type],
        unit: {:native, :millisecond},
        description: "S1 message processing duration",
        reporter_options: [buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000]]
      ),
      Telemetry.Metrics.counter("cybernetic.s2.coordination_decision.count",
        tags: [:decision_type, :result],
        description: "S2 coordination decisions"
      ),
      Telemetry.Metrics.counter("cybernetic.s3.control_action.count",
        tags: [:action_type, :target],
        description: "S3 control actions"
      ),
      Telemetry.Metrics.counter("cybernetic.s4.intelligence_query.count",
        tags: [:provider, :status],
        description: "S4 intelligence queries"
      ),
      Telemetry.Metrics.distribution("cybernetic.s4.intelligence_query.duration",
        tags: [:provider],
        unit: {:native, :millisecond},
        description: "S4 query duration",
        reporter_options: [buckets: [100, 500, 1000, 2000, 5000, 10000, 30000]]
      ),
      Telemetry.Metrics.counter("cybernetic.s5.policy_update.count",
        tags: [:policy_type],
        description: "S5 policy updates"
      ),

      # Provider Metrics
      Telemetry.Metrics.counter("cybernetic.provider.request.count",
        tags: [:provider, :model],
        description: "Provider requests"
      ),
      Telemetry.Metrics.counter("cybernetic.provider.response.count",
        tags: [:provider, :status],
        description: "Provider responses"
      ),
      Telemetry.Metrics.distribution("cybernetic.provider.response.latency",
        tags: [:provider],
        unit: {:native, :millisecond},
        description: "Provider response latency",
        reporter_options: [buckets: [100, 500, 1000, 2000, 5000, 10000, 30000]]
      ),
      Telemetry.Metrics.counter("cybernetic.provider.error.count",
        tags: [:provider, :error_type],
        description: "Provider errors"
      ),
      Telemetry.Metrics.counter("cybernetic.provider.fallback.count",
        tags: [:from_provider, :to_provider],
        description: "Provider fallbacks"
      ),
      Telemetry.Metrics.sum("cybernetic.provider.tokens.used",
        tags: [:provider, :type],
        description: "Tokens consumed"
      ),

      # Transport Metrics
      Telemetry.Metrics.counter("cybernetic.amqp.publish.count",
        tags: [:exchange, :routing_key],
        description: "AMQP messages published"
      ),
      Telemetry.Metrics.counter("cybernetic.amqp.consume.count",
        tags: [:queue],
        description: "AMQP messages consumed"
      ),
      Telemetry.Metrics.counter("cybernetic.amqp.error.count",
        tags: [:error_type],
        description: "AMQP errors"
      ),

      # Circuit Breaker Metrics
      Telemetry.Metrics.last_value("cyb.circuit_breaker.state",
        tags: [:circuit_breaker, :state],
        description: "Circuit breaker current state (0=closed, 1=open, 2=half_open)"
      ),
      Telemetry.Metrics.counter("cyb.circuit_breaker.success.count",
        tags: [:circuit_breaker, :state],
        description: "Circuit breaker successful operations"
      ),
      Telemetry.Metrics.counter("cyb.circuit_breaker.failure.count",
        tags: [:circuit_breaker, :state, :error_type],
        description: "Circuit breaker failed operations"
      ),
      Telemetry.Metrics.counter("cyb.circuit_breaker.rejected.count",
        tags: [:circuit_breaker, :state],
        description: "Circuit breaker rejected operations (circuit open)"
      ),
      Telemetry.Metrics.counter("cyb.circuit_breaker.opened.count",
        tags: [:circuit_breaker],
        description: "Circuit breaker state transitions to open"
      ),
      Telemetry.Metrics.counter("cyb.circuit_breaker.closed.count",
        tags: [:circuit_breaker],
        description: "Circuit breaker state transitions to closed (recovered)"
      ),
      Telemetry.Metrics.counter("cyb.circuit_breaker.half_opened.count",
        tags: [:circuit_breaker],
        description: "Circuit breaker state transitions to half-open"
      ),
      Telemetry.Metrics.last_value("cyb.circuit_breaker.health_score",
        tags: [:circuit_breaker],
        description: "Circuit breaker health score (0.0-1.0)"
      ),
      Telemetry.Metrics.last_value("cyb.circuit_breaker.failure_count",
        tags: [:circuit_breaker],
        description: "Current failure count"
      ),
      Telemetry.Metrics.last_value("cyb.circuit_breaker.success_count",
        tags: [:circuit_breaker],
        description: "Current success count"
      ),
      Telemetry.Metrics.last_value("cyb.circuit_breaker.adaptive_threshold",
        tags: [:circuit_breaker],
        description: "Dynamic failure threshold"
      ),
      Telemetry.Metrics.distribution("cyb.circuit_breaker.operation_duration",
        tags: [:circuit_breaker, :state],
        unit: {:native, :microsecond},
        description: "Circuit breaker operation duration",
        reporter_options: [buckets: [100, 500, 1000, 5000, 10000, 25000, 50000, 100_000]]
      ),

      # Circuit Breaker Health Metrics
      Telemetry.Metrics.last_value("cybernetic.health.circuit_breakers.healthy_count",
        description: "Number of healthy circuit breakers"
      ),
      Telemetry.Metrics.last_value("cybernetic.health.circuit_breakers.warning_count",
        description: "Number of circuit breakers in warning state"
      ),
      Telemetry.Metrics.last_value("cybernetic.health.circuit_breakers.degraded_count",
        description: "Number of degraded circuit breakers"
      ),
      Telemetry.Metrics.last_value("cybernetic.health.circuit_breakers.critical_count",
        description: "Number of critical circuit breakers"
      ),
      Telemetry.Metrics.last_value("cybernetic.health.circuit_breakers.total_count",
        description: "Total number of circuit breakers monitored"
      ),

      # Circuit Breaker Alert Metrics
      Telemetry.Metrics.counter("cybernetic.alerts.circuit_breaker.count",
        tags: [:alert_key, :severity],
        description: "Circuit breaker alerts triggered"
      ),
      Telemetry.Metrics.last_value("cybernetic.alerts.circuit_breaker.severity_numeric",
        tags: [:alert_key],
        description: "Alert severity level (1=info, 2=warning, 3=critical)"
      ),

      # Memory Metrics
      Telemetry.Metrics.counter("cybernetic.memory.store.count",
        tags: [:conversation_id],
        description: "Memory store operations"
      ),
      Telemetry.Metrics.last_value("cybernetic.memory.size.bytes",
        tags: [:conversation_id],
        unit: :byte,
        description: "Memory size per conversation"
      ),

      # System Metrics
      Telemetry.Metrics.last_value("vm.memory.total",
        unit: :byte,
        description: "Total VM memory"
      ),
      Telemetry.Metrics.last_value("vm.total_run_queue_lengths.total",
        description: "Total run queue lengths"
      ),
      Telemetry.Metrics.last_value("vm.process_count",
        description: "Number of processes"
      )
    ]
  end

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  def child_spec(opts) do
    %{
      id: __MODULE__,
      start: {__MODULE__, :start_link, [opts]}
    }
  end

  @impl true
  def init(_opts) do
    # Start Prometheus metrics reporter
    {:ok, _} =
      TelemetryMetricsPrometheus.Core.start_link(
        metrics: metrics(),
        port: Application.get_env(:telemetry_metrics_prometheus_core, :port, 9568)
      )

    # Emit telemetry events
    emit_initial_metrics()

    # Schedule periodic system metrics
    Process.send_after(self(), :emit_system_metrics, 5_000)

    Logger.info("Prometheus metrics exporter started on port 9568")
    {:ok, %{}}
  end

  @impl true
  def handle_info(:emit_system_metrics, state) do
    emit_system_metrics()
    Process.send_after(self(), :emit_system_metrics, 5_000)
    {:noreply, state}
  end

  # Telemetry Event Emitters

  def emit_s1_processed(type, status, duration_ms) do
    :telemetry.execute(
      [:cybernetic, :s1, :message_processed],
      %{duration: duration_ms},
      %{type: type, status: status}
    )
  end

  def emit_s2_decision(decision_type, result) do
    :telemetry.execute(
      [:cybernetic, :s2, :coordination_decision],
      %{count: 1},
      %{decision_type: decision_type, result: result}
    )
  end

  def emit_s3_action(action_type, target) do
    :telemetry.execute(
      [:cybernetic, :s3, :control_action],
      %{count: 1},
      %{action_type: action_type, target: target}
    )
  end

  def emit_s4_query(provider, status, duration_ms) do
    :telemetry.execute(
      [:cybernetic, :s4, :intelligence_query],
      %{duration: duration_ms},
      %{provider: provider, status: status}
    )
  end

  def emit_s5_policy_update(policy_type) do
    :telemetry.execute(
      [:cybernetic, :s5, :policy_update],
      %{count: 1},
      %{policy_type: policy_type}
    )
  end

  def emit_provider_request(provider, model) do
    :telemetry.execute(
      [:cybernetic, :provider, :request],
      %{count: 1},
      %{provider: provider, model: model}
    )
  end

  def emit_provider_response(provider, status, latency_ms) do
    :telemetry.execute(
      [:cybernetic, :provider, :response],
      %{count: 1, latency: latency_ms},
      %{provider: provider, status: status}
    )
  end

  def emit_provider_error(provider, error_type) do
    :telemetry.execute(
      [:cybernetic, :provider, :error],
      %{count: 1},
      %{provider: provider, error_type: error_type}
    )
  end

  def emit_provider_fallback(from_provider, to_provider) do
    :telemetry.execute(
      [:cybernetic, :provider, :fallback],
      %{count: 1},
      %{from_provider: from_provider, to_provider: to_provider}
    )
  end

  def emit_provider_tokens(provider, type, count) do
    :telemetry.execute(
      [:cybernetic, :provider, :tokens],
      %{used: count},
      %{provider: provider, type: type}
    )
  end

  def emit_amqp_publish(exchange, routing_key) do
    :telemetry.execute(
      [:cybernetic, :amqp, :publish],
      %{count: 1},
      %{exchange: exchange, routing_key: routing_key}
    )
  end

  def emit_amqp_consume(queue) do
    :telemetry.execute(
      [:cybernetic, :amqp, :consume],
      %{count: 1},
      %{queue: queue}
    )
  end

  def emit_amqp_error(error_type) do
    :telemetry.execute(
      [:cybernetic, :amqp, :error],
      %{count: 1},
      %{error_type: error_type}
    )
  end

  def emit_circuit_breaker_state(service, state) do
    state_value =
      case state do
        :closed -> 0
        :open -> 1
        :half_open -> 2
      end

    :telemetry.execute(
      [:cybernetic, :circuit_breaker, :state],
      %{state: state_value},
      %{service: service}
    )
  end

  def emit_circuit_breaker_trip(service) do
    :telemetry.execute(
      [:cybernetic, :circuit_breaker, :trip],
      %{count: 1},
      %{service: service}
    )
  end

  def emit_memory_store(conversation_id, size_bytes) do
    :telemetry.execute(
      [:cybernetic, :memory, :store],
      %{count: 1},
      %{conversation_id: conversation_id}
    )

    :telemetry.execute(
      [:cybernetic, :memory, :size],
      %{bytes: size_bytes},
      %{conversation_id: conversation_id}
    )
  end

  # Private Functions

  defp emit_initial_metrics do
    # Emit initial system metrics
    emit_system_metrics()

    # Emit initial circuit breaker states
    emit_circuit_breaker_state("anthropic", :closed)
    emit_circuit_breaker_state("openai", :closed)
    emit_circuit_breaker_state("together", :closed)
    emit_circuit_breaker_state("ollama", :closed)
  end

  defp emit_system_metrics do
    memory = :erlang.memory()

    :telemetry.execute(
      [:vm, :memory],
      %{total: memory[:total]},
      %{}
    )

    :telemetry.execute(
      [:vm, :total_run_queue_lengths],
      %{total: :erlang.statistics(:total_run_queue_lengths)},
      %{}
    )

    :telemetry.execute(
      [:vm, :process],
      %{count: :erlang.system_info(:process_count)},
      %{}
    )
  end
end
