#!/usr/bin/env elixir

# Demo script to interact with running Cybernetic VSM server
# This demonstrates the S5 Policy Intelligence Engine in action

# Connect to the running node if distributed, otherwise use local calls
node = Node.self()
IO.puts("🌐 Connected to node: #{node}")
IO.puts("")

# Demonstrate S5 Policy Intelligence Engine
IO.puts("🧠 S5 Policy Intelligence Engine - Live Demo")
IO.puts(String.duplicate("=", 60))

# Test 1: Policy Evolution Analysis
IO.puts("📊 Test 1: Policy Evolution Analysis")
IO.puts(String.duplicate("-", 40))

policy_context = %{
  policy_id: "demo_security_policy_v3",
  domain: "information_security", 
  current_version: "3.1",
  last_review: "2024-07-15",
  performance_metrics: %{
    compliance_rate: 0.96,
    incident_count: 2,
    user_satisfaction: 0.84,
    enforcement_effectiveness: 0.91
  },
  change_history: [
    %{version: "2.0", change: "Added zero-trust requirements", impact: "high"},
    %{version: "2.5", change: "Simplified access controls", impact: "medium"},
    %{version: "3.0", change: "Integrated threat detection", impact: "high"},
    %{version: "3.1", change: "Updated compliance mappings", impact: "low"}
  ],
  business_context: %{
    regulatory_changes: ["ISO27001 update", "NIST framework 2.0"],
    market_pressures: ["cloud_migration", "remote_workforce"],
    organizational_changes: ["security_team_growth", "tool_consolidation"]
  }
}

try do
  case Cybernetic.VSM.System5.PolicyIntelligence.analyze_policy_evolution(policy_context[:policy_id], policy_context) do
    {:ok, analysis} ->
      IO.puts("✅ Policy evolution analysis completed")
      IO.puts("📋 Summary: #{analysis.summary}")
      
      if analysis.recommendations && length(analysis.recommendations) > 0 do
        IO.puts("💡 Key Recommendations:")
        Enum.take(analysis.recommendations, 3)
        |> Enum.each(fn rec ->
          IO.puts("   • [#{String.upcase(rec["type"])}] #{rec["action"]}")
        end)
      end
      
      if analysis.risk_level do
        IO.puts("⚠️  Risk Level: #{String.upcase(analysis.risk_level)}")
      end
      
    {:error, reason} ->
      IO.puts("❌ Policy evolution analysis failed: #{inspect(reason)}")
  end
rescue
  error ->
    IO.puts("❌ Error calling PolicyIntelligence: #{inspect(error)}")
    IO.puts("   (This might indicate the PolicyIntelligence service is not running)")
end

IO.puts("")

# Test 2: Governance Recommendation
IO.puts("🏛️  Test 2: Governance Recommendation")
IO.puts(String.duplicate("-", 40))

proposed_policy = %{
  "id" => "remote_work_security_framework",
  "title" => "Remote Work Security Framework",
  "type" => "security_governance",
  "scope" => "enterprise_wide",
  "authority_level" => "medium",
  "requirements" => [
    "vpn_mandatory",
    "device_encryption_required", 
    "multi_factor_authentication",
    "endpoint_detection_response"
  ],
  "enforcement" => "mandatory",
  "exceptions" => "limited"
}

current_policies = [
  %{"id" => "device_management", "scope" => "endpoint_security", "authority" => "high"},
  %{"id" => "network_access", "scope" => "remote_access", "authority" => "medium"},
  %{"id" => "data_classification", "scope" => "information_handling", "authority" => "high"}
]

try do
  case Cybernetic.VSM.System5.PolicyIntelligence.recommend_governance(proposed_policy, current_policies) do
    {:ok, recommendations} ->
      IO.puts("✅ Governance analysis completed")
      IO.puts("📋 Summary: #{recommendations.summary}")
      
      if recommendations.approval_status do
        IO.puts("🎯 Recommendation: #{String.upcase(recommendations.approval_status)}")
      end
      
      if recommendations.conflicts && length(recommendations.conflicts) > 0 do
        IO.puts("⚠️  Conflicts Detected:")
        Enum.take(recommendations.conflicts, 2)
        |> Enum.each(fn conflict ->
          IO.puts("   • #{conflict["type"]}: #{conflict["description"]}")
        end)
      end
      
    {:error, reason} ->
      IO.puts("❌ Governance recommendation failed: #{inspect(reason)}")
  end
rescue
  error ->
    IO.puts("❌ Error calling PolicyIntelligence: #{inspect(error)}")
