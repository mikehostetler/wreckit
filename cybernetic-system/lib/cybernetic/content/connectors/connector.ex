defmodule Cybernetic.Content.Connectors.Connector do
  @moduledoc """
  Behaviour for CMS connectors.

  Connectors integrate external content management systems with the
  Cybernetic platform, enabling content sync, incremental updates,
  and bidirectional operations.

  Supported CMS types:
  - WordPress (REST API)
  - Contentful (GraphQL)
  - Strapi (REST)
  - Sanity (GROQ)
  - Drupal (JSON:API)
  - Ghost (Content API)
  """

  @type config :: %{
          base_url: String.t(),
          api_key: String.t() | nil,
          credentials: map() | nil,
          options: keyword()
        }

  @type content_item :: %{
          id: String.t(),
          title: String.t(),
          content: binary(),
          content_type: String.t(),
          url: String.t() | nil,
          author: String.t() | nil,
          published_at: DateTime.t() | nil,
          updated_at: DateTime.t() | nil,
          metadata: map()
        }

  @type sync_result :: %{
          created: non_neg_integer(),
          updated: non_neg_integer(),
          deleted: non_neg_integer(),
          errors: [{String.t(), term()}]
        }

  @doc """
  Initialize the connector with configuration.
  Returns {:ok, state} or {:error, reason}.
  """
  @callback init(config()) :: {:ok, term()} | {:error, term()}

  @doc """
  Test the connection to the CMS.
  """
  @callback test_connection(term()) :: :ok | {:error, term()}

  @doc """
  List content items with optional filtering.
  """
  @callback list_content(term(), keyword()) :: {:ok, [content_item()]} | {:error, term()}

  @doc """
  Get a single content item by ID.
  """
  @callback get_content(term(), String.t()) :: {:ok, content_item()} | {:error, term()}

  @doc """
  Get content items modified since a given timestamp.
  Used for incremental sync.
  """
  @callback get_changes(term(), DateTime.t()) :: {:ok, [content_item()]} | {:error, term()}

  @doc """
  Sync all content from the CMS.
  Returns counts of created, updated, deleted items.
  """
  @callback sync(term(), keyword()) :: {:ok, sync_result()} | {:error, term()}

  @doc """
  Clean up connector resources.
  """
  @callback cleanup(term()) :: :ok

  # Optional callbacks with default implementations
  @optional_callbacks [cleanup: 1]

  @doc """
  Create a connector instance.
  """
  @spec create(module(), config()) :: {:ok, {module(), term()}} | {:error, term()}
  def create(module, config) do
    case module.init(config) do
      {:ok, state} -> {:ok, {module, state}}
      error -> error
    end
  end

  @doc """
  Test connection for a connector instance.
  """
  @spec test({module(), term()}) :: :ok | {:error, term()}
  def test({module, state}) do
    module.test_connection(state)
  end

  @doc """
  List content from a connector instance.
  """
  @spec list({module(), term()}, keyword()) :: {:ok, [content_item()]} | {:error, term()}
  def list({module, state}, opts \\ []) do
    module.list_content(state, opts)
  end

  @doc """
  Get single item from a connector instance.
  """
  @spec get({module(), term()}, String.t()) :: {:ok, content_item()} | {:error, term()}
  def get({module, state}, id) do
    module.get_content(state, id)
  end

  @doc """
  Get changes since timestamp from a connector instance.
  """
  @spec changes({module(), term()}, DateTime.t()) :: {:ok, [content_item()]} | {:error, term()}
  def changes({module, state}, since) do
    module.get_changes(state, since)
  end

  @doc """
  Run sync for a connector instance.
  """
  @spec sync({module(), term()}, keyword()) :: {:ok, sync_result()} | {:error, term()}
  def sync({module, state}, opts \\ []) do
    module.sync(state, opts)
  end

  @doc """
  Cleanup a connector instance.
  """
  @spec cleanup({module(), term()}) :: :ok
  def cleanup({module, state}) do
    if function_exported?(module, :cleanup, 1) do
      module.cleanup(state)
    else
      :ok
    end
  end
end
