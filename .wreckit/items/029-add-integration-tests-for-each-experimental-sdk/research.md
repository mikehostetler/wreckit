# Research: Add integration tests for each experimental SDK

**Date**: 2026-01-24
**Item**: 029-add-integration-tests-for-each-experimental-sdk

## Research Question
From milestone [M2] Finish Experimental SDK Integrations

**Motivation:** Strategic milestone: Finish Experimental SDK Integrations

## Summary

The three experimental SDK runners (Amp, Codex, OpenCode) have been fully implemented with tool allowlist enforcement, but currently only have unit tests that cover dry-run mode. The existing tests in `src/__tests__/{amp,codex,opencode}-sdk-runner.test.ts` verify `getEffectiveToolAllowlist` resolution and dry-run behavior, but do not test actual SDK execution paths including message streaming, error handling, timeout behavior, and TUI event emission.

Integration tests are needed to verify that each SDK runner correctly: (1) enforces tool allowlists via the SDK's `tools` option, (2) handles authentication errors gracefully with helpful messages, (3) streams output via `onStdoutChunk`/`onStderrChunk` callbacks, (4) emits structured `AgentEvent` objects for TUI integration, (5) respects timeout configuration and aborts cleanly, and (6) produces consistent `AgentResult` structures. The tests should follow the established patterns in `src/__tests__/edge-cases/mock-agent.isospec.ts` and `src/__tests__/integration/idempotent.test.ts`.

The main challenge is that all three SDK runners use the same underlying `@anthropic-ai/claude-agent-sdk` package and call its `query()` function. Testing the actual SDK execution requires either mocking the SDK's async iterator or creating controlled test scenarios. The recommended approach is to mock the SDK module to provide predictable message sequences, allowing verification of message formatting, event emission, and error handling without requiring actual API credentials.

## Current State Analysis

### Existing Implementation

The three experimental SDK runners are fully implemented with identical structure:

| SDK Runner | File | Lines | Status |
|------------|------|-------|--------|
| Amp SDK | `src/agent/amp-sdk-runner.ts` | 372 | Fully implemented |
| Codex SDK | `src/agent/codex-sdk-runner.ts` | 372 | Fully implemented |
| OpenCode SDK | `src/agent/opencode-sdk-runner.ts` | 372 | Fully implemented |

Each runner includes:
- `getEffectiveToolAllowlist()` function (lines 38-51) - Priority resolution of tool allowlist
- `runXxxSdkAgent()` function (lines 53-184) - Main execution with timeout, abort, and streaming
- `handleSdkError()` function (lines 186-293) - Error categorization (auth, rate limit, context, network)
- `formatSdkMessage()` function (lines 295-328) - Converts SDK messages to output strings
- `emitAgentEventsFromSdkMessage()` function (lines 330-371) - Emits structured TUI events

### Key Files

| File | Description |
|------|-------------|
| `src/__tests__/amp-sdk-runner.test.ts:1-131` | Existing unit tests - dry-run and `getEffectiveToolAllowlist` |
| `src/__tests__/codex-sdk-runner.test.ts:1-129` | Existing unit tests - dry-run and `getEffectiveToolAllowlist` |
| `src/__tests__/opencode-sdk-runner.test.ts:1-128` | Existing unit tests - dry-run and `getEffectiveToolAllowlist` |
| `src/__tests__/edge-cases/mock-agent.isospec.ts:1-394` | Integration test pattern for mock-agent mode |
| `src/__tests__/edge-cases/dry-run.isospec.ts:1-556` | Integration test pattern for dry-run mode |
| `src/__tests__/integration/idempotent.test.ts:1-189` | Integration test pattern for workflow idempotency |
| `src/__tests__/integration/README.md:1-81` | Manual testing guide for SDK mode feature parity |
| `src/agent/toolAllowlist.ts:57-117` | Phase-based tool allowlists (`PHASE_TOOL_ALLOWLISTS`) |
| `src/workflow/itemWorkflow.ts:248-261` | Workflow integration - calls `runAgentUnion` with `allowedTools` |
| `src/agent/runner.ts:443-489` | Dispatch code that calls experimental SDK runners |

### Current Test Coverage

The existing unit tests cover (identical patterns in all three files):

