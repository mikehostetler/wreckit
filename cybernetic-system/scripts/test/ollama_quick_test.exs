#!/usr/bin/env elixir

IO.puts("🚀 Quick Ollama S4 Provider Test")
IO.puts("=" |> String.duplicate(35))

# Test 1: Check Ollama server
IO.puts("\n🏥 Checking Ollama Server...")

case HTTPoison.get("http://localhost:11434/api/tags", [], timeout: 5000) do
  {:ok, %{status: 200, body: body}} ->
    case Jason.decode(body) do
      {:ok, %{"models" => models}} when is_list(models) ->
        IO.puts("✅ Ollama server healthy")
        IO.puts("  Available models: #{length(models)}")
        for model <- Enum.take(models, 3) do
          IO.puts("    • #{model["name"]} (#{div(model["size"], 1_000_000_000)} GB)")
        end
      _ ->
        IO.puts("❌ Unexpected response format")
    end
  {:error, reason} ->
    IO.puts("❌ Ollama not available: #{inspect(reason)}")
end

# Test 2: Generate with lightweight model
IO.puts("\n🤖 Testing Generation with TinyLlama...")

payload = %{
  "model" => "tinyllama:latest",
  "prompt" => "Explain the benefit of local AI processing for privacy in exactly one sentence.",
  "stream" => false,
  "options" => %{
    "temperature" => 0.1,
    "num_predict" => 30
  }
}

case Jason.encode(payload) do
  {:ok, json} ->
    start_time = System.monotonic_time(:millisecond)
    
    case HTTPoison.post(
      "http://localhost:11434/api/generate",
      json,
      [{"Content-Type", "application/json"}],
      timeout: 30_000,
      recv_timeout: 30_000
    ) do
      {:ok, %{status: 200, body: body}} ->
        latency = System.monotonic_time(:millisecond) - start_time
        
        case Jason.decode(body) do
          {:ok, response} ->
            IO.puts("✅ Generation successful!")
            IO.puts("  Model: #{response["model"]}")
            IO.puts("  Response: #{response["response"]}")
            IO.puts("  Tokens generated: #{response["eval_count"]}")
            IO.puts("  Latency: #{latency}ms")
            IO.puts("  Cost: $0.00 (local processing)")
            IO.puts("  Privacy: 100% (no data leaves your machine)")
            
          {:error, _} ->
            IO.puts("❌ Failed to parse response")
        end
        
      {:ok, %{status: status}} ->
        IO.puts("❌ HTTP #{status} error")
        
      {:error, reason} ->
        IO.puts("❌ Request failed: #{inspect(reason)}")
    end
    
  {:error, _} ->
    IO.puts("❌ Failed to encode request")
end

# Test 3: Privacy comparison
IO.puts("\n🔒 Privacy & Cost Comparison")
IO.puts("-" |> String.duplicate(30))

IO.puts("Provider Comparison for Episode Analysis:")
IO.puts("")
IO.puts("📊 Anthropic Claude:")
IO.puts("  • Cost: ~$0.003-0.015 per request")
IO.puts("  • Privacy: Data sent to Anthropic servers")
IO.puts("  • Latency: 2-5 seconds")
IO.puts("  • Strength: Deep reasoning")
IO.puts("")
IO.puts("📊 OpenAI GPT:")
IO.puts("  • Cost: ~$0.002-0.010 per request")
IO.puts("  • Privacy: Data sent to OpenAI servers")
IO.puts("  • Latency: 1-3 seconds")
IO.puts("  • Strength: Code generation")
IO.puts("")
IO.puts("📊 Ollama Local:")
IO.puts("  • Cost: $0.00 (local compute)")
IO.puts("  • Privacy: 100% local (no external API)")
IO.puts("  • Latency: 0.5-2 seconds (depends on hardware)")
IO.puts("  • Strength: Privacy & zero cost")

IO.puts("\n✅ Ollama Integration Benefits:")
IO.puts("• Perfect for sensitive data (GDPR, HIPAA)")
IO.puts("• Zero API costs for high-volume processing")
IO.puts("• No rate limits or quotas")
IO.puts("• Works offline")
IO.puts("• Predictable latency")

IO.puts("\n🎯 S4 Routing Strategy:")
IO.puts("• Privacy-critical episodes → Ollama")
IO.puts("• Complex reasoning → Anthropic + Ollama fallback")
IO.puts("• Code generation → OpenAI + Anthropic fallback")
IO.puts("• High-volume batch → Ollama (cost-effective)")

IO.puts("\n🏁 Ollama S4 Provider Test Complete!")