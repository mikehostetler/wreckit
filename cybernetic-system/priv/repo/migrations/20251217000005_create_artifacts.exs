defmodule Cybernetic.Repo.Migrations.CreateArtifacts do
  @moduledoc """
  Creates the artifacts table for storage metadata.

  Artifacts track files stored in the storage layer (local, S3, etc.)
  with metadata for retrieval and management.
  """
  use Ecto.Migration

  def change do
    create table(:artifacts, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :tenant_id, references(:tenants, type: :binary_id, on_delete: :delete_all), null: false
      add :path, :string, null: false  # Storage path (tenant-prefixed)
      add :filename, :string, null: false
      add :content_type, :string
      add :size, :bigint  # File size in bytes
      add :checksum, :string  # SHA256 hash
      add :storage_backend, :string, default: "local"  # local, s3, memory
      add :metadata, :map, default: %{}
      add :expires_at, :utc_datetime_usec  # Optional expiration

      timestamps(type: :utc_datetime_usec)
    end

    create index(:artifacts, [:tenant_id])
    create index(:artifacts, [:tenant_id, :path])
    create unique_index(:artifacts, [:tenant_id, :path, :filename])
    create index(:artifacts, [:expires_at])
  end
end
