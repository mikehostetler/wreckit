defmodule Cybernetic.Schemas.Storage.Tenant do
  @moduledoc """
  Tenant schema for multi-tenant isolation.

  Tenants are the top-level organizational unit in the VSM platform.
  All data is scoped to a tenant for security and isolation.

  ## Fields

  - `name` - Human-readable tenant name
  - `slug` - URL-safe unique identifier (e.g., "acme-corp")
  - `settings` - Tenant-specific configuration as JSON
  - `active` - Whether the tenant is active

  ## Example

      %Tenant{
        name: "Acme Corporation",
        slug: "acme-corp",
        settings: %{
          "llm_provider" => "anthropic",
          "max_episodes_per_day" => 1000
        }
      }
  """
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "tenants" do
    field(:name, :string)
    field(:slug, :string)
    field(:settings, :map, default: %{})
    field(:active, :boolean, default: true)

    has_many(:system_states, Cybernetic.Schemas.VSM.SystemState)
    has_many(:episodes, Cybernetic.Schemas.VSM.Episode)
    has_many(:policies, Cybernetic.Schemas.VSM.Policy)
    has_many(:artifacts, Cybernetic.Schemas.Storage.Artifact)

    timestamps(type: :utc_datetime_usec)
  end

  @required_fields ~w(name slug)a
  @optional_fields ~w(settings active)a

  @doc """
  Creates a changeset for a new tenant.
  """
  def changeset(tenant, attrs) do
    tenant
    |> cast(attrs, @required_fields ++ @optional_fields)
    |> validate_required(@required_fields)
    |> validate_length(:name, min: 1, max: 255)
    |> validate_length(:slug, min: 1, max: 63)
    |> validate_format(:slug, ~r/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/,
      message: "must be lowercase alphanumeric with hyphens, no leading/trailing hyphens"
    )
    |> unique_constraint(:slug)
  end

  @doc """
  Creates a changeset for updating tenant settings.
  """
  def settings_changeset(tenant, attrs) do
    tenant
    |> cast(attrs, [:settings])
  end

  @doc """
  Creates a changeset for activating/deactivating a tenant.
  """
  def active_changeset(tenant, attrs) do
    tenant
    |> cast(attrs, [:active])
  end
end
