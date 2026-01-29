#!/usr/bin/env elixir

# Complete Jaeger tracing test with real workload
Mix.install([
  {:opentelemetry_api, "~> 1.2"},
  {:opentelemetry, "~> 1.3"},
  {:opentelemetry_exporter, "~> 1.6"},
  {:httpoison, "~> 2.0"},
  {:jason, "~> 1.4"}
])

# Configure OpenTelemetry
Application.put_env(:opentelemetry, :span_processor, :batch)
Application.put_env(:opentelemetry, :traces_exporter, :otlp)

Application.put_env(:opentelemetry_exporter, :otlp_protocol, :grpc)
Application.put_env(:opentelemetry_exporter, :otlp_endpoint, "http://localhost:4317")
Application.put_env(:opentelemetry_exporter, :otlp_headers, [])
Application.put_env(:opentelemetry_exporter, :otlp_compression, :gzip)

# Start applications
Application.ensure_all_started(:opentelemetry_exporter)
Application.ensure_all_started(:opentelemetry)

defmodule JaegerTest do
  require OpenTelemetry.Tracer, as: Tracer
  
  def run do
    IO.puts("\n🚀 Starting complete Jaeger trace test...\n")
    
    # Set service resource
    :opentelemetry.register_tracer(:cybernetic, "0.1.0")
    
    # Generate multiple traces
    for i <- 1..5 do
      create_trace(i)
      Process.sleep(500)
    end
    
    # Force flush
    IO.puts("\n💾 Forcing flush of all spans...")
    :otel_batch_processor.force_flush(:span_processor)
    Process.sleep(2000)
    
    # Verify in Jaeger
    verify_jaeger()
  end
  
  defp create_trace(id) do
    IO.puts("📍 Creating trace #{id}...")
    
    # Start root span
    Tracer.with_span "request.#{id}", kind: :server do
      Tracer.set_attributes([
        {"service.name", "cybernetic"},
        {"request.id", "req-#{id}"},
        {"request.method", "POST"}
      ])
      
      # Nested operation
      Tracer.with_span "database.query" do
        Tracer.set_attributes([
          {"db.system", "postgresql"},
          {"db.operation", "SELECT"}
        ])
        Process.sleep(50)
      end
      
      # Another nested operation
      Tracer.with_span "cache.lookup" do
        Tracer.set_attributes([
          {"cache.hit", false},
          {"cache.key", "user:#{id}"}
        ])
        Process.sleep(25)
      end
      
      # Add event
      Tracer.add_event("Processing complete", [{"items.processed", id * 10}])
    end
    
    IO.puts("   ✅ Trace #{id} created")
  end
  
  defp verify_jaeger do
    IO.puts("\n🔍 Checking Jaeger for traces...")
    Process.sleep(3000)
    
    case HTTPoison.get("http://localhost:16686/api/services") do
      {:ok, %{status_code: 200, body: body}} ->
        services = Jason.decode!(body)["data"] || []
        IO.puts("📊 Services in Jaeger: #{inspect(services)}")
        
        if "cybernetic" in services do
          IO.puts("✅ Service 'cybernetic' found!")
          check_traces()
        else
          IO.puts("⚠️  Service not yet visible, checking OTEL collector...")
          check_collector()
        end
        
      error ->
        IO.puts("❌ Jaeger API error: #{inspect(error)}")
    end
  end
  
  defp check_traces do
    url = "http://localhost:16686/api/traces?service=cybernetic&limit=20"
    
    case HTTPoison.get(url) do
      {:ok, %{status_code: 200, body: body}} ->
        response = Jason.decode!(body)
        traces = response["data"] || []
        
        IO.puts("\n📈 Traces found: #{length(traces)}")
        
        if length(traces) > 0 do
          Enum.each(Enum.take(traces, 3), fn trace ->
            trace_id = trace["traceID"]
            spans_count = length(trace["spans"] || [])
            IO.puts("  - Trace: #{trace_id} (#{spans_count} spans)")
          end)
          
          IO.puts("\n🎉 SUCCESS! Traces are visible in Jaeger!")
          IO.puts("👉 Open http://localhost:16686 to view them")
        else
          IO.puts("⚠️  No traces found yet, they may still be processing...")
        end
        
      _ ->
        IO.puts("Could not fetch traces")
    end
  end
  
  defp check_collector do
    {:ok, output} = System.cmd("docker", ["logs", "--tail", "20", "cyb-otel"], stderr_to_stdout: true)
    
    if String.contains?(output, "TracesExporter") do
      IO.puts("✅ OTEL Collector is receiving traces")
      
      if String.contains?(output, "Exporting") do
        IO.puts("✅ OTEL Collector is exporting to Jaeger")
      end
    else
      IO.puts("⚠️  No trace activity in OTEL Collector logs")
    end
    
    IO.puts("\nCollector logs (last few lines):")
    output
    |> String.split("\n")
    |> Enum.take(-5)
    |> Enum.each(&IO.puts/1)
  end
end

# Run the test
JaegerTest.run()

IO.puts("\n✨ Test complete! Check http://localhost:16686 for traces\n")