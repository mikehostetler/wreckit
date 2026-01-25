# Implement Backup Mechanism Before Doctor Fixes (spec 010 Gap 3) Implementation Plan

## Implementation Plan Title
Implement Backup Mechanism Before Doctor Fixes

## Overview

This item completes the backup mechanism for `wreckit doctor --fix` by adding missing user-facing feedback and comprehensive test coverage. The core backup infrastructure is **already implemented**; this plan focuses on surfacing backup information to users and ensuring robust test coverage.

## Current State Analysis

### What Exists (Already Implemented)

The backup mechanism core is **already fully implemented**:

1. **Backup Module** (`src/fs/backup.ts:1-189`):
   - `createSessionId()` - Generates ISO timestamp-based session IDs
   - `createBackupSession()` - Creates backup directory structure
   - `backupFile()` - Backs up individual files before modification
   - `finalizeBackupSession()` - Writes manifest.json with file list
   - `listBackupSessions()` - Lists all backup sessions (newest first)
   - `cleanupOldBackups()` - Retention policy (keeps last 10 sessions)
   - `removeEmptyBackupSession()` - Cleans up if no backups created

2. **Path Helpers** (`src/fs/paths.ts:100-110`):
   - `getBackupsDir()` - `.wreckit/backups/`
   - `getBackupSessionDir()` - `.wreckit/backups/<sessionId>/`
   - `getBackupManifestPath()` - `.wreckit/backups/<sessionId>/manifest.json`

3. **Schemas** (`src/schemas.ts:201-219`):
   - `BackupFileEntrySchema` - Individual file backup entry
   - `BackupManifestSchema` - Session manifest with file list

