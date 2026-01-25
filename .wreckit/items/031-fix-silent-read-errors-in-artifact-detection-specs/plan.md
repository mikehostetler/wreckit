# Fix silent read errors in artifact detection (specs 002, 010 Gap: errors swallowed) Implementation Plan

## Overview

This implementation addresses the silent read error problem documented in **Spec 002 Gap 3** and **Spec 010 Gap 4**. Currently, when file reads fail due to permission issues, corruption, or other non-ENOENT errors, these are silently treated as "file does not exist" rather than surfacing the actual error. This masks real problems and leads to state inconsistencies that are hard to diagnose.

The fix introduces strict variants of existing functions that distinguish between:
- **ENOENT (file not found)**: Legitimate "missing file" scenario - return false/null
- **Other errors (EACCES, EIO, etc.)**: Real problems that should be reported

## Current State Analysis

### Problem Areas Identified

| File | Location | Issue |
|------|----------|-------|
| `src/fs/util.ts:10-17` | `pathExists()` | Catches all errors, returns `false` |
| `src/fs/util.ts:26-33` | `dirExists()` | Catches all errors, returns `false` |
| `src/workflow/itemWorkflow.ts:91-97` | `readFileIfExists()` | Catches all errors, returns `undefined` |
| `src/workflow/itemWorkflow.ts:99-105` | `loadPrdSafe()` | Catches all errors, returns `null` |
| `src/doctor.ts:104-106` | `diagnoseDependencies()` | Returns empty array on directory read errors |
| `src/doctor.ts:113-115` | `diagnoseDependencies()` | Silently skips items with read errors |
| `src/doctor.ts:262-264` | `diagnoseItem()` | Uses `pathExists()` for artifact checks |
| `src/commands/status.ts:43-45` | `scanItems()` | Silently skips invalid items |
| `src/domain/indexing.ts:52-56` | `scanItems()` | Returns empty array on directory read errors |
| `src/domain/indexing.ts:99-104` | `getItem()` | Returns `null` for all errors |
| `src/domain/indexing.ts:110-115` | `itemExists()` | Returns `false` for all errors |
| `src/fs/json.ts:130-136` | `readBatchProgress()` | Returns `null` for schema validation errors |

### Model Pattern (Good Example)

The `readJsonWithSchema()` function in `src/fs/json.ts:25-64` correctly handles errors:

```typescript
try {
  content = await fs.readFile(filePath, "utf-8");
} catch (err) {
  if ((err as NodeJS.ErrnoException).code === "ENOENT") {
    throw new FileNotFoundError(`File not found: ${filePath}`);
  }
  throw err;  // Propagates permission errors, I/O errors, etc.
}
```

### Key Discoveries:

- Existing error infrastructure in `src/errors.ts:77-82` provides `FileNotFoundError` which is the model for new error types
- Test infrastructure exists at `src/__tests__/fs-util.test.ts` and `src/__tests__/fs.test.ts` using bun:test
- Doctor already has diagnostic codes for various issues (e.g., `INVALID_CONFIG`, `STATE_FILE_MISMATCH`)
- The `readIndex()` function in `src/fs/json.ts:107-116` correctly propagates non-ENOENT errors
- `pathExists` is called from 15+ locations - changing its behavior would be breaking

## Desired End State

After implementation:

1. **`pathExistsStrict()` and `checkPathAccess()`** return discriminated result types that distinguish "not found" from "error"
2. **Doctor command** reports new diagnostic codes for artifact read failures: `ARTIFACT_UNREADABLE`
3. **Workflow functions** propagate real errors instead of masking them as "missing"
4. **Scanning functions** warn on read errors but continue scanning other items
5. **All tests pass** with new error scenarios covered

### Verification Checklist
- `bun test` passes
- `bun run build` succeeds
- `wreckit doctor` reports `ARTIFACT_UNREADABLE` when artifacts have permission issues
- Workflow phases fail with clear error messages on permission-denied scenarios

## What We're NOT Doing

1. **NOT modifying the existing `pathExists()` function** - this would be a breaking change; we add new functions instead
2. **NOT adding backup mechanism for fixes** - that's a separate gap (Spec 010 Gap 3)
3. **NOT making batch operations fail-fast** - we continue with warnings to maximize useful output
4. **NOT changing the behavior of `readBatchProgress()` for schema errors** - its graceful degradation is intentional for batch resumption
5. **NOT adding new CLI flags** - error reporting is automatic through diagnostics

