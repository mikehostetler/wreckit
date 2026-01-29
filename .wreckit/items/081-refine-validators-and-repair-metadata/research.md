# Research: Refine Validators & Implement Metadata Auto-Repair

**Date**: 2025-01-28
**Item**: 081-refine-validators-and-repair-metadata

## Research Question

Refine strict validation logic to accept valid ID patterns and implement automated repair for PRD schema violations. This ensures `wreckit doctor` reports accurate health status and can self-heal corrupted metadata.

## Summary

The codebase currently has two main validation issues that need to be addressed:

1. **Story ID validation is too strict**: The validator in `src/domain/validation.ts` only accepts `US-###` pattern (e.g., `US-001`, `US-002`), but the actual PRD files in the codebase use a more granular scoped pattern `US-{item}-{seq}` (e.g., `US-073-001`, `US-035-012`). This causes `wreckit doctor` to report false warnings for valid PRDs.

2. **PRD schema violations lack auto-repair**: When PRD files have missing required fields (`id`, `branch_name`) or invalid values (out-of-range priorities), `wreckit doctor` reports errors but cannot fix them automatically with `--fix`. This requires tedious manual repair.

The solution involves:
- Updating the story ID validation regex pattern to accept both `US-###` and `US-{item}-{seq}` formats
- Adding auto-repair logic for common PRD schema violations (missing fields, priority clamping)
- Ensuring backward compatibility with existing simple IDs
- Implementing safe inference logic for missing data (e.g., deriving `branch_name` from item ID)

## Current State Analysis

### Existing Implementation

**Story ID Validation (`src/domain/validation.ts:698-711`)**
```typescript
const STORY_ID_PATTERN = /^US-\d+$/;

function isValidStoryId(storyId: string): boolean {
  return STORY_ID_PATTERN.test(storyId);
}
```

This pattern only matches:
- ✅ `US-001`, `US-073`, `US-999` (simple pattern)
- ❌ `US-073-001`, `US-035-012` (scoped pattern - currently in use!)

**Story Quality Validation (`src/domain/validation.ts:789-848`)**
The `validateStoryQuality` function enforces the strict pattern when `enforceStoryIdFormat` is true (default: true). This causes false positives for valid PRDs using the scoped format.

**Doctor Diagnostics (`src/doctor.ts:383-432`)**
The doctor validates PRDs and reports:
- `INVALID_PRD` (error, not fixable) - for schema violations
- `POOR_STORY_QUALITY` (warning, not fixable) - for story validation failures

Currently, neither diagnostic type is fixable via `wreckit doctor --fix`.

### Key Files

- **`src/domain/validation.ts:698-734`** - Story ID pattern and validation logic
  - `STORY_ID_PATTERN` regex constant (line 701)
  - `isValidStoryId()` validation function (line 709)
  - `validateSingleStory()` which checks ID format (line 732)

- **`src/doctor.ts:383-432`** - PRD validation diagnostics
  - `diagnoseItem()` function that checks PRD schema (line 255)
  - Reports `INVALID_PRD` for schema violations (line 388-394)
  - Reports `POOR_STORY_QUALITY` for story validation failures (line 397-406)

- **`src/doctor.ts:919-1135`** - Auto-repair implementation
  - `applyFixes()` function handles various fixable diagnostics (line 919)
  - Already has fix cases for `INDEX_STALE`, `MISSING_PROMPTS`, `STATE_FILE_MISMATCH`, etc.
  - No fix case for PRD schema violations yet

- **`src/schemas.ts:306-311`** - PRD schema definition
  - `PrdSchema` with required `id` and `branch_name` fields
  - Uses `z.literal(1)` for schema_version (enforced strictly)

- **`src/schemas.ts:297-304`** - Story schema definition
  - `StorySchema` with priority range implicitly enforced by validation
  - No explicit min/max in Zod schema (validation happens in quality checks)

### Real-World Evidence

