defmodule Cybernetic.Schemas.VSM.Policy do
  @moduledoc """
  Policy schema for S5 Policy decisions.

  Policies are the governing rules established by System 5 that
  define the identity and behavior of the VSM. They are evaluated
  in priority order and can be time-bounded.

  ## Fields

  - `name` - Unique policy name within tenant
  - `description` - Human-readable description
  - `rules` - Policy rules as structured JSON
  - `priority` - Evaluation order (higher = first)
  - `active` - Whether the policy is currently active
  - `effective_from` / `effective_until` - Time boundaries

  ## Rules Format

  Rules are stored as JSON with a standard structure:

      %{
        "conditions" => [
          %{"field" => "source", "op" => "eq", "value" => "telegram"}
        ],
        "actions" => [
          %{"type" => "allow"},
          %{"type" => "notify", "channel" => "slack"}
        ]
      }

  ## Example

      %Policy{
        name: "rate-limit-telegram",
        description: "Limit Telegram messages to 100/hour",
        rules: %{
          "conditions" => [%{"field" => "source", "op" => "eq", "value" => "telegram"}],
          "actions" => [%{"type" => "rate_limit", "limit" => 100, "window" => 3600}]
        },
        priority: 10
      }
  """
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "policies" do
    field(:name, :string)
    field(:description, :string)
    field(:rules, :map, default: %{})
    field(:priority, :integer, default: 0)
    field(:active, :boolean, default: true)
    field(:effective_from, :utc_datetime_usec)
    field(:effective_until, :utc_datetime_usec)

    belongs_to(:tenant, Cybernetic.Schemas.Storage.Tenant)

    timestamps(type: :utc_datetime_usec)
  end

  @required_fields ~w(tenant_id name rules)a
  @optional_fields ~w(description priority active effective_from effective_until)a

  @doc """
  Creates a changeset for a new policy.
  """
  def changeset(policy, attrs) do
    policy
    |> cast(attrs, @required_fields ++ @optional_fields)
    |> validate_required(@required_fields)
    |> validate_length(:name, min: 1, max: 255)
    |> validate_number(:priority, greater_than_or_equal_to: 0)
    |> validate_effective_dates()
    |> unique_constraint([:tenant_id, :name])
    |> foreign_key_constraint(:tenant_id)
  end

  @doc """
  Creates a changeset for updating policy rules.
  """
  def rules_changeset(policy, attrs) do
    policy
    |> cast(attrs, [:rules, :priority])
    |> validate_number(:priority, greater_than_or_equal_to: 0)
  end

  @doc """
  Creates a changeset for activating/deactivating a policy.
  """
  def active_changeset(policy, attrs) do
    policy
    |> cast(attrs, [:active])
  end

  @doc """
  Returns true if the policy is currently effective.
  """
  def effective?(policy, now \\ DateTime.utc_now()) do
    cond do
      not policy.active -> false
      policy.effective_from && DateTime.compare(now, policy.effective_from) == :lt -> false
      policy.effective_until && DateTime.compare(now, policy.effective_until) == :gt -> false
      true -> true
    end
  end

  defp validate_effective_dates(changeset) do
    effective_from = get_field(changeset, :effective_from)
    effective_until = get_field(changeset, :effective_until)

    if effective_from && effective_until &&
         DateTime.compare(effective_from, effective_until) == :gt do
      add_error(changeset, :effective_until, "must be after effective_from")
    else
      changeset
    end
  end
end
