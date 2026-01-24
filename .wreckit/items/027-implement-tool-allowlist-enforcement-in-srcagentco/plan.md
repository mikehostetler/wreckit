# Implement tool allowlist enforcement in `src/agent/codex-sdk-runner.ts` Implementation Plan

## Overview

This item ensures tool allowlist enforcement is correctly implemented in the Codex SDK runner, completing one of the objectives in milestone [M2] Finish Experimental SDK Integrations.

## Current State Analysis

**Status: COMPLETE** - Both the implementation and ROADMAP.md have been updated.

### Verified Implementation Status (2026-01-24)

The source file `src/agent/codex-sdk-runner.ts` contains a full 372-line implementation:

| Component | Status | Location | Verification |
|-----------|--------|----------|--------------|
| SDK Import | ✅ Complete | Line 1 | `import { query } from "@anthropic-ai/claude-agent-sdk"` |
| Runner imports | ✅ Complete | Line 4 | `import { registerSdkController, unregisterSdkController }` |
| Env import | ✅ Complete | Line 8 | `import { buildSdkEnv }` |
| `CodexRunAgentOptions` interface | ✅ Complete | Lines 10-25 | All required fields present |
| `getEffectiveToolAllowlist()` | ✅ Complete | Lines 38-51 | Priority: explicit > phase > undefined |
| `runCodexSdkAgent()` | ✅ Complete | Lines 53-184 | Full SDK execution loop |
| AbortController registration | ✅ Complete | Lines 76, 82 | `registerSdkController(abortController)` |
| Timeout handling | ✅ Complete | Lines 78-92 | 3600s timeout with abort |
| SDK environment building | ✅ Complete | Line 95 | `await buildSdkEnv({ cwd, logger })` |
| **Tool allowlist enforcement** | ✅ Complete | Lines 98-113 | `tools: effectiveTools` in SDK options |
| Message streaming | ✅ Complete | Lines 117-147 | `for await (const message of query(...))` |
| Error handling | ✅ Complete | Lines 169-180 | `handleSdkError(error, output, logger)` |
| Cleanup | ✅ Complete | Lines 181-183 | `unregisterSdkController(abortController)` |
| `handleSdkError()` helper | ✅ Complete | Lines 186-293 | Auth/rate/context/network errors |
| `formatSdkMessage()` helper | ✅ Complete | Lines 295-328 | Message formatting |
| `emitAgentEventsFromSdkMessage()` helper | ✅ Complete | Lines 330-371 | Event emission |
| ROADMAP.md update | ✅ Complete | Line 23 | Shows `[x]` for codex-sdk-runner.ts |

### Key Implementation Evidence

**Tool Allowlist Enforcement (`codex-sdk-runner.ts:98-113`):**
```typescript
// Get effective tool allowlist
const effectiveTools = getEffectiveToolAllowlist(options);
if (effectiveTools) {
  logger.info(`Tool restrictions active: ${effectiveTools.join(", ")}`);
}

// Build SDK options
const sdkOptions: any = {
  cwd,
  permissionMode: "bypassPermissions",
  allowDangerouslySkipPermissions: true,
  abortController,
  env: sdkEnv,
  ...(options.mcpServers && { mcpServers: options.mcpServers }),
  ...(effectiveTools && { tools: effectiveTools }),  // <-- Tool allowlist enforcement
};
```

**Tool Allowlist Resolution (`codex-sdk-runner.ts:38-51`):**
```typescript
function getEffectiveToolAllowlist(options: CodexRunAgentOptions): string[] | undefined {
  if (options.allowedTools !== undefined) {
    return options.allowedTools;  // Explicit takes precedence
  }
  if (options.phase) {
    return getAllowedToolsForPhase(options.phase);  // Phase-based fallback
  }
  return undefined;  // No restrictions
}
```

## Desired End State