## Implementation Approach

The approach is **additive** - we introduce new error-aware utilities alongside existing ones, then update key consumers. This minimizes risk of regressions.

**Strategy:**
1. Add new error class `ArtifactReadError` for non-ENOENT read failures
2. Add new diagnostic code `ARTIFACT_UNREADABLE` to doctor
3. Create `tryReadFile` and `checkPathAccess` utilities that distinguish error types
4. Update doctor to use error-aware checks for artifact presence
5. Update workflow helpers to surface real errors
6. Update indexing/status to log (not swallow) permission errors

---

## Phase 1: Add Error Infrastructure

### Overview

Add the `ArtifactReadError` class and `ARTIFACT_READ_ERROR` error code. Create utility functions to safely attempt file reads with proper error categorization.

### Changes Required:

#### 1. Add error code and class
**File**: `src/errors.ts`
**Changes**: Add `ARTIFACT_READ_ERROR` to ErrorCodes and create `ArtifactReadError` class

```typescript
// Add to ErrorCodes object (around line 52)
ARTIFACT_READ_ERROR: "ARTIFACT_READ_ERROR",

// Add class (after line 82, after FileNotFoundError)
export class ArtifactReadError extends WreckitError {
  constructor(
    public readonly filePath: string,
    public readonly cause: Error
  ) {
    super(
      `Cannot read artifact ${filePath}: ${cause.message}`,
      ErrorCodes.ARTIFACT_READ_ERROR
    );
    this.name = "ArtifactReadError";
  }
}
```

#### 2. Add file read utility with error categorization
**File**: `src/fs/util.ts`
**Changes**: Add `tryReadFile` and `checkPathAccess` functions

```typescript
import { ArtifactReadError } from "../errors";

export type FileReadResult =
  | { status: "ok"; content: string }
  | { status: "not_found" }
  | { status: "error"; error: ArtifactReadError };

/**
 * Attempt to read a file with proper error categorization.
 * - Returns { status: "ok", content } on success
 * - Returns { status: "not_found" } for ENOENT
 * - Returns { status: "error", error } for permission/I/O errors
 */
export async function tryReadFile(filePath: string): Promise<FileReadResult> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return { status: "ok", content };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { status: "not_found" };
    }
    return {
      status: "error",
      error: new ArtifactReadError(filePath, err as Error)
    };
  }
}

/**
 * Check if a path exists, distinguishing "not found" from "cannot access".
 * Returns { exists: true/false, error?: ArtifactReadError }
 */
export async function checkPathAccess(filePath: string): Promise<{
  exists: boolean;
  error?: ArtifactReadError;
}> {
  try {
    await fs.access(filePath);
    return { exists: true };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { exists: false };
    }
    return {
      exists: false,
      error: new ArtifactReadError(filePath, err as Error)
    };
  }
}
```

#### 3. Export new utilities
**File**: `src/fs/index.ts`
**Changes**: Export new utilities

```typescript
export {
  pathExists,
  dirExists,
  tryReadFile,
  checkPathAccess,
  type FileReadResult,
} from "./util";
```

### Success Criteria:

#### Automated Verification:
- [ ] Tests pass: `bun test`
- [ ] Type checking passes: `npx tsc --noEmit`
- [ ] Build succeeds: `bun run build`

#### Manual Verification:
- [ ] New `ArtifactReadError` class can be imported and used
- [ ] `tryReadFile` returns correct status for existing, missing, and unreadable files
- [ ] `checkPathAccess` returns correct status for accessible, missing, and permission-denied paths

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to next phase.

---

## Phase 2: Update Doctor Command

### Overview

Update the doctor command to use error-aware artifact checking and report a new `ARTIFACT_UNREADABLE` diagnostic when artifacts exist but cannot be read.

### Changes Required:

#### 1. Update diagnoseItem to detect unreadable artifacts
**File**: `src/doctor.ts`
**Changes**: Replace `pathExists` calls with `checkPathAccess` for artifact detection (lines 262-264)

Before:
```typescript
const hasResearch = await pathExists(researchPath);
const hasPlan = await pathExists(planPath);
const hasPrd = await pathExists(prdPath);
```

