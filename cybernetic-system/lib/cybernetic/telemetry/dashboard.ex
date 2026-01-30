defmodule Cybernetic.Telemetry.Dashboard do
  @moduledoc """
  Telemetry dashboard for real-time metrics visualization.
  Provides both web interface and Grafana dashboard configurations.
  """
  use GenServer
  require Logger

  # 1 hour
  @metrics_retention_ms 3_600_000
  # 5 seconds
  @aggregation_interval_ms 5_000

  defstruct [
    :metrics_store,
    :grafana_config,
    :prometheus_metrics,
    :dashboard_state
  ]

  # Telemetry event names
  @vsm_events [
    [:cybernetic, :s1, :message_processed],
    [:cybernetic, :s2, :coordination_decision],
    [:cybernetic, :s3, :control_action],
    [:cybernetic, :s4, :intelligence_query],
    [:cybernetic, :s5, :policy_update]
  ]

  @provider_events [
    [:cybernetic, :provider, :request],
    [:cybernetic, :provider, :response],
    [:cybernetic, :provider, :error],
    [:cybernetic, :provider, :fallback]
  ]

  @transport_events [
    [:cybernetic, :amqp, :publish],
    [:cybernetic, :amqp, :consume],
    [:cybernetic, :amqp, :error]
  ]

  # Public API

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  def get_dashboard_config do
    GenServer.call(__MODULE__, :get_dashboard_config)
  end

  def get_metrics_summary(time_range_ms \\ 60_000) do
    GenServer.call(__MODULE__, {:get_metrics_summary, time_range_ms})
  end

  def export_grafana_dashboard do
    GenServer.call(__MODULE__, :export_grafana_dashboard)
  end

  def export_prometheus_config do
    GenServer.call(__MODULE__, :export_prometheus_config)
  end

  # Server Callbacks

  @impl true
  def init(_opts) do
    # Initialize ETS table for metrics
    metrics_store =
      :ets.new(:telemetry_metrics, [
        :set,
        :public,
        :named_table,
        read_concurrency: true,
        write_concurrency: true
      ])

    state = %__MODULE__{
      metrics_store: metrics_store,
      grafana_config: build_grafana_config(),
      prometheus_metrics: configure_prometheus_metrics(),
      dashboard_state: %{
        start_time: System.system_time(:millisecond),
        total_events: 0,
        error_count: 0
      }
    }

    # Attach telemetry handlers
    attach_telemetry_handlers()

    # Schedule periodic aggregation
    Process.send_after(self(), :aggregate_metrics, @aggregation_interval_ms)

    Logger.info("Telemetry Dashboard initialized")
    {:ok, state}
  end

  @impl true
  def handle_call(:get_dashboard_config, _from, state) do
    config = %{
      grafana: state.grafana_config,
      prometheus: state.prometheus_metrics,
      current_state: state.dashboard_state
    }

    {:reply, config, state}
  end

  @impl true
  def handle_call({:get_metrics_summary, time_range_ms}, _from, state) do
    now = System.system_time(:millisecond)
    cutoff = now - time_range_ms

    # Gather metrics from ETS
    metrics =
      :ets.select(state.metrics_store, [
        {{{:_, :"$1", :_}, :"$2"}, [{:>, :"$1", cutoff}], [:"$2"]}
      ])

    summary = aggregate_metrics_data(metrics)
    {:reply, summary, state}
  end

  @impl true
  def handle_call(:export_grafana_dashboard, _from, state) do
    dashboard = generate_grafana_dashboard(state)
    {:reply, {:ok, dashboard}, state}
  end

  @impl true
  def handle_call(:export_prometheus_config, _from, state) do
    config = generate_prometheus_config(state)
    {:reply, {:ok, config}, state}
  end

  @impl true
  def handle_info(:aggregate_metrics, state) do
    # Clean old metrics
    now = System.system_time(:millisecond)
    cutoff = now - @metrics_retention_ms

    :ets.select_delete(state.metrics_store, [
      {{{:_, :"$1", :_}, :_}, [{:<, :"$1", cutoff}], [true]}
    ])

    # Schedule next aggregation
    Process.send_after(self(), :aggregate_metrics, @aggregation_interval_ms)

    {:noreply, state}
  end

  @impl true
  def handle_info({:telemetry_event, event_name, measurements, metadata}, state) do
    # Store telemetry event
    timestamp = System.system_time(:millisecond)
    key = {event_name, timestamp, :rand.uniform()}

    value = %{
      measurements: measurements,
      metadata: metadata,
      timestamp: timestamp
    }

    :ets.insert(state.metrics_store, {key, value})

    # Update dashboard state
    new_dashboard_state = update_dashboard_state(state.dashboard_state, event_name, measurements)

    {:noreply, %{state | dashboard_state: new_dashboard_state}}
  end

  # Private Functions

  defp attach_telemetry_handlers do
    # Attach VSM system handlers
    Enum.each(@vsm_events, fn event ->
      :telemetry.attach(
        "dashboard-#{Enum.join(event, "-")}",
        event,
        &__MODULE__.handle_telemetry_event/4,
        nil
      )
    end)

    # Attach provider handlers
    Enum.each(@provider_events, fn event ->
      :telemetry.attach(
        "dashboard-provider-#{Enum.join(event, "-")}",
        event,
        &__MODULE__.handle_telemetry_event/4,
        nil
      )
    end)

    # Attach transport handlers
    Enum.each(@transport_events, fn event ->
      :telemetry.attach(
        "dashboard-transport-#{Enum.join(event, "-")}",
        event,
        &__MODULE__.handle_telemetry_event/4,
        nil
      )
    end)
  end

  def handle_telemetry_event(event_name, measurements, metadata, _config) do
    send(__MODULE__, {:telemetry_event, event_name, measurements, metadata})
  end

  defp update_dashboard_state(state, event_name, measurements) do
    state
    |> Map.update!(:total_events, &(&1 + 1))
    |> update_error_count(event_name)
    |> update_specific_metrics(event_name, measurements)
  end

  defp update_error_count(state, event_name) do
    if Enum.member?(event_name, [:error, :failure]) do
      Map.update!(state, :error_count, &(&1 + 1))
    else
      state
    end
  end

  defp update_specific_metrics(state, _event_name, measurements) do
    # Update with specific measurements
    Map.merge(state, measurements, fn _k, v1, v2 ->
      case {v1, v2} do
        {n1, n2} when is_number(n1) and is_number(n2) -> n1 + n2
        _ -> v2
      end
    end)
  end

  defp aggregate_metrics_data(metrics) do
    metrics
    |> Enum.reduce(%{}, fn metric, acc ->
      measurements = metric[:measurements] || %{}

      Enum.reduce(measurements, acc, fn {key, value}, inner_acc ->
        if is_number(value) do
          Map.update(inner_acc, key, [value], &[value | &1])
        else
          inner_acc
        end
      end)
    end)
    |> Enum.map(fn {key, values} ->
      {key, calculate_statistics(values)}
    end)
    |> Map.new()
  end

  defp calculate_statistics(values) do
    count = length(values)
    sum = Enum.sum(values)
    avg = if count > 0, do: sum / count, else: 0

    sorted = Enum.sort(values)

    median =
      if count > 0 do
        mid = div(count, 2)

        if rem(count, 2) == 0 do
          (Enum.at(sorted, mid - 1) + Enum.at(sorted, mid)) / 2
        else
          Enum.at(sorted, mid)
        end
      else
        0
      end

    %{
      count: count,
      sum: sum,
      avg: avg,
      min: Enum.min(values, fn -> 0 end),
      max: Enum.max(values, fn -> 0 end),
      median: median,
      p95: calculate_percentile(sorted, 0.95),
      p99: calculate_percentile(sorted, 0.99)
    }
  end

  defp calculate_percentile(sorted_values, percentile) do
    count = length(sorted_values)

    if count > 0 do
      index = round(percentile * (count - 1))
      Enum.at(sorted_values, index)
    else
      0
    end
  end

  defp build_grafana_config do
    %{
      version: "9.0.0",
      datasources: [
        %{
          name: "Prometheus",
          type: "prometheus",
          url: "http://prometheus:9090",
          default: true
        },
        %{
          name: "Jaeger",
          type: "jaeger",
          url: "http://jaeger:16686"
        }
      ],
      dashboards: [
        "vsm_overview",
        "s4_intelligence",
        "provider_performance",
        "amqp_transport",
        "system_health"
      ]
    }
  end

  defp configure_prometheus_metrics do
    [
      # VSM metrics
      %{
        name: "cybernetic_vsm_messages_total",
        type: :counter,
        help: "Total messages processed by VSM system",
        labels: [:system, :status]
      },
      %{
        name: "cybernetic_vsm_processing_duration_seconds",
        type: :histogram,
        help: "Message processing duration by VSM system",
        labels: [:system],
        buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5]
      },

      # Provider metrics
      %{
        name: "cybernetic_provider_requests_total",
        type: :counter,
        help: "Total requests to AI providers",
        labels: [:provider, :status]
      },
      %{
        name: "cybernetic_provider_latency_seconds",
        type: :histogram,
        help: "Provider response latency",
        labels: [:provider],
        buckets: [0.1, 0.5, 1, 2, 5, 10, 30]
      },
      %{
        name: "cybernetic_provider_tokens_used",
        type: :counter,
        help: "Tokens consumed by provider",
        labels: [:provider, :type]
      },

      # Transport metrics
      %{
        name: "cybernetic_amqp_messages_total",
        type: :counter,
        help: "Total AMQP messages",
        labels: [:exchange, :routing_key, :direction]
      },
      %{
        name: "cybernetic_amqp_queue_size",
        type: :gauge,
        help: "Current AMQP queue size",
        labels: [:queue]
      },

      # System metrics
      %{
        name: "cybernetic_memory_usage_bytes",
        type: :gauge,
        help: "Memory usage in bytes",
        labels: [:type]
      },
      %{
        name: "cybernetic_process_count",
        type: :gauge,
        help: "Number of Erlang processes"
      },
      %{
        name: "cybernetic_circuit_breaker_state",
        type: :gauge,
        help: "Circuit breaker state (0=closed, 1=open, 2=half_open)",
        labels: [:service]
      }
    ]
  end

  defp generate_grafana_dashboard(_state) do
    %{
      dashboard: %{
        title: "Cybernetic VSM Dashboard",
        panels: [
          vsm_overview_panel(),
          s4_intelligence_panel(),
          provider_performance_panel(),
          amqp_transport_panel(),
          system_health_panel()
        ],
        time: %{
          from: "now-1h",
          to: "now"
        },
        refresh: "5s",
        schemaVersion: 30,
        version: 1
      },
      overwrite: true
    }
  end

  defp vsm_overview_panel do
    %{
      title: "VSM System Overview",
      type: "graph",
      gridPos: %{x: 0, y: 0, w: 12, h: 8},
      targets: [
        %{
          expr: "rate(cybernetic_vsm_messages_total[5m])",
          legendFormat: "{{system}}"
        }
      ]
    }
  end

  defp s4_intelligence_panel do
    %{
      title: "S4 Intelligence Queries",
      type: "graph",
      gridPos: %{x: 12, y: 0, w: 12, h: 8},
      targets: [
        %{
          expr: "histogram_quantile(0.95, rate(cybernetic_provider_latency_seconds_bucket[5m]))",
          legendFormat: "p95 {{provider}}"
        },
        %{
          expr: "histogram_quantile(0.99, rate(cybernetic_provider_latency_seconds_bucket[5m]))",
          legendFormat: "p99 {{provider}}"
        }
      ]
    }
  end

  defp provider_performance_panel do
    %{
      title: "Provider Performance",
      type: "heatmap",
      gridPos: %{x: 0, y: 8, w: 12, h: 8},
      targets: [
        %{
          expr: "rate(cybernetic_provider_latency_seconds_bucket[5m])",
          format: "heatmap",
          legendFormat: "{{le}}"
        }
      ]
    }
  end

  defp amqp_transport_panel do
    %{
      title: "AMQP Message Flow",
      type: "graph",
      gridPos: %{x: 12, y: 8, w: 12, h: 8},
      targets: [
        %{
          expr: "rate(cybernetic_amqp_messages_total{direction=\"publish\"}[1m])",
          legendFormat: "Published"
        },
        %{
          expr: "rate(cybernetic_amqp_messages_total{direction=\"consume\"}[1m])",
          legendFormat: "Consumed"
        }
      ]
    }
  end

  defp system_health_panel do
    %{
      title: "System Health",
      type: "stat",
      gridPos: %{x: 0, y: 16, w: 24, h: 4},
      targets: [
        %{
          expr: "cybernetic_memory_usage_bytes",
          legendFormat: "Memory"
        },
        %{
          expr: "cybernetic_process_count",
          legendFormat: "Processes"
        },
        %{
          expr: "sum(cybernetic_circuit_breaker_state)",
          legendFormat: "Circuit Breakers"
        }
      ]
    }
  end

  defp generate_prometheus_config(_state) do
    %{
      global: %{
        scrape_interval: "15s",
        evaluation_interval: "15s"
      },
      scrape_configs: [
        %{
          job_name: "cybernetic",
          static_configs: [
            %{
              targets: ["cybernetic:9568"]
            }
          ]
        },
        %{
          job_name: "node_exporter",
          static_configs: [
            %{
              targets: ["node-exporter:9100"]
            }
          ]
        }
      ],
      recording_rules: configure_prometheus_metrics() |> Enum.map(&build_recording_rule/1)
    }
  end

  defp build_recording_rule(metric) do
    %{
      record: "#{metric.name}_5m",
      expr: "rate(#{metric.name}[5m])"
    }
  end
end
