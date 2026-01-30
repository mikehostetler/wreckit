defmodule Cybernetic.Content.Connectors.Sanity do
  @moduledoc """
  Sanity.io GROQ API connector.

  Connects to Sanity projects via the GROQ query language to sync
  documents and assets.

  Configuration:
  - base_url: Optional custom API URL
  - api_key: Sanity API token (required for private datasets)
  - credentials: %{project_id: "...", dataset: "production"}
  - options: document_types, api_version

  Supports:
  - GROQ queries for flexible content fetching
  - Document type filtering
  - Incremental sync via _updatedAt
  - Asset references resolution
  - Draft documents (with token)
  
  ## VSM Architecture

  This connector operates as part of System 1 (Operations) in the Viable
  System Model, handling the operational data flow from external CMS systems
  into the Cybernetic content pipeline.
  """

  @behaviour Cybernetic.Content.Connectors.Connector

  require Logger

  alias Cybernetic.Content.Connectors.Connector

  @api_base "https://{project_id}.api.sanity.io"
  @cdn_base "https://{project_id}.apicdn.sanity.io"
  @default_api_version "2024-01-01"
  @default_limit 100
  @request_timeout 30_000
  @fuse_name :sanity_connector_fuse
  @fuse_opts {{:standard, 5, 60_000}, {:reset, 30_000}}

  # Callbacks

  @doc "Initialize the connector with the given configuration"
  @spec init(Connector.config()) :: {:ok, term()} | {:error, term()}
  @impl Connector
  def init(config) do
    credentials = Map.fetch!(config, :credentials)
    project_id = Map.fetch!(credentials, :project_id)
    dataset = Map.get(credentials, :dataset, "production")
    api_key = Map.get(config, :api_key)
    options = Map.get(config, :options, [])

    use_cdn = Keyword.get(options, :use_cdn, api_key == nil)

    base_template = if use_cdn, do: @cdn_base, else: @api_base
    base_url = String.replace(base_template, "{project_id}", project_id)

    api_version = Keyword.get(options, :api_version, @default_api_version)

    state = %{
      project_id: project_id,
      dataset: dataset,
      api_key: api_key,
      base_url: base_url,
      api_version: api_version,
      document_types: Keyword.get(options, :document_types),
      limit: Keyword.get(options, :limit, @default_limit)
    }

    # Install circuit breaker if not already installed
    :fuse.install(@fuse_name, @fuse_opts)
    {:ok, state}
  end

  @doc "Test that the connection to the CMS is working"
  @spec test_connection(term()) :: :ok | {:error, term()}
  @impl Connector
  def test_connection(state) do
    query = "*[_type == 'sanity.imageAsset'][0]"
    url = build_query_url(state, query)

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
    document_type = Keyword.get(opts, :document_type)
    offset = Keyword.get(opts, :offset, 0)
    limit = Keyword.get(opts, :limit, state.limit)

    type_filter =
      cond do
        document_type -> "_type == '#{sanitize_groq_input(document_type)}'"
        state.document_types ->
          sanitized_types = Enum.map(state.document_types, &sanitize_groq_input/1)
          "_type in #{inspect(sanitized_types)}"
        true -> "!(_type match 'system.*') && !(_type match 'sanity.*')"
      end

    query = """
    *[#{type_filter}] | order(_updatedAt desc) [#{offset}...#{offset + limit}] {
      _id,
      _type,
      _createdAt,
      _updatedAt,
      title,
      name,
      slug,
      body,
      content,
      description,
      author->{name, _id},
      ...
    }
    """

    url = build_query_url(state, query)

    case make_request(state, url) do
      {:ok, %{status: 200, body: %{"result" => result}}} when is_list(result) ->
        items = Enum.map(result, &parse_document/1)
        {:ok, items}

      {:ok, %{status: 200, body: body}} when is_list(body) ->
        items = Enum.map(body, &parse_document/1)
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
    sanitized_id = sanitize_groq_input(id)
    query = "*[_id == '#{sanitized_id}'][0]"
    url = build_query_url(state, query)

    case make_request(state, url) do
      {:ok, %{status: 200, body: %{"result" => nil}}} ->
        {:error, :not_found}

      {:ok, %{status: 200, body: %{"result" => result}}} ->
        {:ok, parse_document(result)}

      {:ok, %{status: 200, body: nil}} ->
        {:error, :not_found}

      {:ok, %{status: 200, body: body}} when is_map(body) ->
        {:ok, parse_document(body)}

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
    # DateTime.to_iso8601/1 produces safe ISO8601 strings that don't need sanitization
    since_str = DateTime.to_iso8601(since)

    type_filter =
      if state.document_types do
        sanitized_types = Enum.map(state.document_types, &sanitize_groq_input/1)
        "_type in #{inspect(sanitized_types)}"
      else
        "!(_type match 'system.*') && !(_type match 'sanity.*')"
      end

    query = """
    *[#{type_filter} && _updatedAt >= '#{since_str}'] | order(_updatedAt desc) {
      _id,
      _type,
      _createdAt,
      _updatedAt,
      title,
      name,
      slug,
      body,
      content,
      description,
      author->{name, _id},
      ...
    }
    """

    url = build_query_url(state, query)

    case make_request(state, url) do
      {:ok, %{status: 200, body: %{"result" => result}}} when is_list(result) ->
        items = Enum.map(result, &parse_document/1)
        {:ok, items}

      {:ok, %{status: status}} ->
        {:error, {:http_error, status}}

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
        fetch_all_documents(state)
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

  @spec build_query_url(map(), String.t()) :: String.t()
  defp build_query_url(state, query) do
    encoded_query = URI.encode(String.trim(query))
    "#{state.base_url}/v#{state.api_version}/data/query/#{state.dataset}?query=#{encoded_query}"
  end

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

  # Sanitize input for GROQ queries to prevent injection
  @spec sanitize_groq_input(String.t()) :: String.t()
  defp sanitize_groq_input(input) when is_binary(input) do
    # Only allow alphanumeric, hyphens, underscores
    Regex.replace(~r/[^a-zA-Z0-9_-]/, input, "")
  end

  defp sanitize_groq_input(_), do: ""

  @spec parse_document(map()) :: Connector.content_item()
  defp parse_document(doc) do
    %{
      id: doc["_id"] || "",
      title: doc["title"] || doc["name"] || "",
      content: extract_content(doc),
      content_type: "application/json",
      url: extract_url(doc),
      author: extract_author(doc),
      published_at: parse_datetime(doc["_createdAt"]),
      updated_at: parse_datetime(doc["_updatedAt"]),
      metadata: %{
        document_type: doc["_type"],
        slug: get_slug(doc),
        rev: doc["_rev"],
        document: doc
      }
    }
  end

  @spec extract_content(map()) :: String.t()
  defp extract_content(doc) do
    # Try to extract from Portable Text or plain text fields
    cond do
      body = doc["body"] ->
        render_portable_text(body)

      content = doc["content"] ->
        if is_list(content), do: render_portable_text(content), else: to_string(content)

      description = doc["description"] ->
        to_string(description)

      true ->
        # Return full document as JSON
        Jason.encode!(doc)
    end
  end

  @spec render_portable_text(list() | term()) :: String.t()
  defp render_portable_text(blocks) when is_list(blocks) do
    Enum.map_join(blocks, "\n", fn
      %{"_type" => "block", "style" => style, "children" => children} ->
        text = render_block_children(children)

        case style do
          "h1" -> "<h1>#{text}</h1>"
          "h2" -> "<h2>#{text}</h2>"
          "h3" -> "<h3>#{text}</h3>"
          "h4" -> "<h4>#{text}</h4>"
          "blockquote" -> "<blockquote>#{text}</blockquote>"
          _ -> "<p>#{text}</p>"
        end

      %{"_type" => "code", "code" => code, "language" => lang} ->
        "<pre><code class=\"language-#{lang}\">#{code}</code></pre>"

      %{"_type" => "image"} ->
        "[image]"

      _ ->
        ""
    end)
  end

  defp render_portable_text(text) when is_binary(text), do: text
  defp render_portable_text(_), do: ""

  @spec render_block_children(list()) :: String.t()
  defp render_block_children(children) when is_list(children) do
    Enum.map_join(children, "", fn
      %{"_type" => "span", "text" => text, "marks" => marks} ->
        wrap_with_marks(text, marks)

      %{"_type" => "span", "text" => text} ->
        text

      %{"text" => text} ->
        text

      _ ->
        ""
    end)
  end

  defp render_block_children(_), do: ""

  @spec wrap_with_marks(String.t(), list()) :: String.t()
  defp wrap_with_marks(text, marks) when is_list(marks) do
    Enum.reduce(marks, text, fn
      "strong", acc -> "<strong>#{acc}</strong>"
      "em", acc -> "<em>#{acc}</em>"
      "code", acc -> "<code>#{acc}</code>"
      "underline", acc -> "<u>#{acc}</u>"
      "strike-through", acc -> "<s>#{acc}</s>"
      _, acc -> acc
    end)
  end

  defp wrap_with_marks(text, _), do: text

  @spec extract_url(map()) :: String.t() | nil
  defp extract_url(doc) do
    case get_slug(doc) do
      nil -> nil
      slug -> "/#{doc["_type"]}/#{slug}"
    end
  end

  @spec get_slug(map()) :: String.t() | nil
  defp get_slug(doc) do
    case doc["slug"] do
      %{"current" => slug} -> slug
      slug when is_binary(slug) -> slug
      _ -> nil
    end
  end

  @spec extract_author(map()) :: String.t() | nil
  defp extract_author(doc) do
    case doc["author"] do
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

  @spec fetch_all_documents(map()) :: [Connector.content_item()]
  defp fetch_all_documents(state) do
    fetch_documents_page(state, 0, [])
  end

  @spec fetch_documents_page(map(), non_neg_integer(), [Connector.content_item()]) ::
          [Connector.content_item()]
  defp fetch_documents_page(state, offset, acc) do
    case list_content(state, offset: offset, limit: state.limit) do
      {:ok, []} ->
        acc

      {:ok, items} when length(items) < state.limit ->
        acc ++ items

      {:ok, items} ->
        fetch_documents_page(state, offset + state.limit, acc ++ items)

      {:error, _} ->
        acc
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
          source: "sanity",
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
