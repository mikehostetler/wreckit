#!/usr/bin/env elixir

IO.puts("\n🔍 VERIFYING DEPLOYMENT - ALL SERVICES CONNECTED")
IO.puts("=" |> String.duplicate(60))

# Start required applications
Application.ensure_all_started(:amqp)
Application.ensure_all_started(:redix) 
Application.ensure_all_started(:httpoison)
Application.ensure_all_started(:cybernetic)
Process.sleep(2000)

defmodule DeploymentVerifier do
  def run do
    rabbit_ok = test_rabbitmq()
    redis_ok = test_redis()
    prometheus_ok = test_prometheus()
    memory_ok = test_memory()
    
    IO.puts("\n" <> "=" |> String.duplicate(60))
    IO.puts("📊 DEPLOYMENT VERIFICATION RESULTS:\n")
    
    results = [
      {"RabbitMQ", rabbit_ok},
      {"Redis", redis_ok},
      {"Prometheus", prometheus_ok},
      {"S4 Memory", memory_ok}
    ]
    
    for {service, status} <- results do
      icon = if status, do: "✅", else: "❌"
      IO.puts("   #{icon} #{service}: #{if status, do: "CONNECTED & WORKING", else: "FAILED"}")
    end
    
    all_ok = Enum.all?(results, fn {_, status} -> status end)
    
    if all_ok do
      IO.puts("\n🎉 ALL SERVICES PROPERLY CONNECTED AND INTEGRATED!")
      IO.puts("The deployment is FULLY FUNCTIONAL!")
    else
      IO.puts("\n⚠️  Some services need attention")
    end
  end
  
  defp test_rabbitmq do
    IO.puts("\n1️⃣ Testing RabbitMQ...")
    try do
      {:ok, conn} = AMQP.Connection.open("amqp://guest:guest@localhost:5672")
      {:ok, channel} = AMQP.Channel.open(conn)
      
      # Check VSM queues exist
      queues = ["vsm.system1.operations", "vsm.system2.coordination", 
                "vsm.system3.control", "vsm.system4.intelligence", "vsm.system5.policy"]
      
      queue_check = Enum.all?(queues, fn queue ->
        case AMQP.Queue.declare(channel, queue, durable: true, passive: true) do
          {:ok, info} ->
            IO.puts("   ✓ Queue #{queue}: #{info.message_count} messages")
            true
          _ -> false
        end
      end)
      
      # Publish and consume test message
      test_queue = "deployment.test"
      AMQP.Queue.declare(channel, test_queue)
      AMQP.Basic.publish(channel, "", test_queue, "test_message")
      
      msg_check = case AMQP.Basic.get(channel, test_queue) do
        {:ok, "test_message", _} ->
          IO.puts("   ✓ Message publish/consume working")
          true
        _ -> false
      end
      
      AMQP.Channel.close(channel)
      AMQP.Connection.close(conn)
      
      queue_check && msg_check
    rescue
      _ -> false
    end
  end
  
  defp test_redis do
    IO.puts("\n2️⃣ Testing Redis...")
    try do
      {:ok, redis} = Redix.start_link(host: "localhost", port: 6379, password: "changeme")
      
      # Test SET/GET
      key = "deployment:test:#{System.unique_integer()}"
      {:ok, "OK"} = Redix.command(redis, ["SET", key, "test_value"])
      {:ok, "test_value"} = Redix.command(redis, ["GET", key])
      IO.puts("   ✓ SET/GET operations working")
      
      # Test increment
      {:ok, counter} = Redix.command(redis, ["INCR", "deployment:counter"])
      IO.puts("   ✓ Counter incremented to: #{counter}")
      
      # Clean up
      Redix.command(redis, ["DEL", key])
      GenServer.stop(redis)
      
      true
    rescue
      _ -> false
    end
  end
  
  defp test_prometheus do
    IO.puts("\n3️⃣ Testing Prometheus...")
    try do
      # Check targets
      response = HTTPoison.get!("http://localhost:9090/api/v1/targets")
      data = Jason.decode!(response.body)
      
      if data["status"] == "success" do
        targets = data["data"]["activeTargets"]
        up_count = Enum.count(targets, fn t -> t["health"] == "up" end)
        IO.puts("   ✓ Monitoring #{length(targets)} targets")
        IO.puts("   ✓ #{up_count} targets are UP")
        
        # Check specific services
        for target <- targets do
          if target["health"] == "up" do
            job = target["labels"]["job"]
            IO.puts("   ✓ #{job} is being monitored")
          end
        end
        
        true
      else
        false
      end
    rescue
      _ -> false
    end
  end
  
  defp test_memory do
    IO.puts("\n4️⃣ Testing S4 Memory System...")
    try do
      alias Cybernetic.VSM.System4.Memory
      
      # Store test data
      episode_id = "deployment-test-#{System.unique_integer()}"
      Memory.store(episode_id, :user, "Test question", %{test: true})
      Memory.store(episode_id, :assistant, "Test response", %{test: true})
      
      # Retrieve context
      {:ok, context} = Memory.get_context(episode_id)
      
      if length(context) > 0 do
        [episode] = context
        IO.puts("   ✓ Stored and retrieved #{length(episode.messages)} messages")
        
        # Check stats
        stats = Memory.stats()
        IO.puts("   ✓ Memory stats: #{stats.total_entries} entries, #{stats.active_episodes} episodes")
        
        # Clean up
        Memory.clear(episode_id)
        
        true
      else
        false
      end
    rescue
      _ -> false
    end
  end
end

# Run the verification
DeploymentVerifier.run()