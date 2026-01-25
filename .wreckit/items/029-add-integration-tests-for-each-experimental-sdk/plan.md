# Add Integration Tests for Each Experimental SDK Implementation Plan

## Overview

This plan implements comprehensive integration tests for the three experimental SDK runners (Amp, Codex, OpenCode) to complete milestone [M2] Finish Experimental SDK Integrations. Currently, each runner has only dry-run unit tests that bypass actual SDK interaction. The new integration tests will verify SDK message handling, error handling, event emission, tool allowlist enforcement, and SDK options passthrough using mocked SDK responses.

## Current State Analysis

### Existing Tests (Unit Tests Only)

The experimental SDK runners each have unit tests in:
- `src/__tests__/amp-sdk-runner.test.ts` (lines 1-131)
- `src/__tests__/codex-sdk-runner.test.ts` (lines 1-129)
- `src/__tests__/opencode-sdk-runner.test.ts` (lines 1-128)

These tests only cover:
1. **Dry-run mode**: Returns early before SDK interaction (lines 29-62 in each)
2. **Tool allowlist resolution**: Tests `getEffectiveToolAllowlist` logic (lines 65-130 in each)

### What's Missing

The existing tests use `dryRun: true` which bypasses all SDK interaction. The following are NOT tested:
1. `formatSdkMessage` function (lines 295-328 in each runner)
2. `emitAgentEventsFromSdkMessage` function (lines 330-371 in each runner)
3. `handleSdkError` function (lines 186-293 in each runner)
4. Message streaming loop behavior (lines 117-147)
5. SDK options passthrough (mcpServers, tools, cwd, permissionMode)

### Key Discoveries

- **SDK Import**: All three runners import `query` from `@anthropic-ai/claude-agent-sdk` (line 1)
- **Runner Structure**: Near-identical implementations (372 lines each), differing only in type names and error messages
- **Message Types**: SDK returns messages of types: `assistant`, `tool_result`, `result`, `error` (lines 297-327)
- **Event Types**: Emits AgentEvent types: `assistant_text`, `tool_started`, `tool_result`, `run_result`, `error` (src/tui/agentEvents.ts:1-7)
- **Error Categories**: Auth (401), rate limit (429), context, network, generic (lines 196-292)
- **Testing Pattern**: Project uses `mock.module()` for module mocking, `vi.fn()` for function mocks (see workflow.test.ts:12-31)

## Desired End State

Each experimental SDK runner will have integration tests that:
1. **Verify message handling** - Each message type (assistant, tool_result, result, error) is correctly formatted and routed
2. **Verify error categorization** - Each error category returns appropriate user-facing messages
3. **Verify event emission** - Correct AgentEvent types emitted for TUI consumption
4. **Verify tool allowlist** - Phase-based and explicit allowlist passed to SDK correctly
5. **Verify SDK options passthrough** - `mcpServers`, `cwd`, `permissionMode` passed correctly

### Verification

The tests are complete when:
- `bun test src/__tests__/sdk-integration/` passes
- All error categories have dedicated test cases
- All message types have formatting tests
- Event emission is verified for each message type
- SDK options passthrough is verified
- No API credentials required (all SDK calls mocked)

## What We're NOT Doing

1. **Live API tests** - All tests use mocked SDK responses for CI reliability
2. **MCP server behavior tests** - MCP has its own tests; we only verify `mcpServers` option is passed
3. **SDK internal testing** - We test our wrapper code, not the SDK itself
4. **Refactoring SDK runners** - The runners work; we're adding tests, not changing implementation
5. **Parameterized/shared tests across SDKs** - Each SDK gets its own test file for clarity, even if similar
6. **Performance testing** - No benchmarks or load tests

## Implementation Approach

### Strategy: Module-Level Mocking

We will mock the `@anthropic-ai/claude-agent-sdk` module using Bun's `mock.module()` API, replacing the `query` function with an async generator that yields controlled messages. This approach:

1. Tests the actual runner code paths (not bypassed by dry-run)
2. Avoids network calls and authentication requirements
3. Allows precise control over message sequences
4. Enables testing of error scenarios

### Test Organization

