defmodule Cybernetic.PromEx do
  @moduledoc """
  PromEx configuration for Prometheus metrics.

  Exports metrics for:
  - Application info (version, uptime)
  - BEAM VM stats (memory, processes, atoms)
  - Phoenix endpoint metrics
  - Ecto query metrics
  - Oban job metrics

  Metrics are available at GET /metrics in Prometheus text format.
  """
  use PromEx, otp_app: :cybernetic

  alias PromEx.Plugins

  @impl true
  def plugins do
    [
      # Standard plugins
      Plugins.Application,
      Plugins.Beam,
      {Plugins.Phoenix,
       router: Cybernetic.Edge.Gateway.Router, endpoint: Cybernetic.Edge.Gateway.Endpoint},
      {Plugins.Ecto, repos: [Cybernetic.Repo]},
      {Plugins.Oban, oban_supervisors: [Oban]}
    ]
  end

  @impl true
  def dashboard_assigns do
    [
      datasource_id: "prometheus",
      default_selected_interval: "30s"
    ]
  end

  @impl true
  def dashboards do
    [
      # Grafana dashboards (disabled by default, enable in config)
      # {:prom_ex, "application.json"},
      # {:prom_ex, "beam.json"},
      # {:prom_ex, "phoenix.json"},
      # {:prom_ex, "ecto.json"},
      # {:prom_ex, "oban.json"}
    ]
  end
end
