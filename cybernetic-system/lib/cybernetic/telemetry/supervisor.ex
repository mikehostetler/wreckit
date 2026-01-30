defmodule Cybernetic.Telemetry.Supervisor do
  @moduledoc """
  Supervisor for telemetry components including dashboards,
  Prometheus metrics exporter, and telemetry event handlers.
  """
  use Supervisor
  require Logger

  def start_link(opts \\ []) do
    Supervisor.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @impl true
  def init(_opts) do
    children = [
      # Prometheus metrics exporter
      Cybernetic.Telemetry.Prometheus,

      # Dashboard for Grafana and web UI
      Cybernetic.Telemetry.Dashboard
    ]

    opts = [
      strategy: :one_for_one,
      max_restarts: 3,
      max_seconds: 5
    ]

    Logger.info("Starting Telemetry Supervisor with Prometheus and Dashboard")
    Supervisor.init(children, opts)
  end
end
