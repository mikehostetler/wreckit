# Research: Fix silent read errors in artifact detection (specs 002, 010 Gap: errors swallowed)

**Date**: 2025-01-24
**Item**: 031-fix-silent-read-errors-in-artifact-detection-specs

## Research Question
From milestone [M3] Robust Error Handling and Recovery

**Motivation:** Strategic milestone: Robust Error Handling and Recovery

## Summary

The wreckit codebase has a pervasive pattern of swallowing read errors when checking for artifact existence. When file reads fail due to permission issues, corruption, or other non-ENOENT errors, these are silently treated as "file does not exist" rather than surfacing the actual error. This masks real problems and leads to state inconsistencies that are hard to diagnose.

The problem manifests in two key areas identified in the specs:
1. **Spec 002 (Research Phase), Gap 3** (`specs/002-research-phase.md:330-338`): Artifact detection uses `pathExists()` which swallows all errors, and `readFileIfExists()` which returns `undefined` for any read failure.
2. **Spec 010 (Doctor), Gap 4** (`specs/010-doctor.md:287-294`): State/artifact consistency checks use `pathExists()` which cannot distinguish between "file missing" and "permission denied."

The fix requires distinguishing between expected "file not found" errors (which indicate missing artifacts) and unexpected errors (permission denied, I/O errors, corruption) that should propagate. The existing typed error system (`FileNotFoundError`, `InvalidJsonError`, `SchemaValidationError` in `src/errors.ts:63-82`) provides a solid foundation for this work. The primary changes needed are in `src/fs/util.ts`, `src/workflow/itemWorkflow.ts`, `src/doctor.ts`, `src/domain/indexing.ts`, and `src/commands/status.ts`.

## Current State Analysis

### Existing Implementation

The problem stems from several utility functions and patterns that treat all errors identically.

#### Core Pattern: `pathExists()` in `src/fs/util.ts:10-17`

```typescript
export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;  // Swallows ALL errors as "not exists"
  }
}
```

This function is the foundation of artifact detection throughout the codebase. Any error (ENOENT, EACCES, EIO, etc.) returns `false`, making it impossible to distinguish "file does not exist" from "file exists but cannot be read."

**Usage sites:**
- `src/workflow/itemWorkflow.ts:196` - Research phase skip check
- `src/workflow/itemWorkflow.ts:282` - Post-agent artifact validation
- `src/workflow/itemWorkflow.ts:362` - Plan phase skip check
- `src/workflow/itemWorkflow.ts:452` - Plan artifact validation
- `src/workflow/itemWorkflow.ts:480` - PRD artifact validation
- `src/doctor.ts:175` - Config existence check
- `src/doctor.ts:220` - Item.json existence check
- `src/doctor.ts:262-264` - State/artifact consistency checks
- `src/doctor.ts:382` - Index existence check
- `src/doctor.ts:453` - Prompts directory check
- `src/doctor.ts:470` - Batch progress check
- `src/doctor.ts:544` - Wreckit directory check
- `src/doctor.ts:625-629` - Fix application artifact checks
- `src/commands/show.ts:27-28` - Artifact presence display
- `src/commands/orchestrator.ts:204-205` - Batch orchestration
- `src/commands/strategy.ts:44,111` - Roadmap existence checks

#### Similar Pattern: `dirExists()` in `src/fs/util.ts:26-33`

```typescript
export async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;  // Swallows ALL errors
  }
}
```

#### Silent Read Helper: `readFileIfExists()` in `src/workflow/itemWorkflow.ts:91-97`

```typescript
async function readFileIfExists(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return undefined;  // Swallows permission errors, corruption, etc.
  }
}
```

Used for loading artifact content into prompt variables at lines 151-154. Permission errors or other issues are treated as "no content available."

#### Silent PRD Loading: `loadPrdSafe()` in `src/workflow/itemWorkflow.ts:99-105`

```typescript
async function loadPrdSafe(itemDir: string): Promise<Prd | null> {
  try {
    return await readPrd(itemDir);
  } catch {
    return null;  // Swallows schema validation errors alongside ENOENT
  }
}
```

