#!/usr/bin/env elixir

Mix.install([])

# Simple script to check server status by connecting to local running processes
Code.append_path("_build/dev/lib/cybernetic/ebin")

IO.puts("🔍 Checking Cybernetic VSM Server Status")
IO.puts(String.duplicate("=", 50))

# Check if we can load the main application
try do
  {:ok, _} = Application.ensure_all_started(:cybernetic)
  IO.puts("✅ Application loaded successfully")
rescue
  error ->
    IO.puts("❌ Failed to load application: #{inspect(error)}")
    exit(:normal)
end

# Check key processes
processes_to_check = [
  Cybernetic.VSM.System5.PolicyIntelligence,
  Cybernetic.VSM.System5.SOPEngine,
  Cybernetic.VSM.System4.LLMBridge,
  Cybernetic.Core.Aggregator.CentralAggregator,
  Cybernetic.VSM.System5.Policy
]

IO.puts("\n📋 Process Status:")
Enum.each(processes_to_check, fn process_name ->
  case Process.whereis(process_name) do
    nil ->
      IO.puts("❌ #{process_name}: Not running")
    pid ->
      IO.puts("✅ #{process_name}: Running (#{inspect(pid)})")
  end
end)

# Test a simple function call if PolicyIntelligence is running
IO.puts("\n🧠 Testing Policy Intelligence Engine:")
try do
  case Process.whereis(Cybernetic.VSM.System5.PolicyIntelligence) do
    nil ->
      IO.puts("❌ PolicyIntelligence not running - cannot test")
    _pid ->
      # Try a simple call
      case Cybernetic.VSM.System5.PolicyIntelligence.analyze_policy_evolution("test_policy", %{test: true}) do
        {:ok, result} ->
          IO.puts("✅ Policy Intelligence responding correctly")
          IO.puts("   Response type: #{inspect(Map.keys(result))}")
        {:error, reason} ->
          IO.puts("⚠️  Policy Intelligence responded with error: #{inspect(reason)}")
      end
  end
rescue
  error ->
    IO.puts("❌ Error testing Policy Intelligence: #{inspect(error)}")
end

IO.puts("\n🎉 Status check completed!")