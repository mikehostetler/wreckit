Mix.install([
  {:req, "~> 0.4.0"}
])

api_key = "1cd54a1d237e4693b516a56e8513366a.1r4gXJRbfYp0Nw52"
url = "https://api.z.ai/api/anthropic/v1/messages"

IO.puts "Testing Z.AI with Req..."

# Attempt 1: Raw Headers (Like Curl)
IO.puts "\n--- Attempt 1: Raw Headers ---"
resp = Req.post!(url, 
  headers: [
    {"x-api-key", api_key},
    {"anthropic-version", "2023-06-01"},
    {"content-type", "application/json"}
  ],
  json: %{
    model: "glm-4.7",
    max_tokens: 10,
    messages: [%{role: "user", content: "Hi"}]
  }
)

IO.inspect(resp.status, label: "Status")
IO.inspect(resp.body, label: "Body")

if resp.status == 200 do
  IO.puts "SUCCESS!"
else
  IO.puts "FAILED."
end
