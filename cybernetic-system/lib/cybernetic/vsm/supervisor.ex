defmodule Cybernetic.VSM.Supervisor do
  @moduledoc """
  Root VSM supervisor: S5→S1.
  """
  use Supervisor

  def start_link(opts \\ []), do: Supervisor.start_link(__MODULE__, opts, name: __MODULE__)

  def init(_opts) do
    children = [
      # S5 Policy/Identity
      {Cybernetic.VSM.System5.Policy, restart: :permanent},
      # S4 Intelligence
      {Cybernetic.VSM.System4.Intelligence, restart: :permanent},
      # S3 Control
      {Cybernetic.VSM.System3.Control, restart: :permanent},
      # S2 Coordination
      {Cybernetic.VSM.System2.Coordinator, restart: :permanent},
      # S1 Operations
      {Cybernetic.VSM.System1.Operational, restart: :permanent}
    ]

    Supervisor.init(children, strategy: :rest_for_one, max_restarts: 10, max_seconds: 60)
  end
end
