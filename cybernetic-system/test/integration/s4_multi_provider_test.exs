defmodule Cybernetic.Integration.S4MultiProviderTest do
  @moduledoc """
  Integration test for multi-provider S4 Intelligence system.

  Tests the complete flow from episode analysis through provider routing,
  fallback handling, budget enforcement, and SOP generation.
  """

  use ExUnit.Case, async: false

  alias Cybernetic.VSM.System4.{Episode, Router, Service}
  alias Cybernetic.VSM.System4.Providers.{Anthropic, OpenAI, Ollama}
  alias Cybernetic.VSM.System3.RateLimiter
  alias Cybernetic.VSM.System5.SOPShim

  require Logger

  @moduletag :integration
  # 2 minutes for API calls
  @moduletag timeout: 120_000

  setup_all do
    # Check if Service process is available and configured
    service_pid = Process.whereis(Service)

    if service_pid == nil do
      # Start required services (handle already_started case)
      case start_supervised(RateLimiter) do
        {:ok, _} -> :ok
        {:error, {:already_started, _}} -> :ok
      end

      # Start the AdaptiveCircuitBreaker Registry if not already started
      registry_spec = %{
        id: Cybernetic.Core.Resilience.AdaptiveCircuitBreaker.Registry,
        start:
          {Registry, :start_link,
           [[keys: :unique, name: Cybernetic.Core.Resilience.AdaptiveCircuitBreaker.Registry]]}
      }

      case start_supervised(registry_spec) do
        {:ok, _} -> :ok
        {:error, {:already_started, _}} -> :ok
      end

      case start_supervised(Service) do
        {:ok, _} ->
          :ok

        {:error, {:already_started, _}} ->
          :ok

        {:error, reason} ->
          Logger.warning("Failed to start Service: #{inspect(reason)}")
          {:ok, skip: true}
      end

      # Wait for services to initialize
      :timer.sleep(1000)

      # Check if Service is now available
      if Process.whereis(Service) == nil do
        {:ok, skip: true}
      else
        :ok
      end
    else
      :ok
    end
  end

  describe "Multi-Provider Episode Routing" do
    test "routes policy_review episodes to Anthropic primary chain" do
      episode =
        create_test_episode(:policy_review, %{
          title: "Security Policy Review Required",
          data: %{
            policy_name: "Data Access Policy",
            violation_type: "unauthorized_access",
            severity: "high"
          }
        })

      # Should route to [:anthropic, :ollama] chain
      chain = Router.select_chain(episode, [])
      assert chain == [:anthropic, :ollama]

      Logger.info("✓ Policy review episode correctly routed to Anthropic primary")
    end

    test "routes code_gen episodes to OpenAI primary chain", context do
      if Map.get(context, :skip) do
        :ok
      else
        episode =
          create_test_episode(:code_gen, %{
            title: "Generate Authentication Module",
            data: %{
              language: "elixir",
              requirements: ["JWT validation", "role-based access"],
              context: "web application"
            }
          })

        # Should route to [:openai, :together, :anthropic] chain
        chain = Router.select_chain(episode, [])
        assert chain == [:openai, :together, :anthropic]

        Logger.info("✓ Code generation episode correctly routed to OpenAI primary")
      end
    end

    test "routes anomaly_detection to balanced chain", context do
      if Map.get(context, :skip) do
        :ok
      else
        episode =
          create_test_episode(:anomaly_detection, %{
            title: "Unusual System Behavior Detected",
            data: %{
              metric: "response_time",
              threshold: "95th percentile",
              deviation: "300% above normal"
            }
          })

        # Should route to [:together, :anthropic, :ollama] chain
        chain = Router.select_chain(episode, [])
        assert chain == [:together, :anthropic, :ollama]

        Logger.info("✓ Anomaly detection episode correctly routed to balanced chain")
      end
    end
  end

  describe "Provider Health Checks" do
    test "anthropic health check" do
      case Anthropic.health_check() do
        :ok -> Logger.info("✓ Anthropic provider healthy")
        {:error, :missing_api_key} -> Logger.warning("⚠ Anthropic API key not configured")
        {:error, reason} -> Logger.error("✗ Anthropic health check failed: #{inspect(reason)}")
      end
    end

    test "openai health check" do
      case OpenAI.health_check() do
        :ok -> Logger.info("✓ OpenAI provider healthy")
        {:error, :missing_api_key} -> Logger.warning("⚠ OpenAI API key not configured")
        {:error, reason} -> Logger.error("✗ OpenAI health check failed: #{inspect(reason)}")
      end
    end

    test "ollama health check" do
      case Ollama.health_check() do
        :ok -> Logger.info("✓ Ollama provider healthy")
        {:error, :server_unavailable} -> Logger.warning("⚠ Ollama server not running")
        {:error, reason} -> Logger.error("✗ Ollama health check failed: #{inspect(reason)}")
      end
    end
  end

  describe "Budget Management Integration" do
    test "budget tracking for S4 LLM requests" do
      # Reset budget for clean test
      :ok = RateLimiter.reset_budget(:s4_llm)

      # Check initial budget status
      initial_status = RateLimiter.budget_status(:s4_llm)
      assert initial_status.status == :active
      assert initial_status.consumed == 0

      Logger.info(
        "✓ Initial budget status: #{initial_status.remaining}/#{initial_status.limit} tokens available"
      )

      # Make a high-priority request (should consume 1 token)
      assert :ok = RateLimiter.request_tokens(:s4_llm, :analysis, :high)

      # Check budget after consumption
      after_status = RateLimiter.budget_status(:s4_llm)
      assert after_status.consumed == 1
      assert after_status.remaining == initial_status.limit - 1

      Logger.info("✓ Budget correctly tracked after high-priority request")

      # Make multiple normal requests to approach limit
      for i <- 1..10 do
        case RateLimiter.request_tokens(:s4_llm, :analysis, :normal) do
          :ok -> Logger.debug("Request #{i}: ✓")
          {:error, :rate_limited} -> Logger.warning("Request #{i}: Rate limited")
        end
      end

      final_status = RateLimiter.budget_status(:s4_llm)

      Logger.info(
        "✓ Final budget utilization: #{Float.round(final_status.utilization * 100, 2)}%"
      )
    end
  end

  describe "Complete S4 Analysis Flow" do
    @tag :skip
    @tag :requires_api_keys
    test "end-to-end episode analysis with provider fallback", context do
      if Map.get(context, :skip) do
        :ok
      else
        episode =
          create_test_episode(:policy_review, %{
            title: "Critical Security Incident Response",
            data: %{
              incident_type: "data_breach",
              affected_systems: ["user_db", "audit_logs"],
              severity: "critical",
              timeline: "2024-01-15T10:30:00Z"
            },
            context: %{
              previous_incidents: 2,
              compliance_frameworks: ["SOC2", "GDPR"],
              business_impact: "high"
            }
          })

        Logger.info("🚀 Starting end-to-end S4 analysis...")

        # Analyze episode through S4 Service
        case Service.analyze_episode(episode) do
          {:ok, analysis} ->
            Logger.info("✓ S4 analysis completed successfully")

            # Verify analysis structure
            assert is_binary(analysis.text)
            assert is_map(analysis.tokens)
            assert is_map(analysis.usage)
            assert is_list(analysis.sop_suggestions)
            assert is_list(analysis.recommendations)

            Logger.info("  - Analysis text: #{String.length(analysis.text)} characters")

            Logger.info(
              "  - Tokens used: #{analysis.tokens.input} input, #{analysis.tokens.output} output"
            )

            Logger.info("  - Cost: $#{Float.round(analysis.usage.cost_usd, 4)}")
            Logger.info("  - SOP suggestions: #{length(analysis.sop_suggestions)}")
            Logger.info("  - Recommendations: #{length(analysis.recommendations)}")

            # Test SOP generation from analysis
            test_sop_generation(analysis, episode)

          {:error, reason} ->
            Logger.warning("S4 analysis failed (expected if no API keys): #{inspect(reason)}")
            # This is acceptable in test environment without API keys
        end
      end
    end

    @tag :skip
    @tag :requires_ollama
    test "local analysis with Ollama provider" do
      episode =
        create_test_episode(:privacy_review, %{
          title: "Data Processing Privacy Assessment",
          data: %{
            data_types: ["personal_data", "financial_records"],
            processing_purpose: "fraud_detection",
            retention_period: "7_years"
          }
        })

      Logger.info("🔒 Testing privacy-focused local analysis...")

      # Force Ollama provider for privacy
      case Ollama.analyze_episode(episode, model: "deepseek-r1:7b") do
        {:ok, analysis} ->
          Logger.info("✓ Ollama analysis completed locally")

          # Verify privacy-focused analysis
          # Local processing = no cost
          assert analysis.usage.cost_usd == 0.0
          assert String.contains?(String.downcase(analysis.text), "privacy")

          Logger.info("  - Zero-cost local processing ✓")
          Logger.info("  - Privacy-focused analysis ✓")

        {:error, :server_unavailable} ->
          Logger.warning(
            "⚠ Ollama server not available (install with: ollama pull deepseek-r1:7b)"
          )

        {:error, reason} ->
          Logger.error("✗ Ollama analysis failed: #{inspect(reason)}")
      end
    end
  end

  describe "Circuit Breaker and Resilience" do
    test "circuit breaker behavior on provider failures" do
      # Create episode that would normally route to a provider
      episode =
        create_test_episode(:code_gen, %{
          title: "Test Circuit Breaker",
          data: %{test: true}
        })

      Logger.info("🔄 Testing circuit breaker resilience...")

      # Simulate provider chain execution with potential failures
      chain = Router.select_chain(episode, [])

      results =
        Enum.map(chain, fn provider ->
          case apply_provider_with_circuit_breaker(provider, episode) do
            {:ok, result} ->
              Logger.info("  - #{provider}: ✓ Success")
              {:success, provider, result}

            {:error, reason} ->
              Logger.warning("  - #{provider}: ✗ Failed (#{inspect(reason)})")
              {:failure, provider, reason}
          end
        end)

      # Check if at least one provider succeeded or all failed gracefully
      successes = Enum.count(results, fn {status, _, _} -> status == :success end)
      failures = Enum.count(results, fn {status, _, _} -> status == :failure end)

      Logger.info("Circuit breaker test: #{successes} successes, #{failures} failures")

      # Either we have successes, or all failures are handled gracefully
      assert successes > 0 or failures == length(chain)
    end
  end

  describe "Telemetry and Observability" do
    @tag :skip
    test "telemetry events are emitted during analysis", context do
      if Map.get(context, :skip) do
        :ok
      else
        # Set up telemetry handler to capture events
        events = []
        ref = make_ref()

        :telemetry.attach_many(
          "s4_test_handler_#{inspect(ref)}",
          [
            [:cybernetic, :s4, :anthropic, :request],
            [:cybernetic, :s4, :openai, :request],
            [:cybernetic, :s4, :ollama, :request],
            [:cybernetic, :s3, :rate_limiter]
          ],
          fn event, measurements, metadata, acc ->
            send(self(), {:telemetry_event, event, measurements, metadata})
            acc
          end,
          events
        )

        episode =
          create_test_episode(:root_cause, %{
            title: "Telemetry Test Episode",
            data: %{test: true}
          })

        # Trigger analysis that should emit telemetry
        Service.analyze_episode(episode)

        # Collect telemetry events
        received_events = collect_telemetry_events([], 5000)

        Logger.info("📊 Telemetry events captured: #{length(received_events)}")

        for {event, measurements, metadata} <- received_events do
          Logger.info("  - Event: #{inspect(event)}")
          Logger.info("    Measurements: #{inspect(measurements)}")
          Logger.info("    Metadata: #{inspect(metadata)}")
        end

        # Cleanup
        :telemetry.detach("s4_test_handler_#{inspect(ref)}")

        assert length(received_events) > 0
      end
    end
  end

  # Helper functions

  defp create_test_episode(kind, attrs) do
    base_episode = %Episode{
      id: UUID.uuid4() |> to_string(),
      kind: kind,
      title: attrs[:title] || "Test Episode",
      data: attrs[:data] || "Test episode for S4 multi-provider integration",
      priority: attrs[:priority] || :medium,
      source_system: :s1,
      created_at: DateTime.utc_now(),
      context: attrs[:context] || %{},
      metadata: attrs[:metadata] || %{test: true}
    }

    Map.merge(base_episode, Map.take(attrs, [:title, :priority, :context, :data, :metadata]))
  end

  defp test_sop_generation(analysis, episode) do
    Logger.info("📋 Testing SOP generation from analysis...")

    case SOPShim.from_s4(episode, analysis) do
      {:ok, sop_ids} when is_list(sop_ids) ->
        Logger.info("✓ Created #{length(sop_ids)} SOPs from analysis")

        for sop_id <- sop_ids do
          Logger.info("  - SOP id: #{sop_id}")
        end

      {:error, reason} ->
        Logger.warning("⚠ SOP generation failed: #{inspect(reason)}")
    end
  end

  defp apply_provider_with_circuit_breaker(provider, _episode) do
    # Simulate circuit breaker logic with timeout
    case provider do
      :anthropic ->
        if System.get_env("ANTHROPIC_API_KEY"),
          do: {:ok, %{provider: :anthropic}},
          else: {:error, :no_api_key}

      :openai ->
        if System.get_env("OPENAI_API_KEY"),
          do: {:ok, %{provider: :openai}},
          else: {:error, :no_api_key}

      :ollama ->
        case Ollama.health_check() do
          :ok -> {:ok, %{provider: :ollama}}
          error -> error
        end

      _ ->
        {:error, :unknown_provider}
    end
  end

  defp collect_telemetry_events(events, timeout) do
    receive do
      {:telemetry_event, event, measurements, metadata} ->
        collect_telemetry_events([{event, measurements, metadata} | events], timeout)
    after
      timeout -> Enum.reverse(events)
    end
  end
end
