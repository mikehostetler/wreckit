defmodule Cybernetic.Storage.BlobRegistry do
  @moduledoc """
  Blob Registry schema for tracking container storage locations.

  Tracks where semantic containers are stored across different storage tiers
  and backends, enabling the storage abstraction layer to locate and manage
  container data.

  ## VSM Architecture

  This module operates as part of System 1 (Operations) in the Viable
  System Model, handling the storage metadata tracking for content containers.

  ## Storage Tiers

  - `hot` - Fast SSD/memory storage for frequently accessed containers
  - `warm` - Standard storage for occasionally accessed containers
  - `cold` - Archive storage for rarely accessed containers
  - `ipfs` - IPFS distributed storage for content-addressed containers
  - `hb` - Hyperbeam storage for decentralized persistence

  ## Example

      %BlobRegistry{
        container_id: "abc123-...",
        blob_id: "blob_xyz",
        tier: "hot",
        backend: "minio",
        url: "http://minio:9000/bucket/blob_xyz",
        size_bytes: 1024 * 1024,
        content_type: "application/json",
        access_count: 42
      }
  """
  use Ecto.Schema
  import Ecto.Changeset

  alias Cybernetic.Schemas.Storage.Tenant

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  @valid_tiers ~w(hot warm cold ipfs hb)

  @doc "Schema for the blob_registry table"
  schema "blob_registry" do
    field :container_id, :binary_id
    field :blob_id, :string
    field :tier, :string
    field :backend, :string
    field :url, :string
    field :size_bytes, :integer
    field :content_type, :string
    field :last_accessed_at, :utc_datetime
    field :access_count, :integer, default: 0

    belongs_to :tenant, Tenant

    timestamps(type: :utc_datetime)
  end

  @required_fields ~w(container_id blob_id tier backend size_bytes)a
  @optional_fields ~w(url content_type last_accessed_at access_count tenant_id)a

  @doc """
  Creates a changeset for a new blob registry entry.
  """
  @spec changeset(t(), map()) :: Ecto.Changeset.t()
  def changeset(registry, attrs) do
    registry
    |> cast(attrs, @required_fields ++ @optional_fields)
    |> validate_required(@required_fields)
    |> validate_inclusion(:tier, @valid_tiers)
    |> validate_number(:size_bytes, greater_than_or_equal_to: 0)
    |> validate_number(:access_count, greater_than_or_equal_to: 0)
    |> unique_constraint(:container_id)
    |> foreign_key_constraint(:tenant_id)
  end

  @doc """
  Creates a changeset for updating access statistics.
  """
  @spec access_changeset(t(), map()) :: Ecto.Changeset.t()
  def access_changeset(registry, attrs \\ %{}) do
    now = DateTime.utc_now() |> DateTime.truncate(:second)

    registry
    |> cast(attrs, [:last_accessed_at, :access_count])
    |> put_change(:last_accessed_at, now)
    |> put_change(:access_count, (registry.access_count || 0) + 1)
  end

  @doc """
  Creates a changeset for migrating to a different tier.
  """
  @spec migration_changeset(t(), String.t(), String.t(), String.t() | nil) :: Ecto.Changeset.t()
  def migration_changeset(registry, new_tier, new_backend, new_url \\ nil) do
    registry
    |> cast(%{tier: new_tier, backend: new_backend, url: new_url}, [:tier, :backend, :url])
    |> validate_inclusion(:tier, @valid_tiers)
  end

  @doc """
  Returns valid storage tier values.
  """
  @spec valid_tiers() :: [String.t()]
  def valid_tiers, do: @valid_tiers

  @type t :: %__MODULE__{
          id: binary(),
          container_id: binary(),
          blob_id: String.t(),
          tier: String.t(),
          backend: String.t(),
          url: String.t() | nil,
          size_bytes: integer(),
          content_type: String.t() | nil,
          last_accessed_at: DateTime.t() | nil,
          access_count: integer(),
          tenant_id: binary() | nil,
          inserted_at: DateTime.t(),
          updated_at: DateTime.t()
        }
end
