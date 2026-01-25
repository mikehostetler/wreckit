# Fix silent read errors in artifact detection (specs 002, 010 Gap: errors swallowed) Implementation Plan

## Overview

This item addresses the silent read errors in artifact detection identified in Spec 002 Gap 3 and Spec 010 Gap 4. The goal is to ensure that when file reads fail due to permission issues, corruption, or other non-ENOENT errors, these errors are properly surfaced rather than being silently treated as "file does not exist."

**Implementation Status: NEARLY COMPLETE**

Upon thorough code review, the core implementation has been completed:
- `ArtifactReadError` class exists in `src/errors.ts:91-102`
- `tryReadFile()` and `checkPathAccess()` utilities exist in `src/fs/util.ts:42-101`
- Doctor command reports `ARTIFACT_UNREADABLE` diagnostic in `src/doctor.ts:262-294`
- Workflow `buildValidationContext()` uses error-aware checks in `src/workflow/itemWorkflow.ts:130-138`
- Tests exist for the new utilities in `src/__tests__/fs-util.test.ts`

The remaining work is:
1. Fix directory read error swallowing in `src/domain/indexing.ts:57-61`
2. Fix directory read error swallowing in `src/doctor.ts:104-106`
3. Add error type imports to `src/doctor.ts:diagnoseDependencies()`
4. Update spec files to mark gaps as FIXED

## Current State Analysis

### What's Already Implemented (Verified in Code):

| Feature | Location | Status |
|---------|----------|--------|
| `ArtifactReadError` class | `src/errors.ts:91-102` | ✅ Done |
| `ARTIFACT_READ_ERROR` code | `src/errors.ts:54` | ✅ Done |
| `tryReadFile()` utility | `src/fs/util.ts:55-68` | ✅ Done |
| `checkPathAccess()` utility | `src/fs/util.ts:88-101` | ✅ Done |
| Tests for utilities | `src/__tests__/fs-util.test.ts` | ✅ Done |
| Doctor `ARTIFACT_UNREADABLE` | `src/doctor.ts:262-294` | ✅ Done |
| Doctor fix error-aware | `src/doctor.ts:661-675` | ✅ Done |
| Workflow `buildValidationContext` | `src/workflow/itemWorkflow.ts:130-138` | ✅ Done |
| `readFileIfExists()` error-aware | `src/workflow/itemWorkflow.ts:96-107` | ✅ Done |
| `loadPrdSafe()` error-aware | `src/workflow/itemWorkflow.ts:109-120` | ✅ Done |
| Status `scanItems()` warns | `src/commands/status.ts:48-57` | ✅ Done |
| Indexing `getItem()` throws | `src/domain/indexing.ts:106-113` | ✅ Done |
| Indexing `itemExists()` throws | `src/domain/indexing.ts:116-127` | ✅ Done |
| `readBatchProgress()` throws | `src/fs/json.ts:130-141` | ✅ Done |
| Doctor test for ARTIFACT_UNREADABLE | `src/__tests__/doctor.test.ts:178-211` | ✅ Done |

### Remaining Issues:

| Location | Issue | Impact |
|----------|-------|--------|
| `src/domain/indexing.ts:57-61` | `fs.readdir` errors return empty array | Items directory permission errors masked |
| `src/doctor.ts:104-106` | Same issue in `diagnoseDependencies` | Dependency checks skip silently |
| `src/doctor.ts:113-115` | Item read errors skip silently (no warning) | Invalid items may hide real errors |
| `specs/002-research-phase.md:337` | Still says "Status: Open" | Documentation out of date |
| `specs/010-doctor.md:293` | Still says "Status: Open" | Documentation out of date |

### Key Discoveries:

- **Implementation is 95% complete** - only minor edge cases remain
- **Spec files are out of date** - need to reflect completed work
- **`diagnoseDependencies`** still uses bare catch blocks (`src/doctor.ts:104, 113`)
- **`indexing.scanItems`** still swallows directory read errors (`src/domain/indexing.ts:59`)

