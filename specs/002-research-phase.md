# 002 - Research Phase

## Overview

**Purpose:** Analyze the target codebase and document findings to inform the planning phase.

**State Transition:** `idea` → `researched`

The research phase is the first substantive phase of the wreckit workflow. It takes a raw idea and produces a comprehensive analysis of the codebase, identifying relevant files, patterns, conventions, and integration points needed to implement the idea.

---

## Security Model: Read-Only Analysis

The research phase must be **read-only**. The agent should analyze the codebase thoroughly but must NOT make any code changes, create files outside the item directory, or modify the repository in any way.

### Core Principle

Research is about **understanding**, not **doing**. The agent gathers information to inform planning—it does not implement anything.

### Guardrails Required

| Guardrail | Purpose |
|-----------|---------|
| **Write Containment** | Agent should only write to `research.md` within the item directory |
| **No Code Changes** | Source files, tests, configs must not be modified |
| **No New Files** | Agent should not create files in the repository (outside `.wreckit/`) |
| **Git State Preservation** | Working tree should be unchanged after research (except research.md) |

### Enforcement (Recommended)

To enforce read-only behavior:

1. **Pre-research snapshot** — Record `git status` before agent runs
2. **Post-research validation** — Check for any changed files after agent completes
3. **Fail if violations** — If any file other than `research.md` was modified, fail the phase
4. **Optionally revert** — Undo unintended changes before failing

**Current Gap:** The system currently relies on prompt instructions only. There is no programmatic enforcement preventing code changes during research.

---

## Triggers

### Automatic Execution

The research phase runs automatically when executing:
- `wreckit` — Runs all incomplete items through their next phase
- `wreckit run <id>` — Runs single item through all phases
- `wreckit next` — Runs next incomplete item

Automatic execution requires the item to be in `idea` state.

### Manual Execution

Run `wreckit research <id>` to manually trigger the phase.

The `<id>` can be specified as:
- Full ID: `001-add-feature`
- Numeric prefix: `1` or `001`
- Slug suffix: `add-feature`

## Agent Behavior

### Prompt Loading

1. The system first checks for a project-specific prompt override at `.wreckit/prompts/research.md`
2. If not found, uses the bundled default prompt
3. Template variables are replaced with actual values
4. Conditionals (`{{#if var}}...{{/if}}`) are evaluated

### Template Variables

| Variable | Description |
|----------|-------------|
| `{{id}}` | Item ID (e.g., `001-add-feature`) |
| `{{title}}` | Human-readable title |
| `{{section}}` | Section/category (default: `"items"`) |
| `{{overview}}` | Item description/overview |
| `{{item_path}}` | Absolute path to item directory |
| `{{branch_name}}` | Git branch name for this item |
| `{{base_branch}}` | Base branch (e.g., `main`) |
| `{{completion_signal}}` | Signal agent prints on completion |
| `{{sdk_mode}}` | Whether running in SDK mode |

### Working Directory

The agent runs with working directory set to the item directory (`.wreckit/items/<id>/`), allowing it to write `research.md` directly.

### Expected Agent Behavior

The research prompt instructs the agent to:

1. **Initial Analysis** — Break down the task into research areas, identify relevant directories and files, read files completely (not skim)

2. **Deep Investigation** — Find all related files, understand current implementation, identify patterns and conventions, look for similar features to model

3. **Synthesis** — Document findings with file:line references, note patterns and architectural decisions, identify risks and challenges

4. **Output** — Create `research.md` in the item directory and signal completion

## Artifacts Produced

### Required Artifact

**File:** `.wreckit/items/<id>/research.md`

**Required Structure:**

| Section | Purpose | Quality Indicator |
|---------|---------|-------------------|
| **Header** | Title, date, item ID | Present and accurate |
| **Research Question** | Original overview/description | Captures the intent |
| **Summary** | High-level findings (2-3 paragraphs) | Actionable, not generic |
| **Current State Analysis** | Existing implementation | Contains `file:line` references |
| **Key Files** | Critical files identified | Specific paths with line numbers |
| **Technical Considerations** | Dependencies, patterns | References actual codebase patterns |
| **Risks and Mitigations** | Risk table | Concrete risks with realistic mitigations |
| **Recommended Approach** | Implementation strategy | Maps to discovered architecture |
| **Open Questions** | Unknowns and assumptions | Clearly separates what's known vs. unknown |

