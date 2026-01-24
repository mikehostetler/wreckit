# Research: Add integration tests for each experimental SDK

**Date**: 2025-01-24
**Item**: 029-add-integration-tests-for-each-experimental-sdk

## Research Question
From milestone [M2] Finish Experimental SDK Integrations

**Motivation:** Strategic milestone: Finish Experimental SDK Integrations

## Summary

The wreckit project has three experimental SDK runners (Amp, Codex, OpenCode) that wrap the Claude Agent SDK's `query()` function. Currently, each has basic unit tests that verify dry-run mode and tool allowlist resolution, but there are **no integration tests** that verify the SDKs work correctly through the full workflow pipeline, handle errors appropriately, or properly integrate with MCP servers.

The existing unit tests in `src/__tests__/amp-sdk-runner.test.ts`, `src/__tests__/codex-sdk-runner.test.ts`, and `src/__tests__/opencode-sdk-runner.test.ts` only test the runners in dry-run mode, which bypasses actual SDK calls. The stable `claude_sdk` runner also lacks comprehensive integration tests - its behavior is primarily tested through workflow tests which mock the agent runner entirely.

To complete milestone [M2], we need integration tests that verify each experimental SDK runner: (1) handles SDK messages correctly (assistant, tool_result, result, error), (2) handles all error categories appropriately (auth, rate-limit, context, network), (3) respects timeout and cancellation, (4) passes tool allowlists and MCP servers to the SDK correctly, and (5) emits appropriate agent events for TUI consumption. These tests should use mocked SDK responses to avoid real API calls while exercising the full code paths.

## Current State Analysis

### Existing Implementation

The three experimental SDK runners are located in `src/agent/`:
- `src/agent/amp-sdk-runner.ts:1-372` - Amp SDK runner (experimental)
- `src/agent/codex-sdk-runner.ts:1-372` - Codex SDK runner (experimental)
- `src/agent/opencode-sdk-runner.ts:1-372` - OpenCode SDK runner (experimental)

All three runners share nearly identical implementations:
1. They all import `query` from `@anthropic-ai/claude-agent-sdk` (line 1)
2. They all implement `getEffectiveToolAllowlist()` for phase-based tool restrictions (lines 38-51)
3. They all have the same error handling patterns in `handleSdkError()` (lines 186-293)
4. They all support `mcpServers`, `allowedTools`, and `phase` options
5. They all use `buildSdkEnv()` for environment configuration (line 95)
6. They all format messages via `formatSdkMessage()` (lines 295-328)
7. They all emit events via `emitAgentEventsFromSdkMessage()` (lines 330-371)

The stable SDK runner `src/agent/claude-sdk-runner.ts:1-301` follows a similar pattern but lacks the `phase` parameter for tool allowlisting - it relies on explicit `allowedTools` only.

### Key Files

- `src/agent/runner.ts:348-494` - The `runAgentUnion()` function dispatches to correct SDK runner based on `config.kind`
- `src/agent/runner.ts:443-457` - Amp SDK dispatch case
- `src/agent/runner.ts:459-473` - Codex SDK dispatch case
- `src/agent/runner.ts:475-489` - OpenCode SDK dispatch case
- `src/agent/toolAllowlist.ts:57-117` - Tool allowlist definitions for all phases
- `src/schemas.ts:50-53` - `AmpSdkAgentSchema` definition
- `src/schemas.ts:55-58` - `CodexSdkAgentSchema` definition
- `src/schemas.ts:60-62` - `OpenCodeSdkAgentSchema` definition
- `src/__tests__/amp-sdk-runner.test.ts:1-131` - Basic dry-run and allowlist tests for Amp
- `src/__tests__/codex-sdk-runner.test.ts:1-128` - Basic dry-run and allowlist tests for Codex
- `src/__tests__/opencode-sdk-runner.test.ts:1-127` - Basic dry-run and allowlist tests for OpenCode
- `src/__tests__/agent.test.ts:1-428` - Tests for main agent runner including SDK mode
- `src/__tests__/workflow.test.ts:1-2042` - Comprehensive workflow tests that mock `runAgentUnion`
- `src/__tests__/integration/README.md:1-81` - Manual SDK testing instructions

### Existing Test Patterns

The existing SDK runner tests follow a consistent pattern (`amp-sdk-runner.test.ts:22-131`):

1. **Test helpers**: Create mock logger and default config (lines 6-21)
2. **dry-run mode tests**: Verify success without calling SDK (lines 29-62)
3. **getEffectiveToolAllowlist tests**: Verify tool allowlist priority (lines 65-129)

