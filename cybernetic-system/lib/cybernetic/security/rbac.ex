defmodule Cybernetic.Security.RBAC do
  @moduledoc """
  Role-Based Access Control (RBAC) for Cybernetic aMCP Framework.

  Provides pure functions for role and permission management:
  - Role definitions and permission mappings
  - Permission expansion from roles
  - Authorization checks
  """

  @typedoc "User role for RBAC authorization"
  @type role :: :admin | :operator | :viewer | :agent | :system

  @typedoc "Permission atom for fine-grained access control"
  @type permission :: atom()

  # Role definitions with permissions
  @role_permissions %{
    admin: [:all],
    operator: [:read, :write, :execute, :monitor],
    viewer: [:read, :monitor],
    agent: [:read, :write, :execute_limited],
    system: [:all, :internal]
  }

  @valid_roles MapSet.new([:admin, :operator, :viewer, :agent, :system])

  @doc """
  Get all defined roles.
  """
  @spec roles() :: [role()]
  def roles, do: MapSet.to_list(@valid_roles)

  @doc """
  Get the permissions map for all roles.
  """
  @spec role_permissions() :: %{role() => [permission()]}
  def role_permissions, do: @role_permissions

  @doc """
  Check if a role is valid.
  """
  @spec valid_role?(atom()) :: boolean()
  def valid_role?(role), do: MapSet.member?(@valid_roles, role)

  @doc """
  Parse a role string into a role atom.

  Returns nil for invalid roles.
  """
  @spec parse_role(String.t()) :: role() | nil
  def parse_role("admin"), do: :admin
  def parse_role("operator"), do: :operator
  def parse_role("viewer"), do: :viewer
  def parse_role("agent"), do: :agent
  def parse_role("system"), do: :system
  def parse_role(_), do: nil

  @doc """
  Parse a comma-separated roles string into a list of roles.

  Invalid roles are filtered out.

  ## Examples

      iex> RBAC.parse_roles("admin,viewer")
      [:admin, :viewer]

      iex> RBAC.parse_roles("invalid")
      []
  """
  @spec parse_roles(String.t()) :: [role()]
  def parse_roles(roles_str) when is_binary(roles_str) do
    roles_str
    |> String.split(",", trim: true)
    |> Enum.map(&String.trim/1)
    |> Enum.map(&String.downcase/1)
    |> Enum.map(&parse_role/1)
    |> Enum.reject(&is_nil/1)
  end

  @doc """
  Expand roles into their constituent permissions.

  Multiple roles are merged and deduplicated.
  """
  @spec expand_permissions([role()]) :: [permission()]
  def expand_permissions(roles) when is_list(roles) do
    roles
    |> Enum.flat_map(fn role ->
      Map.get(@role_permissions, role, [])
    end)
    |> Enum.uniq()
  end

  @doc """
  Check if a user with given permissions can perform an action on a resource.

  Returns true if:
  - User has :all permission (admin/system)
  - User has the specific action permission
  - User has the resource:action permission
  """
  @spec authorized?([permission()], atom(), atom()) :: boolean()
  def authorized?(permissions, resource, action) when is_list(permissions) do
    cond do
      :all in permissions ->
        true

      action in permissions ->
        true

      check_resource_permission(permissions, resource, action) ->
        true

      true ->
        false
    end
  end

  @doc """
  Check if permissions include a specific resource:action permission.

  Uses `String.to_existing_atom/1` which only succeeds if the atom
  was previously defined (compile-time or runtime), preventing atom
  table exhaustion attacks.
  """
  @spec check_resource_permission([permission()], atom(), atom()) :: boolean()
  def check_resource_permission(permissions, resource, action) do
    permission_str = "#{resource}:#{action}"

    try do
      permission_atom = String.to_existing_atom(permission_str)
      permission_atom in permissions
    rescue
      ArgumentError -> false
    end
  end

  @doc """
  Get the default role for users without explicit roles.
  """
  @spec default_role() :: role()
  def default_role, do: :viewer
end
