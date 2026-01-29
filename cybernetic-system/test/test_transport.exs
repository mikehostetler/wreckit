#!/usr/bin/env elixir

# Simple test script to verify transport functionality
Mix.install([])

# Start the application
:application.ensure_all_started(:cybernetic)

# Give the system time to start
:timer.sleep(1000)

# Test the transport system
alias Cybernetic.Core.Transport.AMQP.Publisher

IO.puts("=== Cybernetic Transport System Test ===")

# Check supervisor status
# Check if Publisher is running
status = Process.whereis(Publisher)
IO.puts("Publisher Status:")
IO.inspect(status, pretty: true)

# Check transport health
# Check transport health
health = if status, do: :healthy, else: :unhealthy
IO.puts("\nTransport Health Check:")
IO.inspect(health, pretty: true)

# Test message publishing
IO.puts("\n=== Testing Message Publishing ===")

# Test 1: Simple VSM message
result1 = Publisher.publish("cyb.events", "vsm.system1.test", %{"data" => "test"}, [])
IO.puts("System1 message result: #{inspect(result1)}")

# Test 2: Coordination message
result2 =
  Publisher.publish(
    "cyb.commands",
    "vsm.system2.coordinate",
    %{"action" => "start", "target_systems" => [:system1, :system3]},
    []
  )

IO.puts("System2 coordination result: #{inspect(result2)}")

# Test 3: Broadcast message
result3 =
  Publisher.publish(
    "cyb.telemetry",
    "vsm.broadcast.status",
    %{"timestamp" => :os.system_time(:millisecond)},
    []
  )

IO.puts("Broadcast result: #{inspect(result3)}")

# Wait for message processing
:timer.sleep(500)

# Check final queue status
final_health = if Process.whereis(Publisher), do: :healthy, else: :unhealthy
IO.puts("\nFinal Transport Health:")
IO.inspect(final_health, pretty: true)

IO.puts("\n=== Test Complete ===")
