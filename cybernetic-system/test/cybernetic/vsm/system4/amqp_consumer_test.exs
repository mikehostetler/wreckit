defmodule Cybernetic.VSM.System4.AMQPConsumerTest do
  use ExUnit.Case
  alias Cybernetic.VSM.System4.AMQPConsumer

  describe "extract_operation/2" do
    test "maps s4.reason routing key to intelligence operation" do
      assert AMQPConsumer.extract_operation("s4.reason", %{}) == "intelligence"
    end

    test "maps s4.analyze routing key to analyze operation" do
      assert AMQPConsumer.extract_operation("s4.analyze", %{}) == "analyze"
    end

    test "maps s4.learn routing key to learn operation" do
      assert AMQPConsumer.extract_operation("s4.learn", %{}) == "learn"
    end

    test "maps s4.predict routing key to predict operation" do
      assert AMQPConsumer.extract_operation("s4.predict", %{}) == "predict"
    end

    test "falls back to operation field in message payload for unknown routing keys" do
      message = %{"operation" => "custom_op"}
      assert AMQPConsumer.extract_operation("s4.unknown", message) == "custom_op"
    end

    test "defaults to intelligence when routing key unknown and no operation in payload" do
      assert AMQPConsumer.extract_operation("unknown.routing", %{}) == "intelligence"
    end
  end

  describe "format_result/1" do
    test "handles :ok atom" do
      result = AMQPConsumer.format_result(:ok)
      assert result == %{"result" => "Request processed successfully"}
    end

    test "handles {:ok, result} tuple with analysis_complete type" do
      analysis_result = %{
        "type" => "vsm.s4.analysis_complete",
        "analysis_type" => "health_check",
        "health_score" => 0.95,
        "recommendations" => ["Increase monitoring", "Optimize resources"]
      }

      result = AMQPConsumer.format_result({:ok, analysis_result})

      assert Map.has_key?(result, "result")
      assert String.contains?(result["result"], "Analysis: health_check")
      assert String.contains?(result["result"], "Health Score: 95.0%")
      assert String.contains?(result["result"], "Increase monitoring")
    end

    test "handles {:ok, result} tuple with unknown type" do
      unknown_result = %{"type" => "unknown.type", "data" => "test"}

      result = AMQPConsumer.format_result({:ok, unknown_result})

      assert Map.has_key?(result, "result")
      assert String.contains?(result["result"], "unknown.type")
    end

    test "handles {:error, reason} tuple" do
      result = AMQPConsumer.format_result({:error, :timeout})

      assert result == %{"error" => "Processing failed: :timeout"}
    end

    test "handles {:error, reason} tuple with string reason" do
      result = AMQPConsumer.format_result({:error, "Connection failed"})

      assert result == %{"error" => "Processing failed: \"Connection failed\""}
    end

    test "handles any other result with inspect/1" do
      result = AMQPConsumer.format_result(:some_atom)

      assert Map.has_key?(result, "result")
      assert String.contains?(result["result"], ":some_atom")
    end

    test "handles nil result" do
      result = AMQPConsumer.format_result(nil)

      assert Map.has_key?(result, "result")
      assert String.contains?(result["result"], "nil")
    end
  end
end
