import Config

# Integration Test Configuration
# ================================
# This config enables full system integration tests with real services.
# Run with: MIX_ENV=integration mix test --include integration
#
# IMPORTANT: This configuration is for LOCAL DEVELOPMENT AND CI ONLY.
# DO NOT use this configuration in production environments.
#
# Prerequisites:
# - PostgreSQL running (or DATABASE_URL set)
# - RabbitMQ running (or RABBITMQ_URL set)
# - Redis running (optional)
#
# The .env file parsing below is a simple implementation for local development.
# For production, use proper environment variable management (e.g., Docker, systemd).

# Load environment variables from .env file (local development only)
# Note: This is a simple parser that handles KEY=value format.
# It does NOT handle quoted values or multiline values.
# For complex .env needs, consider using the `dotenvy` library.
if File.exists?(".env") do
  for line <- File.stream!(".env"),
      line = String.trim(line),
      line != "",
      not String.starts_with?(line, "#"),
      String.contains?(line, "=") do
    [key, value] = String.split(line, "=", parts: 2)
    System.put_env(String.trim(key), String.trim(value))
  end
end

# Full integration mode - NOT minimal test mode
config :cybernetic,
  transport: Cybernetic.Transport.InMemory,
  test_mode: true,
  environment: :test,
  # Disable minimal test mode - start ALL services
  minimal_test_mode: false,
  # Enable telemetry for integration tests
  enable_telemetry: true,
  enable_health_monitoring: true

# Disable OpenTelemetry exporting in test to avoid external network dependencies.
config :opentelemetry, traces_exporter: :none

# Enable AMQP for integration tests
config :cybernetic, :amqp,
  enabled: true,
  url: System.get_env("RABBITMQ_URL", "amqp://guest:guest@localhost:5672"),
  exchange: "cybernetic.test.exchange",
  queues: [
    "cybernetic.test.system1",
    "cybernetic.test.system2",
    "cybernetic.test.system3",
    "cybernetic.test.system4",
    "cybernetic.test.system5"
  ]

# Configure Ecto for async tests with SQL sandbox
config :cybernetic, Cybernetic.Repo,
  pool: Ecto.Adapters.SQL.Sandbox,
  pool_size: 10,
  ownership_timeout: 60_000,
  database: "cybernetic_integration_test"

# Disable Oban queueing but allow inline execution for integration tests
config :cybernetic, Oban,
  testing: :inline,
  queues: false,
  plugins: false

# Disable PromEx in integration tests
config :cybernetic, Cybernetic.PromEx, disabled: true

# SSE configuration for integration tests
config :cybernetic, :sse,
  heartbeat_interval: 5_000,
  max_connection_duration: 60_000,
  max_connections_per_tenant: 10
