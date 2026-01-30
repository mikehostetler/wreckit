#!/usr/bin/env elixir

# Test the fixed Telegram bot polling mechanism

IO.puts "🧪 Testing Telegram Bot Polling Fix..."
IO.puts "=" |> String.duplicate(50)

# Start the application
{:ok, _} = Application.ensure_all_started(:cybernetic)
Process.sleep(3000)  # Wait for system to initialize

# Get the TelegramAgent state
try do
  state = :sys.get_state(Cybernetic.VSM.System1.Agents.TelegramAgent)
  
  IO.puts "\n📊 TelegramAgent State:"
  IO.puts "  Bot Token: #{if state.bot_token, do: "✅ Configured", else: "❌ Missing"}"
  IO.puts "  Telegram Offset: #{state.telegram_offset}"
  IO.puts "  Polling Failures: #{state.polling_failures}"
  IO.puts "  Last Poll Success: #{state.last_poll_success}"
  
  if state.polling_task do
    IO.puts "\n🔄 Polling Task:"
    IO.puts "  PID: #{inspect(state.polling_task)}"
    IO.puts "  Alive: #{Process.alive?(state.polling_task)}"
    
    if Process.alive?(state.polling_task) do
      IO.puts "  ✅ Polling task is running"
    else
      IO.puts "  ❌ Polling task is dead (zombie state)"
    end
  else
    IO.puts "\n❌ No polling task found"
  end
  
  # Monitor for a few seconds to see if polling continues
  IO.puts "\n📡 Monitoring polling activity for 10 seconds..."
  
  # Subscribe to telemetry events
  :telemetry.attach(
    "test-telegram-polling",
    [:telegram, :polling, :failure],
    fn _event, measurements, metadata, _config ->
      IO.puts "  ⚠️ Polling failure detected: #{inspect(metadata.reason)}"
    end,
    nil
  )
  
  # Check state periodically
  Enum.each(1..5, fn i ->
    Process.sleep(2000)
    current_state = :sys.get_state(Cybernetic.VSM.System1.Agents.TelegramAgent)
    
    IO.puts "\n  Check #{i}:"
    IO.puts "    Failures: #{current_state.polling_failures}"
    IO.puts "    Last Success: #{current_state.last_poll_success}"
    
    if current_state.polling_task && Process.alive?(current_state.polling_task) do
      IO.puts "    Status: ✅ Polling active"
    else
      IO.puts "    Status: ❌ Polling stopped"
    end
  end)
  
  # Final check
  final_state = :sys.get_state(Cybernetic.VSM.System1.Agents.TelegramAgent)
  
  IO.puts "\n" <> ("=" |> String.duplicate(50))
  IO.puts "📈 Final Results:"
  
  if final_state.polling_task && Process.alive?(final_state.polling_task) do
    IO.puts "✅ SUCCESS: Polling mechanism is working correctly"
    IO.puts "   - Task is alive and running"
    IO.puts "   - Failures are being tracked: #{final_state.polling_failures}"
    IO.puts "   - Health monitoring is active"
  else
    IO.puts "❌ FAILURE: Polling mechanism not working"
    IO.puts "   - Task is dead or missing"
    IO.puts "   - Bot will not receive messages"
  end
  
rescue
  error ->
    IO.puts "❌ Error accessing TelegramAgent: #{inspect(error)}"
end

IO.puts "\n✅ Test complete"