Mix.install([
  {:httpoison, "~> 2.2"},
  {:jason, "~> 1.4"}
])

url = "https://api.z.ai/api/anthropic/v1/messages"
api_key = "1cd54a1d237e4693b516a56e8513366a.1r4gXJRbfYp0Nw52"

headers = [
  {"Content-Type", "application/json"},
  {"x-api-key", api_key},
  {"anthropic-version", "2023-06-01"}
]

payload = %{
  "model" => "glm-4.7",
  "max_tokens" => 100,
  "messages" => [
    %{"role" => "user", "content" => "Hello"}
  ]
}

IO.puts("🚀 Attempting connection to: #{url}")
{:ok, body} = Jason.encode(payload)

# Test 1: Standard Request
IO.puts("\n--- Test 1: Standard Request ---")
case HTTPoison.post(url, body, headers, [timeout: 10_000, recv_timeout: 10_000]) do
  {:ok, %{status_code: 200, body: resp_body}} ->
    IO.puts("✅ Success!")
    IO.puts(resp_body)
  {:ok, %{status_code: code, body: resp_body}} ->
    IO.puts("❌ HTTP Error: #{code}")
    IO.puts(resp_body)
  {:error, reason} ->
    IO.puts("❌ Network Error: #{inspect(reason)}")
end

# Test 2: Insecure (Ignore SSL)
IO.puts("\n--- Test 2: Ignore SSL/TLS Verify ---")
options = [ssl: [verify: :verify_none], timeout: 10_000, recv_timeout: 10_000]
case HTTPoison.post(url, body, headers, options) do
  {:ok, %{status_code: 200}} -> IO.puts("✅ Success with insecure SSL")
  {:ok, %{status_code: code}} -> IO.puts("❌ HTTP Error with insecure SSL: #{code}")
  {:error, reason} -> IO.puts("❌ Network Error with insecure SSL: #{inspect(reason)}")
end
