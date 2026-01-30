defmodule Cybernetic.Repo.Migrations.CreateTenants do
  @moduledoc """
  Creates the tenants table for multi-tenant isolation.

  Tenants are the top-level organizational unit. All VSM data
  is scoped to a tenant for isolation and security.
  """
  use Ecto.Migration

  def change do
    create table(:tenants, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :name, :string, null: false
      add :slug, :string, null: false
      add :settings, :map, default: %{}
      add :active, :boolean, default: true, null: false

      timestamps(type: :utc_datetime_usec)
    end

    create unique_index(:tenants, [:slug])
    create index(:tenants, [:active])
  end
end
