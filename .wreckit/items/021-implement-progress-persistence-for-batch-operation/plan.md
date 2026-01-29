# Implement Progress Persistence for Batch Operations Implementation Plan

## Overview

This implementation adds progress persistence for batch operations in wreckit's orchestrator. When the batch orchestrator (`wreckit` or `wreckit next` commands) is interrupted (Ctrl-C, SIGTERM, crash), it currently loses its position in the queue and must rescan all items on the next run. This feature introduces a lightweight `batch-progress.json` file that tracks the current batch session state, enabling seamless resumption from exactly where the batch left off.

## Current State Analysis

**Analysis of current implementation reveals the core progress persistence is ALREADY IMPLEMENTED:**

1. **BatchProgressSchema** exists in `src/schemas.ts:163-179` with all required fields
2. **Path helper** `getBatchProgressPath()` exists in `src/fs/paths.ts:56-58`
3. **Read/Write functions** exist in `src/fs/json.ts:122-162`
4. **Orchestrator integration** exists in `src/commands/orchestrator.ts:103-384`

### Key Discoveries:

- `src/commands/orchestrator.ts:22-41` - createBatchProgress helper already implemented
- `src/commands/orchestrator.ts:46-59` - isProgressStale helper already implemented
- `src/commands/orchestrator.ts:83-86` - OrchestratorOptions already has noResume/retryFailed
- `src/commands/orchestrator.ts:127-191` - Resume detection and handling already implemented
- `src/commands/orchestrator.ts:278-344` - Checkpointing on item completion already implemented
- `src/index.ts:43-44` - CLI options defined but --no-resume and --retry-failed NOT added
- `src/index.ts:61-72` - orchestrateAll call does NOT pass noResume/retryFailed
- `src/doctor.ts` - NO batch progress diagnostics implemented

### Constraints:

1. Must add CLI flags following existing pattern in index.ts
2. Must pass options to orchestrateAll call
3. Doctor diagnostics should follow existing diagnoseIndex pattern
4. Tests should follow existing bun:test patterns

## Desired End State

1. **CLI flags**: `--no-resume` to force fresh start, `--retry-failed` to retry failed items
2. **Doctor integration**: `STALE_BATCH_PROGRESS` and `BATCH_PROGRESS_CORRUPT` diagnostics with fixes
3. **Test coverage**: Unit and integration tests for batch progress functionality

### Verification:

```bash
# Check CLI help shows new flags
wreckit --help | grep -E "(no-resume|retry-failed)"

# Force fresh start
wreckit --no-resume

# Retry failed items on resume
wreckit --retry-failed

# Detect stale progress via doctor
wreckit doctor
wreckit doctor --fix
```

## What We're NOT Doing

1. **Core persistence implementation**: Already done - not touching orchestrator logic
2. **Schema changes**: BatchProgressSchema already complete
3. **Path helper changes**: getBatchProgressPath already exists
4. **JSON I/O changes**: read/write/clear functions already exist
5. **Session expiry configuration**: Fixed 24-hour expiry
6. **Progress file for `wreckit next`**: Only `wreckit` (orchestrateAll) gets persistence
7. **Interactive prompt for resume**: Auto-resume by default, `--no-resume` to override

## Implementation Approach

Since core functionality is implemented, we only need:
1. Add CLI flags to `src/index.ts`
2. Pass flags to `orchestrateAll()` call
3. Add doctor diagnostics for stale/corrupt batch progress
4. Add tests for the complete feature

---

## Phase 1: Add CLI Flags

### Overview

Add `--no-resume` and `--retry-failed` CLI flags and pass them to orchestrateAll.

### Changes Required:

#### 1. Add CLI Options
**File**: `src/index.ts`
**Changes**: Add options after line 43 (after `--parallel`)

```typescript
  .option("--no-resume", "Start fresh batch run, ignoring saved progress")
  .option("--retry-failed", "Include previously failed items when resuming")
```

#### 2. Pass Options to orchestrateAll
**File**: `src/index.ts`
**Changes**: Update orchestrateAll call (around line 61-72) to include noResume and retryFailed

```typescript
      const result = await orchestrateAll(
        {
          force: false,
          dryRun: opts.dryRun,
          noTui: opts.noTui,
          tuiDebug: opts.tuiDebug,
          cwd: resolveCwd(opts.cwd),
          mockAgent: opts.mockAgent,
          parallel: parseInt(opts.parallel, 10) || 1,
          noResume: opts.noResume,
          retryFailed: opts.retryFailed,
        },
        logger
      );
```

### Success Criteria:

