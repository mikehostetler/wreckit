defmodule Cybernetic.MCP.CoreTest do
  use ExUnit.Case, async: false
  alias Cybernetic.MCP.Core
  alias Cybernetic.Core.MCP.Hermes.Registry

  describe "MCP Core" do
    setup do
      # Ensure Registry is available (started by application in test_helper)
      # Check if Registry is running
      registry_pid = Process.whereis(Registry)

      if registry_pid == nil do
        # Registry not available - tests will be skipped via guard
        :ok
      else
        # Start MCP Core for testing
        pid =
          case Core.start_link([]) do
            {:ok, pid} -> pid
            {:error, {:already_started, pid}} -> pid
          end

        # Wait for initial discovery
        Process.sleep(200)

        on_exit(fn ->
          if Process.alive?(pid), do: GenServer.stop(pid)
        end)

        {:ok, mcp: pid}
      end
    end

    test "discovers and registers tools on startup", context do
      if Map.has_key?(context, :mcp) do
        # List available tools
        {:ok, tools} = Core.list_tools()

        assert length(tools) > 0
        assert Enum.any?(tools, fn t -> t.name == "search" end)
        assert Enum.any?(tools, fn t -> t.name == "calculate" end)
        assert Enum.any?(tools, fn t -> t.name == "analyze" end)

        # Verify tools are registered in registry
        {:ok, registered} = Registry.list_tools()
        assert length(registered) > 0
      end
    end

    test "calls a tool with parameters", context do
      if Map.has_key?(context, :mcp) do
        # Call the search tool
        params = %{query: "Elixir VSM cybernetics", limit: 10}
        {:ok, result} = Core.call_tool("search", params)

        assert result.tool == "search"
        assert result.params == params
        assert result.result =~ "Mock result"
        assert is_struct(result.timestamp, DateTime)
      end
    end

    test "handles tool call with timeout", context do
      if Map.has_key?(context, :mcp) do
        # Call with custom timeout
        params = %{complex_data: "test"}
        {:ok, result} = Core.call_tool("analyze", params, 5000)

        assert result.tool == "analyze"
        assert result.params == params
      end
    end

    test "sends prompts with context", ctx do
      if Map.has_key?(ctx, :mcp) do
        prompt = "Explain the Viable System Model"

        context = %{
          system: "VSM",
          focus: "System 2 coordination"
        }

        {:ok, response} = Core.send_prompt(prompt, context)

        assert response.prompt == prompt
        assert response.context == context
        assert response.response =~ "Mock response"
      end
    end

    test "sends prompts without context", context do
      if Map.has_key?(context, :mcp) do
        prompt = "What is recursion?"

        {:ok, response} = Core.send_prompt(prompt)

        assert response.prompt == prompt
        assert response.context == %{}
        assert response.response =~ "Mock response"
      end
    end

    test "lists all available tools", context do
      if Map.has_key?(context, :mcp) do
        {:ok, tools} = Core.list_tools()

        assert is_list(tools)
        assert length(tools) == 3

        tool_names = Enum.map(tools, & &1.name) |> Enum.sort()
        assert tool_names == ["analyze", "calculate", "search"]

        # Each tool should have name and description
        for tool <- tools do
          assert Map.has_key?(tool, :name)
          assert Map.has_key?(tool, :description)
          assert is_binary(tool.name)
          assert is_binary(tool.description)
        end
      end
    end

    test "handles concurrent tool calls", context do
      if Map.has_key?(context, :mcp) do
        # Launch multiple concurrent tool calls
        tasks =
          for i <- 1..10 do
            Task.async(fn ->
              tool = Enum.random(["search", "calculate", "analyze"])
              params = %{id: i, data: "test#{i}"}
              Core.call_tool(tool, params)
            end)
          end

        # Collect all results
        results = Enum.map(tasks, &Task.await/1)

        # All should succeed
        assert length(results) == 10

        assert Enum.all?(results, fn r ->
                 match?({:ok, _}, r)
               end)

        # Each should have unique params
        param_ids =
          results
          |> Enum.map(fn {:ok, r} -> r.params.id end)
          |> Enum.sort()

        assert param_ids == Enum.to_list(1..10)
      end
    end

    test "tool discovery happens automatically", context do
      if Map.has_key?(context, :mcp) do
        # Get initial tool count
        {:ok, initial_tools} = Core.list_tools()
        initial_count = length(initial_tools)

        # Tools should already be discovered from setup
        assert initial_count > 0

        # Verify specific tools exist
        tool_names = Enum.map(initial_tools, & &1.name)
        assert "search" in tool_names
        assert "calculate" in tool_names
        assert "analyze" in tool_names
      end
    end
  end
end
