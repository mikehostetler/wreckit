defmodule Cybernetic.Repo.Migrations.AddObanTables do
  @moduledoc """
  Adds Oban job tables for background processing.

  Uses Oban's built-in migration system for reliable,
  PostgreSQL-backed job queuing.
  """
  use Ecto.Migration

  def up do
    Oban.Migration.up(version: 12)
  end

  def down do
    Oban.Migration.down(version: 1)
  end
end
