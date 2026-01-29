# 010 - Doctor

## Overview

**Purpose:** Validate repository state against invariants and optionally repair inconsistencies.

**Scope:** Diagnostic detection, fix application, state/artifact consistency, index regeneration.

**Out of scope:** Phase execution, agent behavior, CLI command structure (except `wreckit doctor`).

### Where This Applies

- Manual recovery: `wreckit doctor --fix`
- Automated validation before operations
- Primary component: `src/doctor.ts`

---

## Security Model: Conservative Repair

### Core Principle

Fixes must be conservative. Prefer resetting to a known-good earlier state over guessing forward. Never delete user data. Always explain what changed.

### Guardrails Required

| Guardrail                 | Purpose                                |
| ------------------------- | -------------------------------------- |
| **No Data Deletion**      | Fixes never delete artifacts or items  |
| **State Regression Only** | Fixes move state backward, not forward |
| **Explicit Reporting**    | All fixes are logged with before/after |
| **Dry-Run Support**       | `--fix` required for mutations         |

---

## Diagnostic Codes

| Code                  | Severity | Description                           | Fixable |
| --------------------- | -------- | ------------------------------------- | ------- |
| `MISSING_CONFIG`      | warning  | config.json missing (defaults used)   | No      |
| `INVALID_CONFIG`      | error    | config.json invalid JSON or schema    | No      |
| `MISSING_ITEM_JSON`   | error    | item.json missing in item directory   | No      |
| `INVALID_ITEM_JSON`   | error    | item.json invalid JSON or schema      | No      |
| `INVALID_PRD`         | error    | prd.json invalid JSON or schema       | No      |
| `STATE_FILE_MISMATCH` | warning  | State doesn't match artifact presence | Yes     |
| `INDEX_STALE`         | warning  | index.json out of sync with items     | Yes     |
| `MISSING_PROMPTS`     | info     | prompts directory missing             | Yes     |

---

## Detection Rules

### Config Validation

1. Check if `.wreckit/config.json` exists
2. If exists, parse as JSON
3. Validate against `ConfigSchema`
4. Report `MISSING_CONFIG` or `INVALID_CONFIG`

### Item Validation

For each directory in `.wreckit/items/` matching `^\d{3}-`:

1. Check `item.json` exists → `MISSING_ITEM_JSON`
2. Parse and validate against `ItemSchema` → `INVALID_ITEM_JSON`
3. Check state/artifact consistency (see below)
4. If `prd.json` exists, validate against `PrdSchema` → `INVALID_PRD`

### State/Artifact Consistency

| State          | Required Artifacts              | Diagnostic                              |
| -------------- | ------------------------------- | --------------------------------------- |
| `researched`   | `research.md`                   | `STATE_FILE_MISMATCH` if missing        |
| `planned`      | `plan.md` AND `prd.json`        | `STATE_FILE_MISMATCH` if either missing |
| `implementing` | `prd.json` with pending stories | `STATE_FILE_MISMATCH` if no pending     |
| `in_pr`        | `pr_url` and `branch` set       | `STATE_FILE_MISMATCH` if null           |

### Index Validation

1. Parse `.wreckit/index.json`
2. Scan actual items from directories
3. Compare:
   - Items missing from index
   - Extra items in index
   - State mismatches
4. Report `INDEX_STALE` if any discrepancy

### Prompts Validation

1. Check if `.wreckit/prompts/` exists
2. Report `MISSING_PROMPTS` (info level, fixable)

---

## Diagnostic Schema

```typescript
interface Diagnostic {
  itemId: string | null; // null for global issues
  severity: "error" | "warning" | "info";
  code: string; // e.g., "STATE_FILE_MISMATCH"
  message: string; // Human-readable description
  fixable: boolean; // Whether --fix can repair this
}
```

---

## Fix Rules

### STATE_FILE_MISMATCH

Regress state to match available artifacts:

| Current State | Missing Artifact              | New State                                 |
| ------------- | ----------------------------- | ----------------------------------------- |
| `researched`  | `research.md`                 | `idea`                                    |
| `planned`     | both `plan.md` and `prd.json` | `researched` if has research, else `idea` |
| `planned`     | only `plan.md`                | Not fixable                               |
| `planned`     | only `prd.json`               | Not fixable                               |

**Behavior:**

1. Read current `item.json`
2. Determine correct state based on artifacts
3. Update state and `updated_at`
4. Write back to `item.json`

### INDEX_STALE

Regenerate index from actual items:

1. Scan all item directories
2. Read each `item.json`
3. Build new index with current states
4. Write to `.wreckit/index.json`

### MISSING_PROMPTS

Create default prompt templates:

1. Create `.wreckit/prompts/` directory
2. Copy bundled default templates

---

## Fix Result Schema