**`amp-sdk-runner.test.ts` (Lines 1-131):**
- Dry-run mode: returns success without calling SDK (lines 30-43)
- Dry-run mode: logs tool restrictions when `allowedTools` provided (lines 45-63)
- `getEffectiveToolAllowlist`: explicit `allowedTools` takes precedence over phase (lines 66-88)
- `getEffectiveToolAllowlist`: falls back to phase-based allowlist (lines 90-110)
- `getEffectiveToolAllowlist`: no restrictions when neither specified (lines 112-129)

### Missing Test Coverage

The following scenarios are NOT tested:

1. **SDK Execution Path**: Actual calls to `query()` with message iteration
2. **Message Streaming**: `onStdoutChunk`/`onStderrChunk` callback invocation
3. **Event Emission**: `onAgentEvent` callback with structured `AgentEvent` objects
4. **Error Handling**: Authentication (401), rate limit (429), context (tokens), network (ECONNREFUSED)
5. **Timeout Behavior**: AbortController triggering after `timeoutSeconds`
6. **Tool Allowlist Enforcement**: Verification that `tools` option is passed to SDK
7. **MCP Server Integration**: Verification that `mcpServers` option is passed to SDK

### Reference Patterns

**Mock-Agent Integration Tests (`mock-agent.isospec.ts:35-80`):**
```typescript
// Pattern: Test agent behavior without real API calls
describe("Test 19: Basic mock-agent run", () => {
  it("logs simulation message, outputs emoji lines, and includes completion signal", async () => {
    const stdoutChunks: string[] = [];
    const options: RunAgentOptions = {
      config,
      cwd: tempDir,
      prompt: "test prompt",
      logger: mockLogger,
      mockAgent: true,  // <-- Key flag
      onStdoutChunk: (chunk) => stdoutChunks.push(chunk),
    };

    const result = await runAgent(options);

    expect(result.success).toBe(true);
    expect(stdoutChunks.join("")).toContain(completionSignal);
  });
});
```

**Dry-Run Integration Tests (`dry-run.isospec.ts:237-265`):**
```typescript
// Pattern: Test dry-run prevents mutations while still logging
describe("Test 15: Agent dry-run (no spawn)", () => {
  it("logs dry-run info and returns success without spawning agent", async () => {
    const result = await runAgent({
      config: agentConfig,
      cwd: tempDir,
      prompt: "Test prompt for agent",
      logger,
      dryRun: true,
    });

    expect(result.success).toBe(true);
    expect(result.output).toBe("[dry-run] No output");
  });
});
```

**SDK Mode Feature Parity Checklist (`integration/README.md:69-80`):**
```markdown
- [ ] Process mode: dry-run works
- [ ] SDK mode: dry-run works
- [ ] Process mode: mock-agent works
- [ ] SDK mode: mock-agent works
- [ ] Process mode: timeout handling
- [ ] SDK mode: timeout handling
- [ ] Process mode: error handling
- [ ] SDK mode: error handling
- [ ] Config schema validates both modes
- [ ] Prompt templates render for both modes
```

## Technical Considerations

### Dependencies

**Test Framework:**
- `bun:test` - Built-in test runner (already used in project)
- `vi` / `mock` - Vitest mocking utilities (already used in `*.isospec.ts` tests)

**Modules to Mock:**
- `@anthropic-ai/claude-agent-sdk` - Mock the `query()` function to return controlled message sequences
- `src/agent/env.js` - Mock `buildSdkEnv()` to avoid real credential resolution
- `src/agent/runner.js` - Mock `registerSdkController()`/`unregisterSdkController()` for cleanup verification
- No new dependencies required

### SDK Message Types

From `amp-sdk-runner.ts` `formatSdkMessage()` (lines 295-328):

```typescript
// Message types to simulate in tests:
type SdkMessage =
  | { type: "assistant"; message?: { content: ContentBlock[] }; content?: ContentBlock[] }
  | { type: "tool_result"; result?: string; content?: string; tool_use_id?: string }
  | { type: "result"; result?: string; subtype?: string }
  | { type: "error"; message?: string };

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
```

### Agent Event Types

From `src/tui/agentEvents.ts` (referenced in SDK runners):

```typescript
export type AgentEvent =
  | { type: "assistant_text"; text: string }
  | { type: "tool_started"; toolUseId: string; toolName: string; input: Record<string, unknown> }
  | { type: "tool_result"; toolUseId: string; result: string }
  | { type: "run_result"; subtype?: string }
  | { type: "error"; message: string };
```