Create integration tests in `src/__tests__/sdk-integration/` with one file per SDK:
- `amp-sdk.integration.test.ts`
- `codex-sdk.integration.test.ts`
- `opencode-sdk.integration.test.ts`

Each file follows the same structure but tests the specific runner to allow for future SDK divergence.

---

## Phase 1: Create Amp SDK Integration Tests

### Overview

Create the first integration test file for the Amp SDK runner. This establishes the pattern for the other two SDKs.

### Changes Required:

#### 1. Create Amp SDK Integration Test File

**File**: `src/__tests__/sdk-integration/amp-sdk.integration.test.ts`

```typescript
import { describe, it, expect, mock, beforeEach, afterEach, vi } from "bun:test";
import type { Logger } from "../../logging";
import type { AmpSdkAgentConfig } from "../../schemas";
import type { AgentEvent } from "../../tui/agentEvents";

// Mock SDK message types for testing
interface MockSdkMessage {
  type: "assistant" | "tool_result" | "result" | "error";
  message?: { content: any[] };
  content?: any[];
  result?: string;
  tool_use_id?: string;
  subtype?: string;
}

// Create async generator for mock SDK query
function createMockQuery(messages: MockSdkMessage[]) {
  return async function* mockQuery(_opts: any): AsyncGenerator<MockSdkMessage> {
    for (const msg of messages) {
      yield msg;
    }
  };
}

// Mock the SDK module
const mockedQuery = vi.fn();

mock.module("@anthropic-ai/claude-agent-sdk", () => ({
  query: mockedQuery,
}));

// Import after mocking
const { runAmpSdkAgent } = await import("../../agent/amp-sdk-runner");

function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    json: vi.fn(),
  };
}

function createDefaultConfig(): AmpSdkAgentConfig {
  return {
    kind: "amp_sdk",
  };
}

describe("Amp SDK Integration", () => {
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = createMockLogger();
    vi.clearAllMocks();
  });

  describe("message formatting", () => {
    it("formats assistant text messages", async () => {
      const messages: MockSdkMessage[] = [
        { type: "assistant", content: [{ type: "text", text: "Hello world" }] },
        { type: "result", result: "done" },
      ];
      mockedQuery.mockImplementation(createMockQuery(messages));

      const result = await runAmpSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test",
        logger: mockLogger,
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain("Hello world");
    });

    it("formats assistant tool_use messages", async () => {
      const messages: MockSdkMessage[] = [
        { type: "assistant", content: [{ type: "tool_use", id: "t1", name: "Read", input: { file_path: "/test" } }] },
        { type: "result", result: "" },
      ];
      mockedQuery.mockImplementation(createMockQuery(messages));

      const result = await runAmpSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test",
        logger: mockLogger,
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain("Read");
      expect(result.output).toContain("file_path");
    });

    // Additional tests for tool_result, result, error messages...
  });

  describe("event emission", () => {
    it("emits assistant_text events", async () => {
      const messages: MockSdkMessage[] = [
        { type: "assistant", content: [{ type: "text", text: "Thinking..." }] },
        { type: "result", result: "" },
      ];
      mockedQuery.mockImplementation(createMockQuery(messages));

      const events: AgentEvent[] = [];
      await runAmpSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test",
        logger: mockLogger,
        onAgentEvent: (event) => events.push(event),
      });

      const textEvent = events.find(e => e.type === "assistant_text");
      expect(textEvent).toBeDefined();
      expect((textEvent as any).text).toBe("Thinking...");
    });

    it("emits tool_started events for tool_use blocks", async () => {
      const messages: MockSdkMessage[] = [
        { type: "assistant", content: [{ type: "tool_use", id: "t1", name: "Read", input: {} }] },
        { type: "result", result: "" },
      ];
      mockedQuery.mockImplementation(createMockQuery(messages));

      const events: AgentEvent[] = [];
      await runAmpSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test",
        logger: mockLogger,
        onAgentEvent: (event) => events.push(event),
      });

      const toolEvent = events.find(e => e.type === "tool_started");
      expect(toolEvent).toBeDefined();
      expect((toolEvent as any).toolName).toBe("Read");
    });

    // Additional event emission tests...
  });

  describe("error handling", () => {
    it("handles authentication errors with helpful message", async () => {
      mockedQuery.mockImplementation(async function* () {
        throw new Error("401 Unauthorized");
      });

      const result = await runAmpSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test",
        logger: mockLogger,
      });

      expect(result.success).toBe(false);
      expect(result.output).toContain("Authentication Error");
      expect(result.output).toContain("ANTHROPIC_API_KEY");
    });

    it("handles rate limit errors", async () => {
      mockedQuery.mockImplementation(async function* () {
        throw new Error("429 rate limit exceeded");
      });

      const result = await runAmpSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test",
        logger: mockLogger,
      });

      expect(result.success).toBe(false);
      expect(result.output).toContain("Rate limit");
    });

    // Additional error handling tests for context, network, generic...
  });

  describe("tool allowlist", () => {
    it("passes phase-specific tools to SDK", async () => {
      mockedQuery.mockImplementation(createMockQuery([{ type: "result", result: "" }]));

      await runAmpSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test",
        logger: mockLogger,
        phase: "research",
      });

      expect(mockedQuery).toHaveBeenCalled();
      const callArgs = mockedQuery.mock.calls[0][0];
      expect(callArgs.options.tools).toContain("Read");
      expect(callArgs.options.tools).toContain("Glob");
    });

    it("prefers explicit allowedTools over phase", async () => {
      mockedQuery.mockImplementation(createMockQuery([{ type: "result", result: "" }]));

      await runAmpSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test",
        logger: mockLogger,
        phase: "implement",
        allowedTools: ["Read"],
      });

      const callArgs = mockedQuery.mock.calls[0][0];
      expect(callArgs.options.tools).toEqual(["Read"]);
    });
  });

  describe("SDK options passthrough", () => {
    it("passes mcpServers option to SDK", async () => {
      mockedQuery.mockImplementation(createMockQuery([{ type: "result", result: "" }]));
      const mcpServers = { wreckit: { command: "test" } };

      await runAmpSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test",
        logger: mockLogger,
        mcpServers,
      });

      const callArgs = mockedQuery.mock.calls[0][0];
      expect(callArgs.options.mcpServers).toBe(mcpServers);
    });

    it("passes cwd and permissionMode to SDK", async () => {
      mockedQuery.mockImplementation(createMockQuery([{ type: "result", result: "" }]));

      await runAmpSdkAgent({
        config: createDefaultConfig(),
        cwd: "/custom/path",
        prompt: "test",
        logger: mockLogger,
      });

      const callArgs = mockedQuery.mock.calls[0][0];
      expect(callArgs.options.cwd).toBe("/custom/path");
      expect(callArgs.options.permissionMode).toBe("bypassPermissions");
    });
  });
});
```

