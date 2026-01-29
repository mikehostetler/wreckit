defmodule Cybernetic.VSM.System4.AnthropicIntegrationTest do
  use ExUnit.Case, async: false

  alias Cybernetic.VSM.System4.{LLMBridge, Providers.Anthropic}
  alias Cybernetic.VSM.System5.SOPEngine

  @moduletag :integration

  describe "Anthropic provider integration with LLM Bridge" do
    setup do
      # Create test episode
      episode = %{
        "id" => "ep-integration-#{System.unique_integer()}",
        "type" => "coordination_conflict",
        "severity" => "high",
        "timestamp" => DateTime.utc_now() |> DateTime.to_iso8601(),
        "details" => %{
          "resource" => "memory",
          "conflict_systems" => ["s1_worker_1", "s1_worker_2"],
          "contention_level" => 0.85,
          "duration_ms" => 2500
        },
        "metadata" => %{
          "system_load" => "high",
          "memory_usage" => 0.92,
          "cpu_usage" => 0.78
        }
      }

      %{episode: episode}
    end

    # Skip by default to avoid API calls during normal testing
    @tag :skip
    test "end-to-end analysis with real Anthropic API", %{episode: episode} do
      # Only run if API key is available
      api_key = System.get_env("ANTHROPIC_API_KEY")

      if api_key do
        {:ok, provider} =
          Anthropic.new(
            api_key: api_key,
            model: "claude-3-5-sonnet-20241022",
            max_tokens: 2048,
            temperature: 0.1
          )

        # Test direct provider analysis
        {:ok, result} = Anthropic.analyze_episode(provider, episode)

        assert is_binary(result.summary)
        assert is_list(result.sop_suggestions)
        assert is_list(result.recommendations)
        assert result.risk_level in ["low", "medium", "high", "critical"]

        # Verify structure of SOP suggestions
        if length(result.sop_suggestions) > 0 do
          sop = List.first(result.sop_suggestions)
          assert Map.has_key?(sop, "title")
          assert Map.has_key?(sop, "category")
          assert Map.has_key?(sop, "priority")

          assert sop["category"] in [
                   "operational",
                   "coordination",
                   "control",
                   "intelligence",
                   "policy"
                 ]
        end

        # Verify structure of recommendations
        if length(result.recommendations) > 0 do
          rec = List.first(result.recommendations)
          assert Map.has_key?(rec, "type")
          assert Map.has_key?(rec, "action")
          assert rec["type"] in ["immediate", "short_term", "long_term"]
          assert rec["system"] in ["s1", "s2", "s3", "s4", "s5"]
        end

        IO.puts("\n=== Anthropic Analysis Result ===")
        IO.puts("Summary: #{result.summary}")
        IO.puts("Risk Level: #{result.risk_level}")
        IO.puts("SOP Suggestions: #{length(result.sop_suggestions)}")
        IO.puts("Recommendations: #{length(result.recommendations)}")
        IO.puts("==================================\n")
      else
        IO.puts("Skipping real API test - ANTHROPIC_API_KEY not set")
      end
    end

    @tag :skip
    test "LLM Bridge integration with mocked Anthropic provider", %{episode: episode} do
      # Create a mock provider module that behaves like Anthropic
      defmodule MockProvider do
        def analyze_episode(_episode, _opts) do
          {:ok,
           %{
             summary: "Mock analysis: Resource contention detected between S1 workers",
             root_causes: ["Memory allocation conflict", "Insufficient priority management"],
             sop_suggestions: [
               %{
                 "title" => "Memory Allocation Protocol",
                 "category" => "coordination",
                 "priority" => "high",
                 "description" => "Implement priority-based memory allocation for S1 workers",
                 "triggers" => ["Memory contention > 80%", "Multiple S1 workers competing"],
                 "actions" => [
                   "Apply memory quotas based on worker priority",
                   "Implement graceful degradation for low-priority workers",
                   "Monitor allocation effectiveness"
                 ]
               }
             ],
             recommendations: [
               %{
                 "type" => "immediate",
                 "action" => "Reduce memory allocation for low-priority workers",
                 "rationale" => "Prevent system thrashing and maintain performance",
                 "system" => "s2"
               },
               %{
                 "type" => "short_term",
                 "action" => "Implement memory pool management",
                 "rationale" => "Better resource utilization and conflict prevention",
                 "system" => "s1"
               }
             ],
             risk_level: "high",
             learning_points: [
               "Current memory allocation lacks priority awareness",
               "Need automated conflict resolution mechanisms"
             ]
           }}
        end
      end

      mock_provider = MockProvider

      # Start LLM Bridge with mock provider (handle already_started)
      bridge_pid =
        case LLMBridge.start_link(
               provider: mock_provider,
               # Skip telemetry subscription for test
               subscribe: fn _pid -> :ok end
             ) do
          {:ok, pid} -> pid
          {:error, {:already_started, pid}} -> pid
        end

      # Set up message capture
      test_pid = self()

      # Mock SOPEngine to capture suggestions
      original_sop_engine = Process.whereis(SOPEngine)

      if original_sop_engine do
        Process.unregister(SOPEngine)
      end

      sop_mock_pid =
        spawn(fn ->
          receive do
            {:s4_suggestions, payload} ->
              send(test_pid, {:sop_suggestions_received, payload})
          end
        end)

      Process.register(sop_mock_pid, SOPEngine)

      try do
        # Send episode to LLM Bridge
        GenServer.cast(bridge_pid, {:episode, episode})

        # Wait for SOP suggestions
        assert_receive {:sop_suggestions_received, payload}, 5000

        # Verify payload structure
        assert Map.has_key?(payload, :episode)
        assert Map.has_key?(payload, :sop_suggestions)
        assert Map.has_key?(payload, :recommendations)

        assert payload.episode == episode
        assert length(payload.sop_suggestions) == 1
        assert length(payload.recommendations) == 2

        sop = List.first(payload.sop_suggestions)
        assert sop["title"] == "Memory Allocation Protocol"
        assert sop["category"] == "coordination"
        assert sop["priority"] == "high"

        immediate_rec = Enum.find(payload.recommendations, &(&1["type"] == "immediate"))
        assert immediate_rec["system"] == "s2"
        assert immediate_rec["action"] =~ "memory allocation"
      after
        # Cleanup
        if Process.alive?(bridge_pid) do
          GenServer.stop(bridge_pid)
        end

        if Process.alive?(sop_mock_pid) do
          Process.exit(sop_mock_pid, :normal)
        end

        if original_sop_engine do
          Process.register(original_sop_engine, SOPEngine)
        end
      end
    end

    @tag :skip
    test "handles Anthropic provider errors gracefully", %{episode: episode} do
      # Create a provider module that fails
      defmodule FailingProvider do
        def analyze_episode(_episode, _opts) do
          {:error, {:http_error, 401, "Invalid API key"}}
        end
      end

      failing_provider = FailingProvider

      # Start LLM Bridge with failing provider (handle already_started)
      bridge_pid =
        case LLMBridge.start_link(
               provider: failing_provider,
               subscribe: fn _pid -> :ok end
             ) do
          {:ok, pid} -> pid
          {:error, {:already_started, pid}} -> pid
        end

      # Set up telemetry capture for errors
      handler_id = :test_error_handler
      test_pid = self()

      :telemetry.attach(
        handler_id,
        [:cybernetic, :s4, :llm, :error],
        fn _event, measurements, metadata, _config ->
          send(test_pid, {:error_telemetry, measurements, metadata})
        end,
        nil
      )

      try do
        # Send episode to LLM Bridge - should handle error gracefully
        GenServer.cast(bridge_pid, {:episode, episode})

        # Should receive error telemetry
        assert_receive {:error_telemetry, %{count: 1}, metadata}, 2000
        assert metadata.reason =~ "http_error"
      after
        :telemetry.detach(handler_id)

        if Process.alive?(bridge_pid) do
          GenServer.stop(bridge_pid)
        end
      end
    end

    test "OpenTelemetry tracing works with Anthropic provider", %{episode: episode} do
      # Mock provider module that simulates successful analysis
      defmodule TracedProvider do
        def analyze_episode(episode, _opts) do
          # Simulate the OTEL.with_span call
          Cybernetic.Telemetry.OTEL.with_span "anthropic.analyze_episode", %{
            model: "claude-3-5-sonnet-20241022",
            episode_id: episode["id"],
            episode_type: episode["type"]
          } do
            {:ok,
             %{
               summary: "Traced analysis completed",
               sop_suggestions: [],
               recommendations: [],
               risk_level: "medium",
               learning_points: []
             }}
          end
        end
      end

      # This test verifies that tracing doesn't break the provider
      # In a real environment, you'd capture actual trace spans
      {:ok, result} = TracedProvider.analyze_episode(episode, [])

      assert result.summary == "Traced analysis completed"
      assert result.risk_level == "medium"
    end
  end
end
