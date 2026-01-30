defmodule Cybernetic.Storage.Adapter do
  @moduledoc """
  Behaviour for storage adapters.

  Defines a common interface for storing and retrieving artifacts
  across different storage backends (local filesystem, S3, memory).

  ## Configuration

      config :cybernetic, :storage,
        adapter: Cybernetic.Storage.Adapters.Local,
        base_path: "/var/data/cybernetic",
        streaming_threshold: 1_048_576  # 1MB

  ## Security

  All paths are validated to prevent directory traversal attacks.
  Tenant isolation is enforced at the path level.

  ## Example

      # Get the configured adapter
      adapter = Cybernetic.Storage.adapter()

      # Write a file
      {:ok, artifact} = adapter.put("tenant-1", "artifacts/data.json", content)

      # Read a file
      {:ok, content} = adapter.get("tenant-1", "artifacts/data.json")

      # Stream a large file
      {:ok, stream} = adapter.stream("tenant-1", "artifacts/large.bin")
  """

  @type path :: String.t()
  @type tenant_id :: String.t()
  @type content :: binary()
  @type metadata :: map()
  @type artifact :: %{
          path: path(),
          size: non_neg_integer(),
          content_type: String.t(),
          etag: String.t(),
          last_modified: DateTime.t(),
          metadata: metadata()
        }
  @type error_reason ::
          :not_found
          | :invalid_path
          | :path_traversal
          | :permission_denied
          | :storage_error
          | {:storage_error, term()}

  @doc """
  Write content to a storage path.

  ## Parameters

    * `tenant_id` - Tenant identifier for isolation
    * `path` - Relative path within tenant namespace
    * `content` - Binary content to store
    * `opts` - Optional metadata and options

  ## Options

    * `:content_type` - MIME type (default: application/octet-stream)
    * `:metadata` - Additional metadata map

  ## Returns

    * `{:ok, artifact}` - Artifact metadata on success
    * `{:error, reason}` - Error tuple on failure
  """
  @callback put(tenant_id(), path(), content(), keyword()) ::
              {:ok, artifact()} | {:error, error_reason()}

  @doc """
  Read content from a storage path.

  ## Parameters

    * `tenant_id` - Tenant identifier
    * `path` - Relative path within tenant namespace

  ## Returns

    * `{:ok, content}` - Binary content on success
    * `{:error, reason}` - Error tuple on failure
  """
  @callback get(tenant_id(), path()) :: {:ok, content()} | {:error, error_reason()}

  @doc """
  Stream content from a storage path for large files.

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
  """
  @callback stream(tenant_id(), path(), keyword()) ::
              {:ok, Enumerable.t()} | {:error, error_reason()}

  @doc """
  Delete content at a storage path.

  ## Parameters

    * `tenant_id` - Tenant identifier
    * `path` - Relative path within tenant namespace

  ## Returns

    * `:ok` - On successful deletion
    * `{:error, reason}` - Error tuple on failure
  """
  @callback delete(tenant_id(), path()) :: :ok | {:error, error_reason()}

  @doc """
  Check if a path exists.

  ## Parameters

    * `tenant_id` - Tenant identifier
    * `path` - Relative path within tenant namespace

  ## Returns

    * `{:ok, true}` - Path exists
    * `{:ok, false}` - Path does not exist
    * `{:error, reason}` - Error tuple on failure
  """
  @callback exists?(tenant_id(), path()) :: {:ok, boolean()} | {:error, error_reason()}

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
  """
  @callback list(tenant_id(), path(), keyword()) ::
              {:ok, [artifact()]} | {:error, error_reason()}

  @doc """
  Get metadata for a path without reading content.

  ## Parameters

    * `tenant_id` - Tenant identifier
    * `path` - Relative path within tenant namespace

  ## Returns

    * `{:ok, artifact}` - Artifact metadata on success
    * `{:error, reason}` - Error tuple on failure
  """
  @callback stat(tenant_id(), path()) :: {:ok, artifact()} | {:error, error_reason()}

  # Default implementations via __using__

  defmacro __using__(_opts) do
    quote do
      @behaviour Cybernetic.Storage.Adapter

      import Cybernetic.Storage.PathValidator

      @doc false
      def stream(tenant_id, path, opts \\ []) do
        # Default: read and wrap in stream
        case get(tenant_id, path) do
          {:ok, content} ->
            chunk_size = Keyword.get(opts, :chunk_size, 65_536)
            stream = content |> Stream.unfold(&chunk_binary(&1, chunk_size))
            {:ok, stream}

          error ->
            error
        end
      end

      defp chunk_binary(<<>>, _size), do: nil
      defp chunk_binary(binary, size) when byte_size(binary) <= size, do: {binary, <<>>}

      defp chunk_binary(binary, size) do
        <<chunk::binary-size(size), rest::binary>> = binary
        {chunk, rest}
      end

      defoverridable stream: 3
    end
  end
end
