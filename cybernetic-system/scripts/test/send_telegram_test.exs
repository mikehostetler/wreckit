#!/usr/bin/env elixir

# Send a test message to the Telegram bot
bot_token = "7747520054:AAFNts5iJn8mYZezAG9uQF2_slvuztEScZI"
chat_id = "7453192968"  # Your chat ID

url = "https://api.telegram.org/bot#{bot_token}/sendMessage"
body = Jason.encode!(%{
  chat_id: chat_id,
  text: "🤖 Bot is online! Polling mechanism has been fixed with:\n• Supervised polling tasks\n• Exponential backoff retry\n• Health monitoring\n• Automatic recovery from crashes",
  parse_mode: "Markdown"
})

case HTTPoison.post(url, body, [{"Content-Type", "application/json"}]) do
  {:ok, %{status_code: 200, body: response}} ->
    IO.puts "✅ Message sent successfully!"
    case Jason.decode(response) do
      {:ok, data} -> IO.inspect(data, label: "Response")
      _ -> IO.puts response
    end
  {:ok, %{status_code: code, body: body}} ->
    IO.puts "❌ Failed with status #{code}: #{body}"
  {:error, reason} ->
    IO.puts "❌ Error: #{inspect(reason)}"
end