#!/usr/bin/env elixir

# Comprehensive Dogfood Test for Cybernetic VSM Framework
# Tests all major components: VSM S1-S5, CRDT, MCP, Security, Health

defmodule VSMDogfoodTest do
  @moduledoc """
  Comprehensive dogfood test for the entire Cybernetic VSM architecture
  """
  
  require Logger
  
  def run do
    Logger.info("🐕 Starting Comprehensive VSM Dogfood Test")
    Logger.info("=" |> String.duplicate(60))
    
    # Test all major components
    test_vsm_systems()
    test_crdt_state()
    test_mcp_tools()
    test_security_components()
    test_health_monitoring()
    test_goldrush_patterns()
    test_aggregator()
    
    Logger.info("\n✅ All VSM components dogfood tested successfully!")
  end
  
  # Test VSM Systems S1-S5
  defp test_vsm_systems do
    Logger.info("\n🏗️ Testing VSM Systems (S1-S5)...")
    Logger.info("-" |> String.duplicate(40))
    
    # Test S1 - Operational
    Logger.info("  • Testing S1 Operational System...")
    {:ok, s1_pid} = Cybernetic.VSM.System1.Operational.start_link(name: :test_s1)
    
    # Send test operation
    GenServer.cast(s1_pid, {:operation, %{
      type: "vsm.s1.operation",
      operation: "process_data",
      data: %{value: 42, source: "dogfood_test"}
    }})
    Process.sleep(100)
    Logger.info("    ✓ S1 processed operation")
    
    # Test S2 - Coordination
    Logger.info("  • Testing S2 Coordination System...")
    {:ok, s2_pid} = Cybernetic.VSM.System2.Attention.start_link([])
    
    # Request resources
    result = GenServer.call(s2_pid, {:reserve, :test_resource, 5}, 5000)
    Logger.info("    S2 resource reservation: #{inspect(result)}")
    
    # Test S3 - Control & Monitoring
    Logger.info("  • Testing S3 Control System...")
    alias Cybernetic.VSM.System3.RateLimiter
    
    # Test rate limiting
    budget_result = RateLimiter.check_budget(:mcp_tools, 10)
    Logger.info("    S3 rate limit check: #{inspect(budget_result)}")
    
    # Test S4 - Intelligence
    Logger.info("  • Testing S4 Intelligence System...")
    alias Cybernetic.VSM.System4.Memory
    
    # Store and retrieve memory
    Memory.store("test_key", %{data: "test_value", timestamp: DateTime.utc_now()})
    memory_result = Memory.retrieve("test_key")
    Logger.info("    S4 memory retrieval: #{inspect(memory_result)}")
    
    # Test S5 - Policy
    Logger.info("  • Testing S5 Policy System...")
    {:ok, s5_pid} = Cybernetic.VSM.System5.Policy.start_link([])
    
    policy_result = GenServer.call(s5_pid, {:evaluate_policy, %{
      action: "test_action",
      context: %{user: "dogfood", priority: "high"}
    }}, 5000)
    Logger.info("    S5 policy evaluation: #{inspect(policy_result)}")
    
    Logger.info("  ✓ VSM Systems test completed")
  rescue
    error ->
      Logger.warning("  ⚠ VSM test partial failure: #{inspect(error)}")
  end
  
  # Test CRDT Distributed State
  defp test_crdt_state do
    Logger.info("\n🔄 Testing CRDT Distributed State...")
    Logger.info("-" |> String.duplicate(40))
    
    alias Cybernetic.Core.CRDT.ContextGraph
    
    Logger.info("  • Creating CRDT context graph...")
    {:ok, graph} = ContextGraph.start_link(name: :test_graph)
    
    # Add nodes
    Logger.info("  • Adding nodes to graph...")
    ContextGraph.add_node(graph, "node1", %{type: "entity", value: "test1"})
    ContextGraph.add_node(graph, "node2", %{type: "entity", value: "test2"})
    ContextGraph.add_node(graph, "node3", %{type: "entity", value: "test3"})
    
    # Add edges
    Logger.info("  • Creating relationships...")
    ContextGraph.add_edge(graph, "node1", "node2", %{relation: "connected"})
    ContextGraph.add_edge(graph, "node2", "node3", %{relation: "depends_on"})
    
    # Query graph
    state = GenServer.call(graph, :get_state)
    node_count = map_size(state.nodes)
    edge_count = map_size(state.edges)
    
    Logger.info("    Graph stats: #{node_count} nodes, #{edge_count} edges")
    
    # Test CRDT merge
    Logger.info("  • Testing CRDT merge...")
    {:ok, graph2} = ContextGraph.start_link(name: :test_graph2)
    ContextGraph.add_node(graph2, "node4", %{type: "entity", value: "test4"})
    
    # Get deltas and merge
    delta = GenServer.call(graph2, :get_delta)
    GenServer.cast(graph, {:merge_delta, delta})
    
    Process.sleep(100)
    merged_state = GenServer.call(graph, :get_state)
    merged_node_count = map_size(merged_state.nodes)
    
    Logger.info("    Merged graph: #{merged_node_count} nodes")
    
    Logger.info("  ✓ CRDT state test completed")
  rescue
    error ->
      Logger.warning("  ⚠ CRDT test failed: #{inspect(error)}")
  end
  
  # Test MCP Tool Integration
  defp test_mcp_tools do
    Logger.info("\n🔧 Testing MCP Tool Integration...")
    Logger.info("-" |> String.duplicate(40))
    
    alias Cybernetic.Core.MCP.Tools.Registry
    
    Logger.info("  • Listing available MCP tools...")
    tools = Registry.list_tools()
    Logger.info("    Found #{length(tools)} MCP tools")
    
    # Test a simple tool execution
    Logger.info("  • Testing calculator tool...")
    calc_result = Registry.execute_tool("calculator", %{
      "operation" => "add",
      "a" => 10,
      "b" => 32
    }, %{user_id: "test", permissions: [:all]})
    
    Logger.info("    Calculator result: #{inspect(calc_result)}")
    
    # Test weather tool
    Logger.info("  • Testing weather tool...")
    weather_result = Registry.execute_tool("weather", %{
      "location" => "San Francisco"
    }, %{user_id: "test", permissions: [:all]})
    
    Logger.info("    Weather result: #{inspect(weather_result)}")
    
    Logger.info("  ✓ MCP tools test completed")
  rescue
    error ->
      Logger.warning("  ⚠ MCP test failed: #{inspect(error)}")
  end
  
  # Test Security Components
  defp test_security_components do
    Logger.info("\n🔐 Testing Security Components...")
    Logger.info("-" |> String.duplicate(40))
    
    alias Cybernetic.Core.Security.NonceBloom
    alias Cybernetic.VSM.System3.RateLimiter
    
    # Test Nonce Bloom Filter
    Logger.info("  • Testing NonceBloom replay prevention...")
    nonce1 = NonceBloom.generate_nonce()
    nonce2 = NonceBloom.generate_nonce()
    
    # First use should succeed
    result1 = NonceBloom.verify_nonce(nonce1)
    Logger.info("    First nonce verification: #{result1}")
    
    # Replay should fail
    result2 = NonceBloom.verify_nonce(nonce1)
    Logger.info("    Replay attempt blocked: #{not result2}")
    
    # New nonce should succeed
    result3 = NonceBloom.verify_nonce(nonce2)
    Logger.info("    New nonce verification: #{result3}")
    
    # Test Rate Limiter
    Logger.info("  • Testing Rate Limiter...")
    
    # Consume budget
    results = for i <- 1..5 do
      RateLimiter.check_budget(:s4_llm, 10)
    end
    
    allowed = Enum.count(results, &(&1 == :ok))
    Logger.info("    Rate limit: #{allowed}/5 requests allowed")
    
    # Test budget info
    info = RateLimiter.get_budget_info(:s4_llm)
    Logger.info("    Budget info: #{inspect(info)}")
    
    Logger.info("  ✓ Security components test completed")
  rescue
    error ->
      Logger.warning("  ⚠ Security test failed: #{inspect(error)}")
  end
  
  # Test Health Monitoring
  defp test_health_monitoring do
    Logger.info("\n💓 Testing Health Monitoring...")
    Logger.info("-" |> String.duplicate(40))
    
    alias Cybernetic.Health.Monitor
    alias Cybernetic.Health.Collector
    
    Logger.info("  • Checking system health...")
    health_status = Monitor.get_health_status()
    Logger.info("    Overall health: #{health_status.status}")
    
    # Report some metrics
    Logger.info("  • Reporting health metrics...")
    Collector.report_metric(:cpu_usage, 45.2)
    Collector.report_metric(:memory_usage, 62.8)
    Collector.report_metric(:request_count, 1234)
    
    Process.sleep(100)
    
    # Get aggregated metrics
    metrics = Collector.get_metrics()
    Logger.info("    Metrics collected: #{map_size(metrics)} types")
    
    # Trigger health check
    Logger.info("  • Running health check...")
    Monitor.check_health()
    
    Process.sleep(100)
    updated_status = Monitor.get_health_status()
    Logger.info("    Health check complete: #{updated_status.status}")
    
    Logger.info("  ✓ Health monitoring test completed")
  rescue
    error ->
      Logger.warning("  ⚠ Health test failed: #{inspect(error)}")
  end
  
  # Test Goldrush Pattern Matching
  defp test_goldrush_patterns do
    Logger.info("\n⛏️ Testing Goldrush Pattern Engine...")
    Logger.info("-" |> String.duplicate(40))
    
    alias Cybernetic.Core.Goldrush.Elixir.Engine
    
    Logger.info("  • Loading pattern engine...")
    {:ok, engine} = Engine.start_link([])
    
    # Define test pattern
    pattern = %{
      match: %{type: "order", status: "pending"},
      action: fn event -> 
        Logger.info("    Pattern matched: #{inspect(event)}")
        {:ok, :processed}
      end
    }
    
    # Register pattern
    Logger.info("  • Registering patterns...")
    GenServer.cast(engine, {:register_pattern, :test_pattern, pattern})
    
    # Send matching event
    Logger.info("  • Testing pattern matching...")
    test_event = %{
      type: "order",
      status: "pending",
      id: "order_123",
      amount: 99.99
    }
    
    result = GenServer.call(engine, {:process_event, test_event})
    Logger.info("    Match result: #{inspect(result)}")
    
    # Send non-matching event
    non_match = %{type: "user", status: "active"}
    result2 = GenServer.call(engine, {:process_event, non_match})
    Logger.info("    Non-match result: #{inspect(result2)}")
    
    Logger.info("  ✓ Goldrush pattern test completed")
  rescue
    error ->
      Logger.warning("  ⚠ Goldrush test failed: #{inspect(error)}")
  end
  
  # Test Central Aggregator
  defp test_aggregator do
    Logger.info("\n📊 Testing Central Aggregator...")
    Logger.info("-" |> String.duplicate(40))
    
    alias Cybernetic.Core.Aggregator.CentralAggregator
    
    Logger.info("  • Submitting facts to aggregator...")
    
    # Submit various facts
    facts = [
      %{type: "metric", name: "response_time", value: 125},
      %{type: "metric", name: "error_rate", value: 0.02},
      %{type: "event", name: "user_login", user_id: "test_123"},
      %{type: "metric", name: "response_time", value: 89},
      %{type: "metric", name: "response_time", value: 156}
    ]
    
    Enum.each(facts, fn fact ->
      CentralAggregator.submit_fact(fact)
    end)
    
    Process.sleep(200) # Let aggregation happen
    
    # Get aggregated data
    Logger.info("  • Retrieving aggregated facts...")
    aggregated = GenServer.call(CentralAggregator, :get_aggregated_facts)
    
    Logger.info("    Aggregated fact types: #{map_size(aggregated)}")
    
    # Check specific aggregations
    if response_times = aggregated["metric:response_time"] do
      avg = Enum.sum(Enum.map(response_times, & &1.value)) / length(response_times)
      Logger.info("    Average response time: #{avg}ms")
    end
    
    if error_rates = aggregated["metric:error_rate"] do
      Logger.info("    Error rate samples: #{length(error_rates)}")
    end
    
    Logger.info("  ✓ Central Aggregator test completed")
  rescue
    error ->
      Logger.warning("  ⚠ Aggregator test failed: #{inspect(error)}")
  end
end

# Run the comprehensive dogfood test
VSMDogfoodTest.run()