defmodule Cybernetic.Core.CRDT.DistributedGraph do
  @moduledoc """
  Distributed Graph using Delta CRDTs.
  Replaces the naive ETS-based Graph for cluster-wide state synchronization.
  Uses AWLWWMap (Add-Wins Last-Write-Wins Map) to store nodes and edges.
  """
  use GenServer
  require Logger

  # 5 minutes sync interval (backup)
  @sync_interval 300_000

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  def init(opts) do
    # Start Delta CRDT
    {:ok, crdt_pid} = DeltaCrdt.start_link(DeltaCrdt.AWLWWMap, sync_interval: 500)
    
    # Store CRDT pid in persistent term for fast access? No, keep in state.
    
    # Schedule neighbor discovery
    send(self(), :connect_neighbors)

    {:ok, %{crdt: crdt_pid, neighbors: MapSet.new()}}
  end

  # API

  @doc "Add a node to the distributed graph"
  def add_node(id, metadata) do
    GenServer.call(__MODULE__, {:mutate, {:add, {:node, id}, metadata}})
  end

  @doc "Add an edge"
  def add_edge(from, to, metadata) do
    GenServer.call(__MODULE__, {:mutate, {:add, {:edge, {from, to}}, metadata}})
  end

  @doc "Read the entire graph state"
  def read do
    GenServer.call(__MODULE__, :read)
  end

  @doc "Get a specific key"
  def get(key) do
    GenServer.call(__MODULE__, {:get, key})
  end

  # Callbacks

  def handle_call({:mutate, operation}, _from, state) do
    DeltaCrdt.mutate(state.crdt, operation)
    {:reply, :ok, state}
  end

  def handle_call(:read, _from, state) do
    data = DeltaCrdt.read(state.crdt)
    {:reply, data, state}
  end

  def handle_call({:get, key}, _from, state) do
    data = DeltaCrdt.read(state.crdt)
    {:reply, Map.get(data, key), state}
  end

  def handle_info(:connect_neighbors, state) do
    # Get nodes from Erlang distribution
    nodes = Node.list()
    
    # In a real cluster, we'd filter or use a specific topology
    # For now, connect to all visible nodes
    
    new_neighbors = MapSet.new(nodes)
    diff = MapSet.difference(new_neighbors, state.neighbors)
    
    if MapSet.size(diff) > 0 do
      Logger.info("Wiring CRDT neighbors: #{inspect(MapSet.to_list(diff))}")
      DeltaCrdt.set_neighbors(state.crdt, MapSet.to_list(new_neighbors))
    end

    Process.send_after(self(), :connect_neighbors, 5000)
    {:noreply, %{state | neighbors: new_neighbors}}
  end
end
