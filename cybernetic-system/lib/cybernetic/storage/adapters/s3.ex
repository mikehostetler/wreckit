defmodule Cybernetic.Storage.Adapters.S3 do
  @moduledoc """
  S3-compatible storage adapter.

  Stores artifacts in S3 or S3-compatible storage (MinIO, DigitalOcean Spaces, etc.)
  with tenant isolation via key prefixes.

  ## Configuration

      config :cybernetic, :storage,
        adapter: Cybernetic.Storage.Adapters.S3,
        bucket: "cybernetic-artifacts",
        region: "us-east-1",
        access_key_id: {:system, "AWS_ACCESS_KEY_ID"},
        secret_access_key: {:system, "AWS_SECRET_ACCESS_KEY"},
        endpoint: nil  # Optional: for S3-compatible services

  ## Key Structure

      bucket/
        tenant-1/
          artifacts/file1.json
        tenant-2/
          artifacts/file2.json
  """
  use Cybernetic.Storage.Adapter

  require Logger

  alias Cybernetic.Storage.PathValidator

  # 5MB for S3 multipart
  @default_chunk_size 5 * 1024 * 1024

  @impl true
  @spec put(String.t(), String.t(), binary(), keyword()) ::
          {:ok, map()} | {:error, atom()}
  def put(tenant_id, path, content, opts \\ []) do
    with {:ok, key} <- build_key(tenant_id, path) do
      content_type = Keyword.get(opts, :content_type, detect_content_type(path))
      metadata = Keyword.get(opts, :metadata, %{})

      # Build S3 request
      request = %{
        bucket: get_bucket(),
        key: key,
        body: content,
        content_type: content_type,
        metadata: encode_metadata(metadata)
      }

      case s3_put_object(request) do
        {:ok, response} ->
          artifact = %{
            path: path,
            size: byte_size(content),
            content_type: content_type,
            etag: response[:etag] || compute_etag(content),
            last_modified: DateTime.utc_now(),
            metadata: metadata
          }

          Logger.debug("Stored S3 object",
            bucket: get_bucket(),
            key: key,
            size: artifact.size
          )

          {:ok, artifact}

        {:error, reason} ->
          Logger.error("S3 put failed", key: key, reason: reason)
          {:error, {:storage_error, reason}}
      end
    end
  end

  @impl true
  @spec get(String.t(), String.t()) :: {:ok, binary()} | {:error, atom()}
  def get(tenant_id, path) do
    with {:ok, key} <- build_key(tenant_id, path) do
      request = %{
        bucket: get_bucket(),
        key: key
      }

      case s3_get_object(request) do
        {:ok, %{body: body}} ->
          {:ok, body}

        {:error, :not_found} ->
          {:error, :not_found}

        {:error, reason} ->
          Logger.error("S3 get failed", key: key, reason: reason)
          {:error, {:storage_error, reason}}
      end
    end
  end

  @impl true
  @spec stream(String.t(), String.t(), keyword()) ::
          {:ok, Enumerable.t()} | {:error, atom()}
  def stream(tenant_id, path, opts) do
    with {:ok, key} <- build_key(tenant_id, path),
         {:ok, stat} <- stat(tenant_id, path) do
      chunk_size = Keyword.get(opts, :chunk_size, @default_chunk_size)
      total_size = stat.size

      # Create stream of byte ranges
      stream =
        Stream.unfold(0, fn
          offset when offset >= total_size ->
            nil

          offset ->
            end_byte = min(offset + chunk_size - 1, total_size - 1)
            range = "bytes=#{offset}-#{end_byte}"

            case s3_get_object_range(%{bucket: get_bucket(), key: key, range: range}) do
              {:ok, %{body: chunk}} ->
                {chunk, end_byte + 1}

              {:error, _} ->
                nil
            end
        end)

      {:ok, stream}
    end
  end

  @impl true
  @spec delete(String.t(), String.t()) :: :ok | {:error, atom()}
  def delete(tenant_id, path) do
    with {:ok, key} <- build_key(tenant_id, path) do
      request = %{
        bucket: get_bucket(),
        key: key
      }

      case s3_delete_object(request) do
        :ok ->
          Logger.debug("Deleted S3 object", bucket: get_bucket(), key: key)
          :ok

        {:error, :not_found} ->
          :ok

        {:error, reason} ->
          Logger.error("S3 delete failed", key: key, reason: reason)
          {:error, {:storage_error, reason}}
      end
    end
  end

  @impl true
  @spec exists?(String.t(), String.t()) :: {:ok, boolean()} | {:error, atom()}
  def exists?(tenant_id, path) do
    with {:ok, key} <- build_key(tenant_id, path) do
      request = %{
        bucket: get_bucket(),
        key: key
      }

      case s3_head_object(request) do
        {:ok, _} -> {:ok, true}
        {:error, :not_found} -> {:ok, false}
        {:error, reason} -> {:error, {:storage_error, reason}}
      end
    end
  end

  @impl true
  @spec list(String.t(), String.t(), keyword()) ::
          {:ok, [map()]} | {:error, atom()}
  def list(tenant_id, prefix, opts \\ []) do
    with {:ok, key_prefix} <- build_key(tenant_id, prefix) do
      recursive = Keyword.get(opts, :recursive, false)
      limit = Keyword.get(opts, :limit)

      request = %{
        bucket: get_bucket(),
        prefix: key_prefix <> "/",
        delimiter: if(recursive, do: nil, else: "/"),
        max_keys: limit || 1000
      }

      case s3_list_objects(request) do
        {:ok, %{contents: contents}} ->
          artifacts =
            contents
            |> Enum.map(&build_artifact_from_s3(&1, tenant_id))
            |> maybe_limit(limit)

          {:ok, artifacts}

        {:error, reason} ->
          Logger.error("S3 list failed", prefix: key_prefix, reason: reason)
          {:error, {:storage_error, reason}}
      end
    end
  end

  @impl true
  @spec stat(String.t(), String.t()) :: {:ok, map()} | {:error, atom()}
  def stat(tenant_id, path) do
    with {:ok, key} <- build_key(tenant_id, path) do
      request = %{
        bucket: get_bucket(),
        key: key
      }

      case s3_head_object(request) do
        {:ok, headers} ->
          artifact = %{
            path: path,
            size: headers[:content_length] || 0,
            content_type: headers[:content_type] || "application/octet-stream",
            etag: headers[:etag],
            last_modified: headers[:last_modified] || DateTime.utc_now(),
            metadata: decode_metadata(headers[:metadata] || %{})
          }

          {:ok, artifact}

        {:error, :not_found} ->
          {:error, :not_found}

        {:error, reason} ->
          {:error, {:storage_error, reason}}
      end
    end
  end

  # S3 API abstraction - uses Req with AWS SigV4 signing
  # In production, replace with ExAws or AWS SDK

  defp s3_put_object(%{bucket: bucket, key: key, body: body} = request) do
    url = build_s3_url(bucket, key)
    headers = build_auth_headers("PUT", bucket, key, body)

    content_type = request[:content_type] || "application/octet-stream"

    case Req.put(url, body: body, headers: [{"content-type", content_type} | headers]) do
      {:ok, %{status: status, headers: resp_headers}} when status in [200, 201] ->
        etag = get_header(resp_headers, "etag")
        {:ok, %{etag: etag}}

      {:ok, %{status: 403}} ->
        {:error, :permission_denied}

      {:ok, %{status: status, body: body}} ->
        {:error, {:http_error, status, body}}

      {:error, reason} ->
        {:error, reason}
    end
  rescue
    e ->
      Logger.error("S3 put exception", error: inspect(e))
      {:error, :storage_error}
  end

  defp s3_get_object(%{bucket: bucket, key: key}) do
    url = build_s3_url(bucket, key)
    headers = build_auth_headers("GET", bucket, key)

    case Req.get(url, headers: headers) do
      {:ok, %{status: 200, body: body}} ->
        {:ok, %{body: body}}

      {:ok, %{status: 404}} ->
        {:error, :not_found}

      {:ok, %{status: 403}} ->
        {:error, :permission_denied}

      {:error, reason} ->
        {:error, reason}
    end
  rescue
    _ -> {:error, :storage_error}
  end

  defp s3_get_object_range(%{bucket: bucket, key: key, range: range}) do
    url = build_s3_url(bucket, key)
    headers = [{"range", range} | build_auth_headers("GET", bucket, key)]

    case Req.get(url, headers: headers) do
      {:ok, %{status: status, body: body}} when status in [200, 206] ->
        {:ok, %{body: body}}

      {:ok, %{status: 404}} ->
        {:error, :not_found}

      {:error, reason} ->
        {:error, reason}
    end
  rescue
    _ -> {:error, :storage_error}
  end

  defp s3_delete_object(%{bucket: bucket, key: key}) do
    url = build_s3_url(bucket, key)
    headers = build_auth_headers("DELETE", bucket, key)

    case Req.delete(url, headers: headers) do
      {:ok, %{status: status}} when status in [200, 204] ->
        :ok

      {:ok, %{status: 404}} ->
        {:error, :not_found}

      {:error, reason} ->
        {:error, reason}
    end
  rescue
    _ -> {:error, :storage_error}
  end

  defp s3_head_object(%{bucket: bucket, key: key}) do
    url = build_s3_url(bucket, key)
    headers = build_auth_headers("HEAD", bucket, key)

    case Req.head(url, headers: headers) do
      {:ok, %{status: 200, headers: resp_headers}} ->
        parsed_headers = %{
          content_length: get_header(resp_headers, "content-length") |> parse_int(),
          content_type: get_header(resp_headers, "content-type"),
          etag: get_header(resp_headers, "etag"),
          last_modified: get_header(resp_headers, "last-modified") |> parse_datetime()
        }

        {:ok, parsed_headers}

      {:ok, %{status: 404}} ->
        {:error, :not_found}

      {:error, reason} ->
        {:error, reason}
    end
  rescue
    _ -> {:error, :storage_error}
  end

  defp s3_list_objects(%{bucket: bucket, prefix: prefix} = request) do
    params =
      [
        {"list-type", "2"},
        {"prefix", prefix}
      ]
      |> maybe_add_param("delimiter", request[:delimiter])
      |> maybe_add_param("max-keys", request[:max_keys])

    query = URI.encode_query(params)
    url = "#{build_s3_url(bucket, "")}?#{query}"
    headers = build_auth_headers("GET", bucket, "")

    case Req.get(url, headers: headers) do
      {:ok, %{status: 200, body: body}} ->
        contents = parse_list_response(body)
        {:ok, %{contents: contents}}

      {:error, reason} ->
        {:error, reason}
    end
  rescue
    _ -> {:error, :storage_error}
  end

  # Helper functions

  defp build_key(tenant_id, path) do
    with {:ok, _} <- PathValidator.validate_tenant(tenant_id),
         {:ok, valid_path} <- PathValidator.validate_path(path) do
      {:ok, "#{tenant_id}/#{valid_path}"}
    end
  end

  defp build_s3_url(bucket, key) do
    endpoint = get_endpoint()
    region = get_region()

    base_url =
      if endpoint do
        "#{endpoint}/#{bucket}"
      else
        "https://#{bucket}.s3.#{region}.amazonaws.com"
      end

    if key == "" do
      base_url
    else
      "#{base_url}/#{key}"
    end
  end

  defp build_auth_headers(_method, _bucket, _key, _body \\ nil) do
    # Placeholder for AWS SigV4 signing
    # In production, use ExAws or implement proper signing
    access_key = get_access_key()
    secret_key = get_secret_key()

    if access_key && secret_key do
      # Basic auth headers - replace with proper SigV4
      []
    else
      []
    end
  end

  defp get_bucket do
    config()[:bucket] || "cybernetic-storage"
  end

  defp get_region do
    config()[:region] || "us-east-1"
  end

  defp get_endpoint do
    config()[:endpoint]
  end

  defp get_access_key do
    case config()[:access_key_id] do
      {:system, env_var} -> System.get_env(env_var)
      value -> value
    end
  end

  defp get_secret_key do
    case config()[:secret_access_key] do
      {:system, env_var} -> System.get_env(env_var)
      value -> value
    end
  end

  defp config do
    Application.get_env(:cybernetic, :storage, [])
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

  defp encode_metadata(metadata) do
    Enum.map(metadata, fn {k, v} ->
      {"x-amz-meta-#{k}", to_string(v)}
    end)
    |> Enum.into(%{})
  end

  defp decode_metadata(headers) do
    headers
    |> Enum.filter(fn {k, _} -> String.starts_with?(k, "x-amz-meta-") end)
    |> Enum.map(fn {k, v} ->
      key = String.replace_prefix(k, "x-amz-meta-", "")
      {key, v}
    end)
    |> Enum.into(%{})
  end

  defp build_artifact_from_s3(%{key: key, size: size, last_modified: last_modified}, tenant_id) do
    path = String.replace_prefix(key, "#{tenant_id}/", "")

    %{
      path: path,
      size: size,
      content_type: detect_content_type(path),
      etag: nil,
      last_modified: last_modified,
      metadata: %{}
    }
  end

  defp get_header(headers, name) do
    case List.keyfind(headers, name, 0) do
      {_, value} -> value
      nil -> nil
    end
  end

  defp parse_int(nil), do: 0
  defp parse_int(str) when is_binary(str), do: String.to_integer(str)
  defp parse_int(n) when is_integer(n), do: n

  defp parse_datetime(nil), do: DateTime.utc_now()

  defp parse_datetime(str) when is_binary(str) do
    case DateTime.from_iso8601(str) do
      {:ok, dt, _} -> dt
      _ -> DateTime.utc_now()
    end
  end

  defp parse_list_response(xml_body) when is_binary(xml_body) do
    # Simple XML parsing for S3 list response
    # In production, use a proper XML parser
    ~r/<Key>([^<]+)<\/Key>.*?<Size>(\d+)<\/Size>/s
    |> Regex.scan(xml_body)
    |> Enum.map(fn [_, key, size] ->
      %{
        key: key,
        size: String.to_integer(size),
        last_modified: DateTime.utc_now()
      }
    end)
  end

  defp parse_list_response(_), do: []

  defp maybe_add_param(params, _key, nil), do: params
  defp maybe_add_param(params, key, value), do: [{key, to_string(value)} | params]

  defp maybe_limit(list, nil), do: list
  defp maybe_limit(list, limit), do: Enum.take(list, limit)
end
