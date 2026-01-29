defmodule Cybernetic.Schemas.VSM.SystemState do
  @moduledoc """
  SystemState schema for VSM S1-S5 operational state snapshots.

  Each VSM system (1-5) maintains state that can be persisted
  for recovery, analysis, and historical queries.

  ## Systems

  - **S1 (Operations)** - Day-to-day operational state
  - **S2 (Coordination)** - Anti-oscillation and coordination
  - **S3 (Control)** - Resource allocation and audit
  - **S4 (Intelligence)** - Environmental scanning and adaptation
  - **S5 (Policy)** - Identity and policy decisions

  ## Fields

  - `system` - VSM system number (1-5)
  - `state` - Current state as JSON
  - `version` - State version for optimistic locking
  - `metadata` - Additional metadata

  ## Example

      %SystemState{
        system: 4,
        state: %{
          "episodes_analyzed" => 150,
          "last_scan" => "2025-12-17T12:00:00Z",
          "active_models" => ["claude-3-5-sonnet"]
        }
      }
  """
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  @systems 1..5

  schema "system_states" do
    field(:system, :integer)
    field(:state, :map, default: %{})
    field(:version, :integer, default: 1)
    field(:metadata, :map, default: %{})

    belongs_to(:tenant, Cybernetic.Schemas.Storage.Tenant)

    timestamps(type: :utc_datetime_usec)
  end

  @required_fields ~w(tenant_id system)a
  @optional_fields ~w(state version metadata)a

  @doc """
  Creates a changeset for a new system state.
  """
  def changeset(system_state, attrs) do
    system_state
    |> cast(attrs, @required_fields ++ @optional_fields)
    |> validate_required(@required_fields)
    |> validate_inclusion(:system, @systems, message: "must be between 1 and 5")
    |> foreign_key_constraint(:tenant_id)
    |> check_constraint(:valid_system, name: :valid_system)
  end

  @doc """
  Creates a changeset for updating the state with version increment.
  """
  def update_changeset(system_state, attrs) do
    system_state
    |> cast(attrs, [:state, :metadata])
    |> optimistic_lock(:version)
  end

  @doc """
  Returns the human-readable name for a system number.
  """
  def system_name(1), do: "Operations"
  def system_name(2), do: "Coordination"
  def system_name(3), do: "Control"
  def system_name(4), do: "Intelligence"
  def system_name(5), do: "Policy"
  def system_name(_), do: "Unknown"
end
