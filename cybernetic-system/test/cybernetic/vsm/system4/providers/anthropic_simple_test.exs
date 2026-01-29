defmodule Cybernetic.VSM.System4.Providers.AnthropicSimpleTest do
  use ExUnit.Case, async: true
  alias Cybernetic.VSM.System4.Providers.Anthropic

  describe "new/1" do
    test "creates provider with API key from options" do
      {:ok, provider} = Anthropic.new(api_key: "test-key")

      assert %Anthropic{
               api_key: "test-key",
               model: "claude-3-5-sonnet-20241022",
               max_tokens: 4096,
               temperature: 0.1,
               base_url: "https://api.anthropic.com",
               timeout: 30_000
             } = provider
    end

    test "creates provider with API key from environment" do
      System.put_env("ANTHROPIC_API_KEY", "env-key")

      try do
        {:ok, provider} = Anthropic.new([])
        assert provider.api_key == "env-key"
      after
        System.delete_env("ANTHROPIC_API_KEY")
      end
    end

    test "returns error when no API key available" do
      System.delete_env("ANTHROPIC_API_KEY")

      assert {:error, :missing_api_key} = Anthropic.new([])
    end

    test "accepts custom configuration options" do
      {:ok, provider} =
        Anthropic.new(
          api_key: "test-key",
          model: "claude-3-opus-20240229",
          max_tokens: 8192,
          temperature: 0.3,
          base_url: "https://custom.api.com",
          timeout: 60_000
        )

      assert provider.model == "claude-3-opus-20240229"
      assert provider.max_tokens == 8192
      assert provider.temperature == 0.3
      assert provider.base_url == "https://custom.api.com"
      assert provider.timeout == 60_000
    end
  end
end
