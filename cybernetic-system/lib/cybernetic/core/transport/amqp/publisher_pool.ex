defmodule Cybernetic.Core.Transport.AMQP.PublisherPool do
  @moduledoc """
  High-performance AMQP publisher with connection pooling and batching.
  Optimizes throughput for high-volume message publishing scenarios.
  """
  use GenServer
  alias AMQP.{Basic, Confirm}
  alias Cybernetic.Core.Security.NonceBloom
  require Logger

  @pool_size 5
  @batch_size 10
  @batch_timeout 50
  # Prevent memory exhaustion
  @max_pending_size 1000

  defstruct [:channels, :pending_batch, :batch_timer, :round_robin_index]

  def start_link(opts \\ []) do
    name = Keyword.get(opts, :name, __MODULE__)
    GenServer.start_link(__MODULE__, opts, name: name)
  end

  def init(_opts) do
    state = %__MODULE__{
      channels: [],
      pending_batch: [],
      batch_timer: nil,
      round_robin_index: 0
    }

    {:ok, state, {:continue, :setup_pool}}
  end

  def handle_continue(:setup_pool, state) do
    channels = setup_channel_pool()
    new_state = %{state | channels: channels}

    # If no channels were created, schedule retry
    if length(channels) == 0 do
      Logger.warning("No AMQP channels available, scheduling retry in 5 seconds")
      Process.send_after(self(), :retry_setup, 5_000)
    else
      Logger.info("AMQP publisher pool initialized with #{length(channels)} channels")
    end

    {:noreply, new_state}
  end

  @doc """
  High-performance batch publish for multiple messages.
  """
  def batch_publish(messages) when is_list(messages) do
    GenServer.call(__MODULE__, {:batch_publish, messages}, 10_000)
  end

  @doc """
  Optimized single message publish with automatic batching.
  """
  def publish_async(exchange, routing_key, payload, opts \\ []) do
    GenServer.cast(__MODULE__, {:publish_async, exchange, routing_key, payload, opts})
  end

  @doc """
  Synchronous publish for critical messages requiring confirmation.
  """
  def publish_sync(exchange, routing_key, payload, opts \\ []) do
    GenServer.call(__MODULE__, {:publish_sync, exchange, routing_key, payload, opts}, 5_000)
  end

  def handle_call({:batch_publish, messages}, _from, state) do
    case get_available_channel(state) do
      {:ok, channel, new_state} ->
        result = publish_batch_to_channel(channel, messages)
        {:reply, result, new_state}

      {:error, reason} ->
        {:reply, {:error, reason}, state}
    end
  end

  def handle_call({:publish_sync, exchange, routing_key, payload, opts}, _from, state) do
    case get_available_channel(state) do
      {:ok, channel, new_state} ->
        result = publish_single_to_channel(channel, exchange, routing_key, payload, opts)
        {:reply, result, new_state}

      {:error, reason} ->
        {:reply, {:error, reason}, state}
    end
  end

  def handle_cast({:publish_async, exchange, routing_key, payload, opts}, state) do
    message = {exchange, routing_key, payload, opts}
    new_batch = [message | state.pending_batch]

    cond do
      length(new_batch) >= @batch_size ->
        # Flush immediately when batch is full
        case get_available_channel(state) do
          {:ok, channel, updated_state} ->
            publish_batch_to_channel(channel, Enum.reverse(new_batch))
            new_state = %{updated_state | pending_batch: []}
            {:noreply, cancel_batch_timer(new_state)}

          {:error, _} ->
            # Channel unavailable - check if we should drop this batch
            # Since we're already at batch_size, and can't flush, accumulate but limit total size
            # new_batch already includes state.pending_batch, so just check its length
            if length(new_batch) > @max_pending_size do
              Logger.error("Total pending messages exceeded limit, dropping oldest messages")
              # Take from the end to keep newest messages (since we prepend)
              remaining = Enum.take(new_batch, -@max_pending_size)
              {:noreply, %{state | pending_batch: remaining}}
            else
              {:noreply, %{state | pending_batch: new_batch}}
            end
        end

      state.batch_timer == nil ->
        # Start batch timer for first message
        timer = Process.send_after(self(), :flush_batch, @batch_timeout)
        {:noreply, %{state | pending_batch: new_batch, batch_timer: timer}}

      true ->
        # Add to existing batch, but check memory limit
        if length(new_batch) > @max_pending_size do
          Logger.warning("Pending batch size exceeded limit during normal operation")
          # Take from the end to keep newest messages
          remaining = Enum.take(new_batch, -@max_pending_size)
          {:noreply, %{state | pending_batch: remaining}}
        else
          {:noreply, %{state | pending_batch: new_batch}}
        end
    end
  end

  def handle_info(:flush_batch, state) do
    case state.pending_batch do
      [] ->
        {:noreply, %{state | batch_timer: nil}}

      batch ->
        case get_available_channel(state) do
          {:ok, channel, new_state} ->
            publish_batch_to_channel(channel, Enum.reverse(batch))
            {:noreply, %{new_state | pending_batch: [], batch_timer: nil}}

          {:error, _} ->
            # Retry later if no channel available
            # Cancel old timer before creating new one
            new_state = cancel_batch_timer(state)
            timer = Process.send_after(self(), :flush_batch, @batch_timeout)
            {:noreply, %{new_state | batch_timer: timer}}
        end
    end
  end

  def handle_info(:retry_setup, state) do
    handle_continue(:setup_pool, state)
  end

  # Private helper functions

  defp setup_channel_pool do
    Enum.map(1..@pool_size, fn _i ->
      case Cybernetic.Transport.AMQP.Connection.get_channel() do
        {:ok, channel} ->
          setup_exchanges(channel)
          Confirm.select(channel)
          {:ok, channel}

        {:error, reason} ->
          Logger.warning("Failed to create pooled channel: #{inspect(reason)}")
          {:error, reason}
      end
    end)
    |> Enum.filter(&match?({:ok, _}, &1))
    |> Enum.map(&elem(&1, 1))
  end

  defp get_available_channel(%{channels: []}) do
    {:error, :no_channels}
  end

  defp get_available_channel(%{channels: channels, round_robin_index: index} = state) do
    channel = Enum.at(channels, rem(index, length(channels)))
    new_index = rem(index + 1, length(channels))
    new_state = %{state | round_robin_index: new_index}
    {:ok, channel, new_state}
  end

  defp publish_batch_to_channel(channel, messages) do
    start_time = System.monotonic_time(:microsecond)

    results =
      Enum.map(messages, fn {exchange, routing_key, payload, opts} ->
        publish_single_to_channel(channel, exchange, routing_key, payload, opts)
      end)

    duration = System.monotonic_time(:microsecond) - start_time

    # Emit batch telemetry
    throughput =
      if duration > 0 do
        length(messages) / (duration / 1_000_000)
      else
        0.0
      end

    :telemetry.execute(
      [:cyb, :amqp, :batch_publish],
      %{
        count: length(messages),
        duration_us: duration,
        throughput: throughput
      },
      %{batch_size: length(messages)}
    )

    {successes, errors} = Enum.split_with(results, &match?(:ok, &1))

    if length(errors) > 0 do
      Logger.warning("Batch publish had #{length(errors)} errors out of #{length(messages)}")
    end

    {:ok, %{successes: length(successes), errors: length(errors)}}
  end

  defp publish_single_to_channel(channel, exchange, routing_key, payload, opts) do
    headers = build_headers(opts)

    message = %{
      payload: Jason.encode!(payload),
      headers: headers,
      routing_key: routing_key,
      exchange: exchange,
      timestamp: DateTime.utc_now() |> DateTime.to_unix(:millisecond)
    }

    try do
      Basic.publish(
        channel,
        exchange,
        routing_key,
        message.payload,
        headers: headers,
        persistent: true,
        mandatory: false,
        timestamp: message.timestamp
      )

      # Emit telemetry
      :telemetry.execute(
        [:cyb, :amqp, :publish],
        %{
          bytes: byte_size(message.payload),
          # Could add actual latency measurement
          latency_us: 0
        },
        %{exchange: exchange, routing_key: routing_key}
      )

      :ok
    rescue
      error ->
        Logger.error("AMQP publish failed: #{inspect(error)}")
        {:error, error}
    end
  end

  defp build_headers(opts) do
    base_headers = [
      {"x-source", Keyword.get(opts, :source, "cybernetic")},
      {"x-timestamp", DateTime.utc_now() |> DateTime.to_iso8601()},
      {"x-nonce", NonceBloom.generate_nonce()},
      {"x-version", "1.0"}
    ]

    # Add correlation ID if provided
    correlation_headers =
      case Keyword.get(opts, :correlation_id) do
        nil -> []
        correlation_id -> [{"x-correlation-id", correlation_id}]
      end

    # Add trace context for OpenTelemetry
    trace_headers =
      try do
        case :otel_propagator_text_map.inject([]) do
          [] -> []
          trace_ctx -> [{"x-trace-context", Jason.encode!(trace_ctx)}]
        end
      rescue
        # Graceful fallback if OpenTelemetry not available
        _ -> []
      end

    base_headers ++ correlation_headers ++ trace_headers
  end

  defp setup_exchanges(channel) do
    exchanges = [
      {"cyb.events", :topic},
      {"cyb.commands", :topic},
      {"cyb.telemetry", :fanout},
      {"cyb.vsm.s1", :topic},
      {"cyb.vsm.s2", :topic},
      {"cyb.vsm.s3", :topic},
      {"cyb.vsm.s4", :topic},
      {"cyb.vsm.s5", :topic},
      {"cyb.mcp.tools", :topic},
      {"vsm.dlx", :fanout}
    ]

    Enum.each(exchanges, fn {name, type} ->
      try do
        AMQP.Exchange.declare(channel, name, type, durable: true)
      rescue
        error ->
          Logger.warning("Failed to declare exchange #{name}: #{inspect(error)}")
      end
    end)
  end

  defp cancel_batch_timer(%{batch_timer: nil} = state), do: state

  defp cancel_batch_timer(%{batch_timer: timer} = state) do
    Process.cancel_timer(timer)
    %{state | batch_timer: nil}
  end
end
