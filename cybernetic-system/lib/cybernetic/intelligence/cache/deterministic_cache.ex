defmodule Cybernetic.Intelligence.Cache.DeterministicCache do
  @moduledoc """
  Content-addressable cache with Bloom filter for fast existence checks.

  Features:
  - Content-addressable storage (SHA256 hash keys)
  - Bloom filter for O(1) membership testing (~1% false positive rate)
  - TTL-based expiration
  - O(1) LRU eviction via ETS ordered_set
  - Telemetry instrumentation

  ## Usage

      # Store content
      {:ok, key} = DeterministicCache.put(content)

      # Fast existence check (may have false positives)
      true = DeterministicCache.probably_exists?(key)

      # Definitive get
      {:ok, content} = DeterministicCache.get(key)

      # Get with metadata
      {:ok, entry} = DeterministicCache.get_entry(key)
  """
  use GenServer

  require Logger

  @type cache_key :: String.t()
  @type cache_entry :: %{
          key: cache_key(),
          content: binary(),
          content_type: String.t(),
          size: non_neg_integer(),
          hash: binary(),
          created_at: DateTime.t(),
          accessed_at: DateTime.t(),
          access_counter: non_neg_integer(),
          ttl: non_neg_integer(),
          hits: non_neg_integer()
        }

  # Bloom filter parameters for ~1% false positive rate at 100k items
  # m = -n*ln(p) / (ln(2)^2) ≈ 958,506 bits for n=100k, p=0.01
  # k = m/n * ln(2) ≈ 7 hash functions
  @bloom_size 1_000_000
  @bloom_hash_count 7

  @default_ttl :timer.hours(24)
  @default_max_size 10_000
  # 100MB
  @default_max_memory 100 * 1024 * 1024
  # 10MB per item
  @default_max_content_size 10 * 1024 * 1024

  @telemetry [:cybernetic, :intelligence, :cache]

  # Client API

  @doc "Start the deterministic cache"
  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts \\ []) do
    name = Keyword.get(opts, :name, __MODULE__)
    GenServer.start_link(__MODULE__, opts, name: name)
  end

  @doc "Store content and return its content-addressable key"
  @spec put(binary(), keyword()) :: {:ok, cache_key()} | {:error, term()}
  def put(content, opts \\ []) do
    server = Keyword.get(opts, :server, __MODULE__)
    ttl = Keyword.get(opts, :ttl, @default_ttl)
    content_type = Keyword.get(opts, :content_type, "application/octet-stream")

    GenServer.call(server, {:put, content, content_type, ttl})
  end

  @doc """
  Get content by key.

  Uses ETS read bypass for non-expired entries to avoid GenServer bottleneck.
  Falls back to GenServer for LRU update on valid entries.
  """
  @spec get(cache_key(), keyword()) :: {:ok, binary()} | {:error, :not_found}
  def get(key, opts \\ []) do
    server = Keyword.get(opts, :server, __MODULE__)

    # Always go through GenServer to maintain consistent LRU ordering
    # The ETS table provides read concurrency for stats/exists checks
    GenServer.call(server, {:get, key})
  end

  # ETS table name derived from server name (public for init)
  @spec cache_table_name(atom()) :: atom()
  def cache_table_name(server) do
    :"#{server}_data"
  end

  @doc "Get full entry with metadata"
  @spec get_entry(cache_key(), keyword()) :: {:ok, cache_entry()} | {:error, :not_found}
  def get_entry(key, opts \\ []) do
    server = Keyword.get(opts, :server, __MODULE__)
    GenServer.call(server, {:get_entry, key})
  end

  @doc "Fast existence check using Bloom filter (may have false positives)"
  @spec probably_exists?(cache_key(), keyword()) :: boolean()
  def probably_exists?(key, opts \\ []) do
    server = Keyword.get(opts, :server, __MODULE__)
    GenServer.call(server, {:probably_exists, key})
  end

  @doc "Definitive existence check"
  @spec exists?(cache_key(), keyword()) :: boolean()
  def exists?(key, opts \\ []) do
    server = Keyword.get(opts, :server, __MODULE__)
    GenServer.call(server, {:exists, key})
  end

  @doc "Delete entry by key"
  @spec delete(cache_key(), keyword()) :: :ok
  def delete(key, opts \\ []) do
    server = Keyword.get(opts, :server, __MODULE__)
    GenServer.call(server, {:delete, key})
  end

  @doc "Clear all entries (note: Bloom filter reset creates brief FP spike)"
  @spec clear(keyword()) :: :ok
  def clear(opts \\ []) do
    server = Keyword.get(opts, :server, __MODULE__)
    GenServer.call(server, :clear)
  end

  @doc "Get cache statistics"
  @spec stats(keyword()) :: map()
  def stats(opts \\ []) do
    server = Keyword.get(opts, :server, __MODULE__)
    GenServer.call(server, :stats)
  end

  # Server Callbacks

  @impl true
  def init(opts) do
    Logger.info("Deterministic Cache starting")

    name = Keyword.get(opts, :name, __MODULE__)

    # Create public ETS table for cache data (read bypass)
    data_table =
      :ets.new(cache_table_name(name), [:set, :public, :named_table, {:read_concurrency, true}])

    # Create private ETS table for O(1) LRU tracking: {access_counter, key}
    lru_table = :ets.new(:cache_lru, [:ordered_set, :private])

    state = %{
      name: name,
      data_table: data_table,
      bloom: :atomics.new(@bloom_size, signed: false),
      # Track Bloom filter resets
      bloom_generation: 0,
      lru_table: lru_table,
      # Monotonic counter for LRU ordering
      access_counter: 0,
      max_size: Keyword.get(opts, :max_size, @default_max_size),
      max_memory: Keyword.get(opts, :max_memory, @default_max_memory),
      max_content_size: Keyword.get(opts, :max_content_size, @default_max_content_size),
      current_memory: 0,
      stats: %{
        hits: 0,
        misses: 0,
        bloom_false_positives: 0,
        evictions: 0,
        puts: 0,
        rejected_size: 0
      }
    }

    # Schedule periodic cleanup
    schedule_cleanup()

    {:ok, state}
  end

  @impl true
  def handle_call({:put, content, content_type, ttl}, _from, state) do
    content_size = byte_size(content)

    # Validate content size
    if content_size > state.max_content_size do
      new_stats = Map.update!(state.stats, :rejected_size, &(&1 + 1))
      {:reply, {:error, :content_too_large}, %{state | stats: new_stats}}
    else
      do_put(content, content_type, ttl, content_size, state)
    end
  end

  @impl true
  def handle_call({:get, key}, _from, state) do
    start_time = System.monotonic_time(:millisecond)

    case :ets.lookup(state.data_table, key) do
      [] ->
        new_stats = Map.update!(state.stats, :misses, &(&1 + 1))
        emit_telemetry(:get, start_time, %{status: :miss, key: key})
        {:reply, {:error, :not_found}, %{state | stats: new_stats}}

      [{^key, entry}] ->
        if expired?(entry) do
          new_state = remove_entry(state, key)
          emit_telemetry(:get, start_time, %{status: :expired, key: key})
          {:reply, {:error, :not_found}, new_state}
        else
          {new_state, _new_counter} = update_access_time(state, key, entry)
          # Update entry in ETS
          updated_entry = :ets.lookup_element(state.data_table, key, 2)
          :ets.insert(state.data_table, {key, %{updated_entry | hits: updated_entry.hits + 1}})
          new_state = Map.update!(new_state, :stats, &Map.update!(&1, :hits, fn h -> h + 1 end))

          emit_telemetry(:get, start_time, %{status: :hit, key: key})
          {:reply, {:ok, entry.content}, new_state}
        end
    end
  end

  @impl true
  def handle_call({:get_entry, key}, _from, state) do
    case :ets.lookup(state.data_table, key) do
      [] ->
        {:reply, {:error, :not_found}, state}

      [{^key, entry}] ->
        if expired?(entry) do
          new_state = remove_entry(state, key)
          {:reply, {:error, :not_found}, new_state}
        else
          {new_state, _} = update_access_time(state, key, entry)
          {:reply, {:ok, entry}, new_state}
        end
    end
  end

  @impl true
  def handle_call({:probably_exists, key}, _from, state) do
    result = bloom_contains?(state.bloom, key, state.bloom_generation)

    # Track false positives for stats
    new_state =
      if result and :ets.lookup(state.data_table, key) == [] do
        update_in(state, [:stats, :bloom_false_positives], &(&1 + 1))
      else
        state
      end

    {:reply, result, new_state}
  end

  @impl true
  def handle_call({:exists, key}, _from, state) do
    case :ets.lookup(state.data_table, key) do
      [] ->
        {:reply, false, state}

      [{^key, entry}] ->
        if expired?(entry) do
          new_state = remove_entry(state, key)
          {:reply, false, new_state}
        else
          {:reply, true, state}
        end
    end
  end

  @impl true
  def handle_call({:delete, key}, _from, state) do
    new_state = remove_entry(state, key)
    {:reply, :ok, new_state}
  end

  @impl true
  def handle_call(:clear, _from, state) do
    # Clear ETS data table
    :ets.delete_all_objects(state.data_table)

    # Clear ETS LRU table
    :ets.delete_all_objects(state.lru_table)

    # Increment Bloom generation to invalidate old entries
    new_generation = state.bloom_generation + 1

    new_state = %{
      state
      | bloom: :atomics.new(@bloom_size, signed: false),
        bloom_generation: new_generation,
        access_counter: 0,
        current_memory: 0
    }

    Logger.debug("Cache cleared, Bloom generation: #{new_generation}")
    {:reply, :ok, new_state}
  end

  @impl true
  def handle_call(:stats, _from, state) do
    entry_count = :ets.info(state.data_table, :size)

    stats =
      state.stats
      |> Map.put(:entries, entry_count)
      |> Map.put(:memory_bytes, state.current_memory)
      |> Map.put(:hit_rate, calculate_hit_rate(state.stats))
      |> Map.put(:bloom_fp_rate, calculate_bloom_fp_rate(state.stats))
      |> Map.put(:bloom_generation, state.bloom_generation)

    {:reply, stats, state}
  end

  @impl true
  def handle_info(:cleanup, state) do
    now = DateTime.utc_now()

    # Find and remove expired entries from ETS
    expired_keys =
      :ets.tab2list(state.data_table)
      |> Enum.filter(fn {_key, entry} -> expired?(entry, now) end)
      |> Enum.map(fn {key, _entry} -> key end)

    new_state =
      Enum.reduce(expired_keys, state, fn key, acc ->
        remove_entry(acc, key)
      end)

    if length(expired_keys) > 0 do
      Logger.debug("Cache cleanup removed #{length(expired_keys)} expired entries")
    end

    schedule_cleanup()

    {:noreply, new_state}
  end

  @impl true
  def terminate(_reason, state) do
    # Clean up ETS tables
    :ets.delete(state.data_table)
    :ets.delete(state.lru_table)
    :ok
  end

  # Private Functions

  defp do_put(content, content_type, ttl, size, state) do
    start_time = System.monotonic_time(:millisecond)

    # Generate content-addressable key
    hash = :crypto.hash(:sha256, content)
    key = Base.encode16(hash, case: :lower)

    # Check if already exists in ETS
    case :ets.lookup(state.data_table, key) do
      [{^key, entry}] ->
        # Update access time for LRU
        {new_state, _} = update_access_time(state, key, entry)
        emit_telemetry(:put, start_time, %{status: :exists, key: key})
        {:reply, {:ok, key}, new_state}

      [] ->
        now = DateTime.utc_now()
        new_counter = state.access_counter + 1

        entry = %{
          key: key,
          content: content,
          content_type: content_type,
          size: size,
          hash: hash,
          created_at: now,
          accessed_at: now,
          access_counter: new_counter,
          ttl: ttl,
          hits: 0
        }

        # Add to bloom filter with generation
        add_to_bloom(state.bloom, key, state.bloom_generation)

        # Evict if needed
        state_after_eviction = maybe_evict(state, size)

        # Add to LRU table (O(log n) insert into ordered_set)
        :ets.insert(state_after_eviction.lru_table, {new_counter, key})

        # Add to data table (public ETS for read bypass)
        :ets.insert(state_after_eviction.data_table, {key, entry})

        new_state = %{
          state_after_eviction
          | access_counter: new_counter,
            current_memory: state_after_eviction.current_memory + size,
            stats: Map.update!(state_after_eviction.stats, :puts, &(&1 + 1))
        }

        emit_telemetry(:put, start_time, %{status: :created, key: key, size: size})
        {:reply, {:ok, key}, new_state}
    end
  end

  @spec add_to_bloom(:atomics.atomics_ref(), cache_key(), non_neg_integer()) :: :ok
  defp add_to_bloom(bloom, key, generation) do
    # Include generation in hash to invalidate on clear
    key_with_gen = "#{generation}:#{key}"

    for i <- 0..(@bloom_hash_count - 1) do
      index = bloom_hash(key_with_gen, i)
      :atomics.put(bloom, index + 1, 1)
    end

    :ok
  end

  @spec bloom_contains?(:atomics.atomics_ref(), cache_key(), non_neg_integer()) :: boolean()
  defp bloom_contains?(bloom, key, generation) do
    key_with_gen = "#{generation}:#{key}"

    Enum.all?(0..(@bloom_hash_count - 1), fn i ->
      index = bloom_hash(key_with_gen, i)
      :atomics.get(bloom, index + 1) == 1
    end)
  end

  @spec bloom_hash(String.t(), non_neg_integer()) :: non_neg_integer()
  defp bloom_hash(key, seed) do
    hash = :crypto.hash(:sha256, "#{seed}:#{key}")
    <<num::unsigned-integer-size(64), _::binary>> = hash
    rem(num, @bloom_size)
  end

  @spec maybe_evict(map(), non_neg_integer()) :: map()
  defp maybe_evict(state, new_size) do
    entry_count = :ets.info(state.data_table, :size)

    cond do
      # Evict by count
      entry_count >= state.max_size ->
        evict_lru(state)

      # Evict by memory
      state.current_memory + new_size > state.max_memory ->
        evict_until_fits(state, new_size)

      true ->
        state
    end
  end

  @spec evict_lru(map()) :: map()
  defp evict_lru(state) do
    # O(1) get oldest from ordered_set
    case :ets.first(state.lru_table) do
      :"$end_of_table" ->
        state

      oldest_counter ->
        [{^oldest_counter, oldest_key}] = :ets.lookup(state.lru_table, oldest_counter)

        state
        |> remove_entry(oldest_key)
        |> update_in([:stats, :evictions], &(&1 + 1))
    end
  end

  @spec evict_until_fits(map(), non_neg_integer()) :: map()
  defp evict_until_fits(state, new_size) do
    if state.current_memory + new_size <= state.max_memory do
      state
    else
      case :ets.first(state.lru_table) do
        :"$end_of_table" ->
          state

        oldest_counter ->
          [{^oldest_counter, oldest_key}] = :ets.lookup(state.lru_table, oldest_counter)

          new_state =
            state
            |> remove_entry(oldest_key)
            |> update_in([:stats, :evictions], &(&1 + 1))

          evict_until_fits(new_state, new_size)
      end
    end
  end

  @spec remove_entry(map(), cache_key()) :: map()
  defp remove_entry(state, key) do
    case :ets.lookup(state.data_table, key) do
      [] ->
        state

      [{^key, entry}] ->
        # Remove from LRU table
        :ets.match_delete(state.lru_table, {entry.access_counter, key})

        # Remove from data table
        :ets.delete(state.data_table, key)

        %{
          state
          | current_memory: max(0, state.current_memory - entry.size)
        }
    end
  end

  @spec update_access_time(map(), cache_key(), cache_entry()) :: {map(), non_neg_integer()}
  defp update_access_time(state, key, entry) do
    now = DateTime.utc_now()
    new_counter = state.access_counter + 1

    # Remove old LRU entry
    :ets.match_delete(state.lru_table, {entry.access_counter, key})

    # Insert new LRU entry with updated counter
    :ets.insert(state.lru_table, {new_counter, key})

    updated_entry = %{entry | accessed_at: now, access_counter: new_counter}

    # Update in data table
    :ets.insert(state.data_table, {key, updated_entry})

    new_state = %{
      state
      | access_counter: new_counter
    }

    {new_state, new_counter}
  end

  @spec expired?(cache_entry(), DateTime.t()) :: boolean()
  defp expired?(entry, now \\ DateTime.utc_now()) do
    expires_at = DateTime.add(entry.created_at, entry.ttl, :millisecond)
    DateTime.compare(now, expires_at) == :gt
  end

  @spec calculate_hit_rate(map()) :: float()
  defp calculate_hit_rate(%{hits: hits, misses: misses}) when hits + misses > 0 do
    Float.round(hits / (hits + misses) * 100, 2)
  end

  defp calculate_hit_rate(_), do: 0.0

  @spec calculate_bloom_fp_rate(map()) :: float()
  defp calculate_bloom_fp_rate(%{bloom_false_positives: fp, misses: misses}) when misses > 0 do
    Float.round(fp / misses * 100, 2)
  end

  defp calculate_bloom_fp_rate(_), do: 0.0

  defp schedule_cleanup do
    Process.send_after(self(), :cleanup, :timer.minutes(5))
  end

  @spec emit_telemetry(atom(), integer(), map()) :: :ok
  defp emit_telemetry(operation, start_time, metadata) do
    duration = System.monotonic_time(:millisecond) - start_time

    :telemetry.execute(
      @telemetry ++ [operation],
      %{duration: duration},
      metadata
    )
  end
end
