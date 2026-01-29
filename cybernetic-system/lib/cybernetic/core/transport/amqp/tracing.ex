defmodule Cybernetic.Core.Transport.AMQP.Tracing do
  @moduledoc """
  AMQP tracing instrumentation for OpenTelemetry.

  Provides:
  - Automatic span creation for publish/consume
  - Context propagation via AMQP headers  
  - Semantic conventions for messaging
  """

  alias Cybernetic.Telemetry.OTEL
  require OpenTelemetry.Tracer, as: Tracer
  require OpenTelemetry.Span, as: Span

  @doc """
  Wrap AMQP publish with tracing
  """
  def traced_publish(exchange, routing_key, payload, opts \\ []) do
    span_name = "amqp.publish #{exchange}.#{routing_key}"

    attributes = %{
      "messaging.system" => "rabbitmq",
      "messaging.destination" => exchange,
      "messaging.destination_kind" => "exchange",
      "messaging.rabbitmq.routing_key" => routing_key,
      "messaging.operation" => "publish",
      "messaging.message_payload_size_bytes" => byte_size(payload)
    }

    OTEL.with_span span_name, attributes do
      # Inject trace context into AMQP headers
      headers = Keyword.get(opts, :headers, [])
      headers_with_trace = OTEL.inject_context(headers)

      # Update opts with traced headers
      opts = Keyword.put(opts, :headers, headers_with_trace)

      # Add message ID if not present
      message_id = Keyword.get(opts, :message_id, generate_message_id())
      opts = Keyword.put(opts, :message_id, message_id)

      Span.set_attribute(Tracer.current_span_ctx(), "messaging.message_id", message_id)

      # Perform actual publish
      result =
        Cybernetic.Core.Transport.AMQP.Publisher.publish(
          exchange,
          routing_key,
          payload,
          opts
        )

      case result do
        :ok ->
          Span.set_status(Tracer.current_span_ctx(), OpenTelemetry.status(:ok))
          :ok

        {:error, reason} ->
          Span.set_status(Tracer.current_span_ctx(), OpenTelemetry.status(:error))
          {:error, reason}
      end
    end
  end

  @doc """
  Wrap AMQP consume with tracing
  """
  def traced_consume(meta, payload, headers) do
    # Extract trace context from headers
    OTEL.extract_context(headers)

    routing_key = Map.get(meta, :routing_key, "unknown")
    exchange = Map.get(meta, :exchange, "unknown")

    span_name = "amqp.consume #{exchange}.#{routing_key}"

    attributes = %{
      "messaging.system" => "rabbitmq",
      "messaging.source" => exchange,
      "messaging.source_kind" => "exchange",
      "messaging.rabbitmq.routing_key" => routing_key,
      "messaging.operation" => "consume",
      "messaging.message_payload_size_bytes" => byte_size(payload),
      "messaging.consumer_id" => Map.get(meta, :consumer_tag, "unknown"),
      "messaging.message_id" => Map.get(meta, :message_id, "unknown")
    }

    OTEL.with_span span_name, attributes do
      # Process the message
      yield_result = Process.get(:consume_callback)

      if yield_result do
        yield_result.(meta, payload)
      else
        {:ok, :no_callback}
      end
    end
  end

  @doc """
  Add consume callback to process dictionary
  """
  def set_consume_callback(callback) do
    Process.put(:consume_callback, callback)
  end

  defp generate_message_id do
    "msg_#{:crypto.strong_rand_bytes(8) |> Base.encode16(case: :lower)}"
  end
end
