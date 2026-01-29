defmodule Cybernetic.Repo do
  @moduledoc """
  Ecto Repo for the Cybernetic platform.

  Uses PostgreSQL with:
  - UUID primary keys for distributed-friendly IDs
  - Connection pooling via DBConnection
  - Query timeouts to prevent runaway queries
  - Telemetry events for observability

  ## Multi-Tenancy

  All tenant-scoped queries should use `set_tenant/1` to enable
  Row-Level Security (RLS) isolation:

      Cybernetic.Repo.set_tenant(tenant_id)
      Cybernetic.Repo.all(Episode)

  ## Telemetry Events

  The following telemetry events are emitted:
  - `[:cybernetic, :repo, :query]` - On every query
  """
  use Ecto.Repo,
    otp_app: :cybernetic,
    adapter: Ecto.Adapters.Postgres

  require Logger

  @doc """
  Set the current tenant for Row-Level Security.

  This sets a session variable that PostgreSQL RLS policies use
  to filter queries to the current tenant.
  """
  @spec set_tenant(String.t() | nil) :: :ok
  def set_tenant(nil), do: :ok

  def set_tenant(tenant_id) when is_binary(tenant_id) do
    query!("SET app.current_tenant = $1", [tenant_id])
    :ok
  end

  @doc """
  Clear the current tenant context.
  """
  @spec clear_tenant() :: :ok
  def clear_tenant do
    query!("RESET app.current_tenant")
    :ok
  end

  @doc """
  Execute a function within a tenant context.

  Ensures the tenant is set before the function runs and
  cleared after, even if the function raises.
  """
  @spec with_tenant(String.t(), (-> result)) :: result when result: any()
  def with_tenant(tenant_id, fun) when is_binary(tenant_id) and is_function(fun, 0) do
    set_tenant(tenant_id)

    try do
      fun.()
    after
      clear_tenant()
    end
  end
end
