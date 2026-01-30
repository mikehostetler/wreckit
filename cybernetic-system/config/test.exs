import Config

# Load environment variables from .env file in test
if File.exists?(".env") do
  for line <- File.stream!(".env"),
      not String.starts_with?(line, "#"),
      String.contains?(line, "=") do
    line = String.trim(line)
    [key, value] = String.split(line, "=", parts: 2)
    System.put_env(String.trim(key), String.trim(value))
  end
end

# Configure to use InMemory transport during tests
config :cybernetic,
  transport: Cybernetic.Transport.InMemory,
  test_mode: true,
  environment: :test,
  # Enable minimal test mode - only starts essential services (PubSub, AuthManager, JWKSCache)
  # This dramatically improves test speed and reduces noise
  minimal_test_mode: true,
  # Keep unit tests fast and quiet by default; integration tests can re-enable as needed.
  enable_telemetry: false,
  enable_health_monitoring: false

# Disable OpenTelemetry exporting in test to avoid external network dependencies.
config :opentelemetry, traces_exporter: :none

# Disable AMQP during tests
config :cybernetic, :amqp, enabled: false

# Configure Ecto for async tests with SQL sandbox
config :cybernetic, Cybernetic.Repo,
  pool: Ecto.Adapters.SQL.Sandbox,
  pool_size: 10,
  ownership_timeout: 60_000

# Disable Oban in test (use Oban.Testing)
config :cybernetic, Oban,
  testing: :inline,
  queues: false,
  plugins: false

# Disable PromEx in test
config :cybernetic, Cybernetic.PromEx, disabled: true