The workflow tests (`workflow.test.ts:12-31`) use vi.fn() module mocking:
```typescript
const mockedRunAgentUnion = vi.fn();
mock.module("../agent/runner", () => ({
  runAgentUnion: mockedRunAgentUnion,
  getAgentConfigUnion: mockedGetAgentConfigUnion,
}));
```

The `agent.test.ts:332-362` tests SDK mode via dry-run:
```typescript
it("dry-run mode works with SDK mode", async () => {
  const config: AgentConfig = {
    mode: "sdk",
    // ...
  };
  const result = await runAgent(options);
  expect(result.success).toBe(true);
});
```

### Integration Points

The SDK runners are invoked through `runAgentUnion()` in `runner.ts:389-493`. Each phase in `workflow/itemWorkflow.ts` calls this function:

- Research phase: Calls with `phase: "research"` for read-only tools
- Plan phase: Calls with `phase: "plan"` and `mcpServers` for save_prd
- Implement phase: Calls with `phase: "implement"` and `mcpServers` for update_story_status
- PR phase: Calls with `phase: "pr"` for git operations

## Technical Considerations

### Dependencies

- `@anthropic-ai/claude-agent-sdk` (v0.2.7) - The underlying SDK that must be mocked
- `bun:test` - Test framework providing `mock`, `describe`, `it`, `expect`, `beforeEach`, `afterEach`, `vi`
- Tests require mocking at the `query` function level to simulate SDK responses

### Patterns to Follow

1. **Module mocking pattern** (from `workflow.test.ts:26-31`):
   ```typescript
   const mockedQuery = vi.fn();
   mock.module("@anthropic-ai/claude-agent-sdk", () => ({
     query: mockedQuery,
   }));
   ```

2. **Async generator mock for streaming** - The SDK `query()` returns an async generator:
   ```typescript
   async function* mockQueryGenerator(messages: any[]) {
     for (const msg of messages) {
       yield msg;
     }
   }
   ```

3. **Mock logger pattern** (from `amp-sdk-runner.test.ts:6-14`):
   ```typescript
   function createMockLogger(): Logger {
     return {
       debug: mock(() => {}),
       info: mock(() => {}),
       warn: mock(() => {}),
       error: mock(() => {}),
       json: mock(() => {}),
     };
   }
   ```

4. **Temp directory pattern** (from `workflow.test.ts:288-295`):
   ```typescript
   beforeEach(async () => {
     tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-test-"));
   });
   afterEach(async () => {
     await fs.rm(tempDir, { recursive: true, force: true });
   });
   ```

5. **Test naming convention**: `*.test.ts` for unit tests, `*.isospec.ts` for isolated/integration tests

### What Integration Tests Should Cover

Based on `specs/008-agent-runtime.md:46-105` and the implementation:

1. **SDK Message Handling**:
   - `formatSdkMessage()` for each message type: assistant (text/tool_use), tool_result, result, error
   - `emitAgentEventsFromSdkMessage()` for TUI event emission

2. **Error Handling Categories** (from `handleSdkError()` lines 186-293):
   - Authentication errors (401, "API key", "Unauthorized")
   - Rate limit errors (429, "rate limit", "too many requests")
   - Context window errors ("context", "tokens", "too large")
   - Network errors (ECONNREFUSED, ENOTFOUND, "connection")
   - Generic errors (fallback case)

3. **Timeout and Cancellation**:
   - AbortController cancellation triggers timeout result
   - Timeout cleanup via `unregisterSdkController()`

4. **Tool Allowlist Enforcement**:
   - Phase-specific allowlist passed to SDK `tools` option
   - Explicit `allowedTools` overrides phase
   - Empty allowlist when neither specified

5. **MCP Server Integration**:
   - `mcpServers` option passed through to SDK
   - Tool calls routed to MCP server handlers

6. **Event Emission**:
   - `onAgentEvent` callbacks receive correct event types
   - `onStdoutChunk`/`onStderrChunk` receive formatted output

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| SDK mock complexity (async generator) | Medium | Create reusable mock generator factory with common message types |
| Tests flaky due to timing | Medium | Use deterministic mocks; avoid real setTimeout; mock timers if needed |
| Code duplication across three SDK tests | Low | Create shared test helpers and fixture generators |
| SDK API changes break mocks | Medium | Pin SDK version in tests; test against SDK type definitions |
| Missing edge cases in error handling | Medium | Base test cases on actual error patterns in `handleSdkError()` |
| Mock leakage between tests | Low | Reset mocks in `beforeEach`; use isolated module imports |

## Recommended Approach

