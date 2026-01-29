defmodule Cybernetic.Integrations.Supervisor do
  @moduledoc """
  Supervisor for integration services.

  Manages:
  - Integration registry (for per-tenant process lookup)
  - DynamicSupervisor for tenant integration processes
  - Global integration services
  """

  use Supervisor

  @dynamic_supervisor Cybernetic.Integrations.DynamicSupervisor

  def start_link(opts \\ []) do
    Supervisor.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @impl true
  def init(_opts) do
    children = [
      # Registry for per-tenant integration processes
      {Registry, keys: :unique, name: Cybernetic.Integrations.Registry},

      # DynamicSupervisor for tenant integration services
      {DynamicSupervisor, name: @dynamic_supervisor, strategy: :one_for_one}
    ]

    Supervisor.init(children, strategy: :one_for_one)
  end

  @doc """
  Start integration services for a tenant.

  Returns a list of `{:ok, pid}` or `{:error, reason}` tuples.
  """
  def start_tenant_integrations(tenant_id, opts \\ []) do
    children = [
      {Cybernetic.Integrations.OhMyOpencode.VSMBridge, Keyword.put(opts, :tenant_id, tenant_id)},
      {Cybernetic.Integrations.OhMyOpencode.EventBridge, Keyword.put(opts, :tenant_id, tenant_id)},
      {Cybernetic.Integrations.OhMyOpencode.ContextGraph, Keyword.put(opts, :tenant_id, tenant_id)}
    ]

    Enum.map(children, fn child_spec ->
      DynamicSupervisor.start_child(@dynamic_supervisor, child_spec)
    end)
  end

  @doc """
  Stop integration services for a tenant.
  """
  def stop_tenant_integrations(tenant_id) do
    modules = [
      Cybernetic.Integrations.OhMyOpencode.VSMBridge,
      Cybernetic.Integrations.OhMyOpencode.EventBridge,
      Cybernetic.Integrations.OhMyOpencode.ContextGraph
    ]

    Enum.each(modules, fn module ->
      case Registry.lookup(Cybernetic.Integrations.Registry, {module, tenant_id}) do
        [{pid, _}] ->
          DynamicSupervisor.terminate_child(@dynamic_supervisor, pid)

        [] ->
          :ok
      end
    end)
  end
end
