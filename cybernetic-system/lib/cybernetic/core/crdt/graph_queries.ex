defmodule Cybernetic.Core.CRDT.GraphQueries do
  @moduledoc """
  CRDT graph query validator and executor.
  Provides distributed graph queries with eventual consistency guarantees.
  """

  alias Cybernetic.Core.CRDT.Graph
  require Logger

  @max_depth 10

  defmodule Query do
    @type t :: %__MODULE__{
            id: String.t(),
            type: atom(),
            params: map(),
            context: map(),
            timestamp: DateTime.t()
          }

    defstruct [:id, :type, :params, context: %{}, timestamp: nil]
  end

  defmodule Result do
    @type t :: %__MODULE__{
            query_id: String.t(),
            success: boolean(),
            data: any(),
            metadata: map(),
            errors: list(String.t())
          }

    defstruct [:query_id, success: true, data: nil, metadata: %{}, errors: []]
  end

  # Public API

  @doc """
  Execute a graph query with validation.
  """
  def execute(query_type, params, opts \\ []) do
    query = %Query{
      id: generate_query_id(),
      type: query_type,
      params: params,
      context: Keyword.get(opts, :context, %{}),
      timestamp: DateTime.utc_now()
    }

    with {:ok, validated_query} <- validate_query(query),
         {:ok, result} <- run_query(validated_query) do
      emit_telemetry(query, result)
      {:ok, result}
    else
      {:error, reason} = error ->
        Logger.error("Query failed: #{inspect(reason)}")
        emit_telemetry(query, %Result{query_id: query.id, success: false, errors: [reason]})
        error
    end
  end

  @doc """
  Validate a query without executing it.
  """
  def validate(query_type, params) do
    query = %Query{
      id: "validation_only",
      type: query_type,
      params: params,
      timestamp: DateTime.utc_now()
    }

    validate_query(query)
  end

  @doc """
  List available query types.
  """
  def list_query_types do
    [
      :find_node,
      :find_edge,
      :traverse,
      :shortest_path,
      :subgraph,
      :neighbors,
      :ancestors,
      :descendants,
      :connected_components,
      :centrality,
      :clustering,
      :pattern_match
    ]
  end

  # Query Implementations

  defp run_query(%Query{type: :find_node} = query) do
    node_id = query.params[:id] || query.params["id"]

    case Graph.get_node(node_id) do
      {:ok, node} ->
        {:ok,
         %Result{
           query_id: query.id,
           data: node,
           metadata: %{found: true, timestamp: DateTime.utc_now()}
         }}

      {:error, :not_found} ->
        {:ok,
         %Result{
           query_id: query.id,
           success: false,
           errors: ["Node not found: #{node_id}"]
         }}
    end
  end

  defp run_query(%Query{type: :find_edge} = query) do
    from_id = query.params[:from] || query.params["from"]
    to_id = query.params[:to] || query.params["to"]

    case Graph.get_edge(from_id, to_id) do
      {:ok, edge} ->
        {:ok,
         %Result{
           query_id: query.id,
           data: edge,
           metadata: %{found: true, timestamp: DateTime.utc_now()}
         }}

      {:error, :not_found} ->
        {:ok,
         %Result{
           query_id: query.id,
           success: false,
           errors: ["Edge not found: #{from_id} -> #{to_id}"]
         }}
    end
  end

  defp run_query(%Query{type: :traverse} = query) do
    start_id = query.params[:start] || query.params["start"]
    direction = query.params[:direction] || query.params["direction"] || :outgoing
    max_depth = min(query.params[:max_depth] || @max_depth, @max_depth)
    filter = query.params[:filter]

    result = traverse_graph(start_id, direction, max_depth, filter)

    {:ok,
     %Result{
       query_id: query.id,
       data: result,
       metadata: %{
         nodes_visited: length(result),
         max_depth: max_depth,
         direction: direction
       }
     }}
  end

  defp run_query(%Query{type: :shortest_path} = query) do
    from_id = query.params[:from] || query.params["from"]
    to_id = query.params[:to] || query.params["to"]

    case find_shortest_path(from_id, to_id) do
      {:ok, path} ->
        {:ok,
         %Result{
           query_id: query.id,
           data: path,
           metadata: %{
             path_length: length(path),
             found: true
           }
         }}

      {:error, :no_path} ->
        {:ok,
         %Result{
           query_id: query.id,
           success: false,
           errors: ["No path found from #{from_id} to #{to_id}"]
         }}
    end
  end

  defp run_query(%Query{type: :subgraph} = query) do
    node_ids = query.params[:nodes] || query.params["nodes"] || []
    include_edges = query.params[:include_edges] || true

    nodes =
      Enum.map(node_ids, fn id ->
        case Graph.get_node(id) do
          {:ok, node} -> node
          _ -> nil
        end
      end)
      |> Enum.filter(&(&1 != nil))

    edges =
      if include_edges do
        get_edges_between_nodes(node_ids)
      else
        []
      end

    {:ok,
     %Result{
       query_id: query.id,
       data: %{nodes: nodes, edges: edges},
       metadata: %{
         node_count: length(nodes),
         edge_count: length(edges)
       }
     }}
  end

  defp run_query(%Query{type: :neighbors} = query) do
    node_id = query.params[:node] || query.params["node"]
    direction = query.params[:direction] || :both

    neighbors =
      case direction do
        :incoming -> Graph.get_incoming_neighbors(node_id)
        :outgoing -> Graph.get_outgoing_neighbors(node_id)
        :both -> Graph.get_all_neighbors(node_id)
      end

    {:ok,
     %Result{
       query_id: query.id,
       data: neighbors,
       metadata: %{
         count: length(neighbors),
         direction: direction
       }
     }}
  end

  defp run_query(%Query{type: :pattern_match} = query) do
    pattern = query.params[:pattern] || query.params["pattern"]

    matches = find_pattern_matches(pattern)

    {:ok,
     %Result{
       query_id: query.id,
       data: matches,
       metadata: %{
         matches_found: length(matches),
         pattern: pattern
       }
     }}
  end

  defp run_query(%Query{type: :connected_components} = query) do
    components = find_connected_components()

    {:ok,
     %Result{
       query_id: query.id,
       data: components,
       metadata: %{
         component_count: length(components),
         largest_component: components |> Enum.map(&length/1) |> Enum.max(fn -> 0 end)
       }
     }}
  end

  defp run_query(%Query{type: type}) do
    {:error, "Unsupported query type: #{type}"}
  end

  # Query Validation

  defp validate_query(%Query{type: type} = query) when type in [:find_node, :neighbors] do
    if query.params[:id] || query.params[:node] || query.params["id"] || query.params["node"] do
      {:ok, query}
    else
      {:error, "Missing required parameter: id or node"}
    end
  end

  defp validate_query(%Query{type: type} = query) when type in [:find_edge, :shortest_path] do
    from = query.params[:from] || query.params["from"]
    to = query.params[:to] || query.params["to"]

    if from && to do
      {:ok, query}
    else
      {:error, "Missing required parameters: from and to"}
    end
  end

  defp validate_query(%Query{type: :traverse} = query) do
    if query.params[:start] || query.params["start"] do
      {:ok, query}
    else
      {:error, "Missing required parameter: start"}
    end
  end

  defp validate_query(%Query{type: :subgraph} = query) do
    if query.params[:nodes] || query.params["nodes"] do
      {:ok, query}
    else
      {:error, "Missing required parameter: nodes"}
    end
  end

  defp validate_query(%Query{type: :pattern_match} = query) do
    if query.params[:pattern] || query.params["pattern"] do
      {:ok, query}
    else
      {:error, "Missing required parameter: pattern"}
    end
  end

  defp validate_query(%Query{type: :connected_components} = query) do
    {:ok, query}
  end

  defp validate_query(%Query{type: type} = query) do
    if type in list_query_types() do
      {:ok, query}
    else
      {:error, "Unknown query type: #{type}"}
    end
  end

  # Graph Algorithms

  defp traverse_graph(start_id, direction, max_depth, filter) do
    # BFS traversal with depth limit
    traverse_bfs([{start_id, 0}], MapSet.new(), [], direction, max_depth, filter)
  end

  defp traverse_bfs([], _visited, result, _direction, _max_depth, _filter) do
    Enum.reverse(result)
  end

  defp traverse_bfs([{node_id, depth} | queue], visited, result, direction, max_depth, filter) do
    if MapSet.member?(visited, node_id) or depth > max_depth do
      traverse_bfs(queue, visited, result, direction, max_depth, filter)
    else
      case Graph.get_node(node_id) do
        {:ok, node} ->
          if apply_filter(node, filter) do
            new_visited = MapSet.put(visited, node_id)
            new_result = [node | result]

            neighbors =
              case direction do
                :incoming -> Graph.get_incoming_neighbors(node_id)
                :outgoing -> Graph.get_outgoing_neighbors(node_id)
                :both -> Graph.get_all_neighbors(node_id)
              end

            new_queue = queue ++ Enum.map(neighbors, &{&1, depth + 1})
            traverse_bfs(new_queue, new_visited, new_result, direction, max_depth, filter)
          else
            traverse_bfs(queue, visited, result, direction, max_depth, filter)
          end

        _ ->
          traverse_bfs(queue, visited, result, direction, max_depth, filter)
      end
    end
  end

  defp find_shortest_path(from_id, to_id) do
    # Dijkstra's algorithm
    case dijkstra(from_id, to_id, %{from_id => 0}, MapSet.new(), %{}) do
      {:ok, path} -> {:ok, path}
      _ -> {:error, :no_path}
    end
  end

  defp dijkstra(current, target, distances, visited, predecessors) do
    if current == target do
      {:ok, reconstruct_path(predecessors, target)}
    else
      if MapSet.member?(visited, current) do
        {:error, :no_path}
      else
        new_visited = MapSet.put(visited, current)
        current_distance = Map.get(distances, current, :infinity)

        neighbors = Graph.get_outgoing_neighbors(current)

        {new_distances, new_predecessors} =
          update_distances(
            neighbors,
            current,
            current_distance,
            distances,
            predecessors
          )

        case get_next_node(new_distances, new_visited) do
          nil -> {:error, :no_path}
          next -> dijkstra(next, target, new_distances, new_visited, new_predecessors)
        end
      end
    end
  end

  defp update_distances([], _current, _current_dist, distances, predecessors) do
    {distances, predecessors}
  end

  defp update_distances([neighbor | rest], current, current_dist, distances, predecessors) do
    new_dist = if current_dist == :infinity, do: :infinity, else: current_dist + 1
    old_dist = Map.get(distances, neighbor, :infinity)

    {updated_distances, updated_predecessors} =
      if new_dist != :infinity and (old_dist == :infinity or new_dist < old_dist) do
        {
          Map.put(distances, neighbor, new_dist),
          Map.put(predecessors, neighbor, current)
        }
      else
        {distances, predecessors}
      end

    update_distances(rest, current, current_dist, updated_distances, updated_predecessors)
  end

  defp get_next_node(distances, visited) do
    distances
    |> Enum.reject(fn {node, _} -> MapSet.member?(visited, node) end)
    |> Enum.min_by(fn {_, dist} -> if dist == :infinity, do: :infinity, else: dist end, fn ->
      nil
    end)
    |> case do
      {node, dist} when dist != :infinity -> node
      _ -> nil
    end
  end

  defp reconstruct_path(predecessors, target) do
    reconstruct_path(predecessors, target, [target])
  end

  defp reconstruct_path(predecessors, current, path) do
    case Map.get(predecessors, current) do
      nil -> path
      predecessor -> reconstruct_path(predecessors, predecessor, [predecessor | path])
    end
  end

  defp get_edges_between_nodes(node_ids) do
    node_set = MapSet.new(node_ids)

    Enum.flat_map(node_ids, fn from_id ->
      Graph.get_outgoing_edges(from_id)
      |> Enum.filter(fn edge -> MapSet.member?(node_set, edge.to) end)
    end)
  end

  defp find_pattern_matches(pattern) do
    # Simple pattern matching - could be extended with more complex patterns
    Graph.get_all_nodes()
    |> Enum.filter(fn node ->
      match_pattern(node, pattern)
    end)
  end

  defp match_pattern(node, pattern) when is_map(pattern) do
    Enum.all?(pattern, fn {key, value} ->
      Map.get(node, key) == value
    end)
  end

  defp match_pattern(_, _), do: false

  defp find_connected_components do
    all_nodes = Graph.get_all_nodes()
    find_components(all_nodes, [], MapSet.new())
  end

  defp find_components([], components, _visited) do
    components
  end

  defp find_components([node | rest], components, visited) do
    if MapSet.member?(visited, node.id) do
      find_components(rest, components, visited)
    else
      {component, new_visited} = explore_component(node.id, visited)
      find_components(rest, [component | components], new_visited)
    end
  end

  defp explore_component(start_id, visited) do
    explore_bfs([start_id], visited, [])
  end

  defp explore_bfs([], visited, component) do
    {component, visited}
  end

  defp explore_bfs([node_id | queue], visited, component) do
    if MapSet.member?(visited, node_id) do
      explore_bfs(queue, visited, component)
    else
      new_visited = MapSet.put(visited, node_id)
      neighbors = Graph.get_all_neighbors(node_id)
      new_queue = queue ++ neighbors
      explore_bfs(new_queue, new_visited, [node_id | component])
    end
  end

  defp apply_filter(_, nil), do: true

  defp apply_filter(node, filter) when is_function(filter, 1) do
    filter.(node)
  end

  defp apply_filter(node, filter) when is_map(filter) do
    match_pattern(node, filter)
  end

  defp apply_filter(_, _), do: true

  # Helpers

  defp generate_query_id do
    "query_#{System.unique_integer([:positive, :monotonic])}_#{:rand.uniform(999_999)}"
  end

  defp emit_telemetry(query, result) do
    :telemetry.execute(
      [:crdt, :query, if(result.success, do: :success, else: :failure)],
      %{
        # Would need actual timing
        duration: 0,
        result_size: calculate_result_size(result)
      },
      %{
        query_id: query.id,
        query_type: query.type,
        success: result.success
      }
    )
  end

  defp calculate_result_size(%Result{data: data}) when is_list(data) do
    length(data)
  end

  defp calculate_result_size(%Result{data: %{nodes: nodes, edges: edges}}) do
    length(nodes) + length(edges)
  end

  defp calculate_result_size(_), do: 1
end
