import Config

config :logger, :console,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id, :tenant_id, :trace_id]

# Ecto Repo configuration
config :cybernetic, Cybernetic.Repo,
  migration_primary_key: [name: :id, type: :binary_id],
  migration_timestamps: [type: :utc_datetime_usec],
  priv: "priv/repo"

config :cybernetic,
  ecto_repos: [Cybernetic.Repo]

# Oban Background Job Queue
config :cybernetic, Oban,
  engine: Oban.Engines.Basic,
  repo: Cybernetic.Repo,
  plugins: [
    Oban.Plugins.Pruner,
    {Oban.Plugins.Lifeline, rescue_after: :timer.minutes(30)},
    {Oban.Plugins.Cron,
     crontab: [
       # Health check every hour
       {"0 * * * *", Cybernetic.Workers.HealthCheck, queue: :default}
     ]}
  ],
  queues: [
    default: 10,
    critical: 20,
    analysis: 5,
    notifications: 5,
    storage: 3
  ]

# PromEx metrics configuration
config :cybernetic, Cybernetic.PromEx,
  disabled: false,
  manual_metrics_start_delay: :no_delay,
  drop_metrics_groups: [],
  grafana: :disabled

config :libcluster,
  topologies: [
    cybernetic: [
      strategy: Cluster.Strategy.Gossip
    ]
  ]

# Transport configuration - Using AMQP as primary transport
config :cybernetic, :transport,
  adapter: Cybernetic.Transport.AMQP,
  max_demand: 1000,
  amqp: [
    url: "amqp://cybernetic:changeme@localhost:5672",
    prefetch_count: 10,
    consumers: [
      systems: [:system1, :system2, :system3, :system4, :system5],
      max_demand: 10,
      min_demand: 5
    ]
  ]

# Phoenix Edge Gateway configuration
# P0 Security: secret_key_base moved to runtime.exs - DO NOT hardcode secrets
config :cybernetic, Cybernetic.Edge.Gateway.Endpoint,
  url: [host: "localhost"],
  render_errors: [view: Cybernetic.Edge.Gateway.ErrorView, accepts: ~w(json)],
  live_view: [signing_salt: "GI8HdsmX-Wn5IyWB"]

# Import environment specific config
import_config "#{config_env()}.exs"
