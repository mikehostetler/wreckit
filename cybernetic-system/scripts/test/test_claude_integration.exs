# Test Claude API integration
defmodule TestClaude do
  alias Cybernetic.Intelligence.S4.Providers.Claude
  
  def test_api do
    api_key = System.get_env("ANTHROPIC_API_KEY")
    IO.puts("Testing Claude API with key: #{String.slice(api_key || "", 0..10)}...")
    
    prompt = """
    You are analyzing system metrics. Return a JSON response with this exact structure:
    {
      "sop_updates": [
        {"action": "monitor_errors", "priority": "high", "description": "Monitor error rates"}
      ],
      "risk_score": 75
    }
    """
    
    case Claude.complete(prompt, api_key: api_key) do
      {:ok, response} ->
        IO.puts("✅ Claude API Success\!")
        IO.puts("Response: #{response}")
        
        # Try to parse the JSON
        case Jason.decode(response) do
          {:ok, json} ->
            IO.puts("✅ Valid JSON response")
            IO.inspect(json, label: "Parsed")
          {:error, _} ->
            IO.puts("⚠️  Response is not valid JSON")
        end
        
      {:error, reason} ->
        IO.puts("❌ Claude API Error: #{inspect(reason)}")
    end
  end
end

TestClaude.test_api()