### Phase 1: Create Shared Test Infrastructure

Create `src/__tests__/sdk-integration/shared/` with:

1. **`mock-sdk.ts`** - Mock SDK query generator:
   ```typescript
   export function createMockQuery(messages: SdkMessage[]) {
     return async function* mockQuery() {
       for (const msg of messages) yield msg;
     };
   }
   ```

2. **`mock-messages.ts`** - Message factories:
   ```typescript
   export function createAssistantTextMessage(text: string);
   export function createAssistantToolUseMessage(name: string, input: object);
   export function createToolResultMessage(result: string);
   export function createResultMessage(result: string);
   export function createErrorMessage(message: string);
   ```

3. **`test-helpers.ts`** - Common utilities:
   ```typescript
   export function createMockLogger(): Logger;
   export function createAmpConfig(): AmpSdkAgentConfig;
   export function createCodexConfig(): CodexSdkAgentConfig;
   export function createOpenCodeConfig(): OpenCodeSdkAgentConfig;
   ```

### Phase 2: Implement Integration Tests for Each SDK

For each SDK, create `src/__tests__/sdk-integration/<sdk>-integration.test.ts`:

```typescript
describe("<SDK> Integration", () => {
  describe("message handling", () => {
    it("formats assistant text messages correctly");
    it("formats assistant tool_use messages correctly");
    it("formats tool_result messages correctly");
    it("formats result messages correctly");
    it("formats error messages correctly");
  });

  describe("error handling", () => {
    it("handles authentication errors with helpful message");
    it("handles rate limit errors");
    it("handles context window errors");
    it("handles network errors");
    it("handles generic errors");
  });

  describe("tool allowlist", () => {
    it("passes phase-specific tools to SDK");
    it("prefers explicit allowedTools over phase");
    it("passes no tools when unrestricted");
  });

  describe("event emission", () => {
    it("emits assistant_text events for text blocks");
    it("emits tool_started events for tool_use blocks");
    it("emits tool_result events");
    it("emits run_result events");
    it("emits error events");
  });

  describe("timeout and cancellation", () => {
    it("cancels via AbortController on timeout");
    it("cleans up controller after completion");
    it("returns timeout result when aborted");
  });

  describe("MCP integration", () => {
    it("passes mcpServers option to SDK");
    it("integrates with wreckit MCP server");
  });
});
```

### Phase 3: Add Runner Dispatch Tests

Create `src/__tests__/sdk-integration/runner-dispatch.test.ts`:

```typescript
describe("runAgentUnion SDK dispatch", () => {
  it("dispatches amp_sdk to runAmpSdkAgent");
  it("dispatches codex_sdk to runCodexSdkAgent");
  it("dispatches opencode_sdk to runOpenCodeSdkAgent");
  it("passes all options through to SDK runner");
});
```

### Test File Structure

```
src/__tests__/sdk-integration/
  shared/
    mock-sdk.ts           # Mock SDK query generator
    mock-messages.ts      # Message factory functions
    test-helpers.ts       # Common test utilities
  amp-integration.test.ts     # Amp SDK integration tests
  codex-integration.test.ts   # Codex SDK integration tests
  opencode-integration.test.ts # OpenCode SDK integration tests
  runner-dispatch.test.ts     # runAgentUnion dispatch tests
```

### Update Test Script

Add to `package.json` scripts:
```json
{
  "test:sdk": "bun test ./src/__tests__/sdk-integration/",
  "test": "... && bun test ./src/__tests__/sdk-integration/*.test.ts"
}
```

## Open Questions

1. **Should tests require real API credentials for live testing?**
   - Recommendation: No. All tests should use mocked SDK responses for CI reliability. Optional live tests could be added with skip conditions for local verification.

2. **Should we test SDK/process mode fallback?**
   - This is only relevant for `claude_sdk` which has fallback behavior. Experimental SDKs don't have fallback, so not applicable.

3. **How to test AbortController timeout accurately?**
   - Use short timeout (e.g., 10ms) in tests and mock the SDK to delay, or use `vi.useFakeTimers()` to control time progression.

4. **How detailed should streaming tests be?**
   - At minimum, verify callbacks are invoked with correct event types. Detailed content verification may be fragile.

5. **Should MCP server integration be tested here or separately?**
   - The MCP server has its own tests in `ideas-mcp-server.test.ts`. Integration tests should verify the `mcpServers` option is passed correctly; detailed MCP behavior testing is out of scope.

6. **Should we verify behavior parity between all three experimental SDKs?**
   - Currently all three use identical code paths. Consider parameterized/table-driven tests that run the same assertions against all three runners.