---

## Quality Requirements

### What Good Research Looks Like

High-quality research demonstrates deep codebase understanding:

| Quality Signal | Description |
|----------------|-------------|
| **Concrete citations** | Many `path/to/file.ext:123` references, not just file names |
| **Traceability** | Explains how code paths connect (call chains, data flow) |
| **Coverage** | Identifies key modules, integration points, and existing tests |
| **Pattern recognition** | Notes existing conventions to follow |
| **Realistic risks** | Identifies actual challenges, not generic concerns |
| **Actionable approach** | Recommendations map to discovered architecture |

### What Poor Research Looks Like

Low-quality research that should be rejected or flagged:

| Anti-Pattern | Example |
|--------------|---------|
| **Generic statements** | "The system uses a service layer" with no citations |
| **Missing references** | No file paths or line numbers |
| **Surface-level analysis** | Only reads prompt context, doesn't inspect repo |
| **Template recommendations** | Generic advice that ignores existing patterns |
| **Missing sections** | Key template sections absent or empty |
| **No open questions** | Falsely implies complete understanding |

### Validation (Recommended)

To ensure research quality, validate:

1. **Required sections present** — All template headings exist
2. **Citation density** — At least 5-10 `file:line` references
3. **Minimum length** — Summary and analysis sections have substantive content
4. **No premature implementation** — Document describes what to do, not code to write

**Current Gap:** The system only validates that `research.md` exists, not its quality or structure.

## State Transitions

### Success Criteria

All conditions must be met:
1. Agent completes without error
2. `research.md` exists in the item directory
3. Validation passes (confirms artifact exists)

### On Success

- Item state changes from `idea` to `researched`
- `last_error` is cleared
- `updated_at` timestamp is updated

### Skip Behavior

If `research.md` already exists and `--force` is not specified:
- The agent is not run
- State is advanced to `researched` immediately
- This enables resumability without re-running expensive research

## Error Scenarios

### Agent Failure

If the agent exits with an error or fails to produce output:
- `last_error` is set to the error message
- State remains at `idea`
- Item can be retried

### Agent Timeout

If the agent exceeds the configured timeout:
- Error: "Agent timed out"
- State remains at `idea`
- Partial research.md may exist but phase fails

### Missing Artifact

If agent completes but `research.md` is not created:
- Error: "Agent did not create research.md"
- State remains at `idea`

### Wrong State

If item is not in `idea` state and `--force` is not specified:
- Error: "Item is in state X, expected 'idea' for research phase"
- No changes made

### Error Recovery

All errors:
1. Set `last_error` on the item
2. Write updated item to disk
3. State is NOT advanced

---

## Security Error Cases

### Unintended Code Modifications

If the agent modifies repository files during research:

| Scenario | Current Behavior | Recommended Behavior |
|----------|------------------|----------------------|
| Agent edits source file | Phase succeeds if research.md exists | Should fail and revert |
| Agent creates new file in repo | Phase succeeds | Should fail |
| Agent modifies config files | Phase succeeds | Should fail |

**Risk:** Unintended changes can leak into later commits. The PR phase auto-commits uncommitted changes, meaning research-time code edits could be included in the implementation PR.

### Write Containment Violations

The agent should only write to `.wreckit/items/<id>/research.md`. Any other writes should be treated as violations:

| Violation | Impact |
|-----------|--------|
| Write to source files | Code changes without review |
| Write to other item directories | Cross-item contamination |
| Write to `.wreckit/config.json` | Configuration tampering |
| Write outside repository | System file access |

### Detection (Recommended)

1. Before research: `git status --porcelain` to capture baseline
2. After research: Compare to detect new/modified files
3. Allow only: `.wreckit/items/<id>/research.md`
4. On violation: Fail phase, report violating files, optionally revert

