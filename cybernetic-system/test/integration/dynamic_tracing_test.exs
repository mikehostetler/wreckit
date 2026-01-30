defmodule Cybernetic.Integration.DynamicTracingTest do
  use ExUnit.Case, async: false

  alias Cybernetic.Archeology.DynamicCollector
  alias Cybernetic.Archeology.TrafficGenerator
  alias Cybernetic.VSM.System1.MessageHandler, as: S1Handler
  alias Cybernetic.VSM.System2.MessageHandler, as: S2Handler
  alias Cybernetic.VSM.System3.MessageHandler, as: S3Handler
  alias Cybernetic.VSM.System4.MessageHandler, as: S4Handler
  alias Cybernetic.VSM.System5.MessageHandler, as: S5Handler

  describe "VSM handler tracing" do
    test "traces System1 message handler" do
      {:ok, _pid} = DynamicCollector.start_link([])

      operation = "operation"
      payload = %{"data" => "test_data"}
      meta = %{source: :test}

      S1Handler.handle_message(operation, payload, meta)

      Process.sleep(50)

      traces = DynamicCollector.get_traces()
      assert length(traces) > 0

      # Find trace with S1 handler
      s1_trace =
        Enum.find(traces, fn trace ->
          Enum.any?(trace.spans, fn span ->
            span.module == "Elixir.Cybernetic.VSM.System1.MessageHandler" and
              span.function == "handle_message"
          end)
        end)

      assert s1_trace != nil
      assert s1_trace.span_count > 0

      DynamicCollector.stop()
    end

    test "traces all VSM system handlers" do
      {:ok, _pid} = DynamicCollector.start_link([])

      # Generate messages for all systems
      generate_s1_message()
      generate_s2_message()
      generate_s3_message()
      generate_s4_message()
      generate_s5_message()

      Process.sleep(100)

      traces = DynamicCollector.get_traces()
      assert length(traces) > 0

      # Check that all systems are represented
      modules_found =
        traces
        |> Enum.flat_map(fn trace -> trace.spans end)
        |> Enum.map(fn span -> span.module end)
        |> Enum.uniq()

      assert "Elixir.Cybernetic.VSM.System1.MessageHandler" in modules_found
      assert "Elixir.Cybernetic.VSM.System2.MessageHandler" in modules_found
      assert "Elixir.Cybernetic.VSM.System3.MessageHandler" in modules_found
      assert "Elixir.Cybernetic.VSM.System4.MessageHandler" in modules_found
      assert "Elixir.Cybernetic.VSM.System5.MessageHandler" in modules_found

      DynamicCollector.stop()
    end
  end

  describe "span grouping" do
    test "groups spans by trace_id" do
      {:ok, _pid} = DynamicCollector.start_link([])

      # Emit multiple spans in same trace context
      trace_id = :crypto.strong_rand_bytes(16) |> Base.encode16(case: :lower)

      :telemetry.span(
        [:cybernetic, :archeology, :span],
        %{system: :s1, operation: "op1", trace_id: trace_id},
        fn ->
          :ok
        end
      )

      Process.sleep(10)

      :telemetry.span(
        [:cybernetic, :archeology, :span],
        %{system: :s2, operation: "op2", trace_id: trace_id},
        fn ->
          :ok
        end
      )

      Process.sleep(50)

      traces = DynamicCollector.get_traces()

      # Find the trace with our trace_id
      trace = Enum.find(traces, fn t -> t.trace_id == trace_id end)

      assert trace != nil
      assert trace.span_count >= 2
      assert length(trace.spans) == trace.span_count

      # Verify all spans in the trace have the same trace_id
      assert Enum.all?(trace.spans, fn span -> span.trace_id == trace_id end)

      DynamicCollector.stop()
    end
  end

  describe "trace correlation across operations" do
    test "captures execution flow from handler to handler" do
      {:ok, _pid} = DynamicCollector.start_link([])

      # S1 -> S2 -> S4 flow (coordination)
      generate_s1_message()

      Process.sleep(100)

      traces = DynamicCollector.get_traces()

      # Should have spans from multiple systems
      multi_system_traces =
        Enum.filter(traces, fn trace ->
          systems =
            trace.spans
            |> Enum.map(fn span -> Map.get(span.metadata, :system) end)
            |> Enum.uniq()

          length(systems) > 1
        end)

      # At least one trace should span multiple systems
      assert length(multi_system_traces) > 0

      DynamicCollector.stop()
    end
  end

  describe "traffic generator" do
    test "generates HTTP telemetry events" do
      {:ok, _pid} = DynamicCollector.start_link([])

      TrafficGenerator.generate_http_requests()

      Process.sleep(50)

      traces = DynamicCollector.get_traces()

      # Should have traces from HTTP events
      http_traces =
        Enum.filter(traces, fn trace ->
          Enum.any?(trace.spans, fn span ->
            Map.get(span.metadata, :event_type) == :phoenix_request
          end)
        end)

      assert length(http_traces) > 0

      DynamicCollector.stop()
    end

    test "generates AMQP telemetry events" do
      {:ok, _pid} = DynamicCollector.start_link([])

      TrafficGenerator.generate_amqp_messages()

      Process.sleep(200)

      traces = DynamicCollector.get_traces()

      # Should have traces from all VSM systems
      assert length(traces) > 0

      # Check for multiple operation types
      operations =
        traces
        |> Enum.flat_map(fn trace -> trace.spans end)
        |> Enum.map(fn span -> Map.get(span.metadata, :operation) end)
        |> Enum.reject(&is_nil/1)
        |> Enum.uniq()

      # Should have various operations from VSM handlers
      assert length(operations) > 5

      DynamicCollector.stop()
    end
  end

  describe "JSON output format" do
    test "outputs JSON compatible with static analysis format" do
      {:ok, _pid} = DynamicCollector.start_link([])

      # Generate some traces
      TrafficGenerator.generate_amqp_messages()

      Process.sleep(100)

      output_file = "test-format-compat.json"
      assert :ok = DynamicCollector.export_traces(output_file)

      # Read and verify format
      {:ok, json} = File.read(output_file)
      assert {:ok, data} = Jason.decode(json)

      # Verify summary structure
      assert Map.has_key?(data, "summary")
      summary = data["summary"]
      assert Map.has_key?(summary, "trace_count")
      assert Map.has_key?(summary, "total_spans")
      assert Map.has_key?(summary, "entry_points_covered")

      # Verify traces structure
      assert Map.has_key?(data, "traces")
      traces = data["traces"]
      assert is_list(traces)

      if length(traces) > 0 do
        trace = List.first(traces)

        # Trace fields
        assert Map.has_key?(trace, "trace_id")
        assert Map.has_key?(trace, "spans")
        assert Map.has_key?(trace, "span_count")

        # Span fields
        if Map.has_key?(trace, "entry_point") do
          entry_point = trace["entry_point"]
          assert Map.has_key?(entry_point, "type")
          assert Map.has_key?(entry_point, "module")
          assert Map.has_key?(entry_point, "function")
        end

        # Check individual span structure
        if length(trace["spans"]) > 0 do
          span = List.first(trace["spans"])

          assert Map.has_key?(span, "trace_id")
          assert Map.has_key?(span, "span_id")
          assert Map.has_key?(span, "module")
          assert Map.has_key?(span, "function")
          assert Map.has_key?(span, "arity")
          assert Map.has_key?(span, "timestamp")
          assert Map.has_key?(span, "metadata")
        end
      end

      # Cleanup
      File.rm!(output_file)
      DynamicCollector.stop()
    end
  end

  # Helper functions

  defp generate_s1_message do
    S1Handler.handle_message("operation", %{"data" => "test"}, %{})
  end

  defp generate_s2_message do
    S2Handler.handle_message("coordinate", %{"action" => "test"}, %{})
  end

  defp generate_s3_message do
    S3Handler.handle_message("control", %{"target" => "s1"}, %{})
  end

  defp generate_s4_message do
    S4Handler.handle_message("intelligence", %{"analysis" => "test"}, %{})
  end

  defp generate_s5_message do
    S5Handler.handle_message("policy_update", %{"policy" => "test"}, %{})
  end
end
