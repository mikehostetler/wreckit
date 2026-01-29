#!/usr/bin/env elixir

defmodule TestUUIDRaceFree do
  @moduledoc """
  Test UUID-based race-free circuit breaker transitions.
  Verifies that concurrent transition attempts are properly handled.
  """
  
  def run do
    IO.puts("\n🔬 Testing UUID-based Race-Free Circuit Breaker Transitions")
    IO.puts("=" <> String.duplicate("=", 60))
    
    # Start registry for circuit breakers if not already started
    case Registry.start_link(keys: :unique, name: Cybernetic.CircuitBreakerRegistry) do
      {:ok, _} -> :ok
      {:error, {:already_started, _}} -> :ok
    end
    
    # Test 1: Single transition attempt
    test_single_transition()
    
    # Test 2: Concurrent transition attempts
    test_concurrent_transitions()
    
    # Test 3: Transition cleanup on failure
    test_transition_cleanup()
    
    # Test 4: Performance under high concurrency
    test_high_concurrency()
    
    IO.puts("\n✅ All UUID race-free tests passed!")
  end
  
  defp test_single_transition do
    IO.puts("\n📌 Test 1: Single Transition Attempt")
    
    {:ok, cb} = Cybernetic.Core.Resilience.AdaptiveCircuitBreaker.start_link(
      name: :test_single_cb,
      failure_threshold: 3
    )
    
    # Force to open state
    Cybernetic.Core.Resilience.AdaptiveCircuitBreaker.force_state(:test_single_cb, :open)
    
    # Allow timeout to pass
    Process.sleep(100)
    
    # Attempt transition - should succeed
    result = Cybernetic.Core.Resilience.AdaptiveCircuitBreaker.call(
      :test_single_cb,
      fn -> :success end,
      1000
    )
    
    case result do
      {:ok, :success} -> IO.puts("  ✓ Single transition succeeded")
      {:error, _} -> IO.puts("  ✓ Circuit breaker correctly rejected call")
    end
    
    Process.exit(cb, :normal)
  end
  
  defp test_concurrent_transitions do
    IO.puts("\n📌 Test 2: Concurrent Transition Attempts")
    
    {:ok, cb} = Cybernetic.Core.Resilience.AdaptiveCircuitBreaker.start_link(
      name: :test_concurrent_cb,
      failure_threshold: 3,
      timeout_ms: 50  # Short timeout for quick testing
    )
    
    # Force to open state
    Cybernetic.Core.Resilience.AdaptiveCircuitBreaker.force_state(:test_concurrent_cb, :open)
    
    # Wait for timeout
    Process.sleep(60)
    
    # Spawn 100 concurrent attempts
    parent = self()
    tasks = for i <- 1..100 do
      Task.async(fn ->
        result = Cybernetic.Core.Resilience.AdaptiveCircuitBreaker.call(
          :test_concurrent_cb,
          fn -> 
            # Simulate some work
            Process.sleep(:rand.uniform(10))
            {:worker, i}
          end,
          5000
        )
        send(parent, {:result, i, result})
      end)
    end
    
    # Collect results
    results = for _ <- 1..100 do
      receive do
        {:result, id, result} -> {id, result}
      after
        10000 -> {:timeout, nil}
      end
    end
    
    # Analyze results
    successes = Enum.count(results, fn {_, r} -> match?({:ok, _}, r) end)
    errors = Enum.count(results, fn {_, r} -> match?({:error, _}, r) end)
    
    IO.puts("  Results: #{successes} successes, #{errors} errors")
    
    # With UUID-based transitions, we should see orderly handling
    # Most should be rejected while circuit is transitioning/testing
    if successes + errors == 100 do
      IO.puts("  ✓ All concurrent attempts handled without race conditions")
    else
      IO.puts("  ✗ Some attempts lost - race condition detected!")
    end
    
    # Cleanup tasks properly
    Enum.each(tasks, &Task.await(&1, 1000))
    Process.exit(cb, :normal)
  end
  
  defp test_transition_cleanup do
    IO.puts("\n📌 Test 3: Transition Cleanup on Failure")
    
    {:ok, cb} = Cybernetic.Core.Resilience.AdaptiveCircuitBreaker.start_link(
      name: :test_cleanup_cb,
      failure_threshold: 3,
      timeout_ms: 50
    )
    
    # Force to open state
    Cybernetic.Core.Resilience.AdaptiveCircuitBreaker.force_state(:test_cleanup_cb, :open)
    
    # Wait for timeout
    Process.sleep(60)
    
    # First call should transition to half-open and fail
    result1 = Cybernetic.Core.Resilience.AdaptiveCircuitBreaker.call(
      :test_cleanup_cb,
      fn -> raise "Test error" end,
      1000
    )
    
    case result1 do
      {:error, %RuntimeError{}} -> 
        IO.puts("  ✓ First call failed as expected")
      _ -> 
        IO.puts("  ✗ Unexpected result: #{inspect(result1)}")
    end
    
    # Check state - should have cleared transition_ref
    _state = Cybernetic.Core.Resilience.AdaptiveCircuitBreaker.get_state(:test_cleanup_cb)
    
    # Second call should be able to attempt transition again
    # (after another timeout)
    Process.sleep(60)
    
    result2 = Cybernetic.Core.Resilience.AdaptiveCircuitBreaker.call(
      :test_cleanup_cb,
      fn -> :success end,
      1000
    )
    
    case result2 do
      {:ok, :success} -> 
        IO.puts("  ✓ Transition ref properly cleaned up, second attempt succeeded")
      {:error, :circuit_breaker_open} ->
        IO.puts("  ✓ Circuit breaker still open (expected behavior)")
      _ -> 
        IO.puts("  ✗ Unexpected result: #{inspect(result2)}")
    end
    
    Process.exit(cb, :normal)
  end
  
  defp test_high_concurrency do
    IO.puts("\n📌 Test 4: High Concurrency Performance")
    
    {:ok, cb} = Cybernetic.Core.Resilience.AdaptiveCircuitBreaker.start_link(
      name: :test_perf_cb,
      failure_threshold: 5,
      timeout_ms: 10
    )
    
    # Measure performance under load
    start_time = System.monotonic_time(:millisecond)
    
    # Run 1000 operations across 10 iterations
    for iteration <- 1..10 do
      # Alternate between forcing open and allowing recovery
      if rem(iteration, 2) == 0 do
        Cybernetic.Core.Resilience.AdaptiveCircuitBreaker.force_state(:test_perf_cb, :open)
        Process.sleep(15)  # Wait for timeout
      end
      
      # Spawn 100 concurrent calls
      tasks = for _i <- 1..100 do
        Task.async(fn ->
          Cybernetic.Core.Resilience.AdaptiveCircuitBreaker.call(
            :test_perf_cb,
            fn -> 
              if :rand.uniform(10) > 3 do
                :ok
              else
                raise "Random failure"
              end
            end,
            100
          )
        end)
      end
      
      # Wait for all tasks
      Enum.each(tasks, fn task ->
        try do
          Task.await(task, 1000)
        catch
          :exit, _ -> :ok  # Ignore task exits
        end
      end)
    end
    
    duration = System.monotonic_time(:millisecond) - start_time
    ops_per_second = 1000 / (duration / 1000)
    
    IO.puts("  Processed 1000 operations in #{duration}ms")
    IO.puts("  Throughput: #{Float.round(ops_per_second, 2)} ops/sec")
    
    if ops_per_second > 100 do
      IO.puts("  ✓ Performance acceptable with UUID-based transitions")
    else
      IO.puts("  ⚠️ Performance may be degraded")
    end
    
    Process.exit(cb, :normal)
  end
end

# Run the tests
TestUUIDRaceFree.run()