defmodule Cybernetic.Core.CRDT.Cache do
  @moduledoc """
  High-performance caching layer for CRDT operations.
  Provides LRU caching with TTL for frequently accessed semantic triples
  and query results to reduce CRDT computation overhead.

  NOTE: Current implementation uses lists for access_order tracking which
  results in O(n) operations for cache hits/updates. For high-frequency
  scenarios (>10k ops/sec), consider upgrading to a more efficient LRU
  implementation using ordered_set ETS tables.
  """
  use GenServer
  require Logger

  @default_max_size 10_000
  # 5 minutes
  @default_ttl_ms 300_000
  # 1 minute
  @cleanup_interval 60_000

  defstruct [:max_size, :ttl_ms, :cache, :access_order, :cleanup_timer]

  def start_link(opts \\ []) do
    name = Keyword.get(opts, :name, __MODULE__)
    GenServer.start_link(__MODULE__, opts, name: name)
  end

  def init(opts) do
    max_size = Keyword.get(opts, :max_size, @default_max_size)
    ttl_ms = Keyword.get(opts, :ttl_ms, @default_ttl_ms)

    state = %__MODULE__{
      max_size: max_size,
      ttl_ms: ttl_ms,
      cache: %{},
      access_order: [],
      cleanup_timer: schedule_cleanup()
    }

    Logger.info("CRDT Cache initialized: max_size=#{max_size}, ttl_ms=#{ttl_ms}")
    {:ok, state}
  end

  @doc """
  Get cached result for a query. Returns {:ok, result} if found, :miss if not.
  """
  def get(query_key) do
    GenServer.call(__MODULE__, {:get, query_key})
  end

  @doc """
  Cache a query result with automatic LRU eviction.
  """
  def put(query_key, result) do
    GenServer.cast(__MODULE__, {:put, query_key, result})
  end

  @doc """
  Cache a triple lookup result for fast access.
  """
  def put_triple(subject, predicate, object, meta \\ %{}) do
    key = triple_key(subject, predicate, object)
    GenServer.cast(__MODULE__, {:put, key, {subject, predicate, object, meta}})
  end

  @doc """
  Get cached triple if available.
  """
  def get_triple(subject, predicate, object) do
    key = triple_key(subject, predicate, object)
    GenServer.call(__MODULE__, {:get, key})
  end

  @doc """
  Invalidate cache entries matching a pattern.
  """
  def invalidate_pattern(pattern) do
    GenServer.cast(__MODULE__, {:invalidate_pattern, pattern})
  end

  @doc """
  Get cache statistics for monitoring.
  """
  def stats do
    GenServer.call(__MODULE__, :stats)
  end

  @doc """
  Clear all cache entries.
  """
  def clear do
    GenServer.cast(__MODULE__, :clear)
  end

  # GenServer callbacks

  def handle_call({:get, key}, _from, state) do
    now = System.monotonic_time(:millisecond)

    case Map.get(state.cache, key) do
      nil ->
        # Cache miss
        :telemetry.execute([:cyb, :crdt_cache, :miss], %{count: 1}, %{key_type: key_type(key)})
        {:reply, :miss, state}

      {value, timestamp} ->
        if expired?(timestamp, now, state.ttl_ms) do
          # Expired entry
          new_cache = Map.delete(state.cache, key)
          new_access_order = List.delete(state.access_order, key)
          new_state = %{state | cache: new_cache, access_order: new_access_order}

          :telemetry.execute([:cyb, :crdt_cache, :miss], %{count: 1}, %{
            key_type: key_type(key),
            reason: :expired
          })

          {:reply, :miss, new_state}
        else
          # Cache hit - update access order
          new_access_order = [key | List.delete(state.access_order, key)]
          new_state = %{state | access_order: new_access_order}

          :telemetry.execute([:cyb, :crdt_cache, :hit], %{count: 1}, %{key_type: key_type(key)})
          {:reply, {:ok, value}, new_state}
        end
    end
  end

  def handle_call(:stats, _from, state) do
    now = System.monotonic_time(:millisecond)

    {active_entries, expired_entries} =
      Enum.reduce(state.cache, {0, 0}, fn {_key, {_value, timestamp}}, {active, expired} ->
        if expired?(timestamp, now, state.ttl_ms) do
          {active, expired + 1}
        else
          {active + 1, expired}
        end
      end)

    stats = %{
      total_entries: active_entries + expired_entries,
      active_entries: active_entries,
      expired_entries: expired_entries,
      max_size: state.max_size,
      ttl_ms: state.ttl_ms,
      # Rough estimate without expensive calculation
      cache_size_bytes: map_size(state.cache) * 64,
      hits: Map.get(state, :hits, 0),
      misses: Map.get(state, :misses, 0)
    }

    {:reply, stats, state}
  end

  def handle_cast({:put, key, value}, state) do
    now = System.monotonic_time(:millisecond)

    # Add/update entry
    new_cache = Map.put(state.cache, key, {value, now})
    new_access_order = [key | List.delete(state.access_order, key)]

    # Check if we need to evict entries
    state_after_put = %{state | cache: new_cache, access_order: new_access_order}
    final_state = maybe_evict_lru(state_after_put)

    :telemetry.execute([:cyb, :crdt_cache, :put], %{count: 1}, %{key_type: key_type(key)})
    {:noreply, final_state}
  end

  def handle_cast({:invalidate_pattern, pattern}, state) do
    # Remove entries matching pattern
    keys_to_remove =
      Enum.filter(Map.keys(state.cache), fn key ->
        match_pattern?(key, pattern)
      end)

    new_cache =
      Enum.reduce(keys_to_remove, state.cache, fn key, cache ->
        Map.delete(cache, key)
      end)

    new_access_order =
      Enum.reduce(keys_to_remove, state.access_order, fn key, access_order ->
        List.delete(access_order, key)
      end)

    new_state = %{state | cache: new_cache, access_order: new_access_order}

    Logger.debug(
      "Invalidated #{length(keys_to_remove)} cache entries matching pattern: #{inspect(pattern)}"
    )

    {:noreply, new_state}
  end

  def handle_cast(:clear, state) do
    new_state = %{state | cache: %{}, access_order: []}
    Logger.info("CRDT Cache cleared")
    {:noreply, new_state}
  end

  def handle_info(:cleanup_expired, state) do
    new_state = cleanup_expired_entries(state)
    new_timer = schedule_cleanup()
    {:noreply, %{new_state | cleanup_timer: new_timer}}
  end

  # Private helper functions

  defp triple_key(subject, predicate, object) do
    {:triple, subject, predicate, object}
  end

  defp key_type({:triple, _s, _p, _o}), do: :triple
  defp key_type({:query, _criteria}), do: :query
  defp key_type(_), do: :other

  defp expired?(timestamp, now, ttl_ms) do
    now - timestamp > ttl_ms
  end

  defp maybe_evict_lru(%{cache: cache, access_order: access_order, max_size: max_size} = state) do
    if map_size(cache) > max_size do
      # Evict least recently used entries
      excess_count = map_size(cache) - max_size
      {keys_to_evict, remaining_order} = Enum.split(Enum.reverse(access_order), excess_count)

      new_cache =
        Enum.reduce(keys_to_evict, cache, fn key, acc_cache ->
          Map.delete(acc_cache, key)
        end)

      :telemetry.execute([:cyb, :crdt_cache, :eviction], %{count: excess_count}, %{reason: :lru})
      Logger.debug("Evicted #{excess_count} LRU cache entries")

      %{state | cache: new_cache, access_order: Enum.reverse(remaining_order)}
    else
      state
    end
  end

  defp cleanup_expired_entries(state) do
    now = System.monotonic_time(:millisecond)

    {new_cache, expired_keys} =
      Enum.reduce(state.cache, {%{}, []}, fn {key, {value, timestamp}},
                                             {acc_cache, acc_expired} ->
        if expired?(timestamp, now, state.ttl_ms) do
          {acc_cache, [key | acc_expired]}
        else
          {Map.put(acc_cache, key, {value, timestamp}), acc_expired}
        end
      end)

    new_access_order =
      Enum.reduce(expired_keys, state.access_order, fn key, access_order ->
        List.delete(access_order, key)
      end)

    if length(expired_keys) > 0 do
      :telemetry.execute([:cyb, :crdt_cache, :eviction], %{count: length(expired_keys)}, %{
        reason: :ttl
      })

      Logger.debug("Cleaned up #{length(expired_keys)} expired cache entries")
    end

    %{state | cache: new_cache, access_order: new_access_order}
  end

  defp match_pattern?(key, pattern) do
    # Simple pattern matching - could be enhanced with more sophisticated patterns
    case {key, pattern} do
      {{:triple, subject, _p, _o}, {:subject, subject}} -> true
      {{:triple, _s, predicate, _o}, {:predicate, predicate}} -> true
      {{:triple, _s, _p, object}, {:object, object}} -> true
      {{:query, _criteria}, :all_queries} -> true
      _ -> false
    end
  end

  defp schedule_cleanup do
    Process.send_after(self(), :cleanup_expired, @cleanup_interval)
  end
end
