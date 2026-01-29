defmodule Cybernetic.Content.SemanticContainer do
  @moduledoc """
  Semantic Container for content storage with embeddings and capability/policy references.

  Containers wrap content with:
  - Content-addressable storage (SHA256 hash as ID)
  - Vector embeddings for semantic search
  - Capability references for access control
  - Policy references for governance
  - Rich metadata

  Integrates with:
  - HNSW index for similarity search
  - Storage layer for persistence
  - ReqLLM for embedding generation
  """

  use GenServer
  require Logger

  alias Cybernetic.Config

  # Types
  @type capability_ref :: String.t()
  @type policy_ref :: String.t()
  @type container_id :: String.t()
  @type embedding :: [float()]

  @type t :: %__MODULE__{
          id: container_id(),
          content_hash: String.t(),
          content_type: String.t(),
          content_size: non_neg_integer(),
          capabilities: [capability_ref()],
          policy: policy_ref() | nil,
          metadata: map(),
          embedding: embedding() | nil,
          tenant_id: String.t(),
          created_at: DateTime.t(),
          updated_at: DateTime.t()
        }

  defstruct [
    :id,
    :content_hash,
    :content_type,
    :content_size,
    :capabilities,
    :policy,
    :metadata,
    :embedding,
    :tenant_id,
    :created_at,
    :updated_at
  ]

  # Configuration
  # 100MB
  @max_content_size 104_857_600
  # 64KB
  @max_metadata_size 65_536
  @max_capabilities 100
  # OpenAI ada-002 default
  @embedding_dimensions 1536
  @cleanup_interval :timer.minutes(5)

  @telemetry [:cybernetic, :content, :container]

  # Client API

  @doc "Start the semantic container server"
  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts \\ []) do
    name = Keyword.get(opts, :name, __MODULE__)
    GenServer.start_link(__MODULE__, opts, name: name)
  end

  @doc "Create a new semantic container from content"
  @spec create(GenServer.server(), binary(), String.t(), keyword()) ::
          {:ok, t()} | {:error, term()}
  def create(server \\ __MODULE__, content, tenant_id, opts \\ []) do
    GenServer.call(server, {:create, content, tenant_id, opts}, 30_000)
  end

  @doc "Get a container by ID"
  @spec get(GenServer.server(), container_id()) :: {:ok, t()} | {:error, :not_found}
  def get(server \\ __MODULE__, id) do
    GenServer.call(server, {:get, id})
  end

  @doc "Get container with content from storage"
  @spec get_with_content(GenServer.server(), container_id()) ::
          {:ok, t(), binary()} | {:error, term()}
  def get_with_content(server \\ __MODULE__, id) do
    GenServer.call(server, {:get_with_content, id}, 30_000)
  end

  @doc "Update container metadata"
  @spec update_metadata(GenServer.server(), container_id(), map()) ::
          {:ok, t()} | {:error, term()}
  def update_metadata(server \\ __MODULE__, id, metadata) do
    GenServer.call(server, {:update_metadata, id, metadata})
  end

  @doc "Attach capabilities to container"
  @spec attach_capabilities(GenServer.server(), container_id(), [capability_ref()]) ::
          {:ok, t()} | {:error, term()}
  def attach_capabilities(server \\ __MODULE__, id, capabilities) do
    GenServer.call(server, {:attach_capabilities, id, capabilities})
  end

  @doc "Set policy reference"
  @spec set_policy(GenServer.server(), container_id(), policy_ref()) ::
          {:ok, t()} | {:error, term()}
  def set_policy(server \\ __MODULE__, id, policy_ref) do
    GenServer.call(server, {:set_policy, id, policy_ref})
  end

  @doc "Search containers by semantic similarity"
  @spec search_similar(GenServer.server(), binary() | embedding(), keyword()) ::
          {:ok, [{container_id(), float()}]} | {:error, term()}
  def search_similar(server \\ __MODULE__, query, opts \\ []) do
    GenServer.call(server, {:search_similar, query, opts}, 30_000)
  end

  @doc "List containers for tenant"
  @spec list(GenServer.server(), String.t(), keyword()) :: {:ok, [t()]}
  def list(server \\ __MODULE__, tenant_id, opts \\ []) do
    GenServer.call(server, {:list, tenant_id, opts})
  end

  @doc "Delete a container"
  @spec delete(GenServer.server(), container_id()) :: :ok | {:error, term()}
  def delete(server \\ __MODULE__, id) do
    GenServer.call(server, {:delete, id})
  end

  @doc "Get server statistics"
  @spec stats(GenServer.server()) :: map()
  def stats(server \\ __MODULE__) do
    GenServer.call(server, :stats)
  end

  # Server Implementation

  @impl true
  def init(opts) do
    Logger.info("Semantic Container server starting")

    # ETS table for container metadata (content stored separately)
    table = :ets.new(:semantic_containers, [:set, :protected, {:read_concurrency, true}])

    # Tenant index for fast tenant-scoped queries
    tenant_index = :ets.new(:container_tenant_index, [:bag, :protected])

    state = %{
      table: table,
      tenant_index: tenant_index,
      hnsw_index: Keyword.get(opts, :hnsw_index),
      storage_adapter: Keyword.get(opts, :storage_adapter, Cybernetic.Storage),
      stats: %{
        containers_created: 0,
        containers_deleted: 0,
        searches: 0,
        embeddings_generated: 0,
        total_content_size: 0
      }
    }

    schedule_cleanup()

    {:ok, state}
  end

  @impl true
  def handle_call({:create, content, tenant_id, opts}, _from, state) do
    start_time = System.monotonic_time(:millisecond)

    with :ok <- validate_content(content),
         :ok <- validate_tenant_id(tenant_id),
         {:ok, container} <- build_container(content, tenant_id, opts),
         {:ok, container} <- maybe_generate_embedding(container, content, opts),
         :ok <- store_content(state, container, content),
         :ok <- index_container(state, container) do
      # Store in ETS
      :ets.insert(state.table, {container.id, container})
      :ets.insert(state.tenant_index, {tenant_id, container.id})

      new_stats =
        state.stats
        |> Map.update!(:containers_created, &(&1 + 1))
        |> Map.update!(:total_content_size, &(&1 + container.content_size))

      emit_telemetry(:create, start_time, %{
        container_id: container.id,
        tenant_id: tenant_id,
        content_size: container.content_size
      })

      {:reply, {:ok, container}, %{state | stats: new_stats}}
    else
      {:error, reason} = error ->
        emit_telemetry(:create_error, start_time, %{reason: reason})
        {:reply, error, state}
    end
  end

  @impl true
  def handle_call({:get, id}, _from, state) do
    case :ets.lookup(state.table, id) do
      [{^id, container}] -> {:reply, {:ok, container}, state}
      [] -> {:reply, {:error, :not_found}, state}
    end
  end

  @impl true
  def handle_call({:get_with_content, id}, _from, state) do
    case :ets.lookup(state.table, id) do
      [{^id, container}] ->
        case fetch_content(state, container) do
          {:ok, content} -> {:reply, {:ok, container, content}, state}
          error -> {:reply, error, state}
        end

      [] ->
        {:reply, {:error, :not_found}, state}
    end
  end

  @impl true
  def handle_call({:update_metadata, id, new_metadata}, _from, state) do
    case :ets.lookup(state.table, id) do
      [{^id, container}] ->
        with :ok <- validate_metadata(new_metadata) do
          merged = Map.merge(container.metadata, new_metadata)
          updated = %{container | metadata: merged, updated_at: DateTime.utc_now()}
          :ets.insert(state.table, {id, updated})
          {:reply, {:ok, updated}, state}
        end

      [] ->
        {:reply, {:error, :not_found}, state}
    end
  end

  @impl true
  def handle_call({:attach_capabilities, id, capabilities}, _from, state) do
    case :ets.lookup(state.table, id) do
      [{^id, container}] ->
        with :ok <- validate_capabilities(capabilities) do
          merged = Enum.uniq(container.capabilities ++ capabilities)

          if length(merged) > @max_capabilities do
            {:reply, {:error, :too_many_capabilities}, state}
          else
            updated = %{container | capabilities: merged, updated_at: DateTime.utc_now()}
            :ets.insert(state.table, {id, updated})
            {:reply, {:ok, updated}, state}
          end
        end

      [] ->
        {:reply, {:error, :not_found}, state}
    end
  end

  @impl true
  def handle_call({:set_policy, id, policy_ref}, _from, state) do
    case :ets.lookup(state.table, id) do
      [{^id, container}] ->
        updated = %{container | policy: policy_ref, updated_at: DateTime.utc_now()}
        :ets.insert(state.table, {id, updated})
        {:reply, {:ok, updated}, state}

      [] ->
        {:reply, {:error, :not_found}, state}
    end
  end

  @impl true
  def handle_call({:search_similar, query, opts}, _from, state) do
    start_time = System.monotonic_time(:millisecond)
    k = Keyword.get(opts, :k, 10)
    tenant_id = Keyword.get(opts, :tenant_id)

    result =
      with {:ok, query_embedding} <- get_or_generate_embedding(query, opts),
           {:ok, results} <- search_hnsw(state, query_embedding, k * 2) do
        # Filter by tenant if specified
        filtered =
          if tenant_id do
            tenant_ids = get_tenant_container_ids(state, tenant_id)
            Enum.filter(results, fn {id, _score} -> id in tenant_ids end)
          else
            results
          end

        {:ok, Enum.take(filtered, k)}
      end

    new_stats = Map.update!(state.stats, :searches, &(&1 + 1))
    emit_telemetry(:search, start_time, %{k: k, tenant_id: tenant_id})

    {:reply, result, %{state | stats: new_stats}}
  end

  @impl true
  def handle_call({:list, tenant_id, opts}, _from, state) do
    limit = Keyword.get(opts, :limit, 100)
    offset = Keyword.get(opts, :offset, 0)

    container_ids =
      :ets.lookup(state.tenant_index, tenant_id)
      |> Enum.map(fn {_tenant, id} -> id end)
      |> Enum.drop(offset)
      |> Enum.take(limit)

    containers =
      Enum.flat_map(container_ids, fn id ->
        case :ets.lookup(state.table, id) do
          [{^id, container}] -> [container]
          [] -> []
        end
      end)

    {:reply, {:ok, containers}, state}
  end

  @impl true
  def handle_call({:delete, id}, _from, state) do
    case :ets.lookup(state.table, id) do
      [{^id, container}] ->
        # Remove from indexes
        :ets.delete(state.table, id)
        :ets.match_delete(state.tenant_index, {container.tenant_id, id})

        # Remove from HNSW if indexed
        remove_from_hnsw(state, id)

        # Delete content from storage
        delete_content(state, container)

        new_stats =
          state.stats
          |> Map.update!(:containers_deleted, &(&1 + 1))
          |> Map.update!(:total_content_size, &max(0, &1 - container.content_size))

        {:reply, :ok, %{state | stats: new_stats}}

      [] ->
        {:reply, {:error, :not_found}, state}
    end
  end

  @impl true
  def handle_call(:stats, _from, state) do
    stats =
      Map.merge(state.stats, %{
        container_count: :ets.info(state.table, :size),
        tenant_count: count_unique_tenants(state)
      })

    {:reply, stats, state}
  end

  @impl true
  def handle_info(:cleanup, state) do
    # Cleanup orphaned entries, validate integrity
    Logger.debug("Running semantic container cleanup")
    schedule_cleanup()
    {:noreply, state}
  end

  @impl true
  def terminate(_reason, state) do
    :ets.delete(state.table)
    :ets.delete(state.tenant_index)
    :ok
  end

  # Private Functions

  @spec validate_content(binary()) :: :ok | {:error, term()}
  defp validate_content(content) when is_binary(content) do
    size = byte_size(content)

    cond do
      size == 0 -> {:error, :empty_content}
      size > @max_content_size -> {:error, :content_too_large}
      true -> :ok
    end
  end

  defp validate_content(_), do: {:error, :invalid_content}

  @spec validate_tenant_id(String.t()) :: :ok | {:error, term()}
  defp validate_tenant_id(tenant_id) when is_binary(tenant_id) do
    if Regex.match?(Config.tenant_id_pattern(), tenant_id) do
      :ok
    else
      {:error, :invalid_tenant_id}
    end
  end

  defp validate_tenant_id(_), do: {:error, :invalid_tenant_id}

  @spec validate_metadata(map()) :: :ok | {:error, term()}
  defp validate_metadata(metadata) when is_map(metadata) do
    encoded = Jason.encode!(metadata)

    if byte_size(encoded) > @max_metadata_size do
      {:error, :metadata_too_large}
    else
      :ok
    end
  rescue
    _ -> {:error, :invalid_metadata}
  end

  defp validate_metadata(_), do: {:error, :invalid_metadata}

  @spec validate_capabilities([capability_ref()]) :: :ok | {:error, term()}
  defp validate_capabilities(capabilities) when is_list(capabilities) do
    if Enum.all?(capabilities, &is_binary/1) do
      :ok
    else
      {:error, :invalid_capabilities}
    end
  end

  defp validate_capabilities(_), do: {:error, :invalid_capabilities}

  @spec build_container(binary(), String.t(), keyword()) :: {:ok, t()} | {:error, term()}
  defp build_container(content, tenant_id, opts) do
    now = DateTime.utc_now()
    content_hash = compute_content_hash(content)
    id = Keyword.get(opts, :id, generate_container_id(content_hash, tenant_id))

    container = %__MODULE__{
      id: id,
      content_hash: content_hash,
      content_type: Keyword.get(opts, :content_type, detect_content_type(content)),
      content_size: byte_size(content),
      capabilities: Keyword.get(opts, :capabilities, []),
      policy: Keyword.get(opts, :policy),
      metadata: Keyword.get(opts, :metadata, %{}),
      embedding: nil,
      tenant_id: tenant_id,
      created_at: now,
      updated_at: now
    }

    {:ok, container}
  end

  @spec compute_content_hash(binary()) :: String.t()
  defp compute_content_hash(content) do
    :crypto.hash(:sha256, content)
    |> Base.encode16(case: :lower)
  end

  @spec generate_container_id(String.t(), String.t()) :: String.t()
  defp generate_container_id(content_hash, tenant_id) do
    # Content-addressable with tenant namespace
    "#{tenant_id}:#{String.slice(content_hash, 0, 16)}"
  end

  @spec detect_content_type(binary()) :: String.t()
  defp detect_content_type(content) do
    Cybernetic.Storage.ContentType.detect(content, "unknown")
  end

  @spec maybe_generate_embedding(t(), binary(), keyword()) :: {:ok, t()} | {:error, term()}
  defp maybe_generate_embedding(container, content, opts) do
    if Keyword.get(opts, :generate_embedding, true) do
      case generate_embedding(content) do
        {:ok, embedding} ->
          {:ok, %{container | embedding: embedding}}

        {:error, reason} ->
          Logger.warning("Failed to generate embedding: #{inspect(reason)}")
          # Continue without embedding - can be added later
          {:ok, container}
      end
    else
      {:ok, container}
    end
  end

  @spec generate_embedding(binary()) :: {:ok, embedding()} | {:error, term()}
  defp generate_embedding(content) do
    # Truncate content for embedding
    text = truncate_for_embedding(content)

    if Code.ensure_loaded?(ReqLLM) and function_exported?(ReqLLM, :embed, 2) do
      try do
        case ReqLLM.embed(Req.new(), input: text) do
          {:ok, %{body: %{"data" => [%{"embedding" => embedding} | _]}}} ->
            {:ok, embedding}

          {:ok, %{data: [%{embedding: embedding} | _]}} ->
            {:ok, embedding}

          {:error, reason} ->
            {:error, reason}

          _ ->
            {:ok, generate_fallback_embedding(text)}
        end
      rescue
        e -> {:error, Exception.message(e)}
      end
    else
      # Fallback: generate deterministic pseudo-embedding from content hash
      {:ok, generate_fallback_embedding(content)}
    end
  end

  @spec truncate_for_embedding(binary()) :: String.t()
  defp truncate_for_embedding(content) do
    max_chars = Config.llm_max_content_length()

    content
    |> to_string()
    |> String.slice(0, max_chars)
  end

  @spec generate_fallback_embedding(binary()) :: embedding()
  defp generate_fallback_embedding(content) do
    # Generate a deterministic embedding from content hash
    # This allows similarity search to work even without LLM
    hash = :crypto.hash(:sha256, content)

    hash
    |> :binary.bin_to_list()
    |> Enum.take(@embedding_dimensions)
    |> Enum.map(&(&1 / 255.0))
    |> pad_embedding(@embedding_dimensions)
  end

  @spec pad_embedding([float()], pos_integer()) :: [float()]
  defp pad_embedding(embedding, target_size) when length(embedding) >= target_size do
    Enum.take(embedding, target_size)
  end

  defp pad_embedding(embedding, target_size) do
    padding = List.duplicate(0.0, target_size - length(embedding))
    embedding ++ padding
  end

  @spec store_content(map(), t(), binary()) :: :ok | {:error, term()}
  defp store_content(state, container, content) do
    path = content_path(container)

    case state.storage_adapter.put(path, content, container.tenant_id) do
      :ok -> :ok
      {:error, _} = error -> error
    end
  end

  @spec fetch_content(map(), t()) :: {:ok, binary()} | {:error, term()}
  defp fetch_content(state, container) do
    path = content_path(container)
    state.storage_adapter.get(path, container.tenant_id)
  end

  @spec delete_content(map(), t()) :: :ok
  defp delete_content(state, container) do
    path = content_path(container)
    state.storage_adapter.delete(path, container.tenant_id)
    :ok
  rescue
    _ -> :ok
  end

  @spec content_path(t()) :: String.t()
  defp content_path(container) do
    "containers/#{container.content_hash}"
  end

  @spec index_container(map(), t()) :: :ok | {:error, term()}
  defp index_container(%{hnsw_index: nil}, _container), do: :ok

  defp index_container(%{hnsw_index: hnsw}, container) do
    if container.embedding do
      case Cybernetic.Intelligence.HNSW.Index.insert(hnsw, container.id, container.embedding) do
        :ok -> :ok
        {:error, _} = error -> error
      end
    else
      :ok
    end
  end

  @spec search_hnsw(map(), embedding(), pos_integer()) ::
          {:ok, [{container_id(), float()}]} | {:error, term()}
  defp search_hnsw(%{hnsw_index: nil}, _embedding, _k) do
    {:error, :hnsw_not_configured}
  end

  defp search_hnsw(%{hnsw_index: hnsw}, embedding, k) do
    case Cybernetic.Intelligence.HNSW.Index.search(embedding, server: hnsw, k: k) do
      {:ok, results} ->
        # Convert search_result format to {id, distance} tuples
        ids_with_distances = Enum.map(results, fn %{id: id, distance: dist} -> {id, dist} end)
        {:ok, ids_with_distances}

      {:error, _} = error ->
        error
    end
  end

  @spec remove_from_hnsw(map(), container_id()) :: :ok
  defp remove_from_hnsw(%{hnsw_index: nil}, _id), do: :ok

  defp remove_from_hnsw(%{hnsw_index: hnsw}, id) do
    Cybernetic.Intelligence.HNSW.Index.delete(hnsw, id)
    :ok
  rescue
    _ -> :ok
  end

  @spec get_or_generate_embedding(binary() | embedding(), keyword()) ::
          {:ok, embedding()} | {:error, term()}
  defp get_or_generate_embedding(query, _opts) when is_list(query) do
    # Already an embedding
    {:ok, query}
  end

  defp get_or_generate_embedding(query, _opts) when is_binary(query) do
    generate_embedding(query)
  end

  @spec get_tenant_container_ids(map(), String.t()) :: MapSet.t()
  defp get_tenant_container_ids(state, tenant_id) do
    :ets.lookup(state.tenant_index, tenant_id)
    |> Enum.map(fn {_tenant, id} -> id end)
    |> MapSet.new()
  end

  @spec count_unique_tenants(map()) :: non_neg_integer()
  defp count_unique_tenants(state) do
    :ets.tab2list(state.tenant_index)
    |> Enum.map(fn {tenant, _id} -> tenant end)
    |> Enum.uniq()
    |> length()
  end

  defp schedule_cleanup do
    Process.send_after(self(), :cleanup, @cleanup_interval)
  end

  @spec emit_telemetry(atom(), integer(), map()) :: :ok
  defp emit_telemetry(event, start_time, metadata) do
    duration = System.monotonic_time(:millisecond) - start_time

    :telemetry.execute(
      @telemetry ++ [event],
      %{duration: duration},
      metadata
    )
  end
end
