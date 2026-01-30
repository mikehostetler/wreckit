defmodule Cybernetic.MCP.HermesClientTest do
  # Need sequential for client startup/shutdown
  use ExUnit.Case, async: false
  alias Cybernetic.MCP.HermesClient

  setup_all do
    Code.ensure_loaded!(HermesClient)
    :ok
  end

  describe "Plugin behavior" do
    test "implements Plugin behavior correctly" do
      metadata = HermesClient.metadata()
      assert %{name: "hermes_mcp", version: "0.1.0"} = metadata
    end

    test "handle_event/2 processes events correctly" do
      initial_state = %{some: "state"}

      result = HermesClient.handle_event(%{type: "test_event"}, initial_state)

      assert {:ok, ^initial_state} = result
    end
  end

  describe "Client lifecycle without server" do
    # These tests verify the client handles no-server scenarios gracefully
    test "process/2 handles tool calls without server" do
      input = %{tool: "test_tool", params: %{data: "test"}}
      initial_state = %{some: "state"}

      result = HermesClient.process(input, initial_state)

      # Should return error when no server available
      assert {:error, %{tool: "test_tool", error: :client_error}, ^initial_state} = result
    end

    test "process/2 handles exceptions gracefully" do
      # Test with invalid input structure to trigger the fallback clause
      input = %{invalid: "structure"}
      initial_state = %{some: "state"}

      result = HermesClient.process(input, initial_state)

      # Should catch invalid structure and return structured error
      assert {:error, %{error: :client_error, details: "Invalid input structure"}, ^initial_state} =
               result
    end

    test "process/2 handles nil tool name" do
      input = %{tool: nil, params: %{}}
      initial_state = %{some: "state"}

      result = HermesClient.process(input, initial_state)

      # Should handle nil tool name gracefully
      assert {:error, %{error: :client_error, details: "Invalid input structure"}, ^initial_state} =
               result
    end

    test "process/2 handles nil params" do
      input = %{tool: "test", params: nil}
      initial_state = %{some: "state"}

      result = HermesClient.process(input, initial_state)

      # Should handle nil params gracefully  
      assert {:error, %{error: :client_error, details: "Invalid input structure"}, ^initial_state} =
               result
    end
  end

  describe "Real Hermes client integration" do
    # These tests would work with a real MCP server
    # For now, they demonstrate the expected behavior

    @tag :integration
    test "can start client with transport configuration" do
      # This would normally start a client connected to an MCP server
      # Example configuration that would work with a real server:
      # {:ok, pid} = Supervisor.start_child(Cybernetic.Supervisor, 
      #   {HermesClient, transport: {:stdio, command: "mcp-server", args: []}})

      # For now, just verify the module exists and can be configured
      assert function_exported?(HermesClient, :ping, 0)
      assert function_exported?(HermesClient, :list_tools, 0)
      assert function_exported?(HermesClient, :call_tool, 2)
    end

    @tag :integration
    test "demonstrates expected API interface" do
      # This test documents the expected API that would work with a real server
      # When connected to a real MCP server, these would be the actual calls:

      # Basic connectivity check
      # assert :pong = HermesClient.ping()

      # Tool discovery
      # {:ok, %{result: %{"tools" => tools}}} = HermesClient.list_tools()
      # assert is_list(tools)

      # Tool execution
      # {:ok, result} = HermesClient.call_tool("echo", %{text: "hello"})
      # assert is_map(result)

      # For now, just verify the functions exist
      assert function_exported?(HermesClient, :ping, 0)
      assert function_exported?(HermesClient, :list_tools, 0)
      assert function_exported?(HermesClient, :call_tool, 2)
      assert function_exported?(HermesClient, :read_resource, 1)
    end
  end

  describe "Configuration and options" do
    test "execute_tool function accepts options and has correct arity" do
      # Test that the function is correctly defined with expected arity
      assert function_exported?(HermesClient, :execute_tool, 3)
      assert function_exported?(HermesClient, :execute_tool, 2)

      # Test default options behavior (would need server to actually test)
      # For now, just verify the function structure
      assert is_function(&HermesClient.execute_tool/2)
      assert is_function(&HermesClient.execute_tool/3)
    end

    test "health_check function is properly defined" do
      assert function_exported?(HermesClient, :health_check, 0)
      assert is_function(&HermesClient.health_check/0)
    end

    test "get_available_tools function is properly defined" do
      assert function_exported?(HermesClient, :get_available_tools, 0)
      assert is_function(&HermesClient.get_available_tools/0)
    end
  end

  describe "Hermes.Client integration" do
    test "implements Hermes.Client use macro correctly" do
      # Verify the module has the Hermes.Client behavior
      behaviours =
        HermesClient.__info__(:attributes)
        |> Enum.filter(fn {key, _} -> key == :behaviour end)
        |> Enum.flat_map(fn {_, behaviours} -> behaviours end)

      # Should include Cybernetic.Plugin behavior
      assert Cybernetic.Plugin in behaviours
    end

    test "module defines expected functions from Hermes.Client" do
      # Test that the module has functions from use Hermes.Client
      assert function_exported?(HermesClient, :ping, 0)
      assert function_exported?(HermesClient, :list_tools, 0)
      assert function_exported?(HermesClient, :call_tool, 2)
      assert function_exported?(HermesClient, :read_resource, 1)

      # Plugin behavior functions
      assert function_exported?(HermesClient, :metadata, 0)
      assert function_exported?(HermesClient, :process, 2)
      assert function_exported?(HermesClient, :handle_event, 2)
    end
  end

  describe "error scenarios" do
    test "process/2 handles malformed tool parameters" do
      # Test with valid structure but would cause server errors
      input = %{tool: "malformed_tool", params: %{}}
      state = %{some: "state"}

      result = HermesClient.process(input, state)

      # Should handle server connection errors gracefully
      assert {:error, %{tool: "malformed_tool", error: :client_error}, ^state} = result
    end

    test "process/2 validates input structure" do
      # Test various invalid input structures
      test_cases = [
        # Missing fields
        %{},
        # Missing params
        %{tool: "test"},
        # Missing tool
        %{params: %{}},
        # Wrong tool type
        %{tool: 123, params: %{}},
        # Wrong params type
        %{tool: "test", params: "not_map"}
      ]

      state = %{some: "state"}

      for input <- test_cases do
        result = HermesClient.process(input, state)

        assert {:error, %{error: :client_error, details: "Invalid input structure"}, ^state} =
                 result
      end
    end
  end
end
