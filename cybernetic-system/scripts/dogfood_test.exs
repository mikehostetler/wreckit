#!/usr/bin/env elixir

# Dogfood Test - Eating our own dog food
# Tests the Cybernetic aMCP Framework by using it for real tasks

IO.puts("\n🐕 Cybernetic aMCP Dogfood Test\n")
IO.puts("=" |> String.duplicate(50))

defmodule DogfoodTest do
  def run do
    IO.puts("\n1️⃣ Testing VSM Systems Startup...")
    test_system_startup()
    
    IO.puts("\n2️⃣ Testing AMQP Connectivity...")
    test_amqp()
    
    IO.puts("\n3️⃣ Testing S4 Intelligence (if API keys configured)...")
    test_s4_intelligence()
    
    IO.puts("\n4️⃣ Testing Circuit Breakers...")
    test_circuit_breakers()
    
    IO.puts("\n5️⃣ Testing CRDT State Management...")
    test_crdt()
    
    IO.puts("\n6️⃣ Testing MCP Tools...")
    test_mcp_tools()
    
    IO.puts("\n✅ Dogfood Test Complete!")
  end
  
  defp test_system_startup do
    # Check if all VSM systems are running
    systems = [
      {Cybernetic.VSM.System1.Supervisor, "S1 Operations"},
      {Cybernetic.VSM.System2.Coordinator, "S2 Coordination"},
      {Cybernetic.VSM.System3.ControlSupervisor, "S3 Control"},
      {Cybernetic.VSM.System4.Supervisor, "S4 Intelligence"},
      {Cybernetic.VSM.System5.PolicySupervisor, "S5 Policy"}
    ]
    
    for {module, name} <- systems do
      case Process.whereis(module) do
        nil -> IO.puts("  ❌ #{name} - NOT RUNNING")
        pid -> IO.puts("  ✅ #{name} - Running (#{inspect(pid)})")
      end
    end
  end
  
  defp test_amqp do
    case Cybernetic.Transport.AMQP.Connection.get_connection() do
      {:ok, conn} ->
        IO.puts("  ✅ AMQP Connection established")
        {:ok, info} = AMQP.Connection.status(conn)
        IO.puts("     Host: #{info[:host]}")
        IO.puts("     Port: #{info[:port]}")
      {:error, reason} ->
        IO.puts("  ❌ AMQP Connection failed: #{inspect(reason)}")
    end
  end
  
  defp test_s4_intelligence do
    # Try a simple test with mock provider first
    test_prompt = "What is 2+2?"
    
    case Cybernetic.VSM.System4.Bridge.analyze(%{
      type: "test",
      prompt: test_prompt,
      context: %{test: true}
    }, provider: :mock) do
      {:ok, response} ->
        IO.puts("  ✅ Mock provider working")
        IO.puts("     Response: #{inspect(response)}")
      {:error, reason} ->
        IO.puts("  ⚠️  Mock provider issue: #{inspect(reason)}")
    end
    
    # Try with real provider if configured
    if System.get_env("ANTHROPIC_API_KEY") do
      IO.puts("  🔄 Testing Anthropic provider...")
      case Cybernetic.VSM.System4.Bridge.analyze(%{
        type: "test",
        prompt: test_prompt,
        context: %{test: true, max_tokens: 50}
      }, provider: :anthropic) do
        {:ok, response} ->
          IO.puts("  ✅ Anthropic provider working")
        {:error, reason} ->
          IO.puts("  ❌ Anthropic provider failed: #{inspect(reason)}")
      end
    else
      IO.puts("  ℹ️  No API keys configured - skipping real provider tests")
    end
  end
  
  defp test_circuit_breakers do
    # Test circuit breaker functionality
    breaker_name = :test_breaker
    
    # Initialize a test circuit breaker
    {:ok, _pid} = Cybernetic.Core.CircuitBreaker.start_link(
      name: breaker_name,
      threshold: 3,
      timeout: 1000
    )
    
    # Test successful call
    result = Cybernetic.Core.CircuitBreaker.call(breaker_name, fn ->
      {:ok, "success"}
    end)
    
    case result do
      {:ok, "success"} ->
        IO.puts("  ✅ Circuit breaker allowing calls")
      _ ->
        IO.puts("  ❌ Circuit breaker unexpected result: #{inspect(result)}")
    end
    
    # Simulate failures to trip the breaker
    for _ <- 1..3 do
      Cybernetic.Core.CircuitBreaker.call(breaker_name, fn ->
        {:error, "simulated failure"}
      end)
    end
    
    # Check if breaker is open
    result = Cybernetic.Core.CircuitBreaker.call(breaker_name, fn ->
      {:ok, "should not execute"}
    end)
    
    case result do
      {:error, :circuit_open} ->
        IO.puts("  ✅ Circuit breaker tripped correctly")
      _ ->
        IO.puts("  ❌ Circuit breaker should be open: #{inspect(result)}")
    end
  end
  
  defp test_crdt do
    # Test CRDT state management
    alias Cybernetic.Core.CRDT.ContextGraph
    
    # Create two CRDT instances
    crdt1 = ContextGraph.new("node1")
    crdt2 = ContextGraph.new("node2")
    
    # Add some data to each
    crdt1 = ContextGraph.add(crdt1, "test_key", "value_from_node1")
    crdt2 = ContextGraph.add(crdt2, "test_key", "value_from_node2")
    crdt2 = ContextGraph.add(crdt2, "another_key", "another_value")
    
    # Merge them
    merged = ContextGraph.merge(crdt1, crdt2)
    
    # Check merge result
    values = ContextGraph.get_all(merged)
    
    if map_size(values) >= 2 do
      IO.puts("  ✅ CRDT merge successful")
      IO.puts("     Merged values: #{inspect(values)}")
    else
      IO.puts("  ❌ CRDT merge failed")
    end
  end
  
  defp test_mcp_tools do
    # Test MCP tool availability
    tools = [
      Cybernetic.MCP.Tools.DatabaseTool,
      Cybernetic.MCP.Tools.CodeAnalysisTool,
      Cybernetic.MCP.Tools.SystemMonitoringTool
    ]
    
    for tool <- tools do
      case tool.describe() do
        %{name: name, description: _desc} ->
          IO.puts("  ✅ #{name} tool available")
        _ ->
          IO.puts("  ❌ #{tool} tool not properly configured")
      end
    end
  end
end

# Run the dogfood test
DogfoodTest.run()