#### Automated Verification:
- [ ] Type checking passes: `bun run tsc --noEmit`
- [ ] Build succeeds: `bun run build`
- [ ] CLI help shows new options: `bun run src/index.ts --help | grep -E "(no-resume|retry-failed)"`

#### Manual Verification:
- [ ] `wreckit --help` shows `--no-resume` option with description
- [ ] `wreckit --help` shows `--retry-failed` option with description
- [ ] `wreckit --no-resume` starts fresh even with existing progress file
- [ ] `wreckit --retry-failed` includes previously failed items when resuming

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to next phase.

---

## Phase 2: Doctor Integration

### Overview

Add diagnostics for stale or corrupted batch progress files to the doctor command.

### Changes Required:

#### 1. Add Imports
**File**: `src/doctor.ts`
**Changes**: Add imports at top of file

```typescript
// Add to existing imports from "./fs/paths"
import { getBatchProgressPath } from "./fs/paths";

// Add to existing imports from "./schemas"
import { BatchProgressSchema } from "./schemas";

// Add to existing imports from "./fs/json"
import { clearBatchProgress } from "./fs/json";
```

#### 2. Add diagnoseBatchProgress Function
**File**: `src/doctor.ts`
**Changes**: Add new diagnostic function after diagnosePrompts (around line 462)

```typescript
async function diagnoseBatchProgress(root: string): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  const progressPath = getBatchProgressPath(root);

  if (!(await pathExists(progressPath))) {
    return diagnostics;
  }

  try {
    const content = await fs.readFile(progressPath, "utf-8");
    let data: unknown;
    try {
      data = JSON.parse(content);
    } catch {
      diagnostics.push({
        itemId: null,
        severity: "warning",
        code: "BATCH_PROGRESS_CORRUPT",
        message: "batch-progress.json has invalid JSON",
        fixable: true,
      });
      return diagnostics;
    }

    const result = BatchProgressSchema.safeParse(data);
    if (!result.success) {
      diagnostics.push({
        itemId: null,
        severity: "warning",
        code: "BATCH_PROGRESS_CORRUPT",
        message: `batch-progress.json is invalid: ${result.error.message}`,
        fixable: true,
      });
      return diagnostics;
    }

    const progress = result.data;
    const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;
    const updatedAt = new Date(progress.updated_at).getTime();
    const isStale = Date.now() - updatedAt > STALE_THRESHOLD_MS;

    let pidRunning = false;
    try {
      process.kill(progress.pid, 0);
      pidRunning = true;
    } catch {
      // PID not running
    }

    if (isStale || !pidRunning) {
      const reason = isStale ? "older than 24 hours" : "owning process not running";
      diagnostics.push({
        itemId: null,
        severity: "warning",
        code: "STALE_BATCH_PROGRESS",
        message: `batch-progress.json is stale (${reason})`,
        fixable: true,
      });
    }
  } catch (err) {
    diagnostics.push({
      itemId: null,
      severity: "error",
      code: "BATCH_PROGRESS_CORRUPT",
      message: `Failed to read batch-progress.json: ${err instanceof Error ? err.message : String(err)}`,
      fixable: true,
    });
  }

  return diagnostics;
}
```

#### 3. Call Diagnostic in diagnose()
**File**: `src/doctor.ts`
**Changes**: Add call in diagnose() function (around line 492, after diagnoseIndex call)

```typescript
  diagnostics.push(...(await diagnoseBatchProgress(root)));
```

#### 4. Add Fix Handler in applyFixes()
**File**: `src/doctor.ts`
**Changes**: Add cases in applyFixes() switch statement (before the default case)

```typescript
      case "STALE_BATCH_PROGRESS":
      case "BATCH_PROGRESS_CORRUPT": {
        try {
          await clearBatchProgress(root);
          fixed = true;
          message = "Removed stale/corrupt batch-progress.json";
        } catch (err) {
          message = `Failed to remove: ${err instanceof Error ? err.message : String(err)}`;
        }
        break;
      }
```

### Success Criteria:

#### Automated Verification:
- [ ] Type checking passes: `bun run tsc --noEmit`
- [ ] Build succeeds: `bun run build`
- [ ] Existing doctor tests pass: `bun test src/__tests__/doctor.test.ts`

#### Manual Verification:
- [ ] Create stale progress file (old PID: 99999999), run `wreckit doctor`, see STALE_BATCH_PROGRESS warning
- [ ] Run `wreckit doctor --fix`, verify batch-progress.json is removed
- [ ] Create corrupt progress file (invalid JSON), run `wreckit doctor`, see BATCH_PROGRESS_CORRUPT warning
- [ ] Run `wreckit doctor --fix`, verify corrupt file is removed

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to next phase.

