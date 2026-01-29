# Implement tool allowlist enforcement in `src/agent/amp-sdk-runner.ts` Implementation Plan

## Overview

This item implements the Amp SDK agent runner with tool allowlist enforcement. The `amp-sdk-runner.ts` file currently has scaffolding (interface, getEffectiveToolAllowlist function, dry-run support) but returns a "not yet implemented" stub error when actually executing. The implementation will follow the established pattern from `claude-sdk-runner.ts`, using the same underlying Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) with Amp-specific configuration support.

**Key Insight:** "Amp" refers to the `amp` CLI tool (used in process mode with `command: "amp"`). The "Amp SDK" integration means providing an SDK-mode alternative that uses the Claude Agent SDK with environment configuration that can target Amp-compatible endpoints.

## Current State

### Existing Infrastructure (Complete, No Changes Needed)

| Component | Status | Location |
|-----------|--------|----------|
| `AmpRunAgentOptions` interface | Complete | `amp-sdk-runner.ts:7-22` |
| `getEffectiveToolAllowlist()` function | Complete | `amp-sdk-runner.ts:35-48` |
| Dry-run support | Complete | `amp-sdk-runner.ts:55-68` |
| Dispatch in `runAgentUnion()` | Complete | `runner.ts:443-457` |
| Schema `AmpSdkAgentSchema` | Complete | `schemas.ts:50-53` |
| Phase-based tool allowlists | Complete | `toolAllowlist.ts:57-117` |

### Implementation Gap

The `runAmpSdkAgent()` function (lines 50-84) returns a stub error on line 79. It needs to:
1. Import the Claude Agent SDK `query` function
2. Set up environment via `buildSdkEnv()`
3. Register/unregister AbortController for cleanup
4. Execute SDK query with `allowedTools` passed as `tools` option
5. Stream messages to output callbacks
6. Emit structured events for TUI integration
7. Handle errors (auth, rate limit, network, context)

### Key Discoveries:

- **Reference implementation:** `src/agent/claude-sdk-runner.ts:1-301` shows the exact pattern to follow
- **SDK import:** Line 1 - `import { query } from "@anthropic-ai/claude-agent-sdk"`
- **AbortController registration:** Lines 15-16, 110 - `registerSdkController()`, `unregisterSdkController()`
- **Environment setup:** Line 29 - `buildSdkEnv({ cwd, logger })`
- **Tool allowlist passing:** Line 41 - `...(options.allowedTools && { tools: options.allowedTools })`
- **Error handling:** Lines 114-222 - `handleSdkError()` with specific categories
- **Message formatting:** Lines 224-257 - `formatSdkMessage()` for output conversion
- **Event emission:** Lines 259-300 - `emitAgentEventsFromSdkMessage()` for TUI

## Desired End State

### Functional Requirements
1. `runAmpSdkAgent()` executes an agent query via Claude Agent SDK
2. Tool allowlist is enforced via SDK `tools` option
3. Messages stream to stdout/stderr callbacks
4. TUI receives structured `AgentEvent` emissions
5. Timeout causes graceful abort with error result
6. Auth/rate limit/network errors are clearly reported
7. MCP servers are passed to SDK when provided

### Success Verification
```bash
# Configure Amp SDK mode
cat > .wreckit/config.json << 'EOF'
{
  "agent": { "kind": "amp_sdk" }
}
EOF

# Run with tool restrictions (research phase allows Read, Glob, Grep, Write)
wreckit research <item-id>
# Expected: Agent runs with tool restrictions logged, completes or fails gracefully

# Dry-run verification
wreckit research <item-id> --dry-run
# Expected: "[dry-run] Would run Amp SDK agent" with tool restrictions logged
```

## What We're NOT Doing

1. **Creating a new npm dependency** - Using existing `@anthropic-ai/claude-agent-sdk`
2. **Modifying the dispatch logic** - `runner.ts` already dispatches to `runAmpSdkAgent` correctly
3. **Changing tool allowlist definitions** - `toolAllowlist.ts` is complete
4. **Modifying the schema** - `AmpSdkAgentSchema` already supports optional `model` field
5. **Adding `phase` to dispatch** - The caller resolves phase to tools before calling; `allowedTools` is sufficient

