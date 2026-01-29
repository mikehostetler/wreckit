#!/usr/bin/env elixir

IO.puts("\n🔬 OPENTELEMETRY DIRECT TEST")
IO.puts("=" |> String.duplicate(60))

# Configure OpenTelemetry before starting
Application.put_env(:opentelemetry, :span_processor, :batch)
Application.put_env(:opentelemetry, :traces_exporter, :otlp)
Application.put_env(:opentelemetry, :resource, [
  service: %{
    name: "cybernetic-test",
    version: "0.1.0"
  }
])

Application.put_env(:opentelemetry_exporter, :otlp_protocol, :grpc)
Application.put_env(:opentelemetry_exporter, :otlp_endpoint, "http://localhost:4317")

# Start applications
Application.ensure_all_started(:grpcbox)
Application.ensure_all_started(:opentelemetry_exporter)
Application.ensure_all_started(:opentelemetry)

# Wait for initialization
Process.sleep(2000)

defmodule OTelDirectTest do
  require OpenTelemetry.Tracer, as: Tracer
  require OpenTelemetry.Span, as: Span
  
  def run do
    IO.puts("\n1️⃣ Testing OpenTelemetry configuration...")
    check_configuration()
    
    IO.puts("\n2️⃣ Creating simple trace...")
    create_simple_trace()
    
    IO.puts("\n3️⃣ Creating nested trace...")
    create_nested_trace()
    
    IO.puts("\n4️⃣ Waiting for traces to be sent...")
    # Force flush is not available in this version
    Process.sleep(5000)
    
    IO.puts("\n5️⃣ Checking services in Jaeger...")
    check_jaeger_services()
    
    IO.puts("\n" <> "=" |> String.duplicate(60))
  end
  
  defp check_configuration do
    # Check if OpenTelemetry is configured
    config = :application.get_all_env(:opentelemetry)
    exporter_config = :application.get_all_env(:opentelemetry_exporter)
    
    IO.puts("   OpenTelemetry config:")
    IO.puts("   - Span processor: #{inspect(config[:span_processor])}")
    IO.puts("   - Traces exporter: #{inspect(config[:traces_exporter])}")
    IO.puts("   - Resource: #{inspect(config[:resource])}")
    
    IO.puts("   Exporter config:")
    IO.puts("   - Protocol: #{inspect(exporter_config[:otlp_protocol])}")
    IO.puts("   - Endpoint: #{inspect(exporter_config[:otlp_endpoint])}")
  end
  
  defp create_simple_trace do
    Tracer.with_span "test.simple", %{kind: :server} do
      Tracer.set_attributes([
        {"test.type", "simple"},
        {"service.name", "cybernetic-test"},
        {"timestamp", System.system_time(:millisecond)}
      ])
      
      Process.sleep(50)
      
      Span.set_status(Tracer.current_span_ctx(), :ok)
    end
    
    IO.puts("   ✓ Created simple trace")
  end
  
  defp create_nested_trace do
    Tracer.with_span "test.parent", %{kind: :server} do
      Tracer.set_attribute("level", "parent")
      
      Tracer.with_span "test.child1", %{kind: :internal} do
        Tracer.set_attribute("level", "child1")
        Process.sleep(20)
        
        Tracer.with_span "test.grandchild", %{kind: :internal} do
          Tracer.set_attribute("level", "grandchild")
          Process.sleep(10)
        end
      end
      
      Tracer.with_span "test.child2", %{kind: :internal} do
        Tracer.set_attribute("level", "child2")
        Process.sleep(15)
      end
      
      Span.set_status(Tracer.current_span_ctx(), :ok)
    end
    
    IO.puts("   ✓ Created nested trace with 4 spans")
  end
  
  defp check_jaeger_services do
    case HTTPoison.get("http://localhost:16686/api/services") do
      {:ok, %{status_code: 200, body: body}} ->
        services = Jason.decode!(body)["data"] || []
        IO.puts("   Services in Jaeger: #{inspect(services)}")
        
        if "cybernetic-test" in services or "cybernetic" in services do
          IO.puts("   ✅ Service found in Jaeger!")
          check_traces()
        else
          IO.puts("   ⚠️  Service not yet visible in Jaeger")
          IO.puts("   Checking OTEL collector connectivity...")
          check_otel_collector()
        end
      error ->
        IO.puts("   ❌ Jaeger API error: #{inspect(error)}")
    end
  end
  
  defp check_traces do
    url = "http://localhost:16686/api/traces?service=cybernetic-test&limit=10"
    
    case HTTPoison.get(url) do
      {:ok, %{status_code: 200, body: body}} ->
        traces = Jason.decode!(body)["data"] || []
        IO.puts("   📊 Found #{length(traces)} traces")
      _ ->
        IO.puts("   Could not fetch traces")
    end
  end
  
  defp check_otel_collector do
    # Check if OTEL collector is reachable
    case :gen_tcp.connect(~c"localhost", 4317, [:binary, active: false], 1000) do
      {:ok, socket} ->
        :gen_tcp.close(socket)
        IO.puts("   ✅ OTEL collector port 4317 is open")
      {:error, reason} ->
        IO.puts("   ❌ OTEL collector not reachable: #{inspect(reason)}")
    end
    
    # Check OTEL collector health endpoint
    case HTTPoison.get("http://localhost:13133/") do
      {:ok, %{status_code: 200}} ->
        IO.puts("   ✅ OTEL collector health check passed")
      _ ->
        IO.puts("   ⚠️  OTEL collector health check failed")
    end
  end
end

# Run the test
OTelDirectTest.run()