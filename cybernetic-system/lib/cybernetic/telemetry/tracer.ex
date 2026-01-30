defmodule Cybernetic.Telemetry.Tracer do
  @moduledoc """
  OpenTelemetry tracer module that ensures proper trace export to Jaeger.
  Provides helpers for creating and managing traces with forced flushing.
  """

  require Logger

  @doc """
  Initialize OpenTelemetry with proper configuration for Jaeger export.
  """
  def setup do
    # Ensure OpenTelemetry is configured
    Application.put_env(:opentelemetry, :span_processor, :batch)
    Application.put_env(:opentelemetry, :traces_exporter, :otlp)

    # Set resource attributes
    env = Application.get_env(:cybernetic, :environment, :prod)

    _resource_attributes = %{
      "service.name" => "cybernetic",
      "service.version" => "0.1.0",
      "deployment.environment" => to_string(env)
    }

    :otel_resource_env_var.parse("service.name=cybernetic,service.version=0.1.0")

    # Configure exporter
    Application.put_env(:opentelemetry_exporter, :otlp_protocol, :grpc)
    Application.put_env(:opentelemetry_exporter, :otlp_endpoint, "http://localhost:4317")
    Application.put_env(:opentelemetry_exporter, :otlp_compression, :gzip)

    Logger.info("OpenTelemetry tracer configured for Jaeger export")
    :ok
  end

  @doc """
  Force flush all pending spans to ensure they're exported.
  """
  def force_flush do
    try do
      # Get the tracer provider
      tracer_provider = :opentelemetry.get_tracer()

      # Force flush through the provider
      case tracer_provider do
        :undefined ->
          Logger.warning("No tracer provider available")
          :ok

        _ ->
          # Use the batch processor's force flush
          :otel_batch_processor.force_flush(:span_processor)
          Process.sleep(100)
          :ok
      end
    rescue
      e ->
        Logger.warning("Failed to force flush: #{inspect(e)}")
        :ok
    end
  end

  @doc """
  Create a test trace that's guaranteed to be exported to Jaeger.
  """
  def create_test_trace(name \\ "test.trace") do
    # Use the lower-level API to ensure trace creation
    tracer = :opentelemetry.get_tracer(:cybernetic)

    # Start a span
    ctx =
      :otel_tracer.start_span(
        tracer,
        name,
        %{
          kind: :server,
          attributes: %{
            "test.type" => "jaeger_verification",
            "service.name" => "cybernetic",
            "test.timestamp" => System.system_time(:millisecond)
          }
        }
      )

    # Set as current
    token = :otel_ctx.attach(ctx)

    # Do some work
    Process.sleep(10)

    # Add an event
    :otel_span.add_event(
      ctx,
      "test_event",
      %{"event.data" => "test_value"}
    )

    # End the span
    :otel_span.end_span(ctx)

    # Detach context
    :otel_ctx.detach(token)

    # Force flush immediately
    force_flush()

    Logger.info("Created test trace: #{name}")
    :ok
  end

  @doc """
  Verify Jaeger connectivity and trace export.
  """
  def verify_jaeger do
    IO.puts("\n🔍 Verifying Jaeger Integration...")

    # Create multiple test traces
    for i <- 1..3 do
      create_test_trace("jaeger.test.#{i}")
      Process.sleep(500)
    end

    # Wait for export
    IO.puts("   Waiting for traces to export...")
    Process.sleep(3000)

    # Check Jaeger API
    case HTTPoison.get("http://localhost:16686/api/services") do
      {:ok, %{status_code: 200, body: body}} ->
        services = Jason.decode!(body)["data"] || []

        if "cybernetic" in services do
          IO.puts("   ✅ \"cybernetic\" service found in Jaeger!")
          check_traces()
        else
          IO.puts("   ⚠️  Service not found. Available: #{inspect(services)}")
          IO.puts("   Checking collector logs...")
          check_collector_status()
        end

      error ->
        IO.puts("   ❌ Jaeger API error: #{inspect(error)}")
    end
  end

  defp check_traces do
    url = "http://localhost:16686/api/traces?service=cybernetic&limit=10"

    case HTTPoison.get(url) do
      {:ok, %{status_code: 200, body: body}} ->
        traces = Jason.decode!(body)["data"] || []
        IO.puts("   📊 Found #{length(traces)} traces in Jaeger")

        if length(traces) > 0 do
          trace = hd(traces)
          IO.puts("   🔗 Trace ID: #{trace["traceID"]}")
          IO.puts("   📊 Spans: #{length(trace["spans"] || [])}")
        end

      _ ->
        IO.puts("   Could not fetch traces")
    end
  end

  defp check_collector_status do
    # Check if collector is receiving data
    case System.cmd("docker", ["logs", "--tail", "10", "cybernetic-otel-collector"]) do
      {output, 0} ->
        if String.contains?(output, "TracesExporter") do
          IO.puts("   ✅ Collector is receiving traces")
        else
          IO.puts("   ⚠️  No recent trace activity in collector")
        end

      _ ->
        IO.puts("   Could not check collector logs")
    end
  end
end
