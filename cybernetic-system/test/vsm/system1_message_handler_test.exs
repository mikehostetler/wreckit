defmodule Cybernetic.VSM.System1.MessageHandlerTest do
  @moduledoc """
  Unit tests for System1 MessageHandler.

  Note: These tests require the full VSM infrastructure (AMQP publisher) to be running,
  so they are tagged as :integration and excluded from minimal test mode.
  """
  use ExUnit.Case, async: true
  alias Cybernetic.VSM.System1.MessageHandler

  # Tag as integration since it depends on AMQP Publisher
  @moduletag :integration

  describe "handle_message/3" do
    test "handles operation messages" do
      payload = %{
        type: "vsm.s1.operation",
        operation: "test_op",
        data: "test_data"
      }

      result = MessageHandler.handle_message("operation", payload, %{})
      assert result == :ok
    end

    test "handles status_update messages" do
      payload = %{
        status: "active",
        timestamp: DateTime.utc_now()
      }

      result =
        MessageHandler.handle_message("status_update", payload, %{source_node: "test_node"})

      assert result == :ok
    end

    test "handles resource_request messages" do
      payload = %{
        "type" => "cpu",
        "amount" => 2
      }

      result = MessageHandler.handle_message("resource_request", payload, %{})
      assert result == :ok
    end

    test "handles coordination messages with start action" do
      payload = %{
        "action" => "start",
        "task_id" => "task_123"
      }

      result = MessageHandler.handle_message("coordination", payload, %{})
      assert result == :ok
    end

    test "handles coordination messages with stop action" do
      payload = %{
        "action" => "stop",
        "task_id" => "task_123"
      }

      result = MessageHandler.handle_message("coordination", payload, %{})
      assert result == :ok
    end

    test "handles coordination messages with update action" do
      payload = %{
        "action" => "update",
        "task_id" => "task_123"
      }

      result = MessageHandler.handle_message("coordination", payload, %{})
      assert result == :ok
    end

    test "handles telemetry messages" do
      payload = %{
        metric: "cpu_usage",
        value: 45.2
      }

      result =
        MessageHandler.handle_message("telemetry", payload, %{
          timestamp: :os.system_time(:millisecond)
        })

      assert result == :ok
    end

    test "handles default messages" do
      payload = %{
        some: "data"
      }

      result = MessageHandler.handle_message("default", payload, %{})
      assert result == :ok
    end

    test "returns error for unknown operations" do
      payload = %{test: "data"}

      result = MessageHandler.handle_message("unknown_op", payload, %{})
      assert result == {:error, :unknown_operation}
    end

    test "handles errors gracefully" do
      # This should trigger a rescue clause if we pass nil
      result = MessageHandler.handle_message(nil, nil, nil)
      assert {:error, _} = result
    end
  end

  describe "resource allocation" do
    test "allocates cpu resources" do
      payload = %{
        "type" => "cpu",
        "amount" => 4
      }

      result = MessageHandler.handle_message("resource_request", payload, %{})
      assert result == :ok
    end

    test "allocates memory resources" do
      payload = %{
        "type" => "memory",
        "amount" => 1024
      }

      result = MessageHandler.handle_message("resource_request", payload, %{})
      assert result == :ok
    end

    test "allocates network resources" do
      payload = %{
        "type" => "network",
        "amount" => 100
      }

      result = MessageHandler.handle_message("resource_request", payload, %{})
      assert result == :ok
    end

    test "returns error for unsupported resource type" do
      payload = %{
        "type" => "gpu",
        "amount" => 1
      }

      result = MessageHandler.handle_message("resource_request", payload, %{})
      assert result == {:error, :unsupported_resource_type}
    end
  end
end
