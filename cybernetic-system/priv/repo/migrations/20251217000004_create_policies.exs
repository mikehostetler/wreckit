defmodule Cybernetic.Repo.Migrations.CreatePolicies do
  @moduledoc """
  Creates the policies table for S5 Policy decisions.

  Policies are the governing rules established by System 5 that
  guide the behavior of the entire VSM.
  """
  use Ecto.Migration

  def change do
    create table(:policies, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :tenant_id, references(:tenants, type: :binary_id, on_delete: :delete_all), null: false
      add :name, :string, null: false
      add :description, :text
      add :rules, :map, null: false, default: %{}  # Policy rules as structured data
      add :priority, :integer, default: 0  # Higher priority = evaluated first
      add :active, :boolean, default: true, null: false
      add :effective_from, :utc_datetime_usec
      add :effective_until, :utc_datetime_usec

      timestamps(type: :utc_datetime_usec)
    end

    create index(:policies, [:tenant_id])
    create index(:policies, [:tenant_id, :active])
    create index(:policies, [:tenant_id, :priority])
    create unique_index(:policies, [:tenant_id, :name])
  end
end
