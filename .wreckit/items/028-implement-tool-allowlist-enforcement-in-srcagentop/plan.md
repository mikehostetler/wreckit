# Implement tool allowlist enforcement in `src/agent/opencode-sdk-runner.ts` Implementation Plan

## Overview

This item implements tool allowlist enforcement in the OpenCode SDK runner, completing milestone [M2] "Finish Experimental SDK Integrations". The implementation follows the established pattern from the Amp SDK (item 026) and Codex SDK (item 027) runners, using the `@anthropic-ai/claude-agent-sdk` package with the `tools` option to restrict available tools per workflow phase.

**Important Discovery**: Upon code verification, the implementation has already been completed:
- `src/agent/opencode-sdk-runner.ts` contains 372 lines of working SDK integration code
- `src/__tests__/opencode-sdk-runner.test.ts` contains 127 lines of unit tests
- `ROADMAP.md` line 24 is already marked complete with `[x]`

This plan documents the work that was done and provides verification steps.

## Current State Analysis

The OpenCode SDK runner is **fully implemented** with complete feature parity to the Amp and Codex SDK runners:

| Component | Status | Location |
|-----------|--------|----------|
| SDK import (`query`) | Complete | `opencode-sdk-runner.ts:1` |
| Controller registration | Complete | `opencode-sdk-runner.ts:4,82,182` |
| Environment building (`buildSdkEnv`) | Complete | `opencode-sdk-runner.ts:8,95` |
| `OpenCodeRunAgentOptions` interface | Complete | `opencode-sdk-runner.ts:10-25` |
| `getEffectiveToolAllowlist()` function | Complete | `opencode-sdk-runner.ts:38-51` |
| Dry-run support | Complete | `opencode-sdk-runner.ts:58-71` |
| AbortController + timeout | Complete | `opencode-sdk-runner.ts:73-92` |
| SDK options with `tools` allowlist | Complete | `opencode-sdk-runner.ts:104-114` |
| Query message iteration | Complete | `opencode-sdk-runner.ts:117-147` |
| Timeout/success result handling | Complete | `opencode-sdk-runner.ts:149-168` |
| Error handling (`handleSdkError`) | Complete | `opencode-sdk-runner.ts:186-293` |
| Message formatting (`formatSdkMessage`) | Complete | `opencode-sdk-runner.ts:295-328` |
| Event emission (`emitAgentEventsFromSdkMessage`) | Complete | `opencode-sdk-runner.ts:330-371` |
| Unit tests | Complete | `opencode-sdk-runner.test.ts:1-127` |
| ROADMAP.md updated | Complete | `ROADMAP.md:24` |

### Key Discoveries:

- **Implementation is complete**: `src/agent/opencode-sdk-runner.ts:1-372` contains full SDK integration
- **Tests exist**: `src/__tests__/opencode-sdk-runner.test.ts:1-127` follows the established pattern
- **ROADMAP already updated**: Line 24 shows `[x] Implement tool allowlist enforcement in src/agent/opencode-sdk-runner.ts`
- **Same SDK as siblings**: Uses `@anthropic-ai/claude-agent-sdk` like Amp/Codex runners
- **Tool allowlist enforced**: SDK's `tools` option restricts available tools (line 113)

## Desired End State

The desired end state has been achieved:

1. **`runOpenCodeSdkAgent` function** fully implements SDK integration with:
   - AbortController registration/cleanup for graceful shutdown (lines 76-92, 181-183)
   - Timeout handling (default 3600 seconds) (lines 78-79, 85-92)
   - Environment resolution via `buildSdkEnv()` (line 95)
   - Tool allowlist enforcement via SDK's `tools` option (line 113)
   - Message streaming with formatted output (lines 117-147)
   - Structured event emission for TUI integration (lines 125-127)
   - Categorized error handling (auth, rate limit, context, network) (lines 186-293)

