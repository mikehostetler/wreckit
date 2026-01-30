IO.puts "Testing .env loading..."
api_key = System.get_env("ANTHROPIC_API_KEY")
if api_key do
  IO.puts "✅ API Key loaded from .env: #{String.slice(api_key, 0..20)}..."
else
  IO.puts "❌ API Key not found - .env not loaded"
end
