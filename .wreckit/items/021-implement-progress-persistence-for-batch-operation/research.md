# Research: Implement progress persistence for batch operations (spec 009 Gap 2)

**Date**: 2025-01-24
**Item**: 021-implement-progress-persistence-for-batch-operation

## Research Question
From milestone [M3] Robust Error Handling and Recovery

**Motivation:** Strategic milestone: Robust Error Handling and Recovery

## Summary

**The progress persistence feature has already been implemented.** The research reveals that all major components of the batch progress persistence system are in place:

1. **Schema defined**: `BatchProgressSchema` exists in `src/schemas.ts:163-179` with all required fields (schema_version, session_id, pid, started_at, updated_at, parallel, queued_items, current_item, completed, failed, skipped).

2. **Path helper implemented**: `getBatchProgressPath()` exists in `src/fs/paths.ts:56-58` returning `.wreckit/batch-progress.json`.

3. **Read/write/clear functions implemented**: All batch progress I/O functions are in `src/fs/json.ts:122-162` with proper locking support.

4. **Orchestrator integration complete**: The orchestrator in `src/commands/orchestrator.ts` has full integration including:
   - Progress creation at batch start (lines 183-189)
   - Checkpoint after each item completes/fails (lines 316-344 for sequential, 449-463 for parallel)
   - Resume detection and stale progress handling (lines 132-179)
   - Clean completion deletes progress file (lines 378-381)

5. **CLI flags implemented**: Both `--no-resume` and `--retry-failed` flags are defined and wired up in `src/index.ts:44-45,72-73`.

**However, the following gaps remain:**
1. **No unit tests** for `BatchProgressSchema` in `src/__tests__/schemas.test.ts`
2. **No unit tests** for batch progress I/O functions (`readBatchProgress`, `writeBatchProgress`, `clearBatchProgress`) in `src/__tests__/fs.test.ts`
3. **No integration tests** for orchestrator progress persistence in `src/__tests__/commands/orchestrator.test.ts`
4. **No doctor diagnostics** for stale/corrupt batch progress in `src/doctor.ts`
5. **`BatchProgress` type not exported** from schemas (missing `export type BatchProgress = z.infer<typeof BatchProgressSchema>`)

## Current State Analysis

### Existing Implementation

**Schema (Fully Implemented)**
- `src/schemas.ts:163-179` - `BatchProgressSchema` defines the complete data model
- Fields: `schema_version` (literal 1), `session_id`, `pid`, `started_at`, `updated_at`, `parallel`, `queued_items`, `current_item` (nullable), `completed`, `failed`, `skipped`

**Path Helper (Fully Implemented)**
- `src/fs/paths.ts:56-58` - `getBatchProgressPath(root)` returns `.wreckit/batch-progress.json`

**I/O Functions (Fully Implemented)**
- `src/fs/json.ts:122-137` - `readBatchProgress(root)` with graceful null return on errors
- `src/fs/json.ts:139-145` - `writeBatchProgress(root, progress)` with atomic writes and locking
- `src/fs/json.ts:147-162` - `clearBatchProgress(root)` removes progress and lock files

**Orchestrator Integration (Fully Implemented)**
- `src/commands/orchestrator.ts:17` - `STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000` (24 hours)
- `src/commands/orchestrator.ts:22-41` - `createBatchProgress()` helper creates new progress record
- `src/commands/orchestrator.ts:46-59` - `isProgressStale()` checks updated_at age and PID liveness
- `src/commands/orchestrator.ts:84-86` - `OrchestratorOptions` includes `noResume` and `retryFailed`
- `src/commands/orchestrator.ts:128-191` - Resume logic with stale detection and retry-failed handling
- `src/commands/orchestrator.ts:278-283` - Sequential mode: update current_item when starting
- `src/commands/orchestrator.ts:316-322` - Sequential mode: checkpoint on completion
- `src/commands/orchestrator.ts:339-344` - Sequential mode: checkpoint on failure
- `src/commands/orchestrator.ts:378-381` - Clean up on successful completion
- `src/commands/orchestrator.ts:449-454` - Parallel mode: checkpoint on completion
- `src/commands/orchestrator.ts:460-464` - Parallel mode: checkpoint on failure

**CLI Flags (Fully Implemented)**
- `src/index.ts:44` - `--no-resume` flag definition
- `src/index.ts:45` - `--retry-failed` flag definition
- `src/index.ts:72-73` - Flags passed to `orchestrateAll()`

### Key Files

- `src/schemas.ts:163-179` - BatchProgressSchema definition
- `src/fs/paths.ts:56-58` - getBatchProgressPath helper
- `src/fs/json.ts:122-162` - Read/write/clear batch progress functions
- `src/commands/orchestrator.ts:17-59` - Helper functions for progress management
- `src/commands/orchestrator.ts:128-191` - Resume logic integration
- `src/commands/orchestrator.ts:278-344` - Sequential mode checkpointing
- `src/commands/orchestrator.ts:449-464` - Parallel mode checkpointing
- `src/index.ts:44-45` - CLI flag definitions
- `src/index.ts:72-73` - CLI flag wiring to orchestrator

### Missing Components

**Type Export**
- `src/schemas.ts` - Missing `export type BatchProgress = z.infer<typeof BatchProgressSchema>` (note: the type IS imported in json.ts and orchestrator.ts, so it must exist in an earlier read - verified it exists at runtime via imports)

