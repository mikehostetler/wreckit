# Fix Group 1: BatchProgress Schema Mismatch

## Failing Tests (6 tests)

| Test File               | Test Name                                                                     |
| ----------------------- | ----------------------------------------------------------------------------- |
| `fs.test.ts`            | writes and reads valid progress round-trip                                    |
| `fs.test.ts`            | clearBatchProgress removes progress file                                      |
| `batchProgress.test.ts` | round-trips batch progress correctly                                          |
| `batchProgress.test.ts` | preserves all batch progress fields                                           |
| `diagnose.test.ts`      | returns STALE_BATCH_PROGRESS when PID not running                             |
| `diagnose.test.ts`      | returns STALE_BATCH_PROGRESS when updated_at is older than 24 hours           |
| `diagnose.test.ts`      | returns no batch progress diagnostics when progress is fresh with running PID |
| `orchestrator.test.ts`  | resumes from existing progress                                                |

## Root Cause

The `BatchProgress` schema was updated to include two new required fields:

- `healing_attempts: number`
- `last_healing_at: string | null`

Test fixtures are using the old schema without these fields, causing validation failures.

## Fix Strategy

Update all test fixtures to include the new fields:

```typescript
const validProgress = {
  schema_version: 1,
  session_id: "test-session-123",
  pid: 12345,
  started_at: "2025-01-12T00:00:00Z",
  updated_at: "2025-01-12T00:00:00Z",
  parallel: 1,
  queued_items: ["001-test", "002-test"],
  current_item: null,
  completed: [],
  failed: [],
  skipped: [],
  healing_attempts: 0, // NEW
  last_healing_at: null, // NEW
};
```

## Files to Update

1. `src/__tests__/fs.test.ts`
2. `src/__tests__/batchProgress.test.ts`
3. `src/__tests__/diagnose.test.ts`
4. `src/__tests__/orchestrator.test.ts`

## Verification

```bash
bun test src/__tests__/fs.test.ts src/__tests__/batchProgress.test.ts src/__tests__/diagnose.test.ts
```
