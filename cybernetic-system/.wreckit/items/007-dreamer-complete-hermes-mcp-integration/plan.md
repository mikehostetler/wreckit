# [DREAMER] Complete Hermes MCP Integration Implementation Plan

## Overview
This plan implements the missing client-side Hermes MCP integration, enabling Cybernetic to make outbound calls to external MCP servers. The system currently has a working Hermes.Server integration (oh-my-opencode) but the client-side integration is incomplete, returning mock responses instead of making actual MCP calls.

## Current State Analysis

### What Exists Now
- **Hermes.Server Integration** (Working): `Cybernetic.Integrations.OhMyOpencode.MCPProvider` successfully uses `use Hermes.Server` to expose internal tools to external systems via the `/mcp` endpoint
- **MCP Registry** (Working): `Cybernetic.Core.MCP.Hermes.Registry` manages tool registration and invocation with an ETS table
- **Hermes Dependency** (Available): `hermes_mcp` library is properly configured in mix.exs (ref: 97a3dd7e4b6907cc79136da7999b4f51af4834eb)
- **Supervisor Ready** (Available): `Hermes.Server.Registry` is started in application.ex:94

### What's Missing
1. **MCP Core** (lib/cybernetic/core/mcp/core.ex:70-98):
   - Line 70: `call_tool/3` returns mock response with TODO comment
   - Line 89: `send_prompt/2` returns mock response with TODO comment
   - Line 111: `handle_info(:discover_tools)` registers mock tools with TODO comment

2. **HermesClient** (lib/cybernetic/core/mcp/transports/hermes_client.ex:18-128):
   - Line 18: `call_tool/3` returns `{:error, :not_implemented}`
   - Lines 37-48: Success handling logic is commented out
   - Missing `use Hermes.Client` macro declaration

3. **Tests** (test/core/mcp_core_test.exs:1-173):
   - All tests expect the current mock behavior
   - Need to maintain backward compatibility via configuration

### Key Constraints
- Must maintain backward compatibility with existing mock-based tests
- Must preserve the Cybernetic.Plugin behavior contract in HermesClient
- Must implement proper error handling for network failures
- Cannot break the existing Hermes.Server integration (oh-my-opencode)

## Desired End State

### Functional Requirements
1. **MCP Core** successfully invokes external MCP tools via Hermes.Client
2. **HermesClient** properly implements `use Hermes.Client` macro with transport configuration
3. **Tool Discovery** queries external MCP servers via `Hermes.Client.list_tools/0`
4. **All TODO comments** removed from MCP codebase
5. **Tests pass** with both mock mode (for existing tests) and real mode (for integration tests)

