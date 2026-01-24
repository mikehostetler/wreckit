# Implement tool allowlist enforcement in `src/agent/codex-sdk-runner.ts` Implementation Plan

## Overview

This item ensures tool allowlist enforcement is correctly implemented in the Codex SDK runner, completing one of the objectives in milestone [M2] Finish Experimental SDK Integrations.

## Current State Analysis

**Critical Discovery:** The implementation is **ALREADY COMPLETE** in `src/agent/codex-sdk-runner.ts`. The file contains a full 372-line implementation with all required functionality. The previous plan was based on outdated research that showed only 85 lines with a stub.

### Verified Implementation Status (2026-01-24)

The source file `src/agent/codex-sdk-runner.ts` contains:

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

1. **ROADMAP.md** line 23 marked as complete (`[x]`)
2. All verification checks pass

### How to Verify Implementation is Complete

```bash
# 1. Build succeeds
bun run build

# 2. TypeScript compiles without errors
npx tsc --noEmit

# 3. Verify file has full implementation (should be ~372 lines, not 85)
wc -l src/agent/codex-sdk-runner.ts
# Expected: 372 src/agent/codex-sdk-runner.ts

# 4. Verify key functions exist
grep -n "function handleSdkError" src/agent/codex-sdk-runner.ts
grep -n "function formatSdkMessage" src/agent/codex-sdk-runner.ts
grep -n "function emitAgentEventsFromSdkMessage" src/agent/codex-sdk-runner.ts

# 5. Verify tool allowlist is passed to SDK
grep -n "tools: effectiveTools" src/agent/codex-sdk-runner.ts
# Expected: Line 113
```

## What We're NOT Doing

1. **NOT reimplementing the runner** - it's already complete (372 lines)
2. **NOT modifying the tool enforcement logic** - already correct
3. **NOT adding unit tests** - tracked separately under M2 objective "Add integration tests for each experimental SDK"
4. **NOT modifying toolAllowlist.ts** - phase-based allowlists already defined

## Implementation Approach

Since the core implementation is complete, this item only requires:
1. Verifying the implementation works correctly
2. Updating ROADMAP.md to mark the objective as complete

---

## Phase 1: Verify Implementation Completeness

### Overview

Verify that the existing implementation meets all requirements before marking the objective as complete.

### Verification Steps:

#### 1. Build Verification
```bash
bun run build
```
**Expected:** Build succeeds, `dist/agent/codex-sdk-runner.js` is generated.

#### 2. TypeScript Verification
```bash
npx tsc --noEmit
```
**Expected:** No TypeScript errors.

#### 3. Implementation Verification
Check that all required components exist:

| Component | Verification Command | Expected Result |
|-----------|---------------------|-----------------|
| Full implementation | `wc -l src/agent/codex-sdk-runner.ts` | ~372 lines |
| SDK import | `grep "query" src/agent/codex-sdk-runner.ts \| head -1` | Line 1: import { query } |
| Tool allowlist | `grep "tools: effectiveTools" src/agent/codex-sdk-runner.ts` | Line 113 |
| Error handler | `grep "handleSdkError" src/agent/codex-sdk-runner.ts` | Multiple matches |
| Message formatter | `grep "formatSdkMessage" src/agent/codex-sdk-runner.ts` | Multiple matches |
| Event emitter | `grep "emitAgentEventsFromSdkMessage" src/agent/codex-sdk-runner.ts` | Multiple matches |

#### 4. Dry-Run Verification (Optional)
If wreckit is available:
```bash
# Configure codex_sdk agent
echo '{"agent": {"kind": "codex_sdk"}}' > /tmp/test-wreckit/.wreckit/config.json

# Test dry-run
cd /tmp/test-wreckit && wreckit research test-item --dry-run
```
**Expected:** "[dry-run] Would run Codex SDK agent" logged.

### Success Criteria:

#### Automated Verification:
- [ ] `bun run build` succeeds without errors
- [ ] `npx tsc --noEmit` passes
- [ ] `src/agent/codex-sdk-runner.ts` is ~372 lines (not 85)

#### Manual Verification:
- [ ] grep commands confirm all components exist
- [ ] (Optional) Dry-run test works with codex_sdk agent

**Note**: Complete all automated verification, then proceed to Phase 2.

---

## Phase 2: Update ROADMAP.md

### Overview

Mark the objective as complete in ROADMAP.md to reflect that tool allowlist enforcement is implemented.

### Changes Required:

#### 1. Update Milestone M2 Objectives
**File**: `ROADMAP.md`
**Line**: 23
**Change**: Update checkbox from `[ ]` to `[x]`

Current:
```markdown
- [ ] Implement tool allowlist enforcement in `src/agent/codex-sdk-runner.ts`
```

New:
```markdown
- [x] Implement tool allowlist enforcement in `src/agent/codex-sdk-runner.ts`
```

### Success Criteria:

#### Automated Verification:
- [ ] ROADMAP.md modified successfully
- [ ] grep confirms change: `grep "codex-sdk-runner" ROADMAP.md` shows `[x]`

#### Manual Verification:
- [ ] ROADMAP.md line 23 shows `[x]` for codex-sdk-runner.ts objective
- [ ] No other lines were accidentally modified

---

## Testing Strategy

### Unit Tests:
No unit tests being added in this item. The codebase does not have unit tests for SDK runners (amp-sdk-runner.ts also has no unit tests). Integration tests are tracked separately under M2.

### Integration Tests:
Out of scope. Tracked under M2 objective: "Add integration tests for each experimental SDK"

### Manual Testing Steps:
1. Build verification: `bun run build`
2. TypeScript check: `npx tsc --noEmit`
3. Line count check: `wc -l src/agent/codex-sdk-runner.ts` (should be ~372)
4. ROADMAP.md check: `grep "codex-sdk-runner" ROADMAP.md` (should show `[x]`)

## Migration Notes

No migration required. The implementation is already in place and functional.

## References

- Implementation file: `src/agent/codex-sdk-runner.ts:1-372`
- Reference implementation: `src/agent/amp-sdk-runner.ts:1-372`
- Tool allowlist definitions: `src/agent/toolAllowlist.ts:57-117`
- Dispatch code: `src/agent/runner.ts:459-473`
- ROADMAP: `ROADMAP.md:16-26` (M2 milestone)
- Research: `/Users/speed/wreckit/.wreckit/items/027-implement-tool-allowlist-enforcement-in-srcagentco/research.md`
