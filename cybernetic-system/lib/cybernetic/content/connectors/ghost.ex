defmodule Cybernetic.Content.Connectors.Ghost do
  @moduledoc """
  Ghost Content API connector.

  Connects to Ghost publications via the Content API to sync posts,
  pages, authors, and tags.

  Configuration:
  - base_url: Ghost site URL (e.g., "https://blog.example.com")
  - api_key: Content API key (required)
  - options: include relations, content_types, limit

  Supports:
  - Posts and pages sync
  - Author and tag relationship resolution
  - Incremental sync via updated_at filter
  - HTML and plaintext content
  - Featured images
  
  ## VSM Architecture

  This connector operates as part of System 1 (Operations) in the Viable
  System Model, handling the operational data flow from external CMS systems
  into the Cybernetic content pipeline.
  """

  @behaviour Cybernetic.Content.Connectors.Connector

  require Logger

  alias Cybernetic.Content.Connectors.Connector

  @api_version "v5.0"
  @default_limit 15
  @max_limit 100
  @request_timeout 30_000
  @fuse_name :ghost_connector_fuse
  @fuse_opts {{:standard, 5, 60_000}, {:reset, 30_000}}

  # Callbacks

  @doc "Initialize the connector with the given configuration"
  @spec init(Connector.config()) :: {:ok, term()} | {:error, term()}
  @impl Connector
  def init(config) do
    base_url = Map.fetch!(config, :base_url) |> String.trim_trailing("/")
    api_key = Map.fetch!(config, :api_key)
    options = Map.get(config, :options, [])

    state = %{
      base_url: base_url,
      api_base: "#{base_url}/ghost/api/content",
      api_key: api_key,
      limit: Keyword.get(options, :limit, @default_limit) |> min(@max_limit),
      content_types: Keyword.get(options, :content_types, ["posts", "pages"]),
      include: Keyword.get(options, :include, "authors,tags")
    }

    # Install circuit breaker if not already installed
    :fuse.install(@fuse_name, @fuse_opts)
    {:ok, state}
  end

  @doc "Test that the connection to the CMS is working"
  @spec test_connection(term()) :: :ok | {:error, term()}
  @impl Connector
  def test_connection(state) do
    url = build_url(state, "/posts/", %{limit: 1})

    case make_request(url) do
      {:ok, %{status: 200}} ->
        :ok

      {:ok, %{status: 401}} ->
        {:error, :unauthorized}

      {:ok, %{status: 403}} ->
        {:error, :forbidden}

      {:ok, %{status: 404}} ->
        {:error, :not_found}

      {:ok, %{status: status}} ->
        {:error, {:http_error, status}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  @doc "List content items with optional filtering"
  @spec list_content(term(), keyword()) :: {:ok, [Connector.content_item()]} | {:error, term()}
  @impl Connector
  def list_content(state, opts \\ []) do
    content_type = Keyword.get(opts, :content_type)
    page = Keyword.get(opts, :page, 1)
    limit = Keyword.get(opts, :limit, state.limit)

    content_types =
      if content_type do
        [content_type]
      else
        state.content_types
      end

    items =
      Enum.flat_map(content_types, fn ct ->
        fetch_content_type_page(state, ct, page, limit)
      end)

    {:ok, items}
  rescue
    e -> {:error, Exception.message(e)}
  end

  @doc "Get a specific content item by ID"
  @spec get_content(term(), String.t()) :: {:ok, Connector.content_item()} | {:error, term()}
  @impl Connector
  def get_content(state, id) do
    # Try to find in posts first, then pages
    Enum.find_value(state.content_types, {:error, :not_found}, fn content_type ->
      url = build_url(state, "/#{content_type}/#{id}/", %{include: state.include})

      case make_request(url) do
        {:ok, %{status: 200, body: body}} ->
          # Ghost returns {posts: [...]} or {pages: [...]}
          items = body[content_type] || []

          case items do
            [item | _] -> {:ok, parse_item(item, content_type)}
            _ -> nil
          end

        {:ok, %{status: 404}} ->
          nil

        {:ok, %{status: status}} ->
          {:error, {:http_error, status}}

        {:error, reason} ->
          {:error, reason}
      end
    end)
  end

  @doc "Get content items that have changed since the given timestamp"
  @spec get_changes(term(), DateTime.t()) :: {:ok, [Connector.content_item()]} | {:error, term()}
  @impl Connector
  def get_changes(state, since) do
    since_str = DateTime.to_iso8601(since)

    items =
      Enum.flat_map(state.content_types, fn ct ->
        filter = "updated_at:>='#{since_str}'"
        fetch_all_with_filter(state, ct, filter)
      end)

    {:ok, items}
  rescue
    e -> {:error, Exception.message(e)}
  end

  @doc "Synchronize content from the CMS to the container server"
  @spec sync(term(), keyword()) :: {:ok, Connector.sync_result()} | {:error, term()}
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
        Enum.flat_map(state.content_types, fn ct ->
          fetch_all_items(state, ct)
        end)
      end

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

  @doc "Clean up any resources held by the connector"
  @spec cleanup(term()) :: :ok
  @impl Connector
  def cleanup(_state), do: :ok

  # Private Functions

  @spec build_url(map(), String.t(), map()) :: String.t()
  defp build_url(state, path, params) do
    params_with_key = Map.put(params, :key, state.api_key)
    "#{state.api_base}#{path}?#{URI.encode_query(params_with_key)}"
  end

  @spec make_request(String.t()) :: {:ok, Req.Response.t()} | {:error, term()}
  defp make_request(url) do
    headers = [
      {"accept", "application/json"},
      {"accept-version", @api_version}
    ]

    case :fuse.ask(@fuse_name, :sync) do
      :ok ->
        case Req.get(url,
               headers: headers,
               receive_timeout: @request_timeout,
               decode_json: [keys: :strings]
             ) do
          {:ok, response} ->
            {:ok, response}

          {:error, reason} ->
            :fuse.melt(@fuse_name)
            {:error, reason}
        end

      :blown ->
        {:error, :circuit_breaker_open}

      {:error, :not_found} ->
        Req.get(url,
          headers: headers,
          receive_timeout: @request_timeout,
          decode_json: [keys: :strings]
        )
    end
  rescue
    e ->
      :fuse.melt(@fuse_name)
      {:error, Exception.message(e)}
  end

  @spec fetch_content_type_page(map(), String.t(), pos_integer(), pos_integer()) ::
          [Connector.content_item()]
  defp fetch_content_type_page(state, content_type, page, limit) do
    params = %{
      page: page,
      limit: limit,
      include: state.include,
      order: "updated_at desc"
    }

    url = build_url(state, "/#{content_type}/", params)

    case make_request(url) do
      {:ok, %{status: 200, body: body}} ->
        items = body[content_type] || []
        Enum.map(items, &parse_item(&1, content_type))

      _ ->
        []
    end
  end

  @spec fetch_all_items(map(), String.t()) :: [Connector.content_item()]
  defp fetch_all_items(state, content_type) do
    fetch_items_page(state, content_type, 1, [])
  end

  @spec fetch_items_page(map(), String.t(), pos_integer(), [Connector.content_item()]) ::
          [Connector.content_item()]
  defp fetch_items_page(state, content_type, page, acc) do
    items = fetch_content_type_page(state, content_type, page, state.limit)

    if length(items) < state.limit do
      acc ++ items
    else
      fetch_items_page(state, content_type, page + 1, acc ++ items)
    end
  end

  @spec fetch_all_with_filter(map(), String.t(), String.t()) :: [Connector.content_item()]
  defp fetch_all_with_filter(state, content_type, filter) do
    fetch_filtered_page(state, content_type, filter, 1, [])
  end

  @spec fetch_filtered_page(
          map(),
          String.t(),
          String.t(),
          pos_integer(),
          [Connector.content_item()]
        ) :: [Connector.content_item()]
  defp fetch_filtered_page(state, content_type, filter, page, acc) do
    params = %{
      page: page,
      limit: state.limit,
      include: state.include,
      filter: filter,
      order: "updated_at desc"
    }

    url = build_url(state, "/#{content_type}/", params)

    case make_request(url) do
      {:ok, %{status: 200, body: body}} ->
        items = body[content_type] || []
        parsed = Enum.map(items, &parse_item(&1, content_type))

        if length(items) < state.limit do
          acc ++ parsed
        else
          fetch_filtered_page(state, content_type, filter, page + 1, acc ++ parsed)
        end

      _ ->
        acc
    end
  end

  @spec parse_item(map(), String.t()) :: Connector.content_item()
  defp parse_item(item, content_type) do
    %{
      id: item["id"] || "",
      title: item["title"] || "",
      content: item["html"] || item["plaintext"] || "",
      content_type: "text/html",
      url: item["url"],
      author: extract_author(item),
      published_at: parse_datetime(item["published_at"]),
      updated_at: parse_datetime(item["updated_at"]),
      metadata: %{
        content_type: content_type,
        slug: item["slug"],
        uuid: item["uuid"],
        excerpt: item["excerpt"] || item["custom_excerpt"],
        feature_image: item["feature_image"],
        featured: item["featured"],
        visibility: item["visibility"],
        tags: extract_tags(item),
        authors: extract_authors(item),
        reading_time: item["reading_time"],
        og_title: item["og_title"],
        og_description: item["og_description"],
        meta_title: item["meta_title"],
        meta_description: item["meta_description"]
      }
    }
  end

  @spec extract_author(map()) :: String.t() | nil
  defp extract_author(item) do
    case item["primary_author"] do
      %{"name" => name} -> name
      _ -> extract_first_author(item)
    end
  end

  @spec extract_first_author(map()) :: String.t() | nil
  defp extract_first_author(item) do
    case item["authors"] do
      [%{"name" => name} | _] -> name
      _ -> nil
    end
  end

  @spec extract_authors(map()) :: [map()]
  defp extract_authors(item) do
    case item["authors"] do
      authors when is_list(authors) ->
        Enum.map(authors, fn author ->
          %{
            id: author["id"],
            name: author["name"],
            slug: author["slug"],
            profile_image: author["profile_image"],
            bio: author["bio"]
          }
        end)

      _ ->
        []
    end
  end

  @spec extract_tags(map()) :: [map()]
  defp extract_tags(item) do
    case item["tags"] do
      tags when is_list(tags) ->
        Enum.map(tags, fn tag ->
          %{
            id: tag["id"],
            name: tag["name"],
            slug: tag["slug"],
            description: tag["description"]
          }
        end)

      _ ->
        []
    end
  end

  @spec parse_datetime(String.t() | nil) :: DateTime.t() | nil
  defp parse_datetime(nil), do: nil

  defp parse_datetime(str) do
    case DateTime.from_iso8601(str) do
      {:ok, dt, _} -> dt
      _ -> nil
    end
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
          source: "ghost",
          source_id: item.id,
          title: item.title,
          url: item.url,
          author: item.author
        })
    ]

    content_hash = compute_content_hash(content)
    container_id = "#{tenant_id}:#{String.slice(content_hash, 0, 16)}"

    case Cybernetic.Content.SemanticContainer.get(container_server, container_id) do
      {:ok, _existing} ->
        {:ok, :updated}

      {:error, :not_found} ->
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