### Success Criteria:

#### Automated Verification:
- [ ] Tests pass: `bun test src/__tests__/sdk-integration/amp-sdk.integration.test.ts`
- [ ] Type checking passes: `bun run build` (includes type check)
- [ ] No lint errors in new file

#### Manual Verification:
- [ ] Test covers all 5 message types (assistant/text, assistant/tool_use, tool_result, result, error)
- [ ] Test covers all 5 error categories (auth, rate-limit, context, network, generic)
- [ ] Test covers event emission for all AgentEvent types
- [ ] No API credentials required to run tests

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to next phase.

---

## Phase 2: Create Codex SDK Integration Tests

### Overview

Create integration tests for the Codex SDK runner, following the pattern established in Phase 1.

### Changes Required:

#### 1. Create Codex SDK Integration Test File

**File**: `src/__tests__/sdk-integration/codex-sdk.integration.test.ts`

This file follows the same structure as `amp-sdk.integration.test.ts` but imports and tests `runCodexSdkAgent` from `../../agent/codex-sdk-runner`.

Key differences:
- Import `CodexSdkAgentConfig` instead of `AmpSdkAgentConfig`
- Create config with `kind: "codex_sdk"` and optional `model: "codex-1"`
- Error messages reference "Codex SDK" instead of "Amp SDK"

### Success Criteria:

