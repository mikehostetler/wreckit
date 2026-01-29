#!/usr/bin/env elixir

defmodule TestS4CircuitBreaker do
  @moduledoc """
  Test S4 Service circuit breaker integration.
  """
  
  def run do
    IO.puts("\n🔬 Testing S4 Service Circuit Breaker Integration")
    IO.puts("=" <> String.duplicate("=", 50))
    
    # Start required registries
    case Registry.start_link(keys: :unique, name: Cybernetic.CircuitBreakerRegistry) do
      {:ok, _} -> :ok
      {:error, {:already_started, _}} -> :ok
    end
    
    # Test 1: Basic S4 Service initialization with circuit breakers
    IO.puts("\n📌 Test 1: S4 Service Status")
    
    # S4 Service is already started by the application, just check it's running
    service_pid = Process.whereis(Cybernetic.VSM.System4.Service)
    IO.puts("  S4 Service PID: #{inspect(service_pid)}")
    
    # Wait a bit for initialization
    Process.sleep(100)
    
    # Check health including circuit breaker status
    health = Cybernetic.VSM.System4.Service.health_check()
    IO.puts("  Service health: #{inspect(health)}")
    
    # Test 2: Circuit breaker state verification
    IO.puts("\n📌 Test 2: Circuit Breaker State")
    
    anthropic_cb = :s4_provider_anthropic
    together_cb = :s4_provider_together
    
    anthropic_state = Cybernetic.Core.Resilience.AdaptiveCircuitBreaker.get_state(anthropic_cb)
    together_state = Cybernetic.Core.Resilience.AdaptiveCircuitBreaker.get_state(together_cb)
    
    IO.puts("  Anthropic CB: #{anthropic_state.state} (health: #{anthropic_state.health_score})")
    IO.puts("  Together CB: #{together_state.state} (health: #{together_state.health_score})")
    
    # Test 3: Force circuit breaker to open and test routing
    IO.puts("\n📌 Test 3: Circuit Breaker Routing")
    
    # Force anthropic circuit breaker open
    Cybernetic.Core.Resilience.AdaptiveCircuitBreaker.force_state(anthropic_cb, :open)
    
    # Create a test episode
    episode = %{
      id: "test-episode-#{System.unique_integer()}",
      data: "Test routing with circuit breaker",
      type: "general"
    }
    
    # Route episode - should skip anthropic due to open circuit
    result = Cybernetic.VSM.System4.Service.route_episode(episode)
    IO.puts("  Route result: #{inspect(result)}")
    
    # Test 4: Circuit breaker recovery
    IO.puts("\n📌 Test 4: Circuit Breaker Recovery")
    
    # Close the circuit breaker
    Cybernetic.Core.Resilience.AdaptiveCircuitBreaker.force_state(anthropic_cb, :closed)
    
    # Try routing again
    episode2 = %{
      id: "test-episode-#{System.unique_integer()}",
      data: "Test recovery",
      type: "reasoning"  # Should prefer anthropic
    }
    
    result2 = Cybernetic.VSM.System4.Service.route_episode(episode2)
    IO.puts("  Recovery result: #{inspect(result2)}")
    
    # Note: Don't cleanup the service as it's managed by the application
    
    IO.puts("\n✅ S4 Circuit Breaker Integration Tests Complete!")
  end
end

# Run the test
TestS4CircuitBreaker.run()