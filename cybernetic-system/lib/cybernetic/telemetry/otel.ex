defmodule Cybernetic.Telemetry.OTEL do
  @moduledoc """
  OpenTelemetry configuration and helper functions for distributed tracing.

  Provides:
  - Resource attributes (service.name, version, env)
  - B3/W3C propagation
  - Span helpers with context propagation
  - AMQP header injection/extraction
  """

  require OpenTelemetry.Tracer, as: Tracer
  require OpenTelemetry.Span, as: Span
  require Record

  # Import the span record definition
  Record.defrecordp(
    :span_ctx,
    Record.extract(:span_ctx, from_lib: "opentelemetry_api/include/opentelemetry.hrl")
  )

  @doc """
  Initialize OpenTelemetry with resource attributes and exporters.
  Called from application.ex
  """
  def setup do
    # Resource attributes
    resource = %{
      "service.name" => "cybernetic",
      "service.version" => Application.spec(:cybernetic, :vsn) |> to_string(),
      "service.environment" => System.get_env("ENV", "development"),
      "deployment.environment" => System.get_env("ENV", "development"),
      "telemetry.sdk.language" => "elixir",
      "telemetry.sdk.name" => "opentelemetry",
      "telemetry.sdk.version" => Application.spec(:opentelemetry, :vsn) |> to_string()
    }

    # Set resource (use newer API if available)
    try do
      if function_exported?(:opentelemetry, :set_resource, 1) do
        apply(:opentelemetry, :set_resource, [:otel_resource.create(resource)])
      else
        # Fallback for older OpenTelemetry versions
        :ok
      end
    rescue
      _ -> :ok
    end

    # Configure text map propagator for B3 and W3C (with fallback)
    try do
      if function_exported?(:otel_propagator_text_map, :set, 1) do
        apply(:otel_propagator_text_map, :set, [
          [
            :otel_propagator_b3,
            :otel_propagator_trace_context
          ]
        ])
      else
        # Fallback for older OpenTelemetry versions
        :ok
      end
    rescue
      _ -> :ok
    end

    :ok
  end

  @doc """
  Extract trace context from AMQP headers
  """
  def extract_context(headers) when is_list(headers) do
    headers_map =
      headers
      |> Enum.map(fn
        {k, _type, v} -> {to_string(k), to_string(v)}
        {k, v} -> {to_string(k), to_string(v)}
      end)
      |> Map.new()

    :otel_propagator_text_map.extract(headers_map)
  end

  # P0 Security: Whitelist of known OTEL propagation headers to prevent atom DoS
  @otel_header_whitelist %{
    # W3C Trace Context
    "traceparent" => :traceparent,
    "tracestate" => :tracestate,
    "baggage" => :baggage,
    # B3 (multi and single)
    "b3" => :b3,
    "x-b3-traceid" => :"x-b3-traceid",
    "x-b3-spanid" => :"x-b3-spanid",
    "x-b3-parentspanid" => :"x-b3-parentspanid",
    "x-b3-sampled" => :"x-b3-sampled",
    "x-b3-flags" => :"x-b3-flags"
  }

  @doc """
  Inject trace context into AMQP headers
  """
  def inject_context(headers \\ []) do
    ctx_map = %{}
    updated_map = :otel_propagator_text_map.inject(ctx_map)

    # Convert back to AMQP header format using whitelist
    amqp_headers =
      updated_map
      |> Enum.filter(fn {k, _v} -> Map.has_key?(@otel_header_whitelist, k) end)
      |> Enum.map(fn {k, v} ->
        {Map.fetch!(@otel_header_whitelist, k), :longstr, to_string(v)}
      end)

    headers ++ amqp_headers
  end

  @doc """
  Start a new span with attributes - supports both function and do block syntax
  """
  def with_span(name, attributes \\ %{}, fun_or_opts \\ [])

  # Handle do block syntax: with_span(name, attrs, do: ...)
  def with_span(name, attributes, opts) when is_list(opts) and opts != [] do
    case Keyword.get(opts, :do) do
      nil ->
        # No do block, treat as empty function
        with_span(name, attributes, fn -> :ok end)

      block ->
        # Execute the do block
        with_span(name, attributes, fn -> block end)
    end
  end

  # Handle function syntax: with_span(name, attrs, fn -> ... end)
  def with_span(name, attributes, fun) when is_function(fun) do
    Tracer.with_span name, %{attributes: attributes, kind: :internal} do
      result = fun.()

      # Add result as span attribute
      case result do
        {:ok, _} ->
          Span.set_attribute(Tracer.current_span_ctx(), :result, "success")

        {:error, reason} ->
          Span.set_attribute(Tracer.current_span_ctx(), :result, "error")
          Span.set_attribute(Tracer.current_span_ctx(), :error_reason, inspect(reason))

        _ ->
          Span.set_attribute(Tracer.current_span_ctx(), :result, "unknown")
      end

      result
    end
  end

  @doc """
  Add event to current span
  """
  def add_event(name, attributes \\ %{}) do
    Span.add_event(Tracer.current_span_ctx(), name, attributes)
  end

  @doc """
  Set attributes on current span
  """
  def set_attributes(attributes) do
    span_ctx = Tracer.current_span_ctx()

    Enum.each(attributes, fn {k, v} ->
      Span.set_attribute(span_ctx, k, v)
    end)
  end

  @doc """
  Record an exception on the current span
  """
  def record_exception(exception, stacktrace \\ nil) do
    span_ctx = Tracer.current_span_ctx()
    Span.record_exception(span_ctx, exception, stacktrace)
    Span.set_status(span_ctx, :error)
  end

  @doc """
  Get current trace and span IDs as hex strings
  """
  def current_ids do
    ctx = Tracer.current_span_ctx()

    case ctx do
      span_ctx(trace_id: trace_id, span_id: span_id) when trace_id != 0 and span_id != 0 ->
        %{
          trace_id: trace_id |> Integer.to_string(16) |> String.pad_leading(32, "0"),
          span_id: span_id |> Integer.to_string(16) |> String.pad_leading(16, "0")
        }

      _ ->
        %{trace_id: nil, span_id: nil}
    end
  end

  @doc """
  Create a child span linked to current context
  """
  def child_span(name, attributes \\ %{}) do
    parent_ctx = Tracer.current_span_ctx()
    Tracer.start_span(name, %{attributes: attributes, parent: parent_ctx})
  end
end
