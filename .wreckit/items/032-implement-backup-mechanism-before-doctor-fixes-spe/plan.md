# Implement Backup Mechanism Before Doctor Fixes (spec 010 Gap 3) Implementation Plan

## Overview

This item implements a backup mechanism for `wreckit doctor --fix` as specified in Gap 3 of spec 010 (`specs/010-doctor.md:279-285`). The backup mechanism creates timestamped backups of files before any modifications, allowing users to recover original state if needed.

**Current Status:** The core implementation is complete. All infrastructure, doctor integration, CLI output, and tests are implemented. The only remaining work is updating the spec documentation to mark Gap 3 as fixed.

## Current State

### Implementation Complete

The backup mechanism is **fully implemented**:

1. **Backup Module** (`src/fs/backup.ts:1-189`):
   - `createSessionId()` - Generates ISO timestamp-based session IDs (safe for filenames)
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

5. **CLI Output** (`src/commands/doctor.ts`):
   - Shows "Backup created: .wreckit/backups/<session-id>/" when fixes applied

6. **Test Coverage** (`src/__tests__/doctor.test.ts`):
   - Verifies `backupSessionId` is defined when fixes applied
   - Verifies `backupSessionId` is null when no fixable issues
   - Verifies `results[x].backup` is defined for backed-up files

### Key Discoveries

- **Backup Storage**: Files stored in `.wreckit/backups/<sessionId>/` preserving directory structure relative to `.wreckit/`
- **Retention Policy**: Automatically keeps last 10 backup sessions
- **Session ID Format**: ISO timestamp with safe characters (e.g., `2025-01-24T14-30-00-000Z`)
- **Conservative Repair**: Follows spec 010 security model - backup before modify, never delete without recovery path

## Desired End State

After completing this item:

1. All backup functionality working (DONE)
2. CLI shows backup location to users (DONE)
3. Comprehensive test coverage (DONE)
4. Spec 010 Gap 3 marked as "FIXED" (REMAINING)

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
4. **NOT making retention configurable** - Hardcoded to 10 sessions

## Implementation Approach

Session-based directory structure for backups:
```
.wreckit/
  backups/
    2025-01-24T14-30-00-000Z/
      manifest.json
      batch-progress.json      # Full copy if deleted
      index.json               # Full copy if regenerated
      items/
        001-feature/
          item.json            # Full copy before state modification
```

---

## Phases

### Phase 1: Core Infrastructure (COMPLETE)

#### Overview
Add path helpers, schemas, and backup module with core functions.

#### Status: COMPLETE

Files implemented:
- `src/fs/paths.ts` - Added `getBackupsDir()`, `getBackupSessionDir()`, `getBackupManifestPath()`
- `src/schemas.ts` - Added `BackupFileEntrySchema`, `BackupManifestSchema`
- `src/fs/backup.ts` - New module with all backup functions

---

### Phase 2: Doctor Integration (COMPLETE)

#### Overview
Integrate backup creation into `applyFixes()` for all fix types that modify or delete files.

#### Status: COMPLETE

Changes implemented:
- `src/doctor.ts` - `FixResult` and `DoctorResult` interfaces updated with backup fields
- `src/doctor.ts` - `applyFixes()` creates backups before INDEX_STALE, STATE_FILE_MISMATCH, STALE_BATCH_PROGRESS, BATCH_PROGRESS_CORRUPT fixes
- `src/doctor.ts` - Session lifecycle: create, finalize, cleanup old sessions

---

### Phase 3: CLI Output (COMPLETE)

#### Overview
Display backup session location in doctor command output.

#### Status: COMPLETE

Changes implemented:
- `src/commands/doctor.ts` - Destructures `backupSessionId` from result
- `src/commands/doctor.ts` - Shows "Backup created: .wreckit/backups/<session-id>/" when applicable

---

### Phase 4: Testing (COMPLETE)

#### Overview
Add comprehensive unit tests for backup module and doctor integration tests.

#### Status: COMPLETE

Tests implemented in `src/__tests__/doctor.test.ts`:
- Backup created for STATE_FILE_MISMATCH fix
- Backup created for STALE_BATCH_PROGRESS fix
- Backup created for INDEX_STALE fix
- No backup for MISSING_PROMPTS fix
- Backup manifest contains correct entries
- `backupSessionId` returned when backups created
- `backupSessionId` is null when no backups needed

---

### Phase 5: Documentation Update (REMAINING)

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

---

## Testing Strategy

### Unit Tests (COMPLETE)

Tests in `src/__tests__/doctor.test.ts` cover:
- Backup created for STATE_FILE_MISMATCH fix with manifest entry
- Backup created for batch-progress deletion with manifest entry
- Backup created for INDEX_STALE fix
- No backup for MISSING_PROMPTS (no `backupSessionId`)
- FixResult.backup populated correctly
- Tests use `{ results, backupSessionId }` destructuring

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

No migration needed. The backup mechanism adds a new `.wreckit/backups/` directory that is created automatically when `doctor --fix` creates backups.

## References

- Research: `/Users/speed/wreckit/.wreckit/items/032-implement-backup-mechanism-before-doctor-fixes-spe/research.md`
- Spec: `specs/010-doctor.md:279-285` (Gap 3)
- Implementation: `src/fs/backup.ts:1-189`
- Integration: `src/doctor.ts:588-759`
- CLI: `src/commands/doctor.ts`
- Tests: `src/__tests__/doctor.test.ts`
