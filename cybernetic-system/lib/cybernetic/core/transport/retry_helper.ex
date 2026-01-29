defmodule Cybernetic.Core.Transport.RetryHelper do
  @moduledoc """
  Centralized retry logic with poison routing and telemetry.
  Ensures consistent retry behavior across all message processors.
  """
  require Logger

  @default_max_retries 5

  @doc """
  Wraps a function with retry logic and poison routing.

  ## Options
    * `:max_retries` - Maximum retry attempts (default: 5)
    * `:channel` - AMQP channel for republishing
    * `:exchange` - Exchange for retry messages
    * `:delay_base` - Base delay in ms for exponential backoff (default: 1000)
  """
  def with_retry(headers, payload, fun, opts \\ []) do
    retries = get_retry_count(headers)
    max_retries = Keyword.get(opts, :max_retries, @default_max_retries)

    cond do
      retries >= max_retries ->
        emit_poison(headers, payload, retries, max_retries)
        {:error, :poison}

      true ->
        start_time = System.monotonic_time(:nanosecond)

        case fun.() do
          :ok = result ->
            emit_success_telemetry(
              headers,
              System.monotonic_time(:nanosecond) - start_time,
              retries
            )

            result

          {:ok, _} = result ->
            emit_success_telemetry(
              headers,
              System.monotonic_time(:nanosecond) - start_time,
              retries
            )

            result

          {:error, reason} = error ->
            new_headers = increment_retry(headers)
            delay_ms = calculate_backoff(retries, Keyword.get(opts, :delay_base, 1000))

            if channel = Keyword.get(opts, :channel) do
              republish_for_retry(channel, new_headers, payload, delay_ms, opts)
            end

            emit_retry_telemetry(headers, reason, retries + 1, max_retries)
            error
        end
    end
  end

  @doc """
  Ensures trace headers are present for distributed tracing.
  """
  def ensure_trace(headers) do
    headers
    |> Map.put_new("_trace_id", generate_trace_id())
    |> Map.put("_span_id", generate_span_id())
    |> Map.put_new("_parent_span_id", Map.get(headers, "_span_id"))
  end

  @doc """
  Gets retry count from headers, handling various formats.
  """
  def get_retry_count(headers) when is_map(headers) do
    case Map.get(headers, "_retries") do
      nil ->
        0

      n when is_integer(n) ->
        n

      s when is_binary(s) ->
        case Integer.parse(s) do
          {n, _} -> n
          _ -> 0
        end

      _ ->
        0
    end
  end

  @doc """
  Increments retry counter in headers.
  """
  def increment_retry(headers) do
    current = get_retry_count(headers)
    Map.put(headers, "_retries", current + 1)
  end

  # Private functions

  defp emit_poison(headers, payload, retries, max_retries) do
    :telemetry.execute(
      [:cyb, :amqp, :poison],
      %{
        retries: retries,
        max_retries: max_retries,
        timestamp_ns: System.monotonic_time(:nanosecond)
      },
      %{
        trace_id: Map.get(headers, "_trace_id"),
        message_type: get_message_type(payload),
        routing_key: Map.get(headers, "_routing_key", "unknown")
      }
    )

    Logger.error("""
    Message poisoned after #{retries} retries (max: #{max_retries})
    TraceID: #{Map.get(headers, "_trace_id", "none")}
    Type: #{get_message_type(payload)}
    """)
  end

  defp emit_success_telemetry(headers, duration_ns, retries) do
    :telemetry.execute(
      [:cyb, :message, :processed],
      %{
        duration_ns: duration_ns,
        retries: retries
      },
      %{
        trace_id: Map.get(headers, "_trace_id"),
        span_id: Map.get(headers, "_span_id")
      }
    )
  end

  defp emit_retry_telemetry(headers, reason, attempt, max_retries) do
    :telemetry.execute(
      [:cyb, :amqp, :retry],
      %{
        attempt: attempt,
        max_retries: max_retries,
        timestamp_ns: System.monotonic_time(:nanosecond)
      },
      %{
        trace_id: Map.get(headers, "_trace_id"),
        reason: inspect(reason),
        remaining: max_retries - attempt
      }
    )
  end

  defp republish_for_retry(channel, headers, payload, delay_ms, opts) do
    exchange = Keyword.get(opts, :exchange, "cyb.events")
    routing_key = "retry.#{delay_ms}"

    payload_json =
      case payload do
        bin when is_binary(bin) -> bin
        map when is_map(map) -> Jason.encode!(map)
        other -> Jason.encode!(%{payload: other})
      end

    AMQP.Basic.publish(
      channel,
      exchange,
      routing_key,
      payload_json,
      headers: amqp_headers(headers),
      expiration: to_string(delay_ms)
    )
  end

  defp calculate_backoff(retries, base_ms) do
    # Exponential backoff with jitter
    # Cap at 60 seconds
    max_delay = min(base_ms * :math.pow(2, retries), 60_000)
    jitter = :rand.uniform(round(max_delay * 0.1))
    round(max_delay + jitter)
  end

  defp generate_trace_id do
    Base.encode16(:crypto.strong_rand_bytes(8), case: :lower)
  end

  defp generate_span_id do
    Base.encode16(:crypto.strong_rand_bytes(8), case: :lower)
  end

  defp get_message_type(payload) when is_map(payload) do
    Map.get(payload, "type", Map.get(payload, :type, "unknown"))
  end

  defp get_message_type(_), do: "unknown"

  defp amqp_headers(headers) do
    Enum.map(headers, fn
      {"_retries", v} -> {"_retries", :signedint, v}
      {"_max_retries", v} -> {"_max_retries", :signedint, v}
      {k, v} when is_binary(v) -> {k, :longstr, v}
      {k, v} when is_integer(v) -> {k, :signedint, v}
      {k, v} -> {k, :longstr, to_string(v)}
    end)
  end
end
