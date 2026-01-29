defmodule Cybernetic.Intelligence.CRDT.BeliefSet do
  @moduledoc """
  Delta-state CRDT for belief propagation across distributed nodes.

  Implements an OR-Set (Observed-Remove Set) with:
  - Add/remove operations with causal ordering
  - Delta propagation for efficient sync
  - Tombstone garbage collection
  - Conflict-free merging

  ## Usage

      # Create belief set for a node
      {:ok, _} = BeliefSet.start_link(node_id: "node_1")

      # Add a belief
      :ok = BeliefSet.add("user_preference", %{theme: "dark"})

      # Remove a belief
      :ok = BeliefSet.remove("user_preference")

      # Get current beliefs
      beliefs = BeliefSet.get_all()

      # Get delta since version
      {:ok, delta} = BeliefSet.get_delta(5)

      # Merge remote delta
      :ok = BeliefSet.merge_delta(remote_delta)
  """
  use GenServer

  require Logger

  alias Cybernetic.Intelligence.Utils

  @type belief_id :: String.t()
  @type version :: non_neg_integer()
  @type node_id :: String.t()

  @type belief_entry :: %{
          id: belief_id(),
          value: term(),
          added_by: node_id(),
          added_at: version(),
          added_timestamp: non_neg_integer(),
          tombstone: boolean(),
          removed_at: version() | nil,
          removed_timestamp: non_neg_integer() | nil
        }

  @type delta :: %{
          node_id: node_id(),
          from_version: version(),
          to_version: version(),
          entries: [belief_entry()],
          timestamp: DateTime.t()
        }

  @gc_interval :timer.minutes(5)
  @tombstone_ttl :timer.hours(24)
  @max_beliefs 100_000
  # 1MB per value
  @max_value_size 1024 * 1024

  @telemetry [:cybernetic, :intelligence, :crdt]

  # Client API

  @doc "Start the belief set server"
  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts \\ []) do
    name = Keyword.get(opts, :name, __MODULE__)
    GenServer.start_link(__MODULE__, opts, name: name)
  end

  @doc "Add a belief to the set"
  @spec add(belief_id(), term(), keyword()) :: :ok | {:error, term()}
  def add(id, value, opts \\ []) do
    server = Keyword.get(opts, :server, __MODULE__)
    GenServer.call(server, {:add, id, value})
  end

  @doc "Remove a belief from the set"
  @spec remove(belief_id(), keyword()) :: :ok | {:error, :not_found}
  def remove(id, opts \\ []) do
    server = Keyword.get(opts, :server, __MODULE__)
    GenServer.call(server, {:remove, id})
  end

  @doc "Get a specific belief"
  @spec get(belief_id(), keyword()) :: {:ok, term()} | {:error, :not_found}
  def get(id, opts \\ []) do
    server = Keyword.get(opts, :server, __MODULE__)
    GenServer.call(server, {:get, id})
  end

  @doc "Get all active beliefs"
  @spec get_all(keyword()) :: %{belief_id() => term()}
  def get_all(opts \\ []) do
    server = Keyword.get(opts, :server, __MODULE__)
    GenServer.call(server, :get_all)
  end

  @doc "Check if belief exists"
  @spec exists?(belief_id(), keyword()) :: boolean()
  def exists?(id, opts \\ []) do
    server = Keyword.get(opts, :server, __MODULE__)
    GenServer.call(server, {:exists, id})
  end

  @doc "Get delta since a version"
  @spec get_delta(version(), keyword()) :: {:ok, delta()}
  def get_delta(since_version, opts \\ []) do
    server = Keyword.get(opts, :server, __MODULE__)
    GenServer.call(server, {:get_delta, since_version})
  end

  @doc "Merge a remote delta"
  @spec merge_delta(delta(), keyword()) :: :ok
  def merge_delta(delta, opts \\ []) do
    server = Keyword.get(opts, :server, __MODULE__)
    GenServer.call(server, {:merge_delta, delta})
  end

  @doc "Get current version"
  @spec version(keyword()) :: version()
  def version(opts \\ []) do
    server = Keyword.get(opts, :server, __MODULE__)
    GenServer.call(server, :version)
  end

  @doc "Get statistics"
  @spec stats(keyword()) :: map()
  def stats(opts \\ []) do
    server = Keyword.get(opts, :server, __MODULE__)
    GenServer.call(server, :stats)
  end

  # Server Callbacks

  @impl true
  def init(opts) do
    node_id = Keyword.get(opts, :node_id, Utils.generate_node_id())

    Logger.info("BeliefSet CRDT starting", node_id: node_id)

    # ETS table for version index: {version, belief_id} ordered_set for efficient range queries
    version_index = :ets.new(:belief_version_index, [:ordered_set, :private])

    state = %{
      node_id: node_id,
      beliefs: %{},
      version: 0,
      version_clock: %{},
      version_index: version_index,
      max_beliefs: Keyword.get(opts, :max_beliefs, @max_beliefs),
      max_value_size: Keyword.get(opts, :max_value_size, @max_value_size),
      stats: %{
        adds: 0,
        removes: 0,
        merges: 0,
        conflicts_resolved: 0,
        gc_runs: 0,
        tombstones_collected: 0,
        rejected_size: 0
      }
    }

    schedule_gc()

    {:ok, state}
  end

  @impl true
  def handle_call({:add, id, value}, _from, state) do
    # Validate value size
    value_size = estimate_term_size(value)

    cond do
      value_size > state.max_value_size ->
        new_stats = Map.update!(state.stats, :rejected_size, &(&1 + 1))
        {:reply, {:error, :value_too_large}, %{state | stats: new_stats}}

      map_size(state.beliefs) >= state.max_beliefs and not Map.has_key?(state.beliefs, id) ->
        {:reply, {:error, :max_beliefs_reached}, state}

      true ->
        do_add(state, id, value)
    end
  end

  @impl true
  def handle_call({:remove, id}, _from, state) do
    case Map.get(state.beliefs, id) do
      nil ->
        {:reply, {:error, :not_found}, state}

      entry when entry.tombstone ->
        {:reply, {:error, :not_found}, state}

      entry ->
        new_version = state.version + 1
        now_ms = System.system_time(:millisecond)

        updated_entry = %{
          entry
          | tombstone: true,
            removed_at: new_version,
            removed_timestamp: now_ms
        }

        new_beliefs = Map.put(state.beliefs, id, updated_entry)
        new_clock = Map.put(state.version_clock, state.node_id, new_version)
        new_stats = Map.update!(state.stats, :removes, &(&1 + 1))

        # Add to version index for efficient get_delta
        :ets.insert(state.version_index, {new_version, id})

        Logger.debug("Belief removed", id: id, version: new_version)
        emit_telemetry(:remove, %{id: id, version: new_version})

        {:reply, :ok,
         %{
           state
           | beliefs: new_beliefs,
             version: new_version,
             version_clock: new_clock,
             stats: new_stats
         }}
    end
  end

  @impl true
  def handle_call({:get, id}, _from, state) do
    case Map.get(state.beliefs, id) do
      nil ->
        {:reply, {:error, :not_found}, state}

      entry when entry.tombstone ->
        {:reply, {:error, :not_found}, state}

      entry ->
        {:reply, {:ok, entry.value}, state}
    end
  end

  @impl true
  def handle_call(:get_all, _from, state) do
    active =
      state.beliefs
      |> Enum.reject(fn {_id, entry} -> entry.tombstone end)
      |> Enum.into(%{}, fn {id, entry} -> {id, entry.value} end)

    {:reply, active, state}
  end

  @impl true
  def handle_call({:exists, id}, _from, state) do
    exists =
      case Map.get(state.beliefs, id) do
        nil -> false
        entry -> not entry.tombstone
      end

    {:reply, exists, state}
  end

  @impl true
  def handle_call({:get_delta, since_version}, _from, state) do
    # Use version index for O(log n + k) lookup where k = number of entries changed
    # Instead of O(n) scan of all beliefs
    changed_ids = get_ids_since_version(state.version_index, since_version)

    entries =
      changed_ids
      # Dedupe: same ID may appear at multiple versions (add then remove)
      |> Enum.uniq()
      |> Enum.map(&Map.get(state.beliefs, &1))
      |> Enum.reject(&is_nil/1)

    delta = %{
      node_id: state.node_id,
      from_version: since_version,
      to_version: state.version,
      entries: entries,
      timestamp: DateTime.utc_now()
    }

    {:reply, {:ok, delta}, state}
  end

  @impl true
  def handle_call({:merge_delta, delta}, _from, state) do
    {new_beliefs, conflicts} =
      Enum.reduce(delta.entries, {state.beliefs, 0}, fn remote_entry, {beliefs, conflict_count} ->
        case Map.get(beliefs, remote_entry.id) do
          nil ->
            {Map.put(beliefs, remote_entry.id, remote_entry), conflict_count}

          local_entry ->
            {merged, had_conflict} = merge_entries(local_entry, remote_entry)
            new_count = if had_conflict, do: conflict_count + 1, else: conflict_count
            {Map.put(beliefs, remote_entry.id, merged), new_count}
        end
      end)

    new_clock =
      Map.update(state.version_clock, delta.node_id, delta.to_version, fn existing ->
        max(existing, delta.to_version)
      end)

    new_version = max(state.version, delta.to_version)

    new_stats =
      state.stats
      |> Map.update!(:merges, &(&1 + 1))
      |> Map.update!(:conflicts_resolved, &(&1 + conflicts))

    Logger.debug("Delta merged",
      from_node: delta.node_id,
      entries: length(delta.entries),
      conflicts: conflicts
    )

    emit_telemetry(:merge, %{
      from_node: delta.node_id,
      entries: length(delta.entries),
      conflicts: conflicts
    })

    {:reply, :ok,
     %{
       state
       | beliefs: new_beliefs,
         version: new_version,
         version_clock: new_clock,
         stats: new_stats
     }}
  end

  @impl true
  def handle_call(:version, _from, state) do
    {:reply, state.version, state}
  end

  @impl true
  def handle_call(:stats, _from, state) do
    stats =
      state.stats
      |> Map.put(:active_beliefs, count_active(state.beliefs))
      |> Map.put(:tombstones, count_tombstones(state.beliefs))
      |> Map.put(:version, state.version)
      |> Map.put(:node_id, state.node_id)

    {:reply, stats, state}
  end

  # Get belief IDs changed since a version using ETS ordered_set range query
  # O(log n + k) where k = number of entries since version
  @spec get_ids_since_version(:ets.tid(), version()) :: [belief_id()]
  defp get_ids_since_version(version_index, since_version) do
    # :ets.next(table, key) returns first key STRICTLY GREATER than key
    # So next(table, since_version) gives us the first key > since_version
    collect_ids_from(version_index, :ets.next(version_index, since_version), [])
  end

  # Tail-recursive collector: iterate through ordered_set keys
  @spec collect_ids_from(:ets.tid(), term(), [belief_id()]) :: [belief_id()]
  defp collect_ids_from(_table, :"$end_of_table", acc), do: Enum.reverse(acc)

  defp collect_ids_from(table, current_key, acc) do
    [{^current_key, id}] = :ets.lookup(table, current_key)
    collect_ids_from(table, :ets.next(table, current_key), [id | acc])
  end

  @impl true
  def handle_info(:gc, state) do
    now_ms = System.system_time(:millisecond)

    # Remove old tombstones based on actual timestamp
    {new_beliefs, removed_ids, removed_count} =
      Enum.reduce(state.beliefs, {%{}, [], 0}, fn {id, entry}, {acc, ids, count} ->
        if entry.tombstone and tombstone_age_ms(entry, now_ms) > @tombstone_ttl do
          {acc, [id | ids], count + 1}
        else
          {Map.put(acc, id, entry), ids, count}
        end
      end)

    # Clean up version_index entries for removed beliefs
    if removed_count > 0 do
      cleanup_version_index(state.version_index, removed_ids)
    end

    new_stats =
      if removed_count > 0 do
        Logger.debug("CRDT garbage collection", removed: removed_count)

        state.stats
        |> Map.update!(:gc_runs, &(&1 + 1))
        |> Map.update!(:tombstones_collected, &(&1 + removed_count))
      else
        Map.update!(state.stats, :gc_runs, &(&1 + 1))
      end

    schedule_gc()

    {:noreply, %{state | beliefs: new_beliefs, stats: new_stats}}
  end

  # Remove version_index entries for garbage-collected beliefs
  @spec cleanup_version_index(:ets.tid(), [belief_id()]) :: :ok
  defp cleanup_version_index(version_index, removed_ids) do
    removed_set = MapSet.new(removed_ids)

    # Scan version_index and delete entries for removed IDs
    :ets.foldl(
      fn {version, id}, acc ->
        if MapSet.member?(removed_set, id) do
          :ets.delete(version_index, version)
        end

        acc
      end,
      :ok,
      version_index
    )
  end

  @impl true
  def terminate(_reason, state) do
    # Clean up version index ETS table
    :ets.delete(state.version_index)
    :ok
  end

  # Private Functions

  defp do_add(state, id, value) do
    new_version = state.version + 1
    now_ms = System.system_time(:millisecond)

    entry = %{
      id: id,
      value: value,
      added_by: state.node_id,
      added_at: new_version,
      added_timestamp: now_ms,
      tombstone: false,
      removed_at: nil,
      removed_timestamp: nil
    }

    new_beliefs = Map.put(state.beliefs, id, entry)
    new_clock = Map.put(state.version_clock, state.node_id, new_version)
    new_stats = Map.update!(state.stats, :adds, &(&1 + 1))

    # Add to version index for efficient get_delta
    :ets.insert(state.version_index, {new_version, id})

    Logger.debug("Belief added", id: id, version: new_version)
    emit_telemetry(:add, %{id: id, version: new_version})

    {:reply, :ok,
     %{
       state
       | beliefs: new_beliefs,
         version: new_version,
         version_clock: new_clock,
         stats: new_stats
     }}
  end

  @spec merge_entries(belief_entry(), belief_entry()) :: {belief_entry(), boolean()}
  defp merge_entries(local, remote) do
    cond do
      # Both are tombstones - keep the one that was removed later
      local.tombstone and remote.tombstone ->
        if (remote.removed_at || 0) > (local.removed_at || 0) do
          {remote, true}
        else
          {local, true}
        end

      # Remote is tombstone, local is not
      remote.tombstone and not local.tombstone ->
        if (remote.removed_at || 0) > local.added_at do
          {remote, true}
        else
          {local, true}
        end

      # Local is tombstone, remote is not
      local.tombstone and not remote.tombstone ->
        if remote.added_at > (local.removed_at || 0) do
          {remote, true}
        else
          {local, true}
        end

      # Neither is tombstone - LWW
      remote.added_at > local.added_at ->
        {remote, true}

      remote.added_at == local.added_at ->
        # Tie-break by node_id (lexicographic)
        if remote.added_by > local.added_by do
          {remote, true}
        else
          {local, true}
        end

      true ->
        {local, false}
    end
  end

  @spec tombstone_age_ms(belief_entry(), non_neg_integer()) :: non_neg_integer()
  defp tombstone_age_ms(entry, now_ms) do
    # Compute actual age from timestamp
    case entry.removed_timestamp do
      nil -> 0
      removed_ts when is_integer(removed_ts) -> now_ms - removed_ts
    end
  end

  @spec estimate_term_size(term()) :: non_neg_integer()
  defp estimate_term_size(term) do
    :erlang.external_size(term)
  end

  @spec count_active(map()) :: non_neg_integer()
  defp count_active(beliefs) do
    Enum.count(beliefs, fn {_id, entry} -> not entry.tombstone end)
  end

  @spec count_tombstones(map()) :: non_neg_integer()
  defp count_tombstones(beliefs) do
    Enum.count(beliefs, fn {_id, entry} -> entry.tombstone end)
  end

  defp schedule_gc do
    Process.send_after(self(), :gc, @gc_interval)
  end

  @spec emit_telemetry(atom(), map()) :: :ok
  defp emit_telemetry(event, metadata) do
    :telemetry.execute(@telemetry ++ [event], %{count: 1}, metadata)
  end
end
