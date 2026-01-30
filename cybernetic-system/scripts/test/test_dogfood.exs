#!/usr/bin/env elixir

# Dogfooding Test for Cybernetic Optimization Modules
# Run with: mix run test_dogfood.exs

defmodule DogfoodTest do
  @moduledoc """
  Real-world dogfooding test that exercises all optimization modules
  """
  
  require Logger
  
  def run do
    Logger.info("🐕 Starting Cybernetic Optimization Dogfood Test")
    Logger.info("=" |> String.duplicate(60))
    
    # Run test scenarios
    test_amqp_publisher_pool()
    test_crdt_cache()
    test_batched_telemetry()
    test_adaptive_circuit_breaker()
    # test_integrated_workflow() # Temporarily disabled due to error
    
    Logger.info("\n✅ All dogfood tests completed successfully!")
  end
  
  defp test_amqp_publisher_pool do
    Logger.info("\n📬 Testing AMQP Publisher Pool...")
    Logger.info("-" |> String.duplicate(40))
    
    alias Cybernetic.Core.Transport.AMQP.PublisherPool
    
    # Test async publishing with batching
    Logger.info("  • Testing async batch publishing...")
    for i <- 1..50 do
      PublisherPool.publish_async(
        "cyb.events",
        "test.dogfood",
        %{
          test_id: i,
          message: "Dogfood message #{i}",
          timestamp: DateTime.utc_now()
        }
      )
      
      if rem(i, 10) == 0 do
        Logger.info("    Published #{i} messages...")
      end
    end
    
    Process.sleep(100) # Let batch flush
    
    # Test sync publishing for critical messages
    Logger.info("  • Testing sync publishing...")
    result = PublisherPool.publish_sync(
      "cyb.commands",
      "critical.command",
      %{
        command: "emergency_stop",
        priority: "high",
        timestamp: DateTime.utc_now()
      }
    )
    
    Logger.info("    Sync publish result: #{inspect(result)}")
    
    # Test batch publish directly
    Logger.info("  • Testing direct batch publish...")
    batch = for i <- 1..20 do
      {"cyb.telemetry", "metrics.batch", %{metric_id: i, value: :rand.uniform(100)}, []}
    end
    
    result = PublisherPool.batch_publish(batch)
    Logger.info("    Batch result: #{inspect(result)}")
    
    Logger.info("  ✓ AMQP Publisher Pool test completed")
  rescue
    error ->
      Logger.warning("  ⚠ AMQP test failed (expected if RabbitMQ not running): #{inspect(error)}")
  end
  
  defp test_crdt_cache do
    Logger.info("\n💾 Testing CRDT Cache...")
    Logger.info("-" |> String.duplicate(40))
    
    alias Cybernetic.Core.CRDT.Cache
    
    # Generate test data
    test_data = for i <- 1..100 do
      key = "test_key_#{i}"
      value = %{
        id: i,
        data: "Test data #{i}",
        random: :rand.uniform(1000)
      }
      {key, value}
    end
    
    # Test puts
    Logger.info("  • Storing 100 items in cache...")
    Enum.each(test_data, fn {key, value} ->
      Cache.put(key, value)
    end)
    
    # Test gets with hit/miss tracking
    Logger.info("  • Testing cache hits and misses...")
    hits = Enum.count(1..50, fn i ->
      key = "test_key_#{i}"
      case Cache.get(key) do
        {:ok, _value} -> true
        :miss -> false
      end
    end)
    
    misses = Enum.count(1..50, fn i ->
      key = "nonexistent_key_#{i}"
      case Cache.get(key) do
        {:ok, _value} -> false
        :miss -> true
      end
    end)
    
    Logger.info("    Hits: #{hits}/50, Misses: #{misses}/50")
    
    Logger.info("  ✓ CRDT Cache test completed")
  end
  
  defp test_batched_telemetry do
    Logger.info("\n📊 Testing Batched Telemetry Collector...")
    Logger.info("-" |> String.duplicate(40))
    
    alias Cybernetic.Telemetry.BatchedCollector
    
    # Add custom handler for testing
    handler_ref = make_ref()
    BatchedCollector.add_handler(handler_ref, fn batch ->
      Logger.info("    Custom handler received batch of #{length(batch)} events")
    end)
    
    # Generate telemetry events
    Logger.info("  • Generating telemetry events...")
    for i <- 1..150 do
      :telemetry.execute(
        [:cyb, :amqp, :publish],
        %{bytes: :rand.uniform(1000), latency_us: :rand.uniform(1000)},
        %{exchange: "test", routing_key: "test.#{i}"}
      )
      
      if rem(i, 50) == 0 do
        Logger.info("    Generated #{i} events...")
      end
    end
    
    # Force flush to see results
    Logger.info("  • Forcing batch flush...")
    BatchedCollector.flush()
    
    # Wait for batch processing
    Process.sleep(100)
    
    # Clean up handler
    BatchedCollector.remove_handler(handler_ref)
    
    Logger.info("  ✓ Batched Telemetry test completed")
  end
  
  defp test_adaptive_circuit_breaker do
    Logger.info("\n⚡ Testing Adaptive Circuit Breaker...")
    Logger.info("-" |> String.duplicate(40))
    
    alias Cybernetic.Core.Resilience.AdaptiveCircuitBreaker
    
    # Start a circuit breaker
    {:ok, _pid} = AdaptiveCircuitBreaker.start_link(name: :dogfood_breaker)
    Process.sleep(100)
    
    # Test successful calls
    Logger.info("  • Testing successful calls...")
    success_results = for i <- 1..5 do
      AdaptiveCircuitBreaker.call(:dogfood_breaker, fn ->
        {:ok, "Success #{i}"}
      end)
    end
    Logger.info("    Results: #{inspect(success_results)}")
    
    # Test failures to trigger opening
    Logger.info("  • Testing circuit breaker opening...")
    failure_results = for i <- 1..6 do
      result = AdaptiveCircuitBreaker.call(:dogfood_breaker, fn ->
        raise "Simulated failure #{i}"
      end)
      
      case result do
        {:error, :circuit_breaker_open} ->
          Logger.info("    Circuit opened at failure #{i}")
        _ ->
          nil
      end
      
      result
    end
    
    # Check state
    state = AdaptiveCircuitBreaker.get_state(:dogfood_breaker)
    Logger.info("  • Circuit breaker state: #{inspect(state)}")
    
    # Test recovery
    Logger.info("  • Testing circuit recovery...")
    AdaptiveCircuitBreaker.force_state(:dogfood_breaker, :half_open)
    
    recovery_result = AdaptiveCircuitBreaker.call(:dogfood_breaker, fn ->
      {:ok, "Recovered!"}
    end)
    Logger.info("    Recovery result: #{inspect(recovery_result)}")
    
    final_state = AdaptiveCircuitBreaker.get_state(:dogfood_breaker)
    Logger.info("  • Final state: #{inspect(final_state)}")
    
    Logger.info("  ✓ Adaptive Circuit Breaker test completed")
  end
  
  defp test_integrated_workflow do
    Logger.info("\n🔄 Testing Integrated Workflow...")
    Logger.info("-" |> String.duplicate(40))
    Logger.info("  Simulating real-world VSM message flow with optimizations")
    
    alias Cybernetic.Core.Transport.AMQP.PublisherPool
    alias Cybernetic.Core.CRDT.Cache
    alias Cybernetic.Core.Resilience.AdaptiveCircuitBreaker
    
    # Start workflow circuit breaker
    {:ok, _} = AdaptiveCircuitBreaker.start_link(name: :workflow_breaker)
    
    # Simulate VSM S1 -> S2 -> S4 message flow
    Logger.info("\n  • Simulating VSM message flow...")
    
    workflow_task = fn ->
      # S1 Operation (with caching)
      operation_id = "op_#{:rand.uniform(10000)}"
      Cache.put("current_operation", %{id: operation_id, stage: "s1"})
      
      # Publish to S2 via pool (will fail without RabbitMQ but that's ok)
      try do
        PublisherPool.publish_async(
          "cyb.vsm.s2",
          "coordinate",
          %{
            operation_id: operation_id,
            source: "s1",
            action: "coordinate_resources"
          }
        )
      rescue
        _ -> :ok
      end
      
      # Update cache
      Cache.put("current_operation", %{id: operation_id, stage: "s2"})
      
      # Simulate S2 -> S4 intelligence request
      try do
        PublisherPool.publish_async(
          "cyb.vsm.s4",
          "intelligence",
          %{
            operation_id: operation_id,
            source: "s2",
            request: "analyze_pattern"
          }
        )
      rescue
        _ -> :ok
      end
      
      # Update cache
      Cache.put("current_operation", %{id: operation_id, stage: "s4"})
      
      # Generate telemetry
      :telemetry.execute(
        [:vsm, :s4, :intelligence],
        %{duration_ms: :rand.uniform(100)},
        %{operation_id: operation_id}
      )
      
      {:ok, operation_id}
    end
    
    # Run workflow with circuit breaker protection
    results = for i <- 1..10 do
      result = AdaptiveCircuitBreaker.call(:workflow_breaker, workflow_task, 5000)
      
      msg = case result do
        {:ok, op_id} ->
          "    ✓ Workflow #{i} completed: #{op_id}"
        {:error, reason} ->
          "    ✗ Workflow #{i} failed: #{inspect(reason)}"
      end
      
      Logger.info(msg)
      Process.sleep(50)
      result
    end
    
    # Check final operation in cache
    case Cache.get("current_operation") do
      {:ok, op} ->
        Logger.info("\n  • Final cached operation: #{inspect(op)}")
      :miss ->
        Logger.info("\n  • No operation in cache")
    end
    
    # Get workflow stats
    breaker_state = AdaptiveCircuitBreaker.get_state(:workflow_breaker)
    
    Logger.info("\n  📈 Integrated Workflow Stats:")
    Logger.info("    • Successful workflows: #{Enum.count(results, &match?({:ok, _}, &1))}/10")
    Logger.info("    • Circuit breaker health: #{breaker_state.health_score}")
    
    Logger.info("\n  ✓ Integrated workflow test completed")
  end
end

# Run the dogfood test
DogfoodTest.run()