**Scoped Story IDs in Production PRDs:**
From `.wreckit/items/073-integrate-wisp-go-stack/prd.json`:
```json
{
  "id": "US-073-001",
  "title": "Add Sprite Agent Schema to Configuration System",
  ...
}
```

From `.wreckit/items/035-implement-autonomous-media-layer-integration-with-/prd.json`:
```json
{
  "id": "US-035-012",
  ...
}
```

These IDs are **valid** according to the project's conventions but **rejected** by the current validator.

**Simple Story IDs in Legacy PRDs:**
From `.wreckit/items/032-implement-backup-mechanism-before-doctor-fixes-spe/prd.json`:
```json
{
  "id": "US-001",
  "title": "Update spec 010 to mark Gap 3 as fixed",
  ...
}
```

Both patterns coexist in the codebase and should be supported.

## Technical Considerations

### Dependencies

**External Dependencies:**
- `zod` - Schema validation library (already in use)
- No additional dependencies needed

**Internal Modules:**
- `src/domain/validation.ts` - Story quality validation (needs pattern update)
- `src/doctor.ts` - Diagnostics and auto-repair logic (needs new fix cases)
- `src/schemas.ts` - Zod schemas (no changes needed, validation is separate)
- `src/fs/json.ts` - File read/write utilities (used for repairs)
- `src/fs/backup.ts` - Backup mechanism (already integrated with applyFixes)

### Patterns to Follow

**Existing Pattern: ID Validation**
The current pattern in `isValidStoryId()` uses a simple regex:
```typescript
const STORY_ID_PATTERN = /^US-\d+$/;
return STORY_ID_PATTERN.test(storyId);
```

This should be updated to:
```typescript
const STORY_ID_PATTERN = /^US-(?:\d+|\d{3}-\d+)$/;
```

This matches:
- `US-001` (legacy simple format)
- `US-073-001` (new scoped format with item prefix)
- `US-999` (any 1+ digit simple format)

**Existing Pattern: Auto-Repair with Backup**
From `src/doctor.ts:941-973` (INDEX_STALE fix):
```typescript
case "INDEX_STALE": {
  try {
    // Backup existing index.json before regeneration
    const entry = await backupFile(
      root,
      sessionId,
      indexPath,
      diagnostic,
      "modified",
    );
    if (entry) {
      backupEntries.push(entry);
      hasBackups = true;
      backupInfo = { sessionId, filePath: entry.backup_path };
    }

    // Apply fix
    const items = await scanItems(root);
    const index: Index = {
      schema_version: 1,
      items,
      generated_at: new Date().toISOString(),
    };
    await writeIndex(root, index);
    fixed = true;
    message = "Rebuilt index.json";
  } catch (err) {
    message = `Failed to rebuild index: ${err.message}`;
  }
  break;
}
```

PRD repairs should follow this exact pattern:
1. Backup the file before modification
2. Apply the fix safely
3. Handle errors gracefully
4. Return success/failure status

**Existing Pattern: Safe Data Inference**
From `src/doctor.ts:1017-1028` (STATE_FILE_MISMATCH fix):
```typescript
// Infer correct state from available artifacts
let newState = item.state;
if (item.state === "researched" && !hasResearch) {
  newState = "idea";
} else if (item.state === "planned" && (!hasPlan || !hasPrd) && hasResearch) {
  newState = "researched";
}
```

PRD field inference should follow similar logic:
- `branch_name` can be inferred from `id` field: `wreckit/${id}`
- Priority values can be clamped to valid range [1, 4]

### Integration Points

1. **Doctor Command (`src/commands/doctor.ts`)** - Already integrates with `runDoctor()` and `applyFixes()`, no changes needed

2. **Story Quality Validation (`src/domain/validation.ts`)** - Called by `diagnoseItem()` at line 397, needs pattern update

3. **Backup System (`src/fs/backup.ts`)** - Already integrated with `applyFixes()`, PRD repairs should use existing backup functions