Used extensively in workflow phases (lines 117, 365, 486, 604, 742, 833). A corrupted or permission-denied `prd.json` is indistinguishable from "no PRD."

#### Batch Progress Reading: `readBatchProgress()` in `src/fs/json.ts:122-137`

```typescript
export async function readBatchProgress(root: string): Promise<BatchProgress | null> {
  try {
    return await readJsonWithSchema(progressPath, BatchProgressSchema, { useLock: true });
  } catch (err) {
    if (err instanceof FileNotFoundError) {
      return null;
    }
    // For schema validation errors or other issues, return null (treat as no progress)
    return null;  // Explicitly swallows non-ENOENT errors
  }
}
```

The comment acknowledges this is intentional but problematic - schema errors are silently swallowed.

#### Doctor Dependencies Scanning: `diagnoseDependencies()` in `src/doctor.ts:94-116`

```typescript
} catch {
  return [];  // Line 104-106: Silently returns empty on directory read errors
}
// ...
} catch {
  // Skip invalid  // Line 113-115: Silently skips items with read errors
}
```

Silently skips items with read errors, potentially missing dependency issues.

#### Status Command Scanning: `scanItems()` in `src/commands/status.ts:33-45`

```typescript
try {
  const item = await readItem(itemPath);
  items.push({...});
} catch {
  // Skip invalid items
}
```

Complete silence on read errors.

#### Indexing Module: `src/domain/indexing.ts`

**`scanItems()` at lines 48-84:**
```typescript
try {
  entries = await fs.readdir(itemsDir);
} catch {
  return [];  // Line 52-56: Swallows directory read errors
}
// ...
try {
  const item = await readItem(itemDirPath);
  items.push(item);
} catch (err) {
  console.warn(`Warning: Skipping invalid item at ${itemJsonPath}: ${...}`);
}
```

This is *better* than complete silence - it warns. But errors are not propagated.

**`getItem()` at lines 93-104:**
```typescript
try {
  return await readItem(itemDir);
} catch {
  return null;  // All errors treated as "not found"
}
```

### Existing Error Infrastructure (Good Pattern)

The `readJsonWithSchema()` function in `src/fs/json.ts:25-64` demonstrates the correct pattern:

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

This pattern should be extended to all artifact detection.

### Key Files

| File | Lines | Description |
|------|-------|-------------|
| `src/fs/util.ts` | 10-17 | `pathExists()` swallows all errors |
| `src/fs/util.ts` | 26-33 | `dirExists()` swallows all errors |
| `src/workflow/itemWorkflow.ts` | 91-97 | `readFileIfExists()` swallows errors |
| `src/workflow/itemWorkflow.ts` | 99-105 | `loadPrdSafe()` swallows errors |
| `src/workflow/itemWorkflow.ts` | 107-128 | `buildValidationContext()` uses swallowing functions |
| `src/doctor.ts` | 262-264 | Artifact checks use `pathExists()` |
| `src/doctor.ts` | 104-106, 113-115 | Silent skips in dependency scanning |
| `src/doctor.ts` | 625-629 | Fix application uses `pathExists()` |
| `src/commands/status.ts` | 33-45 | `scanItems()` swallows errors |
| `src/domain/indexing.ts` | 52-56 | `scanItems()` swallows directory read errors |
| `src/domain/indexing.ts` | 66-74 | `scanItems()` warns but swallows item read errors |
| `src/domain/indexing.ts` | 99-104 | `getItem()` swallows all errors |
| `src/fs/json.ts` | 130-137 | `readBatchProgress()` swallows schema errors |
| `src/fs/json.ts` | 25-64 | **Model pattern** - `readJsonWithSchema()` handles correctly |
| `src/errors.ts` | 63-82 | Existing `FileNotFoundError`, `InvalidJsonError`, `SchemaValidationError` |
| `src/errors.ts` | 236-247 | Existing `ArtifactNotCreatedError` class |
| `specs/002-research-phase.md` | 330-338 | Gap 3 documentation |
| `specs/010-doctor.md` | 287-294 | Gap 4 documentation |

## Technical Considerations

### Dependencies

