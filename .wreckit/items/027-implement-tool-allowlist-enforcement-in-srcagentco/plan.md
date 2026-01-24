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

The research summary incorrectly stated the file had a "TODO stub" returning "not yet implemented". This was outdated - the actual implementation was completed in a prior iteration. The verification confirms:

```bash
# No TODOs or incomplete markers
grep -c "TODO\|FIXME\|not yet implemented" src/agent/codex-sdk-runner.ts
# Returns: 0
```

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

## Phase 1: Verification

### Overview

Verify the existing implementation compiles and tests pass.

### Changes Required:

**None** - verification only.

### Verification Commands:

```bash
# 1. Run unit tests
bun test ./src/__tests__/codex-sdk-runner.test.ts

# 2. Build project
bun run build

# 3. Verify tool enforcement exists
grep -n "tools: effectiveTools" src/agent/codex-sdk-runner.ts

# 4. Verify ROADMAP status
grep "codex-sdk-runner" ROADMAP.md
```

### Success Criteria:

#### Automated Verification:
- [ ] Tests pass: `bun test ./src/__tests__/codex-sdk-runner.test.ts` (5 tests)
- [ ] Build succeeds: `bun run build`

#### Manual Verification:
- [ ] Line 113 contains `tools: effectiveTools` for enforcement
- [ ] ROADMAP.md line 23 shows `[x]` for this objective
- [ ] No TODOs or "not implemented" messages in codex-sdk-runner.ts

**Note**: Complete all automated verification, then pause for manual confirmation.

---

## Phase 2: Close Item

### Overview

Mark the item as complete after verification.

### Changes Required:

Update item state from "implementing" to "done" (via wreckit workflow).

### Success Criteria:

#### Automated Verification:
- [ ] Item state shows "done"

#### Manual Verification:
- [ ] All Phase 1 criteria confirmed
- [ ] M2 milestone shows 2 of 5 objectives complete

---

## Testing Strategy

### Existing Unit Tests:

File: `src/__tests__/codex-sdk-runner.test.ts` (129 lines)

| Test | Description |
|------|-------------|
| `dry-run returns success` | Verifies dry-run doesn't call SDK |
| `logs tool restrictions` | Verifies allowedTools logging |
| `prefers explicit allowedTools` | Verifies explicit > phase priority |
| `falls back to phase-based` | Verifies phase resolution |
| `no restrictions when unspecified` | Verifies undefined behavior |

### Manual Testing Steps:

1. Run `bun test ./src/__tests__/codex-sdk-runner.test.ts`
2. Confirm 5 tests pass
3. Review test output for any warnings

### Integration Testing:

Integration tests are a **separate objective** in ROADMAP.md:
```markdown
- [ ] Add integration tests for each experimental SDK
```

This is out of scope for this item.

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