---

## Phase 3: Add Tests

### Overview

Add comprehensive tests for batch progress persistence functionality.

### Changes Required:

#### 1. Schema Tests
**File**: `src/__tests__/schemas.test.ts`
**Changes**: Add tests for BatchProgressSchema

```typescript
describe("BatchProgressSchema", () => {
  it("accepts valid batch progress", () => {
    const valid = {
      schema_version: 1,
      session_id: "test-123",
      pid: 12345,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      parallel: 1,
      queued_items: ["001-test", "002-test"],
      current_item: null,
      completed: [],
      failed: [],
      skipped: [],
    };
    expect(() => BatchProgressSchema.parse(valid)).not.toThrow();
  });

  it("rejects missing session_id", () => {
    const invalid = {
      schema_version: 1,
      pid: 12345,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      parallel: 1,
      queued_items: [],
      current_item: null,
      completed: [],
      failed: [],
      skipped: [],
    };
    expect(() => BatchProgressSchema.parse(invalid)).toThrow();
  });

  it("rejects wrong schema_version", () => {
    const invalid = {
      schema_version: 2,
      session_id: "test-123",
      pid: 12345,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      parallel: 1,
      queued_items: [],
      current_item: null,
      completed: [],
      failed: [],
      skipped: [],
    };
    expect(() => BatchProgressSchema.parse(invalid)).toThrow();
  });
});
```

#### 2. Batch Progress I/O Tests
**File**: `src/__tests__/batchProgress.test.ts` (new file)
**Changes**: Add tests for read/write/clear functions

```typescript
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { readBatchProgress, writeBatchProgress, clearBatchProgress } from "../fs/json";
import { getBatchProgressPath } from "../fs/paths";
import type { BatchProgress } from "../schemas";

describe("batch progress I/O", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(process.cwd(), "test-"));
    await fs.mkdir(path.join(tempDir, ".wreckit"), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("readBatchProgress returns null for missing file", async () => {
    const result = await readBatchProgress(tempDir);
    expect(result).toBeNull();
  });

  it("round-trips batch progress correctly", async () => {
    const progress: BatchProgress = {
      schema_version: 1,
      session_id: "test-roundtrip",
      pid: process.pid,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      parallel: 1,
      queued_items: ["001-test"],
      current_item: null,
      completed: [],
      failed: [],
      skipped: [],
    };

    await writeBatchProgress(tempDir, progress);
    const read = await readBatchProgress(tempDir);

    expect(read).not.toBeNull();
    expect(read!.session_id).toBe("test-roundtrip");
    expect(read!.queued_items).toEqual(["001-test"]);
  });

  it("clearBatchProgress removes file", async () => {
    const progress: BatchProgress = {
      schema_version: 1,
      session_id: "test-clear",
      pid: process.pid,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      parallel: 1,
      queued_items: [],
      current_item: null,
      completed: [],
      failed: [],
      skipped: [],
    };

    await writeBatchProgress(tempDir, progress);
    await clearBatchProgress(tempDir);

    const result = await readBatchProgress(tempDir);
    expect(result).toBeNull();
  });

  it("clearBatchProgress does not throw for missing file", async () => {
    await expect(clearBatchProgress(tempDir)).resolves.not.toThrow();
  });

  it("readBatchProgress returns null for invalid JSON", async () => {
    const progressPath = getBatchProgressPath(tempDir);
    await fs.writeFile(progressPath, "{ invalid json }");

    const result = await readBatchProgress(tempDir);
    expect(result).toBeNull();
  });
});
```

#### 3. Doctor Tests for Batch Progress
**File**: `src/__tests__/doctor.test.ts`
**Changes**: Add tests for batch progress diagnostics

