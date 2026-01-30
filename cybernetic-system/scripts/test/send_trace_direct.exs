#!/usr/bin/env elixir

# Send traces directly through OTEL collector to Jaeger
Mix.install([
  {:grpcbox, "~> 0.17"},
  {:opentelemetry_api, "~> 1.2"},
  {:opentelemetry, "~> 1.3"},
  {:opentelemetry_exporter, "~> 1.6"},
  {:httpoison, "~> 2.0"},
  {:jason, "~> 1.4"}
])

# Start required services
:inets.start()
:ssl.start()
Application.ensure_all_started(:grpcbox)

# Configure OpenTelemetry to send to OTEL collector
Application.put_env(:opentelemetry, :span_processor, :batch)
Application.put_env(:opentelemetry, :traces_exporter, :otlp)
Application.put_env(:opentelemetry, :resource, %{
  service: %{
    name: "cybernetic",
    version: "0.1.0"
  }
})

Application.put_env(:opentelemetry_exporter, :otlp_protocol, :grpc)
Application.put_env(:opentelemetry_exporter, :otlp_endpoint, "http://localhost:4317")

# Restart the exporter
Application.stop(:opentelemetry_exporter)
Application.stop(:opentelemetry)
{:ok, _} = Application.ensure_all_started(:opentelemetry_exporter)
{:ok, _} = Application.ensure_all_started(:opentelemetry)

defmodule DirectTrace do
  require OpenTelemetry.Tracer, as: Tracer
  
  def send_traces do
    IO.puts("\n🚀 Sending traces directly to OTEL Collector -> Jaeger\n")
    
    # Create multiple test traces
    for i <- 1..20 do
      create_trace(i)
      
      if rem(i, 5) == 0 do
        IO.puts("  📊 Sent #{i} traces...")
        flush_traces()
        Process.sleep(1000)
      end
    end
    
    IO.puts("\n💾 Final flush...")
    flush_traces()
    Process.sleep(3000)
    
    IO.puts("\n🔍 Checking Jaeger...")
    check_jaeger()
  end
  
  defp create_trace(id) do
    Tracer.with_span "cybernetic.request.#{id}", kind: :server do
      Tracer.set_attributes([
        {"service.name", "cybernetic"},
        {"http.method", "POST"},
        {"http.url", "/api/trace/#{id}"},
        {"http.status_code", 200},
        {"request.id", "req-#{id}"}
      ])
      
      # Add nested spans
      Tracer.with_span "vsm.s1.operational" do
        Tracer.set_attributes([
          {"vsm.system", "s1"},
          {"message.type", "trace_test"}
        ])
        Process.sleep(10)
        
        Tracer.with_span "amqp.publish" do
          Tracer.set_attributes([
            {"messaging.system", "rabbitmq"},
            {"messaging.destination", "s2.coordination"}
          ])
          Process.sleep(5)
        end
      end
      
      Tracer.with_span "vsm.s4.intelligence" do
        Tracer.set_attributes([
          {"ai.provider", "anthropic"},
          {"ai.model", "claude-3-haiku"},
          {"ai.tokens", id * 100}
        ])
        Process.sleep(20)
      end
      
      # Add event
      Tracer.add_event("trace.complete", [{"trace.id", id}])
    end
  end
  
  defp flush_traces do
    try do
      # Force flush the batch processor
      :otel_batch_processor.force_flush(:span_processor)
    rescue
      _ -> :ok
    end
  end
  
  defp check_jaeger do
    case HTTPoison.get("http://localhost:16686/api/services") do
      {:ok, %{status_code: 200, body: body}} ->
        services = Jason.decode!(body)["data"] || []
        
        if "cybernetic" in services do
          IO.puts("✅ SUCCESS! 'cybernetic' service is in Jaeger!")
          fetch_trace_count()
        else
          IO.puts("📊 Services found: #{inspect(services)}")
          IO.puts("\n⚠️  'cybernetic' not yet visible")
          check_otel_status()
        end
        
      error ->
        IO.puts("❌ Jaeger API error: #{inspect(error)}")
    end
  end
  
  defp fetch_trace_count do
    url = "http://localhost:16686/api/traces?service=cybernetic&limit=100"
    
    case HTTPoison.get(url) do
      {:ok, %{status_code: 200, body: body}} ->
        traces = Jason.decode!(body)["data"] || []
        
        IO.puts("\n🎉 JAEGER IS WORKING 100%!")
        IO.puts("📈 Total traces: #{length(traces)}")
        IO.puts("👉 View at: http://localhost:16686/search?service=cybernetic")
        
        # Show sample trace details
        if length(traces) > 0 do
          IO.puts("\n📊 Sample traces:")
          traces
          |> Enum.take(3)
          |> Enum.each(fn trace ->
            trace_id = trace["traceID"]
            spans = trace["spans"] || []
            IO.puts("  • Trace #{String.slice(trace_id, 0..8)}... with #{length(spans)} spans")
          end)
        end
        
      _ ->
        IO.puts("Could not fetch trace details")
    end
  end
  
  defp check_otel_status do
    {output, _} = System.cmd("docker", ["logs", "--tail", "10", "cyb-otel"], 
                             stderr_to_stdout: true)
    
    if String.contains?(output, ["TracesExporter", "ResourceSpans", "Exporting"]) do
      IO.puts("✅ OTEL Collector is processing traces")
    else
      IO.puts("⚠️  OTEL Collector may not be receiving traces")
    end
  end
end

DirectTrace.send_traces()

IO.puts("\n✨ Direct trace test complete!\n")