defmodule Cybernetic.VSM.System4.AMQPConsumer do
  @moduledoc """
  AMQP consumer for System 4 (Intelligence).
  Consumes messages from cyb.s4.llm queue bound to cyb.commands exchange with s4.* routing key.
  Processes messages through S4 MessageHandler and routes responses back to requesters.
  """
  use GenServer
  use AMQP
  require Logger
  alias Cybernetic.Core.Transport.AMQP.Connection

  @queue "cyb.s4.llm"
  @default_prefetch_count 10

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  def init(_opts) do
    send(self(), :connect)
    {:ok, %{channel: nil, consumer_tag: nil}}
  end

  def handle_info(:connect, state) do
    case Connection.get_channel() do
      {:ok, channel} ->
        setup_queue(channel)
        {:ok, consumer_tag} = Basic.consume(channel, @queue)
        Basic.qos(channel, prefetch_count: @default_prefetch_count)
        Logger.info("S4 AMQP Consumer started on queue #{@queue}")
        {:noreply, %{state | channel: channel, consumer_tag: consumer_tag}}

      {:error, reason} ->
        Logger.error("S4 AMQP Consumer failed to connect: #{inspect(reason)}")
        Process.send_after(self(), :connect, 5_000)
        {:noreply, state}
    end
  end

  def handle_info({:basic_deliver, payload, meta}, state) do
    Logger.debug("S4 Consumer received message with routing key: #{meta.routing_key}")

    case Jason.decode(payload) do
      {:ok, message} ->
        process_message(message, meta, state)
        Basic.ack(state.channel, meta.delivery_tag)

      {:error, reason} ->
        Logger.error("Failed to decode message: #{inspect(reason)}")
        Basic.reject(state.channel, meta.delivery_tag, requeue: false)
    end

    {:noreply, state}
  end

  def handle_info({:basic_consume_ok, %{consumer_tag: tag}}, state) do
    Logger.debug("S4 Consumer registered: #{tag}")
    {:noreply, state}
  end

  def handle_info({:basic_cancel, _}, state) do
    Logger.warning("S4 Consumer cancelled")
    {:stop, :normal, state}
  end

  def handle_info({:DOWN, _, :process, _pid, reason}, state) do
    Logger.error("S4 Consumer channel down: #{inspect(reason)}")
    send(self(), :connect)
    {:noreply, %{state | channel: nil}}
  end

  defp setup_queue(channel) do
    # Queue should already exist from topology setup
    case Queue.declare(channel, @queue, passive: true) do
      {:ok, _} ->
        Logger.debug("Queue #{@queue} exists")
      {:error, _} ->
        Logger.warning("Queue #{@queue} does not exist - topology should create it")
    end
  end

  defp process_message(message, meta, _state) do
    # Extract correlation_id from headers (Publisher puts it there)
    headers = get_in(message, ["headers"]) || %{}
    correlation_id = Map.get(headers, "correlation_id")
    source = Map.get(headers, "source", "unknown")

    # Extract operation from routing key or message payload
    operation = extract_operation(meta.routing_key, message)

    # Extract payload (remove envelope if present)
    payload = Map.get(message, "payload", message)
    chat_id = Map.get(payload, "chat_id") || Map.get(payload, :chat_id)

    # Build metadata for handler
    handler_meta = %{
      correlation_id: correlation_id,
      routing_key: meta.routing_key,
      source: source
    }

    # Process through S4 MessageHandler
    # Result comes back as {actual_result, telemetry_meta}
    {result, _telemetry_meta} = Cybernetic.VSM.System4.MessageHandler.handle_message(operation, payload, handler_meta)
    
    Logger.debug("S4 Consumer: operation=#{operation} result=#{inspect(result)}")

    # Send response if correlation_id present (Telegram request)
    if correlation_id do
      formatted = format_result(result)
      # Add chat_id to the response map for fallback routing
      response_with_chat = Map.put(formatted, :chat_id, chat_id)
      send_telegram_response(correlation_id, response_with_chat)
    end

    # Emit telemetry for message processing
    :telemetry.execute([:s4, :amqp, :processed], %{count: 1}, %{
      operation: operation,
      routing_key: meta.routing_key,
      correlation_id: correlation_id,
      source: source
    })

    Logger.debug("S4 processed #{operation} for correlation_id: #{correlation_id}")
  end

  def extract_operation("s4.reason", _message), do: "intelligence"
  def extract_operation("s4.analyze", _message), do: "analyze"
  def extract_operation("s4.learn", _message), do: "learn"
  def extract_operation("s4.predict", _message), do: "predict"
  def extract_operation(_routing_key, message) do
    # Fallback to operation field in message
    Map.get(message, "operation", "intelligence")
  end

  defp send_telegram_response(correlation_id, response) do
    try do
      send(Cybernetic.VSM.System1.Agents.TelegramAgent, {:s4_response, correlation_id, response})
      Logger.debug("Sent S4 response to TelegramAgent for correlation_id: #{correlation_id}")
    catch
      :exit, {:noproc, _} ->
        Logger.warning("TelegramAgent not available, cannot send response")
      kind, reason ->
        Logger.error("Failed to send response to TelegramAgent: #{kind}: #{inspect(reason)}")
    end
  end

  def format_result(:ok) do
    %{"result" => "Acknowledged."}
  end

  def format_result({:ok, result}) when is_map(result) do
    # Check if we have a direct text result from LLM
    if Map.has_key?(result, "result") and is_binary(result["result"]) do
      %{"result" => result["result"]}
    else
      # Convert legacy result map to response format
      case Map.get(result, "type") do
        "vsm.s4.analysis_complete" ->
          analysis_type = Map.get(result, "analysis_type", "analysis")
          health_score = Map.get(result, "health_score", 0.0)
          recommendations = Map.get(result, "recommendations", [])

          response_text = """
          Analysis: #{analysis_type}
          Health Score: #{Float.round(health_score * 100, 1)}%
          Recommendations: #{Enum.join(recommendations, ", ")}
          """

          %{"result" => response_text}

        _type ->
          %{"result" => inspect(result)}
      end
    end
  end

  def format_result({:error, reason}) do
    %{"error" => "Processing failed: #{inspect(reason)}"}
  end

  def format_result(other), do: %{"result" => inspect(other)}
end
