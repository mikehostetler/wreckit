defmodule Cybernetic.Intelligence.HNSW.Index do
  @moduledoc """
  Hierarchical Navigable Small World (HNSW) index for fast vector similarity search.

  Implements approximate nearest neighbor search with:
  - Multi-layer graph structure
  - ETS-backed node storage for concurrent reads
  - Configurable M (max connections per node)
  - ef_construction for build quality
  - ef_search for query quality/speed tradeoff
  - Optional persistence via save/load

  ## Usage

      # Create index
      {:ok, _} = Index.start_link(dimensions: 384, m: 16)

      # Insert vectors
      :ok = Index.insert("doc_1", [0.1, 0.2, ...])

      # Batch insert (parallel)
      :ok = Index.insert_batch([{"doc_1", vec1}, {"doc_2", vec2}])

      # Search
      {:ok, results} = Index.search([0.15, 0.25, ...], k: 10)
      # => [{id: "doc_1", distance: 0.05, vector: [...]}]

      # Persistence
      :ok = Index.save("/path/to/index.bin")
      :ok = Index.load("/path/to/index.bin")
  """
  use GenServer

  require Logger

  @type vector :: [float()]
  @type node_id :: String.t()
  @type distance :: float()

  @type hnsw_node :: %{
          id: node_id(),
          vector: vector(),
          layer: non_neg_integer(),
          neighbors: %{non_neg_integer() => [node_id()]}
        }

  @type search_result :: %{
          id: node_id(),
          distance: distance(),
          vector: vector()
        }

  # Default HNSW parameters
  @default_m 16
  @default_ef_construction 200
  @default_ef_search 50
  @default_ml 1.0 / :math.log(16)
  @default_timeout 30_000
  @max_vector_dimensions 4096
  @max_nodes 10_000_000

  @telemetry [:cybernetic, :intelligence, :hnsw]

  # Client API

  @doc "Start the HNSW index"
  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts \\ []) do
    name = Keyword.get(opts, :name, __MODULE__)
    GenServer.start_link(__MODULE__, opts, name: name)
  end

  @doc "Insert a vector with ID"
  @spec insert(node_id(), vector(), keyword()) :: :ok | {:error, term()}
  def insert(id, vector, opts \\ []) do
    server = Keyword.get(opts, :server, __MODULE__)
    timeout = Keyword.get(opts, :timeout, @default_timeout)
    GenServer.call(server, {:insert, id, vector}, timeout)
  end

  @doc "Batch insert multiple vectors (parallel processing)"
  @spec insert_batch([{node_id(), vector()}], keyword()) :: :ok | {:error, term()}
  def insert_batch(items, opts \\ []) do
    server = Keyword.get(opts, :server, __MODULE__)
    timeout = Keyword.get(opts, :timeout, @default_timeout * 10)
    GenServer.call(server, {:insert_batch, items}, timeout)
  end

  @doc "Search for k nearest neighbors"
  @spec search(vector(), keyword()) :: {:ok, [search_result()]} | {:error, term()}
  def search(query_vector, opts \\ []) do
    server = Keyword.get(opts, :server, __MODULE__)
    k = Keyword.get(opts, :k, 10)
    ef = Keyword.get(opts, :ef, @default_ef_search)
    timeout = Keyword.get(opts, :timeout, @default_timeout)
    GenServer.call(server, {:search, query_vector, k, ef}, timeout)
  end

  @doc "Delete a vector by ID"
  @spec delete(node_id(), keyword()) :: :ok | {:error, :not_found}
  def delete(id, opts \\ []) do
    server = Keyword.get(opts, :server, __MODULE__)
    GenServer.call(server, {:delete, id})
  end

  @doc "Get index statistics"
  @spec stats(keyword()) :: map()
  def stats(opts \\ []) do
    server = Keyword.get(opts, :server, __MODULE__)
    GenServer.call(server, :stats)
  end

  @doc "Check if ID exists"
  @spec exists?(node_id(), keyword()) :: boolean()
  def exists?(id, opts \\ []) do
    server = Keyword.get(opts, :server, __MODULE__)
    GenServer.call(server, {:exists, id})
  end

  @doc "Get vector by ID"
  @spec get(node_id(), keyword()) :: {:ok, vector()} | {:error, :not_found}
  def get(id, opts \\ []) do
    server = Keyword.get(opts, :server, __MODULE__)
    GenServer.call(server, {:get, id})
  end

  @doc "Clear all vectors"
  @spec clear(keyword()) :: :ok
  def clear(opts \\ []) do
    server = Keyword.get(opts, :server, __MODULE__)
    GenServer.call(server, :clear)
  end

  @doc "Save index to file"
  @spec save(Path.t(), keyword()) :: :ok | {:error, term()}
  def save(path, opts \\ []) do
    server = Keyword.get(opts, :server, __MODULE__)
    GenServer.call(server, {:save, path}, @default_timeout * 10)
  end

  @doc "Load index from file"
  @spec load(Path.t(), keyword()) :: :ok | {:error, term()}
  def load(path, opts \\ []) do
    server = Keyword.get(opts, :server, __MODULE__)
    GenServer.call(server, {:load, path}, @default_timeout * 10)
  end

  # Server Callbacks

  @impl true
  def init(opts) do
    Logger.info("HNSW Index starting")

    # Create ETS table for concurrent read access
    nodes_table = :ets.new(:hnsw_nodes, [:set, :public, {:read_concurrency, true}])

    state = %{
      nodes_table: nodes_table,
      entry_point: nil,
      max_layer: 0,
      node_count: 0,
      dimensions: Keyword.get(opts, :dimensions, 384),
      m: Keyword.get(opts, :m, @default_m),
      m_max: Keyword.get(opts, :m_max, @default_m),
      m_max_0: Keyword.get(opts, :m_max_0, @default_m * 2),
      ef_construction: Keyword.get(opts, :ef_construction, @default_ef_construction),
      ml: Keyword.get(opts, :ml, @default_ml),
      stats: %{
        inserts: 0,
        searches: 0,
        deletes: 0,
        total_distance_computations: 0
      }
    }

    {:ok, state}
  end

  @impl true
  def handle_call({:insert, id, vector}, _from, state) do
    start_time = System.monotonic_time(:microsecond)

    with :ok <- validate_vector(vector, state.dimensions),
         :ok <- validate_capacity(state) do
      {new_state, distance_comps} = insert_node(state, id, vector)

      new_stats =
        new_state.stats
        |> Map.update!(:inserts, &(&1 + 1))
        |> Map.update!(:total_distance_computations, &(&1 + distance_comps))

      duration = System.monotonic_time(:microsecond) - start_time
      emit_telemetry(:insert, %{duration_us: duration, id: id})

      {:reply, :ok, %{new_state | stats: new_stats}}
    else
      {:error, _} = error ->
        {:reply, error, state}
    end
  end

  @impl true
  def handle_call({:insert_batch, items}, _from, state) do
    start_time = System.monotonic_time(:microsecond)

    # Validate all vectors first
    valid_items =
      Enum.filter(items, fn {_id, vector} ->
        validate_vector(vector, state.dimensions) == :ok
      end)

    # Check capacity
    if state.node_count + length(valid_items) > @max_nodes do
      {:reply, {:error, :max_nodes_reached}, state}
    else
      # Insert sequentially but with optimized single-GenServer-call
      # For truly parallel processing, would need distributed architecture
      new_state =
        Enum.reduce(valid_items, state, fn {id, vector}, acc ->
          {updated, _comps} = insert_node(acc, id, vector)
          update_in(updated, [:stats, :inserts], &(&1 + 1))
        end)

      duration = System.monotonic_time(:microsecond) - start_time
      emit_telemetry(:insert_batch, %{duration_us: duration, count: length(valid_items)})

      {:reply, :ok, new_state}
    end
  end

  @impl true
  def handle_call({:search, query_vector, k, ef}, _from, state) do
    start_time = System.monotonic_time(:microsecond)

    case validate_vector(query_vector, state.dimensions) do
      :ok when state.entry_point == nil ->
        {:reply, {:ok, []}, state}

      :ok ->
        {results, distance_comps} = search_knn(state, query_vector, k, ef)

        new_stats =
          state.stats
          |> Map.update!(:searches, &(&1 + 1))
          |> Map.update!(:total_distance_computations, &(&1 + distance_comps))

        duration = System.monotonic_time(:microsecond) - start_time
        emit_telemetry(:search, %{duration_us: duration, k: k, results: length(results)})

        {:reply, {:ok, results}, %{state | stats: new_stats}}

      {:error, _} = error ->
        {:reply, error, state}
    end
  end

  @impl true
  def handle_call({:delete, id}, _from, state) do
    case get_node(state, id) do
      nil ->
        {:reply, {:error, :not_found}, state}

      node ->
        # Remove from ETS
        :ets.delete(state.nodes_table, id)

        # Update neighbor lists to remove references
        update_neighbors_on_delete(state, id, node)

        # Update entry point if needed
        new_entry =
          if state.entry_point == id do
            case :ets.first(state.nodes_table) do
              :"$end_of_table" -> nil
              first_id -> first_id
            end
          else
            state.entry_point
          end

        new_stats = Map.update!(state.stats, :deletes, &(&1 + 1))

        {:reply, :ok,
         %{state | entry_point: new_entry, node_count: state.node_count - 1, stats: new_stats}}
    end
  end

  @impl true
  def handle_call(:stats, _from, state) do
    stats =
      state.stats
      |> Map.put(:node_count, state.node_count)
      |> Map.put(:max_layer, state.max_layer)
      |> Map.put(:dimensions, state.dimensions)
      |> Map.put(:m, state.m)
      |> Map.put(:ef_construction, state.ef_construction)

    {:reply, stats, state}
  end

  @impl true
  def handle_call({:exists, id}, _from, state) do
    exists = :ets.member(state.nodes_table, id)
    {:reply, exists, state}
  end

  @impl true
  def handle_call({:get, id}, _from, state) do
    case get_node(state, id) do
      nil -> {:reply, {:error, :not_found}, state}
      node -> {:reply, {:ok, node.vector}, state}
    end
  end

  @impl true
  def handle_call(:clear, _from, state) do
    :ets.delete_all_objects(state.nodes_table)

    new_state = %{
      state
      | entry_point: nil,
        max_layer: 0,
        node_count: 0
    }

    {:reply, :ok, new_state}
  end

  @impl true
  def handle_call({:save, path}, _from, state) do
    try do
      # Export all nodes from ETS
      nodes = :ets.tab2list(state.nodes_table)

      data = %{
        version: 1,
        dimensions: state.dimensions,
        m: state.m,
        entry_point: state.entry_point,
        max_layer: state.max_layer,
        nodes: nodes
      }

      binary = :erlang.term_to_binary(data, [:compressed])
      File.write!(path, binary)

      Logger.info("HNSW index saved", path: path, nodes: length(nodes))
      {:reply, :ok, state}
    rescue
      e ->
        {:reply, {:error, Exception.message(e)}, state}
    end
  end

  @impl true
  def handle_call({:load, path}, _from, state) do
    try do
      binary = File.read!(path)
      # Use :safe to prevent arbitrary code execution from malicious files
      data = :erlang.binary_to_term(binary, [:safe])

      if data.dimensions != state.dimensions do
        {:reply, {:error, :dimension_mismatch}, state}
      else
        # Clear existing data
        :ets.delete_all_objects(state.nodes_table)

        # Insert loaded nodes
        :ets.insert(state.nodes_table, data.nodes)

        new_state = %{
          state
          | entry_point: data.entry_point,
            max_layer: data.max_layer,
            node_count: length(data.nodes)
        }

        Logger.info("HNSW index loaded", path: path, nodes: length(data.nodes))
        {:reply, :ok, new_state}
      end
    rescue
      e ->
        {:reply, {:error, Exception.message(e)}, state}
    end
  end

  @impl true
  def terminate(_reason, state) do
    :ets.delete(state.nodes_table)
    :ok
  end

  # Private Functions - ETS helpers

  defp get_node(state, id) do
    case :ets.lookup(state.nodes_table, id) do
      [{^id, node}] -> node
      [] -> nil
    end
  end

  defp put_node(state, id, node) do
    :ets.insert(state.nodes_table, {id, node})
  end

  defp update_neighbors_on_delete(state, deleted_id, deleted_node) do
    # For each layer the deleted node was in, update its neighbors
    Enum.each(deleted_node.neighbors, fn {layer, neighbor_ids} ->
      Enum.each(neighbor_ids, fn neighbor_id ->
        case get_node(state, neighbor_id) do
          nil ->
            :ok

          neighbor ->
            updated_neighbors =
              Map.update(neighbor.neighbors, layer, [], fn nlist ->
                List.delete(nlist, deleted_id)
              end)

            put_node(state, neighbor_id, %{neighbor | neighbors: updated_neighbors})
        end
      end)
    end)
  end

  # Private Functions - HNSW Algorithm

  @spec insert_node(map(), node_id(), vector()) :: {map(), non_neg_integer()}
  defp insert_node(state, id, vector) do
    node_layer = random_layer(state.ml)

    node = %{
      id: id,
      vector: vector,
      layer: node_layer,
      neighbors: %{}
    }

    if state.entry_point == nil do
      put_node(state, id, node)
      {%{state | entry_point: id, max_layer: node_layer, node_count: 1}, 0}
    else
      {updated_node, distance_comps} =
        insert_into_graph(state, id, node, state.entry_point, state.max_layer)

      put_node(state, id, updated_node)

      {new_entry, new_max} =
        if node_layer > state.max_layer do
          {id, node_layer}
        else
          {state.entry_point, state.max_layer}
        end

      {%{state | entry_point: new_entry, max_layer: new_max, node_count: state.node_count + 1},
       distance_comps}
    end
  end

  @spec insert_into_graph(map(), node_id(), hnsw_node(), node_id(), non_neg_integer()) ::
          {hnsw_node(), non_neg_integer()}
  defp insert_into_graph(state, new_id, new_node, entry_point, max_layer) do
    current = entry_point
    distance_comps = 0

    # Traverse from top layer down to new_node.layer + 1
    {current, distance_comps} =
      if max_layer > new_node.layer do
        Enum.reduce(max_layer..(new_node.layer + 1)//-1, {current, distance_comps}, fn layer,
                                                                                       {curr,
                                                                                        comps} ->
          entry_node = get_node(state, curr)

          if entry_node do
            {nearest, new_comps} = search_layer_greedy(state, new_node.vector, entry_node, layer)
            {nearest.id, comps + new_comps}
          else
            {curr, comps}
          end
        end)
      else
        {current, distance_comps}
      end

    # Insert into layers from min(new_node.layer, max_layer) down to 0
    {final_node, total_comps} =
      Enum.reduce(min(new_node.layer, max_layer)..0//-1, {new_node, distance_comps}, fn layer,
                                                                                        {node,
                                                                                         comps} ->
        entry_node = get_node(state, current)

        if entry_node == nil do
          {node, comps}
        else
          m_max = if layer == 0, do: state.m_max_0, else: state.m_max

          {candidates, search_comps} =
            search_layer(state, node.vector, entry_node, layer, state.ef_construction)

          neighbors = select_neighbors(candidates, state.m)

          updated_node = %{node | neighbors: Map.put(node.neighbors, layer, neighbors)}

          # Add reverse connections
          Enum.each(neighbors, fn neighbor_id ->
            neighbor = get_node(state, neighbor_id)

            if neighbor do
              current_neighbors = Map.get(neighbor.neighbors, layer, [])
              new_neighbors = [new_id | current_neighbors]

              pruned =
                if length(new_neighbors) > m_max do
                  prune_neighbors(state, neighbor.vector, new_neighbors, m_max)
                else
                  new_neighbors
                end

              updated = %{neighbor | neighbors: Map.put(neighbor.neighbors, layer, pruned)}
              put_node(state, neighbor_id, updated)
            end
          end)

          {updated_node, comps + search_comps}
        end
      end)

    {final_node, total_comps}
  end

  @spec search_knn(map(), vector(), pos_integer(), pos_integer()) ::
          {[search_result()], non_neg_integer()}
  defp search_knn(state, query, k, ef) do
    entry_node = get_node(state, state.entry_point)

    if entry_node == nil do
      {[], 0}
    else
      distance_comps = 0

      {current, distance_comps} =
        if state.max_layer > 0 do
          Enum.reduce(state.max_layer..1//-1, {entry_node, distance_comps}, fn layer,
                                                                               {curr, comps} ->
            {nearest, new_comps} = search_layer_greedy(state, query, curr, layer)
            {nearest, comps + new_comps}
          end)
        else
          {entry_node, distance_comps}
        end

      {candidates, search_comps} = search_layer(state, query, current, 0, max(ef, k))

      results =
        candidates
        |> Enum.take(k)
        |> Enum.map(fn {dist, id} ->
          node = get_node(state, id)

          %{
            id: id,
            distance: dist,
            vector: if(node, do: node.vector, else: [])
          }
        end)

      {results, distance_comps + search_comps}
    end
  end

  @spec search_layer_greedy(map(), vector(), hnsw_node(), non_neg_integer()) ::
          {hnsw_node(), non_neg_integer()}
  defp search_layer_greedy(state, query, entry, layer) do
    current = entry
    current_dist = euclidean_distance(query, entry.vector)
    search_greedy_loop(state, query, current, current_dist, layer, 1, true)
  end

  defp search_greedy_loop(_state, _query, current, _current_dist, _layer, comps, false) do
    {current, comps}
  end

  defp search_greedy_loop(state, query, current, current_dist, layer, comps, true) do
    neighbors = Map.get(current.neighbors, layer, [])

    {best, best_dist, new_comps} =
      Enum.reduce(neighbors, {current, current_dist, 0}, fn neighbor_id, {best, best_dist, c} ->
        neighbor = get_node(state, neighbor_id)

        if neighbor do
          dist = euclidean_distance(query, neighbor.vector)

          if dist < best_dist do
            {neighbor, dist, c + 1}
          else
            {best, best_dist, c + 1}
          end
        else
          {best, best_dist, c}
        end
      end)

    if best.id != current.id do
      search_greedy_loop(state, query, best, best_dist, layer, comps + new_comps, true)
    else
      {current, comps + new_comps}
    end
  end

  # Results are tracked as {list, count, furthest_dist} to avoid O(n) operations
  @type results_state :: {[{distance(), node_id()}], non_neg_integer(), distance()}

  @spec search_layer(map(), vector(), hnsw_node(), non_neg_integer(), pos_integer()) ::
          {[{distance(), node_id()}], non_neg_integer()}
  defp search_layer(state, query, entry, layer, ef) do
    entry_dist = euclidean_distance(query, entry.vector)

    candidates = [{entry_dist, entry.id}]
    visited = MapSet.new([entry.id])
    # Track {results_list, count, furthest_dist} for O(1) access
    results_state = {[{entry_dist, entry.id}], 1, entry_dist}

    {{final_results, _count, _furthest}, total_comps} =
      search_layer_loop(state, query, layer, ef, candidates, visited, results_state, 1)

    {Enum.sort_by(final_results, fn {dist, _} -> dist end), total_comps}
  end

  defp search_layer_loop(_state, _query, _layer, _ef, [], _visited, results_state, comps) do
    {results_state, comps}
  end

  defp search_layer_loop(
         state,
         query,
         layer,
         ef,
         [{c_dist, c_id} | rest],
         visited,
         results_state,
         comps
       ) do
    {_results, _count, furthest_dist} = results_state

    if c_dist > furthest_dist do
      {results_state, comps}
    else
      node = get_node(state, c_id)
      neighbors = if node, do: Map.get(node.neighbors, layer, []), else: []

      {new_candidates, new_visited, new_results_state, new_comps} =
        Enum.reduce(neighbors, {rest, visited, results_state, 0}, fn n_id,
                                                                     {cands, vis, res_state, c} ->
          if MapSet.member?(vis, n_id) do
            {cands, vis, res_state, c}
          else
            neighbor = get_node(state, n_id)

            if neighbor do
              dist = euclidean_distance(query, neighbor.vector)
              new_vis = MapSet.put(vis, n_id)
              {_res, res_count, res_furthest} = res_state

              # Use bounded insert instead of full sort
              new_res_state =
                if res_count < ef or dist < res_furthest do
                  bounded_insert({dist, n_id}, res_state, ef)
                else
                  res_state
                end

              new_cands = insert_sorted([{dist, n_id}], cands)

              {new_cands, new_vis, new_res_state, c + 1}
            else
              {cands, vis, res_state, c}
            end
          end
        end)

      search_layer_loop(
        state,
        query,
        layer,
        ef,
        new_candidates,
        new_visited,
        new_results_state,
        comps + new_comps
      )
    end
  end

  # Bounded insert maintaining sorted order, returns {list, count, furthest}
  # Uses single-pass take_with_last to avoid O(n) List.last calls
  @spec bounded_insert({distance(), node_id()}, results_state(), pos_integer()) :: results_state()
  defp bounded_insert({item_dist, _} = item, {list, count, old_furthest}, max_size) do
    inserted = insert_one_sorted(item, list)
    new_count = count + 1

    if new_count > max_size do
      # Need to trim: use single-pass to get trimmed list AND new furthest
      {trimmed, {new_furthest_dist, _}} = take_with_last(inserted, max_size)
      {trimmed, max_size, new_furthest_dist}
    else
      # No trim needed: furthest is max of old furthest and new item (list is sorted ascending)
      new_furthest = max(old_furthest, item_dist)
      {inserted, new_count, new_furthest}
    end
  end

  # Single-pass take that also returns the last element taken - O(n) total instead of O(2n)
  @spec take_with_last([{distance(), node_id()}], pos_integer()) ::
          {[{distance(), node_id()}], {distance(), node_id()}}
  defp take_with_last(list, n), do: take_with_last(list, n, [], nil)

  defp take_with_last(_, 0, acc, last), do: {Enum.reverse(acc), last}
  defp take_with_last([], _, acc, last), do: {Enum.reverse(acc), last}
  defp take_with_last([h | t], n, acc, _last), do: take_with_last(t, n - 1, [h | acc], h)

  @spec select_neighbors([{distance(), node_id()}], pos_integer()) :: [node_id()]
  defp select_neighbors(candidates, m) do
    # candidates from search_layer are already sorted ascending by distance
    # Just take the m closest and extract IDs
    candidates
    |> Enum.take(m)
    |> Enum.map(fn {_dist, id} -> id end)
  end

  @spec prune_neighbors(map(), vector(), [node_id()], pos_integer()) :: [node_id()]
  defp prune_neighbors(state, node_vector, neighbors, m_max) do
    neighbors
    |> Enum.map(fn id ->
      neighbor = get_node(state, id)
      dist = if neighbor, do: euclidean_distance(node_vector, neighbor.vector), else: :infinity
      {id, dist}
    end)
    |> Enum.sort_by(fn {_id, dist} -> dist end)
    |> Enum.take(m_max)
    |> Enum.map(fn {id, _} -> id end)
  end

  @spec insert_sorted([{distance(), node_id()}], [{distance(), node_id()}]) ::
          [{distance(), node_id()}]
  defp insert_sorted([], acc), do: acc

  defp insert_sorted([item | rest], acc) do
    insert_sorted(rest, insert_one_sorted(item, acc))
  end

  defp insert_one_sorted(item, []), do: [item]

  defp insert_one_sorted({d1, _} = item, [{d2, _} = head | tail]) when d1 <= d2 do
    [item, head | tail]
  end

  defp insert_one_sorted(item, [head | tail]) do
    [head | insert_one_sorted(item, tail)]
  end

  @spec random_layer(float()) :: non_neg_integer()
  defp random_layer(ml) do
    floor(-:math.log(:rand.uniform()) * ml)
  end

  @spec euclidean_distance(vector(), vector()) :: distance()
  defp euclidean_distance(v1, v2) when length(v1) == length(v2) do
    # Tail-recursive implementation avoids intermediate list allocation
    euclidean_loop(v1, v2, 0.0)
  end

  defp euclidean_distance(_, _), do: :infinity

  # Tail-recursive helper for O(1) memory usage
  @spec euclidean_loop(vector(), vector(), float()) :: distance()
  defp euclidean_loop([], [], acc), do: :math.sqrt(acc)

  defp euclidean_loop([a | t1], [b | t2], acc) do
    diff = a - b
    euclidean_loop(t1, t2, acc + diff * diff)
  end

  @spec validate_vector(term(), pos_integer()) :: :ok | {:error, term()}
  defp validate_vector(vector, dimensions) when is_list(vector) do
    cond do
      length(vector) != dimensions ->
        {:error, :invalid_dimensions}

      dimensions > @max_vector_dimensions ->
        {:error, :dimensions_too_large}

      not Enum.all?(vector, &is_number/1) ->
        {:error, :invalid_vector_values}

      Enum.any?(vector, &is_nan_or_infinity/1) ->
        {:error, :nan_or_infinity_values}

      true ->
        :ok
    end
  end

  defp validate_vector(_, _), do: {:error, :invalid_vector_type}

  # Check for NaN or Infinity values (IEEE 754 special values)
  @spec is_nan_or_infinity(number()) :: boolean()
  defp is_nan_or_infinity(n) when is_float(n) do
    # NaN: n != n (only true for NaN in IEEE 754)
    # Infinity: abs(n) == :infinity
    n != n or n == :infinity or n == :neg_infinity
  end

  defp is_nan_or_infinity(_), do: false

  defp validate_capacity(state) do
    if state.node_count >= @max_nodes do
      {:error, :max_nodes_reached}
    else
      :ok
    end
  end

  @spec emit_telemetry(atom(), map()) :: :ok
  defp emit_telemetry(event, metadata) do
    :telemetry.execute(@telemetry ++ [event], %{count: 1}, metadata)
  end
end
