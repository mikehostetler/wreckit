defmodule Cybernetic.Capabilities.MCPRouterTest do
  use ExUnit.Case

  alias Cybernetic.Capabilities.MCPRouter

  setup do
    {:ok, pid} = start_supervised(MCPRouter)
    {:ok, pid: pid}
  end

  describe "register_server/1" do
    test "registers a valid server" do
      config = %{
        name: "github",
        url: "http://localhost:3000",
        tools: ["create_issue", "list_repos"]
      }

      assert {:ok, server} = MCPRouter.register_server(config)
      assert server.name == "github"
      assert server.url == "http://localhost:3000"
      assert server.tools == ["create_issue", "list_repos"]
    end

    test "registers server with auth" do
      config = %{
        name: "private_api",
        url: "https://api.example.com",
        tools: ["query"],
        auth: %{type: "bearer", token: "secret-token"}
      }

      assert {:ok, server} = MCPRouter.register_server(config)
      # Auth is now stored securely, only reference is in server config
      assert {:ref, _ref_id} = server.auth
    end

    test "registers server with metadata" do
      config = %{
        name: "custom",
        url: "http://localhost:4000",
        tools: ["tool1"],
        metadata: %{"version" => "1.0", "owner" => "team-a"}
      }

      assert {:ok, server} = MCPRouter.register_server(config)
      assert server.metadata["version"] == "1.0"
    end

    test "rejects missing name" do
      config = %{url: "http://localhost", tools: ["t"]}
      assert {:error, {:missing_field, :name}} = MCPRouter.register_server(config)
    end

    test "rejects missing url" do
      config = %{name: "test", tools: ["t"]}
      assert {:error, {:missing_field, :url}} = MCPRouter.register_server(config)
    end

    test "rejects missing tools" do
      config = %{name: "test", url: "http://localhost"}
      assert {:error, {:missing_field, :tools}} = MCPRouter.register_server(config)
    end

    test "rejects invalid url" do
      config = %{name: "test", url: "not-a-url", tools: ["t"]}
      assert {:error, :invalid_url} = MCPRouter.register_server(config)
    end

    test "rejects empty tools list" do
      config = %{name: "test", url: "http://localhost", tools: []}
      assert {:error, :invalid_tools} = MCPRouter.register_server(config)
    end
  end

  describe "unregister_server/1" do
    test "unregisters existing server" do
      config = %{name: "to_remove", url: "http://localhost", tools: ["tool"]}
      {:ok, _} = MCPRouter.register_server(config)

      assert :ok = MCPRouter.unregister_server("to_remove")

      servers = MCPRouter.list_servers()
      assert Enum.find(servers, &(&1.name == "to_remove")) == nil
    end

    test "removes tools from index" do
      config = %{name: "toolserver", url: "http://localhost", tools: ["my_tool"]}
      {:ok, _} = MCPRouter.register_server(config)

      assert {:ok, _} = MCPRouter.get_tool("my_tool")

      MCPRouter.unregister_server("toolserver")

      assert {:error, :not_found} = MCPRouter.get_tool("my_tool")
    end

    test "returns not_found for nonexistent server" do
      assert {:error, :not_found} = MCPRouter.unregister_server("nonexistent")
    end
  end

  describe "list_tools/0" do
    test "lists all registered tools" do
      MCPRouter.register_server(%{
        name: "server1",
        url: "http://localhost:3000",
        tools: ["tool_a", "tool_b"]
      })

      MCPRouter.register_server(%{
        name: "server2",
        url: "http://localhost:3001",
        tools: ["tool_c"]
      })

      tools = MCPRouter.list_tools()
      tool_names = Enum.map(tools, & &1.name)

      assert length(tools) == 3
      assert "tool_a" in tool_names
      assert "tool_b" in tool_names
      assert "tool_c" in tool_names
    end

    test "returns empty list when no servers" do
      assert MCPRouter.list_tools() == []
    end
  end

  describe "list_servers/0" do
    test "lists all registered servers" do
      MCPRouter.register_server(%{name: "s1", url: "http://a.com", tools: ["t"]})
      MCPRouter.register_server(%{name: "s2", url: "http://b.com", tools: ["t"]})

      servers = MCPRouter.list_servers()
      names = Enum.map(servers, & &1.name)

      assert length(servers) == 2
      assert "s1" in names
      assert "s2" in names
    end
  end

  describe "get_tool/1" do
    test "returns tool info" do
      MCPRouter.register_server(%{
        name: "myserver",
        url: "http://localhost:5000",
        tools: ["specific_tool"]
      })

      assert {:ok, tool} = MCPRouter.get_tool("specific_tool")
      assert tool.name == "specific_tool"
      assert tool.server == "myserver"
      assert tool.url == "http://localhost:5000"
    end

    test "returns not_found for unregistered tool" do
      assert {:error, :not_found} = MCPRouter.get_tool("nonexistent_tool")
    end
  end

  describe "call_tool/3" do
    test "returns tool_not_found for unregistered tool" do
      assert {:error, :tool_not_found} = MCPRouter.call_tool("fake_tool", %{})
    end

    # Note: Full call_tool tests would require mocking HTTP responses
    # These test the routing logic
  end

  describe "rate limiting" do
    test "tracks calls per client" do
      MCPRouter.register_server(%{
        name: "rate_test",
        url: "http://localhost:9999",
        tools: ["rate_tool"]
      })

      # Make several calls - they'll fail at HTTP but rate limit is tracked
      for _ <- 1..5 do
        MCPRouter.call_tool("rate_tool", %{}, client_id: "client-1")
      end

      # Rate limit state is internal, but calls are tracked
      # This verifies no crash during rapid calls
    end
  end
end
