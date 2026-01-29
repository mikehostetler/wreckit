defmodule Cybernetic.Storage.Adapters.Memory do
  @moduledoc """
  In-memory storage adapter for testing.

  Stores artifacts in an ETS table for fast access during tests.
  Data is lost when the process terminates.

  ## Usage

      # Start the memory adapter (usually in test_helper.exs)
      {:ok, _pid} = Cybernetic.Storage.Adapters.Memory.start_link()

      # Use in tests
      config :cybernetic, :storage,
        adapter: Cybernetic.Storage.Adapters.Memory

  ## Features

  - Fast in-memory storage
  - No filesystem dependencies
  - Isolated per-test (can clear between tests)
  - Supports all adapter operations
  """
  use GenServer
  use Cybernetic.Storage.Adapter

  require Logger

  alias Cybernetic.Storage.PathValidator

  @table :cybernetic_memory_storage

  # Client API

  @doc """
  Start the memory storage adapter.
  """
  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc """
  Clear all stored data.

  Useful for resetting state between tests.
  """
  @spec clear() :: :ok
  def clear do
    GenServer.call(__MODULE__, :clear)
  end

  @doc """
  Clear data for a specific tenant.
  """
  @spec clear(String.t()) :: :ok
  def clear(tenant_id) do
    GenServer.call(__MODULE__, {:clear, tenant_id})
  end

  @doc """
  Get the count of stored objects.
  """
  @spec count() :: non_neg_integer()
  def count do
    GenServer.call(__MODULE__, :count)
  end

  # Adapter implementation

  @impl Cybernetic.Storage.Adapter
  @spec put(String.t(), String.t(), binary(), keyword()) ::
          {:ok, map()} | {:error, atom()}
  def put(tenant_id, path, content, opts \\ []) do
    with {:ok, key} <- build_key(tenant_id, path) do
      content_type = Keyword.get(opts, :content_type, detect_content_type(path))
      metadata = Keyword.get(opts, :metadata, %{})

      artifact = %{
        path: path,
        content: content,
        size: byte_size(content),
        content_type: content_type,
        etag: compute_etag(content),
        last_modified: DateTime.utc_now(),
        metadata: metadata
      }

      :ets.insert(@table, {key, artifact})

      {:ok, Map.delete(artifact, :content)}
    end
  end

  @impl Cybernetic.Storage.Adapter
  @spec get(String.t(), String.t()) :: {:ok, binary()} | {:error, atom()}
  def get(tenant_id, path) do
    with {:ok, key} <- build_key(tenant_id, path) do
      case :ets.lookup(@table, key) do
        [{^key, %{content: content}}] ->
          {:ok, content}

        [] ->
          {:error, :not_found}
      end
    end
  end

  @impl Cybernetic.Storage.Adapter
  @spec stream(String.t(), String.t(), keyword()) ::
          {:ok, Enumerable.t()} | {:error, atom()}
  def stream(tenant_id, path, opts) do
    case get(tenant_id, path) do
      {:ok, content} ->
        chunk_size = Keyword.get(opts, :chunk_size, 65_536)
        stream = chunk_stream(content, chunk_size)
        {:ok, stream}

      error ->
        error
    end
  end

  @impl Cybernetic.Storage.Adapter
  @spec delete(String.t(), String.t()) :: :ok | {:error, atom()}
  def delete(tenant_id, path) do
    with {:ok, key} <- build_key(tenant_id, path) do
      :ets.delete(@table, key)
      :ok
    end
  end

  @impl Cybernetic.Storage.Adapter
  @spec exists?(String.t(), String.t()) :: {:ok, boolean()} | {:error, atom()}
  def exists?(tenant_id, path) do
    with {:ok, key} <- build_key(tenant_id, path) do
      {:ok, :ets.member(@table, key)}
    end
  end

  @impl Cybernetic.Storage.Adapter
  @spec list(String.t(), String.t(), keyword()) ::
          {:ok, [map()]} | {:error, atom()}
  def list(tenant_id, prefix, opts \\ []) do
    with {:ok, _} <- PathValidator.validate_tenant(tenant_id) do
      recursive = Keyword.get(opts, :recursive, false)
      limit = Keyword.get(opts, :limit)

      prefix_pattern = "#{tenant_id}/#{prefix}"

      artifacts =
        :ets.tab2list(@table)
        |> Enum.filter(fn {key, _} ->
          String.starts_with?(key, prefix_pattern)
        end)
        |> Enum.filter(fn {key, _} ->
          if recursive do
            true
          else
            # Only include files in the immediate directory
            relative = String.replace_prefix(key, prefix_pattern, "")
            not String.contains?(String.trim_leading(relative, "/"), "/")
          end
        end)
        |> Enum.map(fn {_, artifact} ->
          Map.take(artifact, [:path, :size, :content_type, :etag, :last_modified, :metadata])
        end)
        |> maybe_limit(limit)

      {:ok, artifacts}
    end
  end

  @impl Cybernetic.Storage.Adapter
  @spec stat(String.t(), String.t()) :: {:ok, map()} | {:error, atom()}
  def stat(tenant_id, path) do
    with {:ok, key} <- build_key(tenant_id, path) do
      case :ets.lookup(@table, key) do
        [{^key, artifact}] ->
          {:ok,
           Map.take(artifact, [:path, :size, :content_type, :etag, :last_modified, :metadata])}

        [] ->
          {:error, :not_found}
      end
    end
  end

  # GenServer implementation

  @impl GenServer
  def init(_opts) do
    table = :ets.new(@table, [:named_table, :set, :public, read_concurrency: true])
    {:ok, %{table: table}}
  end

  @impl GenServer
  def handle_call(:clear, _from, state) do
    :ets.delete_all_objects(@table)
    {:reply, :ok, state}
  end

  @impl GenServer
  def handle_call({:clear, tenant_id}, _from, state) do
    # Clear all entries for a tenant
    :ets.tab2list(@table)
    |> Enum.filter(fn {key, _} -> String.starts_with?(key, "#{tenant_id}/") end)
    |> Enum.each(fn {key, _} -> :ets.delete(@table, key) end)

    {:reply, :ok, state}
  end

  @impl GenServer
  def handle_call(:count, _from, state) do
    count = :ets.info(@table, :size)
    {:reply, count, state}
  end

  # Private functions

  defp build_key(tenant_id, path) do
    with {:ok, _} <- PathValidator.validate_tenant(tenant_id),
         {:ok, valid_path} <- PathValidator.validate_path(path) do
      {:ok, "#{tenant_id}/#{valid_path}"}
    end
  end

  defp compute_etag(content) do
    :crypto.hash(:md5, content)
    |> Base.encode16(case: :lower)
  end

  defp detect_content_type(path) do
    ext = Path.extname(path) |> String.downcase()

    case ext do
      ".json" -> "application/json"
      ".html" -> "text/html"
      ".txt" -> "text/plain"
      ".xml" -> "application/xml"
      _ -> "application/octet-stream"
    end
  end

  defp chunk_stream(binary, chunk_size) do
    Stream.unfold(binary, fn
      <<>> ->
        nil

      data when byte_size(data) <= chunk_size ->
        {data, <<>>}

      data ->
        <<chunk::binary-size(chunk_size), rest::binary>> = data
        {chunk, rest}
    end)
  end

  defp maybe_limit(list, nil), do: list
  defp maybe_limit(list, limit), do: Enum.take(list, limit)
end