After:
```typescript
import { checkPathAccess } from "./fs/util";

// Check artifact accessibility with proper error handling
const researchCheck = await checkPathAccess(researchPath);
const planCheck = await checkPathAccess(planPath);
const prdCheck = await checkPathAccess(prdPath);

// Report unreadable artifacts as diagnostics
if (researchCheck.error) {
  diagnostics.push({
    itemId,
    severity: "error",
    code: "ARTIFACT_UNREADABLE",
    message: `Cannot read research.md: ${researchCheck.error.cause.message}`,
    fixable: false,
  });
}
if (planCheck.error) {
  diagnostics.push({
    itemId,
    severity: "error",
    code: "ARTIFACT_UNREADABLE",
    message: `Cannot read plan.md: ${planCheck.error.cause.message}`,
    fixable: false,
  });
}
if (prdCheck.error) {
  diagnostics.push({
    itemId,
    severity: "error",
    code: "ARTIFACT_UNREADABLE",
    message: `Cannot read prd.json: ${prdCheck.error.cause.message}`,
    fixable: false,
  });
}

// Use the exists flag (false if error or not found)
const hasResearch = researchCheck.exists && !researchCheck.error;
const hasPlan = planCheck.exists && !planCheck.error;
const hasPrd = prdCheck.exists && !prdCheck.error;
```

#### 2. Update applyFixes to use error-aware checks
**File**: `src/doctor.ts`
**Changes**: Update artifact checks in STATE_FILE_MISMATCH fix (lines 625-629)

Use `checkPathAccess` and handle errors appropriately. If we can't read the artifact, don't try to fix the state - log a warning instead.

### Success Criteria:

#### Automated Verification:
- [ ] Tests pass: `bun test`
- [ ] Type checking passes: `npx tsc --noEmit`
- [ ] Build succeeds: `bun run build`

#### Manual Verification:
- [ ] Create a test item with permission-denied research.md: `chmod 000 .wreckit/items/001-test/research.md`
- [ ] Run `wreckit doctor` and verify `ARTIFACT_UNREADABLE` diagnostic appears
- [ ] Restore permissions: `chmod 644 .wreckit/items/001-test/research.md`
- [ ] Run `wreckit doctor` again and verify no diagnostic

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to next phase.

---

## Phase 3: Update Workflow Helpers

### Overview

Update `readFileIfExists` and `loadPrdSafe` in itemWorkflow.ts to surface real read errors instead of swallowing them.

### Changes Required:

#### 1. Update readFileIfExists to distinguish errors
**File**: `src/workflow/itemWorkflow.ts`
**Changes**: Make the function return undefined for ENOENT but throw for other errors (lines 91-97)

Before:
```typescript
async function readFileIfExists(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return undefined;
  }
}
```

After:
```typescript
async function readFileIfExists(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    // Re-throw permission/I/O errors - don't silently swallow
    throw err;
  }
}
```

#### 2. Update loadPrdSafe to distinguish errors
**File**: `src/workflow/itemWorkflow.ts`
**Changes**: Make the function return null for ENOENT/parse errors but throw for permission errors (lines 99-105)

Before:
```typescript
async function loadPrdSafe(itemDir: string): Promise<Prd | null> {
  try {
    return await readPrd(itemDir);
  } catch {
    return null;
  }
}
```

After:
```typescript
import { FileNotFoundError, InvalidJsonError, SchemaValidationError } from "../errors";

async function loadPrdSafe(itemDir: string): Promise<Prd | null> {
  try {
    return await readPrd(itemDir);
  } catch (err) {
    // Expected "missing" conditions - return null
    if (err instanceof FileNotFoundError) return null;
    if (err instanceof InvalidJsonError) return null;
    if (err instanceof SchemaValidationError) return null;
    // Unexpected error (permissions, I/O) - re-throw
    throw err;
  }
}
```

#### 3. Update buildValidationContext to handle errors
**File**: `src/workflow/itemWorkflow.ts`
**Changes**: The function uses `pathExists` which still swallows errors. Update to use `checkPathAccess`.

