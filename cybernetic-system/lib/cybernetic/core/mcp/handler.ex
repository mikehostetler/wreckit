defmodule Cybernetic.Core.MCP.Handler do
  @moduledoc """
  MCP message handler for processing tool invocations and responses.
  Routes MCP protocol messages to appropriate handlers.
  """
  require Logger

  alias Cybernetic.Core.MCP.Hermes.Registry

  @doc """
  Process an incoming MCP message
  """
  def process(%{"type" => "tool_request"} = message) do
    handle_tool_request(message)
  end

  def process(%{"type" => "tool_response"} = message) do
    handle_tool_response(message)
  end

  def process(%{"type" => "discovery"} = message) do
    handle_discovery(message)
  end

  def process(message) do
    Logger.warning("Unknown MCP message type: #{inspect(message)}")
    {:error, :unknown_message_type}
  end

  # Private handlers

  defp handle_tool_request(%{"tool" => tool_name, "params" => params, "id" => request_id} = msg) do
    context = Map.get(msg, "context", %{})

    case Registry.invoke_tool(tool_name, params, context) do
      {:ok, result} ->
        response = %{
          "type" => "tool_response",
          "id" => request_id,
          "tool" => tool_name,
          "result" => result,
          "status" => "success"
        }

        {:ok, response}

      {:error, reason} ->
        response = %{
          "type" => "tool_response",
          "id" => request_id,
          "tool" => tool_name,
          "error" => to_string(reason),
          "status" => "error"
        }

        {:ok, response}
    end
  end

  defp handle_tool_response(%{"id" => request_id, "result" => result}) do
    # Process tool response - could emit telemetry or update state
    :telemetry.execute(
      [:mcp, :tool, :response],
      %{response_time: System.monotonic_time(:millisecond)},
      %{request_id: request_id, result: result}
    )

    {:ok, :processed}
  end

  defp handle_discovery(_message) do
    # Return available tools
    case Registry.list_tools() do
      {:ok, tools} ->
        response = %{
          "type" => "discovery_response",
          "tools" => Enum.map(tools, &tool_to_json/1)
        }

        {:ok, response}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp tool_to_json(tool) do
    %{
      "name" => tool.name,
      "description" => tool.description,
      "parameters" => tool.parameters,
      "capabilities" => tool.capabilities,
      "metadata" => tool.metadata
    }
  end
end
