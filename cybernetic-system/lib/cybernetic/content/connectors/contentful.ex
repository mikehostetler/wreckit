defmodule Cybernetic.Content.Connectors.Contentful do
  @moduledoc """
  Contentful Content Delivery API connector.

  Connects to Contentful spaces via the Content Delivery API to sync
  entries, assets, and content types.

  Configuration:
  - base_url: Optional custom API URL (defaults to Contentful CDN)
  - api_key: Content Delivery API access token (required)
  - credentials: %{space_id: "...", environment: "master"}
  - options: content_types, include depth, locale

  Supports:
  - Entry listing with content type filtering
  - Asset sync
  - Incremental sync via sync API
  - Multiple locales
  
  ## VSM Architecture

  This connector operates as part of System 1 (Operations) in the Viable
  System Model, handling the operational data flow from external CMS systems
  into the Cybernetic content pipeline.
  """

  @behaviour Cybernetic.Content.Connectors.Connector

  require Logger

  alias Cybernetic.Content.Connectors.Connector

  @cdn_base "https://cdn.contentful.com"
  @preview_base "https://preview.contentful.com"
  @default_include 2
  @default_limit 100
  @max_limit 1000
  @request_timeout 30_000
  @fuse_name :contentful_connector_fuse
  @fuse_opts {{:standard, 5, 60_000}, {:reset, 30_000}}

  # Callbacks

  @doc "Initialize the connector with the given configuration"
  @spec init(Connector.config()) :: {:ok, term()} | {:error, term()}
  @impl Connector
  def init(config) do
    api_key = Map.fetch!(config, :api_key)
    credentials = Map.fetch!(config, :credentials)
    space_id = Map.fetch!(credentials, :space_id)
    environment = Map.get(credentials, :environment, "master")
    options = Map.get(config, :options, [])

    base_url =
      if Keyword.get(options, :preview, false) do
        @preview_base
      else
        Map.get(config, :base_url, @cdn_base)
      end

    state = %{
      api_key: api_key,
      space_id: space_id,
      environment: environment,
      base_url: "#{base_url}/spaces/#{space_id}/environments/#{environment}",
      include: Keyword.get(options, :include, @default_include),
      limit: Keyword.get(options, :limit, @default_limit) |> min(@max_limit),
      content_types: Keyword.get(options, :content_types),
      locale: Keyword.get(options, :locale, "*"),
      sync_token: nil
    }

    # Install circuit breaker if not already installed
    :fuse.install(@fuse_name, @fuse_opts)
    {:ok, state}
  end

  @doc "Test that the connection to the CMS is working"
  @spec test_connection(term()) :: :ok | {:error, term()}
  @impl Connector
  def test_connection(state) do
    url = "#{state.base_url}/content_types?limit=1"

    case make_request(state, url) do
      {:ok, %{status: 200}} ->
        :ok

      {:ok, %{status: 401}} ->
        {:error, :unauthorized}

      {:ok, %{status: 404}} ->
        {:error, :space_not_found}

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
    content_type = Keyword.get(opts, :content_type, state.content_types)
    skip = Keyword.get(opts, :skip, 0)
    limit = Keyword.get(opts, :limit, state.limit)

    query_params = %{
      skip: skip,
      limit: limit,
      include: state.include,
      locale: state.locale
    }

    query_params =
      if content_type do
        Map.put(query_params, :content_type, content_type)
      else
        query_params
      end

    url = "#{state.base_url}/entries?" <> URI.encode_query(query_params)

    case make_request(state, url) do
      {:ok, %{status: 200, body: body}} ->
        entries = Map.get(body, "items", [])
        includes = Map.get(body, "includes", %{})
        items = Enum.map(entries, &parse_entry(&1, includes))
        {:ok, items}

      {:ok, %{status: status}} ->
        {:error, {:http_error, status}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  @doc "Get a specific content item by ID"
  @spec get_content(term(), String.t()) :: {:ok, Connector.content_item()} | {:error, term()}
  @impl Connector
  def get_content(state, id) do
    url = "#{state.base_url}/entries/#{id}?include=#{state.include}&locale=#{state.locale}"

    case make_request(state, url) do
      {:ok, %{status: 200, body: body}} ->
        {:ok, parse_entry(body, %{})}

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
    # Use Contentful Sync API for incremental updates
    # First sync gets all content, subsequent syncs use sync_token
    url =
      if state.sync_token do
        "#{state.base_url}/sync?sync_token=#{state.sync_token}"
      else
        # Initial sync with timestamp filter isn't directly supported,
        # so we fetch all and filter client-side
        "#{state.base_url}/sync?initial=true"
      end

    case fetch_sync_pages(state, url, []) do
      {:ok, items, _next_token} ->
        # Filter by updated_at >= since
        filtered =
          Enum.filter(items, fn item ->
            case item.updated_at do
              nil -> true
              dt -> DateTime.compare(dt, since) != :lt
            end
          end)

        {:ok, filtered}

      {:error, reason} ->
        {:error, reason}
    end
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
        fetch_all_entries(state)
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
    headers = [
      {"authorization", "Bearer #{state.api_key}"},
      {"content-type", "application/json"}
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
        # Fuse not installed, proceed without protection
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

  @spec parse_entry(map(), map()) :: Connector.content_item()
  defp parse_entry(entry, includes) do
    sys = entry["sys"] || %{}
    fields = entry["fields"] || %{}

    # Get content from common field names
    content = extract_content(fields)
    title = extract_field(fields, ["title", "name", "headline"])

    %{
      id: sys["id"] || "",
      title: title || "",
      content: content,
      content_type: "application/json",
      url: nil,
      author: extract_author(fields, includes),
      published_at: parse_datetime(sys["createdAt"]),
      updated_at: parse_datetime(sys["updatedAt"]),
      metadata: %{
        content_type_id: get_in(sys, ["contentType", "sys", "id"]),
        space_id: get_in(sys, ["space", "sys", "id"]),
        environment_id: get_in(sys, ["environment", "sys", "id"]),
        revision: sys["revision"],
        locale: sys["locale"],
        fields: fields
      }
    }
  end

  @spec extract_content(map()) :: String.t()
  defp extract_content(fields) do
    # Try common content field names
    content_fields = ["body", "content", "text", "description", "richText"]

    Enum.find_value(content_fields, "", fn field ->
      case Map.get(fields, field) do
        nil -> nil
        value when is_binary(value) -> value
        value when is_map(value) -> Jason.encode!(value)
        _ -> nil
      end
    end)
  end

  @spec extract_field(map(), [String.t()]) :: String.t() | nil
  defp extract_field(fields, field_names) do
    Enum.find_value(field_names, fn name ->
      case Map.get(fields, name) do
        nil -> nil
        value when is_binary(value) -> value
        value when is_map(value) -> Map.get(value, "en-US") || Map.values(value) |> List.first()
        _ -> nil
      end
    end)
  end

  @spec extract_author(map(), map()) :: String.t() | nil
  defp extract_author(fields, includes) do
    case Map.get(fields, "author") do
      %{"sys" => %{"id" => author_id}} ->
        find_included_entry(includes, author_id)
        |> case do
          %{"fields" => %{"name" => name}} -> name
          _ -> nil
        end

      _ ->
        nil
    end
  end

  @spec find_included_entry(map(), String.t()) :: map() | nil
  defp find_included_entry(includes, id) do
    entries = Map.get(includes, "Entry", [])
    Enum.find(entries, fn e -> get_in(e, ["sys", "id"]) == id end)
  end

  @spec parse_datetime(String.t() | nil) :: DateTime.t() | nil
  defp parse_datetime(nil), do: nil

  defp parse_datetime(str) do
    case DateTime.from_iso8601(str) do
      {:ok, dt, _} -> dt
      _ -> nil
    end
  end

  @spec fetch_all_entries(map()) :: [Connector.content_item()]
  defp fetch_all_entries(state) do
    fetch_entries_page(state, 0, [])
  end

  @spec fetch_entries_page(map(), non_neg_integer(), [Connector.content_item()]) ::
          [Connector.content_item()]
  defp fetch_entries_page(state, skip, acc) do
    case list_content(state, skip: skip, limit: state.limit) do
      {:ok, []} ->
        acc

      {:ok, items} when length(items) < state.limit ->
        acc ++ items

      {:ok, items} ->
        fetch_entries_page(state, skip + state.limit, acc ++ items)

      {:error, _} ->
        acc
    end
  end

  @spec fetch_sync_pages(map(), String.t(), [Connector.content_item()]) ::
          {:ok, [Connector.content_item()], String.t() | nil} | {:error, term()}
  defp fetch_sync_pages(state, url, acc) do
    case make_request(state, url) do
      {:ok, %{status: 200, body: body}} ->
        items = Map.get(body, "items", [])
        includes = Map.get(body, "includes", %{})

        parsed =
          items
          |> Enum.filter(fn item -> get_in(item, ["sys", "type"]) == "Entry" end)
          |> Enum.map(&parse_entry(&1, includes))

        case Map.get(body, "nextPageUrl") do
          nil ->
            next_token = Map.get(body, "nextSyncUrl")
            {:ok, acc ++ parsed, next_token}

          next_url ->
            fetch_sync_pages(state, next_url, acc ++ parsed)
        end

      {:ok, %{status: status}} ->
        {:error, {:http_error, status}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  @spec process_item(Connector.content_item(), module() | nil, String.t() | nil) ::
          {:ok, :created | :updated} | {:error, term()}
  defp process_item(_item, nil, _tenant_id), do: {:ok, :created}
  defp process_item(_item, _server, nil), do: {:error, :no_tenant_id}

  defp process_item(item, container_server, tenant_id) do
    content = Jason.encode!(item.metadata.fields)

    opts = [
      content_type: "application/json",
      metadata:
        Map.merge(item.metadata, %{
          source: "contentful",
          source_id: item.id,
          title: item.title,
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
