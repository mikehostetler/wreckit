#!/usr/bin/env elixir

# Test the Telegram bot live
{:ok, _} = Application.ensure_all_started(:httpoison)
{:ok, _} = Application.ensure_all_started(:jason)

bot_token = "7747520054:AAFNts5iJn8mYZezAG9uQF2_slvuztEScZI"

# Start the application with the token
System.put_env("TELEGRAM_BOT_TOKEN", bot_token)
{:ok, _} = Application.ensure_all_started(:cybernetic)

IO.puts "Bot started. Monitoring for 30 seconds..."
IO.puts "Send messages to @VaoAssitantBot on Telegram"
IO.puts ""

# Monitor for messages
Enum.each(1..15, fn i ->
  Process.sleep(2000)
  
  state = :sys.get_state(Cybernetic.VSM.System1.Agents.TelegramAgent)
  
  IO.puts "Check #{i}:"
  IO.puts "  Offset: #{state.telegram_offset}"
  IO.puts "  Failures: #{state.polling_failures}"
  
  if state.polling_task do
    alive = Process.alive?(state.polling_task)
    IO.puts "  Task: #{inspect(state.polling_task)} (Alive: #{alive})"
  else
    IO.puts "  Task: None"
  end
  IO.puts ""
end)

IO.puts "Test complete"