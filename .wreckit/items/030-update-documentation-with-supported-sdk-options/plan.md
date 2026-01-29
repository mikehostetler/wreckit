# Update documentation with supported SDK options Implementation Plan

## Overview

This task completes milestone [M2] (Finish Experimental SDK Integrations) by marking the documentation objective as done. After verification, all SDK documentation is already in place across README.md, MIGRATION.md, and AGENTS.md. The only remaining work is updating ROADMAP.md to reflect completion.

## Current State Analysis

### Documentation Already Complete

Verification of existing documentation shows all five agent backends are fully documented:

| SDK Backend | README.md | MIGRATION.md | AGENTS.md |
|-------------|-----------|--------------|-----------|
| `process` | Lines 224-250 | Lines 150-161 | Line 106 |
| `claude_sdk` | Lines 175-186 | Lines 138-148 | Line 102 |
| `amp_sdk` | Lines 195-203 | Lines 198-215 | Line 103 |
| `codex_sdk` | Lines 205-213 | Lines 216-233 | Line 104 |
| `opencode_sdk` | Lines 215-222 | Lines 234-249 | Line 105 |

### Key Discoveries:

- `README.md:163-253` - Agent Options section comprehensively documents all five agent kinds with JSON configuration examples
- `README.md:189-222` - Experimental SDK Modes subsection with clear warning and configuration for amp_sdk, codex_sdk, opencode_sdk
- `MIGRATION.md:187-274` - Full experimental SDK documentation including configuration tables, switching instructions, and shared features
- `AGENTS.md:98-108` - Agent Kind Options table with all five kinds and descriptions
- `ROADMAP.md:26` - Objective still marked as incomplete: `- [ ] Update documentation with supported SDK options`
- `src/schemas.ts:36-70` - Schema definitions match documentation exactly

### Milestone M2 Status

All objectives for [M2] Finish Experimental SDK Integrations are now complete:
- Item 026: Implemented tool allowlist enforcement in `amp-sdk-runner.ts` (done)
- Item 027: Implemented tool allowlist enforcement in `codex-sdk-runner.ts` (done)
- Item 028: Implemented tool allowlist enforcement in `opencode-sdk-runner.ts` (done)
- Item 029: Added integration tests for each experimental SDK (done)
- Item 030: Update documentation with supported SDK options (documentation exists, just needs ROADMAP.md update)

## Desired End State

After completion:
1. `ROADMAP.md` line 26 shows: `- [x] Update documentation with supported SDK options`
2. Milestone [M2] has all objectives marked as complete

### Verification Method

```bash
# Verify the checkbox is marked complete
grep -n "\[x\] Update documentation with supported SDK options" ROADMAP.md

# Verify all M2 objectives are checked
grep -A5 "Finish Experimental SDK Integrations" ROADMAP.md | grep -c "\[x\]"
# Should return 5 (all objectives complete)
```

## What We're NOT Doing

- **NOT modifying README.md** - Documentation already complete (lines 163-253)
- **NOT modifying MIGRATION.md** - Documentation already complete (lines 187-274)
- **NOT modifying AGENTS.md** - Documentation already complete (lines 98-108)
- **NOT adding new SDK documentation** - All SDKs already documented
- **NOT creating new documentation files** - No new files needed
- **NOT changing schema definitions** - Schemas match documentation
- **NOT updating CHANGELOG.md** - Entry for SDK documentation already exists

## Implementation Approach

This is a single-line change to update the checkbox in ROADMAP.md from `[ ]` to `[x]`.

---

## Phase 1: Mark Documentation Objective Complete in ROADMAP.md

### Overview

Update ROADMAP.md to reflect that documentation for experimental SDK options is complete, thereby completing milestone [M2].

### Changes Required:

#### 1. Update ROADMAP.md Checkbox

**File**: `ROADMAP.md`
**Line**: 26
**Changes**: Change checkbox from unchecked to checked

**Before:**
```markdown
- [ ] Update documentation with supported SDK options
```

**After:**
```markdown
- [x] Update documentation with supported SDK options
```

### Success Criteria:

#### Automated Verification:
- [ ] `grep "\[x\] Update documentation with supported SDK options" ROADMAP.md` returns a match
- [ ] Build succeeds: `bun run build` (no documentation changes affect build)
- [ ] Lint passes: `bun run lint`

#### Manual Verification:
- [ ] Review ROADMAP.md and confirm line 26 shows `[x]` checkbox
- [ ] Confirm all five M2 objectives now show `[x]` (lines 22-26)
- [ ] Verify README.md Agent Options section is accurate (lines 163-253)
- [ ] Verify MIGRATION.md Experimental SDK Modes section is accurate (lines 187-274)
- [ ] Verify AGENTS.md Agent Kind Options table is accurate (lines 98-108)

**Note**: This is a documentation-only change. No code changes or test runs are required.

---

## Testing Strategy

### Unit Tests:
- None required - documentation change only

### Integration Tests:
- None required - documentation change only

### Manual Testing Steps:
1. Open ROADMAP.md and verify line 26 now shows `[x]`
2. Count checked objectives under M2 section (should be 5 total)
3. Cross-reference README.md Agent Options section (lines 163-253) to confirm SDK documentation accuracy
4. Cross-reference MIGRATION.md Experimental SDK Modes section (lines 187-274) to confirm detailed configuration reference
5. Cross-reference AGENTS.md Agent Kind Options table (lines 98-108) to confirm developer guidelines

## Migration Notes

Not applicable - no schema changes or data migrations required.

## References

- Research: `/Users/speed/wreckit/.wreckit/items/030-update-documentation-with-supported-sdk-options/research.md`
- ROADMAP.md objective: Line 26
- README.md Agent Options: Lines 163-253
- README.md Experimental SDK Modes: Lines 189-222
- MIGRATION.md Experimental SDK Modes: Lines 187-274
- AGENTS.md Agent Kind Options: Lines 98-108
- Schema definitions: `src/schemas.ts:36-70`
