# Implement backup mechanism before doctor fixes (spec 010 Gap 3) - Implementation Plan

## Overview

This task completes the implementation of a backup mechanism that creates timestamped backup sessions before the doctor command applies any automated fixes. This ensures users can undo doctor fixes if they cause problems, fulfilling the "Conservative Repair" principle from spec 010.

**Critical Discovery**: The core backup functionality has already been fully implemented in the codebase. This plan focuses on completing the remaining integration work and documentation updates.

## Current State Analysis

### What Already Exists ✅

The backup mechanism is **fully implemented** with the following components:

1. **Backup Module** (`src/fs/backup.ts` - 190 lines):
   - `createSessionId()` - Generates ISO timestamp-based session IDs
   - `createBackupSession()` - Creates backup session directory
   - `backupFile()` - Copies files to backup location with metadata
   - `finalizeBackupSession()` - Writes manifest.json with session details
   - `listBackupSessions()` - Lists all backup sessions (newest first)
   - `cleanupOldBackups()` - Removes old sessions (keeps 10 by default)
   - `removeEmptyBackupSession()` - Cleans up sessions with no files

2. **Backup Path Helpers** (`src/fs/paths.ts:100-110`):
   - `getBackupsDir(root)` - Returns `.wreckit/backups`
   - `getBackupSessionDir(root, sessionId)` - Returns session directory path
   - `getBackupManifestPath(root, sessionId)` - Returns manifest.json path

3. **Backup Schemas** (`src/schemas.ts:202-219`):
   - `BackupFileEntrySchema` - Metadata for individual backed-up files
   - `BackupManifestSchema` - Complete backup session manifest
   - TypeScript types: `BackupFileEntry`, `BackupManifest`

4. **Doctor Integration** (`src/doctor.ts:655-838`):
   - `applyFixes()` creates backup session before any fixes
   - Backs up files for INDEX_STALE, STATE_FILE_MISMATCH, and batch progress fixes
   - Returns `backupSessionId` in results
   - Finalizes manifest or cleans up empty sessions
   - Automatically keeps only 10 most recent backups

5. **CLI Integration** (`src/commands/doctor.ts:89-93`):
   - Displays backup location after fixes complete
   - Shows: `Backup created: .wreckit/backups/<session-id>/`

6. **Comprehensive Test Coverage**:
   - **Unit tests** (`src/__tests__/backup.test.ts` - 467 lines):
     - 12 test suites covering all backup functions
     - Tests for session ID generation, file backup, manifest creation
     - Tests for cleanup and edge cases
   - **Integration tests** (`src/__tests__/doctor.test.ts:753-1000` - 7 test suites):
     - Tests backup creation for each fix type
     - Tests manifest correctness and file content preservation
     - Tests backup cleanup (retention policy)
     - Tests empty session cleanup

### What's Missing ❌

1. **Missing Exports**: Backup functions not exported from `src/fs/index.ts`
2. **Documentation**: Spec 010 Gap 3 still marked "Open"
3. **Documentation**: ROADMAP.md objective not marked complete

### Key Constraints

- Must follow existing code patterns (already done)
- Must preserve all existing functionality (already done)
- Must be backward compatible (already done)
- Cannot change existing test behavior (already done)

## Desired End State

### Verification Criteria

1. ✅ All backup functions exported from `src/fs/index.ts`
2. ✅ Spec 010 Gap 3 updated with "Fixed" status and implementation details
3. ✅ ROADMAP.md M3 objective marked as complete
4. ✅ All existing tests continue to pass
5. ✅ No functional changes to doctor behavior (only adding exports)

### Key Discoveries from Code Review

- **Pattern Consistency**: Backup module follows same patterns as `src/fs/atomic.ts` and `src/fs/lock.ts`
- **Session ID Format**: Uses ISO 8601 timestamps with safe characters (`2025-01-25T14-30-00-000Z`)
- **Backup Structure**: Preserves relative paths under `.wreckit/backups/<session>/`
- **Error Handling**: Returns `null` for missing files (safe), throws for permission errors (conservative)
- **Retention Policy**: Automatic cleanup keeps 10 most recent sessions
- **Integration Points**: Clean separation between backup logic and doctor logic

## What We're NOT Doing

The following items are **explicitly out of scope** to prevent scope creep:

- ❌ Creating a `wreckit restore <session-id>` command (manual restoration is acceptable)
- ❌ Implementing automatic backup restoration on failure
- ❌ Adding backup compression (files are text-based and small)
- ❌ Including git metadata (commit SHA) in backups
- ❌ Tracking backups in item.json or index.json
- ❌ Changing the retention policy from 10 sessions
- ❌ Adding backup functionality to other commands beyond doctor
- ❌ Implementing backup encryption
- ❌ Creating interactive backup selection UI

## Implementation Approach

### High-Level Strategy