**Current Gap:** No detection or enforcement exists. The system trusts the agent to follow prompt instructions.

## Resumability

### Re-running After Error

Simply re-run any trigger command:
- `wreckit research <id>` — Try again
- `wreckit run <id>` — Starts at research if state is idea
- `wreckit` — Picks up incomplete items

The phase will check if `research.md` exists (skip if so, unless `--force`), run agent if needed, and advance state on success.

### Doctor Recovery

Run `wreckit doctor --fix` to repair inconsistent state:
- Resets state to `idea` if `research.md` is missing but state is `researched`
- Clears `last_error` if artifacts are valid

### Manual State Reset

Edit `.wreckit/items/<id>/item.json` directly to set `state: "idea"` and `last_error: null`, or delete `research.md` and run with `--force`.

## Dry Run Mode

Run `wreckit research <id> --dry-run` to:
- Log what would happen
- NOT run the agent
- NOT modify any files
- Return success without side effects

## Prompt Customization

Create `.wreckit/prompts/research.md` to customize the research prompt. This file will be used instead of the bundled default, allowing project-specific research instructions.

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error (agent failure, missing artifact, validation) |
| 130 | Interrupted (SIGINT/SIGTERM) |

---

## Implementation Status

| Feature | Status | Notes |
|---------|--------|-------|
| **Core research phase** | ✅ Implemented | See `src/workflow/itemWorkflow.ts:runPhaseResearch` |
| **Prompt template loading** | ✅ Implemented | Project overrides in `.wreckit/prompts/research.md` |
| **Template variable substitution** | ✅ Implemented | All variables in spec are supported |
| **Artifact validation (exists)** | ✅ Implemented | Checks `research.md` exists |
| **Skip if artifact exists** | ✅ Implemented | `--force` flag to regenerate |
| **Tool allowlist (read-only)** | ✅ Implemented | See `src/agent/toolAllowlist.ts` - only Read, Glob, Grep |
| **Git status comparison (write containment)** | ✅ Implemented | Before/after status comparison blocks violations |
| **Research quality validation** | ✅ Implemented | See `src/domain/validation.ts:validateResearchQuality` |
| **State transitions** | ✅ Implemented | `idea` → `researched` on success |
| **Error handling** | ✅ Implemented | `last_error` set on failure |
| **Dry-run mode** | ✅ Implemented | `--dry-run` flag works |

---

## Known Gaps

### Gap 1: No Programmatic Read-Only Enforcement ✅ FIXED

~~The research phase relies entirely on prompt instructions to prevent code changes.~~

**Status:** Fixed - Git status comparison before/after research detects and blocks violations. See `getGitStatus()` and `compareGitStatus()` in `src/git/index.ts`.

### Gap 2: No Research Quality Validation ✅ FIXED

~~The system only checks that `research.md` exists, not that it contains useful content.~~

**Status:** Fixed - Research quality validation implemented in `src/domain/validation.ts:validateResearchQuality()`. Checks required sections, citation density, and minimum length.

### Gap 3: Silent Read Errors ✅ FIXED

~~If reading existing artifacts fails (permissions, corruption), errors are swallowed and the artifact is treated as missing.~~

**Impact:** State inconsistencies may go undetected.

**Status:** Fixed - Error-aware utilities `tryReadFile()` and `checkPathAccess()` in `src/fs/util.ts:42-101` distinguish ENOENT from permission/I/O errors. `buildValidationContext()` in `src/workflow/itemWorkflow.ts` throws on access errors. `readFileIfExists()` and `loadPrdSafe()` properly propagate unexpected errors. Scanning functions in `src/domain/indexing.ts` and `src/doctor.ts` warn on read errors. `ArtifactReadError` class in `src/errors.ts:91-102` provides typed error for permission/I/O failures.

---

## See Also

- [001-ideas-ingestion.md](./001-ideas-ingestion.md) — Previous phase
- [003-plan-phase.md](./003-plan-phase.md) — Next phase in workflow
