defmodule Cybernetic.Repo.Migrations.EnablePgvector do
  @moduledoc """
  Enable the pgvector extension for vector similarity search.

  This extension enables:
  - Vector data type for storing embeddings
  - IVFFlat and HNSW index types for similarity search
  - Distance operators (L2, inner product, cosine)
  """
  use Ecto.Migration

  def up do
    execute "CREATE EXTENSION IF NOT EXISTS vector"
  end

  def down do
    execute "DROP EXTENSION IF EXISTS vector"
  end
end