1. ✅ **Implementation complete** - `src/agent/codex-sdk-runner.ts` has 372 lines with full functionality
2. ✅ **ROADMAP.md updated** - Line 23 shows `[x]` for codex-sdk-runner.ts objective

### Verification Commands

```bash
# 1. Build succeeds
bun run build

# 2. TypeScript compiles without errors
npx tsc --noEmit

# 3. Verify file has full implementation (should be ~372 lines)
wc -l src/agent/codex-sdk-runner.ts
# Result: 372 src/agent/codex-sdk-runner.ts

# 4. Verify ROADMAP.md shows [x]
grep "codex-sdk-runner" ROADMAP.md
# Result: - [x] Implement tool allowlist enforcement in `src/agent/codex-sdk-runner.ts`

# 5. Verify tool allowlist is passed to SDK
grep -n "tools: effectiveTools" src/agent/codex-sdk-runner.ts
# Result: 113:      ...(effectiveTools && { tools: effectiveTools }),
```

## What We're NOT Doing

1. **NOT reimplementing the runner** - it's already complete (372 lines)
2. **NOT modifying the tool enforcement logic** - already correct
3. **NOT adding unit tests** - tracked separately under M2 objective "Add integration tests for each experimental SDK"
4. **NOT modifying toolAllowlist.ts** - phase-based allowlists already defined

## Implementation Approach

Since the core implementation was already complete, this item only required:
1. ✅ Verifying the implementation works correctly
2. ✅ Confirming ROADMAP.md shows the objective as complete

---

## Phase 1: Verify Implementation Completeness

### Overview

Verify that the existing implementation meets all requirements.

### Status: ✅ COMPLETE

All verification checks pass:
- ✅ `bun run build` succeeds
- ✅ `npx tsc --noEmit` passes
- ✅ `src/agent/codex-sdk-runner.ts` has 372 lines
- ✅ All helper functions exist
- ✅ Tool allowlist is passed via `tools: effectiveTools`

### Success Criteria:

#### Automated Verification:
- [x] `bun run build` succeeds without errors
- [x] `npx tsc --noEmit` passes
- [x] `src/agent/codex-sdk-runner.ts` is ~372 lines (not 85)

#### Manual Verification:
- [x] grep commands confirm all components exist
- [x] Tool allowlist enforcement is at line 113

---

## Phase 2: Update ROADMAP.md

### Overview

Mark the objective as complete in ROADMAP.md.

### Status: ✅ COMPLETE

ROADMAP.md line 23 already shows:
```markdown
- [x] Implement tool allowlist enforcement in `src/agent/codex-sdk-runner.ts`
```

### Success Criteria:

#### Automated Verification:
- [x] ROADMAP.md shows `[x]` for codex-sdk-runner.ts

#### Manual Verification:
- [x] Line 23 shows `[x]`
- [x] No other lines were modified

---

## Testing Strategy

### Unit Tests:
No unit tests being added in this item. Integration tests are tracked separately under M2.

### Manual Testing Steps:
1. ✅ Build verification: `bun run build`
2. ✅ TypeScript check: `npx tsc --noEmit`
3. ✅ Line count check: `wc -l src/agent/codex-sdk-runner.ts` (372 lines)
4. ✅ ROADMAP.md check: `grep "codex-sdk-runner" ROADMAP.md` (shows `[x]`)

## Migration Notes

No migration required. The implementation is already in place and functional.

## References

- Implementation file: `src/agent/codex-sdk-runner.ts:1-372`
- Reference implementation: `src/agent/amp-sdk-runner.ts:1-372`
- Tool allowlist definitions: `src/agent/toolAllowlist.ts:57-117`
- Dispatch code: `src/agent/runner.ts:459-473`
- ROADMAP: `ROADMAP.md:16-26` (M2 milestone)
- Research: `/Users/speed/wreckit/.wreckit/items/027-implement-tool-allowlist-enforcement-in-srcagentco/research.md`