- **Internal modules:**
  - `src/errors.ts` - Error classes and codes (well-established pattern)
  - `src/fs/json.ts` - JSON file operations (model pattern in `readJsonWithSchema`)
  - `src/schemas.ts` - Zod schemas for validation
- **External packages:**
  - Node.js `fs/promises` - File system operations with error codes (`NodeJS.ErrnoException`)
  - Zod - Schema validation

### Error Categories to Distinguish

| Category | Error Codes | Current Behavior | Correct Behavior |
|----------|-------------|------------------|------------------|
| File not found | `ENOENT` | Returns false/null | Return false/null (legitimate "missing") |
| Permission denied | `EACCES`, `EPERM` | Returns false/null | **Throw/report** as distinct error |
| I/O error | `EIO`, `ENXIO` | Returns false/null | **Throw/report** as distinct error |
| Invalid JSON | N/A (parse error) | Returns null | Report as corruption diagnostic |
| Schema invalid | N/A (Zod error) | Returns null | Report as corruption diagnostic |

### Patterns to Follow

1. **ENOENT distinction pattern** from `src/fs/json.ts:30-38`:
```typescript
if ((err as NodeJS.ErrnoException).code === "ENOENT") {
  throw new FileNotFoundError(`File not found: ${filePath}`);
}
throw err;  // Re-throw other errors
```

2. **Diagnostic reporting** from `src/doctor.ts:198-206`:
```typescript
diagnostics.push({
  itemId: null,
  severity: "error",
  code: "INVALID_CONFIG",
  message: `Error: ${err instanceof Error ? err.message : String(err)}`,
  fixable: false,
});
```

3. **Warning on continue** from `src/domain/indexing.ts:69-73`:
```typescript
console.warn(`Warning: Skipping invalid item at ${path}: ${err.message}`);
```

### Conventions Observed

- Error classes extend `WreckitError` with a `code` property (`src/errors.ts:1-9`)
- Error codes are uppercase snake_case defined in `ErrorCodes` object (`src/errors.ts:14-52`)
- Diagnostic objects have `itemId`, `severity`, `code`, `message`, `fixable` fields (`src/doctor.ts:147-153`)
- Diagnostic severities: `"error"`, `"warning"`, `"info"` (`src/doctor.ts:145`)
- Diagnostic codes follow pattern: `MISSING_X`, `INVALID_X`, `STATE_FILE_MISMATCH`

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking existing workflows that rely on silent failures | High | Create new strict functions; deprecate old ones gradually |
| Permission errors blocking legitimate missing-file scenarios | Medium | Clear error messages with chmod hints |
| Test suite failures from changed error behavior | Medium | Update tests alongside implementation |
| Doctor command flooding users with new warnings | Medium | Start with "error" severity - these are real problems that block operation |
| Backwards compatibility for error handling | Medium | New errors extend existing `WreckitError` base class |
| Performance from additional file system calls | Low | `fs.access()` error codes are sufficient; no extra calls needed |

## Recommended Approach

### Phase 1: Add New Error Type

1. **Add `ArtifactReadError` to `src/errors.ts`:**
   ```typescript
   // Add to ErrorCodes object
   ARTIFACT_READ: "ARTIFACT_READ",

   // Add new error class
   export class ArtifactReadError extends WreckitError {
     constructor(
       public readonly artifactPath: string,
       public readonly cause: Error
     ) {
       super(
         `Failed to read artifact ${artifactPath}: ${cause.message}`,
         ErrorCodes.ARTIFACT_READ
       );
       this.name = "ArtifactReadError";
     }
   }
   ```

### Phase 2: Enhanced Utility Functions

