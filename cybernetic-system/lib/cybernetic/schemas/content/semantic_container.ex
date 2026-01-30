defmodule Cybernetic.Schemas.Content.SemanticContainer do
  @moduledoc """
  Ecto schema for semantic container database persistence.

  This schema provides the database layer for semantic containers, storing:
  - Content identification (CID, hash)
  - Vector embeddings for semantic search
  - Capabilities and policies
  - Processing status and metadata

  ## VSM Architecture

  This module operates as part of System 1 (Operations) in the Viable
  System Model, providing persistent storage for content containers.

  ## Processing Status

  - `pending` - Container created, awaiting embedding generation
  - `processing` - Currently generating embeddings
  - `indexed` - Fully indexed and searchable
  - `failed` - Processing failed, needs retry

  ## Example

      %SemanticContainer{
        content_cid: "QmXyz...",
        title: "Product Documentation",
        content_type: "text/markdown",
        embedding: [...],
        capabilities: [%{"name" => "search", "access" => "public"}],
        policy: %{"access" => "tenant"},
        status: "indexed",
        tags: ["docs", "product", "v2"]
      }
  """
  use Ecto.Schema
  import Ecto.Changeset

  alias Cybernetic.Schemas.Storage.Tenant

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  @valid_statuses ~w(pending processing indexed failed)

  @doc "Schema for the semantic_containers table"
  schema "semantic_containers" do
    field :content_cid, :string
    field :title, :string
    field :content_type, :string
    field :embedding, Pgvector.Ecto.Vector
    field :embedding_model, :string
    field :capabilities, {:array, :map}, default: []
    field :policy, :map, default: %{"access" => "private"}
    field :bucket_settings, :map, default: %{}
    field :metadata, :map, default: %{}
    field :tags, {:array, :string}, default: []
    field :status, :string, default: "pending"
    field :indexed_at, :utc_datetime

    belongs_to :tenant, Tenant

    timestamps(type: :utc_datetime)
  end

  @required_fields ~w(content_cid)a
  @optional_fields ~w(title content_type embedding embedding_model capabilities policy
                      bucket_settings metadata tags status indexed_at tenant_id)a

  @doc """
  Creates a changeset for a new semantic container.
  """
  @spec changeset(t(), map()) :: Ecto.Changeset.t()
  def changeset(container, attrs) do
    container
    |> cast(attrs, @required_fields ++ @optional_fields)
    |> validate_required(@required_fields)
    |> validate_inclusion(:status, @valid_statuses)
    |> validate_length(:title, max: 500)
    |> unique_constraint(:content_cid)
    |> foreign_key_constraint(:tenant_id)
  end

  @doc """
  Creates a changeset for updating the embedding.
  """
  @spec embedding_changeset(t(), list(), String.t()) :: Ecto.Changeset.t()
  def embedding_changeset(container, embedding, model) when is_list(embedding) do
    now = DateTime.utc_now() |> DateTime.truncate(:second)

    container
    |> cast(%{embedding: embedding, embedding_model: model}, [:embedding, :embedding_model])
    |> put_change(:status, "indexed")
    |> put_change(:indexed_at, now)
  end

  @doc """
  Creates a changeset for updating status.
  """
  @spec status_changeset(t(), String.t()) :: Ecto.Changeset.t()
  def status_changeset(container, status) do
    container
    |> cast(%{status: status}, [:status])
    |> validate_inclusion(:status, @valid_statuses)
  end

  @doc """
  Creates a changeset for updating capabilities.
  """
  @spec capabilities_changeset(t(), list()) :: Ecto.Changeset.t()
  def capabilities_changeset(container, capabilities) when is_list(capabilities) do
    container
    |> cast(%{capabilities: capabilities}, [:capabilities])
  end

  @doc """
  Creates a changeset for updating policy.
  """
  @spec policy_changeset(t(), map()) :: Ecto.Changeset.t()
  def policy_changeset(container, policy) when is_map(policy) do
    container
    |> cast(%{policy: policy}, [:policy])
  end

  @doc """
  Creates a changeset for adding tags.
  """
  @spec tags_changeset(t(), list()) :: Ecto.Changeset.t()
  def tags_changeset(container, tags) when is_list(tags) do
    container
    |> cast(%{tags: tags}, [:tags])
  end

  @doc """
  Returns valid status values.
  """
  @spec valid_statuses() :: [String.t()]
  def valid_statuses, do: @valid_statuses

  @type t :: %__MODULE__{
          id: binary(),
          content_cid: String.t(),
          title: String.t() | nil,
          content_type: String.t() | nil,
          embedding: list() | nil,
          embedding_model: String.t() | nil,
          capabilities: list(),
          policy: map(),
          bucket_settings: map(),
          metadata: map(),
          tags: list(),
          status: String.t(),
          indexed_at: DateTime.t() | nil,
          tenant_id: binary() | nil,
          inserted_at: DateTime.t(),
          updated_at: DateTime.t()
        }
end