#### Automated Verification:
- [ ] Tests pass: `bun test src/__tests__/sdk-integration/codex-sdk.integration.test.ts`
- [ ] Type checking passes: `bun run build`
- [ ] No lint errors in new file

#### Manual Verification:
- [ ] Test structure mirrors Amp SDK tests
- [ ] Error messages correctly reference "Codex SDK"
- [ ] All message types and error categories covered

---

## Phase 3: Create OpenCode SDK Integration Tests

### Overview

Create integration tests for the OpenCode SDK runner, completing the integration test coverage for all experimental SDKs.

### Changes Required:

#### 1. Create OpenCode SDK Integration Test File

**File**: `src/__tests__/sdk-integration/opencode-sdk.integration.test.ts`

This file follows the same structure as the previous two but imports and tests `runOpenCodeSdkAgent` from `../../agent/opencode-sdk-runner`.

Key differences:
- Import `OpenCodeSdkAgentConfig` instead
- Create config with `kind: "opencode_sdk"`
- Error messages reference "OpenCode SDK"

### Success Criteria:

#### Automated Verification:
- [ ] Tests pass: `bun test src/__tests__/sdk-integration/opencode-sdk.integration.test.ts`
- [ ] Type checking passes: `bun run build`
- [ ] No lint errors in new file

#### Manual Verification:
- [ ] Test structure mirrors previous SDK tests
- [ ] Error messages correctly reference "OpenCode SDK"
- [ ] All message types and error categories covered

---

## Phase 4: Update Package.json Test Script

### Overview

Add the new integration tests to the project's test script so they run as part of `bun test`.

### Changes Required:

#### 1. Update test script in package.json

**File**: `package.json`

Add the SDK integration tests to the test script. The current test script runs tests in groups; add a new group for SDK integration tests.

Current test script pattern (line 30):
```json
"test": "bun test --preload ... && bun test ... && bun test ..."
```

Add to end:
```json
&& bun test src/__tests__/sdk-integration/*.integration.test.ts
```

### Success Criteria:

#### Automated Verification:
- [ ] Full test suite passes: `bun test`
- [ ] SDK integration tests included in full run
- [ ] Build succeeds: `bun run build`

#### Manual Verification:
- [ ] `bun test` output shows SDK integration tests running
- [ ] No tests skipped or erroring due to missing credentials

---

## Testing Strategy

### Unit Tests (Existing)
- Dry-run mode behavior
- Tool allowlist resolution logic
- Config type validation

### Integration Tests (New - This Item)
- SDK message formatting (`formatSdkMessage`)
- Agent event emission (`emitAgentEventsFromSdkMessage`)
- Error categorization and messaging (`handleSdkError`)
- Timeout/abort controller behavior
- Output routing (stdout vs stderr callbacks)
- Successful completion with output accumulation

### Manual Testing Steps

1. **Verify tests run without credentials**:
   ```bash
   unset ANTHROPIC_API_KEY
   bun test src/__tests__/sdk-integration/
   ```
   Should pass (all SDK calls are mocked).

2. **Verify test coverage**:
   ```bash
   bun test src/__tests__/sdk-integration/ --coverage
   ```
   Confirm formatSdkMessage, emitAgentEventsFromSdkMessage, handleSdkError have high coverage.

3. **Verify no regressions**:
   ```bash
   bun test
   ```
   Full test suite should pass.

## Migration Notes

No migration needed - these are new test files that don't affect existing functionality.

## References

- Research: `/Users/speed/wreckit/.wreckit/items/029-add-integration-tests-for-each-experimental-sdk/research.md`
- Amp SDK Runner: `src/agent/amp-sdk-runner.ts` (lines 1-372)
- Codex SDK Runner: `src/agent/codex-sdk-runner.ts` (lines 1-372)
- OpenCode SDK Runner: `src/agent/opencode-sdk-runner.ts` (lines 1-372)
- Existing Amp Unit Tests: `src/__tests__/amp-sdk-runner.test.ts` (lines 1-131)
- AgentEvent Types: `src/tui/agentEvents.ts` (lines 1-7)
- Test Patterns: `src/__tests__/workflow.test.ts` (mock.module usage lines 26-31, 84-120)
