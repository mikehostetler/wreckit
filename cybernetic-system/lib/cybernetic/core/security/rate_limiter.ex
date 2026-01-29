defmodule Cybernetic.Core.Security.RateLimiter do
  @moduledoc """
  Token bucket rate limiter for request throttling.
  Prevents system overload and abuse.
  """
  use GenServer
  require Logger

  @default_bucket_size 100
  # tokens per second
  @default_refill_rate 10
  # 1 minute
  @cleanup_interval 60_000

  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  def init(opts) do
    bucket_size = Keyword.get(opts, :bucket_size, @default_bucket_size)
    refill_rate = Keyword.get(opts, :refill_rate, @default_refill_rate)

    # Schedule periodic cleanup
    Process.send_after(self(), :cleanup, @cleanup_interval)

    {:ok,
     %{
       buckets: %{},
       bucket_size: bucket_size,
       refill_rate: refill_rate
     }}
  end

  @doc """
  Check if a request is allowed for the given key.
  Returns {:ok, remaining_tokens} or {:error, :rate_limited}
  """
  @spec check(term(), pos_integer()) :: {:ok, non_neg_integer()} | {:error, :rate_limited}
  def check(key, tokens \\ 1) do
    start_time = System.monotonic_time(:nanosecond)
    result = GenServer.call(__MODULE__, {:check, key, tokens})
    elapsed_ns = System.monotonic_time(:nanosecond) - start_time

    # Emit golden telemetry
    {allow, tokens_remaining} =
      case result do
        {:ok, remaining} -> {true, remaining}
        {:error, :rate_limited} -> {false, 0}
      end

    :telemetry.execute(
      [:cyb, :ratelimiter, :decision],
      %{ns: elapsed_ns, tokens: tokens_remaining},
      %{allow: allow, key: to_string(key)}
    )

    result
  end

  @doc """
  Consume tokens if available.
  Returns {:ok, remaining} or {:error, :rate_limited}
  """
  @spec consume(term(), pos_integer()) :: {:ok, non_neg_integer()} | {:error, :rate_limited}
  def consume(key, tokens \\ 1) do
    start_time = System.monotonic_time(:nanosecond)
    result = GenServer.call(__MODULE__, {:consume, key, tokens})
    elapsed_ns = System.monotonic_time(:nanosecond) - start_time

    # Emit golden telemetry
    {allow, tokens_remaining} =
      case result do
        {:ok, remaining} -> {true, remaining}
        {:error, :rate_limited} -> {false, 0}
      end

    :telemetry.execute(
      [:cyb, :ratelimiter, :decision],
      %{ns: elapsed_ns, tokens: tokens_remaining},
      %{allow: allow, key: to_string(key)}
    )

    result
  end

  @doc """
  Get current bucket state for a key
  """
  @spec get_bucket(term()) :: map()
  def get_bucket(key) do
    GenServer.call(__MODULE__, {:get_bucket, key})
  end

  @doc """
  Reset a bucket to full capacity
  """
  @spec reset(term()) :: :ok
  def reset(key) do
    GenServer.cast(__MODULE__, {:reset, key})
  end

  # Server callbacks

  def handle_call({:check, key, tokens}, _from, state) do
    bucket = get_or_create_bucket(key, state)
    refilled = refill_bucket(bucket, state)

    if refilled.tokens >= tokens do
      {:reply, {:ok, refilled.tokens}, state}
    else
      {:reply, {:error, :rate_limited}, state}
    end
  end

  def handle_call({:consume, key, tokens}, _from, state) do
    bucket = get_or_create_bucket(key, state)
    refilled = refill_bucket(bucket, state)

    if refilled.tokens >= tokens do
      new_bucket = %{refilled | tokens: refilled.tokens - tokens}
      new_state = put_in(state.buckets[key], new_bucket)

      :telemetry.execute(
        [:cybernetic, :s3, :rate_limiter, :allow],
        %{cost: tokens, tokens_remaining: new_bucket.tokens},
        %{key: key}
      )

      {:reply, {:ok, new_bucket.tokens}, new_state}
    else
      # Update last_refill even on failure
      new_state = put_in(state.buckets[key], refilled)

      :telemetry.execute(
        [:cybernetic, :s3, :rate_limiter, :deny],
        %{cost: tokens, tokens_available: refilled.tokens},
        %{key: key}
      )

      {:reply, {:error, :rate_limited}, new_state}
    end
  end

  def handle_call({:get_bucket, key}, _from, state) do
    bucket = get_or_create_bucket(key, state)
    refilled = refill_bucket(bucket, state)
    {:reply, refilled, put_in(state.buckets[key], refilled)}
  end

  def handle_cast({:reset, key}, state) do
    bucket = %{
      tokens: state.bucket_size,
      last_refill: System.monotonic_time(:millisecond)
    }

    {:noreply, put_in(state.buckets[key], bucket)}
  end

  def handle_info(:cleanup, state) do
    # Remove inactive buckets (no activity for 5 minutes)
    now = System.monotonic_time(:millisecond)
    five_minutes = 5 * 60 * 1000

    active_buckets =
      Enum.filter(state.buckets, fn {_key, bucket} ->
        now - bucket.last_refill < five_minutes
      end)
      |> Enum.into(%{})

    removed = map_size(state.buckets) - map_size(active_buckets)

    if removed > 0 do
      Logger.debug("Rate limiter cleaned up #{removed} inactive buckets")
    end

    # Schedule next cleanup
    Process.send_after(self(), :cleanup, @cleanup_interval)

    {:noreply, %{state | buckets: active_buckets}}
  end

  # Private functions

  defp get_or_create_bucket(key, state) do
    Map.get(state.buckets, key, %{
      tokens: state.bucket_size,
      last_refill: System.monotonic_time(:millisecond)
    })
  end

  defp refill_bucket(bucket, state) do
    now = System.monotonic_time(:millisecond)
    elapsed = now - bucket.last_refill

    # Calculate tokens to add based on elapsed time
    tokens_to_add = div(elapsed * state.refill_rate, 1000)
    new_tokens = min(bucket.tokens + tokens_to_add, state.bucket_size)

    %{bucket | tokens: new_tokens, last_refill: now}
  end
end
