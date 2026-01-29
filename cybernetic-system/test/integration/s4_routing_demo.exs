defmodule Cybernetic.Integration.S4RoutingDemo do
  @moduledoc """
  Simple demonstration script for S4 multi-provider routing system.

  Shows the routing logic and provider capabilities without requiring
  external API dependencies.
  """

  alias Cybernetic.VSM.System4.{Episode, Router}
  alias Cybernetic.VSM.System4.Providers.{Anthropic, OpenAI, Ollama}

  require Logger

  def run do
    Logger.info("🚀 S4 Multi-Provider Routing Demonstration")
    Logger.info("==========================================")

    # Test episode routing
    test_episode_routing()

    # Test provider capabilities  
    test_provider_capabilities()

    # Test health checks
    test_health_checks()

    Logger.info("✅ S4 Multi-Provider demonstration completed")
  end

  defp test_episode_routing do
    Logger.info("\n📍 Testing Episode Routing Logic")
    Logger.info("=================================")

    episodes = [
      create_episode(:policy_review, "Security Policy Review"),
      create_episode(:code_gen, "Generate Authentication Module"),
      create_episode(:anomaly_detection, "Unusual System Behavior"),
      create_episode(:root_cause, "Database Performance Issue")
    ]

    for episode <- episodes do
      chain = Router.select_chain(episode, [])

      Logger.info("Episode: #{episode.title}")
      Logger.info("  Kind: #{episode.kind}")
      Logger.info("  Route: #{inspect(chain)}")
      Logger.info("  Rationale: #{get_routing_rationale(episode.kind)}")
      Logger.info("")
    end
  end

  defp test_provider_capabilities do
    Logger.info("🔧 Testing Provider Capabilities")
    Logger.info("=================================")

    providers = [
      {:anthropic, Anthropic},
      {:openai, OpenAI},
      {:ollama, Ollama}
    ]

    for {name, module} <- providers do
      caps = module.capabilities()

      Logger.info("Provider: #{name}")
      Logger.info("  Modes: #{inspect(caps.modes)}")
      Logger.info("  Strengths: #{inspect(caps.strengths)}")
      Logger.info("  Max Tokens: #{caps.max_tokens}")
      Logger.info("  Context Window: #{caps.context_window}")
      Logger.info("")
    end
  end

  defp test_health_checks do
    Logger.info("🏥 Testing Provider Health Checks")
    Logger.info("==================================")

    providers = [
      {:anthropic, Anthropic},
      {:openai, OpenAI},
      {:ollama, Ollama}
    ]

    for {name, module} <- providers do
      case module.health_check() do
        :ok ->
          Logger.info("✅ #{name}: Healthy")

        {:error, :missing_api_key} ->
          Logger.info("⚠️  #{name}: Missing API key (expected in test)")

        {:error, :server_unavailable} ->
          Logger.info("⚠️  #{name}: Server unavailable (expected in test)")

        {:error, reason} ->
          Logger.info("❌ #{name}: Health check failed - #{inspect(reason)}")
      end
    end
  end

  defp create_episode(kind, title) do
    %Episode{
      id: UUID.uuid4() |> to_string(),
      kind: kind,
      title: title,
      priority: :medium,
      source_system: :s1,
      created_at: DateTime.utc_now(),
      context: %{test: true},
      data: %{demo: true},
      metadata: %{demonstration: true}
    }
  end

  defp get_routing_rationale(kind) do
    case kind do
      :policy_review ->
        "Routes to Anthropic (reasoning) + Ollama (privacy) for policy analysis"

      :code_gen ->
        "Routes to OpenAI (code generation) + Anthropic (reasoning) for development tasks"

      :anomaly_detection ->
        "Routes to balanced chain (Anthropic + OpenAI + Ollama) for comprehensive analysis"

      :root_cause ->
        "Routes to Anthropic (systems thinking) + OpenAI (technical analysis)"
    end
  end
end

# Run the demonstration
Cybernetic.Integration.S4RoutingDemo.run()
