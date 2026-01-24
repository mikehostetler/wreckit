# Implement tool allowlist enforcement in `src/agent/codex-sdk-runner.ts` Implementation Plan

## Overview

This item addresses objective "[M2] Finish Experimental SDK Integrations" by implementing tool allowlist enforcement in the Codex SDK runner. Upon analysis, the implementation is already complete in `src/agent/codex-sdk-runner.ts` (372 lines). This plan documents the verification steps and the already-completed ROADMAP update.

## Current State Analysis

### Key Discovery: Implementation Already Complete

The source file `src/agent/codex-sdk-runner.ts` contains a **fully implemented** 372-line SDK runner:

| Component | Status | Location |
|-----------|--------|----------|
| SDK Import | Complete | Line 1: `import { query } from "@anthropic-ai/claude-agent-sdk"` |
| Controller Registration | Complete | Line 4: `import { registerSdkController, unregisterSdkController }` |
| Environment Builder | Complete | Line 8: `import { buildSdkEnv }` |
| `getEffectiveToolAllowlist()` | Complete | Lines 38-51 |
| `runCodexSdkAgent()` | Complete | Lines 53-184 |
| Tool allowlist enforcement | Complete | Lines 98-114 (via `tools` option) |
| `handleSdkError()` | Complete | Lines 186-293 |
| `formatSdkMessage()` | Complete | Lines 295-328 |
| `emitAgentEventsFromSdkMessage()` | Complete | Lines 330-371 |
| ROADMAP.md | Complete | Line 23 shows `[x]` |

### Key Discoveries:

- **Implementation is complete**: `src/agent/codex-sdk-runner.ts:1-372` contains full functionality
- **Tool enforcement verified**: Line 113 shows `...(effectiveTools && { tools: effectiveTools })`
- **ROADMAP already updated**: Line 23 shows `[x]` for this objective
- **No test infrastructure**: Project currently has no test files

## Desired End State

After this item:

1. **Implementation verified** - Build and type check pass
2. **ROADMAP.md confirmed** - Shows `[x]` for objective (already done)
3. **Documentation complete** - Plan and PRD reflect actual state

## What We're NOT Doing

1. **Not modifying implementation** - Already complete and working
2. **Not adding unit tests** - No test infrastructure; tracked under separate M2 objective
3. **Not changing SDK/dependencies** - Uses existing `@anthropic-ai/claude-agent-sdk`
4. **Not implementing model selection** - `model` field exists but not passed to SDK
5. **Not adding endpoint configuration** - Uses existing `buildSdkEnv()`

## Implementation Approach

Since implementation is complete, this item focuses on verification and documentation.

---

## Phase 1: Verify Implementation and Build

### Overview

Verify the existing implementation compiles correctly and tool allowlist enforcement is in place.

### Changes Required:

No code changes - verification only.

### Verification Commands:

```bash
# 1. Verify file length (~372 lines)
wc -l src/agent/codex-sdk-runner.ts

# 2. Verify tool allowlist enforcement
grep -n "tools: effectiveTools" src/agent/codex-sdk-runner.ts

# 3. Build
npm run build

# 4. Type check
npm run typecheck

# 5. Lint
npm run lint
```

### Success Criteria:

#### Automated Verification:
- [ ] Build succeeds: `npm run build`
- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:
- [ ] File has ~372 lines
- [ ] Line 113 contains `tools: effectiveTools`
- [ ] `getEffectiveToolAllowlist` function exists at lines 38-51

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to next phase.

---

## Phase 2: Confirm ROADMAP Update

### Overview

Verify ROADMAP.md shows the objective as complete.

### Changes Required:

None - ROADMAP.md line 23 already shows `[x]`.

### Verification Commands:

```bash
grep "codex-sdk-runner" ROADMAP.md
```

Expected: `- [x] Implement tool allowlist enforcement in \`src/agent/codex-sdk-runner.ts\``

### Success Criteria:

#### Automated Verification:
- [ ] ROADMAP.md line 23 shows `[x]`

#### Manual Verification:
- [ ] M2 milestone shows 2 of 5 objectives complete

**Note**: Complete verification before marking item as done.

---

## Testing Strategy

### Unit Tests:
Not being added. No test infrastructure exists. Tests tracked under M2 objective "Add integration tests for each experimental SDK".

### Manual Testing Steps:
1. Run `npm run build` - verify success
2. Run `grep -n "tools: effectiveTools" src/agent/codex-sdk-runner.ts` - verify line 113
3. Run `grep "codex-sdk-runner" ROADMAP.md` - verify `[x]`

## Migration Notes

No migration required. Implementation already complete and backward compatible.

## References

- Implementation: `src/agent/codex-sdk-runner.ts:1-372`
- Reference: `src/agent/amp-sdk-runner.ts:1-372`
- Tool allowlist: `src/agent/toolAllowlist.ts:57-117`
- Dispatch: `src/agent/runner.ts:459-473`
- ROADMAP: `ROADMAP.md:23`
- Research: `/Users/speed/wreckit/.wreckit/items/027-implement-tool-allowlist-enforcement-in-srcagentco/research.md`
