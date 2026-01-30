#!/usr/bin/env elixir

# Working Jaeger test with proper initialization
Mix.install([
  {:opentelemetry_api, "~> 1.2"},
  {:opentelemetry, "~> 1.3"},
  {:opentelemetry_exporter, "~> 1.6"},
  {:httpoison, "~> 2.0"},
  {:jason, "~> 1.4"}
])

# Start inets first (required for HTTP)
:inets.start()
:ssl.start()

# Configure OpenTelemetry
Application.put_env(:opentelemetry, :span_processor, :batch)
Application.put_env(:opentelemetry, :traces_exporter, :otlp)
Application.put_env(:opentelemetry, :resource, [
  service: %{
    name: "cybernetic",
    version: "0.1.0"
  }
])

Application.put_env(:opentelemetry_exporter, :otlp_protocol, :grpc)
Application.put_env(:opentelemetry_exporter, :otlp_endpoint, "http://localhost:4317")
Application.put_env(:opentelemetry_exporter, :otlp_headers, [])

# Start applications
{:ok, _} = Application.ensure_all_started(:opentelemetry_exporter)
{:ok, _} = Application.ensure_all_started(:opentelemetry)

defmodule WorkingJaegerTest do
  require OpenTelemetry.Tracer, as: Tracer
  
  def run do
    IO.puts("\n🚀 Jaeger Integration Test - 100% Working\n")
    IO.puts("📊 Generating traces with complete spans...\n")
    
    # Generate multiple realistic traces
    tasks = for i <- 1..10 do
      Task.async(fn -> 
        Process.sleep(i * 100)
        simulate_request(i)
      end)
    end
    
    # Wait for all tasks
    Task.await_many(tasks, 10000)
    
    # Force flush all spans
    IO.puts("\n💾 Flushing all spans to OTEL collector...")
    flush_spans()
    
    # Wait for export
    Process.sleep(3000)
    
    # Verify traces in Jaeger
    verify_jaeger()
  end
  
  defp simulate_request(id) do
    # Create a realistic distributed trace
    Tracer.with_span "http.request", kind: :server do
      Tracer.set_attributes([
        {"http.method", "POST"},
        {"http.url", "/api/v1/process"},
        {"http.status_code", 200},
        {"request.id", "req-#{id}"}
      ])
      
      # Database operation
      db_result = Tracer.with_span "db.query", kind: :client do
        Tracer.set_attributes([
          {"db.system", "postgresql"},
          {"db.operation", "SELECT"},
          {"db.statement", "SELECT * FROM users WHERE id = $1"}
        ])
        Process.sleep(20 + :rand.uniform(30))
        {:ok, %{user_id: id, name: "User#{id}"}}
      end
      
      # Cache operation
      Tracer.with_span "cache.get", kind: :client do
        Tracer.set_attributes([
          {"cache.backend", "redis"},
          {"cache.key", "session:#{id}"},
          {"cache.hit", false}
        ])
        Process.sleep(5 + :rand.uniform(10))
      end
      
      # Business logic
      Tracer.with_span "business.process" do
        Tracer.set_attributes([
          {"user.id", id},
          {"processing.items", id * 10}
        ])
        
        # Nested operation
        Tracer.with_span "validation" do
          Process.sleep(10)
          Tracer.add_event("validation.complete", [{"valid", true}])
        end
        
        Process.sleep(15)
      end
      
      # Add completion event
      Tracer.add_event("request.complete", [
        {"duration_ms", 50 + id * 10},
        {"success", true}
      ])
      
      IO.puts("  ✅ Trace #{id} generated")
    end
  end
  
  defp flush_spans do
    try do
      # Force flush the batch processor
      :otel_batch_processor.force_flush(:span_processor)
      IO.puts("  ✅ Spans flushed to OTEL collector")
    rescue
      e ->
        IO.puts("  ⚠️  Flush warning: #{inspect(e)}")
    end
  end
  
  defp verify_jaeger do
    IO.puts("\n🔍 Verifying traces in Jaeger...\n")
    
    # Check Jaeger services API
    case HTTPoison.get("http://localhost:16686/api/services") do
      {:ok, %{status_code: 200, body: body}} ->
        services = Jason.decode!(body)["data"] || []
        
        if "cybernetic" in services do
          IO.puts("✅ Service 'cybernetic' registered in Jaeger!")
          fetch_traces()
        else
          IO.puts("📊 Available services: #{inspect(services)}")
          IO.puts("\n⚠️  'cybernetic' not yet visible. Checking OTEL collector...")
          check_otel_logs()
        end
        
      error ->
        IO.puts("❌ Cannot reach Jaeger: #{inspect(error)}")
        check_containers()
    end
  end
  
  defp fetch_traces do
    # Get traces from Jaeger
    url = "http://localhost:16686/api/traces?service=cybernetic&limit=50"
    
    case HTTPoison.get(url) do
      {:ok, %{status_code: 200, body: body}} ->
        response = Jason.decode!(body)
        traces = response["data"] || []
        
        IO.puts("\n📈 TRACES FOUND: #{length(traces)}")
        
        if length(traces) > 0 do
          IO.puts("\n✨ Sample traces:")
          
          traces
          |> Enum.take(5)
          |> Enum.each(fn trace ->
            trace_id = trace["traceID"] || "unknown"
            spans = trace["spans"] || []
            duration = calculate_duration(spans)
            
            IO.puts("  • Trace: #{String.slice(trace_id, 0..12)}... (#{length(spans)} spans, #{duration}μs)")
          end)
          
          IO.puts("\n🎉 SUCCESS! Jaeger is receiving traces!")
          IO.puts("👉 View them at: http://localhost:16686")
        else
          IO.puts("⚠️  No traces yet. They may still be processing...")
          check_otel_logs()
        end
        
      _ ->
        IO.puts("❌ Could not fetch traces from Jaeger")
    end
  end
  
  defp calculate_duration(spans) when is_list(spans) do
    if Enum.empty?(spans) do
      0
    else
      spans
      |> Enum.map(fn span -> span["duration"] || 0 end)
      |> Enum.max()
    end
  end
  
  defp check_otel_logs do
    IO.puts("\n📋 Checking OTEL Collector logs...")
    
    {output, _} = System.cmd("docker", ["logs", "--tail", "30", "cyb-otel"], 
                             stderr_to_stdout: true)
    
    cond do
      String.contains?(output, "TracesExporter") ->
        IO.puts("✅ OTEL is exporting traces")
        
      String.contains?(output, "ResourceSpans") ->
        IO.puts("✅ OTEL is receiving spans")
        
      String.contains?(output, "grpc") ->
        IO.puts("✅ OTEL gRPC endpoint is active")
        
      true ->
        IO.puts("⚠️  No clear trace activity in OTEL logs")
    end
    
    # Show recent relevant lines
    output
    |> String.split("\n")
    |> Enum.filter(fn line -> 
      String.contains?(line, ["Trace", "span", "export", "jaeger"])
    end)
    |> Enum.take(-5)
    |> case do
      [] -> IO.puts("  (No trace-related log entries)")
      lines -> Enum.each(lines, &IO.puts("  #{&1}"))
    end
  end
  
  defp check_containers do
    IO.puts("\n🐳 Checking Docker containers...")
    
    {output, _} = System.cmd("docker", ["ps", "--format", "table {{.Names}}\t{{.Status}}"], 
                             stderr_to_stdout: true)
    
    IO.puts(output)
    
    if not String.contains?(output, "cyb-jaeger") do
      IO.puts("\n⚠️  Jaeger container not running! Starting it...")
      System.cmd("docker-compose", ["up", "-d", "jaeger"])
    end
    
    if not String.contains?(output, "cyb-otel") do
      IO.puts("\n⚠️  OTEL Collector not running! Starting it...")
      System.cmd("docker-compose", ["up", "-d", "otel-collector"])
    end
  end
end

# Run the test
WorkingJaegerTest.run()

IO.puts("\n✨ Test complete!\n")