defmodule Cybernetic.Repo.Migrations.CreateBlobRegistry do
  @moduledoc """
  Create the blob_registry table for tracking container storage locations.

  This table tracks where semantic containers are stored across different
  storage tiers (hot, warm, cold, ipfs, hb) and backends.
  """
  use Ecto.Migration

  def change do
    create table(:blob_registry, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :container_id, :binary_id, null: false
      add :blob_id, :string, null: false
      add :tier, :string, null: false
      add :backend, :string, null: false
      add :url, :string
      add :size_bytes, :bigint, null: false
      add :content_type, :string
      add :last_accessed_at, :utc_datetime
      add :access_count, :integer, default: 0
      add :tenant_id, references(:tenants, type: :binary_id, on_delete: :delete_all)

      timestamps(type: :utc_datetime)
    end

    create unique_index(:blob_registry, [:container_id])
    create index(:blob_registry, [:tier])
    create index(:blob_registry, [:backend])
    create index(:blob_registry, [:last_accessed_at])
    create index(:blob_registry, [:tenant_id])

    # Add constraint for valid tier values
    create constraint(:blob_registry, :valid_tier,
             check: "tier IN ('hot', 'warm', 'cold', 'ipfs', 'hb')"
           )
  end
end