```typescript
import { checkPathAccess } from "../fs/util";

export async function buildValidationContext(
  root: string,
  item: Item
): Promise<ValidationContext> {
  const itemDir = getItemDir(root, item.id);
  const researchPath = getResearchPath(root, item.id);
  const planPath = getPlanPath(root, item.id);

  // Use error-aware checks - throw on permission errors
  const researchCheck = await checkPathAccess(researchPath);
  if (researchCheck.error) throw researchCheck.error;

  const planCheck = await checkPathAccess(planPath);
  if (planCheck.error) throw planCheck.error;

  const hasResearchMd = researchCheck.exists;
  const hasPlanMd = planCheck.exists;
  const prd = await loadPrdSafe(itemDir);
  const hasPr = item.pr_url !== null;
  const prMerged = item.state === "done";

  return {
    hasResearchMd,
    hasPlanMd,
    prd,
    hasPr,
    prMerged,
  };
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Tests pass: `bun test`
- [ ] Type checking passes: `npx tsc --noEmit`
- [ ] Build succeeds: `bun run build`

#### Manual Verification:
- [ ] Create test item and restrict research.md permissions
- [ ] Run `wreckit run <id>` and verify error is surfaced (not silently skipped)
- [ ] Restore permissions and verify normal operation

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to next phase.

---

## Phase 4: Update Indexing and Status

### Overview

Update scanning functions in indexing.ts and status.ts to better handle read errors - log warnings but continue processing other items.

### Changes Required:

#### 1. Update status.ts scanItems
**File**: `src/commands/status.ts`
**Changes**: Log warnings for non-ENOENT errors instead of silently skipping (lines 33-46)

Before:
```typescript
  } catch {
    // Skip invalid items
  }
```

After:
```typescript
  } catch (err) {
    // Expected errors: skip silently
    if (err instanceof FileNotFoundError) continue;
    if (err instanceof InvalidJsonError) continue;
    if (err instanceof SchemaValidationError) continue;
    // Unexpected errors (permissions): log warning
    console.warn(
      `Warning: Cannot read item at ${itemPath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
```

#### 2. Update indexing.ts getItem
**File**: `src/domain/indexing.ts`
**Changes**: Re-throw permission errors, return null only for expected missing cases (lines 93-104)

Before:
```typescript
  } catch {
    return null;
  }
```

After:
```typescript
  } catch (err) {
    // Expected "not found" conditions
    if (err instanceof FileNotFoundError) return null;
    if (err instanceof InvalidJsonError) return null;
    if (err instanceof SchemaValidationError) return null;
    // Unexpected errors - re-throw
    throw err;
  }
```

#### 3. Update indexing.ts itemExists
**File**: `src/domain/indexing.ts`
**Changes**: Use `checkPathAccess` to properly handle permission errors (lines 106-116)

Before:
```typescript
  } catch {
    return false;
  }
```

After:
```typescript
import { checkPathAccess } from "../fs/util";

const check = await checkPathAccess(itemJsonPath);
if (check.error) {
  // Permission error - throw instead of returning false
  throw check.error;
}
return check.exists;
```

### Success Criteria:

#### Automated Verification:
- [ ] Tests pass: `bun test`
- [ ] Type checking passes: `npx tsc --noEmit`
- [ ] Build succeeds: `bun run build`

#### Manual Verification:
- [ ] Create test item and restrict item.json permissions
- [ ] Run `wreckit status` and verify warning is logged
- [ ] Restore permissions and verify normal operation

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to next phase.

---

## Phase 5: Update Show Command and Batch Progress

### Overview

Update the show command to use error-aware artifact checking, and update readBatchProgress to throw on permission errors while continuing to swallow schema validation errors.

### Changes Required:

#### 1. Update show.ts loadItemDetails
**File**: `src/commands/show.ts`
**Changes**: Replace `pathExists` with `checkPathAccess` for artifact detection (lines 27-28)

#### 2. Update readBatchProgress in json.ts
**File**: `src/fs/json.ts`
**Changes**: Throw on permission errors, return null only for expected errors (lines 130-137)

Before:
```typescript
} catch (err) {
  if (err instanceof FileNotFoundError) {
    return null;
  }
  // For schema validation errors or other issues, return null (treat as no progress)
  return null;
}
```

After:
```typescript
} catch (err) {
  if (err instanceof FileNotFoundError) {
    return null;
  }
  // Schema validation errors are expected (corrupt progress file)
  if (err instanceof SchemaValidationError || err instanceof InvalidJsonError) {
    return null;
  }
  // Permission errors and I/O errors should propagate
  throw err;
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Tests pass: `bun test`
- [ ] Type checking passes: `npx tsc --noEmit`
- [ ] Build succeeds: `bun run build`

#### Manual Verification:
- [ ] Run `wreckit show 001` with permission-denied research.md and verify clear error
- [ ] Run `wreckit run` with permission-denied batch-progress.json and verify error

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to next phase.

---

## Phase 6: Add Tests

### Overview

Add unit tests for the new error-aware utilities and integration tests for the doctor diagnostics.

### Changes Required:

#### 1. Add tests for new utilities
**File**: `src/__tests__/fs-util.test.ts`
**Changes**: Add tests for `tryReadFile` and `checkPathAccess`

```typescript
describe("tryReadFile", () => {
  it("returns ok for existing readable file", async () => {
    const filePath = path.join(tempDir, "readable.txt");
    await fs.writeFile(filePath, "content");
    const result = await tryReadFile(filePath);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.content).toBe("content");
    }
  });

  it("returns not_found for missing file", async () => {
    const result = await tryReadFile(path.join(tempDir, "missing.txt"));
    expect(result.status).toBe("not_found");
  });
});