4. **Test Suite (`src/__tests__/doctor.test.ts`)** - Comprehensive test coverage exists, new tests needed for PRD repair cases

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Breaking existing valid PRDs** | High | Ensure new regex pattern is backward compatible with `US-###` format. Test against all existing PRD files in `.wreckit/items/*/prd.json` |
| **Data corruption during auto-repair** | High | Always create backups before modifying files (existing pattern in `src/doctor.ts:932-934`). Use `writeItem()` with proper locking |
| **Inferring wrong branch_name** | Medium | Only infer `branch_name` when explicitly missing. Use safe template: `wreckit/${prd.id}`. Add validation that inferred value is non-empty |
| **Priority clamping changes semantics** | Medium | Clamp to [1, 4] as specified in success criteria. Log when clamping occurs so user is aware. Consider making this opt-in or warning-only |
| **Edge cases in ID pattern** | Low | Test regex pattern against: `US-1`, `US-001`, `US-073-001`, `US-999-999`, `US-073-A01` (should reject). Use anchored pattern with `^` and `$` |
| **Performance impact on doctor** | Low | Validation is already O(n) over stories. Regex update is O(1) per ID. Auto-repair is opt-in via `--fix` flag |

## Recommended Approach

### Phase 1: Update Story ID Validation Pattern

**File: `src/domain/validation.ts:698-711`**

1. Update `STORY_ID_PATTERN` regex:
   ```typescript
   const STORY_ID_PATTERN = /^US-(?:\d+|\d{3}-\d+)$/;
   ```

2. Update error message in `validateSingleStory()` to reflect both patterns:
   ```typescript
   errors.push(`Story ID "${story.id}" does not match format US-### or US-{item}-{seq}`);
   ```

3. Add tests to `src/__tests__/domain.test.ts` or create new `src/__tests__/story-id-validation.test.ts`:
   - Test simple pattern: `US-001`, `US-073`, `US-999`
   - Test scoped pattern: `US-073-001`, `US-035-012`
   - Test invalid patterns: `US-A01`, `US-`, `US-073-A01`

### Phase 2: Implement PRD Schema Auto-Repair

**File: `src/doctor.ts:919-1135` (applyFixes function)**

Add new diagnostic codes for PRD violations:
- `PRD_MISSING_ID` - PRD missing required `id` field
- `PRD_MISSING_BRANCH_NAME` - PRD missing required `branch_name` field
- `PRD_INVALID_PRIORITY` - Story priority outside [1, 4] range

**Step 1: Detect PRD violations in `diagnoseItem()`**

Update `src/doctor.ts:383-432` to add fixable diagnostics:
```typescript
// Check for missing required fields (fixable)
if (!prdResult.data.id) {
  diagnostics.push({
    itemId,
    severity: "error",
    code: "PRD_MISSING_ID",
    message: "prd.json missing required 'id' field",
    fixable: true,
  });
}

if (!prdResult.data.branch_name) {
  diagnostics.push({
    itemId,
    severity: "error",
    code: "PRD_MISSING_BRANCH_NAME",
    message: "prd.json missing required 'branch_name' field",
    fixable: true,
  });
}