**Tests**
- `src/__tests__/schemas.test.ts` - No `BatchProgressSchema` tests (0 test cases)
- `src/__tests__/fs.test.ts` - No batch progress I/O tests (0 test cases)
- `src/__tests__/commands/orchestrator.test.ts` - No progress persistence tests (0 test cases for resume/persistence)

**Doctor Integration**
- `src/doctor.ts` - No `diagnoseBatchProgress()` function
- `src/doctor.ts` - No `STALE_BATCH_PROGRESS` or `BATCH_PROGRESS_CORRUPT` diagnostic codes
- `src/doctor.ts:509-588` - `applyFixes()` has no cases for batch progress

## Technical Considerations

### Dependencies

**Internal**
- `src/fs/lock.ts` - FileLock class used for concurrent-safe reads/writes
- `src/fs/atomic.ts` - safeWriteJson for crash-safe writes
- `src/commands/status.ts` - scanItems for item discovery

**External**
- `node:crypto` - randomUUID for session_id generation
- `zod` - Schema validation

### Patterns to Follow

**Schema Pattern** (from `src/schemas.ts:157-173`):
```typescript
export const IndexSchema = z.object({...});
export type Index = z.infer<typeof IndexSchema>;
```

**I/O Pattern** (from `src/fs/json.ts:107-120`):
```typescript
export async function readIndex(root: string): Promise<Index | null> {
  try {
    return await readJsonWithSchema(getIndexPath(root), IndexSchema);
  } catch (err) {
    if (err instanceof FileNotFoundError) return null;
    throw err;
  }
}
```

**Diagnostic Pattern** (from `src/doctor.ts:376-445`):
```typescript
async function diagnoseIndex(root: string): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  // ... validation logic
  diagnostics.push({ itemId: null, severity: "warning", code: "INDEX_STALE", message: "...", fixable: true });
  return diagnostics;
}
```

**Fix Pattern** (from `src/doctor.ts:510-525`):
```typescript
case "INDEX_STALE": {
  try {
    // fix logic
    fixed = true;
    message = "Rebuilt index.json";
  } catch (err) {
    message = `Failed: ${err.message}`;
  }
  break;
}
```

**Test Pattern** (from `src/__tests__/commands/orchestrator.test.ts`):
- Uses `bun:test` with `describe`, `it`, `expect`, `beforeEach`, `afterEach`, `vi`
- Creates temp directory with `.wreckit` and `.git` subdirs
- Uses `setupItem()` helper to create test items
- Mocks `runCommand` via `mock.module()`

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Missing tests mean unverified behavior | Medium | Add comprehensive unit and integration tests per PRD user stories US-005 and US-006 |
| No doctor integration for stale progress | Low | Users may not know about orphaned progress files; add diagnostics per PRD user story US-007 |
| Parallel mode may have race conditions | Medium | Current implementation checkpoints after each item; locking should prevent corruption |
| PID check may give false positives | Low | 24-hour timeout acts as fallback for stale detection |
| Type export may cause compile issues | Low | Verify type is properly exported; add explicit export if needed |

## Recommended Approach

Since the core implementation is complete, the remaining work focuses on **testing and doctor integration**:

### Phase 1: Verify Existing Implementation
1. Verify `BatchProgress` type is properly exported from `src/schemas.ts`
2. Run existing tests to ensure no regressions
3. Manual testing: start batch, interrupt, resume

### Phase 2: Add Unit Tests (US-005)
1. Add `BatchProgressSchema` tests to `src/__tests__/schemas.test.ts`:
   - Valid progress object parses correctly
   - Missing session_id throws
   - Wrong schema_version throws
2. Add batch progress I/O tests to `src/__tests__/fs.test.ts`:
   - readBatchProgress returns null for missing file
   - writeBatchProgress + readBatchProgress round-trip
   - clearBatchProgress removes file
   - clearBatchProgress doesn't throw for missing file

### Phase 3: Add Integration Tests (US-006)
Add tests to `src/__tests__/commands/orchestrator.test.ts`:
- Clean completion deletes progress file
- Blocked item preserves progress file
- Resume skips completed items
- `--no-resume` ignores existing progress
- `--retry-failed` re-queues failed items
- Stale progress (bad PID) is ignored
- Stale progress (>24h) is ignored
- Dry-run doesn't create progress file

### Phase 4: Add Doctor Integration (US-007)
1. Add `diagnoseBatchProgress()` to `src/doctor.ts`:
   - Detect `STALE_BATCH_PROGRESS` (PID not running or >24h)
   - Detect `BATCH_PROGRESS_CORRUPT` (invalid JSON or schema)
2. Call `diagnoseBatchProgress()` in `diagnose()`
3. Add fix handlers in `applyFixes()`:
   - Both codes call `clearBatchProgress()`
4. Add doctor tests

## Open Questions

1. **Type Export**: Is `BatchProgress` type properly exported? The imports work at runtime, but need to verify explicit export exists.

2. **Test Coverage Target**: What level of test coverage is expected? The PRD specifies 8 integration test scenarios - should we add more edge cases?

3. **Parallel Mode Checkpointing**: The parallel mode doesn't track `current_item` (only sequential does). Should this be added for visibility during parallel runs?

4. **Signal Handler Integration**: The orchestrator's signal handlers (lines 248-255) don't currently persist progress before exit. Should they?

5. **Lock File Cleanup**: `clearBatchProgress` removes the `.lock` file, but should doctor also detect orphaned `.lock` files without corresponding progress files?
