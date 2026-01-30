defmodule Cybernetic.Content.Supervisor do
  @moduledoc """
  Supervisor for Content layer components.

  Manages:
  - SemanticContainer - Content-addressable storage with embeddings
  - IngestPipeline - Multi-stage content ingestion
  - CBCP - Content Bucket Control Protocol for lifecycle management

  Connectors (WordPress, GoogleDrive) are stateless behaviours and don't
  require supervision - they are instantiated per-connection.
  """
  use Supervisor

  require Logger

  alias Cybernetic.Content.SemanticContainer
  alias Cybernetic.Content.Pipeline.Ingest, as: IngestPipeline
  alias Cybernetic.Content.Buckets.CBCP

  @doc "Start the Content supervisor"
  @spec start_link(keyword()) :: Supervisor.on_start()
  def start_link(opts \\ []) do
    name = Keyword.get(opts, :name, __MODULE__)
    Supervisor.start_link(__MODULE__, opts, name: name)
  end

  @impl true
  def init(opts) do
    Logger.info("Content Supervisor starting")

    children = [
      # Content-addressable storage with embeddings
      {SemanticContainer,
       [
         name: SemanticContainer,
         embedding_dimensions: Keyword.get(opts, :embedding_dimensions, 1536),
         max_content_size: Keyword.get(opts, :max_content_size, 100 * 1024 * 1024),
         max_metadata_size: Keyword.get(opts, :max_metadata_size, 64 * 1024)
       ]},

      # Content Bucket Control Protocol
      {CBCP,
       [
         name: CBCP,
         default_quota: Keyword.get(opts, :default_quota, 10 * 1024 * 1024 * 1024),
         cleanup_interval_ms: Keyword.get(opts, :cleanup_interval, 3_600_000)
       ]},

      # Multi-stage ingest pipeline
      {IngestPipeline,
       [
         name: IngestPipeline,
         max_concurrent: Keyword.get(opts, :max_concurrent_ingests, 10),
         default_timeout_ms: Keyword.get(opts, :ingest_timeout, 60_000)
       ]}
    ]

    # one_for_one is appropriate since components can recover independently
    # SemanticContainer data is in ETS and can be rebuilt from storage
    Supervisor.init(children, strategy: :one_for_one, max_restarts: 5, max_seconds: 60)
  end

  # Convenience functions

  @doc "Get all child stats"
  @spec get_all_stats() :: map()
  def get_all_stats do
    %{
      semantic_container: safe_call(SemanticContainer, :stats, []),
      cbcp: safe_call(CBCP, :stats, []),
      ingest_pipeline: safe_call(IngestPipeline, :stats, [])
    }
  end

  @doc "Health check for all components"
  @spec health_check() :: %{healthy: boolean(), components: map()}
  def health_check do
    components = %{
      semantic_container: process_alive?(SemanticContainer),
      cbcp: process_alive?(CBCP),
      ingest_pipeline: process_alive?(IngestPipeline)
    }

    healthy = Enum.all?(components, fn {_name, status} -> status end)

    %{healthy: healthy, components: components}
  end

  @doc "List available connector modules"
  @spec list_connectors() :: [module()]
  def list_connectors do
    [
      Cybernetic.Content.Connectors.WordPress,
      Cybernetic.Content.Connectors.GoogleDrive
    ]
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
