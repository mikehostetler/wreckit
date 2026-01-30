defmodule Cybernetic.Schemas.Storage.Artifact do
  @moduledoc """
  Artifact schema for storage metadata.

  Artifacts track files stored in the storage layer with metadata
  for retrieval, management, and expiration.

  ## Fields

  - `path` - Storage path (tenant-prefixed in storage backend)
  - `filename` - Original filename
  - `content_type` - MIME type
  - `size` - File size in bytes
  - `checksum` - SHA256 hash for integrity verification
  - `storage_backend` - Where the file is stored
  - `metadata` - Additional metadata as JSON
  - `expires_at` - Optional expiration timestamp

  ## Storage Backends

  - `local` - Local filesystem (development)
  - `s3` - S3-compatible storage (production)
  - `memory` - In-memory (testing)

  ## Example

      %Artifact{
        path: "episodes/2025/12",
        filename: "analysis_report.pdf",
        content_type: "application/pdf",
        size: 1024 * 1024,  # 1MB
        checksum: "abc123...",
        storage_backend: "s3",
        metadata: %{"author" => "s4", "generated" => true}
      }
  """
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  @storage_backends ~w(local s3 memory)

  schema "artifacts" do
    field(:path, :string)
    field(:filename, :string)
    field(:content_type, :string)
    field(:size, :integer)
    field(:checksum, :string)
    field(:storage_backend, :string, default: "local")
    field(:metadata, :map, default: %{})
    field(:expires_at, :utc_datetime_usec)

    belongs_to(:tenant, Cybernetic.Schemas.Storage.Tenant)

    timestamps(type: :utc_datetime_usec)
  end

  @required_fields ~w(tenant_id path filename)a
  @optional_fields ~w(content_type size checksum storage_backend metadata expires_at)a

  @doc """
  Creates a changeset for a new artifact.
  """
  def changeset(artifact, attrs) do
    artifact
    |> cast(attrs, @required_fields ++ @optional_fields)
    |> validate_required(@required_fields)
    |> validate_length(:path, min: 1, max: 1000)
    |> validate_length(:filename, min: 1, max: 255)
    |> validate_inclusion(:storage_backend, @storage_backends)
    |> validate_number(:size, greater_than_or_equal_to: 0)
    |> validate_path_safety()
    |> unique_constraint([:tenant_id, :path, :filename])
    |> foreign_key_constraint(:tenant_id)
  end

  @doc """
  Creates a changeset for updating metadata.
  """
  def metadata_changeset(artifact, attrs) do
    artifact
    |> cast(attrs, [:metadata])
  end

  @doc """
  Creates a changeset for setting expiration.
  """
  def expiration_changeset(artifact, attrs) do
    artifact
    |> cast(attrs, [:expires_at])
  end

  @doc """
  Returns the full storage path including tenant prefix.
  """
  def full_path(artifact, tenant_id) do
    Path.join([tenant_id, artifact.path, artifact.filename])
  end

  @doc """
  Returns true if the artifact has expired.
  """
  def expired?(artifact, now \\ DateTime.utc_now()) do
    artifact.expires_at && DateTime.compare(now, artifact.expires_at) == :gt
  end

  # Validate path doesn't contain directory traversal
  defp validate_path_safety(changeset) do
    path = get_field(changeset, :path)

    if path && String.contains?(path, "..") do
      add_error(changeset, :path, "cannot contain directory traversal")
    else
      changeset
    end
  end
end
