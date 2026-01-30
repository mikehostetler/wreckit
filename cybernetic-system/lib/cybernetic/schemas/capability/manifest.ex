defmodule Cybernetic.Schemas.Capability.Manifest do
  @moduledoc """
  Ecto schema for capability manifest database persistence.

  Capability manifests describe what services and tools can do, enabling
  dynamic discovery and intelligent routing of requests to appropriate
  handlers.

  ## VSM Architecture

  This module operates as part of System 1 (Operations) in the Viable
  System Model, providing the capability discovery layer for the platform.

  ## Capability Types

  - `tool` - Executable tool (function, API endpoint)
  - `service` - Long-running service
  - `provider` - LLM or external provider
  - `resource` - Data resource or storage
  - `action` - Discrete action (create, update, delete)

  ## Status Values

  - `active` - Capability is available for use
  - `deprecated` - Still works but should not be used for new integrations
  - `disabled` - Temporarily unavailable

  ## Example

      %Manifest{
        name: "search_documents",
        version: "1.0.0",
        type: "tool",
        description: "Semantic search across all indexed documents",
        input_schema: %{
          "type" => "object",
          "properties" => %{
            "query" => %{"type" => "string"},
            "limit" => %{"type" => "integer", "default" => 10}
          }
        },
        output_schema: %{
          "type" => "array",
          "items" => %{"$ref" => "#/definitions/SearchResult"}
        },
        constraints: %{"max_results" => 100},
        cost: %{"per_call" => 0.001},
        tags: ["search", "semantic", "documents"],
        status: "active"
      }
  """
  use Ecto.Schema
  import Ecto.Changeset

  alias Cybernetic.Schemas.Storage.Tenant

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  @valid_types ~w(tool service provider resource action)
  @valid_statuses ~w(active deprecated disabled)

  @doc "Schema for the capability_manifests table"
  schema "capability_manifests" do
    field :name, :string
    field :version, :string
    field :description, :string
    field :type, :string
    field :input_schema, :map, default: %{}
    field :output_schema, :map, default: %{}
    field :constraints, :map, default: %{}
    field :cost, :map, default: %{}
    field :endpoint, :map
    field :tags, {:array, :string}, default: []
    field :status, :string, default: "active"
    field :provider, :string

    belongs_to :tenant, Tenant

    timestamps(type: :utc_datetime)
  end

  @required_fields ~w(name version type)a
  @optional_fields ~w(description input_schema output_schema constraints cost
                      endpoint tags status provider tenant_id)a

  @doc """
  Creates a changeset for a new capability manifest.
  """
  @spec changeset(t(), map()) :: Ecto.Changeset.t()
  def changeset(manifest, attrs) do
    manifest
    |> cast(attrs, @required_fields ++ @optional_fields)
    |> validate_required(@required_fields)
    |> validate_inclusion(:type, @valid_types)
    |> validate_inclusion(:status, @valid_statuses)
    |> validate_length(:name, min: 1, max: 255)
    |> validate_format(:version, ~r/^\d+\.\d+\.\d+(-\w+)?$/, message: "must be semver format")
    |> unique_constraint([:name, :version])
    |> foreign_key_constraint(:tenant_id)
  end

  @doc """
  Creates a changeset for updating status.
  """
  @spec status_changeset(t(), String.t()) :: Ecto.Changeset.t()
  def status_changeset(manifest, status) do
    manifest
    |> cast(%{status: status}, [:status])
    |> validate_inclusion(:status, @valid_statuses)
  end

  @doc """
  Creates a changeset for updating endpoint configuration.
  """
  @spec endpoint_changeset(t(), map()) :: Ecto.Changeset.t()
  def endpoint_changeset(manifest, endpoint) when is_map(endpoint) do
    manifest
    |> cast(%{endpoint: endpoint}, [:endpoint])
  end

  @doc """
  Creates a changeset for updating constraints.
  """
  @spec constraints_changeset(t(), map()) :: Ecto.Changeset.t()
  def constraints_changeset(manifest, constraints) when is_map(constraints) do
    manifest
    |> cast(%{constraints: constraints}, [:constraints])
  end

  @doc """
  Creates a changeset for adding tags.
  """
  @spec tags_changeset(t(), list()) :: Ecto.Changeset.t()
  def tags_changeset(manifest, tags) when is_list(tags) do
    manifest
    |> cast(%{tags: tags}, [:tags])
  end

  @doc """
  Returns valid capability types.
  """
  @spec valid_types() :: [String.t()]
  def valid_types, do: @valid_types

  @doc """
  Returns valid status values.
  """
  @spec valid_statuses() :: [String.t()]
  def valid_statuses, do: @valid_statuses

  @type t :: %__MODULE__{
          id: binary(),
          name: String.t(),
          version: String.t(),
          description: String.t() | nil,
          type: String.t(),
          input_schema: map(),
          output_schema: map(),
          constraints: map(),
          cost: map(),
          endpoint: map() | nil,
          tags: list(),
          status: String.t(),
          provider: String.t() | nil,
          tenant_id: binary() | nil,
          inserted_at: DateTime.t(),
          updated_at: DateTime.t()
        }
end
