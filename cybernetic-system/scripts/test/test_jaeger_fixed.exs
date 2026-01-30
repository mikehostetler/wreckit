#!/usr/bin/env elixir

IO.puts("\n🎯 JAEGER 100% FIX TEST")
IO.puts("=" |> String.duplicate(60))

# Force clean environment
Application.stop(:opentelemetry)
Application.stop(:opentelemetry_exporter)
Application.stop(:opentelemetry_api)

# Configure OpenTelemetry BEFORE starting
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

# Start in correct order
Application.ensure_all_started(:grpcbox)
Application.ensure_all_started(:opentelemetry_exporter)
Application.ensure_all_started(:opentelemetry_api)
Application.ensure_all_started(:opentelemetry)
Application.ensure_all_started(:httpoison)

Process.sleep(2000)

defmodule JaegerFixTest do
  require Logger
  
  def run do
    IO.puts("\n1️⃣  Starting fresh OpenTelemetry...")
    setup_otel()
    
    IO.puts("\n2️⃣  Creating traces with low-level API...")
    create_traces_low_level()
    
    IO.puts("\n3️⃣  Forcing batch processor flush...")
    force_flush()
    
    IO.puts("\n4️⃣  Waiting for export...")
    Process.sleep(5000)
    
    IO.puts("\n5️⃣  Checking Jaeger...")
    check_jaeger()
    
    IO.puts("\n" <> "=" |> String.duplicate(60))
  end
  
  defp setup_otel do
    # Get the tracer
    tracer = :opentelemetry.get_tracer(:cybernetic, "0.1.0")
    IO.puts("   Tracer: #{inspect(tracer)}")
    
    # Check configuration
    config = :application.get_all_env(:opentelemetry)
    IO.puts("   Processor: #{inspect(config[:span_processor])}")
    IO.puts("   Exporter: #{inspect(config[:traces_exporter])}")
  end
  
  defp create_traces_low_level do
    for i <- 1..5 do
      create_single_trace(i)
      Process.sleep(200)
    end
  end
  
  defp create_single_trace(index) do
    tracer = :opentelemetry.get_tracer(:cybernetic, "0.1.0")
    
    # Create parent span
    parent_ctx = :otel_tracer.start_span(
      tracer,
      "jaeger.test.#{index}",
      %{
        kind: :server,
        attributes: %{
          "http.method" => "GET",
          "http.url" => "/test/#{index}",
          "http.status_code" => 200,
          "service.name" => "cybernetic",
          "test.index" => index
        }
      }
    )
    
    # Set as current
    token = :otel_ctx.attach(parent_ctx)
    
    # Create child span
    child_ctx = :otel_tracer.start_span(
      tracer,
      "jaeger.child.#{index}",
      %{
        kind: :internal,
        attributes: %{
          "operation" => "process",
          "index" => index
        }
      }
    )
    
    # Simulate work
    Process.sleep(10 + :rand.uniform(20))
    
    # Add events
    :otel_span.add_event(child_ctx, "processing", %{"items" => index * 10})
    
    # End child span
    :otel_span.end_span(child_ctx)
    
    # End parent span
    :otel_span.end_span(parent_ctx)
    
    # Detach context
    :otel_ctx.detach(token)
    
    IO.puts("   ✓ Created trace ##{index}")
  end
  
  defp force_flush do
    try do
      # Try multiple flush methods
      :otel_batch_processor.force_flush(:span_processor)
      Process.sleep(1000)
      
      # Try to get the exporter and flush it
      case :persistent_term.get({:opentelemetry_exporter, :otlp}, :undefined) do
        :undefined -> 
          IO.puts("   ⚠️  No exporter found in persistent_term")
        exporter ->
          IO.puts("   Found exporter: #{inspect(exporter)}")
      end
      
      IO.puts("   ✓ Forced flush complete")
    rescue
      e ->
        IO.puts("   ⚠️  Flush error: #{inspect(e)}")
    end
  end
  
  defp check_jaeger do
    # First check services
    case HTTPoison.get("http://localhost:16686/api/services") do
      {:ok, %{status_code: 200, body: body}} ->
        services = Jason.decode!(body)["data"] || []
        IO.puts("   Services in Jaeger: #{inspect(services)}")
        
        if "cybernetic" in services do
          IO.puts("   ✅ SUCCESS! 'cybernetic' service is in Jaeger!")
          check_trace_details()
        else
          IO.puts("   ❌ Service not found yet")
          debug_issue()
        end
        
      error ->
        IO.puts("   ❌ Jaeger API error: #{inspect(error)}")
    end
  end
  
  defp check_trace_details do
    # Get actual traces
    url = "http://localhost:16686/api/traces?service=cybernetic&limit=20"
    
    case HTTPoison.get(url) do
      {:ok, %{status_code: 200, body: body}} ->
        traces = Jason.decode!(body)["data"] || []
        IO.puts("   📊 Found #{length(traces)} traces!")
        
        if length(traces) > 0 do
          trace = hd(traces)
          trace_id = trace["traceID"]
          spans = trace["spans"] || []
          
          IO.puts("   🎆 Sample Trace:")
          IO.puts("     - Trace ID: #{trace_id}")
          IO.puts("     - Spans: #{length(spans)}")
          IO.puts("     - Operations: #{spans |> Enum.map(&(&1["operationName"])) |> Enum.join(", ")}")
        end
        
      _ ->
        IO.puts("   Could not fetch trace details")
    end
  end
  
  defp debug_issue do
    IO.puts("\n   🔍 Debugging why traces aren't appearing...")
    
    # Check OTEL collector
    IO.puts("\n   Checking OTEL Collector...")
    case System.cmd("docker", ["logs", "--tail", "5", "cybernetic-otel-collector"]) do
      {output, 0} ->
        if String.contains?(output, "TracesExporter") do
          IO.puts("   ✅ Collector received traces")
        else
          IO.puts("   ⚠️  No trace activity in collector")
        end
        
        if String.contains?(output, "error") do
          IO.puts("   ❌ Collector has errors")
        end
      _ ->
        IO.puts("   Could not check collector")
    end
    
    # Check Jaeger
    IO.puts("\n   Checking Jaeger...")
    case System.cmd("docker", ["logs", "--tail", "5", "cybernetic-jaeger"]) do
      {output, 0} ->
        if String.contains?(output, "Received") do
          IO.puts("   ✅ Jaeger received data")
        else
          IO.puts("   ⚠️  No recent data in Jaeger")
        end
      _ ->
        IO.puts("   Could not check Jaeger")
    end
  end
end

# Run the test
JaegerFixTest.run()