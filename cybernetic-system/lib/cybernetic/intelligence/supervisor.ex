defmodule Cybernetic.Intelligence.Supervisor do
  @moduledoc """
  Supervisor for Intelligence layer components.

  Manages:
  - DeterministicCache - Content-addressable cache with Bloom filter
  - WorkflowHooks - CEP pattern matching and workflow triggers
  - ZombieDetector - Process health monitoring
  - HNSWIndex - Vector similarity search
  - BeliefSet - CRDT for distributed belief propagation
  """
  use Supervisor

  require Logger

  alias Cybernetic.Intelligence.Cache.DeterministicCache
  alias Cybernetic.Intelligence.CEP.WorkflowHooks
  alias Cybernetic.Intelligence.Zombie.Detector, as: ZombieDetector
  alias Cybernetic.Intelligence.HNSW.Index, as: HNSWIndex
  alias Cybernetic.Intelligence.CRDT.BeliefSet
  alias Cybernetic.Intelligence.Utils

  @doc "Start the Intelligence supervisor"
  @spec start_link(keyword()) :: Supervisor.on_start()
  def start_link(opts \\ []) do
    name = Keyword.get(opts, :name, __MODULE__)
    Supervisor.start_link(__MODULE__, opts, name: name)
  end

  @impl true
  def init(opts) do
    Logger.info("Intelligence Supervisor starting")

    children = [
      # Content-addressable cache with Bloom filter
      {DeterministicCache,
       [
         name: DeterministicCache,
         max_size: Keyword.get(opts, :cache_max_size, 10_000),
         max_memory: Keyword.get(opts, :cache_max_memory, 100 * 1024 * 1024)
       ]},

      # CEP workflow hooks
      {WorkflowHooks, [name: WorkflowHooks]},

      # Zombie process detection
      {ZombieDetector,
       [
         name: ZombieDetector,
         check_interval_ms: Keyword.get(opts, :zombie_check_interval, 10_000),
         default_timeout_ms: Keyword.get(opts, :zombie_timeout, 60_000)
       ]},

      # HNSW vector index
      {HNSWIndex,
       [
         name: HNSWIndex,
         dimensions: Keyword.get(opts, :hnsw_dimensions, 384),
         m: Keyword.get(opts, :hnsw_m, 16),
         ef_construction: Keyword.get(opts, :hnsw_ef_construction, 200)
       ]},

      # BeliefSet CRDT
      {BeliefSet,
       [
         name: BeliefSet,
         node_id: Keyword.get(opts, :node_id, Utils.generate_node_id())
       ]}
    ]

    # Note: one_for_one is appropriate here since each component is independent
    # HNSW data loss on crash is acceptable since it can be rebuilt or loaded from persistence
    Supervisor.init(children, strategy: :one_for_one, max_restarts: 5, max_seconds: 60)
  end

  # Convenience functions

  @doc "Get all child stats"
  @spec get_all_stats() :: map()
  def get_all_stats do
    %{
      cache: safe_call(DeterministicCache, :stats, []),
      cep: safe_call(WorkflowHooks, :stats, []),
      zombie: safe_call(ZombieDetector, :stats, []),
      hnsw: safe_call(HNSWIndex, :stats, []),
      crdt: safe_call(BeliefSet, :stats, [])
    }
  end

  @doc "Health check for all components"
  @spec health_check() :: %{healthy: boolean(), components: map()}
  def health_check do
    components = %{
      cache: process_alive?(DeterministicCache),
      cep: process_alive?(WorkflowHooks),
      zombie: process_alive?(ZombieDetector),
      hnsw: process_alive?(HNSWIndex),
      crdt: process_alive?(BeliefSet)
    }

    healthy = Enum.all?(components, fn {_name, status} -> status end)

    %{healthy: healthy, components: components}
  end

  # Private

  defp safe_call(module, fun, args) do
    try do
      apply(module, fun, args)
    rescue
      _ -> %{error: "unavailable"}
    catch
      :exit, _ -> %{error: "unavailable"}
    end
  end

  defp process_alive?(name) do
    case Process.whereis(name) do
      nil -> false
      pid -> Process.alive?(pid)
    end
  end
end