### Patterns to Follow

1. **Module Mocking**: Use `mock.module()` to replace `@anthropic-ai/claude-agent-sdk` before importing the runner
2. **Async Iterator Mocking**: Mock `query()` to return an async generator that yields controlled messages
3. **Callback Verification**: Capture callbacks in arrays and verify contents after test completion
4. **Error Simulation**: Mock `query()` to throw specific errors for error handling tests
5. **Cleanup**: Use `beforeEach`/`afterEach` for temp directory and mock cleanup

### Tool Allowlist Verification

The SDK options construction in `amp-sdk-runner.ts` (lines 103-114):

```typescript
const sdkOptions: any = {
  cwd,
  permissionMode: "bypassPermissions",
  allowDangerouslySkipPermissions: true,
  abortController,
  env: sdkEnv,
  ...(options.mcpServers && { mcpServers: options.mcpServers }),
  ...(effectiveTools && { tools: effectiveTools }),  // <-- Tool allowlist
};
```

Tests should verify that:
1. `tools` option is passed when `allowedTools` or `phase` is specified
2. `tools` option is NOT passed when neither is specified
3. Correct tools are passed for each phase (e.g., `research` phase -> `["Read", "Write", "Glob", "Grep"]`)

### Phase-Based Tool Allowlists

From `toolAllowlist.ts:57-117`:

| Phase | Allowed Tools |
|-------|---------------|
| `idea` | `mcp__wreckit__save_parsed_ideas`, `mcp__wreckit__save_interview_ideas` |
| `research` | `Read`, `Write`, `Glob`, `Grep` |
| `plan` | `Read`, `Write`, `Edit`, `Glob`, `Grep`, `mcp__wreckit__save_prd` |
| `implement` | `Read`, `Write`, `Edit`, `Glob`, `Grep`, `Bash`, `mcp__wreckit__update_story_status` |
| `pr` | `Read`, `Glob`, `Grep`, `Bash` |
| `complete` | `Read`, `Glob`, `Grep`, `mcp__wreckit__complete` |
| `strategy` | `Read`, `Write`, `Glob`, `Grep` |

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| SDK mock doesn't match real SDK behavior | High | Study `@anthropic-ai/claude-agent-sdk` message format; update mock when SDK version changes |
| Mocking prevents catching real SDK bugs | Medium | Keep existing dry-run tests; add manual testing guidance in README |
| Tests become flaky due to async timing | Medium | Use deterministic async generators; avoid `setTimeout` in mocks; use `vi.useFakeTimers()` |
| Error handling paths differ between SDKs | Low | All three runners have identical error handling code; test one thoroughly, spot-check others |
| MCP server integration not testable | Medium | Mock MCP server factory; verify `mcpServers` option is passed through |
| Three near-identical test files | Low | Create shared test utilities; consider parameterized tests for common cases |
| Module mocking order-dependent | Medium | Place mock.module() calls before imports; isolate tests in separate files if needed |

## Recommended Approach

### Phase 1: Create Test Infrastructure

Create a shared test helper module `src/__tests__/sdk-test-helpers.ts` with:

1. **Mock SDK Query Factory**: Creates async generators that yield controlled message sequences
2. **Mock Logger Factory**: Standard mock logger pattern (already exists in each test file)
3. **Sample Message Fixtures**: Pre-defined message sequences for common scenarios
4. **Callback Capture Utilities**: Helpers to capture and verify callback invocations
5. **Error Fixture Factories**: Pre-defined error objects for each error category

### Phase 2: Implement Integration Tests

Create three integration test files:
- `src/__tests__/amp-sdk-runner.integration.test.ts`
- `src/__tests__/codex-sdk-runner.integration.test.ts`
- `src/__tests__/opencode-sdk-runner.integration.test.ts`

Each file should test:

**Test Suite 1: Message Streaming (Tests 1-3)**
1. `onStdoutChunk` receives formatted text for assistant messages
2. `onStdoutChunk` receives tool call formatted output (with JSON input)
3. `onStderrChunk` receives error messages

**Test Suite 2: Event Emission (Tests 4-8)**
4. Emits `assistant_text` event for text content blocks
5. Emits `tool_started` event for tool_use content blocks
6. Emits `tool_result` event for tool result messages
7. Emits `run_result` event for result messages
8. Emits `error` event for error messages

