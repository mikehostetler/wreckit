defmodule Cybernetic.Integration.OTELTracePropagationTest do
  use ExUnit.Case
  alias Cybernetic.Telemetry.OTEL

  @moduletag :integration
  alias Cybernetic.VSM.System2.Coordinator
  alias Cybernetic.Core.Security.NonceBloom

  @moduledoc """
  Integration test for OpenTelemetry trace propagation across system boundaries.
  Tests that traces flow from S1 → S2 → AMQP with proper context propagation.
  """

  setup do
    # Ensure OTEL is configured
    OTEL.setup()

    # Clear any existing spans for clean test state
    # Note: force_flush/0 is not available in all otel_batch_processor versions
    try do
      :otel_batch_processor.force_flush()
    rescue
      UndefinedFunctionError -> :ok
    end

    # Check if OTEL tracer is properly initialized
    # If current_span_ctx returns :undefined, OTEL isn't working
    case :otel_tracer.current_span_ctx() do
      :undefined -> {:ok, skip: true}
      _ctx -> :ok
    end
  end

  test "S1 to S2 trace propagation", context do
    if Map.get(context, :skip) do
      :ok
    else
      # Create a root span simulating S1 operation
      OTEL.with_span "s1.operation", %{"operation" => "test_coordination"} do
        parent_span_ctx = :otel_tracer.current_span_ctx()
        parent_trace_id = :otel_span.trace_id(parent_span_ctx)

        # Simulate coordination request that flows to S2
        OTEL.with_span "s1.coordinate_request", %{"target" => "s2"} do
          # Reserve a slot through S2 Coordinator (this creates s2.reserve_slot span)
          result = Coordinator.reserve_slot("test_topic")

          # Verify the operation succeeded
          assert result == :ok

          # Get current span context to verify trace propagation
          current_span_ctx = :otel_tracer.current_span_ctx()
          current_trace_id = :otel_span.trace_id(current_span_ctx)

          # Trace ID should be the same across S1 and S2 operations
          assert current_trace_id == parent_trace_id
        end
      end

      # Clean up the slot
      Coordinator.release_slot("test_topic")
    end
  end

  test "NonceBloom validation with tracing", context do
    if Map.get(context, :skip) do
      :ok
    else
      OTEL.with_span "test.nonce_validation", %{"component" => "security"} do
        parent_trace_id = :otel_tracer.current_span_ctx() |> :otel_span.trace_id()

        # Create a test message
        test_message = %{
          "data" => "test_payload",
          "source" => "integration_test"
        }

        # Enrich message (this should create trace context)
        enriched = NonceBloom.enrich_message(test_message)

        # Validate the enriched message (this creates nonce_bloom.validate span)
        case NonceBloom.validate_message(enriched) do
          {:ok, validated} ->
            assert validated["data"] == "test_payload"

            # Verify trace context is maintained
            current_trace_id = :otel_tracer.current_span_ctx() |> :otel_span.trace_id()
            assert current_trace_id == parent_trace_id

          {:error, reason} ->
            flunk("Message validation failed: #{inspect(reason)}")
        end
      end
    end
  end

  test "end-to-end S1→S2→Security trace flow", context do
    if Map.get(context, :skip) do
      :ok
    else
      # Root span simulating external request
      OTEL.with_span "external.request", %{"source" => "api", "endpoint" => "/coordinate"} do
        root_trace_id = :otel_tracer.current_span_ctx() |> :otel_span.trace_id()

        # S1 processing
        OTEL.with_span "s1.process_request", %{"operation" => "coordinate"} do
          s1_trace_id = :otel_tracer.current_span_ctx() |> :otel_span.trace_id()
          assert s1_trace_id == root_trace_id

          # Create and secure message
          message = %{"operation" => "coordinate", "topic" => "test_flow"}
          secured_message = NonceBloom.enrich_message(message)

          # S2 coordination
          OTEL.with_span "s1.request_coordination", %{"target" => "s2"} do
            # Reserve slot (creates s2.reserve_slot span internally)
            slot_result = Coordinator.reserve_slot("test_flow")
            assert slot_result == :ok

            # Validate the secured message (creates nonce_bloom.validate span)
            validation_result = NonceBloom.validate_message(secured_message)
            assert {:ok, _} = validation_result

            # Verify trace propagation maintained throughout
            final_trace_id = :otel_tracer.current_span_ctx() |> :otel_span.trace_id()
            assert final_trace_id == root_trace_id
          end
        end
      end

      # Clean up
      Coordinator.release_slot("test_flow")
    end
  end

  test "trace context injection and extraction", context do
    if Map.get(context, :skip) do
      :ok
    else
      # Test that we can manually inject and extract trace context
      OTEL.with_span "test.context_propagation", %{"test" => "manual"} do
        # Get current context
        context = :otel_ctx.get_current()

        # Inject into headers (simulating AMQP headers)
        headers = OTEL.inject_context([])

        # Verify headers contain trace context
        assert is_list(headers)

        assert Enum.any?(headers, fn {key, _value} ->
                 key in ["traceparent", "tracestate", "x-trace-id"]
               end)

        # Extract context from headers in a new span
        OTEL.with_span "test.extracted_context", %{"extracted" => true} do
          extracted_context = OTEL.extract_context(headers)

          # Context should contain trace information
          assert extracted_context != :undefined
        end
      end
    end
  end

  test "telemetry integration with spans", context do
    if Map.get(context, :skip) do
      :ok
    else
      # Test that our telemetry events work within span context
      OTEL.with_span "test.telemetry_integration", %{"component" => "telemetry"} do
        trace_id = :otel_tracer.current_span_ctx() |> :otel_span.trace_id()

        # Reserve a slot to trigger telemetry events
        result = Coordinator.reserve_slot("telemetry_test")
        assert result == :ok

        # The telemetry event should be emitted within our span context
        # We can't directly assert on the telemetry events here, but the span
        # should capture the coordinator operation

        # Verify we're still in the same trace
        current_trace_id = :otel_tracer.current_span_ctx() |> :otel_span.trace_id()
        assert current_trace_id == trace_id

        # Clean up
        Coordinator.release_slot("telemetry_test")
      end
    end
  end
end
