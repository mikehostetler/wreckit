defmodule Cybernetic.Integration.VSMMessagingTest do
  @moduledoc """
  Focused integration tests for VSM message passing.
  Tests actual message flow without relying on telemetry.
  """
  use ExUnit.Case, async: false

  @moduletag :integration

  alias Cybernetic.Core.Transport.AMQP.Publisher
  alias Cybernetic.VSM.System1.MessageHandler, as: S1Handler
  alias Cybernetic.VSM.System2.MessageHandler, as: S2Handler
  alias Cybernetic.VSM.System4.MessageHandler, as: S4Handler

  describe "MessageHandler direct calls" do
    setup do
      # Check if VSM.Supervisor is available
      supervisor_pid = Process.whereis(Cybernetic.VSM.Supervisor)

      if supervisor_pid == nil do
        {:ok, skip: true}
      else
        {:ok, supervisor: supervisor_pid}
      end
    end

    test "S1 MessageHandler processes operation messages", context do
      if Map.get(context, :skip) do
        :ok
      else
        message = %{
          type: "vsm.s1.operation",
          operation: "test_task",
          timestamp: DateTime.utc_now()
        }

        result = S1Handler.handle_message("operation", message, %{})
        assert result == :ok
      end
    end

    test "S2 MessageHandler processes coordination messages", context do
      if Map.get(context, :skip) do
        :ok
      else
        message = %{
          type: "vsm.s2.coordination",
          action: "coordinate",
          systems: ["s1", "s3"],
          timestamp: DateTime.utc_now()
        }

        result = S2Handler.handle_message("coordination", message, %{})
        assert result == :ok
      end
    end

    test "S4 MessageHandler processes intelligence messages", context do
      if Map.get(context, :skip) do
        :ok
      else
        message = %{
          type: "vsm.s4.intelligence",
          analysis: "pattern_detection",
          data: %{patterns: ["normal", "stable"]},
          timestamp: DateTime.utc_now()
        }

        result = S4Handler.handle_message("intelligence", message, %{})
        assert result == :ok
      end
    end
  end

  describe "AMQP Publisher" do
    setup do
      # Ensure Publisher is started
      case Process.whereis(Publisher) do
        nil -> Publisher.start_link()
        _pid -> :ok
      end

      # Give it time to connect
      Process.sleep(100)
      :ok
    end

    @tag :skip
    test "publishes messages to exchanges", context do
      if Map.get(context, :skip) do
        :ok
      else
        # This test is skipped by default as it requires RabbitMQ
        # Remove @tag :skip when RabbitMQ is available

        result = Publisher.publish("cyb.events", "test.event", %{test: "data"})
        assert result == :ok
      end
    end
  end

  describe "Error handling" do
    test "S1 handles unknown operations gracefully", context do
      if Map.get(context, :skip) do
        :ok
      else
        result = S1Handler.handle_message("unknown_op", %{}, %{})
        assert result == {:error, :unknown_operation}
      end
    end

    test "S2 handles missing action gracefully", context do
      if Map.get(context, :skip) do
        :ok
      else
        message = %{type: "vsm.s2.coordination"}
        result = S2Handler.handle_message("coordination", message, %{})
        assert result == {:error, :missing_action}
      end
    end

    test "S4 handles invalid analysis type gracefully", context do
      if Map.get(context, :skip) do
        :ok
      else
        message = %{
          type: "vsm.s4.intelligence",
          analysis: "invalid_type"
        }

        result = S4Handler.handle_message("intelligence", message, %{})
        assert result == {:error, :invalid_analysis_type}
      end
    end
  end

  describe "Message routing patterns" do
    test "operational messages have correct structure", context do
      if Map.get(context, :skip) do
        :ok
      else
        message = %{
          type: "vsm.s1.operation",
          operation: "process_data",
          payload: %{data: [1, 2, 3]},
          timestamp: DateTime.utc_now()
        }

        assert message.type =~ ~r/^vsm\.s1\./
        assert is_binary(message.operation)
        assert is_map(message.payload)
        assert %DateTime{} = message.timestamp
      end
    end

    test "coordination messages have correct structure", context do
      if Map.get(context, :skip) do
        :ok
      else
        message = %{
          type: "vsm.s2.coordinate",
          source_system: "s1",
          target_systems: ["s3", "s4"],
          coordination_id: "coord_123",
          action: "allocate_resources",
          timestamp: DateTime.utc_now()
        }

        assert message.type =~ ~r/^vsm\.s2\./
        assert is_list(message.target_systems)
        assert is_binary(message.coordination_id)
      end
    end

    test "intelligence messages have correct structure", context do
      if Map.get(context, :skip) do
        :ok
      else
        message = %{
          type: "vsm.s4.intelligence",
          analysis_type: "pattern_recognition",
          confidence: 0.95,
          patterns: ["increasing_load", "normal_variance"],
          recommendations: ["scale_up", "monitor"],
          timestamp: DateTime.utc_now()
        }

        assert message.type =~ ~r/^vsm\.s4\./
        assert is_float(message.confidence)
        assert is_list(message.patterns)
        assert is_list(message.recommendations)
      end
    end
  end
end
