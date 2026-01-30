defmodule Cybernetic.Storage do
  @moduledoc """
  Storage abstraction layer for the Cybernetic VSM platform.

  Provides a unified interface for storing and retrieving artifacts
  across different storage backends (local filesystem, S3, memory).

  ## Configuration

      config :cybernetic, :storage,
        adapter: Cybernetic.Storage.Adapters.Local,
        base_path: "/var/data/cybernetic"

  ## Adapters

  - `Cybernetic.Storage.Adapters.Local` - Local filesystem storage
  - `Cybernetic.Storage.Adapters.S3` - S3-compatible object storage
  - `Cybernetic.Storage.Adapters.Memory` - In-memory storage for testing

  ## Example

      # Store an artifact
      {:ok, artifact} = Cybernetic.Storage.put("tenant-1", "data/file.json", content)

      # Retrieve an artifact
      {:ok, content} = Cybernetic.Storage.get("tenant-1", "data/file.json")

      # Stream a large file
      {:ok, stream} = Cybernetic.Storage.stream("tenant-1", "data/large.bin")
      Enum.each(stream, &process_chunk/1)

      # Check existence
      {:ok, true} = Cybernetic.Storage.exists?("tenant-1", "data/file.json")

      # List files
      {:ok, artifacts} = Cybernetic.Storage.list("tenant-1", "data/", recursive: true)

      # Delete a file
      :ok = Cybernetic.Storage.delete("tenant-1", "data/file.json")
  """

  require Logger

  @type path :: String.t()
  @type tenant_id :: String.t()
  @type content :: binary()
  @type artifact :: Cybernetic.Storage.Adapter.artifact()
  @type error :: Cybernetic.Storage.Adapter.error_reason()

  @default_adapter Cybernetic.Storage.Adapters.Local
  # 1MB
  @streaming_threshold 1_048_576

  @doc """
  Get the configured storage adapter module.

  ## Returns

      Adapter module name
  """
  @spec adapter() :: module()
  def adapter do
    Application.get_env(:cybernetic, :storage, [])
    |> Keyword.get(:adapter, @default_adapter)
  end

  @doc """
  Store content at a path.

  Automatically uses streaming for large files (>1MB).

  ## Parameters

    * `tenant_id` - Tenant identifier for isolation
    * `path` - Relative path within tenant namespace
    * `content` - Binary content to store
    * `opts` - Optional metadata and options

  ## Options

    * `:content_type` - MIME type
    * `:metadata` - Additional metadata map

  ## Returns

    * `{:ok, artifact}` - Artifact metadata on success
    * `{:error, reason}` - Error tuple on failure

  ## Example

      {:ok, artifact} = Cybernetic.Storage.put("tenant-1", "data/file.json", ~s({"key": "value"}),
        content_type: "application/json",
        metadata: %{"author" => "system"}
      )
  """
  @spec put(tenant_id(), path(), content(), keyword()) ::
          {:ok, artifact()} | {:error, error()}
  def put(tenant_id, path, content, opts \\ []) do
    adapter().put(tenant_id, path, content, opts)
  end

  @doc """
  Retrieve content from a path.

  ## Parameters

    * `tenant_id` - Tenant identifier
    * `path` - Relative path within tenant namespace

  ## Returns

    * `{:ok, content}` - Binary content on success
    * `{:error, reason}` - Error tuple on failure

  ## Example

      {:ok, content} = Cybernetic.Storage.get("tenant-1", "data/file.json")
  """
  @spec get(tenant_id(), path()) :: {:ok, content()} | {:error, error()}
  def get(tenant_id, path) do
    adapter().get(tenant_id, path)
  end

  @doc """
  Stream content from a path for large files.

  Returns an enumerable stream of binary chunks.

  ## Parameters

    * `tenant_id` - Tenant identifier
    * `path` - Relative path within tenant namespace
    * `opts` - Optional streaming options

  ## Options

    * `:chunk_size` - Size of each chunk (default: 65536)

  ## Returns

    * `{:ok, stream}` - Enumerable stream of chunks
    * `{:error, reason}` - Error tuple on failure

  ## Example

      {:ok, stream} = Cybernetic.Storage.stream("tenant-1", "data/large.bin")

      # Process chunks
      Enum.each(stream, fn chunk ->
        process_chunk(chunk)
      end)

      # Or write to another destination
      stream
      |> Enum.into(File.stream!("/tmp/output.bin"))
  """
  @spec stream(tenant_id(), path(), keyword()) ::
          {:ok, Enumerable.t()} | {:error, error()}
  def stream(tenant_id, path, opts \\ []) do
    adapter().stream(tenant_id, path, opts)
  end

  @doc """
  Delete content at a path.

  ## Parameters

    * `tenant_id` - Tenant identifier
    * `path` - Relative path within tenant namespace

  ## Returns

    * `:ok` - On successful deletion
    * `{:error, reason}` - Error tuple on failure

  ## Example

      :ok = Cybernetic.Storage.delete("tenant-1", "data/file.json")
  """
  @spec delete(tenant_id(), path()) :: :ok | {:error, error()}
  def delete(tenant_id, path) do
    adapter().delete(tenant_id, path)
  end

  @doc """
  Check if a path exists.

  ## Parameters

    * `tenant_id` - Tenant identifier
    * `path` - Relative path within tenant namespace

  ## Returns

    * `{:ok, true}` - Path exists
    * `{:ok, false}` - Path does not exist
    * `{:error, reason}` - Error tuple on failure

  ## Example

      {:ok, exists} = Cybernetic.Storage.exists?("tenant-1", "data/file.json")
  """
  @spec exists?(tenant_id(), path()) :: {:ok, boolean()} | {:error, error()}
  def exists?(tenant_id, path) do
    adapter().exists?(tenant_id, path)
  end

  @doc """
  List files in a directory path.

  ## Parameters

    * `tenant_id` - Tenant identifier
    * `prefix` - Directory prefix to list
    * `opts` - Optional listing options

  ## Options

    * `:recursive` - Include subdirectories (default: false)
    * `:limit` - Maximum number of results

  ## Returns

    * `{:ok, [artifact]}` - List of artifact metadata
    * `{:error, reason}` - Error tuple on failure

  ## Example

      {:ok, artifacts} = Cybernetic.Storage.list("tenant-1", "data/", recursive: true)
  """
  @spec list(tenant_id(), path(), keyword()) ::
          {:ok, [artifact()]} | {:error, error()}
  def list(tenant_id, prefix, opts \\ []) do
    adapter().list(tenant_id, prefix, opts)
  end

  @doc """
  Get metadata for a path without reading content.

  ## Parameters

    * `tenant_id` - Tenant identifier
    * `path` - Relative path within tenant namespace

  ## Returns

    * `{:ok, artifact}` - Artifact metadata on success
    * `{:error, reason}` - Error tuple on failure

  ## Example

      {:ok, stat} = Cybernetic.Storage.stat("tenant-1", "data/file.json")
      IO.puts("File size: \#{stat.size}")
  """
  @spec stat(tenant_id(), path()) :: {:ok, artifact()} | {:error, error()}
  def stat(tenant_id, path) do
    adapter().stat(tenant_id, path)
  end

  @doc """
  Copy an artifact from one path to another.

  ## Parameters

    * `tenant_id` - Tenant identifier
    * `source` - Source path
    * `destination` - Destination path
    * `opts` - Optional options

  ## Returns

    * `{:ok, artifact}` - New artifact metadata on success
    * `{:error, reason}` - Error tuple on failure
  """
  @spec copy(tenant_id(), path(), path(), keyword()) ::
          {:ok, artifact()} | {:error, error()}
  def copy(tenant_id, source, destination, opts \\ []) do
    with {:ok, content} <- get(tenant_id, source) do
      put(tenant_id, destination, content, opts)
    end
  end

  @doc """
  Move an artifact from one path to another.

  ## Parameters

    * `tenant_id` - Tenant identifier
    * `source` - Source path
    * `destination` - Destination path
    * `opts` - Optional options

  ## Returns

    * `{:ok, artifact}` - New artifact metadata on success
    * `{:error, reason}` - Error tuple on failure
  """
  @spec move(tenant_id(), path(), path(), keyword()) ::
          {:ok, artifact()} | {:error, error()}
  def move(tenant_id, source, destination, opts \\ []) do
    with {:ok, artifact} <- copy(tenant_id, source, destination, opts),
         :ok <- delete(tenant_id, source) do
      {:ok, artifact}
    end
  end

  @doc """
  Store content using streaming for large files.

  Automatically chunks content and handles large uploads efficiently.

  ## Parameters

    * `tenant_id` - Tenant identifier
    * `path` - Destination path
    * `stream` - Enumerable stream of binary chunks
    * `opts` - Optional options

  ## Returns

    * `{:ok, artifact}` - Artifact metadata on success
    * `{:error, reason}` - Error tuple on failure
  """
  @spec put_stream(tenant_id(), path(), Enumerable.t(), keyword()) ::
          {:ok, artifact()} | {:error, error()}
  def put_stream(tenant_id, path, stream, opts \\ []) do
    # Collect stream to binary and store
    content =
      stream
      |> Enum.to_list()
      |> IO.iodata_to_binary()

    put(tenant_id, path, content, opts)
  end

  @doc """
  Check if content should be streamed based on size threshold.

  ## Parameters

    * `size` - Content size in bytes

  ## Returns

    * `true` if content should be streamed
    * `false` otherwise
  """
  @spec should_stream?(non_neg_integer()) :: boolean()
  def should_stream?(size) do
    threshold = get_streaming_threshold()
    size > threshold
  end

  # Private functions

  defp get_streaming_threshold do
    Application.get_env(:cybernetic, :storage, [])
    |> Keyword.get(:streaming_threshold, @streaming_threshold)
  end
end
