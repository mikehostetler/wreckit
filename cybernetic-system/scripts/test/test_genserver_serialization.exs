#!/usr/bin/env elixir

defmodule TestGenServerSerialization do
  @moduledoc """
  Test to verify GenServer call serialization behavior.
  """
  
  def run do
    IO.puts("\n🔬 Testing GenServer Call Serialization")
    IO.puts("=" <> String.duplicate("=", 40))
    
    # Start registry
    case Registry.start_link(keys: :unique, name: Cybernetic.CircuitBreakerRegistry) do
      {:ok, _} -> :ok
      {:error, {:already_started, _}} -> :ok
    end
    
    {:ok, cb} = Cybernetic.Core.Resilience.AdaptiveCircuitBreaker.start_link(
      name: :test_serialization_cb,
      failure_threshold: 3,
      timeout_ms: 10
    )
    
    # Force to open state
    Cybernetic.Core.Resilience.AdaptiveCircuitBreaker.force_state(:test_serialization_cb, :open)
    
    # Wait for timeout
    Process.sleep(15)
    
    # Test: Are GenServer calls truly serialized?
    parent = self()
    call_order = []
    
    # Spawn 10 concurrent calls that track their execution order
    tasks = for i <- 1..10 do
      Task.async(fn ->
        start_time = System.monotonic_time(:microsecond)
        
        result = Cybernetic.Core.Resilience.AdaptiveCircuitBreaker.call(
          :test_serialization_cb,
          fn -> 
            # Simulate work and track timing
            Process.sleep(5)  # Small delay to see ordering
            {i, System.monotonic_time(:microsecond)}
          end,
          1000
        )
        
        end_time = System.monotonic_time(:microsecond)
        send(parent, {:call_completed, i, start_time, end_time, result})
        result
      end)
    end
    
    # Collect results with timing
    results = for _ <- 1..10 do
      receive do
        {:call_completed, id, start_time, end_time, result} -> 
          {id, start_time, end_time, result}
      after
        5000 -> {:timeout, nil, nil, nil}
      end
    end
    
    # Analyze timing and serialization
    results_with_timing = Enum.sort_by(results, fn {_, start_time, _, _} -> start_time end)
    
    IO.puts("\nCall execution order:")
    Enum.each(results_with_timing, fn {id, start_time, end_time, result} ->
      duration = end_time - start_time
      status = case result do
        {:ok, _} -> "SUCCESS"
        {:error, _} -> "ERROR"
        _ -> "OTHER"
      end
      IO.puts("  Call #{id}: #{duration}μs - #{status}")
    end)
    
    # Check if calls overlapped (would indicate lack of serialization)
    overlaps = check_for_overlaps(results_with_timing)
    
    if overlaps == 0 do
      IO.puts("\n✓ GenServer calls are properly serialized (no overlaps)")
    else
      IO.puts("\n✗ Found #{overlaps} overlapping calls - potential concurrency issue")
    end
    
    # Check state transitions
    state_changes = count_state_transitions(results_with_timing)
    IO.puts("State transitions: #{state_changes}")
    
    # Cleanup tasks properly
    Enum.each(tasks, &Task.await(&1, 1000))
    Process.exit(cb, :normal)
  end
  
  defp check_for_overlaps(results) do
    # Sort by start time and check if any end time is after the next start time
    sorted = Enum.sort_by(results, fn {_, start_time, _, _} -> start_time end)
    
    sorted
    |> Enum.chunk_every(2, 1, :discard)
    |> Enum.count(fn [{_, _, end1, _}, {_, start2, _, _}] ->
      end1 > start2  # Overlap detected
    end)
  end
  
  defp count_state_transitions(results) do
    results
    |> Enum.map(fn {_, _, _, result} -> result end)
    |> Enum.count(&match?({:ok, _}, &1))
  end
end

# Run the test
TestGenServerSerialization.run()