defmodule Cybernetic.Health.Supervisor do
  @moduledoc """
  Supervisor for health monitoring and system status tracking.
  """
  use Supervisor

  def start_link(opts \\ []) do
    Supervisor.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @impl true
  def init(_opts) do
    children = [
      {Cybernetic.Health.Monitor, []},
      {Cybernetic.Health.Collector, []},
      {Cybernetic.Health.WebSocket, []}
    ]

    Supervisor.init(children, strategy: :one_for_one)
  end
end