## Implementation Approach

The implementation copies the Claude SDK runner pattern with minimal adaptation:

1. **Copy core logic** from `claude-sdk-runner.ts` into `amp-sdk-runner.ts`
2. **Adapt function signature** to use `AmpRunAgentOptions` (already defined)
3. **Reuse helper functions** - `formatSdkMessage()`, `emitAgentEventsFromSdkMessage()`, `handleSdkError()` are generic and can be copied
4. **Use existing `getEffectiveToolAllowlist()`** - already implemented correctly

---

## Phase 1: Implement Core Amp SDK Runner

### Overview
Implement the full `runAmpSdkAgent()` function following the Claude SDK pattern by replacing the stub implementation.

### Changes Required:

##### 1. Update amp-sdk-runner.ts with full implementation
**File**: `src/agent/amp-sdk-runner.ts`
**Changes**: Replace stub implementation with full SDK integration

The complete implementation should:

1. Add imports at the top of the file:
```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";
import { registerSdkController, unregisterSdkController } from "./runner.js";
import { buildSdkEnv } from "./env.js";
```

2. Replace the `runAmpSdkAgent` function body (lines 50-84) with:
   - AbortController creation and registration
   - Timeout setup using setTimeout
   - Environment building via `buildSdkEnv()`
   - SDK options construction with `tools` for allowlist
   - Async iteration over `query()` messages
   - Message formatting and event emission
   - Error handling in catch block
   - Cleanup in finally block

3. Add helper functions (copied from claude-sdk-runner.ts):
   - `handleSdkError()` - categorizes auth/rate limit/context/network errors
   - `formatSdkMessage()` - converts SDK messages to output strings
   - `emitAgentEventsFromSdkMessage()` - emits structured events for TUI

### Success Criteria:

##### Automated Verification:
- [ ] Build succeeds: `bun run build` compiles without errors
- [ ] Type checking passes: TypeScript compilation with no errors
- [ ] Existing tests pass: `bun test` shows no regressions

##### Manual Verification:
- [ ] Dry-run mode returns success: `wreckit research <item-id> --dry-run` shows `[dry-run] Would run Amp SDK agent`
- [ ] Tool restrictions logged in dry-run when phase has restrictions
- [ ] File structure matches claude-sdk-runner.ts pattern

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Add Unit Tests

### Overview
Add unit tests for the Amp SDK runner covering dry-run behavior, tool allowlist resolution, and error handling.

### Changes Required:

##### 1. Create test file
**File**: `src/__tests__/amp-sdk-runner.test.ts`
**Changes**: Add test suite for `runAmpSdkAgent`

```typescript
import { describe, it, expect, mock, beforeEach } from "bun:test";
import type { Logger } from "../logging";
import type { AmpSdkAgentConfig } from "../schemas";

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

function createDefaultConfig(): AmpSdkAgentConfig {
  return {
    kind: "amp_sdk",
  };
}

describe("runAmpSdkAgent", () => {
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = createMockLogger();
  });

  describe("dry-run mode", () => {
    it("returns success without calling SDK", async () => {
      const { runAmpSdkAgent } = await import("../agent/amp-sdk-runner");
      const result = await runAmpSdkAgent({
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
      const { runAmpSdkAgent } = await import("../agent/amp-sdk-runner");
      const result = await runAmpSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
        dryRun: true,
        allowedTools: ["Read", "Glob"],
      });

      expect(result.success).toBe(true);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining("Tool restrictions")
      );
    });
  });

  describe("getEffectiveToolAllowlist resolution", () => {
    it("prefers explicit allowedTools over phase", async () => {
      const { runAmpSdkAgent } = await import("../agent/amp-sdk-runner");
      const result = await runAmpSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
        dryRun: true,
        allowedTools: ["Read"],
        phase: "implement", // Would give more tools, but explicit wins
      });

      expect(result.success).toBe(true);
      // Debug should show only "Read", not the implement phase tools
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining("Read")
      );
    });

    it("falls back to phase-based allowlist when no explicit tools", async () => {
      const { runAmpSdkAgent } = await import("../agent/amp-sdk-runner");
      const result = await runAmpSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
        dryRun: true,
        phase: "research",
      });

      expect(result.success).toBe(true);
      // Research phase allows Read, Write, Glob, Grep
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining("Glob")
      );
    });

    it("has no restrictions when neither allowedTools nor phase specified", async () => {
      const { runAmpSdkAgent } = await import("../agent/amp-sdk-runner");
      const result = await runAmpSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
        dryRun: true,
      });

      expect(result.success).toBe(true);
      // Should not log tool restrictions
      const debugCalls = (mockLogger.debug as any).mock.calls;
      const hasToolRestrictions = debugCalls.some((call: any[]) =>
        call[0]?.includes?.("Tool restrictions")
      );
      expect(hasToolRestrictions).toBe(false);
    });
  });
});
```

