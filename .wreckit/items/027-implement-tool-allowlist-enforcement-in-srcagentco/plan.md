# Implement tool allowlist enforcement in `src/agent/codex-sdk-runner.ts` Implementation Plan

## Overview

This item addresses objective "[M2] Finish Experimental SDK Integrations" by implementing tool allowlist enforcement in the Codex SDK runner. Upon thorough analysis, **the implementation is already complete** in `src/agent/codex-sdk-runner.ts` (372 lines). This plan documents the verified state and closure steps.

## Current State Analysis

### Critical Discovery: Implementation Already Complete

The source file `src/agent/codex-sdk-runner.ts` contains a **fully implemented** SDK runner with tool allowlist enforcement:

| Component | Status | Location |
|-----------|--------|----------|
| SDK Import | Complete | `codex-sdk-runner.ts:1` - `import { query } from "@anthropic-ai/claude-agent-sdk"` |
| Controller Registration | Complete | `codex-sdk-runner.ts:4` - `import { registerSdkController, unregisterSdkController }` |
| Environment Builder | Complete | `codex-sdk-runner.ts:8` - `import { buildSdkEnv }` |
| Tool Allowlist Function | Complete | `codex-sdk-runner.ts:38-51` - `getEffectiveToolAllowlist()` |
| Main Runner Function | Complete | `codex-sdk-runner.ts:53-184` - `runCodexSdkAgent()` |
| Tool Enforcement | Complete | `codex-sdk-runner.ts:113` - `...(effectiveTools && { tools: effectiveTools })` |
| Error Handler | Complete | `codex-sdk-runner.ts:186-293` - `handleSdkError()` with categorized errors |
| Message Formatter | Complete | `codex-sdk-runner.ts:295-328` - `formatSdkMessage()` |
| Event Emitter | Complete | `codex-sdk-runner.ts:330-371` - `emitAgentEventsFromSdkMessage()` |

### Key Discoveries:

- **Full implementation exists**: `src/agent/codex-sdk-runner.ts` has 372 lines of production code
- **Tool enforcement verified**: Line 113 passes `tools: effectiveTools` to SDK options
- **Priority order correct**: Line 38-51 shows explicit `allowedTools` > phase > undefined
- **Unit tests exist**: `src/__tests__/codex-sdk-runner.test.ts` with 5 test cases (129 lines)
- **ROADMAP already updated**: Line 23 shows `[x]` for this objective
- **No TODOs/FIXMEs**: File contains no incomplete markers

### Research Summary Discrepancy

The research summary incorrectly stated the file had a "TODO stub" returning "not yet implemented". This was outdated - the actual implementation was completed in a prior iteration.

## Desired End State

The desired state has **already been achieved**:

1. **Tool allowlist enforcement works** - SDK `tools` option restricts available tools
2. **Phase-based resolution works** - Via `getAllowedToolsForPhase()` from `toolAllowlist.ts`
3. **Explicit overrides work** - `allowedTools` option takes precedence over phase
4. **Tests exist and pass** - 5 unit tests covering all resolution scenarios
5. **ROADMAP reflects status** - Already marked `[x]` complete

## What We're NOT Doing

