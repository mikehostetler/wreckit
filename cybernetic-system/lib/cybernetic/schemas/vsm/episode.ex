defmodule Cybernetic.Schemas.VSM.Episode do
  @moduledoc """
  Episode schema for S4 Intelligence episodes.

  Episodes represent units of environmental intelligence gathered
  by System 4. They can come from various sources (Telegram, web
  scraping, API calls) and are analyzed to extract insights.

  ## Lifecycle

  1. `pending` - Episode created, awaiting analysis
  2. `analyzing` - Analysis in progress
  3. `complete` - Analysis finished successfully
  4. `error` - Analysis failed

  ## Fields

  - `title` - Brief description of the episode
  - `content` - Full content/text of the episode
  - `source` - Origin (e.g., "telegram", "web", "api")
  - `source_id` - External identifier for deduplication
  - `analysis` - S4 analysis results as JSON
  - `embeddings` - Vector embeddings for similarity search
  - `tags` - Categorization tags
  - `status` - Processing status

  ## Example

      %Episode{
        title: "Market trend analysis",
        content: "Full text of the analysis...",
        source: "telegram",
        source_id: "msg_12345",
        analysis: %{
          "sentiment" => "positive",
          "entities" => ["ACME Corp", "Q4 2025"],
          "summary" => "..."
        },
        tags: ["market", "analysis", "q4-2025"]
      }
  """
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  @statuses ~w(pending analyzing complete error)

  schema "episodes" do
    field(:title, :string)
    field(:content, :string)
    field(:source, :string)
    field(:source_id, :string)
    field(:analysis, :map, default: %{})
    field(:embeddings, {:array, :float})
    field(:tags, {:array, :string}, default: [])
    field(:status, :string, default: "pending")

    belongs_to(:tenant, Cybernetic.Schemas.Storage.Tenant)

    timestamps(type: :utc_datetime_usec)
  end

  @required_fields ~w(tenant_id title)a
  @optional_fields ~w(content source source_id analysis embeddings tags status)a

  @doc """
  Creates a changeset for a new episode.
  """
  def changeset(episode, attrs) do
    episode
    |> cast(attrs, @required_fields ++ @optional_fields)
    |> validate_required(@required_fields)
    |> validate_length(:title, min: 1, max: 500)
    |> validate_inclusion(:status, @statuses)
    |> foreign_key_constraint(:tenant_id)
  end

  @doc """
  Creates a changeset for updating analysis results.
  """
  def analysis_changeset(episode, attrs) do
    episode
    |> cast(attrs, [:analysis, :embeddings, :status])
    |> validate_inclusion(:status, @statuses)
  end

  @doc """
  Creates a changeset for updating tags.
  """
  def tags_changeset(episode, attrs) do
    episode
    |> cast(attrs, [:tags])
  end

  @doc """
  Returns true if the episode is in a terminal state.
  """
  def terminal?(episode) do
    episode.status in ["complete", "error"]
  end
end
