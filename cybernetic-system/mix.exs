defmodule Cybernetic.MixProject do
  use Mix.Project

  def project do
    [
      app: :cybernetic,
      version: "0.1.0",
      elixir: "~> 1.18",
      start_permanent: Mix.env() == :prod,
      aliases: aliases(),
      deps: deps(),
      test_coverage: [
        summary: [threshold: 24],
        tool: ExCoveralls
      ],
      preferred_cli_env: [
        coveralls: :test,
        "coveralls.detail": :test,
        "coveralls.post": :test,
        "coveralls.html": :test
      ]
    ]
  end

  def application do
    [
      extra_applications: [:logger, :runtime_tools],
      mod: {Cybernetic.Application, []}
    ]
  end

  defp deps do
    [
      # Core dependencies
      {:amqp, "~> 4.1"},
      {:jason, ">= 0.0.0"},
      {:telemetry, ">= 0.0.0"},
      {:libcluster, ">= 0.0.0"},
      {:delta_crdt, ">= 0.0.0"},
      {:rustler, ">= 0.0.0"},
      {:gen_stage, "~> 1.2"},
      {:fuse, "~> 2.5"},

      # MCP integration (pinned to SHA for reproducible builds)
      {:hermes_mcp,
       git: "https://github.com/cloudwalk/hermes-mcp",
       ref: "97a3dd7e4b6907cc79136da7999b4f51af4834eb"},

      # Goldrush branches for reactive stream processing (pinned to SHA)
      {:goldrush,
       git: "https://github.com/DeadZen/goldrush", ref: "57e71f2789632a085f0963e1244644fdcb1941b9"},
      {:goldrush_elixir,
       git: "https://github.com/DeadZen/goldrush",
       ref: "1d39c73c5ec2409f6866933b5af6bda3138d9fad",
       app: false},

      # Telegram bot integration
      # More modern Telegram bot library
      {:ex_gram, "~> 0.52"},

      # Security and utilities
      # Bloom filter for replay protection
      {:bloomex, "~> 1.0"},
      # Nonce generation
      {:nanoid, "~> 2.0"},
      # UUID generation
      {:elixir_uuid, "~> 1.2"},
      # JWT/JWK verification (OIDC/JWKS support)
      {:jose, "~> 1.11"},
      # Password hashing (Argon2id)
      {:argon2_elixir, "~> 4.0"},

      # HTTP clients
      # For Claude API
      {:req, "~> 0.5.0"},
      # Unified LLM provider interface
      {:req_llm, "~> 1.0.0-rc.3"},
      # For Telegram bot
      {:httpoison, "~> 2.2"},

      # Database
      {:ecto_sql, "~> 3.11"},
      {:postgrex, "~> 0.18"},
      {:pgvector, "~> 0.2"},

      # Background Jobs
      {:oban, "~> 2.17"},

      # Metrics
      {:prom_ex, "~> 1.9"},

      # Redis client
      {:redix, "~> 1.2"},

      # Environment variable loading
      {:dotenv, "~> 3.1", only: [:dev, :test]},

      # WASM runtime - conflicts with rustler 0.36, using Port implementation instead
      # {:wasmex, "~> 0.9.2"},  # Requires rustler ~> 0.35
      # {:extism, "~> 1.0"},     # Requires rustler ~> 0.29

      # Testing
      {:stream_data, "~> 1.0", only: [:test, :dev]},
      {:excoveralls, "~> 0.18", only: :test},
      {:credo, "~> 1.7", only: [:dev, :test], runtime: false},

      # Web UI (Phoenix)
      {:phoenix, "~> 1.7"},
      {:phoenix_live_view, "~> 0.20"},
      {:phoenix_live_dashboard, "~> 0.8"},
      {:plug_cowboy, "~> 2.5"},

      # OpenTelemetry
      {:opentelemetry, "~> 1.4"},
      {:opentelemetry_api, "~> 1.3"},
      {:opentelemetry_exporter, "~> 1.7"},
      {:opentelemetry_telemetry, "~> 1.1"},
      {:opentelemetry_ecto, "~> 1.2"},
      {:opentelemetry_phoenix, "~> 1.2"},

      # Prometheus metrics exporter
      {:telemetry_metrics_prometheus_core, "~> 1.1"}
    ]
    |> Enum.reject(&is_nil/1)
  end

  defp aliases do
    [
      "cyb.up": [
        "deps.get",
        "compile",
        "run --no-halt"
      ],
      "cyb.test": ["test", "run test/system_validation.exs"],
      "cyb.test.core": [
        "test test/cybernetic/core/security test/cybernetic/core/crdt"
      ],
      "cyb.test.io": ["test test/cybernetic/transport"],
      "cyb.test.gr": ["test test/cybernetic/core/goldrush"],
      "cyb.test.all": ["cyb.test.core", "cyb.test.io", "cyb.test.gr"],
      "cyb.probe": ["cyb.probe"],
      "cyb.reset": ["deps.clean --all", "deps.get", "compile"],
      "cyb.docker": ["cmd docker-compose up -d"]
    ]
  end
end
