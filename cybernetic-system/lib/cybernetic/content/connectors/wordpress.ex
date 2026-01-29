defmodule Cybernetic.Content.Connectors.WordPress do
  @moduledoc """
  WordPress REST API connector.

  Connects to WordPress sites via the WP REST API (v2) to sync
  posts, pages, and media content.

  Configuration:
  - base_url: WordPress site URL (e.g., "https://example.com")
  - api_key: Application password or JWT token (optional for public content)
  - options: Additional options like per_page, post_types

  Supports:
  - Public post/page listing
  - Authenticated access for drafts/private content
  - Incremental sync via modified_after parameter
  - Custom post types
  """

  @behaviour Cybernetic.Content.Connectors.Connector

  require Logger

  alias Cybernetic.Content.Connectors.Connector

  @default_per_page 100
  @max_per_page 100
  @request_timeout 30_000

  # Callbacks

  @impl Connector
  def init(config) do
    base_url = Map.fetch!(config, :base_url) |> String.trim_trailing("/")
    api_key = Map.get(config, :api_key)
    credentials = Map.get(config, :credentials)
    options = Map.get(config, :options, [])

    state = %{
      base_url: base_url,
      api_base: "#{base_url}/wp-json/wp/v2",
      api_key: api_key,
      credentials: credentials,
      per_page: Keyword.get(options, :per_page, @default_per_page) |> min(@max_per_page),
      post_types: Keyword.get(options, :post_types, ["posts", "pages"])
    }

    {:ok, state}
  end

  @impl Connector
  def test_connection(state) do
    url = "#{state.api_base}/posts?per_page=1"

    case make_request(state, url) do
      {:ok, %{status: 200}} ->
        :ok

      {:ok, %{status: 401}} ->
        {:error, :unauthorized}

      {:ok, %{status: 403}} ->
        {:error, :forbidden}

      {:ok, %{status: status}} ->
        {:error, {:http_error, status}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  @impl Connector
  def list_content(state, opts \\ []) do
    post_type = Keyword.get(opts, :post_type, "posts")
    page = Keyword.get(opts, :page, 1)
    per_page = Keyword.get(opts, :per_page, state.per_page)
    status = Keyword.get(opts, :status, "publish")

    url =
      "#{state.api_base}/#{post_type}?" <>
        URI.encode_query(%{
          page: page,
          per_page: per_page,
          status: status,
          _embed: "true"
        })

    case make_request(state, url) do
      {:ok, %{status: 200, body: body}} ->
        items = Enum.map(body, &parse_post/1)
        {:ok, items}

      {:ok, %{status: status}} ->
        {:error, {:http_error, status}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  @impl Connector
  def get_content(state, id) do
    # Try posts first, then pages
    Enum.find_value(state.post_types, {:error, :not_found}, fn post_type ->
      url = "#{state.api_base}/#{post_type}/#{id}?_embed=true"

      case make_request(state, url) do
        {:ok, %{status: 200, body: body}} ->
          {:ok, parse_post(body)}

        {:ok, %{status: 404}} ->
          nil

        {:ok, %{status: status}} ->
          {:error, {:http_error, status}}

        {:error, reason} ->
          {:error, reason}
      end
    end)
  end

  @impl Connector
  def get_changes(state, since) do
    # WordPress uses modified_after in ISO 8601 format
    since_str = DateTime.to_iso8601(since)

    all_items =
      state.post_types
      |> Enum.flat_map(fn post_type ->
        fetch_all_pages(state, post_type, modified_after: since_str)
      end)

    {:ok, all_items}
  rescue
    e -> {:error, Exception.message(e)}
  end

  @impl Connector
  def sync(state, opts \\ []) do
    since = Keyword.get(opts, :since)
    container_server = Keyword.get(opts, :container_server)
    tenant_id = Keyword.get(opts, :tenant_id)

    result = %{created: 0, updated: 0, deleted: 0, errors: []}

    items =
      if since do
        case get_changes(state, since) do
          {:ok, items} -> items
          {:error, _} -> []
        end
      else
        state.post_types
        |> Enum.flat_map(fn post_type -> fetch_all_pages(state, post_type) end)
      end

    # Process items
    final_result =
      Enum.reduce(items, result, fn item, acc ->
        case process_item(item, container_server, tenant_id) do
          {:ok, :created} -> %{acc | created: acc.created + 1}
          {:ok, :updated} -> %{acc | updated: acc.updated + 1}
          {:error, reason} -> %{acc | errors: [{item.id, reason} | acc.errors]}
        end
      end)

    {:ok, final_result}
  end

  @impl Connector
  def cleanup(_state), do: :ok

  # Private Functions

  @spec make_request(map(), String.t()) :: {:ok, Req.Response.t()} | {:error, term()}
  defp make_request(state, url) do
    headers = build_headers(state)

    Req.get(url,
      headers: headers,
      receive_timeout: @request_timeout,
      decode_json: [keys: :strings]
    )
  rescue
    e -> {:error, Exception.message(e)}
  end

  @spec build_headers(map()) :: [{String.t(), String.t()}]
  defp build_headers(%{api_key: nil}), do: []

  defp build_headers(%{api_key: api_key, credentials: credentials}) when is_map(credentials) do
    # Basic auth with application password
    username = Map.get(credentials, :username, "")
    auth = Base.encode64("#{username}:#{api_key}")
    [{"authorization", "Basic #{auth}"}]
  end

  defp build_headers(%{api_key: api_key}) do
    # Bearer token (JWT)
    [{"authorization", "Bearer #{api_key}"}]
  end

  @spec parse_post(map()) :: Connector.content_item()
  defp parse_post(post) do
    %{
      id: to_string(post["id"]),
      title: get_in(post, ["title", "rendered"]) || "",
      content: get_in(post, ["content", "rendered"]) || "",
      content_type: "text/html",
      url: post["link"],
      author: extract_author(post),
      published_at: parse_datetime(post["date_gmt"]),
      updated_at: parse_datetime(post["modified_gmt"]),
      metadata: %{
        slug: post["slug"],
        status: post["status"],
        type: post["type"],
        excerpt: get_in(post, ["excerpt", "rendered"]),
        categories: post["categories"] || [],
        tags: post["tags"] || [],
        featured_media: post["featured_media"]
      }
    }
  end

  @spec extract_author(map()) :: String.t() | nil
  defp extract_author(post) do
    case get_in(post, ["_embedded", "author"]) do
      [%{"name" => name} | _] -> name
      _ -> nil
    end
  end

  @spec parse_datetime(String.t() | nil) :: DateTime.t() | nil
  defp parse_datetime(nil), do: nil

  defp parse_datetime(str) do
    case DateTime.from_iso8601(str <> "Z") do
      {:ok, dt, _} -> dt
      _ -> nil
    end
  end

  @spec fetch_all_pages(map(), String.t(), keyword()) :: [Connector.content_item()]
  defp fetch_all_pages(state, post_type, extra_params \\ []) do
    fetch_page(state, post_type, 1, extra_params, [])
  end

  @spec fetch_page(map(), String.t(), pos_integer(), keyword(), [Connector.content_item()]) ::
          [Connector.content_item()]
  defp fetch_page(state, post_type, page, extra_params, acc) do
    base_params = %{
      page: page,
      per_page: state.per_page,
      status: "publish",
      _embed: "true"
    }

    params = Map.merge(base_params, Map.new(extra_params))
    url = "#{state.api_base}/#{post_type}?" <> URI.encode_query(params)

    case make_request(state, url) do
      {:ok, %{status: 200, body: body, headers: headers}} when is_list(body) ->
        items = Enum.map(body, &parse_post/1)
        total_pages = get_total_pages(headers)

        if page < total_pages do
          fetch_page(state, post_type, page + 1, extra_params, acc ++ items)
        else
          acc ++ items
        end

      {:ok, %{status: 400}} ->
        # No more pages
        acc

      _ ->
        acc
    end
  end

  @spec get_total_pages([{String.t(), String.t()}]) :: non_neg_integer()
  defp get_total_pages(headers) do
    headers
    |> Enum.find(fn {k, _v} -> String.downcase(k) == "x-wp-totalpages" end)
    |> case do
      {_, value} -> String.to_integer(value)
      nil -> 1
    end
  rescue
    _ -> 1
  end

  @spec process_item(Connector.content_item(), module() | nil, String.t() | nil) ::
          {:ok, :created | :updated} | {:error, term()}
  defp process_item(_item, nil, _tenant_id), do: {:ok, :created}
  defp process_item(_item, _server, nil), do: {:error, :no_tenant_id}

  defp process_item(item, container_server, tenant_id) do
    content = item.content

    opts = [
      content_type: item.content_type,
      metadata:
        Map.merge(item.metadata, %{
          source: "wordpress",
          source_id: item.id,
          title: item.title,
          url: item.url,
          author: item.author
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

  @spec compute_content_hash(binary()) :: String.t()
  defp compute_content_hash(content) do
    :crypto.hash(:sha256, content)
    |> Base.encode16(case: :lower)
  end
end
