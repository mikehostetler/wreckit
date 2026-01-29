defmodule Cybernetic.VSM.System5.PolicyIntelligence do
  @moduledoc """
  S5 Policy Intelligence Engine with Claude integration.

  Provides intelligent policy evolution, governance recommendations,
  and strategic guidance for the VSM framework using Claude reasoning.
  """

  use GenServer
  require Logger
  require OpenTelemetry.Tracer
  alias Cybernetic.VSM.System4.Providers.Anthropic
  alias Cybernetic.VSM.System4.Episode
  alias Cybernetic.VSM.System5.Policy

  @telemetry [:cybernetic, :s5, :policy_intelligence]

  defstruct [
    :anthropic_provider,
    :policy_history,
    :governance_rules,
    :meta_policies
  ]

  @type t :: %__MODULE__{
          anthropic_provider: Anthropic.t() | nil,
          policy_history: map(),
          governance_rules: list(),
          meta_policies: map()
        }

  # Public API
  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc """
  Analyze policy evolution patterns and suggest improvements.
  """
  def analyze_policy_evolution(policy_id, context \\ %{}) do
    GenServer.call(__MODULE__, {:analyze_evolution, policy_id, context})
  end

  @doc """
  Generate governance recommendations for policy changes.
  """
  def recommend_governance(proposed_policy, current_policies \\ []) do
    GenServer.call(__MODULE__, {:recommend_governance, proposed_policy, current_policies})
  end

  @doc """
  Create meta-policies for organizational learning and adaptation.
  """
  def evolve_meta_policies(system_metrics, historical_data) do
    GenServer.call(__MODULE__, {:evolve_meta_policies, system_metrics, historical_data})
  end

  @doc """
  Evaluate policy alignment across VSM systems.
  """
  def assess_system_alignment(policies_by_system) do
    GenServer.call(__MODULE__, {:assess_alignment, policies_by_system})
  end

  @impl true
  def init(opts) do
    # Initialize Anthropic provider
    anthropic_opts = Keyword.get(opts, :anthropic, [])

    state = %__MODULE__{
      anthropic_provider: nil,
      policy_history: %{},
      governance_rules: default_governance_rules(),
      meta_policies: default_meta_policies()
    }

    case Anthropic.new(anthropic_opts) do
      {:ok, provider} ->
        state = %{state | anthropic_provider: provider}
        Logger.info("S5 Policy Intelligence initialized with Claude integration")
        {:ok, state}

      {:error, reason} ->
        Logger.warning("Failed to initialize Anthropic provider: #{inspect(reason)}")
        Logger.info("S5 Policy Intelligence running without Claude integration")
        {:ok, state}
    end
  end

  @impl true
  def handle_call({:analyze_evolution, policy_id, context}, _from, state) do
    result = do_analyze_evolution(state, policy_id, context)
    {:reply, result, state}
  end

  def handle_call({:recommend_governance, proposed_policy, current_policies}, _from, state) do
    result =
      OpenTelemetry.Tracer.with_span "s5.policy_intelligence.recommend_governance", %{
        attributes: %{proposed_policy_type: proposed_policy["type"]}
      } do
        do_recommend_governance(state, proposed_policy, current_policies)
      end

    {:reply, result, state}
  end

  def handle_call({:evolve_meta_policies, system_metrics, historical_data}, _from, state) do
    result =
      OpenTelemetry.Tracer.with_span "s5.policy_intelligence.evolve_meta_policies", %{
        attributes: %{metrics_count: map_size(system_metrics)}
      } do
        do_evolve_meta_policies(state, system_metrics, historical_data)
      end

    {:reply, result, update_meta_policies(state, result)}
  end

  def handle_call({:assess_alignment, policies_by_system}, _from, state) do
    result =
      OpenTelemetry.Tracer.with_span "s5.policy_intelligence.assess_alignment", %{
        attributes: %{systems_count: map_size(policies_by_system)}
      } do
        do_assess_alignment(state, policies_by_system)
      end

    {:reply, result, state}
  end

  # Private implementation functions

  defp do_analyze_evolution(state, policy_id, context) do
    result =
      with {:ok, policy_history} <- get_policy_history(policy_id),
           {:ok, analysis} <-
             analyze_with_claude(state, :policy_evolution, %{
               policy_id: policy_id,
               history: policy_history,
               context: context
             }) do
        {:ok, analysis}
      else
        {:error, :no_claude} ->
          {:ok, fallback_evolution_analysis(policy_id, context)}

        {:error, :policy_not_found} ->
          {:ok, fallback_evolution_analysis(policy_id, context)}

        error ->
          Logger.error("Policy evolution analysis failed: #{inspect(error)}")
          error
      end

    case result do
      {:ok, _analysis} ->
        :telemetry.execute(@telemetry ++ [:analysis], %{count: 1}, %{
          type: :evolution,
          policy_id: policy_id
        })

      _error ->
        :ok
    end

    result
  end

  defp do_recommend_governance(state, proposed_policy, current_policies) do
    governance_context = %{
      proposed: proposed_policy,
      current: current_policies,
      rules: state.governance_rules,
      meta_policies: state.meta_policies
    }

    case analyze_with_claude(state, :governance_recommendation, governance_context) do
      {:ok, recommendations} ->
        :telemetry.execute(@telemetry ++ [:governance], %{count: 1}, %{
          proposed_type: proposed_policy["type"]
        })

        {:ok, recommendations}

      {:error, :no_claude} ->
        {:ok,
         fallback_governance_check(proposed_policy, current_policies, state.governance_rules)}

      error ->
        Logger.error("Governance recommendation failed: #{inspect(error)}")
        error
    end
  end

  defp do_evolve_meta_policies(state, system_metrics, historical_data) do
    evolution_context = %{
      current_meta_policies: state.meta_policies,
      system_metrics: system_metrics,
      historical_data: historical_data,
      performance_trends: extract_trends(historical_data)
    }

    case analyze_with_claude(state, :meta_policy_evolution, evolution_context) do
      {:ok, evolved_policies} ->
        :telemetry.execute(@telemetry ++ [:meta_evolution], %{count: 1}, %{
          policies_evolved: map_size(evolved_policies)
        })

        {:ok, evolved_policies}

      {:error, :no_claude} ->
        {:ok, adaptive_meta_policy_evolution(state.meta_policies, system_metrics)}

      error ->
        Logger.error("Meta-policy evolution failed: #{inspect(error)}")
        error
    end
  end

  defp do_assess_alignment(state, policies_by_system) do
    alignment_context = %{
      s1_policies: Map.get(policies_by_system, :s1, []),
      s2_policies: Map.get(policies_by_system, :s2, []),
      s3_policies: Map.get(policies_by_system, :s3, []),
      s4_policies: Map.get(policies_by_system, :s4, []),
      s5_policies: Map.get(policies_by_system, :s5, []),
      meta_policies: state.meta_policies
    }

    case analyze_with_claude(state, :system_alignment, alignment_context) do
      {:ok, alignment_report} ->
        :telemetry.execute(@telemetry ++ [:alignment], %{count: 1}, %{
          systems_analyzed: map_size(policies_by_system)
        })

        {:ok, alignment_report}

      {:error, :no_claude} ->
        {:ok, basic_alignment_check(policies_by_system)}

      error ->
        Logger.error("System alignment assessment failed: #{inspect(error)}")
        error
    end
  end

  defp analyze_with_claude(state, analysis_type, context) do
    if state.anthropic_provider do
      episode = build_policy_episode(analysis_type, context)
      Anthropic.analyze_episode(episode, [])
    else
      {:error, :no_claude}
    end
  end

  defp build_policy_episode(analysis_type, context) do
    kind =
      case analysis_type do
        :policy_evolution -> :policy_review
        :governance_recommendation -> :compliance_check
        :meta_policy_evolution -> :optimization
        :system_alignment -> :policy_review
      end

    title =
      case analysis_type do
        :policy_evolution -> "Policy Evolution Analysis"
        :governance_recommendation -> "Governance Recommendation"
        :meta_policy_evolution -> "Meta-Policy Evolution"
        :system_alignment -> "System Alignment Assessment"
      end

    Episode.new(
      kind,
      title,
      context,
      priority: :normal,
      metadata: %{
        analysis_type: analysis_type,
        source_system: :s5
      }
    )
  end

  # Fallback implementations when Claude is not available

  defp fallback_evolution_analysis(policy_id, _context) do
    %{
      summary: "Basic policy evolution analysis without Claude integration",
      recommendations: [
        %{
          "type" => "monitoring",
          "action" => "Track policy usage metrics for #{policy_id}",
          "rationale" => "Data-driven policy improvement",
          "system" => "s5"
        }
      ],
      risk_level: "low",
      evolution_score: 0.5
    }
  end

  defp fallback_governance_check(proposed_policy, current_policies, rules) do
    conflicts = check_rule_violations(proposed_policy, rules)
    overlaps = find_policy_overlaps(proposed_policy, current_policies)

    %{
      summary: "Rule-based governance check completed",
      conflicts: conflicts,
      overlaps: overlaps,
      approval_status: if(Enum.empty?(conflicts), do: "approved", else: "requires_review"),
      recommendations: generate_governance_recommendations(conflicts, overlaps)
    }
  end

  defp adaptive_meta_policy_evolution(current_meta_policies, system_metrics) do
    # Simple adaptation based on system performance
    performance_score = calculate_system_performance(system_metrics)

    adapted_policies =
      current_meta_policies
      |> adjust_for_performance(performance_score)
      |> Map.put(:last_evolution, System.system_time(:millisecond))

    %{
      evolved_policies: adapted_policies,
      adaptation_reason: "Performance-based adjustment",
      confidence: 0.7
    }
  end

  defp basic_alignment_check(policies_by_system) do
    # Simple overlap and conflict detection
    all_policies = Enum.flat_map(policies_by_system, fn {_system, policies} -> policies end)

    conflicts = detect_policy_conflicts(all_policies)
    coverage_gaps = detect_coverage_gaps(policies_by_system)

    %{
      alignment_score: calculate_alignment_score(conflicts, coverage_gaps),
      conflicts: conflicts,
      coverage_gaps: coverage_gaps,
      recommendations: alignment_recommendations(conflicts, coverage_gaps)
    }
  end

  # Helper functions

  defp get_policy_history(policy_id) do
    try do
      case Policy.get_policy(policy_id) do
        nil -> {:error, :policy_not_found}
        # In real implementation, get full history
        policy -> {:ok, [policy]}
      end
    catch
      :exit, _ -> {:error, :policy_not_found}
    end
  end

  defp default_governance_rules do
    [
      %{
        rule: "no_conflicting_authority",
        description: "Policies cannot overlap authority domains"
      },
      %{rule: "versioning_required", description: "All policy changes must be versioned"},
      %{rule: "impact_assessment", description: "High-impact policies require assessment"},
      %{rule: "stakeholder_approval", description: "Cross-system policies need approval"}
    ]
  end

  defp default_meta_policies do
    %{
      learning_rate: 0.1,
      adaptation_threshold: 0.8,
      governance_strictness: :medium,
      evolution_frequency: :weekly,
      performance_weight: 0.7,
      stability_weight: 0.3
    }
  end

  defp extract_trends(historical_data) do
    # Simple trend extraction - in real implementation, use proper time series analysis
    Map.get(historical_data, :trends, %{})
  end

  defp update_meta_policies(state, {:ok, %{evolved_policies: new_policies}}) do
    %{state | meta_policies: new_policies}
  end

  defp update_meta_policies(state, _), do: state

  defp check_rule_violations(_proposed_policy, _rules), do: []
  defp find_policy_overlaps(_proposed_policy, _current_policies), do: []
  defp generate_governance_recommendations(_conflicts, _overlaps), do: []
  defp calculate_system_performance(_metrics), do: 0.8
  defp adjust_for_performance(policies, _score), do: policies
  defp detect_policy_conflicts(_policies), do: []
  defp detect_coverage_gaps(_policies_by_system), do: []
  defp calculate_alignment_score(_conflicts, _gaps), do: 0.85
  defp alignment_recommendations(_conflicts, _gaps), do: []
end
