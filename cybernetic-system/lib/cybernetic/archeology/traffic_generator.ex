defmodule Cybernetic.Archeology.TrafficGenerator do
  @moduledoc """
  Generates synthetic traffic to trigger dynamic tracing spans.

  This module simulates various execution paths to ensure the DynamicCollector
  captures traces from different entry points and code paths.

  ## Traffic Types

  * **HTTP Requests**: Simulates Phoenix endpoint calls
  * **AMQP Messages**: Triggers VSM message handlers (S1-S5)
  * **Bridge Operations**: Pushes/pulls state from VSM Bridge

  ## Usage

      TrafficGenerator.generate_http_requests()
      TrafficGenerator.generate_amqp_messages()

  """
  require Logger

  alias Cybernetic.VSM.System1.MessageHandler, as: S1Handler
  alias Cybernetic.VSM.System2.MessageHandler, as: S2Handler
  alias Cybernetic.VSM.System3.MessageHandler, as: S3Handler
  alias Cybernetic.VSM.System4.MessageHandler, as: S4Handler
  alias Cybernetic.VSM.System5.MessageHandler, as: S5Handler

  @doc """
  Generate synthetic HTTP requests to trigger Phoenix endpoint spans.
  """
  def generate_http_requests do
    # Simulate HTTP requests by calling the telemetry events directly
    # In a real scenario, we would use HTTPoison or Hackney to make actual requests

    # Simulate POST /v1/generate
    :telemetry.execute(
      [:cybernetic, :edge, :endpoint, :stop],
      %{duration: 1500},
      %{
        conn: %{
          route_path: "/v1/generate",
          method: "POST",
          status: 200
        },
        request_path: "/v1/generate"
      }
    )

    # Simulate GET /v1/events
    :telemetry.execute(
      [:cybernetic, :edge, :endpoint, :stop],
      %{duration: 800},
      %{
        conn: %{
          route_path: "/v1/events",
          method: "GET",
          status: 200
        },
        request_path: "/v1/events"
      }
    )

    # Simulate POST /telegram/webhook
    :telemetry.execute(
      [:cybernetic, :edge, :endpoint, :stop],
      %{duration: 1200},
      %{
        conn: %{
          route_path: "/telegram/webhook",
          method: "POST",
          status: 200
        },
        request_path: "/telegram/webhook"
      }
    )

    :ok
  end

  @doc """
  Generate synthetic AMQP messages to trigger VSM message handler spans.
  """
  def generate_amqp_messages do
    # Generate messages for each VSM system
    generate_s1_messages()
    generate_s2_messages()
    generate_s3_messages()
    generate_s4_messages()
    generate_s5_messages()

    :ok
  end

  # System 1: Operational messages
  defp generate_s1_messages do
    operations = [
      "operation",
      "status_update",
      "resource_request",
      "coordination",
      "telemetry",
      "error",
      "success"
    ]

    Enum.each(operations, fn operation ->
      payload = %{
        "operation" => operation,
        "data" => "test_data_#{System.unique_integer([:positive, :monotonic])}",
        "timestamp" => DateTime.utc_now()
      }

      meta = %{
        source: :traffic_generator,
        trace_id: generate_trace_id()
      }

      # Call handler directly (simulating AMQP consumption)
      S1Handler.handle_message(operation, payload, meta)

      # Small delay to prevent overwhelming the system
      Process.sleep(10)
    end)
  end

  # System 2: Coordination messages
  defp generate_s2_messages do
    operations = [
      "coordination",
      "coordinate",
      "coordination_complete",
      "sync",
      "status_request",
      "priority_update"
    ]

    Enum.each(operations, fn operation ->
      payload = %{
        "action" => "coordinate",
        "systems" => ["s1", "s3", "s4"],
        "coordination_id" => "coord_#{System.unique_integer([:positive, :monotonic])}",
        "timestamp" => DateTime.utc_now()
      }

      meta = %{
        source: :traffic_generator,
        trace_id: generate_trace_id()
      }

      S2Handler.handle_message(operation, payload, meta)
      Process.sleep(10)
    end)
  end

  # System 3: Control messages
  defp generate_s3_messages do
    operations = ["control", "monitor", "alert"]

    Enum.each(operations, fn operation ->
      payload = %{
        "control_action" => operation,
        "target" => "system_#{Enum.random([1, 2, 4, 5])}",
        "timestamp" => DateTime.utc_now()
      }

      meta = %{
        source: :traffic_generator,
        trace_id: generate_trace_id()
      }

      S3Handler.handle_message(operation, payload, meta)
      Process.sleep(10)
    end)
  end

  # System 4: Intelligence messages
  defp generate_s4_messages do
    operations = [
      "intelligence",
      "analyze",
      "learn",
      "predict",
      "intelligence_update",
      "algedonic"
    ]

    Enum.each(operations, fn operation ->
      payload = %{
        "analysis" => "pattern_detection",
        "coordination_id" => "coord_#{System.unique_integer([:positive, :monotonic])}",
        "timestamp" => DateTime.utc_now()
      }

      # Add algedonic data for algedonic operation
      payload =
        if operation == "algedonic" do
          Map.put(payload, "type", "algedonic.#{Enum.random(["pain", "pleasure"])}")
        else
          payload
        end

      meta = %{
        source: :traffic_generator,
        trace_id: generate_trace_id()
      }

      S4Handler.handle_message(operation, payload, meta)
      Process.sleep(10)
    end)
  end

  # System 5: Policy messages
  defp generate_s5_messages do
    operations = [
      "policy_update",
      "identity_check",
      "permission_request",
      "compliance_check"
    ]

    Enum.each(operations, fn operation ->
      payload = %{
        "policy_type" => "access_control",
        "resource" => "vsm_state",
        "action" => "read",
        "timestamp" => DateTime.utc_now()
      }

      meta = %{
        source: :traffic_generator,
        trace_id: generate_trace_id()
      }

      S5Handler.handle_message(operation, payload, meta)
      Process.sleep(10)
    end)
  end

  # Helper function to generate trace IDs for testing
  defp generate_trace_id do
    :crypto.strong_rand_bytes(16)
    |> Base.encode16(case: :lower)
  end
end
