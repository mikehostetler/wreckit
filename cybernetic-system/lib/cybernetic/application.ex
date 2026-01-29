defmodule Cybernetic.Application do
  @moduledoc """
  Boots the Cybernetic runtime mapped to VSM systems.

  In test mode (`:minimal_test_mode`), only essential services are started:
  - JWKSCache, AuthManager (for auth/JWT tests)
  - Phoenix.PubSub (for event tests)

  This dramatically improves test speed and reduces noise.
  """
  use Application
  require Logger

  @impl Application
  @spec start(Application.start_type(), term()) :: {:ok, pid()} | {:error, term()}
  def start(_type, _args) do
    # Validate critical configuration before starting
    with :ok <- validate_configuration() do
      env = Application.get_env(:cybernetic, :environment, :prod)
      minimal_test? = Application.get_env(:cybernetic, :minimal_test_mode, false)

      # Initialize OpenTelemetry with error handling
      if env != :test do
        try do
          Cybernetic.Telemetry.OTEL.setup()
          Logger.info("OpenTelemetry initialized for service: cybernetic")
        rescue
          e ->
            Logger.warning("OpenTelemetry initialization failed: #{inspect(e)}")
            # Continue without OpenTelemetry for now
            :ok
        end
      end

      amqp_enabled? =
        Application.get_env(:cybernetic, :amqp, [])
        |> Keyword.get(:enabled, true)

      repo_children =
        if env == :test do
          []
        else
          [
            # Database - must start first
            Cybernetic.Repo,
            # Background job processor
            {Oban, Application.fetch_env!(:cybernetic, Oban)},
            # PromEx metrics
            Cybernetic.PromEx
          ]
        end

      cluster_children =
        if env == :test do
          []
        else
          [
            # Cluster discovery
            {Cluster.Supervisor,
             [
               Application.get_env(:libcluster, :topologies, []),
               [name: Cybernetic.ClusterSupervisor]
             ]}
          ]
        end

      amqp_children =
        if amqp_enabled? do
          [
            # AMQP Transport
            Cybernetic.Transport.AMQP.Connection,
            {Cybernetic.Core.Transport.AMQP.Topology, []},
            Cybernetic.Core.Transport.AMQP.Publisher,
            # Performance Optimizations
            {Cybernetic.Core.Transport.AMQP.PublisherPool, []}
          ]
        else
          []
        end

      children =
        if minimal_test? do
          # Minimal children for fast unit tests - only essential services
          minimal_test_children()
        else
          # Full children for production/integration tests
          (repo_children ++
             [
               # Phoenix PubSub (used by SSE and event broadcasting)
               {Phoenix.PubSub, name: Cybernetic.PubSub},
               # SSE Supervisor (owns connection tracking ETS table)
               Cybernetic.Edge.Gateway.SSESupervisor,
               # Hermes MCP runtime (streamable HTTP transport)
               Hermes.Server.Registry,
               # Cluster discovery
               cluster_children,
               # Phoenix Edge Gateway Endpoint
               Cybernetic.Edge.Gateway.Endpoint,
               # oh-my-opencode MCP server (mounted at /mcp)
               {Cybernetic.Integrations.OhMyOpencode.MCPProvider, transport: :streamable_http},
               # Core Security
               Cybernetic.Core.Security.NonceBloom,
               # CRDT Graph
               Cybernetic.Core.CRDT.Graph,
               # CRDT Context Graph for semantic triples
               Cybernetic.Core.CRDT.ContextGraph,
               # AMQP Transport
               amqp_children,
               {Cybernetic.Core.CRDT.Cache, []},
               {Cybernetic.Telemetry.BatchedCollector, []},
               # MCP Registry
               Cybernetic.Core.MCP.Hermes.Registry,
               # Circuit Breaker Registry
               {Registry,
                keys: :unique, name: Cybernetic.Core.Resilience.AdaptiveCircuitBreaker.Registry},
               # Edge Gateway Circuit Breaker
               {Cybernetic.Core.Resilience.AdaptiveCircuitBreaker, name: :edge_gateway},
               # Goldrush Integration
               {Cybernetic.Core.Goldrush.Plugins.TelemetryAlgedonic, []},
               Cybernetic.Core.Goldrush.Bridge,
               Cybernetic.Core.Goldrush.Pipeline,
               # Central Aggregator (must be before S4 Bridge)
               {Cybernetic.Core.Aggregator.CentralAggregator, []},
               # S5 SOP Engine (must be before S4 Bridge so it can receive messages)
               {Cybernetic.VSM.System5.SOPEngine, []},
               # S5 Policy Intelligence Engine
               {Cybernetic.VSM.System5.PolicyIntelligence, []},
               # S4 Intelligence Layer
               {Cybernetic.VSM.System4.LLMBridge,
                provider: Cybernetic.VSM.System4.Providers.Null},
               # S4 Multi-Provider Intelligence Service
               {Cybernetic.VSM.System4.Service, []},
               # S4 Memory for conversation context
               {Cybernetic.VSM.System4.Memory, []},
               # S3 Rate Limiter for budget management
               {Cybernetic.VSM.System3.RateLimiter, []},
               # JWKS Cache for JWT/OIDC verification (must start before AuthManager)
               {Cybernetic.Security.JWKSCache, []},
               # Security AuthManager for MCP tools
               {Cybernetic.Security.AuthManager, []},
               # Edge WASM Validator is stateless - use Cybernetic.Edge.WASM.Validator.load/2 where needed
               # VSM Supervisor (includes S1-S5)
               Cybernetic.VSM.Supervisor,
               # Telegram Agent (S1)
               Cybernetic.VSM.System1.Agents.TelegramAgent
             ])
          |> List.flatten()
          |> Kernel.++(health_children())
          |> Kernel.++(telemetry_children())
        end

      opts = [
        strategy: :one_for_one,
        name: Cybernetic.Supervisor,
        max_restarts: 10,
        max_seconds: 60
      ]

      {:ok, sup} = Supervisor.start_link(children, opts)

      # Block on MCP tools so S1-S5 workers can assume availability
      Task.start(fn ->
        case Cybernetic.Core.MCP.Hermes.Registry.await_ready(2_000) do
          :ok ->
            Logger.info("MCP Registry ready with builtin tools")

          {:error, :timeout} ->
            Logger.error("MCP registry not ready in time")
        end
      end)

      {:ok, sup}
    else
      {:error, reason} ->
        Logger.error("Configuration validation failed: #{reason}")
        {:error, reason}
    end
  end

  # Configuration validation
  defp validate_configuration do
    env = Application.get_env(:cybernetic, :environment, :prod)

    case env do
      env when env in [:test, :dev] ->
        # In dev/test, just warn about missing production variables
        if System.get_env("JWT_SECRET") == "dev-secret-change-in-production" do
          Logger.info("Using default JWT_SECRET for #{env} environment")
        end

        :ok

      :prod ->
        # In production, require proper configuration
        required_env_vars = [
          "JWT_SECRET",
          "PASSWORD_SALT",
          "SECRET_KEY_BASE",
          "CYBERNETIC_HMAC_SECRET"
        ]

        missing =
          Enum.filter(required_env_vars, fn var ->
            case {var, System.get_env(var)} do
              {_var, nil} ->
                true

              {_var, ""} ->
                true

              # Default not allowed in prod
              {"JWT_SECRET", "dev-secret-change-in-production"} ->
                true

              {"PASSWORD_SALT", "cybernetic_default_salt_change_in_prod"} ->
                true

              {_var, _} ->
                false
            end
          end)

        if missing != [] do
          {:error,
           "Missing/invalid required environment variables in production: #{Enum.join(missing, ", ")}"}
        else
          # Validate JWT secret strength in production
          jwt_secret = System.get_env("JWT_SECRET")

          if String.length(jwt_secret) < 32 do
            {:error, "JWT_SECRET must be at least 32 characters in production"}
          else
            # Validate Phoenix secret_key_base strength in production
            secret_key_base = System.get_env("SECRET_KEY_BASE")

            if byte_size(secret_key_base) < 64 do
              {:error, "SECRET_KEY_BASE must be at least 64 characters in production"}
            else
              password_salt = System.get_env("PASSWORD_SALT")

              if byte_size(password_salt) < 16 do
                {:error, "PASSWORD_SALT must be at least 16 characters in production"}
              else
                :ok
              end
            end
          end
        end
    end
  end

  # Add health monitoring children conditionally
  defp health_children do
    if Application.get_env(:cybernetic, :enable_health_monitoring, true) do
      [
        Cybernetic.Health.Supervisor,
        Cybernetic.Core.Resilience.CircuitBreakerAlerts
      ]
    else
      []
    end
  end

  # Add telemetry children conditionally
  defp telemetry_children do
    if Application.get_env(:cybernetic, :enable_telemetry, true) do
      [Cybernetic.Telemetry.Supervisor]
    else
      []
    end
  end

  # Minimal children for fast unit tests
  # Only starts services actually needed by most unit tests
  defp minimal_test_children do
    Logger.info("Starting in minimal test mode - only essential services")

    [
      # Phoenix PubSub (for event tests)
      {Phoenix.PubSub, name: Cybernetic.PubSub},
      # Core Security (for nonce/replay tests)
      Cybernetic.Core.Security.NonceBloom,
      # JWKS Cache (for JWT tests)
      {Cybernetic.Security.JWKSCache, []},
      # AuthManager (for auth tests)
      {Cybernetic.Security.AuthManager, []},
      # MCP Registry (for capability tests)
      Cybernetic.Core.MCP.Hermes.Registry,
      # Integrations Registry (for streaming/integration tests)
      {Registry, keys: :unique, name: Cybernetic.Integrations.Registry},
      # Rate Limiter (for rate limit tests)
      {Cybernetic.VSM.System3.RateLimiter, []}
    ]
  end
end
