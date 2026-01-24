# Implement tool allowlist enforcement in `src/agent/opencode-sdk-runner.ts` Implementation Plan

## Overview

This item completes the OpenCode SDK runner implementation by replacing the current stub with a full SDK integration that enforces tool allowlists per workflow phase. The implementation follows the exact pattern established by the completed Amp SDK (item 026) and Codex SDK (item 027) runners, using the `@anthropic-ai/claude-agent-sdk` package with the `tools` option to restrict available tools.

The OpenCode SDK runner is the final piece of milestone [M2] "Finish Experimental SDK Integrations". Once complete, wreckit will have three production-ready SDK alternatives (Amp, Codex, OpenCode) in addition to the primary Claude SDK.

## Current State Analysis

The `src/agent/opencode-sdk-runner.ts` file (85 lines) has complete scaffolding but returns a "not yet implemented" error:

| Component | Status | Location |
|-----------|--------|----------|
| `OpenCodeRunAgentOptions` interface | Complete | Lines 7-22 |
| `getEffectiveToolAllowlist()` function | Complete | Lines 35-48 |
| Dry-run support | Complete | Lines 55-68 |
| Effective tools logging | Stub | Lines 71-74 |
| Actual SDK execution | **TODO stub** | Lines 76-84 |

**Current stub behavior (lines 76-84):**
```typescript
logger.error("OpenCode SDK runner not yet implemented");
return {
  success: false,
  output: "OpenCode SDK runner is not yet implemented. Use process mode or claude_sdk instead.",
  timedOut: false,
  exitCode: 1,
  completionDetected: false,
};
```

### Key Discoveries:

- **Pattern is established**: `amp-sdk-runner.ts:1-372` provides the exact pattern to follow
- **Same SDK**: All SDK runners use `@anthropic-ai/claude-agent-sdk` (already in package.json v0.2.7)
- **Tool allowlist via `tools` option**: The SDK's `tools` option restricts available tools (`amp-sdk-runner.ts:113`)
- **Schema is minimal**: `OpenCodeSdkAgentSchema` only has `kind: "opencode_sdk"` - no model field
- **Dispatch already works**: `runner.ts:475-489` correctly dispatches to `runOpenCodeSdkAgent`
- **Tests use dry-run only**: Existing tests only test dry-run mode to avoid actual API calls

## Desired End State

After implementation:

1. **`runOpenCodeSdkAgent` function** fully implements SDK integration with:
   - AbortController registration/cleanup for graceful shutdown
   - Timeout handling (default 3600 seconds)
   - Environment resolution via `buildSdkEnv()`
   - Tool allowlist enforcement via SDK's `tools` option
   - Message streaming with formatted output
   - Structured event emission for TUI integration
   - Categorized error handling (auth, rate limit, context, network)

2. **Test file** `src/__tests__/opencode-sdk-runner.test.ts` verifies:
   - Dry-run mode returns success without calling SDK
   - Tool restrictions are logged when `allowedTools` provided
   - Explicit `allowedTools` takes precedence over phase
   - Falls back to phase-based allowlist when no explicit tools
   - No restrictions when neither `allowedTools` nor phase specified

3. **ROADMAP.md** line 24 marked complete: `[x] Implement tool allowlist enforcement in src/agent/opencode-sdk-runner.ts`

### Verification Method

1. **Automated**: `bun test` passes including new test file
2. **Automated**: `bun run typecheck` passes
3. **Automated**: `bun run lint` passes
4. **Automated**: `bun run build` succeeds
5. **Manual**: Dry-run with tool restrictions logs correctly

## What We're NOT Doing

1. **NOT implementing a new SDK** - "OpenCode" uses the same `@anthropic-ai/claude-agent-sdk` as Amp/Codex/Claude runners
2. **NOT adding new configuration options** - The schema is intentionally minimal (`kind: "opencode_sdk"` only)
3. **NOT testing actual API calls** - Tests only cover dry-run mode (same as Amp/Codex tests)
4. **NOT adding new tool allowlist phases** - Using existing phase definitions from `toolAllowlist.ts`
5. **NOT modifying dispatcher logic** - `runner.ts:475-489` already correctly dispatches to OpenCode runner
6. **NOT adding integration tests** - That's a separate objective in [M2]

