# Wreckit Slop Fix - Code Review & Cleanup Plan

> Oracle-assisted code review identifying duplicate logic, streamlining opportunities, and simplifications.

## Summary

The core architecture (state machine + workflow + agents) is solid. Issues fall into:
1. **Duplicate logic** (3x `scanItems`, 6x `fileExists`, 2x prompt paths)
2. **Bugs** (`ideasCommand` signature, `applyOverrides` drops agent fields)
3. **Inconsistencies** (logger init, `--mock-agent` not wired to phase commands)
4. **Dead code** (unused imports/exports)
5. **Layer violations** (`doctor.ts` imports from `commands/`)

**Effort:** 1-2 days total; many items are <1 hour.

---

## 🔴 Bugs (Fix First)

### 1. `ideasCommand` Call Signature Mismatch

**Files:** `src/commands/ideas.ts`, `src/onboarding.ts`

**Problem:** `ideasCommand` takes 3 params but onboarding calls it with 4:
```ts
// src/onboarding.ts:115
await ideasCommand({ dryRun: false }, logger, root, ideaText);
// Actually: ideasCommand(options, logger, inputOverride?)
```

At runtime, `root` becomes `inputOverride` and `ideaText` is ignored.

**Fix:**
```ts
await ideasCommand({ dryRun: false, cwd: root }, logger, ideaText);
```

**Effort:** S, **Priority:** High

---

### 2. ✅ `applyOverrides` Drops Agent Fields — FIXED

**File:** `src/config.ts:77-93`

**Problem:** Creates partial `agent` object missing `mode`, `sdk_model`, `sdk_max_tokens`, `sdk_tools`.

**Fix:** Added `...config.agent` spread to preserve all existing agent fields.

**Effort:** S, **Priority:** High — **COMPLETED**

---

## 🟠 Duplicate Logic

### 3. Three `scanItems` Implementations

**Files:**
- `src/domain/indexing.ts` (lines 94-144) ← **Keep this one**
- `src/commands/status.ts` (lines 14-59)
- `src/commands/list.ts` (lines 30-75)
- `src/doctor.ts` imports from `commands/status` (line 19)

**Fix:**
1. Keep `src/domain/indexing.ts::scanItems` as canonical
2. Delete `scanItems` from `status.ts` and `list.ts`
3. Update all imports to use `../domain/indexing`
4. Remove unused `getItemDir` import in `indexing.ts:7`

**Effort:** S-M

---

### 4. Six `fileExists` Implementations

**Files:**
- `src/commands/run.ts:28-35`
- `src/commands/orchestrator.ts:12-18`
- `src/commands/show.ts:22-29`
- `src/workflow/itemWorkflow.ts:54-69`
- `src/doctor.ts:43-50`
- `src/onboarding.ts:48-55` (`dirExists`)

**Fix:** Add to `src/fs/util.ts`:
```ts
export async function pathExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

export async function dirExists(path: string): Promise<boolean> {
  try {
    const stat = await fs.stat(path);
    return stat.isDirectory();
  } catch {
    return false;
  }
}
```

Then replace all local implementations.

**Effort:** S

---

### 5. Duplicate Prompt Path Logic

**Files:**
- `src/fs/paths.ts:45-47, 78-80` ← **Keep this**
- `src/prompts.ts:24-30`

**Fix:** Delete `getPromptsDir`/`getPromptPath` from `prompts.ts`, import from `../fs/paths`.

**Effort:** S

---

### 6. `resolveCwd` Scattered Everywhere

**Files:**
- `src/index.ts:23-28`
- Most commands do `findRepoRoot(options.cwd ?? process.cwd())`

**Fix:** Add to `src/fs/paths.ts`:
```ts
export function resolveCwd(cwdOption?: string): string {
  return cwdOption ? path.resolve(cwdOption) : process.cwd();
}

export function findRootFromOptions(cwdOption?: string): string {
  return findRepoRoot(resolveCwd(cwdOption));
}
```