Complete the backup mechanism implementation by:
1. Adding missing exports from `src/fs/index.ts` (enables external use)
2. Updating documentation to reflect implemented status
3. Verifying all tests pass (no functional changes)

This is a **documentation and export completion** task, not a feature implementation task. The core functionality is already working and tested.

### Implementation Phases

#### Phase 1: Add Missing Exports
**Rationale**: The backup module exists but isn't exported, making it invisible to external consumers and breaking the established pattern where all fs modules export their utilities.

#### Phase 2: Update Spec 010 Documentation
**Rationale**: Gap 3 status needs to reflect the implemented state with proper implementation details for future maintainers.

#### Phase 3: Update ROADMAP
**Rationale**: Mark the M3 objective as complete to track project progress accurately.

---

## Phase 1: Add Missing Exports

### Overview
Export backup utilities from `src/fs/index.ts` following the established pattern for all fs modules.

### Changes Required

#### 1. Export Backup Utilities
**File**: `src/fs/index.ts`
**Changes**: Add export section for backup utilities

```typescript
export {
  createSessionId,
  createBackupSession,
  backupFile,
  finalizeBackupSession,
  listBackupSessions,
  cleanupOldBackups,
  removeEmptyBackupSession,
} from "./backup";
```

**Location**: After line 47 (after atomic exports), before the lock exports section

**Rationale**: Follows the alphabetical/pattern organization of the file. All other fs modules (paths, json, util, atomic, lock) are exported here, so backup should be too.

### Success Criteria

#### Automated Verification:
- [ ] Tests pass: `npm test` (specifically backup and doctor tests)
- [ ] Type checking passes: `npm run typecheck` (if available)
- [ ] Build succeeds: `npm run build`
- [ ] No import errors from the new exports

#### Manual Verification:
- [ ] Can import backup functions from `src/fs` module
- [ ] All existing doctor tests continue to pass
- [ ] No regressions in backup functionality

**Note**: This phase is purely additive - no behavior changes, only adding missing exports.

---

## Phase 2: Update Spec 010 Documentation

### Overview
Update `specs/010-doctor.md` to mark Gap 3 as fixed with implementation details.

### Changes Required

#### 1. Update Gap 3 Status
**File**: `specs/010-doctor.md`
**Section**: Gap 3: No Backup Before Fix (lines 279-285)

**Current content**:
```markdown
### Gap 3: No Backup Before Fix

Fixes modify files without creating backups.

**Impact:** Cannot undo fixes if they cause problems.

**Status:** Open - No backup mechanism implemented.
```

**New content**:
```markdown
### Gap 3: No Backup Before Fix ✅ FIXED

~~Fixes modify files without creating backups.~~

**Impact:** Cannot undo fixes if they cause problems.

**Status:** Fixed - Backup mechanism implemented. Doctor creates timestamped backup sessions in `.wreckit/backups/<session-id>/` before applying any fixes. Each session includes a `manifest.json` with metadata about backed-up files. Automatically retains the 10 most recent sessions. See `src/fs/backup.ts` for implementation and `src/doctor.ts:655-838` for integration. Users can manually restore files from backup if needed.
```

**Rationale**: Matches the format of other fixed gaps (like Gap 1 and Gap 4) with ✅ indicator, strikethrough of problem statement, and detailed implementation references.

### Success Criteria

#### Automated Verification:
- [ ] Markdown file is valid (no syntax errors)
- [ ] All file references in the update are accurate

#### Manual Verification:
- [ ] Documentation accurately describes the implementation
- [ ] File paths and line numbers are correct
- [ ] Status matches other fixed gaps in the spec

**Note**: Documentation update only - no code changes.

---

## Phase 3: Update ROADMAP

### Overview
Mark the M3 objective as complete in `ROADMAP.md`.

### Changes Required

#### 1. Mark Objective Complete
**File**: `ROADMAP.md`
**Section**: [M3] Robust Error Handling and Recovery (line 35)

**Current content**:
```markdown
#### Objectives
- [ ] Fix silent read errors in artifact detection (specs 002, 010 Gap: errors swallowed)
- [ ] Implement backup mechanism before doctor fixes (spec 010 Gap 3)
- [ ] Improve ambiguous ID resolution to warn/error on multiple matches (spec 009 Gap 3)
- [ ] Add distinct error types for different failure modes across all phases
- [ ] Implement progress persistence for batch operations (spec 009 Gap 2)
```

**New content**:
```markdown
#### Objectives
- [ ] Fix silent read errors in artifact detection (specs 002, 010 Gap: errors swallowed)
- [x] Implement backup mechanism before doctor fixes (spec 010 Gap 3)
- [ ] Improve ambiguous ID resolution to warn/error on multiple matches (spec 009 Gap 3)
- [ ] Add distinct error types for different failure modes across all phases
- [ ] Implement progress persistence for batch operations (spec 009 Gap 2)
```

**Rationale**: Standard checklist format - mark completed items with `[x]`. This objective is fully implemented and tested.