## Implementation Approach

The implementation is a straightforward port from `amp-sdk-runner.ts`, with name changes for "OpenCode" branding. The approach:

1. **Copy helper functions verbatim** - `handleSdkError()`, `formatSdkMessage()`, `emitAgentEventsFromSdkMessage()` are identical across SDK runners
2. **Update error messages** - Change "Amp SDK" to "OpenCode SDK" in error strings
3. **Preserve existing scaffolding** - Keep the already-correct `getEffectiveToolAllowlist()` and dry-run handling
4. **Add missing imports** - `query`, `registerSdkController`, `unregisterSdkController`, `buildSdkEnv`

---

## Phase 1: Add Missing Imports and SDK Execution Logic

### Overview

Replace the stub in `runOpenCodeSdkAgent` with full SDK integration code, including all helper functions for error handling, message formatting, and event emission.

### Changes Required:

#### 1. Add SDK and Helper Imports

**File**: `src/agent/opencode-sdk-runner.ts`
**Changes**: Replace lines 1-5 with updated imports

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Logger } from "../logging";
import type { AgentResult } from "./runner";
import { registerSdkController, unregisterSdkController } from "./runner.js";
import type { OpenCodeSdkAgentConfig } from "../schemas";
import type { AgentEvent } from "../tui/agentEvents";
import { getAllowedToolsForPhase } from "./toolAllowlist";
import { buildSdkEnv } from "./env.js";
```

#### 2. Update Function Destructuring

**File**: `src/agent/opencode-sdk-runner.ts`
**Changes**: Update line 53 to destructure all needed options

Change from:
```typescript
const { logger, dryRun, config } = options;
```

To:
```typescript
const { cwd, prompt, logger, dryRun, onStdoutChunk, onStderrChunk, onAgentEvent } = options;
```

#### 3. Replace Stub with SDK Execution Logic

**File**: `src/agent/opencode-sdk-runner.ts`
**Changes**: Replace lines 70-84 (from `// TODO: Implement` through error return) with full execution logic

The complete replacement includes:
- AbortController creation and registration
- Timeout setup (3600 seconds)
- Environment building via `buildSdkEnv()`
- SDK options construction with `tools` for allowlist
- Async iteration over `query()` messages
- Message formatting and event emission
- Error handling in catch block
- Cleanup in finally block

#### 4. Add Helper Functions

**File**: `src/agent/opencode-sdk-runner.ts`
**Changes**: Add three helper functions after `runOpenCodeSdkAgent`

1. `handleSdkError()` - Categorizes errors (auth, rate limit, context, network) with OpenCode-specific messages
2. `formatSdkMessage()` - Converts SDK messages to output strings
3. `emitAgentEventsFromSdkMessage()` - Emits structured events for TUI

### Success Criteria:

#### Automated Verification:
- [ ] Type checking passes: `bun run typecheck`
- [ ] Linting passes: `bun run lint`
- [ ] Build succeeds: `bun run build`
- [ ] Existing tests pass: `bun test`

#### Manual Verification:
- [ ] Review the implementation matches amp-sdk-runner.ts structure
- [ ] Verify error messages say "OpenCode SDK" not "Amp SDK"

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to next phase.

---

## Phase 2: Add Unit Tests

### Overview

Create the test file `src/__tests__/opencode-sdk-runner.test.ts` following the established pattern from `amp-sdk-runner.test.ts` and `codex-sdk-runner.test.ts`. Tests verify dry-run behavior and tool allowlist resolution logic.

### Changes Required:

#### 1. Create Test File

**File**: `src/__tests__/opencode-sdk-runner.test.ts`
**Changes**: Create new file with test structure