### Success Criteria:

##### Automated Verification:
- [ ] Tests pass: `bun test src/__tests__/amp-sdk-runner.test.ts`
- [ ] Build still succeeds: `bun run build`
- [ ] Full test suite passes: `bun test`

##### Manual Verification:
- [ ] Test file is properly structured with describe/it blocks
- [ ] All test assertions are meaningful and specific

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Update Documentation

### Overview
Update ROADMAP.md to mark the Amp SDK item as complete.

### Changes Required:

##### 1. Update ROADMAP.md checkbox
**File**: `ROADMAP.md`
**Changes**: Line 22 - Mark objective complete

Change:
```markdown
- [ ] Implement tool allowlist enforcement in `src/agent/amp-sdk-runner.ts`
```

To:
```markdown
- [x] Implement tool allowlist enforcement in `src/agent/amp-sdk-runner.ts`
```

### Success Criteria:

##### Automated Verification:
- [ ] Build still succeeds: `bun run build`
- [ ] All tests pass: `bun test`

##### Manual Verification:
- [ ] ROADMAP.md line 22 shows `[x]` for Amp SDK item
- [ ] No broken markdown formatting

---

## Testing Strategy

### Unit Tests:
- Dry-run returns success without SDK call
- Tool allowlist logged when provided
- `getEffectiveToolAllowlist` priority resolution:
  - Explicit `allowedTools` takes precedence
  - Falls back to phase-based allowlist
  - Returns undefined when no restrictions
- Error categorization (auth, rate limit, context, network)

### Integration Tests:
Given that SDK integration requires credentials, integration testing is manual:
1. Configure `.wreckit/config.local.json` with valid credentials
2. Set `"agent": { "kind": "amp_sdk" }` in config
3. Run `wreckit research <item-id>` and verify:
   - Agent executes with tool restrictions
   - Output streams to terminal/TUI
   - Completion or graceful failure

### Manual Testing Steps:
1. **Dry-run verification:**
   ```bash
   wreckit research <item-id> --dry-run
   ```
   Expected: Log shows "[dry-run] Would run Amp SDK agent" and tool restrictions

2. **Error path verification (without credentials):**
   ```bash
   # Ensure no ANTHROPIC_API_KEY set
   unset ANTHROPIC_API_KEY
   wreckit research <item-id>
   ```
   Expected: Clear authentication error message with setup instructions

3. **Full execution (with credentials):**
   ```bash
   export ANTHROPIC_API_KEY=your-key
   wreckit research <item-id>
   ```
   Expected: Agent runs, output streams, success or agent-level failure

## Migration Notes

No migration needed. This is a new implementation of an experimental feature. Users who had `"agent": { "kind": "amp_sdk" }` configured previously would have received a "not yet implemented" error - they will now get actual execution.

## References
- Research: `/Users/speed/wreckit/.wreckit/items/026-implement-tool-allowlist-enforcement-in-srcagentam/research.md`
- Reference implementation: `src/agent/claude-sdk-runner.ts:1-301`
- Tool allowlist definitions: `src/agent/toolAllowlist.ts:57-117`
- Environment builder: `src/agent/env.ts:79-108`
- Agent runtime spec: `specs/008-agent-runtime.md`
- Milestone context: `ROADMAP.md:16-26` ([M2] Finish Experimental SDK Integrations)
- Dispatch code: `src/agent/runner.ts:443-457`
