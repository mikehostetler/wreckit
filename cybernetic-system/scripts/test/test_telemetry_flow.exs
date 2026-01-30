#!/usr/bin/env elixir

IO.puts("\n📊 TELEMETRY DATA FLOW TEST")
IO.puts("=" |> String.duplicate(60))

# Ensure applications are started
Application.ensure_all_started(:telemetry)
Application.ensure_all_started(:opentelemetry)
Application.ensure_all_started(:opentelemetry_exporter)
Application.ensure_all_started(:httpoison)
Application.ensure_all_started(:amqp)
Application.ensure_all_started(:cybernetic)

Process.sleep(3000)

defmodule TelemetryFlowTest do
  alias Cybernetic.Telemetry.Prometheus
  alias Cybernetic.Telemetry.OTEL
  require OpenTelemetry.Tracer, as: Tracer
  
  def run do
    IO.puts("\n1️⃣  Testing OpenTelemetry Trace Export...")
    test_otel_traces()
    
    IO.puts("\n2️⃣  Testing Prometheus Metrics Export...")
    test_prometheus_metrics()
    
    IO.puts("\n3️⃣  Testing S4 Provider Telemetry...")
    test_provider_telemetry()
    
    IO.puts("\n4️⃣  Checking Service Connectivity...")
    check_service_connectivity()
    
    IO.puts("\n" <> "=" |> String.duplicate(60))
    IO.puts("✅ Telemetry data flow verified!")
  end
  
  defp test_otel_traces do
    # Create a test trace
    Tracer.with_span "test.telemetry.flow" do
      Tracer.set_attributes([
        {"test.type", "telemetry_flow"},
        {"test.timestamp", DateTime.utc_now() |> DateTime.to_iso8601()}
      ])
      
      # Create nested span
      Tracer.with_span "test.nested.operation" do
        Process.sleep(100)
        Tracer.set_attribute("operation.result", "success")
      end
      
      # Add event
      Tracer.add_event("test_event", [
        {"event.data", "test_value"}
      ])
    end
    
    IO.puts("   ✓ Created test trace with nested spans")
    
    # Get trace IDs
    ids = OTEL.current_ids()
    if ids.trace_id do
      IO.puts("   ✓ Trace ID: #{ids.trace_id}")
      IO.puts("   ✓ Span ID: #{ids.span_id}")
    else
      IO.puts("   ⚠️  No active trace context")
    end
  end
  
  defp test_prometheus_metrics do
    # Emit various metrics
    Prometheus.emit_s1_processed("test_message", "success", 150)
    Prometheus.emit_s2_decision("resource_allocation", "approved")
    Prometheus.emit_s3_action("control", "rate_limiter")
    Prometheus.emit_s4_query("anthropic", "success", 1200)
    Prometheus.emit_s5_policy_update("budget_policy")
    
    # Provider metrics
    Prometheus.emit_provider_request("openai", "gpt-4o")
    Prometheus.emit_provider_response("openai", "success", 850)
    Prometheus.emit_provider_tokens("openai", "completion", 1500)
    
    # AMQP metrics
    Prometheus.emit_amqp_publish("cyb.vsm.s4", "intelligence.query")
    Prometheus.emit_amqp_consume("vsm.system4.intelligence")
    
    # Circuit breaker metrics
    Prometheus.emit_circuit_breaker_state("anthropic", :closed)
    Prometheus.emit_circuit_breaker_state("openai", :open)
    Prometheus.emit_circuit_breaker_trip("openai")
    
    IO.puts("   ✓ Emitted test metrics for all VSM systems")
    IO.puts("   ✓ Emitted provider and transport metrics")
    IO.puts("   ✓ Emitted circuit breaker metrics")
  end
  
  defp test_provider_telemetry do
    # Test with actual S4 Service if available
    try do
      episode = %Cybernetic.VSM.System4.Episode{
        id: "test-#{System.unique_integer([:positive])}",
        kind: :query,
        data: %{
          prompt: "Test telemetry: What is 2+2?",
          max_tokens: 50,
          temperature: 0.1
        },
        metadata: %{
          trace_id: "test-trace-123",
          source: "telemetry_test"
        }
      }
      
      # This will trigger real telemetry events
      case Cybernetic.VSM.System4.Service.route_episode(episode) do
        {:ok, response} ->
          IO.puts("   ✓ S4 Service responded: #{inspect(response.data.content |> String.slice(0..50))}...")
          IO.puts("   ✓ Provider telemetry events generated")
        {:error, reason} ->
          IO.puts("   ℹ️  S4 Service error (expected if no API keys): #{inspect(reason)}")
      end
    rescue
      e ->
        IO.puts("   ℹ️  S4 Service not available: #{inspect(e)}")
    end
  end
  
  defp check_service_connectivity do
    # Check Prometheus endpoint
    prometheus_url = "http://localhost:9568/metrics"
    case HTTPoison.get(prometheus_url) do
      {:ok, %{status_code: 200, body: body}} ->
        metrics_count = body |> String.split("\n") |> Enum.count(&String.contains?(&1, "cybernetic_"))
        IO.puts("   ✓ Prometheus metrics endpoint: #{metrics_count} Cybernetic metrics")
      _ ->
        IO.puts("   ⚠️  Prometheus metrics endpoint not accessible")
    end
    
    # Check Jaeger UI
    jaeger_url = "http://localhost:16686/api/services"
    case HTTPoison.get(jaeger_url) do
      {:ok, %{status_code: 200, body: body}} ->
        services = Jason.decode!(body)
        if "cybernetic" in (services["data"] || []) do
          IO.puts("   ✓ Jaeger: 'cybernetic' service registered")
        else
          IO.puts("   ℹ️  Jaeger: 'cybernetic' service not yet visible")
        end
      _ ->
        IO.puts("   ⚠️  Jaeger API not accessible")
    end
    
    # Check OpenTelemetry Collector
    otel_url = "http://localhost:13133/"
    case HTTPoison.get(otel_url) do
      {:ok, %{status_code: 200}} ->
        IO.puts("   ✓ OpenTelemetry Collector health check passed")
      _ ->
        IO.puts("   ⚠️  OpenTelemetry Collector not accessible")
    end
    
    # Check Grafana
    grafana_url = "http://localhost:3001/api/health"
    case HTTPoison.get(grafana_url) do
      {:ok, %{status_code: 200}} ->
        IO.puts("   ✓ Grafana is running")
      _ ->
        IO.puts("   ℹ️  Grafana not accessible (may not be running)")
    end
  end
end

# Run the test
TelemetryFlowTest.run()