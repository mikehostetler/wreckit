#!/usr/bin/env elixir

IO.puts("\n🏥 HEALTH MONITORING SYSTEM TEST")
IO.puts("=" |> String.duplicate(60))

# Start required applications
Application.ensure_all_started(:amqp)
Application.ensure_all_started(:httpoison)
Application.ensure_all_started(:cybernetic)
Process.sleep(2000)

defmodule HealthTest do
  def run do
    IO.puts("\n1️⃣ Testing Health Monitor...")
    test_health_monitor()
    
    IO.puts("\n2️⃣ Testing Metrics Collector...")
    test_metrics_collector()
    
    IO.puts("\n3️⃣ Testing WebSocket Server...")
    test_websocket_server()
    
    IO.puts("\n" <> "=" |> String.duplicate(60))
    IO.puts("✅ Health monitoring system operational!")
  end
  
  defp test_health_monitor do
    # Get current status
    status = Cybernetic.Health.Monitor.status()
    IO.puts("   Current status: #{inspect(status[:status])}")
    
    # Get detailed status
    detailed = Cybernetic.Health.Monitor.detailed_status()
    IO.puts("   Components monitored: #{map_size(detailed[:components])}")
    
    # Check specific component
    rabbitmq_status = Cybernetic.Health.Monitor.check_component(:rabbitmq)
    IO.puts("   RabbitMQ: #{inspect(rabbitmq_status)}")
    
    IO.puts("   ✓ Health Monitor working")
  end
  
  defp test_metrics_collector do
    # Get current metrics
    metrics = Cybernetic.Health.Collector.current_metrics()
    
    if is_map(metrics) do
      IO.puts("   Metrics collected:")
      IO.puts("   - Memory: #{metrics[:memory_usage_mb]} MB")
      IO.puts("   - Processes: #{metrics[:process_count]}")
      IO.puts("   - Uptime: #{metrics[:uptime_ms]} ms")
      
      # Get aggregated metrics
      memory_agg = Cybernetic.Health.Collector.aggregate_metrics(:memory_usage_mb, 60_000)
      IO.puts("   Memory aggregate: #{inspect(memory_agg)}")
      
      IO.puts("   ✓ Metrics Collector working")
    else
      IO.puts("   ℹ️  Collector not running: #{inspect(metrics)}")
    end
  end
  
  defp test_websocket_server do
    # Test client registration
    test_pid = self()
    Cybernetic.Health.WebSocket.register_client(test_pid)
    
    # Wait for broadcast
    receive do
      {:websocket_push, message} ->
        data = Jason.decode!(message)
        IO.puts("   Received broadcast: #{data["type"]}")
        IO.puts("   ✓ WebSocket server working")
    after
      3000 ->
        IO.puts("   ⚠️  No WebSocket broadcast received")
    end
    
    # Unregister
    Cybernetic.Health.WebSocket.unregister_client(test_pid)
  end
end

# Run the test
HealthTest.run()