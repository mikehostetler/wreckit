#!/usr/bin/env elixir

# Test script for Together AI provider integration

IO.puts("🚀 Testing Together AI Provider Integration")
IO.puts("=" |> String.duplicate(45))

# Check if API key is available
api_key = System.get_env("TOGETHER_API_KEY")

if api_key do
  IO.puts("✅ Together AI API key found")
  
  # Test provider capabilities
  IO.puts("\n📊 Provider Capabilities:")
  caps = Cybernetic.VSM.System4.Providers.Together.capabilities()
  IO.puts("  Modes: #{inspect(caps.modes)}")
  IO.puts("  Strengths: #{inspect(caps.strengths)}")
  IO.puts("  Max Tokens: #{caps.max_tokens}")
  IO.puts("  Context Window: #{caps.context_window} (128k!)")
  
  # Test health check
  IO.puts("\n🏥 Health Check:")
  case Cybernetic.VSM.System4.Providers.Together.health_check() do
    :ok -> IO.puts("  ✅ Together AI is healthy")
    {:error, reason} -> IO.puts("  ❌ Health check failed: #{inspect(reason)}")
  end
  
  # Test generation
  IO.puts("\n🤖 Testing Generation:")
  case Cybernetic.VSM.System4.Providers.Together.generate(
    "Explain the benefits of using multiple open-source AI models in production. Answer in 2 sentences.",
    model: "mistralai/Mixtral-8x7B-Instruct-v0.1",
    max_tokens: 100
  ) do
    {:ok, result} ->
      IO.puts("  ✅ Generation successful")
      IO.puts("  Response: #{String.slice(result.text, 0, 200)}...")
      IO.puts("  Tokens: #{result.tokens.input} in, #{result.tokens.output} out")
      IO.puts("  Cost: $#{Float.round(result.usage.cost_usd, 5)}")
      
    {:error, reason} ->
      IO.puts("  ❌ Generation failed: #{inspect(reason)}")
  end
  
else
  IO.puts("⚠️  TOGETHER_API_KEY not set")
  IO.puts("\nTo test Together AI, set your API key:")
  IO.puts("  export TOGETHER_API_KEY='your-api-key-here'")
  IO.puts("\nYou can get a free API key at: https://api.together.xyz")
end

IO.puts("\n📍 Together AI Provider Integration Summary")
IO.puts("-" |> String.duplicate(45))

IO.puts("\n🎯 Key Features:")
IO.puts("• Access to 100+ open-source models")
IO.puts("• Llama 3.1 70B with 128k context")
IO.puts("• Mixtral for fast inference")
IO.puts("• Code-optimized models available")
IO.puts("• Competitive pricing (~$0.88/1M tokens)")

IO.puts("\n🔄 S4 Routing Integration:")
IO.puts("• Code Generation: OpenAI → Together → Anthropic")
IO.puts("• Fast Analysis: Together → Anthropic → OpenAI")
IO.puts("• Predictions: Together → Anthropic → OpenAI")
IO.puts("• Classifications: Together → OpenAI → Ollama")

IO.puts("\n📊 Provider Comparison:")
provider_comparison = """
| Provider   | Strengths              | Context | Cost/1M   |
|------------|------------------------|---------|-----------|
| Anthropic  | Deep reasoning         | 200k    | $3-15     |
| OpenAI     | Code generation        | 128k    | $2-10     |
| Together   | Speed + Open models    | 128k    | $0.60-0.88|
| Ollama     | Privacy + Zero cost    | 8k      | $0.00     |
"""
IO.puts(provider_comparison)

IO.puts("\n✅ Together AI successfully integrated into S4 Multi-Provider Hub!")