2. **Test file** `src/__tests__/opencode-sdk-runner.test.ts` verifies:
   - Dry-run mode returns success without calling SDK
   - Tool restrictions are logged when `allowedTools` provided
   - Explicit `allowedTools` takes precedence over phase
   - Falls back to phase-based allowlist when no explicit tools
   - No restrictions when neither `allowedTools` nor phase specified

3. **ROADMAP.md** line 24 marked complete: `[x] Implement tool allowlist enforcement in src/agent/opencode-sdk-runner.ts`

### Verification Method

1. **Automated**: `bun test` passes including opencode-sdk-runner.test.ts
2. **Automated**: `bun run typecheck` passes
3. **Automated**: `bun run lint` passes
4. **Automated**: `bun run build` succeeds

## What We're NOT Doing

1. **NOT re-implementing** - The SDK integration is complete
2. **NOT modifying tests** - The tests follow the established pattern and cover all required scenarios
3. **NOT adding new configuration options** - The schema is intentionally minimal (`kind: "opencode_sdk"` only)
4. **NOT adding integration tests** - That's a separate objective in [M2]: "Add integration tests for each experimental SDK"

## Implementation Approach

The implementation followed the established pattern from `amp-sdk-runner.ts`:

1. **Copied SDK integration structure** - Same `query()` iteration, options, and result handling
2. **Reused helper functions** - `handleSdkError()`, `formatSdkMessage()`, `emitAgentEventsFromSdkMessage()` are identical patterns
3. **Updated error messages** - Changed "Amp SDK" to "OpenCode SDK" in error strings
4. **Preserved existing scaffolding** - Kept the already-correct `getEffectiveToolAllowlist()` and options interface

---

## Phase 1: SDK Integration Implementation

### Overview

Implement the full SDK integration in `runOpenCodeSdkAgent`, replacing any stub with complete execution logic including AbortController, timeout, environment building, and SDK query iteration.

### Changes Required:

#### 1. SDK and Helper Imports

**File**: `src/agent/opencode-sdk-runner.ts`
**Status**: COMPLETE

The file includes all necessary imports:
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

#### 2. SDK Execution Logic

**File**: `src/agent/opencode-sdk-runner.ts`
**Status**: COMPLETE

The implementation includes:
- AbortController creation and registration (lines 73-92)
- Timeout setup (3600 seconds default)
- Environment building via `buildSdkEnv()`
- SDK options construction with `tools` for allowlist enforcement
- Async iteration over `query()` messages
- Message formatting and event emission
- Error handling in catch block
- Cleanup in finally block

#### 3. Helper Functions

**File**: `src/agent/opencode-sdk-runner.ts`
**Status**: COMPLETE

Three helper functions implemented:
- `handleSdkError()` - Categorizes errors (auth, rate limit, context, network) with OpenCode-specific messages (lines 186-293)
- `formatSdkMessage()` - Converts SDK messages to output strings (lines 295-328)
- `emitAgentEventsFromSdkMessage()` - Emits structured events for TUI (lines 330-371)

### Success Criteria:

#### Automated Verification:
- [x] Type checking passes: `bun run typecheck`
- [x] Linting passes: `bun run lint`
- [x] Build succeeds: `bun run build`
- [x] Existing tests pass: `bun test`

#### Manual Verification:
- [x] Implementation matches amp-sdk-runner.ts structure
- [x] Error messages say "OpenCode SDK" not "Amp SDK"

**Note**: Phase 1 is complete.

---

## Phase 2: Unit Tests

### Overview

Create unit tests for the OpenCode SDK runner following the established pattern from `amp-sdk-runner.test.ts` and `codex-sdk-runner.test.ts`. Tests verify dry-run behavior and tool allowlist resolution logic.

### Changes Required:

#### 1. Test File

**File**: `src/__tests__/opencode-sdk-runner.test.ts`
**Status**: COMPLETE

Test file exists with 5 test cases:

**`dry-run mode` describe block:**
- `returns success without calling SDK` - Verifies dry-run returns success with `[dry-run]` in output
- `logs tool restrictions when allowedTools provided` - Verifies debug log includes tool restrictions