## Desired End State

1. **All artifact read operations** distinguish between:
   - `ENOENT` (file/directory does not exist) - expected, handle gracefully
   - Permission/I/O errors - unexpected, propagate or warn

2. **Spec files updated** to reflect current implementation status:
   - Spec 002 Gap 3: FIXED
   - Spec 010 Gap 4: FIXED

3. **Consistent error handling** across all scanning functions:
   - Directory read errors either throw or warn (not silently return empty)
   - Item read errors either throw or warn (not silently skip)

### Verification Criteria:
- `bun test` passes with all tests
- `bun run typecheck` passes
- `bun run lint` passes
- Doctor command reports `ARTIFACT_UNREADABLE` for permission-denied artifacts
- Scanning functions warn on unexpected errors

## What We're NOT Doing

1. **Not changing `pathExists()` or `dirExists()`** - Too many callers, breaking change. Use `checkPathAccess()` instead.
2. **Not adding backup mechanism** - That's Spec 010 Gap 3, separate work.
3. **Not adding more fixable diagnostics** - That's Spec 010 Gap 2, separate work.
4. **Not failing hard on scanning errors** - Continue with warnings for resilience.
5. **Not changing test patterns** - Existing tests cover the functionality.

## Implementation Approach

This is a **completion task** with three components:
1. Fix remaining edge cases (directory read errors)
2. Update spec files to reflect completed work
3. Add imports for error classes where needed

---

## Phase 1: Fix Directory Read Error Swallowing in indexing.ts

### Overview
Fix the `scanItems` function in `src/domain/indexing.ts` to distinguish ENOENT from permission errors.

### Changes Required:

#### 1. Update `src/domain/indexing.ts:57-61`
**File**: `src/domain/indexing.ts`
**Changes**: Distinguish ENOENT from permission errors when reading items directory

Current code:
```typescript
let entries: string[];
try {
  entries = await fs.readdir(itemsDir);
} catch {
  return [];
}
```

Updated code:
```typescript
let entries: string[];
try {
  entries = await fs.readdir(itemsDir);
} catch (err) {
  // ENOENT means items directory doesn't exist yet - expected case
  if ((err as NodeJS.ErrnoException).code === "ENOENT") {
    return [];
  }
  // Permission or I/O errors should warn, not silently return empty
  console.warn(
    `Warning: Cannot read items directory ${itemsDir}: ${err instanceof Error ? err.message : String(err)}`
  );
  return [];
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Tests pass: `bun test`
- [ ] Type checking passes: `bun run typecheck`
- [ ] Linting passes: `bun run lint`
- [ ] Build succeeds: `bun run build`

#### Manual Verification:
- [ ] Create restricted items directory: `chmod 000 .wreckit/items`
- [ ] Run `wreckit status` - verify warning is logged
- [ ] Restore permissions: `chmod 755 .wreckit/items`

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to next phase.

---

## Phase 2: Fix Directory Read Error Swallowing in doctor.ts

### Overview
Fix the `diagnoseDependencies` function in `src/doctor.ts` to properly handle read errors.

### Changes Required:

#### 1. Add error imports to `src/doctor.ts`
**File**: `src/doctor.ts`
**Changes**: Import error classes for proper error type checking

Add to imports (after line 26):
```typescript
import {
  FileNotFoundError,
  InvalidJsonError,
  SchemaValidationError,
} from "./errors";
```

#### 2. Update `src/doctor.ts:98-116` (diagnoseDependencies)
**File**: `src/doctor.ts`
**Changes**: Distinguish ENOENT from permission errors and report diagnostics

Current code (lines 98-116):
```typescript
let itemDirs: string[];
try {
  const entries = await fs.readdir(itemsDir, { withFileTypes: true });
  itemDirs = entries
    .filter((e) => e.isDirectory() && /^\d{3}-/.test(e.name))
    .map((e) => e.name);
} catch {
  return [];
}