**Test Suite 3: Error Handling (Tests 9-13)**
9. Auth error (401/API key) produces helpful credential guidance
10. Rate limit error (429) produces retry guidance
11. Context error (tokens) produces scope reduction guidance
12. Network error (ECONNREFUSED) produces connectivity guidance
13. Generic error includes error message in output

**Test Suite 4: Tool Allowlist Enforcement (Tests 14-17)**
14. `tools` option passed to SDK when `allowedTools` specified
15. `tools` option passed to SDK when `phase` specified
16. `tools` option NOT passed when neither specified
17. Correct phase-specific tools passed for each phase

**Test Suite 5: Timeout and Abort (Tests 18-20)**
18. Timeout triggers abort controller after `timeoutSeconds`
19. Aborted run returns `timedOut: true` and `success: false`
20. Cleanup runs after abort (unregisterSdkController called)

**Test Suite 6: MCP Server Integration (Test 21)**
21. `mcpServers` option passed through to SDK

### Phase 3: Verify Test Coverage

Run tests and verify:
1. All three SDK runners pass all integration tests
2. Test results match across runners (they should be identical)
3. No regressions in existing unit tests

### Phase 4: Update Documentation

1. Update `ROADMAP.md` line 25 to mark objective complete:
   ```markdown
   - [x] Add integration tests for each experimental SDK
   ```

2. Update `src/__tests__/integration/README.md` with integration test instructions

3. Update `package.json` test script if tests need to run in a specific order

## Implementation Details

### Mock SDK Query Function

```typescript
// src/__tests__/sdk-test-helpers.ts

import { vi } from "bun:test";
import type { Logger } from "../logging";

// Capture options passed to SDK for verification
export let capturedSdkOptions: any = null;

// Factory to create mock query that yields provided messages
export function createMockQueryGenerator(messages: any[]) {
  return async function* (args: { prompt: string; options: any }) {
    capturedSdkOptions = args.options;
    for (const msg of messages) {
      yield msg;
    }
  };
}

// Factory to create mock query that throws an error
export function createMockQueryError(error: Error) {
  return async function* () {
    throw error;
  };
}

export function resetCapturedOptions() {
  capturedSdkOptions = null;
}
```

### Test File Structure

```typescript
// src/__tests__/amp-sdk-runner.integration.test.ts

import { describe, it, expect, beforeEach, afterEach, vi, mock } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { Logger } from "../logging";
import type { AmpSdkAgentConfig } from "../schemas";
import type { AgentEvent } from "../tui/agentEvents";

// Mock setup - must be before runner import
let mockQueryImpl: any = null;
let capturedSdkOptions: any = null;

mock.module("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn((args: any) => {
    capturedSdkOptions = args.options;
    return mockQueryImpl ? mockQueryImpl() : (async function* () {})();
  }),
}));

mock.module("../agent/env.js", () => ({
  buildSdkEnv: vi.fn(async () => ({})),
}));

const mockRegister = vi.fn();
const mockUnregister = vi.fn();
mock.module("../agent/runner.js", () => ({
  registerSdkController: mockRegister,
  unregisterSdkController: mockUnregister,
}));

// Import after mocks
const { runAmpSdkAgent } = await import("../agent/amp-sdk-runner");

describe("Amp SDK Runner Integration Tests", () => {
  let tempDir: string;
  let mockLogger: Logger;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "amp-sdk-test-"));
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      json: vi.fn(),
    };
    capturedSdkOptions = null;
    mockQueryImpl = null;
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("message streaming", () => {
    it("streams assistant text to onStdoutChunk", async () => {
      const stdoutChunks: string[] = [];
      mockQueryImpl = async function* () {
        yield { type: "assistant", content: [{ type: "text", text: "Hello world" }] };
        yield { type: "result", result: "Done" };
      };

      await runAmpSdkAgent({
        config: { kind: "amp_sdk" },
        cwd: tempDir,
        prompt: "test",
        logger: mockLogger,
        onStdoutChunk: (chunk) => stdoutChunks.push(chunk),
      });

      expect(stdoutChunks.join("")).toContain("Hello world");
    });

    // ... more tests
  });
});
```

### Shared Test Utilities

