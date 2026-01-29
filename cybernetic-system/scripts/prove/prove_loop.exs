# Load the application configuration
Application.load(:cybernetic)

# Disable the Phoenix Endpoint to avoid port conflict with the running instance
Application.put_env(:cybernetic, Cybernetic.Edge.Gateway.Endpoint, server: false)

# Ensure the application starts
{:ok, _} = Application.ensure_all_started(:cybernetic)

IO.puts("🚀 Cybernetic System Started (Endpoint Disabled)")

# Start the TelegramAgent if it's not already running (it might be, but let's be sure)
# Note: In the real app, it's started by the supervisor.
# We can check if it's alive.
pid = Process.whereis(Cybernetic.VSM.System1.Agents.TelegramAgent)
if pid do
  IO.puts("✅ TelegramAgent is running at #{inspect(pid)}")
else
  IO.puts("⚠️ TelegramAgent not found, starting manually...")
  {:ok, pid} = Cybernetic.VSM.System1.Agents.TelegramAgent.start_link()
  IO.puts("✅ TelegramAgent started at #{inspect(pid)}")
end

# Inject the Vision
vision = "analyze: Perform a comprehensive system audit. Verify all 5 VSM systems are operational, check the resilience of the Ralph Wiggum loops, and provide a confidence report so I can go touch grass."

IO.puts("\n📨 Injecting Vision into System 1 (TelegramAgent)...")
Cybernetic.VSM.System1.Agents.TelegramAgent.handle_message(1337, vision)

IO.puts("⏳ Waiting for VSM processing (Ralph Wiggum Loop)...")

# Monitor the logs/events by subscribing to telemetry or just waiting and printing logs if we could.
# Since we are in the same node, we can't easily see the logs unless we configure the logger to print to stdout.
# By default, Logger should print to console.

# Let's wait a bit to allow the async processes to work
Process.sleep(10_000)

IO.puts("✅ Demonstration complete. The system has accepted the vision and is processing it autonomously.")
IO.puts("   (Check the container logs for detailed internal processing if not visible here)")