// Check for out-of-range priorities (fixable)
const invalidPriorities = prdResult.data.user_stories.filter(
  s => s.priority < 1 || s.priority > 4
);
if (invalidPriorities.length > 0) {
  diagnostics.push({
    itemId,
    severity: "warning",
    code: "PRD_INVALID_PRIORITY",
    message: `${invalidPriorities.length} stories have priority outside [1, 4] range`,
    fixable: true,
  });
}
```

**Step 2: Implement repair logic in `applyFixes()`**

Add fix cases in `src/doctor.ts:936-1124`:

```typescript
case "PRD_MISSING_ID":
case "PRD_MISSING_BRANCH_NAME":
case "PRD_INVALID_PRIORITY": {
  if (!diagnostic.itemId) break;

  try {
    const itemDir = path.join(getItemsDir(root), diagnostic.itemId);
    const prdPath = path.join(itemDir, "prd.json");
    const data = await readJson(prdPath);
    const prd = PrdSchema.parse(data); // This will fail validation, so use partial type

    // Backup before modification
    const entry = await backupFile(
      root,
      sessionId,
      prdPath,
      diagnostic,
      "modified",
    );
    if (entry) {
      backupEntries.push(entry);
      hasBackups = true;
      backupInfo = { sessionId, filePath: entry.backup_path };
    }

    let repaired = false;

    // Repair missing id (infer from item directory name)
    if (diagnostic.code === "PRD_MISSING_ID") {
      prd.id = diagnostic.itemId;
      repaired = true;
    }

    // Repair missing branch_name (infer from id)
    if (diagnostic.code === "PRD_MISSING_BRANCH_NAME") {
      const prdId = prd.id || diagnostic.itemId;
      prd.branch_name = `wreckit/${prdId}`;
      repaired = true;
    }

    // Repair invalid priorities
    if (diagnostic.code === "PRD_INVALID_PRIORITY") {
      let clampedCount = 0;
      prd.user_stories = prd.user_stories.map(story => {
        if (story.priority < 1) {
          clampedCount++;
          return { ...story, priority: 1 };
        }
        if (story.priority > 4) {
          clampedCount++;
          return { ...story, priority: 4 };
        }
        return story;
      });
      repaired = true;
    }

    if (repaired) {
      // Validate repaired PRD
      const validationResult = PrdSchema.safeParse(prd);
      if (!validationResult.success) {
        throw new Error(`Repaired PRD still invalid: ${validationResult.error.message}`);
      }

      // Write repaired PRD
      await fs.writeFile(prdPath, JSON.stringify(prd, null, 2));
      fixed = true;
      message = diagnostic.code === "PRD_INVALID_PRIORITY"
        ? `Clamped priorities to [1, 4] range`
        : `Added missing field '${diagnostic.code.replace('PRD_MISSING_', '').toLowerCase()}'`;
    }
  } catch (err) {
    message = `Failed to repair PRD: ${err instanceof Error ? err.message : String(err)}`;
  }
  break;
}
```

### Phase 3: Testing

**File: `src/__tests__/doctor.test.ts`**

Add test cases for PRD repairs:
1. Test repair of missing `id` field
2. Test repair of missing `branch_name` field
3. Test repair of out-of-range priorities (clamp to [1, 4])
4. Test backup creation before PRD modification
5. Test that repaired PRD passes schema validation
6. Test that simple and scoped story IDs both pass validation

### Phase 4: Documentation

Update item's `research.md` and `plan.md` to document:
- Supported story ID formats (`US-###` and `US-{item}-{seq}`)
- Auto-repair capabilities for PRD violations
- Safety guarantees (backups, validation before write)

## Open Questions

1. **Should priority clamping be opt-in?** The success criteria says "clamp invalid priorities to [1, 4]", but changing user data automatically might be controversial. Consider making this a warning by default with opt-in fix via `--fix` flag.

2. **What if `id` field is missing and we can't infer it?** The current plan infers `id` from the item directory name (e.g., `073-integrate-wisp-go-stack`), but what if the directory name doesn't match the expected PRD `id` format? Should we fail the repair or use the directory name as-is?

3. **Should we add a `--dry-run` option for repairs?** This would show what repairs would be applied without actually modifying files. Useful for safety.

4. **How to handle PRDs that are completely malformed (invalid JSON)?** Currently `INVALID_PRD` with invalid JSON is not fixable. Should we attempt JSON repair or just report the error?

5. **Should we add validation for `branch_name` format?** If we're inferring `branch_name`, should we validate it matches the expected pattern `wreckit/{id}`? What if the user wants a custom branch name?

6. **Performance: Should we batch multiple PRD repairs?** If there are 100 items with PRD violations, should we process them all in one `applyFixes()` call or limit to a certain number per run?

7. **Should we add a diagnostic for mixed ID formats in the same PRD?** If a PRD has both `US-001` and `US-073-001`, should we warn about inconsistency even though both are technically valid?
