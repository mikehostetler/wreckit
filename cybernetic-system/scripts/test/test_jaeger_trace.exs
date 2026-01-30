#!/usr/bin/env elixir

IO.puts("\n🔍 JAEGER TRACE TEST")
IO.puts("=" |> String.duplicate(60))

# Start required applications
Application.ensure_all_started(:opentelemetry)
Application.ensure_all_started(:opentelemetry_exporter)
Application.ensure_all_started(:opentelemetry_api)
Application.ensure_all_started(:cybernetic)

Process.sleep(2000)

defmodule JaegerTraceTest do
  require OpenTelemetry.Tracer, as: Tracer
  require OpenTelemetry.Span, as: Span
  
  def run do
    IO.puts("\n1️⃣ Creating test traces...")
    
    # Create multiple traces to ensure visibility
    for i <- 1..5 do
      create_test_trace(i)
      Process.sleep(500)
    end
    
    IO.puts("\n2️⃣ Creating VSM system traces...")
    create_vsm_traces()
    
    IO.puts("\n3️⃣ Creating provider traces...")
    create_provider_traces()
    
    # Force flush to ensure traces are sent
    IO.puts("\n4️⃣ Forcing trace flush...")
    :opentelemetry.force_flush()
    Process.sleep(2000)
    
    IO.puts("\n5️⃣ Checking Jaeger for traces...")
    check_jaeger_traces()
    
    IO.puts("\n" <> "=" |> String.duplicate(60))
    IO.puts("✅ Trace generation complete!")
  end
  
  defp create_test_trace(index) do
    Tracer.with_span "test.trace.#{index}", %{kind: :server} do
      Tracer.set_attributes([
        {"test.index", index},
        {"test.type", "jaeger_verification"},
        {"service.name", "cybernetic"},
        {"timestamp", DateTime.utc_now() |> DateTime.to_iso8601()}
      ])
      
      # Create nested spans
      Tracer.with_span "test.operation.#{index}", %{kind: :internal} do
        Process.sleep(10 + :rand.uniform(40))
        
        # Add events
        Tracer.add_event("processing_start", [
          {"item.count", :rand.uniform(100)}
        ])
        
        # Simulate some work
        result = perform_work(index)
        
        Tracer.set_attribute("operation.result", result)
        
        # Create another nested span
        Tracer.with_span "test.database.#{index}", %{kind: :client} do
          Process.sleep(5 + :rand.uniform(15))
          Tracer.set_attributes([
            {"db.system", "postgresql"},
            {"db.operation", "SELECT"},
            {"db.statement", "SELECT * FROM vsm_events WHERE id = #{index}"}
          ])
        end
        
        Tracer.add_event("processing_complete", [
          {"duration_ms", :rand.uniform(100)}
        ])
      end
      
      # Record success
      Span.set_status(Tracer.current_span_ctx(), :ok)
    end
    
    IO.puts("   ✓ Created trace ##{index}")
  end
  
  defp create_vsm_traces do
    # S1 Operation trace
    Tracer.with_span "vsm.s1.message_process", %{kind: :server} do
      Tracer.set_attributes([
        {"vsm.system", "s1"},
        {"message.type", "command"},
        {"message.id", UUID.uuid4()}
      ])
      Process.sleep(20)
    end
    
    # S2 Coordination trace  
    Tracer.with_span "vsm.s2.coordinate", %{kind: :internal} do
      Tracer.set_attributes([
        {"vsm.system", "s2"},
        {"coordination.type", "resource_allocation"}
      ])
      Process.sleep(15)
    end
    
    # S3 Control trace
    Tracer.with_span "vsm.s3.control_action", %{kind: :internal} do
      Tracer.set_attributes([
        {"vsm.system", "s3"},
        {"control.action", "rate_limit"}
      ])
      Process.sleep(10)
    end
    
    # S4 Intelligence trace
    Tracer.with_span "vsm.s4.analyze", %{kind: :client} do
      Tracer.set_attributes([
        {"vsm.system", "s4"},
        {"provider", "anthropic"},
        {"model", "claude-3-5-sonnet"}
      ])
      
      # Nested provider call
      Tracer.with_span "provider.anthropic.call", %{kind: :client} do
        Tracer.set_attributes([
          {"http.method", "POST"},
          {"http.url", "https://api.anthropic.com/v1/messages"},
          {"http.status_code", 200}
        ])
        Process.sleep(50)
      end
    end
    
    # S5 Policy trace
    Tracer.with_span "vsm.s5.policy_update", %{kind: :internal} do
      Tracer.set_attributes([
        {"vsm.system", "s5"},
        {"policy.type", "budget_limit"}
      ])
      Process.sleep(5)
    end
    
    IO.puts("   ✓ Created VSM system traces")
  end
  
  defp create_provider_traces do
    providers = ["anthropic", "openai", "together", "ollama"]
    
    Enum.each(providers, fn provider ->
      Tracer.with_span "provider.#{provider}.request", %{kind: :client} do
        Tracer.set_attributes([
          {"provider.name", provider},
          {"provider.status", "success"},
          {"tokens.input", :rand.uniform(1000)},
          {"tokens.output", :rand.uniform(500)},
          {"latency_ms", :rand.uniform(2000)}
        ])
        
        # Simulate circuit breaker check
        Tracer.with_span "circuit_breaker.check", %{kind: :internal} do
          Tracer.set_attribute("circuit.state", "closed")
          Process.sleep(2)
        end
        
        Process.sleep(10 + :rand.uniform(30))
      end
    end)
    
    IO.puts("   ✓ Created provider traces")
  end
  
  defp perform_work(index) do
    # Simulate some work
    sum = Enum.reduce(1..index*10, 0, &+/2)
    "completed_#{sum}"
  end
  
  defp check_jaeger_traces do
    Process.sleep(3000)  # Give time for traces to be exported
    
    case HTTPoison.get("http://localhost:16686/api/services") do
      {:ok, %{status_code: 200, body: body}} ->
        services = Jason.decode!(body)["data"] || []
        if "cybernetic" in services do
          IO.puts("   ✅ 'cybernetic' service found in Jaeger!")
          check_trace_count()
        else
          IO.puts("   ⚠️  'cybernetic' service not yet in Jaeger")
          IO.puts("   Services found: #{inspect(services)}")
        end
      _ ->
        IO.puts("   ❌ Could not connect to Jaeger API")
    end
  end
  
  defp check_trace_count do
    lookback = 3600000  # 1 hour in milliseconds
    end_time = System.system_time(:microsecond)
    start_time = end_time - (lookback * 1000)
    
    url = "http://localhost:16686/api/traces?" <>
          "service=cybernetic&" <>
          "start=#{start_time}&" <>
          "end=#{end_time}&" <>
          "limit=20"
    
    case HTTPoison.get(url) do
      {:ok, %{status_code: 200, body: body}} ->
        traces = Jason.decode!(body)["data"] || []
        IO.puts("   📊 Found #{length(traces)} traces in Jaeger")
        
        if length(traces) > 0 do
          trace = hd(traces)
          trace_id = trace["traceID"]
          span_count = length(trace["spans"] || [])
          IO.puts("   📍 Sample trace ID: #{trace_id}")
          IO.puts("   📍 Spans in trace: #{span_count}")
        end
      _ ->
        IO.puts("   ⚠️  Could not fetch traces from Jaeger")
    end
  end
end

# UUID module for generating IDs
defmodule UUID do
  def uuid4 do
    :crypto.strong_rand_bytes(16)
    |> Base.encode16(case: :lower)
    |> String.slice(0..31)
  end
end

# Run the test
JaegerTraceTest.run()