# Research: [DREAMER] Complete Hermes MCP Integration

**Date**: 2025-01-09
**Item**: 007-dreamer-complete-hermes-mcp-integration

## Research Question

Three key MCP integration points are incomplete:
1. Cybernetic.MCP.Core.call_tool/3 (line 70) has mock response instead of actual Hermes call
2. Cybernetic.MCP.Core.send_prompt/2 (line 89) returns mock response instead of using Hermes
3. Cybernetic.MCP.HermesClient.call_tool/3 (line 18) returns {:error, :not_implemented}

**Motivation:** MCP integration is a core feature advertised in the README (line 63: 'MCP Tools: Database, code analysis, financial calculations'). Without this implementation, the system cannot actually use external MCP tools, severely limiting AI agent capabilities.

**Success criteria:**
- Cybernetic.MCP.Core.call_tool/3 successfully invokes HermesMCP.call/2
- Cybernetic.MCP.Core.send_prompt/2 uses actual Hermes prompt sending
- Cybernetic.MCP.HermesClient.call_tool/3 handles both success and error responses from Hermes
- All MCP-related TODO comments are removed from lib/cybernetic/core/mcp/*.ex
- Integration tests pass with real Hermes MCP connections

**Technical constraints:**
- Hermes library is already in mix.exs (ref: 97a3dd7e4b6907cc79136da7999b4f51af4834eb)
- Must maintain backward compatibility with existing mock-based tests
- Need to implement proper error handling for network failures
- Must preserve the Plugin behavior contract

**In scope:**
- lib/cybernetic/core/mcp/core.ex (lines 70-98)
- lib/cybernetic/core/mcp/transports/hermes_client.ex (lines 18-128)
- test/core/hermes_mcp_client_test.exs
- test/integration/test_real_mcp_connection.exs

**Out of scope:**
- MAGG adapter (separate concern)
- MCP server implementation (different module)
- Tool discovery UI components

**Signals:** priority: high, urgency: This is blocking a marketed feature and is referenced in 4 TODO comments across the MCP codebase.

## Summary

The Hermes MCP integration is partially implemented but relies on mock responses rather than actual Hermes library calls. The system has Hermes.Server.Registry running in the application supervisor (application.ex:94) and successfully uses Hermes.Server for the oh-my-opencode integration. The missing piece is the **client-side** integration that allows Cybernetic to make outbound calls to external MCP servers.

The current architecture has two layers:
1. **MCP Registry** (lib/cybernetic/core/mcp/hermes/registry.ex) - Manages internal tool registration and invocation
2. **MCP Core** (lib/cybernetic/core/mcp/core.ex) - Should interface with external MCP servers via Hermes client

The implementation requires:
- Using `use Hermes.Client` macro in HermesClient (similar to how Hermes.Server is used in MCPProvider)
- Implementing actual call_tool/3, list_tools/0, and prompt operations using Hermes Client API
- Proper error handling for network failures and timeouts
- Maintaining backward compatibility with existing test expectations

## Current State Analysis

### Existing Implementation

**Hermes Dependency Status:**
- Hermes MCP library is properly configured in mix.exs:45-47
- Git reference: 97a3dd7e4b6907cc79136da7999b4f51af4834eb
- Repository: https://github.com/cloudwalk/hermes-mcp

**MCP Core (lib/cybernetic/core/mcp/core.ex):**
- Lines 70-83: `call_tool/3` returns mock response with TODO comment
- Lines 86-98: `send_prompt/2` returns mock response with TODO comment
- Lines 111-137: `handle_info(:discover_tools)` registers mock tools instead of discovering from Hermes
- Mock responses include: tool name, params, timestamp, and mock result string

**HermesClient (lib/cybernetic/core/mcp/transports/hermes_client.ex):**
- Line 18: `call_tool/3` returns `{:error, :not_implemented}`
- Lines 37-48: `process/2` has commented-out implementation logic for handling tool call results
- Implements Cybernetic.Plugin behavior (metadata, init, process, handle_event)
- Has placeholder functions: ping/0, list_tools/0, execute_tool/2, health_check/0

**Working Hermes Integration Example:**
- lib/cybernetic/integrations/oh_my_opencode/mcp_provider.ex demonstrates successful Hermes.Server usage
- Uses `use Hermes.Server` macro (line 9)
- Implements init/2 and handle_tool_call/3 callbacks
- Successfully registers tools via register_tool/3
- Shows proper error handling and response patterns

### Key Files

- `lib/cybernetic/core/mcp/core.ex:70-98` - Main MCP client interface with mock implementations
  - TODO on line 70: "Replace with actual Hermes MCP call"
  - TODO on line 89: "Implement actual prompt sending via Hermes"
  - TODO on line 111: "Replace with actual Hermes MCP discovery"

- `lib/cybernetic/core/mcp/transports/hermes_client.ex:18-128` - Hermes client transport layer
  - Line 18: Returns `{:error, :not_implemented}` for all call_tool/3 invocations
  - Lines 38-44: Commented-out success handling logic
  - Implements Plugin behavior with metadata/0, init/1, process/2, handle_event/2

- `lib/cybernetic/integrations/oh_my_opencode/mcp_provider.ex:1-252` - Working Hermes.Server example
  - Lines 9-12: Shows proper `use Hermes.Server` declaration
  - Lines 111-128: Demonstrates init/2 callback with tool registration
  - Lines 131-141: Shows handle_tool_call/3 pattern for tool invocation
  - Lines 205-214: Tool invocation with proper error handling

- `lib/cybernetic/core/mcp/hermes/registry.ex:1-328` - Internal tool registry
  - Manages ETS table for tool storage
  - Handles tool registration, invocation, and statistics
  - Used by both MCP Core and MCP Provider

- `lib/cybernetic/application.ex:94` - Hermes.Server.Registry is started in supervision tree
  - Indicates Hermes library is available and loaded
  - Serves as registry for Hermes.Server instances

- `test/core/mcp_core_test.exs:1-173` - Tests for MCP Core with mock expectations
  - Lines 50-60: Tests tool calls with mock responses
  - Lines 74-88: Tests prompt sending with mock responses
  - Lines 103-121: Tests tool listing with mock tools
  - All tests expect the current mock behavior

- `test/core/hermes_mcp_client_test.exs:1-201` - Tests for HermesClient
  - Lines 11-24: Tests Plugin behavior implementation
  - Lines 28-71: Tests error handling without server
  - Lines 74-111: Tests API interface exists (but doesn't call actual tools)
  - Tests verify function existence and error handling, not actual functionality

- `test/integration/test_real_mcp_connection.exs:1-136` - Standalone script testing real MCP connection
  - Lines 9-14: Shows `use Hermes.Client` pattern for client implementation
  - Lines 15-36: Demonstrates starting a client with transport configuration
  - Lines 38-94: Shows actual usage patterns: ping(), list_tools(), call_tool()
  - Provides template for how Hermes.Client should be used

## Technical Considerations

### Dependencies

**External Dependencies:**
- `hermes_mcp` (git: cloudwalk/hermes-mcp, ref: 97a3dd7e4b6907cc79136da7999b4f51af4834eb)
  - Already in mix.exs and loaded in application
  - Provides both Hermes.Server and Hermes.Client modules
  - Server pattern successfully used in oh-my-opencode integration

**Internal Modules:**
- Cybernetic.Core.MCP.Hermes.Registry - Internal tool registry
- Cybernetic.MCP.Tool behavior - Tool interface (DatabaseTool, CodeAnalysisTool)
- Cybernetic.Security.AuthManager - Authorization for tool access
- Cybernetic.VSM.System3.RateLimiter - Rate limiting for tool calls

### Patterns to Follow

**Hermes.Server Pattern (from MCPProvider):**
```elixir
use Hermes.Server,
  name: "cybernetic",
  version: "0.1.0",
  capabilities: [:tools]

def init(_client_info, frame) do
  # Register tools
  {:ok, frame}
end

def handle_tool_call(tool_name, params, frame) do
  # Handle tool call
  {:reply, Response.tool() |> Response.structured(result), frame}
end
```

**Hermes.Client Pattern (from test_real_mcp_connection.exs):**
```elixir
use Hermes.Client,
  name: "CyberneticTest",
  version: "0.1.0",
  protocol_version: "2024-11-05",
  capabilities: [:roots]

# Start with transport
{__MODULE__, transport: {:stdio, command: "claude", args: ["mcp", "serve"]}}

# Usage
ping()
list_tools()
call_tool(tool_name, params)
```

**Tool Invocation Pattern (from MCPProvider):**
```elixir
case tool.execute(operation, params, context) do
  {:ok, result} when is_map(result) -> {:ok, result}
  {:ok, other} -> {:ok, %{result: other}}
  {:error, reason} -> {:error, reason}
end
```

**Error Handling Pattern:**
- Rate limiting enforcement (from MCPProvider:166-190)
- Authorization checks (from MCPProvider:156-164)
- Graceful degradation when server unavailable (from HermesClient:55-62)

### Configuration

**MCP Configuration (config/runtime.exs:92-97):**
```elixir
config :cybernetic, :mcp,
  registry_timeout: 5_000,
  client_timeout: 30_000,
  max_retries: 3,
  enable_vsm_tools: true
```

**Application Supervisor (lib/cybernetic/application.ex):**
- Hermes.Server.Registry is started at line 94
- MCP Registry is started at line 112
- MCP Provider is started with :streamable_http transport at line 100

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking existing tests that expect mock responses | High | Maintain mock mode in test environment, add configuration flag for real vs mock mode |
| Hermes.Client API differs from expected interface | Medium | Thoroughly test Hermes.Client API in isolation before integration, use adapter pattern if needed |
| Network failures causing system instability | Medium | Implement circuit breaker pattern (already in system), add proper timeouts and error handling |
| Rate limiting not properly enforced on external tools | Medium | Reuse existing RateLimiter from System3, add per-tool budgets |
| Authorization context not properly passed to external tools | Low | Follow MCPProvider pattern for auth_context propagation |

## Recommended Approach

### Phase 1: Understand Hermes.Client API
1. Create a test module using `use Hermes.Client` macro
2. Test basic operations: ping(), list_tools(), call_tool()
3. Verify transport configuration (stdio, websocket, etc.)
4. Document the actual API surface and return values

### Phase 2: Implement HermesClient Integration
1. Update `lib/cybernetic/core/mcp/transports/hermes_client.ex`:
   - Add `use Hermes.Client` macro with proper configuration
   - Implement `call_tool/3` using actual Hermes.Client.call_tool/2
   - Implement `list_tools/0` using actual Hermes.Client.list_tools/0
   - Uncomment and complete the success handling logic in process/2 (lines 38-44)
   - Add proper error handling for network failures and timeouts

2. Implement start_link/1 to initialize Hermes client with transport
3. Update health_check/0 to test actual Hermes connection
4. Maintain Plugin behavior contract throughout

### Phase 3: Update MCP Core
1. Update `lib/cybernetic/core/mcp/core.ex`:
   - Replace mock call_tool/3 (lines 70-83) with HermesClient.call_tool/2
   - Replace mock send_prompt/2 (lines 86-98) with actual Hermes prompt API
   - Replace mock tool discovery (lines 111-137) with actual Hermes discovery
   - Add configuration option to use mock mode for testing

2. Add fallback to mock mode when Hermes client unavailable
3. Properly handle errors and timeouts

### Phase 4: Update Tests
1. Update test/core/hermes_mcp_client_test.exs:
   - Add tests for actual Hermes client functionality
   - Keep existing tests for Plugin behavior
   - Add integration tests with real MCP server

2. Update test/core/mcp_core_test.exs:
   - Add configuration to use mock mode for existing tests
   - Add new tests for real Hermes integration
   - Test error handling and timeout scenarios

3. Verify test/integration/test_real_mcp_connection.exs works end-to-end

### Phase 5: Documentation and Cleanup
1. Remove all TODO comments from MCP codebase
2. Update module documentation to reflect real integration
3. Add examples of how to use external MCP tools
4. Update README if needed to reflect actual capabilities

## Open Questions

1. **Transport Configuration**: What transport should HermesClient use? Options:
   - `:stdio` - For command-line tools
   - `:websocket` - For web-based MCP servers
   - `:streamable_http` - For HTTP-based servers (like oh-my-opencode)
   - Should this be configurable at runtime?

2. **Mock Mode Control**: How should the system control whether to use mock or real mode?
   - Application config flag?
   - Environment variable?
   - Runtime configuration?
   - This affects test compatibility

3. **Prompt Sending**: What is the expected interface for `send_prompt/2`?
   - Is this part of the Hermes.Client API?
   - Should it call a specific tool like "prompt"?
   - Need to verify Hermes.Client capabilities

4. **Error Recovery**: When Hermes client is unavailable, should the system:
   - Fail fast and return errors?
   - Fall back to mock responses silently?
   - Circuit breaker pattern (already available in system)?

5. **Multi-Server Support**: Should HermesClient support connecting to multiple external MCP servers, or just one?
   - This affects the architecture significantly
   - MCPRouter already has multi-server support pattern

## Additional Findings

**Tool Discovery:**
- Current MCP Core registers mock tools (search, calculate, analyze) on startup
- Real tool discovery should query Hermes.Client.list_tools/0
- Need to merge external tools with internal registry tools

**Authentication:**
- MCPProvider shows proper auth_context passing (lines 158-164, 216-224)
- External MCP tools may not support auth_context
- Need to handle tools that don't require auth

**Rate Limiting:**
- System3.RateLimiter is already integrated in MCPProvider
- Should apply same rate limiting to external tool calls
- Per-tool budgets can prevent abuse

**Monitoring:**
- Telemetry events already emitted for tool invocations (Registry:205-212)
- Should add telemetry for Hermes client connection status
- Track success/failure rates for external tools

**Code Analysis Tool:**
- lib/cybernetic/mcp/tools/code_analysis_tool.ex exists
- Implements same Tool behavior as DatabaseTool
- Can be exposed via MCP to external systems
