defmodule Cybernetic.Content.Connectors.Strapi do
  @moduledoc """
  Strapi REST API connector.

  Connects to Strapi v4 CMS via the REST API to sync content types
  and entries.

  Configuration:
  - base_url: Strapi instance URL (e.g., "https://cms.example.com")
  - api_key: API token (required for authenticated access)
  - options: content_types, populate depth, locale

  Supports:
  - Dynamic content type discovery
  - Entry listing with filtering and sorting
  - Deep population of relations
  - Incremental sync via updatedAt filter
  - Multiple locales
  
  ## VSM Architecture

  This connector operates as part of System 1 (Operations) in the Viable
  System Model, handling the operational data flow from external CMS systems
  into the Cybernetic content pipeline.
  """

  @behaviour Cybernetic.Content.Connectors.Connector

  require Logger

  alias Cybernetic.Content.Connectors.Connector

  @default_page_size 25
  @max_page_size 100
  @request_timeout 30_000
  @fuse_name :strapi_connector_fuse
  @fuse_opts {{:standard, 5, 60_000}, {:reset, 30_000}}

  # Callbacks

  @doc "Initialize the connector with the given configuration"
  @spec init(Connector.config()) :: {:ok, term()} | {:error, term()}
  @impl Connector
  def init(config) do
    base_url = Map.fetch!(config, :base_url) |> String.trim_trailing("/")
    api_key = Map.get(config, :api_key)
    options = Map.get(config, :options, [])

    state = %{
      base_url: base_url,
      api_base: "#{base_url}/api",
      api_key: api_key,
      page_size: Keyword.get(options, :page_size, @default_page_size) |> min(@max_page_size),
      content_types: Keyword.get(options, :content_types),
      populate: Keyword.get(options, :populate, "*"),
      locale: Keyword.get(options, :locale)
    }

    # Install circuit breaker if not already installed
    :fuse.install(@fuse_name, @fuse_opts)
    {:ok, state}
  end

  @doc "Test that the connection to the CMS is working"
  @spec test_connection(term()) :: :ok | {:error, term()}
  @impl Connector
  def test_connection(state) do
    # Try to list content types
    url = "#{state.api_base}/content-type-builder/content-types"

    case make_request(state, url) do
      {:ok, %{status: 200}} ->
        :ok

      {:ok, %{status: 401}} ->
        {:error, :unauthorized}

      {:ok, %{status: 403}} ->
        {:error, :forbidden}

      {:ok, %{status: 404}} ->
        # Try alternative endpoint for Strapi v4
        test_alternative(state)

      {:ok, %{status: status}} ->
        {:error, {:http_error, status}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp test_alternative(state) do
    # Try fetching from a common content type
    url = "#{state.api_base}/users?pagination[limit]=1"

    case make_request(state, url) do
      {:ok, %{status: status}} when status in [200, 403] -> :ok
      {:ok, %{status: status}} -> {:error, {:http_error, status}}
      {:error, reason} -> {:error, reason}
    end
  end

  @doc "List content items with optional filtering"
  @spec list_content(term(), keyword()) :: {:ok, [Connector.content_item()]} | {:error, term()}
  @impl Connector
  def list_content(state, opts \\ []) do
    content_type = Keyword.get(opts, :content_type)
    page = Keyword.get(opts, :page, 1)
    page_size = Keyword.get(opts, :page_size, state.page_size)

    content_types =
      if content_type do
        [content_type]
      else
        state.content_types || discover_content_types(state)
      end

    items =
      Enum.flat_map(content_types, fn ct ->
        fetch_content_type_page(state, ct, page, page_size)
      end)

    {:ok, items}
  rescue
    e -> {:error, Exception.message(e)}
  end

  @doc "Get a specific content item by ID"
  @spec get_content(term(), String.t()) :: {:ok, Connector.content_item()} | {:error, term()}
  @impl Connector
  def get_content(state, id) do
    # Parse ID format: "content_type:entry_id" or just "entry_id"
    {content_type, entry_id} = parse_id(id, state)

    url = "#{state.api_base}/#{content_type}/#{entry_id}?populate=#{state.populate}"

    case make_request(state, url) do
      {:ok, %{status: 200, body: %{"data" => data}}} ->
        {:ok, parse_entry(data, content_type)}

      {:ok, %{status: 200, body: body}} when is_map(body) ->
        {:ok, parse_entry(body, content_type)}

      {:ok, %{status: 404}} ->
        {:error, :not_found}

      {:ok, %{status: status}} ->
        {:error, {:http_error, status}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  @doc "Get content items that have changed since the given timestamp"
  @spec get_changes(term(), DateTime.t()) :: {:ok, [Connector.content_item()]} | {:error, term()}
  @impl Connector
  def get_changes(state, since) do
    since_str = DateTime.to_iso8601(since)

    content_types = state.content_types || discover_content_types(state)

    items =
      Enum.flat_map(content_types, fn ct ->
        fetch_all_with_filter(state, ct, "filters[updatedAt][$gte]=#{since_str}")
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
        content_types = state.content_types || discover_content_types(state)

        Enum.flat_map(content_types, fn ct ->
          fetch_all_entries(state, ct)
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

  @spec make_request(map(), String.t()) :: {:ok, Req.Response.t()} | {:error, term()}
  defp make_request(state, url) do
    headers =
      if state.api_key do
        [
          {"authorization", "Bearer #{state.api_key}"},
          {"content-type", "application/json"}
        ]
      else
        [{"content-type", "application/json"}]
      end

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

  @doc false
  @spec discover_content_types(map()) :: [String.t()]
  defp discover_content_types(state) do
    # Try to fetch content types from Strapi API
    url = "#{state.api_base}/content-type-builder/content-types"
    
    case make_request(state, url) do
      {:ok, %{status: 200, body: %{"data" => types}}} when is_list(types) ->
        types
        |> Enum.filter(fn t -> 
          api_id = get_in(t, ["uid"]) || ""
          String.starts_with?(api_id, "api::")
        end)
        |> Enum.map(fn t -> 
          uid = t["uid"] || ""
          uid |> String.replace("api::", "") |> String.replace(".", "-")
        end)
        
      _ ->
        # Fallback to common content types if API discovery fails
        ["articles", "pages", "posts", "blogs"]
    end
  end

  @spec parse_id(String.t(), map()) :: {String.t(), String.t()}
  defp parse_id(id, state) do
    case String.split(id, ":", parts: 2) do
      [content_type, entry_id] -> {content_type, entry_id}
      [entry_id] -> {List.first(state.content_types || ["articles"]), entry_id}
    end
  end

  @spec fetch_content_type_page(map(), String.t(), pos_integer(), pos_integer()) ::
          [Connector.content_item()]
  defp fetch_content_type_page(state, content_type, page, page_size) do
    query = %{
      "pagination[page]" => page,
      "pagination[pageSize]" => page_size,
      "populate" => state.populate
    }

    query =
      if state.locale do
        Map.put(query, "locale", state.locale)
      else
        query
      end

    url = "#{state.api_base}/#{content_type}?" <> URI.encode_query(query)

    case make_request(state, url) do
      {:ok, %{status: 200, body: %{"data" => data}}} when is_list(data) ->
        Enum.map(data, &parse_entry(&1, content_type))

      {:ok, %{status: 200, body: body}} when is_list(body) ->
        Enum.map(body, &parse_entry(&1, content_type))

      _ ->
        []
    end
  end

  @spec fetch_all_entries(map(), String.t()) :: [Connector.content_item()]
  defp fetch_all_entries(state, content_type) do
    fetch_entries_page(state, content_type, 1, [])
  end

  @spec fetch_entries_page(map(), String.t(), pos_integer(), [Connector.content_item()]) ::
          [Connector.content_item()]
  defp fetch_entries_page(state, content_type, page, acc) do
    items = fetch_content_type_page(state, content_type, page, state.page_size)

    if length(items) < state.page_size do
      acc ++ items
    else
      fetch_entries_page(state, content_type, page + 1, acc ++ items)
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
    query =
      "pagination[page]=#{page}&pagination[pageSize]=#{state.page_size}&populate=#{state.populate}&#{filter}"

    url = "#{state.api_base}/#{content_type}?#{query}"

    case make_request(state, url) do
      {:ok, %{status: 200, body: %{"data" => data}}} when is_list(data) ->
        items = Enum.map(data, &parse_entry(&1, content_type))

        if length(items) < state.page_size do
          acc ++ items
        else
          fetch_filtered_page(state, content_type, filter, page + 1, acc ++ items)
        end

      _ ->
        acc
    end
  end

  @spec parse_entry(map(), String.t()) :: Connector.content_item()
  defp parse_entry(entry, content_type) do
    # Strapi v4 format: {id, attributes: {...}}
    # Strapi v3 format: {id, title, content, ...}
    {id, attrs} =
      case entry do
        %{"id" => id, "attributes" => attrs} -> {id, attrs}
        %{"id" => id} = flat -> {id, Map.drop(flat, ["id"])}
        flat -> {Map.get(flat, "id", ""), flat}
      end

    %{
      id: "#{content_type}:#{id}",
      title: attrs["title"] || attrs["name"] || "",
      content: extract_content(attrs),
      content_type: "text/html",
      url: attrs["slug"] && "/#{content_type}/#{attrs["slug"]}",
      author: extract_author(attrs),
      published_at: parse_datetime(attrs["publishedAt"]),
      updated_at: parse_datetime(attrs["updatedAt"]),
      metadata: %{
        content_type: content_type,
        slug: attrs["slug"],
        locale: attrs["locale"],
        attributes: attrs
      }
    }
  end

  @spec extract_content(map()) :: String.t()
  defp extract_content(attrs) do
    # Try common content field names
    Enum.find_value(["content", "body", "text", "description", "richText"], "", fn field ->
      case Map.get(attrs, field) do
        nil -> nil
        value when is_binary(value) -> value
        blocks when is_list(blocks) -> render_blocks(blocks)
        _ -> nil
      end
    end)
  end

  @spec render_blocks(list()) :: String.t()
  defp render_blocks(blocks) do
    # Basic rendering of Strapi's block editor format
    Enum.map_join(blocks, "\n", fn block ->
      case block do
        %{"type" => "paragraph", "children" => children} ->
          "<p>" <> render_children(children) <> "</p>"

        %{"type" => "heading", "level" => level, "children" => children} ->
          "<h#{level}>" <> render_children(children) <> "</h#{level}>"

        %{"type" => "list", "format" => "unordered", "children" => items} ->
          "<ul>" <> Enum.map_join(items, "", &render_list_item/1) <> "</ul>"

        %{"type" => "list", "format" => "ordered", "children" => items} ->
          "<ol>" <> Enum.map_join(items, "", &render_list_item/1) <> "</ol>"

        %{"type" => "code", "children" => children} ->
          "<pre><code>" <> render_children(children) <> "</code></pre>"

        _ ->
          ""
      end
    end)
  end

  defp render_children(children) when is_list(children) do
    Enum.map_join(children, "", fn
      %{"text" => text} -> text
      _ -> ""
    end)
  end

  defp render_children(_), do: ""

  defp render_list_item(%{"children" => children}), do: "<li>" <> render_children(children) <> "</li>"
  defp render_list_item(_), do: ""

  @spec extract_author(map()) :: String.t() | nil
  defp extract_author(attrs) do
    case attrs["author"] do
      %{"data" => %{"attributes" => %{"name" => name}}} -> name
      %{"name" => name} -> name
      name when is_binary(name) -> name
      _ -> nil
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
          source: "strapi",
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
