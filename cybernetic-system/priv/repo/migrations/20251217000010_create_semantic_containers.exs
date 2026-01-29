defmodule Cybernetic.Repo.Migrations.CreateSemanticContainers do
  @moduledoc """
  Create the semantic_containers table for storing container metadata.

  This table stores semantic containers with their embeddings, capabilities,
  policies, and metadata. Uses pgvector for vector similarity search.
  """
  use Ecto.Migration

  def change do
    create table(:semantic_containers, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :content_cid, :string, null: false
      add :title, :string
      add :content_type, :string

      # Vector embedding for semantic search (pgvector)
      # Using 1536 dimensions for OpenAI text-embedding-3-small
      add :embedding, :vector, size: 1536
      add :embedding_model, :string

      # Capabilities as JSONB array
      add :capabilities, :jsonb, default: "[]"

      # Policy configuration
      add :policy, :jsonb, null: false, default: "{\"access\": \"private\"}"

      # Bucket settings for storage tier management
      add :bucket_settings, :jsonb, default: "{}"

      # Additional metadata
      add :metadata, :jsonb, default: "{}"

      # Tags for filtering
      add :tags, {:array, :string}, default: []

      # Processing status
      add :status, :string, default: "pending"

      # Index timestamps
      add :indexed_at, :utc_datetime

      # Tenant association
      add :tenant_id, references(:tenants, type: :binary_id, on_delete: :delete_all)

      timestamps(type: :utc_datetime)
    end

    create unique_index(:semantic_containers, [:content_cid])
    create index(:semantic_containers, [:status])
    create index(:semantic_containers, [:tags], using: "GIN")
    create index(:semantic_containers, [:capabilities], using: "GIN")
    create index(:semantic_containers, [:tenant_id])
    create index(:semantic_containers, [:inserted_at])

    # Add constraint for valid status values
    create constraint(:semantic_containers, :valid_status,
             check: "status IN ('pending', 'processing', 'indexed', 'failed')"
           )

    # Create HNSW index for vector similarity search
    # Using cosine distance for semantic similarity
    execute """
    CREATE INDEX IF NOT EXISTS semantic_containers_embedding_idx
    ON semantic_containers
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
    """,
    "DROP INDEX IF EXISTS semantic_containers_embedding_idx"
  end
end
