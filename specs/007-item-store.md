# 007 - Item Store

## Overview

**Purpose:** Define the data model, directory layout, and storage invariants for wreckit items.

**Scope:** Item schema, `.wreckit/` directory structure, artifact discovery, indexing, ID allocation.

**Out of scope:** Phase-specific artifact content (covered in 001-006), agent execution, CLI commands.

### Where This Applies

- All phases read/write items via this storage model
- Doctor validates against these invariants
- Primary components: `src/domain/`, `src/fs/paths.ts`, `src/schemas.ts`

---

## Security Model: Data Integrity

### Core Principle

Files are truth. All state is persisted as JSON and Markdown in `.wreckit/`, git-trackable and human-inspectable. Corruption or inconsistency must be detectable and repairable.

### Guardrails Required

| Guardrail             | Purpose                                                 |
| --------------------- | ------------------------------------------------------- |
| **Schema Validation** | All JSON files validated against Zod schemas before use |
| **Atomic Writes**     | Partial writes should not corrupt state                 |
| **ID Uniqueness**     | No duplicate item IDs within a repository               |
| **Path Containment**  | All item artifacts stay within `.wreckit/items/<id>/`   |

### Current Gap

Writes are not atomic (no temp file + rename pattern). Interrupted writes can leave corrupted JSON.

---

## Directory Layout

```
.wreckit/
├── config.json              # Repository configuration
├── config.local.json        # Local overrides (gitignored)
├── index.json               # Item registry (regenerable)
├── prompts/                 # Prompt template overrides
│   ├── research.md
│   ├── plan.md
│   └── implement.md
└── items/
    └── <nnn>-<slug>/        # Item directory
        ├── item.json        # Item metadata and state
        ├── research.md      # Research phase output
        ├── plan.md          # Plan phase output
        ├── prd.json         # User stories
        ├── prompt.md        # Last rendered prompt
        └── progress.log     # Implementation log
```

### Path Helpers

| Function                       | Returns                            |
| ------------------------------ | ---------------------------------- |
| `getWreckitDir(root)`          | `.wreckit/`                        |
| `getConfigPath(root)`          | `.wreckit/config.json`             |
| `getIndexPath(root)`           | `.wreckit/index.json`              |
| `getPromptsDir(root)`          | `.wreckit/prompts/`                |
| `getItemsDir(root)`            | `.wreckit/items/`                  |
| `getItemDir(root, id)`         | `.wreckit/items/<id>/`             |
| `getItemJsonPath(root, id)`    | `.wreckit/items/<id>/item.json`    |
| `getPrdPath(root, id)`         | `.wreckit/items/<id>/prd.json`     |
| `getResearchPath(root, id)`    | `.wreckit/items/<id>/research.md`  |
| `getPlanPath(root, id)`        | `.wreckit/items/<id>/plan.md`      |
| `getProgressLogPath(root, id)` | `.wreckit/items/<id>/progress.log` |

---

## Data Contracts

### Item Schema (`item.json`)

| Field                   | Type           | Required | Description                                   |
| ----------------------- | -------------- | -------- | --------------------------------------------- |
| `schema_version`        | number         | Yes      | Always 1                                      |
| `id`                    | string         | Yes      | Unique identifier (e.g., `001-add-dark-mode`) |
| `title`                 | string         | Yes      | Human-readable title                          |
| `section`               | string         | No       | Category (default: items)                     |
| `state`                 | WorkflowState  | Yes      | Current state in workflow                     |
| `overview`              | string         | Yes      | Description of the item                       |
| `branch`                | string \| null | Yes      | Git branch name                               |
| `pr_url`                | string \| null | Yes      | GitHub PR URL                                 |
| `pr_number`             | number \| null | Yes      | GitHub PR number                              |
| `last_error`            | string \| null | Yes      | Last error message                            |
| `created_at`            | string         | Yes      | ISO timestamp                                 |
| `updated_at`            | string         | Yes      | ISO timestamp                                 |
| `problem_statement`     | string         | No       | Core problem being solved                     |
| `motivation`            | string         | No       | Why this matters                              |
| `success_criteria`      | string[]       | No       | How we know it's working                      |
| `technical_constraints` | string[]       | No       | Implementation constraints                    |
| `scope_in_scope`        | string[]       | No       | What's in scope                               |
| `scope_out_of_scope`    | string[]       | No       | What's out of scope                           |
| `priority_hint`         | PriorityHint   | No       | low \| medium \| high \| critical             |
| `urgency_hint`          | string         | No       | Timing notes                                  |

### Workflow States

```
idea → researched → planned → implementing → in_pr → done
```

Linear progression only. See `src/domain/states.ts`.

### PRD Schema (`prd.json`)

| Field            | Type    | Description              |
| ---------------- | ------- | ------------------------ |
| `schema_version` | number  | Always 1                 |
| `id`             | string  | Item ID                  |
| `branch_name`    | string  | Git branch for this item |
| `user_stories`   | Story[] | Array of user stories    |

### Story Schema

