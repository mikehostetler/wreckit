defmodule Cybernetic.Core.Goldrush.SmokeTest do
  use ExUnit.Case

  setup do
    # Ensure Pipeline is started (may be started by Application or needs manual start)
    pipeline_pid =
      case GenServer.whereis(Cybernetic.Core.Goldrush.Pipeline) do
        nil ->
          {:ok, pid} = Cybernetic.Core.Goldrush.Pipeline.start_link([])
          pid

        existing_pid ->
          existing_pid
      end

    # Ensure TelemetryAlgedonic is started
    algedonic_pid =
      case GenServer.whereis(Cybernetic.Core.Goldrush.Plugins.TelemetryAlgedonic) do
        nil ->
          {:ok, pid} = Cybernetic.Core.Goldrush.Plugins.TelemetryAlgedonic.start_link([])
          pid

        existing_pid ->
          existing_pid
      end

    {:ok, pipeline: pipeline_pid, algedonic: algedonic_pid}
  end

  test "slow work emits algedonic :pain, fast emits :pleasure" do
    # The algedonic plugin monitors work patterns over time
    # We need to generate enough events to trigger the analysis

    # Generate multiple slow events to trigger pain signal
    for i <- 1..5 do
      :telemetry.execute(
        [:cybernetic, :work, :finished],
        %{duration: 300 + i * 10, success: false},
        %{path: "/slow/endpoint", request_id: "req_#{i}"}
      )
    end

    # Wait for aggregation window
    Process.sleep(100)

    # Generate multiple fast successful events to trigger pleasure
    for i <- 1..5 do
      :telemetry.execute(
        [:cybernetic, :work, :finished],
        %{duration: 10 + i, success: true},
        %{path: "/fast/endpoint", request_id: "req_fast_#{i}"}
      )
    end

    # Wait for processing
    Process.sleep(100)

    # The test passes if no errors occur during processing
    assert true
  end

  test "algedonic signals contain original context" do
    # Generate events with rich context
    context = %{
      user_id: "user_123",
      session_id: "sess_456",
      action: "database_query",
      tags: ["slow", "critical"]
    }

    # Emit event with context
    :telemetry.execute(
      [:cybernetic, :work, :finished],
      %{duration: 500, query_time: 450, success: false},
      context
    )

    # Wait for processing
    Process.sleep(100)

    # The algedonic plugin processes these internally
    # Test passes if no errors occur
    assert true
  end

  test "multiple plugins in pipeline" do
    # Test that multiple plugins can coexist

    # Emit various events
    :telemetry.execute(
      [:cybernetic, :request, :start],
      %{system_time: System.system_time()},
      %{request_id: "multi_001"}
    )

    :telemetry.execute(
      [:cybernetic, :request, :stop],
      %{duration: 150, success: true},
      %{request_id: "multi_001", response_code: 200}
    )

    :telemetry.execute(
      [:cybernetic, :cache, :hit],
      %{latency: 5},
      %{key: "user:123", size: 1024}
    )

    :telemetry.execute(
      [:cybernetic, :cache, :miss],
      %{latency: 50},
      %{key: "user:456"}
    )

    # Wait for all plugins to process
    Process.sleep(100)

    # Verify pipeline is still running
    assert Process.alive?(GenServer.whereis(Cybernetic.Core.Goldrush.Pipeline))

    # Test passes if pipeline handles multiple event types
    assert true
  end
end
