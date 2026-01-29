#!/usr/bin/env elixir

# Run real traces through the application
defmodule JaegerAppTest do
  def run do
    IO.puts("\n🚀 Testing Jaeger through real application workload\n")
    
    # Generate traces through the actual application
    IO.puts("📊 Generating real application traces...")
    
    # Test S4 Intelligence queries
    test_s4_queries()
    
    # Test VSM message flow
    test_vsm_flow()
    
    # Wait for export
    Process.sleep(5000)
    
    # Check Jaeger
    check_jaeger()
  end
  
  defp test_s4_queries do
    IO.puts("\n🧠 Testing S4 Intelligence queries...")
    
    for i <- 1..5 do
      query = %{
        prompt: "Test query #{i}",
        context: %{test_id: i},
        provider: :anthropic,
        model: "claude-3-haiku"
      }
      
      try do
        case GenServer.call(
          {:via, Registry, {Cybernetic.VSM.Registry, "s4.intelligence"}},
          {:query, query},
          5000
        ) do
          {:ok, _} -> IO.puts("  ✅ Query #{i} processed")
          error -> IO.puts("  ⚠️  Query #{i}: #{inspect(error)}")
        end
      catch
        :exit, _ -> IO.puts("  ℹ️  S4 not running, skipping query #{i}")
      end
      
      Process.sleep(100)
    end
  end
  
  defp test_vsm_flow do
    IO.puts("\n🔄 Testing VSM message flow...")
    
    # Send messages through AMQP
    case Cybernetic.Core.Transport.AMQP.ConnectionManager.get_channel() do
      {:ok, channel} ->
        for i <- 1..5 do
          message = %{
            type: "test.trace",
            id: "trace-#{i}",
            timestamp: System.system_time(:millisecond),
            data: %{value: i * 100}
          }
          
          payload = Jason.encode!(message)
          
          :ok = AMQP.Basic.publish(
            channel,
            "cybernetic.direct",
            "s1.operational",
            payload,
            content_type: "application/json"
          )
          
          IO.puts("  ✅ Message #{i} sent to S1")
          Process.sleep(200)
        end
        
      _ ->
        IO.puts("  ⚠️  AMQP not available")
    end
  end
  
  defp check_jaeger do
    IO.puts("\n🔍 Checking Jaeger for traces...")
    
    case HTTPoison.get("http://localhost:16686/api/services") do
      {:ok, %{status_code: 200, body: body}} ->
        services = Jason.decode!(body)["data"] || []
        IO.puts("📊 Services in Jaeger: #{inspect(services)}")
        
        if "cybernetic" in services do
          check_cybernetic_traces()
        else
          IO.puts("\n⚠️  'cybernetic' service not found in Jaeger")
          IO.puts("   This could mean traces haven't been exported yet")
        end
        
      error ->
        IO.puts("❌ Cannot reach Jaeger: #{inspect(error)}")
    end
  end
  
  defp check_cybernetic_traces do
    url = "http://localhost:16686/api/traces?service=cybernetic&limit=50"
    
    case HTTPoison.get(url) do
      {:ok, %{status_code: 200, body: body}} ->
        response = Jason.decode!(body)
        traces = response["data"] || []
        
        IO.puts("\n✅ Found #{length(traces)} traces in Jaeger!")
        
        if length(traces) > 0 do
          IO.puts("\n📈 Sample traces:")
          traces
          |> Enum.take(5)
          |> Enum.each(fn trace ->
            trace_id = trace["traceID"] || "unknown"
            spans = trace["spans"] || []
            process_name = get_process_name(spans)
            
            IO.puts("  • #{process_name}: #{String.slice(trace_id, 0..12)}... (#{length(spans)} spans)")
          end)
          
          IO.puts("\n🎉 Jaeger is working 100%!")
          IO.puts("👉 View traces at: http://localhost:16686")
        else
          IO.puts("  No traces found yet")
        end
        
      _ ->
        IO.puts("❌ Could not fetch traces")
    end
  end
  
  defp get_process_name(spans) do
    case Enum.find(spans, fn s -> s["operationName"] end) do
      %{"operationName" => name} -> name
      _ -> "Unknown"
    end
  end
end

# Run the test
JaegerAppTest.run()

IO.puts("\n✨ Application trace test complete!\n")