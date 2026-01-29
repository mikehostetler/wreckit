defmodule Cybernetic.Archeology.DynamicCollectorTest do
  use ExUnit.Case, async: false
  alias Cybernetic.Archeology.DynamicCollector

  doctest Cybernetic.Archeology.DynamicCollector

  describe "start_link/1" do
    test "starts the collector with default options" do
      assert {:ok, pid} = DynamicCollector.start_link([])
      assert is_pid(pid)
      assert Process.alive?(pid)
      DynamicCollector.stop()
    end

    test "starts the collector with custom max_traces" do
      assert {:ok, pid} = DynamicCollector.start_link(max_traces: 100)
      assert is_pid(pid)
      DynamicCollector.stop()
    end
  end

  describe "get_traces/0" do
    test "returns empty list when no traces collected" do
      {:ok, _pid} = DynamicCollector.start_link([])

      assert [] = DynamicCollector.get_traces()

      DynamicCollector.stop()
    end

    test "returns traces grouped by trace_id" do
      {:ok, _pid} = DynamicCollector.start_link([])

      # Emit a test telemetry span
      :telemetry.span(
        [:cybernetic, :archeology, :span],
        %{system: :s1, operation: "test_operation"},
        fn ->
          :ok
        end
      )

      # Small delay to allow span to be processed
      Process.sleep(50)

      traces = DynamicCollector.get_traces()
      assert is_list(traces)
      assert length(traces) > 0

      # Check trace structure
      trace = List.first(traces)
      assert Map.has_key?(trace, :trace_id)
      assert Map.has_key?(trace, :spans)
      assert Map.has_key?(trace, :span_count)
      assert is_list(trace.spans)
      assert trace.span_count == length(trace.spans)

      DynamicCollector.stop()
    end
  end

  describe "export_traces/1" do
    test "exports traces to JSON file" do
      {:ok, _pid} = DynamicCollector.start_link([])

      # Emit a test telemetry span
      :telemetry.span(
        [:cybernetic, :archeology, :span],
        %{system: :s2, operation: "test_coordination"},
        fn ->
          :ok
        end
      )

      Process.sleep(50)

      output_file = "test-dynamic-traces.json"

      assert :ok = DynamicCollector.export_traces(output_file)
      assert File.exists?(output_file)

      # Verify JSON structure
      {:ok, json} = File.read(output_file)
      assert {:ok, data} = Jason.decode(json)

      assert Map.has_key?(data, "summary")
      assert Map.has_key?(data, "traces")
      assert is_list(data["traces"])

      # Cleanup
      File.rm!(output_file)
      DynamicCollector.stop()
    end
  end

  describe "stop_and_export/1" do
    test "stops collector and exports traces" do
      {:ok, pid} = DynamicCollector.start_link([])

      # Emit a test telemetry span
      :telemetry.span(
        [:cybernetic, :archeology, :span],
        %{system: :s3, operation: "test_control"},
        fn ->
          :ok
        end
      )

      Process.sleep(50)

      output_file = "test-stop-export.json"

      assert :ok = DynamicCollector.stop_and_export(output_file)
      assert File.exists?(output_file)

      # Verify process is stopped
      refute Process.alive?(pid)

      # Cleanup
      File.rm!(output_file)
    end
  end

  describe "memory management" do
    test "evicts old traces when max_traces exceeded" do
      max_traces = 5
      {:ok, _pid} = DynamicCollector.start_link(max_traces: max_traces)

      # Generate more traces than max_traces
      Enum.each(1..(max_traces + 3), fn i ->
        :telemetry.span(
          [:cybernetic, :archeology, :span],
          %{system: :s1, operation: "operation_#{i}"},
          fn ->
            Process.sleep(1)
            :ok
          end
        )

        Process.sleep(10)
      end)

      # Wait for processing
      Process.sleep(100)

      traces = DynamicCollector.get_traces()

      # Should not exceed max_traces
      assert length(traces) <= max_traces

      DynamicCollector.stop()
    end
  end

  describe "trace ID extraction" do
    test "extracts trace_id from OpenTelemetry context when available" do
      {:ok, _pid} = DynamicCollector.start_link([])

      # Emit span with OTEL context
      :telemetry.span(
        [:cybernetic, :archeology, :span],
        %{system: :s1, operation: "otel_test"},
        fn ->
          # OTEL trace_id should be extracted
          :ok
        end
      )

      Process.sleep(50)

      traces = DynamicCollector.get_traces()
      assert length(traces) > 0

      trace = List.first(traces)
      assert is_binary(trace.trace_id)
      assert String.length(trace.trace_id) == 32  # 16 bytes * 2 (hex)

      DynamicCollector.stop()
    end

    test "generates fallback trace_id when OTEL context unavailable" do
      {:ok, _pid} = DynamicCollector.start_link([])

      # Emit span without OTEL context (in test environment)
      :telemetry.span(
        [:cybernetic, :archeology, :span],
        %{system: :s2, operation: "fallback_test"},
        fn ->
          :ok
        end
      )

      Process.sleep(50)

      traces = DynamicCollector.get_traces()
      assert length(traces) > 0

      trace = List.first(traces)
      assert is_binary(trace.trace_id)

      DynamicCollector.stop()
    end
  end

  describe "span structure" do
    test "spans have correct structure" do
      {:ok, _pid} = DynamicCollector.start_link([])

      :telemetry.span(
        [:cybernetic, :archeology, :span],
        %{system: :s1, operation: "structure_test"},
        fn ->
          :ok
        end
      )

      Process.sleep(50)

      traces = DynamicCollector.get_traces()
      trace = List.first(traces)
      span = List.first(trace.spans)

      # Required fields
      assert Map.has_key?(span, :trace_id)
      assert Map.has_key?(span, :span_id)
      assert Map.has_key?(span, :module)
      assert Map.has_key?(span, :function)
      assert Map.has_key?(span, :arity)
      assert Map.has_key?(span, :timestamp)
      assert Map.has_key?(span, :metadata)

      # Verify types
      assert is_binary(span.trace_id)
      assert is_binary(span.span_id)
      assert is_binary(span.module)
      assert is_binary(span.function)
      assert is_integer(span.arity)
      assert is_integer(span.timestamp)

      DynamicCollector.stop()
    end
  end
end