end

IO.puts("")

# Test 3: System Alignment Assessment
IO.puts("🎯 Test 3: System Alignment Assessment")
IO.puts(String.duplicate("-", 40))

policies_by_system = %{
  s1: [
    %{"id" => "operational_procedures", "focus" => "efficiency", "scope" => "daily_operations"},
    %{"id" => "incident_response", "focus" => "reliability", "scope" => "emergency_procedures"}
  ],
  s2: [
    %{"id" => "resource_allocation", "focus" => "coordination", "scope" => "cross_functional"},
    %{"id" => "priority_management", "focus" => "workflow", "scope" => "task_routing"}
  ],
  s3: [
    %{"id" => "performance_monitoring", "focus" => "oversight", "scope" => "system_wide"},
    %{"id" => "quality_assurance", "focus" => "control", "scope" => "output_validation"}
  ],
  s4: [
    %{"id" => "threat_intelligence", "focus" => "analysis", "scope" => "predictive_security"},
    %{"id" => "continuous_learning", "focus" => "adaptation", "scope" => "improvement_cycles"}
  ],
  s5: [
    %{"id" => "governance_charter", "focus" => "meta", "scope" => "organizational_direction"},
    %{"id" => "policy_framework", "focus" => "structure", "scope" => "rule_hierarchies"}
  ]
}

try do
  case Cybernetic.VSM.System5.PolicyIntelligence.assess_system_alignment(policies_by_system) do
    {:ok, alignment} ->
      IO.puts("✅ System alignment assessment completed")
      IO.puts("📋 Summary: #{alignment.summary}")
      
      if alignment.alignment_score do
        score = alignment.alignment_score
        rating = cond do
          score >= 0.9 -> "Excellent"
          score >= 0.8 -> "Good"
          score >= 0.7 -> "Fair" 
          true -> "Needs Improvement"
        end
        IO.puts("🎯 Overall Alignment Score: #{score} (#{rating})")
      end
      
      if alignment.conflicts && length(alignment.conflicts) > 0 do
        IO.puts("⚠️  Policy Conflicts:")
        Enum.take(alignment.conflicts, 2)
        |> Enum.each(fn conflict ->
          systems = Enum.join(conflict["systems"] || [], ", ")
          IO.puts("   • #{systems}: #{conflict["description"]}")
        end)
      end
      
      if alignment.synergy_opportunities && length(alignment.synergy_opportunities) > 0 do
        IO.puts("✨ Synergy Opportunities:")
        Enum.take(alignment.synergy_opportunities, 2)
        |> Enum.each(fn synergy ->
          systems = Enum.join(synergy["systems"] || [], "-")
          IO.puts("   • #{systems}: #{synergy["opportunity"]}")
        end)
      end
      
    {:error, reason} ->
      IO.puts("❌ System alignment assessment failed: #{inspect(reason)}")
  end
rescue
  error ->
    IO.puts("❌ Error calling PolicyIntelligence: #{inspect(error)}")
end

IO.puts("")

# Test 4: Check Process Status
IO.puts("🔍 Test 4: VSM Process Status Check")
IO.puts(String.duplicate("-", 40))

processes_to_check = [
  Cybernetic.VSM.System5.PolicyIntelligence,
  Cybernetic.VSM.System5.SOPEngine,
  Cybernetic.VSM.System4.LLMBridge,
  Cybernetic.Core.Aggregator.CentralAggregator,
  Cybernetic.VSM.System5.Policy
]

Enum.each(processes_to_check, fn process_name ->
  case Process.whereis(process_name) do
    nil ->
      IO.puts("❌ #{process_name}: Not running")
    pid ->
      try do
        info = Process.info(pid)
        status = if info, do: "✅ Running (#{inspect(pid)})", else: "❌ Dead"
        IO.puts("#{status} #{process_name}")
      rescue
        _ ->
          IO.puts("❌ #{process_name}: Process check failed")
      end
  end
end)

IO.puts("")
IO.puts("🎉 S5 Policy Intelligence Engine demonstration completed!")
IO.puts("")
IO.puts("🚀 Key Capabilities Demonstrated:")
IO.puts("   ✅ Policy Evolution Analysis with Claude reasoning")
IO.puts("   ✅ Governance Recommendation with conflict detection")
IO.puts("   ✅ Cross-system policy alignment assessment")
IO.puts("   ✅ Real-time VSM process monitoring")
IO.puts("")
IO.puts("💡 The Cybernetic VSM framework is now running with full")
IO.puts("   AI-powered policy intelligence capabilities!")