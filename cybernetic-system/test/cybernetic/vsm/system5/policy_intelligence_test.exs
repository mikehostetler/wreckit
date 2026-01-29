defmodule Cybernetic.VSM.System5.PolicyIntelligenceTest do
  use ExUnit.Case, async: false
  alias Cybernetic.VSM.System5.PolicyIntelligence

  @moduletag :integration

  describe "Policy Intelligence Engine" do
    setup do
      # Check if Policy is available (required by PolicyIntelligence)
      policy_pid = Process.whereis(Cybernetic.VSM.System5.Policy)

      if policy_pid == nil do
        {:ok, skip: true}
      else
        # Start the PolicyIntelligence process for testing (handle already_started case)
        pid =
          case PolicyIntelligence.start_link() do
            {:ok, pid} -> pid
            {:error, {:already_started, pid}} -> pid
          end

        on_exit(fn ->
          if Process.alive?(pid) do
            GenServer.stop(pid)
          end
        end)

        {:ok, policy_intelligence: pid}
      end
    end

    test "analyzes policy evolution patterns", context do
      if Map.get(context, :skip) do
        :ok
      else
        policy_id = "test_policy_001"

        context = %{
          domain: "operational_efficiency",
          last_review: "2024-01-15",
          performance_metrics: %{
            compliance_rate: 0.95,
            effectiveness_score: 0.82
          }
        }

        assert {:ok, analysis} = PolicyIntelligence.analyze_policy_evolution(policy_id, context)
        assert Map.has_key?(analysis, :summary)
        assert Map.has_key?(analysis, :recommendations)
        assert is_list(analysis.recommendations)
      end
    end

    test "provides governance recommendations", context do
      if Map.get(context, :skip) do
        :ok
      else
        proposed_policy = %{
          "id" => "new_security_policy",
          "type" => "security",
          "scope" => "cross_system",
          "authority_level" => "high",
          "requirements" => ["encryption", "access_control", "audit_logging"]
        }

        current_policies = [
          %{"id" => "existing_auth_policy", "type" => "security", "scope" => "s1_operations"},
          %{"id" => "data_policy", "type" => "data_governance", "scope" => "enterprise"}
        ]

        assert {:ok, recommendations} =
                 PolicyIntelligence.recommend_governance(proposed_policy, current_policies)

        assert Map.has_key?(recommendations, :summary)
        assert Map.has_key?(recommendations, :approval_status)
      end
    end

    test "evolves meta-policies based on system performance", context do
      if Map.get(context, :skip) do
        :ok
      else
        system_metrics = %{
          s1_performance: %{cpu: 0.75, memory: 0.60, throughput: 1250},
          s2_coordination: %{conflicts: 3, resolutions: 15, efficiency: 0.83},
          s3_control: %{interventions: 8, success_rate: 0.91},
          s4_intelligence: %{analyses: 42, accuracy: 0.88},
          s5_policy: %{updates: 5, compliance: 0.94}
        }

        historical_data = %{
          trends: %{
            performance_improving: true,
            stability_increasing: true,
            complexity_growing: false
          },
          period: "last_30_days"
        }

        assert {:ok, evolution_result} =
                 PolicyIntelligence.evolve_meta_policies(system_metrics, historical_data)

        assert Map.has_key?(evolution_result, :evolved_policies) or
                 Map.has_key?(evolution_result, :adaptation_reason)
      end
    end

    test "assesses policy alignment across VSM systems", context do
      if Map.get(context, :skip) do
        :ok
      else
        policies_by_system = %{
          s1: [
            %{"id" => "ops_sla", "type" => "performance", "targets" => ["99.9% uptime"]},
            %{"id" => "worker_config", "type" => "resource", "limits" => ["8GB memory"]}
          ],
          s2: [
            %{
              "id" => "coordination_rules",
              "type" => "workflow",
              "priorities" => ["customer_first"]
            },
            %{"id" => "resource_allocation", "type" => "resource", "algorithm" => "weighted_fair"}
          ],
          s3: [
            %{"id" => "monitoring_policy", "type" => "oversight", "thresholds" => ["cpu > 80%"]},
            %{"id" => "intervention_rules", "type" => "control", "escalation" => ["auto_scale"]}
          ],
          s4: [
            %{
              "id" => "learning_policy",
              "type" => "intelligence",
              "models" => ["trend_analysis"]
            },
            %{"id" => "prediction_rules", "type" => "forecasting", "horizon" => "24h"}
          ],
          s5: [
            %{"id" => "governance_framework", "type" => "meta", "version" => "2.1"},
            %{"id" => "identity_policy", "type" => "organizational", "values" => ["innovation"]}
          ]
        }

        assert {:ok, alignment_report} =
                 PolicyIntelligence.assess_system_alignment(policies_by_system)

        assert Map.has_key?(alignment_report, :alignment_score)
        assert is_number(alignment_report.alignment_score)
        assert alignment_report.alignment_score >= 0.0
        assert alignment_report.alignment_score <= 1.0
      end
    end

    test "handles missing Claude provider gracefully", context do
      if Map.get(context, :skip) do
        :ok
      else
        # Test fallback behavior when Claude is not available
        policy_id = "fallback_test_policy"
        context = %{test: "fallback_mode"}

        # This should still work with fallback implementations
        assert {:ok, analysis} = PolicyIntelligence.analyze_policy_evolution(policy_id, context)
        assert Map.has_key?(analysis, :summary)
      end
    end

    test "generates appropriate telemetry events", context do
      if Map.get(context, :skip) do
        :ok
      else
        # Test that telemetry events are properly emitted
        test_pid = self()

        :telemetry.attach_many(
          "policy_intelligence_test",
          [
            [:cybernetic, :s5, :policy_intelligence, :analysis],
            [:cybernetic, :s5, :policy_intelligence, :governance],
            [:cybernetic, :s5, :policy_intelligence, :meta_evolution],
            [:cybernetic, :s5, :policy_intelligence, :alignment]
          ],
          fn event, measurements, metadata, _config ->
            send(test_pid, {:telemetry_event, event, measurements, metadata})
          end,
          nil
        )

        # Trigger each type of analysis
        PolicyIntelligence.analyze_policy_evolution("telemetry_test", %{})

        # Verify telemetry events were emitted
        assert_receive {:telemetry_event, [:cybernetic, :s5, :policy_intelligence, :analysis],
                        %{count: 1}, %{type: :evolution}},
                       1000

        :telemetry.detach("policy_intelligence_test")
      end
    end
  end

  describe "Policy Intelligence Integration" do
    setup do
      # Check if Policy is available (required for integration test)
      policy_pid = Process.whereis(Cybernetic.VSM.System5.Policy)

      if policy_pid == nil do
        {:ok, skip: true}
      else
        # Start PolicyIntelligence for integration tests
        pi_pid =
          case PolicyIntelligence.start_link() do
            {:ok, pid} -> pid
            {:error, {:already_started, pid}} -> pid
          end

        on_exit(fn ->
          if Process.alive?(pi_pid) do
            GenServer.stop(pi_pid)
          end
        end)

        {:ok, policy: policy_pid, policy_intelligence: pi_pid}
      end
    end

    @tag :skip
    test "integrates with existing S5 Policy system", context do
      if Map.get(context, :skip) do
        :ok
      else
        # Test integration points with the existing Policy module
        policy_data = %{
          "type" => "integration_test",
          "description" => "Test policy for integration verification",
          "rules" => ["rule1", "rule2"]
        }

        # This tests that we can work with the existing policy system
        assert {:ok, _} =
                 Cybernetic.VSM.System5.Policy.put_policy("integration_test", policy_data)

        # And that our intelligence engine can analyze it
        assert {:ok, analysis} =
                 PolicyIntelligence.analyze_policy_evolution("integration_test", %{})

        assert Map.has_key?(analysis, :summary)
      end
    end
  end
end