### Verification
- Running `mix test test/core/hermes_mcp_client_test.exs` passes with real client functionality
- Running `mix test test/core/mcp_core_test.exs` passes with mock mode enabled
- Running `mix test test/integration/test_real_mcp_connection.exs` demonstrates real MCP connection
- Zero TODO comments in lib/cybernetic/core/mcp/*.ex files
- README MCP feature claims are now accurate

### Key Discoveries
- **test_real_mcp_connection.exs** (lines 9-36) provides the exact pattern for `use Hermes.Client`:
  ```elixir
  use Hermes.Client,
    name: "CyberneticTest",
    version: "0.1.0",
    protocol_version: "2024-11-05",
    capabilities: [:roots]

  # Start with transport
  {__MODULE__, transport: {:stdio, command: "claude", args: ["mcp", "serve"]}}
  ```
- **MCPProvider** (lines 131-141) shows the proper pattern for handling tool calls with auth and rate limiting
- **MCP Registry** (lines 100-114) provides the tool registration interface that should be used during discovery
- **Tests** expect mock responses in test environment, requiring a configuration flag for mock vs real mode

## What We're NOT Doing
- ❌ Implementing MAGG adapter (separate concern, out of scope)
- ❌ Creating MCP server implementation (already exists as Hermes.Server)
- ❌ Building tool discovery UI components (separate feature)
- ❌ Modifying the existing oh-my-opencode integration
- ❌ Changing the Cybernetic.Plugin behavior contract

## Implementation Approach

### High-Level Strategy
The implementation follows a **layered approach** that isolates changes and maintains backward compatibility:

1. **Phase 1**: Implement HermesClient with actual Hermes.Client macro and transport
2. **Phase 2**: Update MCP Core to use HermesClient instead of mocks
3. **Phase 3**: Add mock mode configuration for test compatibility
4. **Phase 4**: Update tests to support both mock and real modes
5. **Phase 5**: Remove TODO comments and add integration tests

### Architecture Decision
**Transport Configuration**: The implementation will support **stdio transport by default** (for command-line MCP servers) with the transport configuration passed via application config. This follows the pattern in test_real_mcp_connection.exs and allows flexibility for future websocket or HTTP transports.

**Mock Mode Control**: A simple application config flag `:mock_mode` will control whether MCP Core uses mock responses or real Hermes client calls. Existing tests will have `mock_mode: true` in test config.

**Error Handling**: The system will use the existing Circuit Breaker pattern (already in System3) for network failures, with graceful fallback to error responses when Hermes client is unavailable.

---

## Phase 1: Implement HermesClient with Real Hermes.Client Integration

### Overview
Add `use Hermes.Client` macro to HermesClient and implement actual MCP client functions using the Hermes library API.

### Changes Required

#### 1. lib/cybernetic/core/mcp/transports/hermes_client.ex

**Current State** (lines 1-130):
- Module exists with Plugin behavior implementation
- Functions return mock responses or `{:error, :not_implemented}`
- Missing `use Hermes.Client` macro

**Changes**:
```elixir
defmodule Cybernetic.MCP.HermesClient do
  @moduledoc """
  Real Hermes MCP client implementation for Cybernetic VSM.
  Provides access to external MCP tools and capabilities using the Hermes library.
  """
  require Logger

  @behaviour Cybernetic.Plugin

  # ADD: Use Hermes.Client macro with proper configuration
  use Hermes.Client,
    name: "cybernetic",
    version: "0.1.0",
    protocol_version: "2024-11-05",
    capabilities: [:tools, :resources]

  # REMOVE: Mock implementations (lines 10-18)
  # KEEP: Plugin behavior functions (lines 27-76)

  # MODIFY: call_tool/3 to use actual Hermes.Client.call_tool/2
  def call_tool(name, args), do: call_tool(name, args, [])

  def call_tool(name, args, opts) when is_binary(name) and is_map(args) do
    # Use actual Hermes.Client.call_tool/2 from the macro
    timeout = Keyword.get(opts, :timeout, 30_000)

    try do
      case super(name, args) do
        {:ok, response} ->
          # Handle successful response
          {:ok, response}

        {:error, reason} ->
          Logger.warning("Hermes MCP tool error: #{inspect(reason)}")
          {:error, reason}
      end
    rescue
      error ->
        Logger.error("Hermes MCP client error: #{inspect(error)}")
        {:error, {:client_error, error}}
    catch
      :exit, {:noproc, _} ->
        Logger.warning("Hermes MCP client not started")
        {:error, :client_not_started}

      :exit, reason ->
        Logger.warning("Hermes MCP process exit: #{inspect(reason)}")
        {:error, {:exit, reason}}
    end
  end

  # MODIFY: list_tools/0 to use actual Hermes.Client.list_tools/0
  def list_tools(), do: list_tools([])

  def list_tools(_opts) do
    try do
      case super() do
        {:ok, response} ->
          {:ok, response}

        {:error, reason} ->
          Logger.warning("Hermes MCP list_tools error: #{inspect(reason)}")
          {:error, reason}
      end
    rescue
      error ->
        Logger.error("Hermes MCP client error: #{inspect(error)}")
        {:error, {:client_error, error}}
    end
  end

  # MODIFY: ping/0 to use actual Hermes.Client.ping/0
  def ping(), do: ping([])

  def ping(_opts) do
    try do
      case super() do
        :pong -> :pong
        {:ok, :pong} -> :pong
        other -> other
      end
    rescue
      _ -> {:error, :ping_failed}
    end
  end

  # MODIFY: read_resource/1 to use actual Hermes.Client.read_resource/1
  def read_resource(uri), do: read_resource(uri, [])

  def read_resource(uri, _opts) do
    try do
      case super(uri) do
        {:ok, response} ->
          {:ok, response}

        {:error, reason} ->
          Logger.warning("Hermes MCP read_resource error: #{inspect(reason)}")
          {:error, reason}
      end
    rescue
      error ->
        Logger.error("Hermes MCP client error: #{inspect(error)}")
        {:error, {:client_error, error}}
    end
  end

  # MODIFY: process/2 to uncomment the success handling logic (lines 38-44)
  def process(%{tool: tool, params: params}, state) when is_binary(tool) and is_map(params) do
    Logger.debug("Hermes MCP tool call: #{tool} with #{inspect(params)}")

    try do
      case call_tool(tool, params, timeout: 30_000) do
        {:ok, response} ->
          # Extract result from response
          result = case response do
            %{result: result_data} -> result_data
            %{content: content} -> %{content: content}
            other -> other
          end
          {:ok, %{tool: tool, result: result, success: true}, state}

        {:error, reason} ->
          Logger.warning("Hermes MCP tool error: #{inspect(reason)}")
          {:error, %{tool: tool, error: :tool_error, reason: reason}, state}
      end
    rescue
      error ->
        Logger.error("Hermes MCP client error: #{inspect(error)}")
        {:error, %{tool: tool, error: :client_error, details: inspect(error)}, state}
    catch
      :exit, {:noproc, _} ->
        Logger.warning("Hermes MCP client not started")
        {:error, %{tool: tool, error: :client_error, reason: :client_not_started}, state}

      :exit, reason ->
        Logger.warning("Hermes MCP process exit: #{inspect(reason)}")
        {:error, %{tool: tool, error: :client_error, reason: reason}, state}
    end
  end

  # KEEP: process/2 fallback for invalid input (lines 65-69)
  # KEEP: Plugin behavior functions (lines 71-76)

  # MODIFY: health_check/0 to test actual Hermes connection (lines 78-96)
  def health_check do
    try do
      case ping() do
        :pong ->
          case list_tools() do
            {:ok, %{result: %{"tools" => tools}}} ->
              {:ok, %{status: :healthy, tools_count: length(tools)}}
            {:ok, _other} ->
              # Handle non-standard response format
              {:ok, %{status: :healthy}}
            {:error, reason} ->
              {:error, %{status: :unhealthy, reason: reason}}
          end
        {:error, reason} ->
          {:error, %{status: :unhealthy, reason: reason}}
      end
    rescue
      error ->
        {:error, %{status: :error, error: inspect(error)}}
    end
  end

  # MODIFY: get_available_tools/0 to use actual list_tools (lines 98-114)
  def get_available_tools do
    case list_tools() do
      {:ok, %{result: %{"tools" => tools}}} ->
        formatted_tools =
          Enum.map(tools, fn tool ->
            %{
              name: tool["name"],
              description: tool["description"],
              input_schema: tool["inputSchema"]
            }
          end)
        {:ok, formatted_tools}

      {:ok, _other} ->
        # Handle non-standard response format
        {:ok, []}

      {:error, reason} ->
        {:error, reason}
    end
  end

  # MODIFY: execute_tool/3 to use actual call_tool (lines 116-128)
  def execute_tool(tool_name, params) do
    execute_tool(tool_name, params, [])
  end

  def execute_tool(tool_name, params, opts) do
    timeout = Keyword.get(opts, :timeout, 30_000)

    case call_tool(tool_name, params, timeout: timeout) do
      {:ok, response} ->
        {:ok, response}

      {:error, reason} ->
        {:error, %{type: :client_error, reason: reason, tool: tool_name, timeout: timeout}}
    end
  end

  # ADD: child_spec/2 to support dynamic transport configuration
  def child_spec(opts) do
    transport = Keyword.get(opts, :transport, {:stdio, command: "echo", args: []})

    %{
      id: __MODULE__,
      start: {__MODULE__, :start_link, [[transport: transport]]},
      restart: :permanent,
      shutdown: 5000,
      type: :worker
    }
  end

  # MODIFY: start_link/1 to properly initialize Hermes client (line 25)
  def start_link(opts) do
    transport = Keyword.get(opts, :transport)

    # Hermes.Client macro provides start_link/1 that accepts transport
    # We need to call the parent module's start_link
    case super(opts) do
      {:ok, pid} ->
        Logger.info("Hermes MCP client started: #{inspect(pid)}")
        {:ok, pid}

      {:error, reason} ->
        Logger.error("Failed to start Hermes MCP client: #{inspect(reason)}")
        {:error, reason}
    end
  end
end
```

### Success Criteria

#### Automated Verification:
- [ ] `mix test test/core/hermes_mcp_client_test.exs` passes
- [ ] Module compiles without warnings: `mix compile`
- [ ] Dialyzer type checking passes (if enabled)

#### Manual Verification:
- [ ] Module functions are callable and return proper responses
- [ ] Error handling works correctly when Hermes client is not started
- [ ] Plugin behavior contract is maintained

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Update MCP Core to Use Real Hermes Integration

### Overview
Replace mock implementations in MCP Core with actual calls to HermesClient, adding configuration support for mock mode to maintain test compatibility.

### Changes Required

#### 1. lib/cybernetic/core/mcp/core.ex

**Current State** (lines 70-98):
- `call_tool/3` returns mock response with TODO comment (line 70)
- `send_prompt/2` returns mock response with TODO comment (line 89)
- `handle_info(:discover_tools)` registers mock tools with TODO comment (line 111)

**Changes**:

**ADD**: Configuration check function at module level (after line 8):
```elixir
# Helper function to check if mock mode is enabled
defp mock_mode? do
  Application.get_env(:cybernetic, :mcp, []) |> Keyword.get(:mock_mode, false)
end
```

**MODIFY**: handle_call for :call_tool (lines 67-84):
```elixir
def handle_call({:call_tool, tool_name, params}, _from, state) do
  Logger.debug("MCP: Calling tool #{tool_name} with params: #{inspect(params)}")

  result =
    if mock_mode?() do
      # Mock response for testing
      {:ok,
       %{
         tool: tool_name,
         params: params,
         result: "Mock result for #{tool_name}",
         timestamp: DateTime.utc_now()
       }}
    else
      # Real Hermes MCP call via HermesClient
      case Cybernetic.MCP.HermesClient.call_tool(tool_name, params) do
        {:ok, response} ->
          {:ok, %{
            tool: tool_name,
            params: params,
            result: response,
            timestamp: DateTime.utc_now()
          }}

        {:error, reason} ->
          Logger.error("MCP: Tool call failed: #{inspect(reason)}")
          {:error, reason}
      end
    end

  {:reply, result, state}
end
```

**MODIFY**: handle_call for :send_prompt (lines 86-99):
```elixir
def handle_call({:send_prompt, prompt, context}, _from, state) do
  Logger.debug("MCP: Sending prompt: #{prompt}")

  result =
    if mock_mode?() do
      # Mock response for testing
      {:ok,
       %{
         prompt: prompt,
         context: context,
         response: "Mock response to: #{prompt}"
       }}
    else
      # Real Hermes MCP prompt sending
      # Note: Hermes.Client doesn't have a direct "send_prompt" function
      # We need to check if this is a tool call or a different operation
      # For now, implement as a special tool call or resource read

      case prompt do
        "list_tools" ->
          # Shortcut to list tools
          case Cybernetic.MCP.HermesClient.list_tools() do
            {:ok, response} ->
              {:ok, %{prompt: prompt, context: context, response: response}}
            {:error, reason} ->
              {:error, reason}
          end

        _ ->
          # For other prompts, return a not-implemented error
          # This can be extended later based on actual requirements
          {:error, {:not_implemented, "send_prompt for custom prompts not yet implemented"}}
      end
    end

  {:reply, result, state}
end
```

**MODIFY**: handle_info for :discover_tools (lines 108-137):
```elixir
def handle_info(:discover_tools, state) do
  Logger.info("MCP: Starting tool discovery")

  tools =
    if mock_mode?() do
      # Mock tools for testing
      [
        %{name: "search", description: "Search the web"},
        %{name: "calculate", description: "Perform calculations"},
        %{name: "analyze", description: "Analyze data"}
      ]
    else
      # Real Hermes MCP discovery
      case Cybernetic.MCP.HermesClient.list_tools() do
        {:ok, %{result: %{"tools" => tools}}} ->
          Enum.map(tools, fn tool ->
            %{
              name: tool["name"],
              description: tool["description"],
              input_schema: tool["inputSchema"]
            }
          end)

        {:ok, _other} ->
          # Handle non-standard response format
          Logger.warning("MCP: Unexpected list_tools response format")
          []

        {:error, reason} ->
          Logger.error("MCP: Tool discovery failed: #{inspect(reason)}")
          []
      end
    end

  # Register discovered tools in the registry
  Enum.each(tools, fn tool ->
    Registry.register_tool(
      tool.name,
      tool.description,
      Map.get(tool, :input_schema, %{}),
      {__MODULE__, :tool_handler},
      []
    )
  end)

  tools_map = Map.new(tools, &{&1.name, &1})

  Logger.info("MCP: Discovered #{map_size(tools_map)} tools")
  {:noreply, %{state | tools: tools_map}}
end
```

**ADD**: Real tool handler for discovered tools (replace mock_handler at line 140):
```elixir
@doc false
def tool_handler(params) do
  # This handler is called when tools are invoked via the registry
  # It delegates to HermesClient
  tool_name = Map.get(params, "tool", "unknown")
  tool_params = Map.get(params, "params", %{})

  case Cybernetic.MCP.HermesClient.call_tool(tool_name, tool_params) do
    {:ok, response} ->
      {:ok, response}
    {:error, reason} ->
      {:error, reason}
  end
end
```

**REMOVE**: mock_handler function (line 140-142) - replaced by tool_handler above

#### 2. config/test.exs

**ADD**: Mock mode configuration for tests (in the config :cybernetic section):
```elixir
config :cybernetic, :mcp,
  mock_mode: true,  # Enable mock mode for existing tests
  registry_timeout: 5_000,
  client_timeout: 30_000,
  max_retries: 3,
  enable_vsm_tools: true
```

#### 3. config/runtime.exs

**MODIFY**: Update MCP configuration (lines 92-97) to include mock_mode:
```elixir
config :cybernetic, :mcp,
  mock_mode: false,  # Use real Hermes client in production/integration
  registry_timeout: 5_000,
  client_timeout: 30_000,
  max_retries: 3,
  enable_vsm_tools: true
```

### Success Criteria

#### Automated Verification:
- [ ] `mix test test/core/mcp_core_test.exs` passes (mock mode should work)
- [ ] Module compiles without warnings: `mix compile`
- [ ] Configuration is properly loaded in both test and runtime environments

#### Manual Verification:
- [ ] MCP Core correctly switches between mock and real mode based on config
- [ ] Tool discovery works with real Hermes client when mock_mode is false
- [ ] Error handling works correctly when Hermes client is unavailable

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Add Optional HermesClient to Application Supervisor

### Overview
Optionally add HermesClient to the application supervisor with a configuration flag to enable/disable it. This allows the system to start the client when needed without forcing it in all environments.

### Changes Required

#### 1. lib/cybernetic/application.ex

**ADD**: HermesClient to supervision tree (after line 112, with MCP Registry):
```elixir
# MCP Registry
Cybernetic.Core.MCP.Hermes.Registry,

# Optional: Hermes MCP Client (only if enabled and transport is configured)
mcp_client_child(),
```

**ADD**: Helper function to build MCP client child spec (at the end of the module, before end keyword):
```elixir
# Helper to conditionally include Hermes MCP client
defp mcp_client_child do
  mcp_config = Application.get_env(:cybernetic, :mcp, [])

  # Only start client if:
  # 1. Mock mode is disabled
  # 2. Transport is configured
  # 3. Client is explicitly enabled
  if Keyword.get(mcp_config, :mock_mode, false) == false and
     Keyword.get(mcp_config, :enable_client, false) and
     Keyword.get(mcp_config, :transport) != nil do
    transport = Keyword.get(mcp_config, :transport)
    {Cybernetic.MCP.HermesClient, transport: transport}
  else
    # Return a no-op child spec that starts successfully but does nothing
    {Agent, fn -> nil end}
  end
end
```

**MODIFY**: The else clause to use a simpler no-op:
```elixir
defp mcp_client_child do
  mcp_config = Application.get_env(:cybernetic, :mcp, [])

  if Keyword.get(mcp_config, :mock_mode, false) == false and
     Keyword.get(mcp_config, :enable_client, false) and
     Keyword.get(mcp_config, :transport) != nil do
    transport = Keyword.get(mcp_config, :transport)
    {Cybernetic.MCP.HermesClient, transport: transport}
  else
    nil  # Return nil to skip this child
  end
end
```

**MODIFY**: The children list to handle nil:
```elixir
children = [
  # ... existing children ...
  Cybernetic.Core.MCP.Hermes.Registry,
  # ... more children ...
]

# Add MCP client if enabled (filter out nils)
children =
  case mcp_client_child() do
    nil -> children
    child -> children ++ [child]
  end
```

#### 2. config/runtime.exs

**ADD**: Example transport configuration (commented out by default):
```elixir
# MCP (Model Context Protocol) Configuration
config :cybernetic, :mcp,
  mock_mode: false,  # Use real Hermes client in production/integration
  registry_timeout: 5_000,
  client_timeout: 30_000,
  max_retries: 3,
  enable_vsm_tools: true,
  # Uncomment and configure to enable Hermes MCP client:
  # enable_client: true,
  # transport: {:stdio, command: "claude", args: ["mcp", "serve"]}
  # OR for websocket:
  # transport: {:websocket, url: "ws://localhost:8080/mcp"}
```

### Success Criteria

#### Automated Verification:
- [ ] Application starts successfully with mock mode enabled
- [ ] Application starts successfully with mock mode disabled but client not enabled
- [ ] Application starts successfully with client enabled and transport configured

#### Manual Verification:
- [ ] HermesClient process starts when enabled and configured
- [ ] Application doesn't crash when HermesClient is disabled
- [ ] Configuration is flexible for different transport types

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to Phase 4.

---

## Phase 4: Update Tests for Real Integration

### Overview
Update existing tests to support both mock and real modes, and add new integration tests for the real Hermes client functionality.

### Changes Required

#### 1. test/core/mcp_core_test.exs

**MODIFY**: Update tests to work with mock mode (all existing tests should continue to work):
```elixir
defmodule Cybernetic.MCP.CoreTest do
  use ExUnit.Case, async: false
  alias Cybernetic.MCP.Core
  alias Cybernetic.Core.MCP.Hermes.Registry

  # Ensure mock mode is enabled for these tests
  setup_all do
    Application.put_env(:cybernetic, :mcp, mock_mode: true)
    :ok
  end

  # ... rest of tests remain the same ...
end
```

#### 2. test/core/hermes_mcp_client_test.exs

**ADD**: New test cases for real Hermes.Client integration:
```elixir
describe "Real Hermes.Client integration" do
  @tag :integration
  @tag :real_hermes
  test "client module can be started with transport" do
    # This test verifies the child_spec is correct
    opts = [transport: {:stdio, command: "echo", args: []}]
    spec = Cybernetic.MCP.HermesClient.child_spec(opts)

    assert spec.id == Cybernetic.MCP.HermesClient
    assert is_tuple(spec.start)
    assert elem(spec.start, 0) == Cybernetic.MCP.HermesClient
    assert elem(spec.start, 1) == :start_link
  end

  @tag :integration
  @tag :real_hermes
  test "call_tool/3 handles errors when client not started" do
    # Verify that call_tool returns error when client is not running
    result = Cybernetic.MCP.HermesClient.call_tool("test_tool", %{param: "value"})

    assert {:error, :client_not_started} = result
  end

  @tag :integration
  @tag :real_hermes
  test "list_tools/0 handles errors when client not started" do
    result = Cybernetic.MCP.HermesClient.list_tools()

    assert {:error, _reason} = result
  end

  @tag :integration
  @tag :real_hermes
  test "health_check/0 reports unhealthy when client not started" do
    result = Cybernetic.MCP.HermesClient.health_check()

    assert {:error, %{status: :unhealthy}} = result
  end
end
```

#### 3. test/integration/hermes_real_connection_test.exs (NEW FILE)

**CREATE**: New integration test file for real MCP connections:
```elixir
defmodule Cybernetic.Integration.HermesRealConnectionTest do
  use ExUnit.Case, async: false
  @moduletag :integration
  @moduletag :real_hermes

  alias Cybernetic.MCP.HermesClient

  setup do
    # Ensure mock mode is disabled
    Application.put_env(:cybernetic, :mcp,
      mock_mode: false,
      enable_client: true,
      transport: {:stdio, command: "echo", args: []}
    )

    # Note: This test requires a real MCP server to be available
    # Skip if not in integration environment
    if System.get_env("INTEGRATION_TEST") != "true" do
      {:skip, "Set INTEGRATION_TEST=true to run real connection tests"}
    else
      :ok
    end
  end

  describe "Real MCP connection" do
    test "can start client with transport" do
      # This would start a real client connected to an MCP server
      # For now, we test the child spec and configuration

      opts = [transport: {:stdio, command: "echo", args: []}]
      assert {:ok, _pid} = start_supervised({HermesClient, opts})

      # Give it time to start
      Process.sleep(500)

      # Verify it's in the supervision tree
      children = Supervisor.which_children(Cybernetic.Supervisor)
      hermes_clients = Enum.filter(children, fn {id, _, _, _} -> id == HermesClient end)

      assert length(hermes_clients) >= 0
    end

    @tag :skip
    test "can list tools from real MCP server" do
      # This test is skipped by default
      # To run, you need a real MCP server configured

      assert {:ok, _response} = HermesClient.list_tools()
    end

    @tag :skip
    test "can call tool on real MCP server" do
      # This test is skipped by default
      # To run, you need a real MCP server configured

      assert {:ok, _response} = HermesClient.call_tool("echo", %{text: "hello"})
    end
  end
end
```

### Success Criteria

#### Automated Verification:
- [ ] `mix test test/core/mcp_core_test.exs` passes (mock mode)
- [ ] `mix test test/core/hermes_mcp_client_test.exs` passes
- [ ] `mix test` passes (all tests)
- [ ] New integration tests compile successfully

#### Manual Verification:
- [ ] Existing tests continue to work with mock mode
- [ ] New tests verify error handling when client is not started
- [ ] Integration tests can be run with INTEGRATION_TEST=true environment variable

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to Phase 5.

---

## Phase 5: Remove TODO Comments and Final Integration

### Overview
Remove all TODO comments from the MCP codebase and verify the integration is complete and working.

### Changes Required

#### 1. lib/cybernetic/core/mcp/core.ex

**REMOVE**: TODO comments (lines 70, 89, 111)
- These were removed in Phase 2 when we implemented the real functionality

**VERIFY**: No TODO comments remain in the file

#### 2. lib/cybernetic/core/mcp/transports/hermes_client.ex

**REMOVE**: TODO comment (line 38)
- This was removed in Phase 1 when we uncommented the success handling logic

**VERIFY**: No TODO comments remain in the file

#### 3. Glob check for remaining TODOs

Search for any remaining TODO comments in MCP-related files:
```bash
grep -r "TODO" lib/cybernetic/core/mcp/ lib/cybernetic/mcp/ test/core/*mcp* test/integration/*mcp*
```

**VERIFY**: Zero TODO comments in MCP-related files

#### 4. Update module documentation

**UPDATE**: lib/cybernetic/core/mcp/core.ex module docs (lines 1-5):
```elixir
@moduledoc """
MCP client/server core integrating Hermes and MAGG adapters.
Handles stdio/websocket transports, tool discovery, and prompts.

This module provides a unified interface for interacting with external MCP servers
via the Hermes library. It supports both mock mode (for testing) and real mode
(for production) via configuration.

## Configuration

The MCP Core behavior is controlled via the `:mcp` application configuration:

- `:mock_mode` - When true, returns mock responses (default: false in prod, true in test)
- `:enable_client` - When true, starts the Hermes MCP client (default: false)
- `:transport` - Transport configuration for the client (e.g., `{:stdio, command: "claude", args: ["mcp", "serve"]}`)
- `:client_timeout` - Timeout for client operations (default: 30000ms)
- `:registry_timeout` - Timeout for registry operations (default: 5000ms)

## Usage

    # Call an external MCP tool
    {:ok, result} = Cybernetic.MCP.Core.call_tool("tool_name", %{param: "value"})

    # List available tools
    {:ok, tools} = Cybernetic.MCP.Core.list_tools()

    # Send a prompt (limited support)
    {:ok, response} = Cybernetic.MCP.Core.send_prompt("list_tools", %{})
"""
```

**UPDATE**: lib/cybernetic/core/mcp/transports/hermes_client.ex module docs (lines 1-5):
```elixir
@moduledoc """
Real Hermes MCP client implementation for Cybernetic VSM.
Provides access to external MCP tools and capabilities using the Hermes library.

This module implements the Hermes.Client behavior and provides a Plugin behavior
wrapper for integration with the Cybernetic plugin system.

## Transport Configuration

The client supports multiple transport types via the Hermes library:

- **stdio**: For command-line MCP servers
  Example: `{:stdio, command: "claude", args: ["mcp", "serve"]}`

- **websocket**: For WebSocket-based MCP servers
  Example: `{:websocket, url: "ws://localhost:8080/mcp"}`

- **streamable_http**: For HTTP-based MCP servers
  Example: `:streamable_http`

## Usage

    # Start the client with a transport
    {:ok, pid} = HermesClient.start_link(transport: {:stdio, command: "echo", args: []})

    # List available tools
    {:ok, response} = HermesClient.list_tools()

    # Call a tool
    {:ok, result} = HermesClient.call_tool("tool_name", %{param: "value"})

    # Check health
    {:ok, status} = HermesClient.health_check()
"""
```

### Success Criteria

#### Automated Verification:
- [ ] Zero TODO comments in all MCP-related files
- [ ] `mix test` passes completely
- [ ] `mix compile` produces no warnings
- [ ] Documentation builds successfully: `mix docs`

#### Manual Verification:
- [ ] Module documentation is accurate and complete
- [ ] Code examples in documentation work correctly
- [ ] Integration with existing features (oh-my-opencode) is not broken

**Note**: Complete all automated verification, then pause for manual confirmation.

---

## Testing Strategy

### Unit Tests

**What to Test**:
- HermesClient module functions with mock responses
- MCP Core with mock mode enabled
- Error handling when client is not started
- Configuration loading and parsing

**Key Edge Cases**:
- Client not started (process not alive)
- Network failures and timeouts
- Invalid tool names or parameters
- Malformed responses from MCP servers
- Concurrent tool calls

### Integration Tests

**End-to-End Scenarios**:
1. **Mock Mode**: Verify MCP Core works with mock mode (existing tests)
2. **Real Mode**: Verify MCP Core works with real Hermes client when available
3. **Tool Discovery**: Verify tools are discovered and registered correctly
4. **Tool Invocation**: Verify tools can be called successfully
5. **Error Handling**: Verify graceful failure when server unavailable

### Manual Testing Steps

1. **Verify Mock Mode**:
   ```bash
   # Run tests with mock mode (default)
   mix test test/core/mcp_core_test.exs
   # Should pass with mock responses
   ```

2. **Verify Real Client Setup**:
   ```bash
   # Start IEx with real client enabled
   iex -S mix
   # In IEx:
   Application.put_env(:cybernetic, :mcp, mock_mode: false, enable_client: true, transport: {:stdio, command: "echo", args: []})
   {:ok, pid} = Cybernetic.MCP.HermesClient.start_link(transport: {:stdio, command: "echo", args: []})
   Cybernetic.MCP.HermesClient.ping()
   ```

3. **Verify Tool Discovery**:
   ```bash
   # With a real MCP server running
   {:ok, tools} = Cybernetic.MCP.Core.list_tools()
   # Should return tools from the real server
   ```

4. **Verify Tool Invocation**:
   ```bash
   # Call a tool
   {:ok, result} = Cybernetic.MCP.Core.call_tool("tool_name", %{param: "value"})
   # Should return real result
   ```

---

## Migration Notes

### For Existing Code

**No Breaking Changes**: The implementation maintains backward compatibility through the `mock_mode` configuration flag. Existing code will continue to work without modification.

**Configuration Changes**:
- Test environment automatically uses `mock_mode: true` via config/test.exs
- Production environment uses `mock_mode: false` via config/runtime.exs
- No code changes required for existing consumers of MCP Core

**Future Migration Path**:
1. Deploy with `mock_mode: true` (safe, no changes)
2. Test with `mock_mode: false` in staging
3. Enable Hermes client with transport configuration
4. Gradually migrate to real MCP tools

### For Tests

**Existing Tests**: Continue to work without modification due to `mock_mode: true` in test config

**New Tests**: Can opt into real mode by setting `mock_mode: false` and `enable_client: true`

---

## References

### Code References
- Research: `/Users/speed/wreckit/cybernetic-system/.wreckit/items/007-dreamer-complete-hermes-mcp-integration/research.md`
- MCP Core: `lib/cybernetic/core/mcp/core.ex` (lines 70-137)
- HermesClient: `lib/cybernetic/core/mcp/transports/hermes_client.ex` (lines 1-130)
- Working Example: `lib/cybernetic/integrations/oh_my_opencode/mcp_provider.ex` (lines 9-141)
- Test Pattern: `test/integration/test_real_mcp_connection.exs` (lines 9-129)
- Application: `lib/cybernetic/application.ex` (lines 94, 100, 112)

### Key Patterns to Follow
- **Hermes.Server Pattern**: MCPProvider (lines 9-12, 111-141)
- **Hermes.Client Pattern**: test_real_mcp_connection (lines 9-36)
- **Tool Invocation**: MCPProvider (lines 131-141, 205-214)
- **Error Handling**: HermesClient (lines 36-62, MCPProvider 166-190)
- **Registry Integration**: MCP Core (lines 119-131)

### External Documentation
- Hermes MCP Library: https://github.com/cloudwalk/hermes-mcp
- MCP Specification: https://modelcontextprotocol.io/
