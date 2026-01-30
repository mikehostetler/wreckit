defmodule Cybernetic.Repo.Migrations.CreateEpisodes do
  @moduledoc """
  Creates the episodes table for S4 Intelligence episodes.

  Episodes represent units of learning/intelligence gathered by
  System 4 from environmental scanning and analysis.
  """
  use Ecto.Migration

  def change do
    create table(:episodes, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :tenant_id, references(:tenants, type: :binary_id, on_delete: :delete_all), null: false
      add :title, :string, null: false
      add :content, :text
      add :source, :string  # Where the episode came from
      add :source_id, :string  # External identifier if applicable
      add :analysis, :map, default: %{}  # S4 analysis results
      add :embeddings, {:array, :float}  # Vector embeddings for similarity search
      add :tags, {:array, :string}, default: []
      add :status, :string, default: "pending"  # pending, analyzing, complete, error

      timestamps(type: :utc_datetime_usec)
    end

    create index(:episodes, [:tenant_id])
    create index(:episodes, [:tenant_id, :status])
    create index(:episodes, [:tenant_id, :source])
    create index(:episodes, [:tenant_id, :inserted_at])
    create index(:episodes, [:tags], using: :gin)
  end
end
