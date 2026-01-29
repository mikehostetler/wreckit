defmodule Cybernetic.Repo.Migrations.CreateSystemStates do
  @moduledoc """
  Creates the system_states table for VSM S1-S5 operational states.

  Each VSM system (1-5) can have multiple state snapshots over time,
  enabling historical analysis and state recovery.
  """
  use Ecto.Migration

  def change do
    create table(:system_states, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :tenant_id, references(:tenants, type: :binary_id, on_delete: :delete_all), null: false
      add :system, :integer, null: false  # 1-5 for VSM systems
      add :state, :map, null: false, default: %{}
      add :version, :integer, null: false, default: 1
      add :metadata, :map, default: %{}

      timestamps(type: :utc_datetime_usec)
    end

    create index(:system_states, [:tenant_id])
    create index(:system_states, [:tenant_id, :system])
    create index(:system_states, [:tenant_id, :inserted_at])

    # Constraint to ensure system is 1-5
    create constraint(:system_states, :valid_system, check: "system >= 1 AND system <= 5")
  end
end
