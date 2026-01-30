defmodule Cybernetic.Integrations.OhMyOpencode.ContextGraph do
  @moduledoc """
  Shared context graph between Cybernetic and oh-my-opencode.

  Maintains a knowledge graph that both platforms can read from and write to,
  enabling shared understanding of:
  - Codebase structure and relationships
  - User preferences and history
  - Active tasks and their dependencies
  - Learned patterns and optimizations

  ## Graph Structure

  The graph consists of nodes and edges stored in a CRDT-based structure
  for conflict-free replication between platforms.

  ### Node Types
  - `:file` - Source code file
  - `:function` - Function/method definition
  - `:type` - Type/class definition
  - `:task` - Active task/objective
  - `:preference` - User preference
  - `:pattern` - Learned pattern
  - `:context` - Contextual information

  ### Edge Types
  - `:imports` - File imports another
  - `:calls` - Function calls another
  - `:defines` - File defines type/function
  - `:depends_on` - Task dependency
  - `:relates_to` - General relationship
  - `:similar_to` - Semantic similarity

  ## Usage

      # Add a node
      ContextGraph.add_node(tenant_id, "file:src/main.ex", %{
        type: :file,
        path: "src/main.ex",
        language: "elixir"
      })

      # Add an edge
      ContextGraph.add_edge(tenant_id, "file:src/main.ex", "file:src/helper.ex", :imports)

      # Query related nodes
      {:ok, related} = ContextGraph.get_related(tenant_id, "file:src/main.ex", depth: 2)

      # Search by pattern
      {:ok, matches} = ContextGraph.search(tenant_id, type: :function, name: ~r/handle_/)
  """

  use GenServer
  require Logger

  # Note: We use simple maps instead of BeliefSet GenServer for simplicity

  @pubsub Cybernetic.PubSub
  @graph_topic "context_graph"

  # Maximum nodes per tenant
  @max_nodes 10_000
  # Maximum edges per node
  @max_edges_per_node 100

  @node_types ~w(file function type task preference pattern context entity)a
  @edge_types ~w(imports calls defines depends_on relates_to similar_to contains references)a

  defstruct [
    :tenant_id,
    :nodes,
    :edges,
    :belief_set,
    :indexes,
    :stats
  ]

  # Public API

  @doc """
  Start the context graph for a tenant.
  """
  def start_link(opts \\ []) do
    tenant_id = Keyword.fetch!(opts, :tenant_id)
    name = Keyword.get(opts, :name, via_tuple(tenant_id))
    GenServer.start_link(__MODULE__, opts, name: name)
  end

  @doc """
  Add a node to the graph.

  Attributes must include `:type` which should be one of: #{inspect(@node_types)}
  """
  def add_node(tenant_id, node_id, attrs) when is_binary(node_id) and is_map(attrs) do
    GenServer.call(via_tuple(tenant_id), {:add_node, node_id, attrs})
  end

  @doc """
  Update a node's attributes.
  """
  def update_node(tenant_id, node_id, attrs) when is_binary(node_id) and is_map(attrs) do
    GenServer.call(via_tuple(tenant_id), {:update_node, node_id, attrs})
  end

  @doc """
  Remove a node and all its edges.
  """
  def remove_node(tenant_id, node_id) when is_binary(node_id) do
    GenServer.call(via_tuple(tenant_id), {:remove_node, node_id})
  end

  @doc """
  Get a node by ID.
  """
  def get_node(tenant_id, node_id) when is_binary(node_id) do
    GenServer.call(via_tuple(tenant_id), {:get_node, node_id})
  end

  @doc """
  Add an edge between two nodes.
  """
  def add_edge(tenant_id, from_id, to_id, edge_type, attrs \\ %{})
      when is_binary(from_id) and is_binary(to_id) and is_atom(edge_type) do
    GenServer.call(via_tuple(tenant_id), {:add_edge, from_id, to_id, edge_type, attrs})
  end

  @doc """
  Remove an edge.
  """
  def remove_edge(tenant_id, from_id, to_id, edge_type)
      when is_binary(from_id) and is_binary(to_id) and is_atom(edge_type) do
    GenServer.call(via_tuple(tenant_id), {:remove_edge, from_id, to_id, edge_type})
  end

  @doc """
  Get all edges from a node.
  """
  def get_edges(tenant_id, node_id, opts \\ []) when is_binary(node_id) do
    GenServer.call(via_tuple(tenant_id), {:get_edges, node_id, opts})
  end

  @doc """
  Get related nodes with optional depth traversal.

  Options:
  - `:depth` - Traversal depth (default: 1)
  - `:edge_types` - Filter by edge types
  - `:node_types` - Filter by node types
  - `:direction` - :outgoing, :incoming, or :both (default: :both)
  """
  def get_related(tenant_id, node_id, opts \\ []) when is_binary(node_id) do
    GenServer.call(via_tuple(tenant_id), {:get_related, node_id, opts})
  end

  @doc """
  Search nodes by criteria.

  Options:
  - `:type` - Node type atom
  - `:name` - Name string or regex
  - `:attrs` - Attribute key-value pairs to match
  - `:limit` - Maximum results (default: 100)
  """
  def search(tenant_id, opts \\ []) do
    GenServer.call(via_tuple(tenant_id), {:search, opts})
  end

  @doc """
  Get subgraph starting from a node.
  """
  def get_subgraph(tenant_id, node_id, opts \\ []) when is_binary(node_id) do
    GenServer.call(via_tuple(tenant_id), {:get_subgraph, node_id, opts})
  end

  @doc """
  Merge a subgraph from another source (e.g., oh-my-opencode).
  """
  def merge_subgraph(tenant_id, subgraph) when is_map(subgraph) do
    GenServer.call(via_tuple(tenant_id), {:merge_subgraph, subgraph})
  end

  @doc """
  Export the full graph for syncing.
  """
  def export(tenant_id, opts \\ []) do
    GenServer.call(via_tuple(tenant_id), {:export, opts})
  end

  @doc """
  Subscribe to graph changes.
  """
  def subscribe(tenant_id) do
    Phoenix.PubSub.subscribe(@pubsub, "#{@graph_topic}:#{tenant_id}")
  end

  @doc """
  Get graph statistics.
  """
  def stats(tenant_id) do
    GenServer.call(via_tuple(tenant_id), :stats)
  end

  # GenServer callbacks

  @impl true
  def init(opts) do
    tenant_id = Keyword.fetch!(opts, :tenant_id)

    state = %__MODULE__{
      tenant_id: tenant_id,
      nodes: %{},
      edges: %{},
      belief_set: %{},
      indexes: %{
        by_type: %{},
        by_name: %{}
      },
      stats: %{
        node_count: 0,
        edge_count: 0,
        created_at: DateTime.utc_now(),
        last_modified: DateTime.utc_now()
      }
    }

    Logger.info("Context Graph started for tenant #{tenant_id}")
    {:ok, state}
  end

  @impl true
  def handle_call({:add_node, node_id, attrs}, _from, state) do
    if map_size(state.nodes) >= @max_nodes do
      {:reply, {:error, :max_nodes_exceeded}, state}
    else
      node_type = Map.get(attrs, :type)

      if node_type not in @node_types do
        {:reply, {:error, {:invalid_node_type, node_type}}, state}
      else
        node = %{
          id: node_id,
          type: node_type,
          attrs: attrs,
          created_at: DateTime.utc_now(),
          updated_at: DateTime.utc_now()
        }

        new_nodes = Map.put(state.nodes, node_id, node)
        new_indexes = update_indexes(state.indexes, :add, node)
        new_belief_set = Map.put(state.belief_set, "node:#{node_id}", node)

        new_state = %{
          state
          | nodes: new_nodes,
            indexes: new_indexes,
            belief_set: new_belief_set,
            stats: update_stats(state.stats, :node_added)
        }

        broadcast_change(state.tenant_id, :node_added, %{node_id: node_id, node: node})
        {:reply, {:ok, node}, new_state}
      end
    end
  end

  @impl true
  def handle_call({:update_node, node_id, attrs}, _from, state) do
    case Map.get(state.nodes, node_id) do
      nil ->
        {:reply, {:error, :not_found}, state}

      existing ->
        updated = %{
          existing
          | attrs: Map.merge(existing.attrs, attrs),
            updated_at: DateTime.utc_now()
        }

        new_nodes = Map.put(state.nodes, node_id, updated)
        new_belief_set = Map.put(state.belief_set, "node:#{node_id}", updated)

        # Update indexes if name changed
        new_indexes =
          state.indexes
          |> update_indexes(:remove, existing)
          |> update_indexes(:add, updated)

        new_state = %{
          state
          | nodes: new_nodes,
            belief_set: new_belief_set,
            indexes: new_indexes,
            stats: update_stats(state.stats, :node_updated)
        }

        broadcast_change(state.tenant_id, :node_updated, %{node_id: node_id, node: updated})
        {:reply, {:ok, updated}, new_state}
    end
  end

  @impl true
  def handle_call({:remove_node, node_id}, _from, state) do
    case Map.get(state.nodes, node_id) do
      nil ->
        {:reply, {:error, :not_found}, state}

      node ->
        # Remove node
        new_nodes = Map.delete(state.nodes, node_id)

        # Remove all edges involving this node
        new_edges =
          state.edges
          |> Enum.reject(fn {{from, to, _type}, _} ->
            from == node_id or to == node_id
          end)
          |> Map.new()

        new_indexes = update_indexes(state.indexes, :remove, node)

        new_state = %{
          state
          | nodes: new_nodes,
            edges: new_edges,
            indexes: new_indexes,
            stats: update_stats(state.stats, :node_removed)
        }

        broadcast_change(state.tenant_id, :node_removed, %{node_id: node_id})
        {:reply, :ok, new_state}
    end
  end

  @impl true
  def handle_call({:get_node, node_id}, _from, state) do
    case Map.get(state.nodes, node_id) do
      nil -> {:reply, {:error, :not_found}, state}
      node -> {:reply, {:ok, node}, state}
    end
  end

  @impl true
  def handle_call({:add_edge, from_id, to_id, edge_type, attrs}, _from, state) do
    cond do
      edge_type not in @edge_types ->
        {:reply, {:error, {:invalid_edge_type, edge_type}}, state}

      not Map.has_key?(state.nodes, from_id) ->
        {:reply, {:error, {:node_not_found, from_id}}, state}

      not Map.has_key?(state.nodes, to_id) ->
        {:reply, {:error, {:node_not_found, to_id}}, state}

      count_edges_from(state.edges, from_id) >= @max_edges_per_node ->
        {:reply, {:error, :max_edges_exceeded}, state}

      true ->
        edge_key = {from_id, to_id, edge_type}

        edge = %{
          from: from_id,
          to: to_id,
          type: edge_type,
          attrs: attrs,
          created_at: DateTime.utc_now()
        }

        new_edges = Map.put(state.edges, edge_key, edge)

        new_state = %{
          state
          | edges: new_edges,
            stats: update_stats(state.stats, :edge_added)
        }

        broadcast_change(state.tenant_id, :edge_added, %{edge: edge})
        {:reply, {:ok, edge}, new_state}
    end
  end

  @impl true
  def handle_call({:remove_edge, from_id, to_id, edge_type}, _from, state) do
    edge_key = {from_id, to_id, edge_type}

    if Map.has_key?(state.edges, edge_key) do
      new_edges = Map.delete(state.edges, edge_key)

      new_state = %{
        state
        | edges: new_edges,
          stats: update_stats(state.stats, :edge_removed)
      }

      broadcast_change(state.tenant_id, :edge_removed, %{from: from_id, to: to_id, type: edge_type})
      {:reply, :ok, new_state}
    else
      {:reply, {:error, :not_found}, state}
    end
  end

  @impl true
  def handle_call({:get_edges, node_id, opts}, _from, state) do
    direction = Keyword.get(opts, :direction, :both)
    edge_types = Keyword.get(opts, :edge_types)

    edges =
      state.edges
      |> Enum.filter(fn {{from, to, type}, _} ->
        matches_direction? =
          case direction do
            :outgoing -> from == node_id
            :incoming -> to == node_id
            :both -> from == node_id or to == node_id
          end

        matches_type? =
          case edge_types do
            nil -> true
            types -> type in types
          end

        matches_direction? and matches_type?
      end)
      |> Enum.map(fn {_, edge} -> edge end)

    {:reply, {:ok, edges}, state}
  end

  @impl true
  def handle_call({:get_related, node_id, opts}, _from, state) do
    depth = Keyword.get(opts, :depth, 1)
    edge_types = Keyword.get(opts, :edge_types)
    node_types = Keyword.get(opts, :node_types)
    direction = Keyword.get(opts, :direction, :both)

    related = traverse_graph(state, node_id, depth, edge_types, node_types, direction)
    {:reply, {:ok, related}, state}
  end

  @impl true
  def handle_call({:search, opts}, _from, state) do
    type_filter = Keyword.get(opts, :type)
    name_filter = Keyword.get(opts, :name)
    attrs_filter = Keyword.get(opts, :attrs, %{})
    limit = Keyword.get(opts, :limit, 100)

    results =
      state.nodes
      |> Map.values()
      |> Enum.filter(fn node ->
        type_match? =
          case type_filter do
            nil -> true
            type -> node.type == type
          end

        name_match? =
          case name_filter do
            nil ->
              true

            %Regex{} = regex ->
              node_name = get_in(node, [:attrs, :name]) || ""
              Regex.match?(regex, node_name)

            name when is_binary(name) ->
              node_name = get_in(node, [:attrs, :name]) || ""
              String.contains?(node_name, name)
          end

        attrs_match? =
          Enum.all?(attrs_filter, fn {key, value} ->
            get_in(node, [:attrs, key]) == value
          end)

        type_match? and name_match? and attrs_match?
      end)
      |> Enum.take(limit)

    {:reply, {:ok, results}, state}
  end

  @impl true
  def handle_call({:get_subgraph, node_id, opts}, _from, state) do
    depth = Keyword.get(opts, :depth, 2)

    # Get all related nodes
    related_ids = collect_related_ids(state, node_id, depth, MapSet.new())

    # Extract subgraph
    subgraph_nodes =
      state.nodes
      |> Enum.filter(fn {id, _} -> MapSet.member?(related_ids, id) end)
      |> Map.new()

    subgraph_edges =
      state.edges
      |> Enum.filter(fn {{from, to, _}, _} ->
        MapSet.member?(related_ids, from) and MapSet.member?(related_ids, to)
      end)
      |> Map.new()

    subgraph = %{
      nodes: subgraph_nodes,
      edges: subgraph_edges,
      root: node_id,
      exported_at: DateTime.utc_now()
    }

    {:reply, {:ok, subgraph}, state}
  end

  @impl true
  def handle_call({:merge_subgraph, subgraph}, _from, state) do
    # Merge nodes - handle both atom and string keys (atom from export_subgraph, string from JSON)
    incoming_nodes =
      Map.get(subgraph, :nodes) || Map.get(subgraph, "nodes", %{})

    new_nodes =
      Enum.reduce(incoming_nodes, state.nodes, fn {node_id, node}, acc ->
        # LWW merge - incoming wins if newer
        case Map.get(acc, node_id) do
          nil ->
            Map.put(acc, node_id, normalize_node(node))

          existing ->
            existing_time = existing.updated_at || existing.created_at
            incoming_time = Map.get(node, :updated_at) || Map.get(node, "updated_at") || DateTime.utc_now()

            if DateTime.compare(incoming_time, existing_time) == :gt do
              Map.put(acc, node_id, normalize_node(node))
            else
              acc
            end
        end
      end)

    # Merge edges - handle both atom and string keys
    incoming_edges =
      Map.get(subgraph, :edges) || Map.get(subgraph, "edges", %{})

    new_edges =
      Enum.reduce(incoming_edges, state.edges, fn {edge_key, edge}, acc ->
        normalized_key = normalize_edge_key(edge_key)
        Map.put_new(acc, normalized_key, normalize_edge(edge))
      end)

    new_state = %{
      state
      | nodes: new_nodes,
        edges: new_edges,
        stats: update_stats(state.stats, :subgraph_merged)
    }

    broadcast_change(state.tenant_id, :subgraph_merged, %{
      nodes_added: map_size(new_nodes) - map_size(state.nodes),
      edges_added: map_size(new_edges) - map_size(state.edges)
    })

    {:reply, :ok, new_state}
  end

  @impl true
  def handle_call({:export, _opts}, _from, state) do
    export = %{
      nodes: state.nodes,
      edges: state.edges,
      tenant_id: state.tenant_id,
      exported_at: DateTime.utc_now(),
      stats: state.stats
    }

    {:reply, {:ok, export}, state}
  end

  @impl true
  def handle_call(:stats, _from, state) do
    stats =
      Map.merge(state.stats, %{
        node_count: map_size(state.nodes),
        edge_count: map_size(state.edges),
        belief_set_size: map_size(state.belief_set)
      })

    {:reply, {:ok, stats}, state}
  end

  # Private helpers

  defp via_tuple(tenant_id) do
    {:via, Registry, {Cybernetic.Integrations.Registry, {__MODULE__, tenant_id}}}
  end

  defp update_indexes(indexes, :add, node) do
    by_type = Map.update(indexes.by_type, node.type, [node.id], &[node.id | &1])

    name = get_in(node, [:attrs, :name])

    by_name =
      if name do
        Map.update(indexes.by_name, name, [node.id], &[node.id | &1])
      else
        indexes.by_name
      end

    %{indexes | by_type: by_type, by_name: by_name}
  end

  defp update_indexes(indexes, :remove, node) do
    by_type = Map.update(indexes.by_type, node.type, [], &List.delete(&1, node.id))

    name = get_in(node, [:attrs, :name])

    by_name =
      if name do
        Map.update(indexes.by_name, name, [], &List.delete(&1, node.id))
      else
        indexes.by_name
      end

    %{indexes | by_type: by_type, by_name: by_name}
  end

  defp update_stats(stats, action) do
    %{stats | last_modified: DateTime.utc_now()}
    |> Map.update(action, 1, &(&1 + 1))
  end

  defp count_edges_from(edges, node_id) do
    Enum.count(edges, fn {{from, _, _}, _} -> from == node_id end)
  end

  defp traverse_graph(state, start_id, max_depth, edge_types, node_types, direction) do
    do_traverse(state, [start_id], max_depth, edge_types, node_types, direction, MapSet.new(), [])
  end

  defp do_traverse(_state, [], _depth, _edge_types, _node_types, _direction, _visited, acc) do
    Enum.reverse(acc)
  end

  defp do_traverse(_state, _frontier, 0, _edge_types, _node_types, _direction, _visited, acc) do
    Enum.reverse(acc)
  end

  defp do_traverse(state, frontier, depth, edge_types, node_types, direction, visited, acc) do
    # Find connected nodes
    connected =
      frontier
      |> Enum.flat_map(fn node_id ->
        find_connected(state, node_id, edge_types, direction)
      end)
      |> Enum.uniq()
      |> Enum.reject(&MapSet.member?(visited, &1))

    # Filter by node type if specified
    filtered =
      case node_types do
        nil ->
          connected

        types ->
          Enum.filter(connected, fn id ->
            node = Map.get(state.nodes, id)
            node && node.type in types
          end)
      end

    # Get node details
    nodes =
      filtered
      |> Enum.map(&Map.get(state.nodes, &1))
      |> Enum.reject(&is_nil/1)

    new_visited = Enum.reduce(filtered, visited, &MapSet.put(&2, &1))
    new_acc = nodes ++ acc

    do_traverse(state, filtered, depth - 1, edge_types, node_types, direction, new_visited, new_acc)
  end

  defp find_connected(state, node_id, edge_types, direction) do
    state.edges
    |> Enum.filter(fn {{from, to, type}, _} ->
      matches_direction? =
        case direction do
          :outgoing -> from == node_id
          :incoming -> to == node_id
          :both -> from == node_id or to == node_id
        end

      matches_type? =
        case edge_types do
          nil -> true
          types -> type in types
        end

      matches_direction? and matches_type?
    end)
    |> Enum.map(fn {{from, to, _}, _} ->
      if from == node_id, do: to, else: from
    end)
  end

  defp collect_related_ids(state, node_id, depth, collected) do
    if depth <= 0 or MapSet.member?(collected, node_id) do
      collected
    else
      collected = MapSet.put(collected, node_id)

      connected = find_connected(state, node_id, nil, :both)

      Enum.reduce(connected, collected, fn id, acc ->
        collect_related_ids(state, id, depth - 1, acc)
      end)
    end
  end

  defp broadcast_change(tenant_id, action, data) do
    message = {:context_graph, %{action: action, data: data, timestamp: DateTime.utc_now()}}

    try do
      Phoenix.PubSub.broadcast(@pubsub, "#{@graph_topic}:#{tenant_id}", message)
    rescue
      _ -> :ok
    end
  end

  defp normalize_node(node) when is_map(node) do
    %{
      id: Map.get(node, :id) || Map.get(node, "id"),
      type: (Map.get(node, :type) || Map.get(node, "type")) |> normalize_atom(),
      attrs: Map.get(node, :attrs) || Map.get(node, "attrs") || %{},
      created_at: Map.get(node, :created_at) || Map.get(node, "created_at") || DateTime.utc_now(),
      updated_at: Map.get(node, :updated_at) || Map.get(node, "updated_at") || DateTime.utc_now()
    }
  end

  defp normalize_edge(edge) when is_map(edge) do
    %{
      from: Map.get(edge, :from) || Map.get(edge, "from"),
      to: Map.get(edge, :to) || Map.get(edge, "to"),
      type: (Map.get(edge, :type) || Map.get(edge, "type")) |> normalize_atom(),
      attrs: Map.get(edge, :attrs) || Map.get(edge, "attrs") || %{},
      created_at: Map.get(edge, :created_at) || Map.get(edge, "created_at") || DateTime.utc_now()
    }
  end

  defp normalize_edge_key(key) when is_tuple(key), do: key

  defp normalize_edge_key(key) when is_binary(key) do
    # Parse string key like "from:to:type"
    case String.split(key, ":") do
      [from, to, type] -> {from, to, String.to_existing_atom(type)}
      _ -> {key, key, :relates_to}
    end
  rescue
    _ -> {key, key, :relates_to}
  end

  defp normalize_atom(value) when is_atom(value), do: value
  defp normalize_atom(value) when is_binary(value) do
    String.to_existing_atom(value)
  rescue
    _ -> :unknown
  end
end