```typescript
import { describe, it, expect, mock, beforeEach } from "bun:test";
import type { Logger } from "../logging";
import type { OpenCodeSdkAgentConfig } from "../schemas";

// Test helper to create mock logger
function createMockLogger(): Logger {
  return {
    debug: mock(() => {}),
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
    json: mock(() => {}),
  };
}

function createDefaultConfig(): OpenCodeSdkAgentConfig {
  return {
    kind: "opencode_sdk",
  };
}

describe("runOpenCodeSdkAgent", () => {
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = createMockLogger();
  });

  describe("dry-run mode", () => {
    it("returns success without calling SDK", async () => {
      const { runOpenCodeSdkAgent } = await import("../agent/opencode-sdk-runner");
      const result = await runOpenCodeSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain("[dry-run]");
      expect(result.completionDetected).toBe(true);
    });

    it("logs tool restrictions when allowedTools provided", async () => {
      const { runOpenCodeSdkAgent } = await import("../agent/opencode-sdk-runner");
      const result = await runOpenCodeSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
        dryRun: true,
        allowedTools: ["Read", "Glob"],
      });

      expect(result.success).toBe(true);
      const debugCalls = (mockLogger.debug as any).mock.calls;
      const hasToolRestrictions = debugCalls.some((call: any[]) =>
        call[0]?.includes?.("Tool restrictions")
      );
      expect(hasToolRestrictions).toBe(true);
    });
  });

  describe("getEffectiveToolAllowlist resolution", () => {
    it("prefers explicit allowedTools over phase", async () => {
      const { runOpenCodeSdkAgent } = await import("../agent/opencode-sdk-runner");
      const result = await runOpenCodeSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
        dryRun: true,
        allowedTools: ["Read"],
        phase: "implement", // Would give more tools, but explicit wins
      });

      expect(result.success).toBe(true);
      const debugCalls = (mockLogger.debug as any).mock.calls;
      const toolRestrictionCall = debugCalls.find((call: any[]) =>
        call[0]?.includes?.("Tool restrictions")
      );
      expect(toolRestrictionCall).toBeDefined();
      expect(toolRestrictionCall[0]).toContain("Read");
      expect(toolRestrictionCall[0]).not.toContain("Bash");
    });

    it("falls back to phase-based allowlist when no explicit tools", async () => {
      const { runOpenCodeSdkAgent } = await import("../agent/opencode-sdk-runner");
      const result = await runOpenCodeSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
        dryRun: true,
        phase: "research",
      });

      expect(result.success).toBe(true);
      const debugCalls = (mockLogger.debug as any).mock.calls;
      const toolRestrictionCall = debugCalls.find((call: any[]) =>
        call[0]?.includes?.("Tool restrictions")
      );
      expect(toolRestrictionCall).toBeDefined();
      expect(toolRestrictionCall[0]).toContain("Glob");
      expect(toolRestrictionCall[0]).toContain("Read");
    });

    it("has no restrictions when neither allowedTools nor phase specified", async () => {
      const { runOpenCodeSdkAgent } = await import("../agent/opencode-sdk-runner");
      const result = await runOpenCodeSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
        dryRun: true,
      });

      expect(result.success).toBe(true);
      const debugCalls = (mockLogger.debug as any).mock.calls;
      const hasToolRestrictions = debugCalls.some((call: any[]) =>
        call[0]?.includes?.("Tool restrictions")
      );
      expect(hasToolRestrictions).toBe(false);
    });
  });
});
```

Tests to include:

**`dry-run mode` describe block:**
- `returns success without calling SDK` - Verifies dry-run returns success with `[dry-run]` in output
- `logs tool restrictions when allowedTools provided` - Verifies debug log includes tool restrictions

**`getEffectiveToolAllowlist resolution` describe block:**
- `prefers explicit allowedTools over phase` - allowedTools `["Read"]` with phase `"implement"` should only restrict to Read
- `falls back to phase-based allowlist when no explicit tools` - phase `"research"` should give Read, Write, Glob, Grep
- `has no restrictions when neither allowedTools nor phase specified` - No tool restrictions logged