```typescript
interface FixResult {
  diagnostic: Diagnostic;
  fixed: boolean; // Whether fix was applied
  message: string; // What was done or why it failed
}
```

---

## Behavior

### Diagnose Only (Default)

```bash
wreckit doctor
```

1. Run all diagnostic checks
2. Print diagnostics grouped by severity
3. Exit 0 if no errors, 1 if errors

### Diagnose and Fix

```bash
wreckit doctor --fix
```

1. Run all diagnostic checks
2. Apply fixes for fixable diagnostics
3. Print diagnostics with fix results
4. Exit 0 if no remaining errors

---

## Error Handling

| Error Condition              | Behavior                                   |
| ---------------------------- | ------------------------------------------ |
| Cannot read item.json        | Report diagnostic, skip item               |
| Fix fails (permission, etc.) | Report in fix result, continue             |
| No `.wreckit/` directory     | Return empty diagnostics (not initialized) |

---

## Resumability

- **Idempotent:** Running `--fix` multiple times is safe
- **No partial fixes:** Each fix is atomic per item
- **Re-run safe:** Fixed items pass validation on next run

---

## Output Format

### Default

```
✓ No issues found
```

or

```
Diagnostics:
  warning: [001-feature] State is 'researched' but research.md is missing
  warning: index.json is out of sync: 2 items missing from index

Fixable issues: 2
Run with --fix to repair
```

### With --fix

```
Diagnostics:
  warning: [001-feature] State is 'researched' but research.md is missing
    → Fixed: Reset state from 'researched' to 'idea'
  warning: index.json is out of sync: 2 items missing from index
    → Fixed: Rebuilt index.json

Fixed 2 issues
```

---

## Exit Codes

| Code | Meaning                      |
| ---- | ---------------------------- |
| 0    | No errors (warnings/info OK) |
| 1    | Errors found (or fix failed) |

---

## Implementation Status

| Feature                        | Status         | Notes                                    |
| ------------------------------ | -------------- | ---------------------------------------- |
| **Core doctor command**        | ✅ Implemented | See `src/doctor.ts`                      |
| **Config validation**          | ✅ Implemented | `MISSING_CONFIG`, `INVALID_CONFIG`       |
| **Item validation**            | ✅ Implemented | `MISSING_ITEM_JSON`, `INVALID_ITEM_JSON` |
| **PRD validation**             | ✅ Implemented | `INVALID_PRD`                            |
| **State/artifact consistency** | ✅ Implemented | `STATE_FILE_MISMATCH`                    |
| **Index validation**           | ✅ Implemented | `INDEX_STALE`                            |
| **Prompts validation**         | ✅ Implemented | `MISSING_PROMPTS`                        |
| **Story quality validation**   | ✅ Implemented | `POOR_STORY_QUALITY`                     |
| **Fix: STATE_FILE_MISMATCH**   | ✅ Implemented | Regresses state to match artifacts       |
| **Fix: INDEX_STALE**           | ✅ Implemented | Regenerates index.json                   |
| **Fix: MISSING_PROMPTS**       | ✅ Implemented | Creates default templates                |
| **--fix flag**                 | ✅ Implemented | Auto-fix recoverable issues              |
| **Exit codes**                 | ✅ Implemented | 0 (no errors), 1 (errors found)          |

---

## Known Gaps

### Gap 1: No Deep PRD Validation ✅ FIXED

~~Doctor validates PRD schema but not story quality or completeness relative to state.~~

**Status:** Fixed - Story quality validation implemented. See `validateStoryQuality()` in `src/domain/validation.ts`. Reports `POOR_STORY_QUALITY` diagnostic.

### Gap 2: Limited Fix Scope

Only `STATE_FILE_MISMATCH`, `INDEX_STALE`, and `MISSING_PROMPTS` are fixable.

**Impact:** Many issues require manual intervention.

**Status:** Open - No additional automated repairs added.

### Gap 3: No Backup Before Fix

Fixes modify files without creating backups.

**Impact:** Cannot undo fixes if they cause problems.

**Status:** Open - No backup mechanism implemented.

### Gap 4: Silent Read Errors ✅ FIXED

~~If reading an artifact fails (permissions), the error is swallowed and artifact treated as missing.~~

**Impact:** Real errors masked as missing files.

**Status:** Fixed - Doctor uses `checkPathAccess()` from `src/fs/util.ts:88-101` to distinguish "not found" from "cannot access". Reports `ARTIFACT_UNREADABLE` diagnostic with severity "error" when artifacts exist but cannot be read. See `src/doctor.ts:262-294`. Fix application also uses error-aware checks at lines 661-675. `diagnoseDependencies()` reports `ITEMS_DIR_UNREADABLE` diagnostic for directory permission errors.

---

## See Also

- [007-item-store.md](./007-item-store.md) — Data model and invariants
- [009-cli.md](./009-cli.md) — CLI command structure