```typescript
describe("batch progress diagnostics", () => {
  it("detects stale batch progress (old PID)", async () => {
    const progressPath = path.join(tempDir, ".wreckit", "batch-progress.json");
    const staleProgress = {
      schema_version: 1,
      session_id: "stale-pid",
      pid: 99999999, // Non-existent PID
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      parallel: 1,
      queued_items: [],
      current_item: null,
      completed: [],
      failed: [],
      skipped: [],
    };
    await fs.writeFile(progressPath, JSON.stringify(staleProgress, null, 2));

    const result = await runDoctor(tempDir, {}, mockLogger);

    expect(result.diagnostics.some(d => d.code === "STALE_BATCH_PROGRESS")).toBe(true);
  });

  it("detects corrupt batch progress (invalid JSON)", async () => {
    const progressPath = path.join(tempDir, ".wreckit", "batch-progress.json");
    await fs.writeFile(progressPath, "{ not valid json }");

    const result = await runDoctor(tempDir, {}, mockLogger);

    expect(result.diagnostics.some(d => d.code === "BATCH_PROGRESS_CORRUPT")).toBe(true);
  });

  it("fixes stale batch progress with --fix", async () => {
    const progressPath = path.join(tempDir, ".wreckit", "batch-progress.json");
    const staleProgress = {
      schema_version: 1,
      session_id: "stale-fix",
      pid: 99999999,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      parallel: 1,
      queued_items: [],
      current_item: null,
      completed: [],
      failed: [],
      skipped: [],
    };
    await fs.writeFile(progressPath, JSON.stringify(staleProgress, null, 2));

    const result = await runDoctor(tempDir, { fix: true }, mockLogger);

    expect(result.fixes?.some(f => f.fixed && f.diagnostic.code === "STALE_BATCH_PROGRESS")).toBe(true);

    const exists = await fs.access(progressPath).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });
});
```

### Success Criteria:

#### Automated Verification:
- [ ] All schema tests pass: `bun test src/__tests__/schemas.test.ts`
- [ ] All batch progress I/O tests pass: `bun test src/__tests__/batchProgress.test.ts`
- [ ] All doctor tests pass: `bun test src/__tests__/doctor.test.ts`
- [ ] Type checking passes: `bun run tsc --noEmit`
- [ ] Build succeeds: `bun run build`

#### Manual Verification:
- [ ] Full test suite passes: `bun test`
- [ ] No regressions in existing functionality

**Note**: Complete all automated verification for final confirmation.

---

## Testing Strategy

### Unit Tests:

**Schema tests** (`src/__tests__/schemas.test.ts`):
- BatchProgressSchema validates valid progress
- BatchProgressSchema rejects missing required fields
- BatchProgressSchema rejects invalid schema_version

**JSON I/O tests** (`src/__tests__/batchProgress.test.ts`):
- readBatchProgress returns null for missing file
- readBatchProgress returns null for invalid JSON
- writeBatchProgress creates file with correct content
- clearBatchProgress removes file
- clearBatchProgress doesn't throw for missing file

### Integration Tests:

**Doctor tests** (`src/__tests__/doctor.test.ts`):
- STALE_BATCH_PROGRESS detected for stale progress (old PID)
- BATCH_PROGRESS_CORRUPT detected for invalid JSON
- --fix removes stale/corrupt progress files

### Manual Testing Steps:

1. Run `wreckit --help`, verify `--no-resume` and `--retry-failed` options appear
2. Run `wreckit --mock-agent` with 3+ items, interrupt after first completes with Ctrl-C
3. Verify `.wreckit/batch-progress.json` exists with correct state
4. Run `wreckit --mock-agent` again, verify it resumes (skips completed item)
5. Run `wreckit --no-resume --mock-agent`, verify it starts fresh
6. Let batch complete, verify progress file is deleted
7. Create stale progress file (old PID 99999999), run `wreckit doctor`, verify detection
8. Run `wreckit doctor --fix`, verify cleanup

## Migration Notes

The core batch progress persistence is already implemented. This plan only adds:
- CLI flags for controlling resume behavior
- Doctor diagnostics for maintenance
- Test coverage

No migration needed as batch-progress.json is optional and backward-compatible.

## Rollback Strategy

If issues arise after deployment:
1. Delete any `.wreckit/batch-progress.json` files manually
2. Users can use `--no-resume` to bypass resume logic
3. `wreckit doctor --fix` can clean up problematic progress files

## References

- `src/commands/orchestrator.ts:22-59` - createBatchProgress and isProgressStale helpers
- `src/commands/orchestrator.ts:83-86` - OrchestratorOptions with noResume/retryFailed
- `src/commands/orchestrator.ts:127-191` - Resume detection logic
- `src/commands/orchestrator.ts:278-344` - Checkpointing logic
- `src/schemas.ts:163-179` - BatchProgressSchema
- `src/fs/paths.ts:56-58` - getBatchProgressPath
- `src/fs/json.ts:122-162` - read/write/clear functions
- `src/index.ts:43-44` - CLI option definition location (needs CLI flags)
- `src/index.ts:61-72` - orchestrateAll invocation (needs options passed)
- `src/doctor.ts:376-445` - diagnoseIndex pattern to follow
- `src/doctor.ts:509-525` - applyFixes INDEX_STALE case pattern to follow