const items: Item[] = [];
for (const dir of itemDirs) {
  try {
    const item = await readItem(path.join(itemsDir, dir));
    items.push(item);
  } catch {
    // Skip invalid
  }
}
```

Updated code:
```typescript
let itemDirs: string[];
try {
  const entries = await fs.readdir(itemsDir, { withFileTypes: true });
  itemDirs = entries
    .filter((e) => e.isDirectory() && /^\d{3}-/.test(e.name))
    .map((e) => e.name);
} catch (err) {
  // ENOENT is expected (no items yet), other errors should report
  if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
    diagnostics.push({
      itemId: null,
      severity: "warning",
      code: "ITEMS_DIR_UNREADABLE",
      message: `Cannot read items directory: ${err instanceof Error ? err.message : String(err)}`,
      fixable: false,
    });
  }
  return diagnostics;
}

const items: Item[] = [];
for (const dir of itemDirs) {
  try {
    const item = await readItem(path.join(itemsDir, dir));
    items.push(item);
  } catch (err) {
    // Expected errors: skip silently (consistent with scanItems pattern)
    if (err instanceof FileNotFoundError) continue;
    if (err instanceof InvalidJsonError) continue;
    if (err instanceof SchemaValidationError) continue;
    // Unexpected errors: warn
    console.warn(
      `Warning: Cannot read item ${dir}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Tests pass: `bun test`
- [ ] Type checking passes: `bun run typecheck`
- [ ] Linting passes: `bun run lint`
- [ ] Build succeeds: `bun run build`

#### Manual Verification:
- [ ] Create restricted items directory: `chmod 000 .wreckit/items`
- [ ] Run `wreckit doctor` - verify `ITEMS_DIR_UNREADABLE` diagnostic
- [ ] Restore permissions: `chmod 755 .wreckit/items`

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to next phase.

---

## Phase 3: Update Spec Files to Mark Gaps as FIXED

### Overview
Update the specification files to reflect that the implementation is complete.

### Changes Required:

#### 1. Update `specs/002-research-phase.md`
**File**: `specs/002-research-phase.md`
**Changes**: Mark Gap 3 as FIXED (lines 331-338)

Current:
```markdown
### Gap 3: Silent Read Errors

If reading existing artifacts fails (permissions, corruption), errors are swallowed and the artifact is treated as missing.

**Impact:** State inconsistencies may go undetected.

**Status:** Open - Still relies on try/catch returning undefined for missing files.
```

Updated:
```markdown
### Gap 3: Silent Read Errors ✅ FIXED

~~If reading existing artifacts fails (permissions, corruption), errors are swallowed and the artifact is treated as missing.~~

**Impact:** State inconsistencies may go undetected.

**Status:** Fixed - Error-aware utilities `tryReadFile()` and `checkPathAccess()` in `src/fs/util.ts:42-101` distinguish ENOENT from permission/I/O errors. `buildValidationContext()` in `src/workflow/itemWorkflow.ts:130-138` throws on access errors. `readFileIfExists()` (line 96-107) and `loadPrdSafe()` (line 109-120) properly propagate unexpected errors. Scanning functions warn on read errors.
```

#### 2. Update `specs/010-doctor.md`
**File**: `specs/010-doctor.md`
**Changes**: Mark Gap 4 as FIXED (lines 287-294)

Current:
```markdown
### Gap 4: Silent Read Errors

If reading an artifact fails (permissions), the error is swallowed and artifact treated as missing.

**Impact:** Real errors masked as missing files.

**Status:** Open - Still swallows read errors.
```

Updated:
```markdown
### Gap 4: Silent Read Errors ✅ FIXED

~~If reading an artifact fails (permissions), the error is swallowed and artifact treated as missing.~~

**Impact:** Real errors masked as missing files.

**Status:** Fixed - Doctor uses `checkPathAccess()` from `src/fs/util.ts:88-101` to distinguish "not found" from "cannot access". Reports `ARTIFACT_UNREADABLE` diagnostic with severity "error" when artifacts exist but cannot be read. See `src/doctor.ts:262-294`. Fix application also uses error-aware checks at lines 661-675.
```

### Success Criteria:

#### Automated Verification:
- [ ] Spec files are valid markdown (no syntax errors)
- [ ] No broken internal links

#### Manual Verification:
- [ ] Review spec file changes for accuracy
- [ ] Verify code line references are correct

**Note**: Complete all verification before proceeding.

---

## Phase 4: Add Test for ITEMS_DIR_UNREADABLE Diagnostic

### Overview
Add a test to verify that doctor reports the new `ITEMS_DIR_UNREADABLE` diagnostic.

### Changes Required:

#### 1. Add test to `src/__tests__/doctor.test.ts`
**File**: `src/__tests__/doctor.test.ts`
**Changes**: Add test for items directory read error handling

```typescript
it("returns ITEMS_DIR_UNREADABLE when items directory cannot be accessed", async () => {
  // Skip on Windows and when running as root (root bypasses permissions)
  if (process.platform === "win32" || process.getuid?.() === 0) {
    return;
  }

  // Create wreckit dir but no items directory
  const wreckitDir = path.join(tempDir, ".wreckit");
  await fs.mkdir(wreckitDir, { recursive: true });

  const itemsDir = path.join(wreckitDir, "items");
  await fs.mkdir(itemsDir);

  // Create an item first so there's something to fail on
  await createItem(tempDir, "001-test", { state: "idea" });

  // Remove read permission from items directory
  await fs.chmod(itemsDir, 0o000);

  try {
    const diagnostics = await diagnose(tempDir);
    const unreadable = diagnostics.find((d) => d.code === "ITEMS_DIR_UNREADABLE");

    expect(unreadable).toBeDefined();
    expect(unreadable?.severity).toBe("warning");
    expect(unreadable?.fixable).toBe(false);
    expect(unreadable?.message).toContain("Cannot read items directory");
  } finally {
    await fs.chmod(itemsDir, 0o755);
  }
});
```

### Success Criteria:

#### Automated Verification:
- [ ] New test passes: `bun test src/__tests__/doctor.test.ts`
- [ ] All tests pass: `bun test`

#### Manual Verification:
- [ ] Test correctly skips on Windows/root
- [ ] Test covers the intended scenario

---

## Testing Strategy

### Existing Tests (Already Pass):
- `src/__tests__/fs-util.test.ts` - Tests for `tryReadFile()` and `checkPathAccess()`
- `src/__tests__/doctor.test.ts` - Test for `ARTIFACT_UNREADABLE` diagnostic

### New Tests to Add:
- Test for `ITEMS_DIR_UNREADABLE` diagnostic in doctor

### Manual Testing Steps:
1. Create a test wreckit repository: `mkdir test-repo && cd test-repo && wreckit init`
2. Add an item: `wreckit new "Test item"`
3. Make items directory unreadable: `chmod 000 .wreckit/items`
4. Run `wreckit doctor` - should see `ITEMS_DIR_UNREADABLE` diagnostic
5. Run `wreckit status` - should see warning about unreadable directory
6. Restore permissions: `chmod 755 .wreckit/items`
7. Verify normal operation restored

## Migration Notes

No migration needed. All changes are:
- Bug fixes (better error handling)
- Documentation updates (spec files)
- Additive tests

## References

- Research: `/Users/speed/wreckit/.wreckit/items/031-fix-silent-read-errors-in-artifact-detection-specs/research.md`
- Spec 002: `specs/002-research-phase.md:331-338`
- Spec 010: `specs/010-doctor.md:287-294`
- ArtifactReadError: `src/errors.ts:91-102`
- tryReadFile/checkPathAccess: `src/fs/util.ts:42-101`
- Doctor ARTIFACT_UNREADABLE: `src/doctor.ts:262-294`
- Tests: `src/__tests__/fs-util.test.ts`, `src/__tests__/doctor.test.ts`