| Field                 | Type                | Description               |
| --------------------- | ------------------- | ------------------------- |
| `id`                  | string              | Story ID (e.g., `US-001`) |
| `title`               | string              | Short title               |
| `acceptance_criteria` | string[]            | Testable criteria         |
| `priority`            | number              | 1 = highest               |
| `status`              | `pending` \| `done` | Completion status         |
| `notes`               | string              | Implementation notes      |

### Index Schema (`index.json`)

| Field            | Type        | Description          |
| ---------------- | ----------- | -------------------- |
| `schema_version` | number      | Always 1             |
| `items`          | IndexItem[] | Summary of all items |
| `generated_at`   | string      | ISO timestamp        |

The index is **regenerable** from item directories. It exists for fast listing without scanning all items.

---

## ID Allocation

### Format

```
<nnn>-<slug>
```

- `<nnn>`: Zero-padded 3-digit sequential number (e.g., `001`, `042`)
- `<slug>`: URL-safe slugified title (lowercase, hyphens)

### Allocation Rules

1. Scan existing item directories matching pattern `^\d{3}-`
2. Extract highest number
3. Increment by 1
4. Generate slug from title
5. Combine: `${nextNumber}-${slug}`

### Deduplication

During ideas ingestion, items with matching slugs are skipped. This prevents duplicate creation on re-runs.

---

## Artifact Presence by State

| State          | `item.json` | `research.md` | `plan.md` | `prd.json` | `progress.log` | `pr_url` |
| -------------- | ----------- | ------------- | --------- | ---------- | -------------- | -------- |
| `idea`         | ✓           | —             | —         | —          | —              | —        |
| `researched`   | ✓           | ✓             | —         | —          | —              | —        |
| `planned`      | ✓           | ✓             | ✓         | ✓          | —              | —        |
| `implementing` | ✓           | ✓             | ✓         | ✓          | ✓              | —        |
| `in_pr`        | ✓           | ✓             | ✓         | ✓          | ✓              | ✓        |
| `done`         | ✓           | ✓             | ✓         | ✓          | ✓              | ✓        |

Doctor validates these invariants.

---

## Error Handling

| Error Condition          | Behavior                                                   |
| ------------------------ | ---------------------------------------------------------- |
| `item.json` missing      | Item directory ignored; doctor reports `MISSING_ITEM_JSON` |
| `item.json` invalid JSON | Error; doctor reports `INVALID_ITEM_JSON`                  |
| `item.json` fails schema | Error; doctor reports `INVALID_ITEM_JSON`                  |
| `prd.json` invalid       | Error; doctor reports `INVALID_PRD`                        |
| State/artifact mismatch  | Warning; doctor reports `STATE_FILE_MISMATCH` (fixable)    |
| Index out of sync        | Warning; doctor reports `INDEX_STALE` (fixable)            |

---

## Resumability and Idempotency

- **Re-creating items:** Existing items with matching slugs are skipped
- **Re-running phases:** Artifact presence determines skip behavior
- **Interrupted writes:** May leave corrupted state; doctor can detect
- **Concurrency:** No locking; parallel runs on same item are unsafe

---

## Implementation Status

| Feature                        | Status         | Notes                                       |
| ------------------------------ | -------------- | ------------------------------------------- |
| **Directory layout**           | ✅ Implemented | See `src/fs/paths.ts`                       |
| **Path helpers**               | ✅ Implemented | All functions listed in spec                |
| **Item schema**                | ✅ Implemented | Zod schema in `src/schemas.ts`              |
| **PRD schema**                 | ✅ Implemented | Zod schema in `src/schemas.ts`              |
| **Story schema**               | ✅ Implemented | Zod schema in `src/schemas.ts`              |
| **Index schema**               | ✅ Implemented | Zod schema in `src/schemas.ts`              |
| **ID allocation**              | ✅ Implemented | Sequential numbering with slug              |
| **Deduplication**              | ✅ Implemented | Existing items skipped                      |
| **Schema validation**          | ✅ Implemented | All JSON validated against Zod schemas      |
| **Artifact presence tracking** | ✅ Implemented | Doctor validates state/artifact consistency |
| **JSON read/write**            | ✅ Implemented | See `src/fs/json.ts`                        |

---

## Known Gaps

### Gap 1: Non-Atomic Writes

Writes use direct `fs.writeFile` without temp file + rename pattern.

**Impact:** Interrupted writes can corrupt JSON files.

**Status:** ✅ FIXED - All JSON writes now use `safeWriteJson()` from `src/fs/atomic.ts` which implements temp file + rename pattern.

### Gap 2: No Concurrency Protection

Multiple processes can write to the same item simultaneously.

**Impact:** Race conditions, state corruption.

**Status:** ✅ FIXED - File locking implemented in `src/fs/lock.ts`. Item/PRD/index writes use `{ useLock: true }` option. Locks include PID/timestamp for stale detection (60s timeout).

### Gap 3: Schema Version Migration

No migration path when schema version changes.

**Impact:** Old items may fail validation after upgrades.

**Status:** Open - No migration logic implemented.

---

## See Also

- [010-doctor.md](./010-doctor.md) — Validates these invariants
- [001-ideas-ingestion.md](./001-ideas-ingestion.md) — Creates items
