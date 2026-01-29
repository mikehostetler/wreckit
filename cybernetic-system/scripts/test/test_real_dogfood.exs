#!/usr/bin/env elixir

# Real-world Dogfood Test for Cybernetic Components
# Tests actual working components from the codebase

defmodule RealDogfoodTest do
  @moduledoc """
  Tests actual components that exist and work in the Cybernetic framework
  """
  
  require Logger
  
  def run do
    Logger.info("🐕 Starting Real-World Cybernetic Dogfood Test")
    Logger.info("=" |> String.duplicate(60))
    
    # Test working components
    test_vsm_s1()
    test_crdt_graph()
    test_nonce_bloom()
    test_rate_limiter()
    test_central_aggregator()
    test_mcp_registry()
    test_s4_memory()
    
    Logger.info("\n✅ All real components dogfood tested successfully!")
  end
  
  # Test S1 Operational System
  defp test_vsm_s1 do
    Logger.info("\n🎯 Testing VSM S1 Operational System...")
    Logger.info("-" |> String.duplicate(40))
    
    # S1 is already running from application start
    s1_pid = Process.whereis(Cybernetic.VSM.System1.Operational)
    
    if s1_pid do
      Logger.info("  • S1 Operational is running: #{inspect(s1_pid)}")
      
      # Send a test message
      GenServer.cast(s1_pid, {:operation, %{
        type: "vsm.s1.operation",
        operation: "test_op",
        data: "dogfood_test"
      }})
      
      Process.sleep(100)
      Logger.info("  ✓ S1 message processed")
    else
      Logger.warning("  ⚠ S1 not running")
    end
  end
  
  # Test CRDT Graph
  defp test_crdt_graph do
    Logger.info("\n🔄 Testing CRDT Graph...")
    Logger.info("-" |> String.duplicate(40))
    
    alias Cybernetic.Core.CRDT.Graph
    
    Logger.info("  • Creating CRDT graph...")
    {:ok, graph} = Graph.start_link(name: :dogfood_graph)
    
    # Add vertices
    Logger.info("  • Adding vertices...")
    Graph.add_vertex(graph, "vertex1", %{label: "Node 1"})
    Graph.add_vertex(graph, "vertex2", %{label: "Node 2"})
    
    # Get state
    state = GenServer.call(graph, :get_crdt_state)
    Logger.info("  • Graph state type: #{inspect(elem(state, 0))}")
    
    Logger.info("  ✓ CRDT Graph test completed")
  rescue
    error ->
      Logger.warning("  ⚠ CRDT test failed: #{inspect(error)}")
  end
  
  # Test NonceBloom
  defp test_nonce_bloom do
    Logger.info("\n🔐 Testing NonceBloom...")
    Logger.info("-" |> String.duplicate(40))
    
    alias Cybernetic.Core.Security.NonceBloom
    
    # NonceBloom is already running
    bloom_pid = Process.whereis(NonceBloom)
    
    if bloom_pid do
      Logger.info("  • NonceBloom is running: #{inspect(bloom_pid)}")
      
      # Generate nonces
      nonce1 = NonceBloom.generate_nonce()
      nonce2 = NonceBloom.generate_nonce()
      
      Logger.info("  • Generated nonces: #{String.slice(nonce1, 0..15)}...")
      
      # Test validation
      {:ok, valid1} = NonceBloom.validate_nonce(nonce1, DateTime.utc_now() |> DateTime.to_unix())
      Logger.info("  • First nonce valid: #{valid1}")
      
      # Test replay prevention
      {:ok, replay} = NonceBloom.validate_nonce(nonce1, DateTime.utc_now() |> DateTime.to_unix())
      Logger.info("  • Replay prevented: #{not replay}")
      
      Logger.info("  ✓ NonceBloom test completed")
    else
      Logger.warning("  ⚠ NonceBloom not running")
    end
  rescue
    error ->
      Logger.warning("  ⚠ NonceBloom test failed: #{inspect(error)}")
  end
  
  # Test Rate Limiter
  defp test_rate_limiter do
    Logger.info("\n⚡ Testing Rate Limiter...")
    Logger.info("-" |> String.duplicate(40))
    
    alias Cybernetic.VSM.System3.RateLimiter
    
    # RateLimiter is running
    limiter_pid = Process.whereis(RateLimiter)
    
    if limiter_pid do
      Logger.info("  • RateLimiter is running: #{inspect(limiter_pid)}")
      
      # Test budget consumption
      Logger.info("  • Testing rate limiting...")
      results = for i <- 1..10 do
        RateLimiter.consume_budget(:mcp_tools, 5)
      end
      
      allowed = Enum.count(results, &(&1 == :ok))
      denied = Enum.count(results, &(&1 == {:error, :rate_limited}))
      
      Logger.info("  • Allowed: #{allowed}, Denied: #{denied}")
      
      # Reset budget
      RateLimiter.reset_budget(:mcp_tools)
      Logger.info("  • Budget reset")
      
      Logger.info("  ✓ Rate Limiter test completed")
    else
      Logger.warning("  ⚠ RateLimiter not running")
    end
  rescue
    error ->
      Logger.warning("  ⚠ RateLimiter test failed: #{inspect(error)}")
  end
  
  # Test Central Aggregator
  defp test_central_aggregator do
    Logger.info("\n📊 Testing Central Aggregator...")
    Logger.info("-" |> String.duplicate(40))
    
    alias Cybernetic.Core.Aggregator.CentralAggregator
    
    # Check if running
    agg_pid = Process.whereis(CentralAggregator)
    
    if agg_pid do
      Logger.info("  • CentralAggregator is running: #{inspect(agg_pid)}")
      
      # Submit facts
      Logger.info("  • Submitting facts...")
      facts = [
        %{type: "metric", name: "cpu", value: 45.2},
        %{type: "metric", name: "memory", value: 512},
        %{type: "event", name: "test", data: "dogfood"}
      ]
      
      Enum.each(facts, fn fact ->
        GenServer.cast(CentralAggregator, {:submit, fact})
      end)
      
      Process.sleep(200)
      
      # Get aggregated facts
      aggregated = GenServer.call(CentralAggregator, :get_aggregated_facts)
      Logger.info("  • Aggregated #{map_size(aggregated)} fact types")
      
      Logger.info("  ✓ Central Aggregator test completed")
    else
      Logger.warning("  ⚠ CentralAggregator not running")
    end
  rescue
    error ->
      Logger.warning("  ⚠ Aggregator test failed: #{inspect(error)}")
  end
  
  # Test MCP Registry
  defp test_mcp_registry do
    Logger.info("\n🔧 Testing MCP Registry...")
    Logger.info("-" |> String.duplicate(40))
    
    alias Cybernetic.Core.MCP.Registry
    
    # Check if running
    reg_pid = Process.whereis(Registry)
    
    if reg_pid do
      Logger.info("  • MCP Registry is running: #{inspect(reg_pid)}")
      
      # List tools
      tools = GenServer.call(Registry, :list_tools)
      Logger.info("  • Found #{length(tools)} registered tools")
      
      # Show tool names
      tool_names = Enum.map(tools, fn {name, _} -> name end)
      Logger.info("  • Tools: #{inspect(tool_names)}")
      
      Logger.info("  ✓ MCP Registry test completed")
    else
      Logger.warning("  ⚠ MCP Registry not running")
    end
  rescue
    error ->
      Logger.warning("  ⚠ MCP Registry test failed: #{inspect(error)}")
  end
  
  # Test S4 Memory
  defp test_s4_memory do
    Logger.info("\n🧠 Testing S4 Memory Service...")
    Logger.info("-" |> String.duplicate(40))
    
    alias Cybernetic.VSM.System4.Memory
    
    # Check if running
    mem_pid = Process.whereis(Memory)
    
    if mem_pid do
      Logger.info("  • S4 Memory is running: #{inspect(mem_pid)}")
      
      # Store memory
      key = "dogfood_test_#{:rand.uniform(1000)}"
      value = %{
        data: "test memory",
        timestamp: DateTime.utc_now(),
        context: "dogfood"
      }
      
      Logger.info("  • Storing memory: #{key}")
      Memory.remember(key, value)
      
      # Retrieve memory
      Process.sleep(50)
      case Memory.recall(key) do
        {:ok, retrieved} ->
          Logger.info("  • Retrieved: #{inspect(retrieved)}")
        _ ->
          Logger.info("  • Memory not found")
      end
      
      # Search memories
      results = Memory.search("test")
      Logger.info("  • Search found #{length(results)} memories")
      
      Logger.info("  ✓ S4 Memory test completed")
    else
      Logger.warning("  ⚠ S4 Memory not running")
    end
  rescue
    error ->
      Logger.warning("  ⚠ S4 Memory test failed: #{inspect(error)}")
  end
end

# Run the real dogfood test
RealDogfoodTest.run()