defmodule Cybernetic.Content.Connectors.GoogleDrive do
  @moduledoc """
  Google Drive connector using the Drive API v3.

  Syncs files and folders from Google Drive, supporting:
  - OAuth 2.0 authentication flow
  - Changes API for incremental sync
  - Shared drive support
  - File export (Google Docs → text/html)

  Configuration:
  - client_id: OAuth client ID
  - client_secret: OAuth client secret
  - refresh_token: OAuth refresh token
  - folder_id: Root folder to sync (optional, defaults to "root")
  - options: include_shared_drives, export_format, etc.

  Required OAuth scopes:
  - https://www.googleapis.com/auth/drive.readonly
  - https://www.googleapis.com/auth/drive.metadata.readonly
  """

  @behaviour Cybernetic.Content.Connectors.Connector

  require Logger

  alias Cybernetic.Content.Connectors.Connector

  @drive_api_base "https://www.googleapis.com/drive/v3"
  @oauth_token_url "https://oauth2.googleapis.com/token"
  @default_page_size 100
  @request_timeout 30_000

  # Google Workspace MIME types and their export formats
  @google_mime_exports %{
    "application/vnd.google-apps.document" => "text/html",
    "application/vnd.google-apps.spreadsheet" => "text/csv",
    "application/vnd.google-apps.presentation" => "text/plain",
    "application/vnd.google-apps.drawing" => "image/png"
  }

  # Callbacks

  @impl Connector
  def init(config) do
    client_id = Map.fetch!(config, :client_id)
    client_secret = Map.fetch!(config, :client_secret)
    refresh_token = Map.fetch!(config, :refresh_token)
    options = Map.get(config, :options, [])

    state = %{
      client_id: client_id,
      client_secret: client_secret,
      refresh_token: refresh_token,
      access_token: nil,
      token_expires_at: nil,
      folder_id: Keyword.get(options, :folder_id, "root"),
      include_shared_drives: Keyword.get(options, :include_shared_drives, false),
      page_size: Keyword.get(options, :page_size, @default_page_size),
      start_page_token: nil
    }

    # Get initial access token
    case refresh_access_token(state) do
      {:ok, new_state} -> {:ok, new_state}
      {:error, reason} -> {:error, {:auth_failed, reason}}
    end
  end

  @impl Connector
  def test_connection(state) do
    with {:ok, state} <- ensure_valid_token(state) do
      url = "#{@drive_api_base}/about?fields=user"

      case make_request(state, url) do
        {:ok, %{status: 200}} -> :ok
        {:ok, %{status: 401}} -> {:error, :unauthorized}
        {:ok, %{status: status}} -> {:error, {:http_error, status}}
        {:error, reason} -> {:error, reason}
      end
    end
  end

  @impl Connector
  def list_content(state, opts \\ []) do
    with {:ok, state} <- ensure_valid_token(state) do
      folder_id = Keyword.get(opts, :folder_id, state.folder_id)
      page_token = Keyword.get(opts, :page_token)

      query = build_query(folder_id, opts)
      params = build_list_params(state, query, page_token)
      url = "#{@drive_api_base}/files?#{URI.encode_query(params)}"

      case make_request(state, url) do
        {:ok, %{status: 200, body: body}} ->
          files = Map.get(body, "files", [])
          items = Enum.map(files, &parse_file/1)
          {:ok, items}

        {:ok, %{status: status}} ->
          {:error, {:http_error, status}}

        {:error, reason} ->
          {:error, reason}
      end
    end
  end

  @impl Connector
  def get_content(state, file_id) do
    with {:ok, state} <- ensure_valid_token(state) do
      # Get file metadata
      url = "#{@drive_api_base}/files/#{file_id}?fields=*"

      case make_request(state, url) do
        {:ok, %{status: 200, body: file}} ->
          item = parse_file(file)

          # Download or export content
          case download_content(state, file) do
            {:ok, content} ->
              {:ok, Map.put(item, :content, content)}

            {:error, reason} ->
              {:error, reason}
          end

        {:ok, %{status: 404}} ->
          {:error, :not_found}

        {:ok, %{status: status}} ->
          {:error, {:http_error, status}}

        {:error, reason} ->
          {:error, reason}
      end
    end
  end

  @impl Connector
  def get_changes(state, _since) do
    # Google Drive uses page tokens instead of timestamps
    # The `since` parameter is ignored; we use stored page token
    with {:ok, state} <- ensure_valid_token(state),
         {:ok, state} <- ensure_start_page_token(state) do
      fetch_changes(state, state.start_page_token, [])
    end
  end

  @impl Connector
  def sync(state, opts \\ []) do
    container_server = Keyword.get(opts, :container_server)
    tenant_id = Keyword.get(opts, :tenant_id)
    incremental = Keyword.get(opts, :incremental, true)

    result = %{created: 0, updated: 0, deleted: 0, errors: []}

    items =
      if incremental do
        case get_changes(state, DateTime.utc_now()) do
          {:ok, items} -> items
          {:error, _} -> []
        end
      else
        # Full sync - list all files
        fetch_all_files(state)
      end

    # Process items
    final_result =
      Enum.reduce(items, result, fn item, acc ->
        if item.metadata[:trashed] do
          %{acc | deleted: acc.deleted + 1}
        else
          case process_item(state, item, container_server, tenant_id) do
            {:ok, :created} -> %{acc | created: acc.created + 1}
            {:ok, :updated} -> %{acc | updated: acc.updated + 1}
            {:error, reason} -> %{acc | errors: [{item.id, reason} | acc.errors]}
          end
        end
      end)

    {:ok, final_result}
  end

  @impl Connector
  def cleanup(_state), do: :ok

  # Private Functions

  @spec refresh_access_token(map()) :: {:ok, map()} | {:error, term()}
  defp refresh_access_token(state) do
    body = %{
      client_id: state.client_id,
      client_secret: state.client_secret,
      refresh_token: state.refresh_token,
      grant_type: "refresh_token"
    }

    case Req.post(@oauth_token_url, form: body, receive_timeout: @request_timeout) do
      {:ok, %{status: 200, body: %{"access_token" => token, "expires_in" => expires_in}}} ->
        expires_at = DateTime.add(DateTime.utc_now(), expires_in, :second)

        {:ok, %{state | access_token: token, token_expires_at: expires_at}}

      {:ok, %{status: status, body: body}} ->
        {:error, {:token_refresh_failed, status, body}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  @spec ensure_valid_token(map()) :: {:ok, map()} | {:error, term()}
  defp ensure_valid_token(state) do
    if token_valid?(state) do
      {:ok, state}
    else
      refresh_access_token(state)
    end
  end

  @spec token_valid?(map()) :: boolean()
  defp token_valid?(%{access_token: nil}), do: false

  defp token_valid?(%{token_expires_at: expires_at}) do
    # Consider token invalid 5 minutes before expiry
    buffer = DateTime.add(DateTime.utc_now(), 300, :second)
    DateTime.compare(expires_at, buffer) == :gt
  end

  @spec ensure_start_page_token(map()) :: {:ok, map()} | {:error, term()}
  defp ensure_start_page_token(%{start_page_token: token} = state) when not is_nil(token) do
    {:ok, state}
  end

  defp ensure_start_page_token(state) do
    params = %{
      supportsAllDrives: state.include_shared_drives
    }

    url = "#{@drive_api_base}/changes/startPageToken?#{URI.encode_query(params)}"

    case make_request(state, url) do
      {:ok, %{status: 200, body: %{"startPageToken" => token}}} ->
        {:ok, %{state | start_page_token: token}}

      {:ok, %{status: status}} ->
        {:error, {:http_error, status}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  @spec make_request(map(), String.t()) :: {:ok, Req.Response.t()} | {:error, term()}
  defp make_request(state, url) do
    headers = [{"authorization", "Bearer #{state.access_token}"}]

    Req.get(url,
      headers: headers,
      receive_timeout: @request_timeout,
      decode_json: [keys: :strings]
    )
  rescue
    e -> {:error, Exception.message(e)}
  end

  @spec build_query(String.t(), keyword()) :: String.t()
  defp build_query(folder_id, opts) do
    mime_filter = Keyword.get(opts, :mime_type)
    include_trashed = Keyword.get(opts, :include_trashed, false)

    parts = ["'#{folder_id}' in parents"]

    parts =
      if mime_filter do
        parts ++ ["mimeType='#{mime_filter}'"]
      else
        parts
      end

    parts =
      if not include_trashed do
        parts ++ ["trashed=false"]
      else
        parts
      end

    Enum.join(parts, " and ")
  end

  @spec build_list_params(map(), String.t(), String.t() | nil) :: map()
  defp build_list_params(state, query, page_token) do
    params = %{
      q: query,
      pageSize: state.page_size,
      fields:
        "nextPageToken,files(id,name,mimeType,size,modifiedTime,createdTime,webViewLink,trashed,parents)",
      supportsAllDrives: state.include_shared_drives,
      includeItemsFromAllDrives: state.include_shared_drives
    }

    if page_token do
      Map.put(params, :pageToken, page_token)
    else
      params
    end
  end

  @spec parse_file(map()) :: Connector.content_item()
  defp parse_file(file) do
    mime_type = file["mimeType"]

    %{
      id: file["id"],
      title: file["name"],
      content: "",
      content_type: export_mime_type(mime_type),
      url: file["webViewLink"],
      author: nil,
      published_at: parse_datetime(file["createdTime"]),
      updated_at: parse_datetime(file["modifiedTime"]),
      metadata: %{
        mime_type: mime_type,
        size: file["size"],
        trashed: file["trashed"] || false,
        parents: file["parents"] || []
      }
    }
  end

  @spec export_mime_type(String.t()) :: String.t()
  defp export_mime_type(mime_type) do
    Map.get(@google_mime_exports, mime_type, mime_type)
  end

  @spec parse_datetime(String.t() | nil) :: DateTime.t() | nil
  defp parse_datetime(nil), do: nil

  defp parse_datetime(str) do
    case DateTime.from_iso8601(str) do
      {:ok, dt, _} -> dt
      _ -> nil
    end
  end

  @spec download_content(map(), map()) :: {:ok, binary()} | {:error, term()}
  defp download_content(state, file) do
    file_id = file["id"]
    mime_type = file["mimeType"]

    if Map.has_key?(@google_mime_exports, mime_type) do
      # Google Workspace file - export
      export_mime = Map.get(@google_mime_exports, mime_type)
      url = "#{@drive_api_base}/files/#{file_id}/export?mimeType=#{URI.encode(export_mime)}"
      download_binary(state, url)
    else
      # Regular file - download
      url = "#{@drive_api_base}/files/#{file_id}?alt=media"
      download_binary(state, url)
    end
  end

  @spec download_binary(map(), String.t()) :: {:ok, binary()} | {:error, term()}
  defp download_binary(state, url) do
    headers = [{"authorization", "Bearer #{state.access_token}"}]

    case Req.get(url, headers: headers, receive_timeout: @request_timeout * 2, decode_body: false) do
      {:ok, %{status: 200, body: body}} -> {:ok, body}
      {:ok, %{status: status}} -> {:error, {:download_failed, status}}
      {:error, reason} -> {:error, reason}
    end
  end

  @spec fetch_changes(map(), String.t(), [Connector.content_item()]) ::
          {:ok, [Connector.content_item()]} | {:error, term()}
  defp fetch_changes(state, page_token, acc) do
    params = %{
      pageToken: page_token,
      pageSize: state.page_size,
      fields:
        "nextPageToken,newStartPageToken,changes(fileId,removed,file(id,name,mimeType,size,modifiedTime,createdTime,webViewLink,trashed,parents))",
      supportsAllDrives: state.include_shared_drives,
      includeItemsFromAllDrives: state.include_shared_drives
    }

    url = "#{@drive_api_base}/changes?#{URI.encode_query(params)}"

    case make_request(state, url) do
      {:ok, %{status: 200, body: body}} ->
        changes = Map.get(body, "changes", [])

        items =
          changes
          |> Enum.filter(&(&1["file"] != nil))
          |> Enum.map(&parse_file(&1["file"]))

        new_acc = acc ++ items

        case body do
          %{"nextPageToken" => next_token} ->
            fetch_changes(state, next_token, new_acc)

          %{"newStartPageToken" => _new_token} ->
            # Done - could store new_token for next sync
            {:ok, new_acc}

          _ ->
            {:ok, new_acc}
        end

      {:ok, %{status: status}} ->
        {:error, {:http_error, status}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  @spec fetch_all_files(map()) :: [Connector.content_item()]
  defp fetch_all_files(state) do
    fetch_files_page(state, state.folder_id, nil, [])
  end

  @spec fetch_files_page(map(), String.t(), String.t() | nil, [Connector.content_item()]) ::
          [Connector.content_item()]
  defp fetch_files_page(state, folder_id, page_token, acc) do
    case list_content(state, folder_id: folder_id, page_token: page_token) do
      {:ok, items} when items != [] ->
        # Note: Would need to track nextPageToken from response
        # Simplified: just return first page
        acc ++ items

      {:ok, []} ->
        acc

      {:error, _} ->
        acc
    end
  end

  @spec process_item(map(), Connector.content_item(), module() | nil, String.t() | nil) ::
          {:ok, :created | :updated} | {:error, term()}
  defp process_item(_state, _item, nil, _tenant_id), do: {:ok, :created}
  defp process_item(_state, _item, _server, nil), do: {:error, :no_tenant_id}

  defp process_item(state, item, container_server, tenant_id) do
    # Download content if not already present
    content =
      if item.content == "" do
        case get_content(state, item.id) do
          {:ok, full_item} -> full_item.content
          {:error, _} -> ""
        end
      else
        item.content
      end

    if content == "" do
      {:error, :no_content}
    else
      opts = [
        content_type: item.content_type,
        metadata:
          Map.merge(item.metadata, %{
            source: "google_drive",
            source_id: item.id,
            title: item.title,
            url: item.url
          })
      ]

      # Check if container already exists with same content hash
      content_hash = compute_content_hash(content)
      container_id = "#{tenant_id}:#{String.slice(content_hash, 0, 16)}"

      case Cybernetic.Content.SemanticContainer.get(container_server, container_id) do
        {:ok, _existing} ->
          # Content already exists with same hash - consider it updated
          {:ok, :updated}

        {:error, :not_found} ->
          # Create new container
          case Cybernetic.Content.SemanticContainer.create(
                 container_server,
                 content,
                 tenant_id,
                 opts
               ) do
            {:ok, _container} -> {:ok, :created}
            {:error, reason} -> {:error, reason}
          end

        {:error, reason} ->
          {:error, reason}
      end
    end
  end

  @spec compute_content_hash(binary()) :: String.t()
  defp compute_content_hash(content) do
    :crypto.hash(:sha256, content)
    |> Base.encode16(case: :lower)
  end
end