### Success Criteria

#### Automated Verification:
- [ ] Markdown file is valid
- [ ] No syntax errors introduced

#### Manual Verification:
- [ ] ROADMAP accurately reflects implementation status
- [ ] Checkbox format matches other objectives

**Note**: Documentation update only - marks work as complete.

---

## Testing Strategy

### Unit Tests
**Status**: ✅ Already complete (467 lines in `src/__tests__/backup.test.ts`)

All backup functions have comprehensive unit tests:
- Session ID generation (uniqueness, format validation)
- Session creation (directory creation, ID format)
- File backup (content preservation, path structure, missing files)
- Manifest creation (schema validation, multiple files)
- Session listing (sorting, directory filtering)
- Cleanup logic (retention policy, edge cases)
- Empty session removal (idempotent cleanup)

### Integration Tests
**Status**: ✅ Already complete (7 test suites in `src/__tests__/doctor.test.ts`)

Doctor+backup integration fully tested:
- Backup created for STATE_FILE_MISMATCH fix
- Backup created for batch-progress deletion
- Backup created for INDEX_STALE fix
- No backup for MISSING_PROMPTS (doesn't modify files)
- Manifest correctness (file entries, metadata)
- Retention policy (keeps 10, deletes older)
- Empty session cleanup (when no backups needed)

### Manual Testing Steps

Since this is primarily a documentation/export completion task, manual verification is light:

1. **Export Verification** (Phase 1):
   ```bash
   # Verify exports are accessible
   node -e "import { createBackupSession } from './src/fs/index.ts'; console.log('✓ Export works')"
   ```

2. **Doctor Fix Verification** (existing functionality):
   ```bash
   # Create a test repo with an issue
   wreckit init
   echo '{"test": "data"}' > .wreckit/batch-progress.json
   # Run doctor with fix
   wreckit doctor --fix
   # Verify backup was created
   ls -la .wreckit/backups/
   cat .wreckit/backups/*/manifest.json
   ```

3. **Documentation Verification**:
   - Read `specs/010-doctor.md` Gap 3 section
   - Verify it matches format of other fixed gaps
   - Verify ROADMAP.md shows objective as complete

### Regression Testing

All existing tests must continue to pass:
- `npm test` - Full test suite (includes 29 doctor tests)
- Doctor tests specifically: `describe("applyFixes")`, `describe("doctorCommand")`
- Backup tests specifically: All 12 test suites in `backup.test.ts`

## Migration Notes

**No data migration required** - This is:
1. Adding exports for existing code (no breaking changes)
2. Updating documentation to reflect implemented status

Users will see no functional changes. The backup mechanism is already active in production code.

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **Breaking change from adding exports** | Low | Very Low | Purely additive - existing code unaffected |
| **Documentation doesn't match implementation** | Medium | Low | Careful verification of file paths and line numbers |
| **Tests fail due to environment** | Medium | Low | Tests already passing - only adding exports/docs |
| **ROADMAP marking creates confusion** | Low | Very Low | Objective is fully complete - accurate status |

## References

### Implementation Files
- **Backup module**: `/Users/speed/wreckit/src/fs/backup.ts` (1-190)
- **Path helpers**: `/Users/speed/wreckit/src/fs/paths.ts` (100-110)
- **Backup schemas**: `/Users/speed/wreckit/src/schemas.ts` (202-219)
- **Doctor integration**: `/Users/speed/wreckit/src/doctor.ts` (655-838)
- **CLI display**: `/Users/speed/wreckit/src/commands/doctor.ts` (89-93)

### Test Files
- **Unit tests**: `/Users/speed/wreckit/src/__tests__/backup.test.ts` (1-467)
- **Integration tests**: `/Users/speed/wreckit/src/__tests__/doctor.test.ts` (753-1000)

### Documentation Files
- **Spec 010**: `/Users/speed/wreckit/specs/010-doctor.md` (Gap 3 at lines 279-285)
- **ROADMAP**: `/Users/speed/wreckit/ROADMAP.md` (M3 objective at line 35)

### Related Research
- **Research document**: `/Users/speed/wreckit/.wreckit/items/032-implement-backup-mechanism-before-doctor-fixes-spe/research.md`

---

## Summary

This implementation plan completes the backup mechanism feature by:

1. **Adding missing exports** from `src/fs/index.ts` (Phase 1)
2. **Updating spec documentation** to mark Gap 3 as fixed (Phase 2)
3. **Updating ROADMAP** to mark objective complete (Phase 3)

The core backup functionality is **already fully implemented and tested**. This plan focuses solely on export completeness and documentation accuracy. No functional code changes are required beyond adding exports.

**Estimated Effort**: 1-2 hours (primarily documentation verification)
**Risk Level**: Low (purely additive changes and documentation updates)
**Test Coverage**: ✅ Complete (467 lines unit tests + 7 integration test suites)