**Effort:** S

---

## 🟡 Inconsistencies

### 7. Logger Initialization Redundancy

**File:** `src/index.ts`

**Problem:** Logger initialized in:
- Default `program.action` (line 50)
- `next` command (lines 375-379)
- `doctor` command (lines 431-435)
- `init` command (lines 458-462)
- `program.hook("preAction", ...)` (lines 482-537)

**Fix:** Remove manual `initLogger` calls from individual commands; let `preAction` handle it.

**Effort:** S

---

### 8. `--mock-agent` Not Wired to Phase Commands

**Problem:** `wreckit run --mock-agent` works, but `wreckit research <id> --mock-agent` ignores the flag.

**Fix:**
1. Add `mockAgent?: boolean` to `PhaseOptions` in `src/commands/phase.ts:23`
2. Include in `workflowOptions`:
   ```ts
   const workflowOptions: WorkflowOptions = {
     root, config, logger, force, dryRun, mockAgent,
   };
   ```
3. Pass `globalOpts.mockAgent` in all phase command calls in `index.ts`

**Effort:** S-M, **Priority:** Medium

---

### 9. State Transition Logic in 3 Places

**Files:**
- `src/domain/states.ts` - `WORKFLOW_STATES`, `getNextState`
- `src/workflow/itemWorkflow.ts:616-634` - `getNextPhase`
- `src/commands/phase.ts:26-110` - `PHASE_CONFIG`, `isInvalidTransition`

**Fix (incremental):** Add comments noting they must stay consistent. Medium-term: derive `getNextPhase` from `getNextState`:
```ts
export function getNextPhase(item: Item): Phase | null {
  const nextState = getNextState(item.state);
  if (!nextState) return null;
  switch (nextState) {
    case "researched": return "research";
    case "planned": return "plan";
    case "implementing": return "implement";
    case "in_pr": return "pr";
    case "done": return "complete";
  }
}
```

**Effort:** S now, M for full unification

---

## 🔵 Dead Code

### 10. Unused Imports & Functions

| File | Item | Action |
|------|------|--------|
| `src/config.ts:7` | `FileNotFoundError` import | Remove |
| `src/domain/indexing.ts:7` | `getItemDir` import | Remove |
| `src/commands/list.ts:30-75` | Local `scanItems` | Remove (use domain) |

**Effort:** S

---

## 🟣 Layer Violations

### 11. doctor.ts Imports from commands/

**File:** `src/doctor.ts:19`
```ts
import { scanItems } from "./commands/status";
```

**Problem:** Domain-level code importing from CLI layer.

**Fix:**
```ts
import { scanItems } from "./domain/indexing";
```

**Effort:** S

---

## 🟢 Documentation Clarifications

### 12. `findRepoRoot` vs `findGitRoot` Naming

**Files:** `src/fs/paths.ts`, `src/onboarding.ts`

**Fix:** Add doc comments:
```ts
// findRepoRoot: finds directory with BOTH .git AND .wreckit (throws if missing)
// findGitRoot: finds git repo root only, used before .wreckit exists
```

**Effort:** S

---

## Cleanup Order

1. **Bugs first** (#1, #2) - High priority, easy fixes
2. **Consolidate `scanItems`** (#3) - Biggest duplication
3. **Add shared `pathExists`** (#4) - Enables other cleanups
4. **Fix layer violation** (#11) - Depends on #3
5. **Clean up prompts** (#5) - Small win
6. **Logger consistency** (#7) - Reduces confusion
7. **Wire `--mock-agent`** (#8) - User-facing consistency
8. **Remove dead code** (#10) - Final cleanup

Run `bun test` after each step.

---

## Future Considerations

If expanding to library/API usage:
- Create `src/core/wreckit.ts` facade for programmatic access
- Make CLI commands thin wrappers around core API
- Data-drive state machine (derive all helpers from single config)