### Success Criteria:

#### Automated Verification:
- [ ] All tests pass: `bun test`
- [ ] New test file is included in test run
- [ ] Type checking passes: `bun run typecheck`

#### Manual Verification:
- [ ] Test output shows all 5 tests passing for opencode-sdk-runner.test.ts
- [ ] Test coverage includes all three SDK runners (amp, codex, opencode)

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to next phase.

---

## Phase 3: Update Roadmap

### Overview

Mark the objective as complete in ROADMAP.md to reflect the finished implementation.

### Changes Required:

#### 1. Mark Objective Complete

**File**: `ROADMAP.md`
**Changes**: Update line 24 from `[ ]` to `[x]`

Change:
```markdown
- [ ] Implement tool allowlist enforcement in `src/agent/opencode-sdk-runner.ts`
```

To:
```markdown
- [x] Implement tool allowlist enforcement in `src/agent/opencode-sdk-runner.ts`
```

### Success Criteria:

#### Automated Verification:
- [ ] Lint passes (no trailing whitespace): `bun run lint`

#### Manual Verification:
- [ ] ROADMAP.md shows 3 of 5 objectives complete for [M2]:
  - [x] Implement tool allowlist enforcement in `src/agent/amp-sdk-runner.ts`
  - [x] Implement tool allowlist enforcement in `src/agent/codex-sdk-runner.ts`
  - [x] Implement tool allowlist enforcement in `src/agent/opencode-sdk-runner.ts`
  - [ ] Add integration tests for each experimental SDK
  - [ ] Update documentation with supported SDK options

---

## Testing Strategy

### Unit Tests:

**File**: `src/__tests__/opencode-sdk-runner.test.ts`

| Test | Purpose |
|------|---------|
| `returns success without calling SDK` | Verifies dry-run mode works |
| `logs tool restrictions when allowedTools provided` | Verifies allowlist logging |
| `prefers explicit allowedTools over phase` | Verifies precedence order |
| `falls back to phase-based allowlist when no explicit tools` | Verifies phase fallback |
| `has no restrictions when neither allowedTools nor phase specified` | Verifies no-restriction default |

### Integration Tests:

Not in scope for this item - tracked as separate objective in [M2]: "Add integration tests for each experimental SDK"

### Manual Testing Steps:

1. **Verify dry-run output:**
   ```bash
   wreckit implement --dry-run --agent '{"kind":"opencode_sdk"}'
   ```
   Expected: Output contains `[dry-run] Would run OpenCode SDK agent`

2. **Run automated tests:**
   ```bash
   bun test
   ```
   Expected: All tests pass including new opencode-sdk-runner.test.ts

3. **Type check:**
   ```bash
   bun run typecheck
   ```
   Expected: No errors

4. **Build:**
   ```bash
   bun run build
   ```
   Expected: Success

## Migration Notes

No migration required. This is a new implementation replacing a stub. The schema (`kind: "opencode_sdk"`) already exists and is already supported in the dispatcher. Any existing configurations using `opencode_sdk` will now work instead of returning an error.

## References

- Research: `/Users/speed/wreckit/.wreckit/items/028-implement-tool-allowlist-enforcement-in-srcagentop/research.md`
- Target file: `src/agent/opencode-sdk-runner.ts:1-85`
- Primary reference: `src/agent/amp-sdk-runner.ts:1-372`
- Secondary reference: `src/agent/codex-sdk-runner.ts:1-372`
- Test pattern: `src/__tests__/amp-sdk-runner.test.ts:1-131`
- Test pattern: `src/__tests__/codex-sdk-runner.test.ts:1-129`
- Tool allowlist: `src/agent/toolAllowlist.ts:57-117`
- Environment builder: `src/agent/env.ts:79-108`
- Dispatcher: `src/agent/runner.ts:475-489`
- Schema: `src/schemas.ts:60-62`
- Milestone: `ROADMAP.md:16-27`