**`getEffectiveToolAllowlist resolution` describe block:**
- `prefers explicit allowedTools over phase` - allowedTools `["Read"]` with phase `"implement"` should only restrict to Read
- `falls back to phase-based allowlist when no explicit tools` - phase `"research"` should give Read, Write, Glob, Grep
- `has no restrictions when neither allowedTools nor phase specified` - No tool restrictions logged

### Success Criteria:

#### Automated Verification:
- [x] All tests pass: `bun test`
- [x] Test file is included in test run
- [x] Type checking passes: `bun run typecheck`

#### Manual Verification:
- [x] Test output shows all 5 tests passing for opencode-sdk-runner.test.ts
- [x] Test coverage includes all three SDK runners (amp, codex, opencode)

**Note**: Phase 2 is complete.

---

## Phase 3: Documentation Update

### Overview

Mark the objective as complete in ROADMAP.md to reflect the finished implementation.

### Changes Required:

#### 1. ROADMAP.md Update

**File**: `ROADMAP.md`
**Status**: COMPLETE

Line 24 shows: `- [x] Implement tool allowlist enforcement in src/agent/opencode-sdk-runner.ts`

### Success Criteria:

#### Automated Verification:
- [x] Lint passes (no trailing whitespace): `bun run lint`

#### Manual Verification:
- [x] ROADMAP.md shows 3 of 5 objectives complete for [M2]:
  - [x] Implement tool allowlist enforcement in `src/agent/amp-sdk-runner.ts`
  - [x] Implement tool allowlist enforcement in `src/agent/codex-sdk-runner.ts`
  - [x] Implement tool allowlist enforcement in `src/agent/opencode-sdk-runner.ts`
  - [ ] Add integration tests for each experimental SDK
  - [ ] Update documentation with supported SDK options

**Note**: Phase 3 is complete.

---

## Testing Strategy

### Unit Tests:

**File**: `src/__tests__/opencode-sdk-runner.test.ts` (exists)

| Test | Purpose | Status |
|------|---------|--------|
| `returns success without calling SDK` | Verifies dry-run mode works | Complete |
| `logs tool restrictions when allowedTools provided` | Verifies allowlist logging | Complete |
| `prefers explicit allowedTools over phase` | Verifies precedence order | Complete |
| `falls back to phase-based allowlist when no explicit tools` | Verifies phase fallback | Complete |
| `has no restrictions when neither allowedTools nor phase specified` | Verifies no-restriction default | Complete |

### Integration Tests:

Not in scope for this item - tracked as separate objective in [M2]: "Add integration tests for each experimental SDK"

### Manual Testing Steps:

1. **Run automated tests:**
   ```bash
   bun test src/__tests__/opencode-sdk-runner.test.ts
   ```
   Expected: All 5 tests pass

2. **Type check:**
   ```bash
   bun run typecheck
   ```
   Expected: No errors

3. **Build:**
   ```bash
   bun run build
   ```
   Expected: Success

4. **Verify ROADMAP status:**
   ```bash
   grep -n "opencode-sdk-runner" ROADMAP.md
   ```
   Expected: Shows `[x]` indicating complete

## Migration Notes

No migration required. The implementation is complete and backward-compatible. Any configurations using `kind: "opencode_sdk"` will work as expected.

## References

- Research: `/Users/speed/wreckit/.wreckit/items/028-implement-tool-allowlist-enforcement-in-srcagentop/research.md`
- Implementation: `src/agent/opencode-sdk-runner.ts:1-372`
- Unit tests: `src/__tests__/opencode-sdk-runner.test.ts:1-127`
- Reference (Amp): `src/agent/amp-sdk-runner.ts:1-372`
- Reference (Codex): `src/agent/codex-sdk-runner.ts:1-372`
- Tool allowlist: `src/agent/toolAllowlist.ts:57-117`
- Environment builder: `src/agent/env.ts:79-108`
- Dispatcher: `src/agent/runner.ts:475-489`
- Schema: `src/schemas.ts:60-62`
- Milestone: `ROADMAP.md:16-27`
