defmodule Cybernetic.Repo.Migrations.CreateCapabilityManifests do
  @moduledoc """
  Create the capability_manifests table for service discovery.

  This table stores capability manifests that describe what services and tools
  can do, enabling dynamic discovery and routing.
  """
  use Ecto.Migration

  def change do
    create table(:capability_manifests, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :name, :string, null: false
      add :version, :string, null: false
      add :description, :text

      # Capability type (tool, service, provider, etc.)
      add :type, :string, null: false

      # Schema definition for inputs/outputs
      add :input_schema, :jsonb, default: "{}"
      add :output_schema, :jsonb, default: "{}"

      # Constraints and limits
      add :constraints, :jsonb, default: "{}"

      # Cost information
      add :cost, :jsonb, default: "{}"

      # Endpoint configuration
      add :endpoint, :jsonb

      # Tags for discovery
      add :tags, {:array, :string}, default: []

      # Status
      add :status, :string, default: "active"

      # Provider/owner
      add :provider, :string

      # Tenant association (nil for global capabilities)
      add :tenant_id, references(:tenants, type: :binary_id, on_delete: :delete_all)

      timestamps(type: :utc_datetime)
    end

    create unique_index(:capability_manifests, [:name, :version])
    create index(:capability_manifests, [:type])
    create index(:capability_manifests, [:status])
    create index(:capability_manifests, [:provider])
    create index(:capability_manifests, [:tags], using: "GIN")
    create index(:capability_manifests, [:tenant_id])

    # Add constraint for valid status values
    create constraint(:capability_manifests, :valid_capability_status,
             check: "status IN ('active', 'deprecated', 'disabled')"
           )

    # Add constraint for valid type values
    create constraint(:capability_manifests, :valid_capability_type,
             check: "type IN ('tool', 'service', 'provider', 'resource', 'action')"
           )
  end
end
