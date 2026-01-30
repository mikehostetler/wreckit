defmodule Cybernetic.VSM.System4.LLM.PipelineGoldenTest do
  @moduledoc """
  Golden tests to ensure parity between legacy HTTPoison providers and req_llm pipeline.

  These tests verify that both stacks produce compatible results for the same inputs.
  """

  use ExUnit.Case, async: false

  alias Cybernetic.VSM.System4.Episode
  alias Cybernetic.VSM.System4.Router

  @moduletag :golden_test
  @moduletag :integration

  # Skip these tests if API keys are not configured
  @moduletag :skip_if_no_api_keys

  setup do
    # Check if RateLimiter is available (required for Router)
    rate_limiter_pid = Process.whereis(Cybernetic.VSM.System3.RateLimiter)

    if rate_limiter_pid == nil do
      {:ok, skip: true}
    else
      :ok
    end
  end

  @test_episodes [
    %Episode{
      id: "test_1",
      kind: :policy_review,
      priority: :normal,
      source_system: :test,
      created_at: DateTime.utc_now(),
      data: "Review the security policy for database access controls"
    },
    %Episode{
      id: "test_2",
      kind: :code_gen,
      priority: :high,
      source_system: :test,
      created_at: DateTime.utc_now(),
      data: "Generate a function to validate email addresses"
    },
    %Episode{
      id: "test_3",
      kind: :root_cause,
      priority: :critical,
      source_system: :test,
      created_at: DateTime.utc_now(),
      data: "System experiencing high latency during peak hours"
    },
    %Episode{
      id: "test_4",
      kind: :anomaly_detection,
      priority: :low,
      source_system: :test,
      created_at: DateTime.utc_now(),
      data: "Traffic patterns: [100, 102, 98, 250, 101, 99]"
    }
  ]

  describe "response structure parity" do
    @tag :skip
    test "both stacks return consistent response structure", context do
      if Map.get(context, :skip) do
        :ok
      else
        # Test with a simple episode
        episode = %Episode{
          id: "structure_test",
          kind: :classification,
          priority: :normal,
          source_system: :test,
          created_at: DateTime.utc_now(),
          data: "Classify this text: 'The product arrived damaged'"
        }

        # Get result from legacy stack
        Application.put_env(:cybernetic, :llm_stack, stack: :legacy_httpoison)
        {:ok, legacy_result, _info} = Router.route(episode, max_tokens: 50)

        # Get result from req_llm pipeline
        Application.put_env(:cybernetic, :llm_stack, stack: :req_llm_pipeline)
        {:ok, pipeline_result, _info} = Router.route(episode, max_tokens: 50)

        # Verify structure compatibility
        assert_response_structure(legacy_result, pipeline_result)
      end
    end

    # Skip by default to avoid API costs
    @tag :skip
    test "all episode kinds produce valid responses" do
      for episode <- @test_episodes do
        # Test legacy stack
        Application.put_env(:cybernetic, :llm_stack, stack: :legacy_httpoison)
        assert {:ok, legacy_result, info} = Router.route(episode, max_tokens: 100)
        assert is_binary(legacy_result[:text]) or is_binary(legacy_result.text)
        assert info[:provider] in [:anthropic, :openai, :together, :ollama]

        # Test req_llm pipeline
        Application.put_env(:cybernetic, :llm_stack, stack: :req_llm_pipeline)
        assert {:ok, pipeline_result, info} = Router.route(episode, max_tokens: 100)
        assert is_binary(pipeline_result[:text]) or is_binary(pipeline_result.text)
        assert info[:provider] in [:anthropic, :openai, :together, :ollama]
      end
    end
  end

  describe "telemetry events parity" do
    @tag :capture_log
    @tag :skip
    test "both stacks emit equivalent telemetry events", context do
      if Map.get(context, :skip) do
        :ok
      else
        episode = List.first(@test_episodes)

        # Capture telemetry for legacy stack
        legacy_events =
          capture_telemetry(fn ->
            Application.put_env(:cybernetic, :llm_stack, stack: :legacy_httpoison)
            Router.route(episode, max_tokens: 50)
          end)

        # Capture telemetry for req_llm pipeline
        pipeline_events =
          capture_telemetry(fn ->
            Application.put_env(:cybernetic, :llm_stack, stack: :req_llm_pipeline)
            Router.route(episode, max_tokens: 50)
          end)

        # Verify key telemetry events are present in both
        assert_telemetry_parity(legacy_events, pipeline_events)
      end
    end
  end

  describe "error handling parity" do
    @tag :skip
    test "both stacks handle missing API keys consistently", context do
      if Map.get(context, :skip) do
        :ok
      else
        episode = List.first(@test_episodes)

        # Remove API keys temporarily
        original_anthropic_key = System.get_env("ANTHROPIC_API_KEY")
        System.delete_env("ANTHROPIC_API_KEY")

        # Test legacy stack
        Application.put_env(:cybernetic, :llm_stack, stack: :legacy_httpoison)
        legacy_result = Router.route(episode, override_chain: [:anthropic])

        # Test req_llm pipeline
        Application.put_env(:cybernetic, :llm_stack, stack: :req_llm_pipeline)
        pipeline_result = Router.route(episode, override_chain: [:anthropic])

        # Both should fail with authentication errors
        assert {:error, _} = legacy_result
        assert {:error, _} = pipeline_result

        # Restore API key
        if original_anthropic_key do
          System.put_env("ANTHROPIC_API_KEY", original_anthropic_key)
        end
      end
    end

    @tag :skip
    test "both stacks handle timeouts consistently", context do
      if Map.get(context, :skip) do
        :ok
      else
        episode = List.first(@test_episodes)

        # Use very short timeout to force failure
        opts = [timeout: 1, max_tokens: 50]

        # Test legacy stack
        Application.put_env(:cybernetic, :llm_stack, stack: :legacy_httpoison)
        legacy_result = Router.route(episode, opts)

        # Test req_llm pipeline
        Application.put_env(:cybernetic, :llm_stack, stack: :req_llm_pipeline)
        pipeline_result = Router.route(episode, opts)

        # Both should timeout
        case {legacy_result, pipeline_result} do
          {{:error, :timeout}, {:error, :timeout}} -> :ok
          # Any error is acceptable for timeout test
          {{:error, _}, {:error, _}} -> :ok
          _ -> flunk("Expected both stacks to fail with timeout")
        end
      end
    end
  end

  # Helper functions

  defp assert_response_structure(legacy, pipeline) do
    # Check that both have required fields
    assert Map.has_key?(legacy, :text) or Map.has_key?(legacy, "text")
    assert Map.has_key?(pipeline, :text) or Map.has_key?(pipeline, "text")

    # Check token counts if present
    if Map.has_key?(legacy, :tokens) do
      assert Map.has_key?(pipeline, :tokens)
      assert is_map(legacy.tokens)
      assert is_map(pipeline.tokens)
    end

    # Check usage if present
    if Map.has_key?(legacy, :usage) do
      assert Map.has_key?(pipeline, :usage)
      assert is_map(legacy.usage)
      assert is_map(pipeline.usage)
    end
  end

  defp capture_telemetry(fun) do
    # Attach temporary telemetry handler
    handler_id = "test_handler_#{:rand.uniform(10000)}"

    events = [
      [:cybernetic, :s4, :request],
      [:cybernetic, :s4, :response],
      [:cyb, :s4, :route]
    ]

    captured = :ets.new(:captured_events, [:public, :bag])

    :telemetry.attach_many(
      handler_id,
      events,
      fn event, measurements, metadata, config ->
        :ets.insert(config.table, {event, measurements, metadata})
      end,
      %{table: captured}
    )

    # Run the function
    fun.()

    # Detach handler and return captured events
    :telemetry.detach(handler_id)
    events = :ets.tab2list(captured)
    :ets.delete(captured)

    events
  end

  defp assert_telemetry_parity(legacy_events, pipeline_events) do
    # Extract event names
    legacy_names = Enum.map(legacy_events, fn {name, _, _} -> name end) |> MapSet.new()
    pipeline_names = Enum.map(pipeline_events, fn {name, _, _} -> name end) |> MapSet.new()

    # Key events that should be present in both
    required_events = [
      [:cyb, :s4, :route],
      [:cybernetic, :s4, :request]
    ]

    for event <- required_events do
      assert MapSet.member?(legacy_names, event) or
               MapSet.member?(legacy_names, [:cybernetic | tl(event)]),
             "Legacy stack missing event: #{inspect(event)}"

      assert MapSet.member?(pipeline_names, event) or
               MapSet.member?(pipeline_names, [:cybernetic | tl(event)]),
             "Pipeline stack missing event: #{inspect(event)}"
    end
  end
end
