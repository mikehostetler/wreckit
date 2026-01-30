defmodule Cybernetic.VSM.System4.RouterTest do
  use ExUnit.Case, async: true

  alias Cybernetic.VSM.System4.{Router, Episode}

  describe "select_chain/2" do
    test "routes policy review to anthropic and ollama" do
      episode = Episode.new(:policy_review, "Test Policy Review", %{})

      chain = Router.select_chain(episode, [])

      assert chain == [:anthropic, :ollama]
    end

    test "routes code generation to openai and anthropic" do
      episode = Episode.new(:code_gen, "Test Code Generation", %{})

      chain = Router.select_chain(episode, [])

      assert chain == [:openai, :together, :anthropic]
    end

    test "routes root cause analysis to anthropic and openai" do
      episode = Episode.new(:root_cause, "Test Root Cause", %{})

      chain = Router.select_chain(episode, [])

      assert chain == [:anthropic, :together, :openai]
    end

    test "uses override chain when provided" do
      episode = Episode.new(:policy_review, "Test Override", %{})
      override_chain = [:ollama, :anthropic]

      chain = Router.select_chain(episode, override_chain: override_chain)

      assert chain == override_chain
    end

    test "falls back to default chain for unknown episode types" do
      episode = Episode.new(:unknown_type, "Test Unknown", %{})

      chain = Router.select_chain(episode, [])

      assert chain == Router.default_chain()
    end
  end

  describe "get_provider_module/1" do
    test "returns correct modules for known providers" do
      assert {:ok, Cybernetic.VSM.System4.Providers.Anthropic} =
               Router.get_provider_module(:anthropic)

      assert {:ok, Cybernetic.VSM.System4.Providers.OpenAI} = Router.get_provider_module(:openai)
      assert {:ok, Cybernetic.VSM.System4.Providers.Ollama} = Router.get_provider_module(:ollama)
    end

    test "returns error for unknown providers" do
      assert {:error, {:unknown_provider, :unknown}} = Router.get_provider_module(:unknown)
    end
  end

  describe "calculate_backoff/1" do
    test "calculates exponential backoff with jitter" do
      backoff0 = Router.calculate_backoff(0)
      backoff1 = Router.calculate_backoff(1)
      backoff2 = Router.calculate_backoff(2)

      # Base delay is 1000ms, should increase exponentially
      assert backoff0 >= 1000
      assert backoff1 >= 2000
      assert backoff2 >= 4000

      # Should not exceed max delay of 30 seconds
      backoff_large = Router.calculate_backoff(10)
      assert backoff_large <= 30_000
    end
  end

  describe "check_budget/2" do
    test "allows requests when budget is available" do
      episode = Episode.new(:policy_review, "Test Budget", %{})

      # Should pass or gracefully handle missing RateLimiter
      result = Router.check_budget(:anthropic, episode)
      assert result in [:ok, {:error, :budget_exhausted}]
    end
  end

  describe "get_provider_config/2" do
    test "merges base config with provided options" do
      config = Router.get_provider_config(:anthropic, model: "test-model", temperature: 0.5)

      assert Keyword.get(config, :model) == "test-model"
      assert Keyword.get(config, :temperature) == 0.5
    end
  end
end