2. **Create strict path checking in `src/fs/util.ts`:**

   Option A - New function (safer for backwards compatibility, recommended):
   ```typescript
   export type PathCheckResult =
     | { exists: true }
     | { exists: false; reason: 'not_found' }
     | { exists: false; reason: 'error'; error: Error };

   export async function pathExistsStrict(filePath: string): Promise<PathCheckResult> {
     try {
       await fs.access(filePath);
       return { exists: true };
     } catch (err) {
       if ((err as NodeJS.ErrnoException).code === "ENOENT") {
         return { exists: false, reason: 'not_found' };
       }
       return { exists: false, reason: 'error', error: err as Error };
     }
   }
   ```

   Option B - Modify existing (simpler, but breaking):
   ```typescript
   export async function pathExists(filePath: string): Promise<boolean> {
     try {
       await fs.access(filePath);
       return true;
     } catch (err) {
       if ((err as NodeJS.ErrnoException).code === "ENOENT") {
         return false;
       }
       throw err;  // Surface real errors
     }
   }
   ```

3. **Create `readArtifactOrError()` utility** that returns content or throws typed error:
   ```typescript
   export async function readArtifactOrError(filePath: string): Promise<string | null> {
     try {
       return await fs.readFile(filePath, "utf-8");
     } catch (err) {
       if ((err as NodeJS.ErrnoException).code === "ENOENT") {
         return null;  // Legitimate missing
       }
       throw new ArtifactReadError(filePath, err as Error);
     }
   }
   ```

### Phase 3: Doctor Command Updates

4. **Add new diagnostic codes to `src/doctor.ts`:**
   - `ARTIFACT_READ_ERROR` - General artifact read failure
   - Or more specific: `RESEARCH_UNREADABLE`, `PLAN_UNREADABLE`, `PRD_UNREADABLE`

5. **Update `diagnoseItem()` in `src/doctor.ts:211-376`:**
   - Replace `pathExists()` calls with strict version
   - Report read errors as distinct diagnostics from missing artifacts
   - Mark as `fixable: false` (requires manual intervention)

### Phase 4: Workflow Updates

6. **Update `src/workflow/itemWorkflow.ts`:**
   - Replace `readFileIfExists()` with error-aware version
   - Update `loadPrdSafe()` to return `{prd: Prd | null, error?: Error}` or throw for non-ENOENT
   - Update `buildValidationContext()` to handle or propagate read errors

### Phase 5: Scanning Updates

7. **Update scanning functions:**
   - `src/commands/status.ts:scanItems()` - log warnings for read errors, continue scanning
   - `src/domain/indexing.ts:scanItems()` - already warns, keep pattern
   - `src/domain/indexing.ts:getItem()` - throw for non-ENOENT errors

### Phase 6: Testing

8. **Add tests for:**
   - Permission-denied scenarios (mock EACCES)
   - Corrupted JSON scenarios
   - New diagnostic codes in doctor
   - Workflow behavior with read errors
   - Add to `src/__tests__/fs.test.ts` - test new utility functions
   - Add to `src/__tests__/doctor.test.ts` - test new diagnostics

## Open Questions

1. **Breaking change vs. new functions?**
   - Modifying `pathExists()` could break dependent code
   - Adding `pathExistsStrict()` creates two similar functions
   - **Recommendation:** Add strict variant `pathExistsStrict()`, deprecate old over time

2. **What diagnostic severity for read errors?**
   - `"error"` is accurate - these are real problems
   - `"warning"` is gentler but undersells the problem
   - **Recommendation:** Use `"error"` severity - permission issues block proper operation

3. **How should batch operations handle partial failures?**
   - Fail fast on first error
   - Continue and aggregate errors
   - Configurable behavior
   - **Recommendation:** Continue with warnings, report count at end, overall success depends on whether any items succeeded

4. **Should `ValidationContext` include error state?**
   - Could add `readErrors: string[]` field
   - Or handle errors separately
   - **Recommendation:** Keep errors separate; context stays focused on artifact presence

5. **Impact on `loadPrdSafe()` callers?**
   - Many callers expect simple `null` return
   - Changing to throw requires updating all call sites
   - **Recommendation:** Add new `loadPrdStrictOrWarn()` that logs errors and returns null, or update all callers

## See Also

- `specs/002-research-phase.md:330-338` - Gap 3: Silent Read Errors
- `specs/010-doctor.md:287-294` - Gap 4: Silent Read Errors
- `ROADMAP.md:28-39` - M3 milestone objectives
- `src/fs/json.ts:25-64` - Model error handling pattern
- `src/errors.ts` - Existing error infrastructure