1. **No code changes** - Implementation is complete
2. **No new tests** - Tests already exist at `src/__tests__/codex-sdk-runner.test.ts`
3. **No ROADMAP update** - Already marked complete
4. **No refactoring** - Code follows amp-sdk-runner.ts pattern correctly
5. **No model field handling** - Out of scope (schema has model but SDK doesn't use it)

## Implementation Approach

Since implementation is complete, this item only requires verification and closure.

---

## Phase 1: Verify Implementation Completeness

### Overview

Verify the existing Codex SDK runner implementation compiles, tests pass, and tool allowlist enforcement is correctly implemented.

### Changes Required:

**None** - verification only.

### Verification Steps:

#### 1. Verify SDK Import and Registration
**File**: `src/agent/codex-sdk-runner.ts:1-8`

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Logger } from "../logging";
import type { AgentResult } from "./runner";
import { registerSdkController, unregisterSdkController } from "./runner.js";
import type { CodexSdkAgentConfig } from "../schemas";
import type { AgentEvent } from "../tui/agentEvents";
import { getAllowedToolsForPhase } from "./toolAllowlist";
import { buildSdkEnv } from "./env.js";
```

#### 2. Verify Tool Allowlist Resolution
**File**: `src/agent/codex-sdk-runner.ts:38-51`

```typescript
function getEffectiveToolAllowlist(options: CodexRunAgentOptions): string[] | undefined {
  // Explicit allowedTools takes precedence
  if (options.allowedTools !== undefined) {
    return options.allowedTools;
  }

  // Fall back to phase-based allowlist if phase is specified
  if (options.phase) {
    return getAllowedToolsForPhase(options.phase);
  }

  // No restrictions
  return undefined;
}
```

#### 3. Verify Tool Allowlist Enforcement in SDK Options
**File**: `src/agent/codex-sdk-runner.ts:104-114`

```typescript
// Build SDK options
const sdkOptions: any = {
  cwd, // Working directory
  permissionMode: "bypassPermissions", // wreckit runs autonomously
  allowDangerouslySkipPermissions: true, // Required for bypassPermissions
  abortController, // Enable cancellation on TUI quit/signals
  env: sdkEnv, // Pass environment to ensure custom endpoints are honored
  // Pass MCP servers if provided
  ...(options.mcpServers && { mcpServers: options.mcpServers }),
  // Restrict tools if effectiveTools is specified
  ...(effectiveTools && { tools: effectiveTools }),
};
```

### Success Criteria:

#### Automated Verification:
- [ ] Tests pass: `bun test ./src/__tests__/codex-sdk-runner.test.ts` (5 tests)
- [ ] Type checking passes: `npx tsc --noEmit`
- [ ] Build succeeds: `bun run build`

#### Manual Verification:
- [ ] Line 113 contains `tools: effectiveTools` for enforcement
- [ ] `getEffectiveToolAllowlist()` follows correct priority (explicit > phase > undefined)
- [ ] No TODOs or "not implemented" messages in codex-sdk-runner.ts

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to next phase.

---

## Phase 2: Verify Unit Tests Exist and Pass

### Overview

Ensure unit tests exist and pass for the Codex SDK runner.

### Changes Required:

**None** - verification only.

### Test File Location
**File**: `src/__tests__/codex-sdk-runner.test.ts`

### Expected Test Coverage:

| Test | Description |
|------|-------------|
| `dry-run returns success` | Verifies dry-run doesn't call SDK |
| `logs tool restrictions` | Verifies allowedTools logging |
| `prefers explicit allowedTools` | Verifies explicit > phase priority |
| `falls back to phase-based` | Verifies phase resolution |
| `no restrictions when unspecified` | Verifies undefined behavior |

### Verification Commands:

```bash
# Run unit tests
bun test ./src/__tests__/codex-sdk-runner.test.ts
```

### Success Criteria:

#### Automated Verification:
- [ ] Test file exists: `test -f src/__tests__/codex-sdk-runner.test.ts`
- [ ] Tests pass: `bun test src/__tests__/codex-sdk-runner.test.ts`

#### Manual Verification:
- [ ] Test covers dry-run mode
- [ ] Test covers tool allowlist resolution priority

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to next phase.

---

## Phase 3: Verify ROADMAP.md Status

### Overview

Confirm ROADMAP.md reflects the completed objective.

### Changes Required:

**None** - verification only.

### Expected Status:
**File**: `ROADMAP.md:23`

```markdown
- [x] Implement tool allowlist enforcement in `src/agent/codex-sdk-runner.ts`
```

### Verification Commands:

```bash
# Verify ROADMAP status
grep "codex-sdk-runner" ROADMAP.md
```

### Success Criteria:

#### Automated Verification:
- [ ] Grep confirms `[x]`: `grep "codex-sdk-runner" ROADMAP.md | grep "\[x\]"`

#### Manual Verification:
- [ ] Line 23 shows `[x]` (not `[ ]`)
- [ ] M2 milestone shows this as one of the completed objectives

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to next phase.

---

## Testing Strategy

### Unit Tests:
- `src/__tests__/codex-sdk-runner.test.ts` covers:
  - Dry-run mode (returns success without SDK call)
  - Tool restrictions logging in dry-run
  - `getEffectiveToolAllowlist` priority resolution

### Integration Tests:
- Tracked separately under M2 objective "Add integration tests for each experimental SDK"

### Manual Testing Steps:
1. Run `bun test ./src/__tests__/codex-sdk-runner.test.ts`
2. Confirm 5 tests pass
3. Review test output for any warnings

## Migration Notes

No migration required - implementation was already complete.

## References

- Implementation: `src/agent/codex-sdk-runner.ts:1-372`
- Tests: `src/__tests__/codex-sdk-runner.test.ts:1-129`
- Reference: `src/agent/amp-sdk-runner.ts:1-372` (identical pattern)
- Tool allowlist: `src/agent/toolAllowlist.ts:57-117`
- Environment: `src/agent/env.ts:79-108`
- Dispatch: `src/agent/runner.ts:459-473`
- ROADMAP: `ROADMAP.md:23`
- Research: `/Users/speed/wreckit/.wreckit/items/027-implement-tool-allowlist-enforcement-in-srcagentco/research.md`
