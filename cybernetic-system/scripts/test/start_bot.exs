#!/usr/bin/env elixir

# Proper Elixir way to start the Telegram bot
System.put_env("TELEGRAM_BOT_TOKEN", "7747520054:AAFNts5iJn8mYZezAG9uQF2_slvuztEScZI")

IO.puts "🤖 Starting Cybernetic Telegram Bot..."
IO.puts "==================================\n"

# Start the application
{:ok, _} = Application.ensure_all_started(:cybernetic)

IO.puts "✅ Bot is running and polling for messages"
IO.puts "📱 Send messages to @VaoAssitantBot on Telegram\n"

# Keep the process alive
receive do
  :stop -> 
    IO.puts "Stopping bot..."
    System.halt(0)
end