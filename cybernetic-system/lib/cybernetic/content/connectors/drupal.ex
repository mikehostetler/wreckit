defmodule Cybernetic.Content.Connectors.Drupal do
  @moduledoc """
  Drupal JSON:API connector.

  Connects to Drupal 8/9/10 sites via the JSON:API module to sync
  content entities.

  Configuration:
  - base_url: Drupal site URL (e.g., "https://example.com")
  - api_key: OAuth2 token or Basic auth credentials
  - credentials: %{username: "...", password: "..."} for Basic auth
  - options: content_types, include relations, language

  Supports:
  - JSON:API compliant endpoints
  - Content type filtering
  - Relationship includes
  - Incremental sync via changed timestamp
  - Multilingual content
  
  ## VSM Architecture

  This connector operates as part of System 1 (Operations) in the Viable
  System Model, handling the operational data flow from external CMS systems
  into the Cybernetic content pipeline.
  """

  @behaviour Cybernetic.Content.Connectors.Connector

  require Logger

  alias Cybernetic.Content.Connectors.Connector

  @default_page_limit 50
  @max_page_limit 100
  @request_timeout 30_000
  @fuse_name :drupal_connector_fuse
  @fuse_opts {{:standard, 5, 60_000}, {:reset, 30_000}}

  # Callbacks

  @doc "Initialize the connector with the given configuration"
  @spec init(Connector.config()) :: {:ok, term()} | {:error, term()}
  @impl Connector
  def init(config) do
    base_url = Map.fetch!(config, :base_url) |> String.trim_trailing("/")
    api_key = Map.get(config, :api_key)
    credentials = Map.get(config, :credentials)
    options = Map.get(config, :options, [])

    state = %{
      base_url: base_url,
      api_base: "#{base_url}/jsonapi",
      api_key: api_key,
      credentials: credentials,
      page_limit: Keyword.get(options, :page_limit, @default_page_limit) |> min(@max_page_limit),
      content_types: Keyword.get(options, :content_types, ["node--article", "node--page"]),
      include: Keyword.get(options, :include, "uid,field_image"),
      language: Keyword.get(options, :language)
    }

    # Install circuit breaker if not already installed
    :fuse.install(@fuse_name, @fuse_opts)
    {:ok, state}
  end

  @doc "Test that the connection to the CMS is working"
  @spec test_connection(term()) :: :ok | {:error, term()}
  @impl Connector
  def test_connection(state) do
    url = "#{state.api_base}"

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

  @doc "List content items with optional filtering"
  @spec list_content(term(), keyword()) :: {:ok, [Connector.content_item()]} | {:error, term()}
  @impl Connector
  def list_content(state, opts \\ []) do
    content_type = Keyword.get(opts, :content_type)
    page_offset = Keyword.get(opts, :page_offset, 0)
    page_limit = Keyword.get(opts, :page_limit, state.page_limit)

    content_types =
      if content_type do
        [content_type]
      else
        state.content_types
      end

    items =
      Enum.flat_map(content_types, fn ct ->
        fetch_content_type_page(state, ct, page_offset, page_limit)
      end)

    {:ok, items}
  rescue
    e -> {:error, Exception.message(e)}
  end

  @doc "Get a specific content item by ID"
  @spec get_content(term(), String.t()) :: {:ok, Connector.content_item()} | {:error, term()}
  @impl Connector
  def get_content(state, id) do
    # Parse ID format: "content_type:uuid" or just "uuid"
    {content_type, uuid} = parse_id(id, state)

    url = "#{state.api_base}/#{content_type}/#{uuid}?include=#{state.include}"

    case make_request(state, url) do
      {:ok, %{status: 200, body: body}} ->
        data = body["data"]
        included = body["included"] || []
        {:ok, parse_entity(data, included)}

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
    # Drupal uses Unix timestamp for changed filter
    since_timestamp = DateTime.to_unix(since)

    items =
      Enum.flat_map(state.content_types, fn ct ->
        filter = "filter[changed][condition][path]=changed&filter[changed][condition][operator]=%3E%3D&filter[changed][condition][value]=#{since_timestamp}"
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
          fetch_all_entities(state, ct)
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
    headers = build_headers(state)

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

  @spec build_headers(map()) :: [{String.t(), String.t()}]
  defp build_headers(%{api_key: api_key}) when is_binary(api_key) and api_key != "" do
    [
      {"authorization", "Bearer #{api_key}"},
      {"accept", "application/vnd.api+json"},
      {"content-type", "application/vnd.api+json"}
    ]
  end

  defp build_headers(%{credentials: %{username: username, password: password}})
       when is_binary(username) and is_binary(password) do
    auth = Base.encode64("#{username}:#{password}")

    [
      {"authorization", "Basic #{auth}"},
      {"accept", "application/vnd.api+json"},
      {"content-type", "application/vnd.api+json"}
    ]
  end

  defp build_headers(_) do
    [
      {"accept", "application/vnd.api+json"},
      {"content-type", "application/vnd.api+json"}
    ]
  end

  @spec parse_id(String.t(), map()) :: {String.t(), String.t()}
  defp parse_id(id, state) do
    case String.split(id, ":", parts: 2) do
      [content_type, uuid] -> {content_type, uuid}
      [uuid] -> {List.first(state.content_types), uuid}
    end
  end

  @spec fetch_content_type_page(map(), String.t(), non_neg_integer(), pos_integer()) ::
          [Connector.content_item()]
  defp fetch_content_type_page(state, content_type, offset, limit) do
    query = %{
      "page[offset]" => offset,
      "page[limit]" => limit,
      "include" => state.include,
      "sort" => "-changed"
    }

    query =
      if state.language do
        Map.put(query, "filter[langcode]", state.language)
      else
        query
      end

    url = "#{state.api_base}/#{content_type}?" <> URI.encode_query(query)

    case make_request(state, url) do
      {:ok, %{status: 200, body: body}} ->
        data = body["data"] || []
        included = body["included"] || []
        Enum.map(data, &parse_entity(&1, included))

      _ ->
        []
    end
  end

  @spec fetch_all_entities(map(), String.t()) :: [Connector.content_item()]
  defp fetch_all_entities(state, content_type) do
    fetch_entities_page(state, content_type, 0, [])
  end

  @spec fetch_entities_page(map(), String.t(), non_neg_integer(), [Connector.content_item()]) ::
          [Connector.content_item()]
  defp fetch_entities_page(state, content_type, offset, acc) do
    items = fetch_content_type_page(state, content_type, offset, state.page_limit)

    if length(items) < state.page_limit do
      acc ++ items
    else
      fetch_entities_page(state, content_type, offset + state.page_limit, acc ++ items)
    end
  end

  @spec fetch_all_with_filter(map(), String.t(), String.t()) :: [Connector.content_item()]
  defp fetch_all_with_filter(state, content_type, filter) do
    fetch_filtered_page(state, content_type, filter, 0, [])
  end

  @spec fetch_filtered_page(
          map(),
          String.t(),
          String.t(),
          non_neg_integer(),
          [Connector.content_item()]
        ) :: [Connector.content_item()]
  defp fetch_filtered_page(state, content_type, filter, offset, acc) do
    url =
      "#{state.api_base}/#{content_type}?page[offset]=#{offset}&page[limit]=#{state.page_limit}&include=#{state.include}&#{filter}"

    case make_request(state, url) do
      {:ok, %{status: 200, body: body}} ->
        data = body["data"] || []
        included = body["included"] || []
        items = Enum.map(data, &parse_entity(&1, included))

        if length(items) < state.page_limit do
          acc ++ items
        else
          fetch_filtered_page(state, content_type, filter, offset + state.page_limit, acc ++ items)
        end

      _ ->
        acc
    end
  end

  @spec parse_entity(map(), list()) :: Connector.content_item()
  defp parse_entity(entity, included) do
    attrs = entity["attributes"] || %{}
    relationships = entity["relationships"] || %{}
    entity_type = entity["type"] || ""

    %{
      id: "#{entity_type}:#{entity["id"]}",
      title: attrs["title"] || "",
      content: extract_content(attrs),
      content_type: "text/html",
      url: extract_path(attrs),
      author: extract_author(relationships, included),
      published_at: parse_datetime(attrs["created"]),
      updated_at: parse_datetime(attrs["changed"]),
      metadata: %{
        entity_type: entity_type,
        uuid: entity["id"],
        drupal_internal_id: attrs["drupal_internal__nid"],
        langcode: attrs["langcode"],
        status: attrs["status"],
        path: attrs["path"],
        attributes: attrs
      }
    }
  end

  @spec extract_content(map()) :: String.t()
  defp extract_content(attrs) do
    # Try common body field names
    body_fields = ["body", "field_body", "field_content", "description"]

    Enum.find_value(body_fields, "", fn field ->
      case Map.get(attrs, field) do
        %{"value" => value} -> value
        %{"processed" => processed} -> processed
        value when is_binary(value) -> value
        _ -> nil
      end
    end)
  end

  @spec extract_path(map()) :: String.t() | nil
  defp extract_path(attrs) do
    case attrs["path"] do
      %{"alias" => alias} when is_binary(alias) -> alias
      _ -> nil
    end
  end

  @spec extract_author(map(), list()) :: String.t() | nil
  defp extract_author(relationships, included) do
    case get_in(relationships, ["uid", "data", "id"]) do
      nil ->
        nil

      user_id ->
        Enum.find_value(included, fn
          %{"type" => "user--user", "id" => ^user_id, "attributes" => attrs} ->
            attrs["display_name"] || attrs["name"]

          _ ->
            nil
        end)
    end
  end

  @spec parse_datetime(String.t() | integer() | nil) :: DateTime.t() | nil
  defp parse_datetime(nil), do: nil

  defp parse_datetime(timestamp) when is_integer(timestamp) do
    case DateTime.from_unix(timestamp) do
      {:ok, dt} -> dt
      _ -> nil
    end
  end

  defp parse_datetime(str) when is_binary(str) do
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
          source: "drupal",
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
