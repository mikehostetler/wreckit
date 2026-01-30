defmodule Cybernetic.Storage.Adapters.Local do
  @moduledoc """
  Local filesystem storage adapter.

  Stores artifacts on the local filesystem with tenant isolation.

  ## Configuration

      config :cybernetic, :storage,
        adapter: Cybernetic.Storage.Adapters.Local,
        base_path: "/var/data/cybernetic",
        compute_etag: true

  ## Directory Structure

      base_path/
        tenant-1/
          artifacts/
            file1.json
            file2.bin
        tenant-2/
          artifacts/
            file3.json

  ## Features

  - Atomic writes via temp file + rename
  - Configurable ETag computation
  - Streaming for large files
  - Proper error wrapping
  """
  use Cybernetic.Storage.Adapter

  require Logger

  alias Cybernetic.Config
  alias Cybernetic.Storage.{ContentType, Error, PathValidator}

  @impl true
  @spec put(String.t(), String.t(), binary(), keyword()) ::
          {:ok, map()} | {:error, Error.t()}
  def put(tenant_id, path, content, opts \\ []) do
    with {:ok, full_path} <- build_full_path(tenant_id, path),
         :ok <- validate_content_size(content),
         :ok <- ensure_directory(full_path),
         :ok <- atomic_write(full_path, content) do
      content_type = Keyword.get(opts, :content_type, ContentType.from_path(path))
      metadata = Keyword.get(opts, :metadata, %{})

      artifact = %{
        path: path,
        size: byte_size(content),
        content_type: content_type,
        etag: maybe_compute_etag(content),
        last_modified: DateTime.utc_now(),
        metadata: metadata
      }

      Logger.debug("Stored artifact",
        tenant: tenant_id,
        path: path,
        size: artifact.size
      )

      {:ok, artifact}
    else
      {:error, %Error{} = err} ->
        {:error, err}

      {:error, reason} ->
        {:error, Error.wrap(reason, path: path, tenant_id: tenant_id, operation: :put)}
    end
  end

  # Atomic write: write to temp file then rename
  @spec atomic_write(String.t(), binary()) :: :ok | {:error, term()}
  defp atomic_write(path, content) do
    # Generate unique temp path in same directory
    tmp_path = "#{path}.#{System.unique_integer([:positive, :monotonic])}.tmp"

    with :ok <- File.write(tmp_path, content, [:sync]),
         :ok <- File.rename(tmp_path, path) do
      :ok
    else
      {:error, _reason} = error ->
        # Clean up temp file on failure
        File.rm(tmp_path)
        error
    end
  end

  # Validate content size if max is configured
  @spec validate_content_size(binary()) :: :ok | {:error, Error.t()}
  defp validate_content_size(content) do
    max_size = Config.storage_max_file_size()

    if max_size > 0 and byte_size(content) > max_size do
      {:error,
       Error.new(:quota_exceeded, message: "File exceeds maximum size of #{max_size} bytes")}
    else
      :ok
    end
  end

  @impl true
  @spec get(String.t(), String.t()) :: {:ok, binary()} | {:error, Error.t()}
  def get(tenant_id, path) do
    with {:ok, full_path} <- build_full_path(tenant_id, path) do
      case File.read(full_path) do
        {:ok, content} ->
          {:ok, content}

        {:error, reason} ->
          {:error, Error.wrap(reason, path: path, tenant_id: tenant_id, operation: :get)}
      end
    end
  end

  @impl true
  @spec stream(String.t(), String.t(), keyword()) ::
          {:ok, Enumerable.t()} | {:error, Error.t()}
  def stream(tenant_id, path, opts) do
    with {:ok, full_path} <- build_full_path(tenant_id, path),
         {:ok, true} <- exists?(tenant_id, path) do
      chunk_size = Keyword.get(opts, :chunk_size, Config.storage_chunk_size())

      stream =
        File.stream!(full_path, [], chunk_size)
        |> Stream.map(fn chunk -> chunk end)

      {:ok, stream}
    else
      {:ok, false} ->
        {:error, Error.new(:not_found, path: path, tenant_id: tenant_id, operation: :stream)}

      {:error, %Error{} = err} ->
        {:error, err}

      {:error, reason} ->
        {:error, Error.wrap(reason, path: path, tenant_id: tenant_id, operation: :stream)}
    end
  rescue
    e in File.Error ->
      Logger.error("Stream error", error: e.reason)
      {:error, Error.wrap(e.reason, path: path, tenant_id: tenant_id, operation: :stream)}
  end

  @impl true
  @spec delete(String.t(), String.t()) :: :ok | {:error, Error.t()}
  def delete(tenant_id, path) do
    with {:ok, full_path} <- build_full_path(tenant_id, path) do
      case File.rm(full_path) do
        :ok ->
          Logger.debug("Deleted artifact", tenant: tenant_id, path: path)
          :ok

        {:error, :enoent} ->
          # Already deleted, treat as success (idempotent)
          :ok

        {:error, reason} ->
          {:error, Error.wrap(reason, path: path, tenant_id: tenant_id, operation: :delete)}
      end
    end
  end

  @impl true
  @spec exists?(String.t(), String.t()) :: {:ok, boolean()} | {:error, Error.t()}
  def exists?(tenant_id, path) do
    with {:ok, full_path} <- build_full_path(tenant_id, path) do
      {:ok, File.exists?(full_path)}
    end
  end

  @impl true
  @spec list(String.t(), String.t(), keyword()) ::
          {:ok, [map()]} | {:error, Error.t()}
  def list(tenant_id, prefix, opts \\ []) do
    recursive = Keyword.get(opts, :recursive, false)
    limit = Keyword.get(opts, :limit)

    with {:ok, base_path} <- build_full_path(tenant_id, prefix) do
      if File.dir?(base_path) do
        files =
          if recursive do
            list_recursive(base_path)
          else
            list_directory(base_path)
          end

        artifacts =
          files
          |> Stream.map(&build_artifact_info(tenant_id, &1))
          |> Stream.filter(&(&1 != nil))
          |> maybe_limit(limit)
          |> Enum.to_list()

        {:ok, artifacts}
      else
        # If prefix is a file, return empty list
        {:ok, []}
      end
    end
  rescue
    e ->
      Logger.error("List error", error: inspect(e))
      {:error, Error.new(:storage_error, path: prefix, tenant_id: tenant_id, operation: :list)}
  end

  @impl true
  @spec stat(String.t(), String.t()) :: {:ok, map()} | {:error, Error.t()}
  def stat(tenant_id, path) do
    with {:ok, full_path} <- build_full_path(tenant_id, path) do
      case File.stat(full_path) do
        {:ok, %File.Stat{size: size, mtime: mtime, type: :regular}} ->
          artifact = %{
            path: path,
            size: size,
            content_type: ContentType.from_path(path),
            etag: nil,
            last_modified: naive_to_datetime(mtime),
            metadata: %{}
          }

          {:ok, artifact}

        {:ok, %File.Stat{type: :directory}} ->
          {:error,
           Error.new(:invalid_path,
             path: path,
             tenant_id: tenant_id,
             message: "Path is a directory"
           )}

        {:error, reason} ->
          {:error, Error.wrap(reason, path: path, tenant_id: tenant_id, operation: :stat)}
      end
    end
  end

  # Private functions

  @spec build_full_path(String.t(), String.t()) :: {:ok, String.t()} | {:error, Error.t()}
  defp build_full_path(tenant_id, path) do
    base_path = Config.storage_base_path()

    case PathValidator.build_path(base_path, tenant_id, path) do
      {:ok, _} = result ->
        result

      {:error, reason} when is_atom(reason) ->
        {:error, Error.new(reason, path: path, tenant_id: tenant_id)}

      error ->
        error
    end
  end

  @spec ensure_directory(String.t()) :: :ok | {:error, term()}
  defp ensure_directory(file_path) do
    dir = Path.dirname(file_path)

    case File.mkdir_p(dir) do
      :ok -> :ok
      {:error, :eexist} -> :ok
      error -> error
    end
  end

  # Optionally compute ETag based on config
  @spec maybe_compute_etag(binary()) :: String.t() | nil
  defp maybe_compute_etag(content) do
    if Config.storage_compute_etag?() do
      compute_etag(content)
    else
      nil
    end
  end

  @spec compute_etag(binary()) :: String.t()
  defp compute_etag(content) do
    :crypto.hash(:md5, content)
    |> Base.encode16(case: :lower)
  end

  @spec list_directory(String.t()) :: [String.t()]
  defp list_directory(path) do
    case File.ls(path) do
      {:ok, files} ->
        files
        |> Stream.map(&Path.join(path, &1))
        |> Stream.filter(&File.regular?/1)
        |> Enum.to_list()

      {:error, _} ->
        []
    end
  end

  @spec list_recursive(String.t()) :: [String.t()]
  defp list_recursive(path) do
    Path.wildcard(Path.join(path, "**/*"))
    |> Stream.filter(&File.regular?/1)
    |> Enum.to_list()
  end

  @spec build_artifact_info(String.t(), String.t()) :: map() | nil
  defp build_artifact_info(tenant_id, full_path) do
    base_path = Config.storage_base_path()
    tenant_path = Path.join(base_path, tenant_id)

    relative_path =
      full_path
      |> String.replace_prefix(tenant_path <> "/", "")

    case File.stat(full_path) do
      {:ok, %File.Stat{size: size, mtime: mtime}} ->
        %{
          path: relative_path,
          size: size,
          content_type: ContentType.from_path(full_path),
          etag: nil,
          last_modified: naive_to_datetime(mtime),
          metadata: %{}
        }

      _ ->
        nil
    end
  end

  @spec maybe_limit(Enumerable.t(), non_neg_integer() | nil) :: Enumerable.t()
  defp maybe_limit(stream, nil), do: stream
  defp maybe_limit(stream, limit), do: Stream.take(stream, limit)

  @spec naive_to_datetime(tuple()) :: DateTime.t()
  defp naive_to_datetime({{year, month, day}, {hour, min, sec}}) do
    DateTime.new!(Date.new!(year, month, day), Time.new!(hour, min, sec))
  end
end