4. **Doctor Integration** (`src/doctor.ts:588-759`):
   - `applyFixes()` creates backup session before any fixes
   - Backs up files before: INDEX_STALE, STATE_FILE_MISMATCH, STALE_BATCH_PROGRESS, BATCH_PROGRESS_CORRUPT
   - Skips backup for MISSING_PROMPTS (creates, doesn't modify)
   - `FixResult.backup` field populated for each backed-up file
   - `DoctorResult.backupSessionId` returned to callers

5. **Existing Tests** (`src/__tests__/doctor.test.ts:415-544`):
   - Verifies `backupSessionId` is defined when fixes applied
   - Verifies `backupSessionId` is null when no fixable issues
   - Verifies `results[x].backup` is defined for backed-up files

### Key Discoveries

- **CLI Gap**: `src/commands/doctor.ts` does not display `result.backupSessionId` to users (line 39 destructures result but doesn't use backupSessionId)
- **Test Gap**: No isolated unit tests for `src/fs/backup.ts` functions
- **Spec Gap**: `specs/010-doctor.md:279-285` still shows Gap 3 as "Open"
- **Backup Storage**: Files stored in `.wreckit/backups/<sessionId>/` preserving directory structure
- **Retention Policy**: Automatically keeps last 10 backup sessions

## Desired End State

After completing this item:

1. Users running `wreckit doctor --fix` see backup session location in CLI output
2. Backup module has comprehensive isolated unit tests covering:
   - Session creation and cleanup
   - File backup with correct paths
   - Manifest generation
   - Retention policy (cleanup of old backups)
   - Edge cases (file doesn't exist, permission errors)
3. Spec 010 Gap 3 is marked as "FIXED" with implementation notes

### How to Verify

```bash
# Run all tests
npm test

# Run doctor tests specifically
npm test -- --grep "doctor|backup"

# Manual verification
wreckit doctor --fix
# Should see: "Backup created: .wreckit/backups/2025-01-25T..."
```

## What We're NOT Doing

1. **NOT implementing `doctor --restore`** - Future enhancement; manual file copy is sufficient for now
2. **NOT adding `--no-backup` flag** - Backups are always created (conservative approach)
3. **NOT changing backup storage format** - Current session-based structure is correct
4. **NOT modifying core backup logic** - Already implemented correctly in `src/fs/backup.ts`

## Implementation Approach

The implementation focuses on the three remaining gaps:
1. CLI output enhancement (show backup location to users)
2. Comprehensive unit tests for backup module
3. Documentation update (mark Gap 3 as fixed)

---

## Phases

### Phase 1: CLI Output Enhancement

#### Overview

Add backup session feedback to the `doctorCommand()` output so users know where backups are stored after fixes are applied.

#### Changes Required:

##### 1. Update Doctor Command Output
**File**: `src/commands/doctor.ts`
**Changes**: Display backup session ID when fixes are applied. Update line 39 to destructure `backupSessionId` and add output after fix summary.

```typescript
// Line 39: Update destructuring
const { diagnostics, fixes, backupSessionId } = result;

// After line 87 (after "Fixed X issue(s)" output):
if (backupSessionId) {
  console.log("");
  console.log(`Backup created: .wreckit/backups/${backupSessionId}/`);
}
```

#### Success Criteria:

##### Automated Verification:
- [ ] Tests pass: `npm test`
- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`

##### Manual Verification:
- [ ] Run `wreckit doctor --fix` on a repo with fixable issues
- [ ] Verify output includes "Backup created: .wreckit/backups/..." line
- [ ] Verify backup directory exists at specified path
- [ ] Verify manifest.json exists in backup directory

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to next phase.

---

### Phase 2: Backup Module Unit Tests

#### Overview

Add comprehensive unit tests for `src/fs/backup.ts` to ensure backup functions work correctly in isolation.

#### Changes Required:

##### 1. Create Backup Test File
**File**: `src/__tests__/backup.test.ts` (new file)
**Changes**: Comprehensive unit tests for all backup module functions.

Key test cases:
- `createSessionId()` - Format validation, uniqueness
- `createBackupSession()` - Directory creation
- `backupFile()` - File copying, path preservation, null return for missing files
- `finalizeBackupSession()` - Manifest writing with correct schema
- `listBackupSessions()` - Empty list, sorting (newest first)
- `cleanupOldBackups()` - Retention policy enforcement
- `removeEmptyBackupSession()` - Cleanup without errors

#### Success Criteria:

##### Automated Verification:
- [ ] Tests pass: `npm test`
- [ ] All new backup tests pass
- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`

##### Manual Verification:
- [ ] Review test coverage for edge cases
- [ ] Verify tests are isolated (don't depend on system state)

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to next phase.

---

### Phase 3: Doctor Command Test Enhancement

#### Overview

Add tests to verify the CLI output includes backup session information.

#### Changes Required:

##### 1. Add CLI Output Tests
**File**: `src/__tests__/doctor.test.ts`
**Changes**: Add tests to the `doctorCommand` describe block.

Test cases:
- Shows backup session location when fixes applied
- Does not show backup message when no fixes needed
- Does not show backup message when only MISSING_PROMPTS fixed

#### Success Criteria:

##### Automated Verification:
- [ ] Tests pass: `npm test`
- [ ] New CLI output tests pass
- [ ] Type checking passes: `npm run typecheck`

##### Manual Verification:
- [ ] Tests correctly verify the expected CLI behavior

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to next phase.

---

### Phase 4: Documentation Update

#### Overview

Update spec 010 to mark Gap 3 as fixed.

#### Changes Required:

##### 1. Update Spec 010 Gap 3
**File**: `specs/010-doctor.md`
**Changes**: Mark Gap 3 as fixed (lines 279-285)

Replace:
```markdown
### Gap 3: No Backup Before Fix

Fixes modify files without creating backups.

**Impact:** Cannot undo fixes if they cause problems.

**Status:** Open - No backup mechanism implemented.
```

With:
```markdown
### Gap 3: No Backup Before Fix ✅ FIXED

~~Fixes modify files without creating backups.~~

~~**Impact:** Cannot undo fixes if they cause problems.~~

**Status:** Fixed - Backup mechanism implemented in `src/fs/backup.ts`. Backups are created in `.wreckit/backups/<session-id>/` before any file modifications. Keeps last 10 backup sessions. See:
- `src/fs/backup.ts` - Core backup functions
- `src/doctor.ts:588-759` - Integration in `applyFixes()`
- CLI shows backup location after fixes applied
```

#### Success Criteria:

##### Automated Verification:
- [ ] No automated verification needed for documentation

##### Manual Verification:
- [ ] Gap 3 section clearly marked as FIXED
- [ ] Implementation details are accurate
- [ ] Format consistent with Gap 1 (already fixed)

**Note**: This is a documentation-only change.

---

## Testing Strategy

### Unit Tests (Phase 2)

New `src/__tests__/backup.test.ts` covers:
- `createSessionId()` - Format, uniqueness, sortability
- `createBackupSession()` - Directory creation, return value
- `backupFile()` - File backup, non-existent files, directory structure, operation types
- `finalizeBackupSession()` - Manifest writing
- `listBackupSessions()` - Empty list, sorting
- `cleanupOldBackups()` - Retention policy
- `removeEmptyBackupSession()` - Cleanup, idempotency

### Integration Tests (Existing + Phase 3)

`src/__tests__/doctor.test.ts` already covers:
- Backup created for STATE_FILE_MISMATCH fix
- Backup created for STALE_BATCH_PROGRESS fix
- No backup for non-fixable issues
- Session ID returned when backups created

New tests verify:
- CLI output includes backup session location
- No backup message when no fixes needed

### Manual Testing Steps

1. Create a repo with fixable issues:
   ```bash
   wreckit init
   mkdir -p .wreckit/items/001-test
   echo '{"schema_version":1,"id":"001-test","title":"Test","state":"researched","overview":"x","branch":null,"pr_url":null,"pr_number":null,"last_error":null,"created_at":"2025-01-01","updated_at":"2025-01-01"}' > .wreckit/items/001-test/item.json
   ```

2. Run doctor without fix:
   ```bash
   wreckit doctor
   # Should show STATE_FILE_MISMATCH warning
   ```

3. Run doctor with fix:
   ```bash
   wreckit doctor --fix
   # Should show:
   # - Fix applied message
   # - "Backup created: .wreckit/backups/..." line
   ```

4. Verify backup:
   ```bash
   ls .wreckit/backups/
   cat .wreckit/backups/*/manifest.json
   ```

---

## Migration Notes

No migration needed. The backup mechanism is already implemented. This plan only adds CLI output, tests, and documentation updates.

## References

- Research: `/Users/speed/wreckit/.wreckit/items/032-implement-backup-mechanism-before-doctor-fixes-spe/research.md`
- Spec: `specs/010-doctor.md:279-285` (Gap 3)
- Implementation: `src/fs/backup.ts:1-189`
- Integration: `src/doctor.ts:588-759`
- CLI: `src/commands/doctor.ts:32-107`
- Existing Tests: `src/__tests__/doctor.test.ts:415-544`