describe("checkPathAccess", () => {
  it("returns exists: true for accessible path", async () => {
    const filePath = path.join(tempDir, "accessible.txt");
    await fs.writeFile(filePath, "content");
    const result = await checkPathAccess(filePath);
    expect(result.exists).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("returns exists: false for missing path", async () => {
    const result = await checkPathAccess(path.join(tempDir, "missing.txt"));
    expect(result.exists).toBe(false);
    expect(result.error).toBeUndefined();
  });
});
```

#### 2. Add test for ARTIFACT_UNREADABLE diagnostic
**File**: `src/__tests__/edge-cases/corruption.test.ts` (or doctor.test.ts)
**Changes**: Add test that verifies doctor detects unreadable artifacts

### Success Criteria:

#### Automated Verification:
- [ ] Tests pass: `bun test`
- [ ] Type checking passes: `npx tsc --noEmit`
- [ ] Build succeeds: `bun run build`

#### Manual Verification:
- [ ] New tests cover happy path and error cases
- [ ] Tests are documented with skip conditions for platform-specific cases

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to next phase.

---

## Testing Strategy

### Unit Tests:
- `tryReadFile` returns correct status for existing, missing, unreadable files
- `checkPathAccess` returns correct exists/error for all cases
- `ArtifactReadError` contains proper message and cause
- `loadPrdSafe` returns null for expected errors, throws for permission errors
- `readFileIfExists` returns undefined for missing, throws for permission errors

### Integration Tests:
- Doctor reports `ARTIFACT_UNREADABLE` for permission-denied artifacts
- Workflow phases surface permission errors with clear messages
- Status command continues processing other items after encountering unreadable item
- `getItem` throws for permission errors, returns null for missing

### Manual Testing Steps:
1. Create a test wreckit repository with a few items
2. Create permission-denied artifacts:
   ```bash
   chmod 000 .wreckit/items/001-test/research.md
   ```
3. Run `wreckit doctor` - verify `ARTIFACT_UNREADABLE` diagnostic
4. Run `wreckit status` - verify warning logged, other items shown
5. Run `wreckit show 001` - verify clear error message
6. Restore permissions:
   ```bash
   chmod 644 .wreckit/items/001-test/research.md
   ```
7. Verify normal operation restored

## Migration Notes

No migration needed. This change is backwards compatible:
- Existing `pathExists` and `dirExists` behavior unchanged
- New utilities are additive
- Errors that were silently swallowed are now surfaced as diagnostics or exceptions
- No data format changes

## Rollback Plan

If issues arise after deployment:
1. Revert the commits for this change
2. The existing `pathExists` and `dirExists` functions remain untouched
3. No data migration or cleanup needed

## References

- Research: `/Users/speed/wreckit/.wreckit/items/031-fix-silent-read-errors-in-artifact-detection-specs/research.md`
- Spec 002: `/Users/speed/wreckit/specs/002-research-phase.md` (Gap 3: Silent Read Errors)
- Spec 010: `/Users/speed/wreckit/specs/010-doctor.md` (Gap 4: Silent Read Errors)
- Error patterns: `src/fs/json.ts:25-64` (readJsonWithSchema)
- Existing error classes: `src/errors.ts`