```typescript
// src/__tests__/sdk-test-helpers.ts

import { vi } from "bun:test";
import type { Logger } from "../logging";

export function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    json: vi.fn(),
  };
}

export function createMessageFixtures() {
  return {
    textMessage: {
      type: "assistant",
      content: [{ type: "text", text: "Hello, world!" }],
    },
    toolUseMessage: {
      type: "assistant",
      content: [{
        type: "tool_use",
        id: "tool-123",
        name: "Read",
        input: { file_path: "/test/file.ts" },
      }],
    },
    toolResultMessage: {
      type: "tool_result",
      tool_use_id: "tool-123",
      result: "File contents here",
    },
    resultMessage: {
      type: "result",
      result: "Task completed",
      subtype: "success",
    },
    errorMessage: {
      type: "error",
      message: "Something went wrong",
    },
  };
}

export function createErrorFixtures() {
  return {
    authError: new Error("authentication failed: 401 Unauthorized"),
    rateLimitError: new Error("rate limit exceeded: 429 Too Many Requests"),
    contextError: new Error("maximum context length exceeded"),
    networkError: new Error("ECONNREFUSED: Connection refused"),
    genericError: new Error("Unknown error occurred"),
  };
}

export function createAmpConfig() {
  return { kind: "amp_sdk" as const };
}

export function createCodexConfig() {
  return { kind: "codex_sdk" as const, model: "codex-1" };
}

export function createOpenCodeConfig() {
  return { kind: "opencode_sdk" as const };
}
```

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/__tests__/sdk-test-helpers.ts` | **Create** | Shared test helpers for SDK integration tests |
| `src/__tests__/amp-sdk-runner.integration.test.ts` | **Create** | Integration tests for Amp SDK runner |
| `src/__tests__/codex-sdk-runner.integration.test.ts` | **Create** | Integration tests for Codex SDK runner |
| `src/__tests__/opencode-sdk-runner.integration.test.ts` | **Create** | Integration tests for OpenCode SDK runner |
| `src/__tests__/integration/README.md` | **Modify** | Add integration test instructions |
| `ROADMAP.md:25` | **Modify** | Mark objective as complete `[x]` |
| `package.json:30` | **Modify** | Add integration tests to test script (if running separately) |

## Open Questions

1. **Test Isolation**: Should integration tests run separately from unit tests? The current `package.json` test script runs tests in specific order due to module mocking. Integration tests with SDK mocking may need similar isolation.

2. **Coverage Threshold**: What level of code coverage is required? The runners have ~370 lines each, but much is duplicated across runners. Should we aim for 80%+ coverage on one runner and verify the others pass the same tests?

3. **CI Runtime**: Will mocking the SDK significantly change test runtime? Current tests run quickly because dry-run mode exits early. Integration tests with async generators may be slower.

4. **Manual Testing**: Should the integration tests completely replace manual testing, or should we keep the manual testing guide in `README.md`? Manual testing catches real SDK version compatibility issues that mocked tests can't detect.

5. **Error Message Verification**: How strictly should we verify error message content? The error handling includes long multi-line help text. Should tests verify exact content or just key phrases?

6. **Parameterized vs. Separate Tests**: Should we create one parameterized test file that runs the same tests against all three runners, or three separate files? Parameterized tests reduce duplication but may be harder to debug.

## References

- Existing unit tests: `src/__tests__/amp-sdk-runner.test.ts`, `src/__tests__/codex-sdk-runner.test.ts`, `src/__tests__/opencode-sdk-runner.test.ts`
- Mock-agent test pattern: `src/__tests__/edge-cases/mock-agent.isospec.ts:35-80`
- Dry-run test pattern: `src/__tests__/edge-cases/dry-run.isospec.ts:237-265`
- Integration test pattern: `src/__tests__/integration/idempotent.test.ts`
- SDK runners: `src/agent/amp-sdk-runner.ts`, `src/agent/codex-sdk-runner.ts`, `src/agent/opencode-sdk-runner.ts`
- Tool allowlist definitions: `src/agent/toolAllowlist.ts:57-117`
- Workflow integration: `src/workflow/itemWorkflow.ts:248-261`
- Agent dispatch: `src/agent/runner.ts:443-489`
- Milestone context: `ROADMAP.md:16-26` ([M2] Finish Experimental SDK Integrations)
- Test framework docs: Bun test documentation
