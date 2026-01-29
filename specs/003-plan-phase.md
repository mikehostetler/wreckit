# 003 - Plan Phase

## Overview

The Plan phase transforms research findings into actionable implementation plans and structured user stories. This is the design phase where the agent analyzes the research, architects a solution, and produces work items ready for implementation.

- **Purpose**: Design solution and create user stories
- **State transition**: `researched` → `planned`
- **Required artifacts**: `plan.md`, `prd.json`

---

## Security Model: Design-Only, No Implementation

The plan phase must be **design-only**. The agent should architect the solution and create user stories but must NOT make any code changes, create files outside the item directory, or modify the repository.

### Core Principle

Planning is about **designing**, not **doing**. The agent produces a blueprint for implementation—it does not write production code.

### Guardrails Required

| Guardrail                  | Purpose                                                                |
| -------------------------- | ---------------------------------------------------------------------- |
| **Write Containment**      | Agent should only write `plan.md` and `prd.json` within item directory |
| **No Code Changes**        | Source files, tests, configs must not be modified                      |
| **No New Files**           | Agent should not create files in the repository (outside `.wreckit/`)  |
| **Git State Preservation** | Working tree unchanged after planning (except allowed artifacts)       |

### Enforcement (Recommended)

To enforce design-only behavior:

1. **Pre-plan snapshot** — Record `git status` before agent runs
2. **Post-plan validation** — Check for any changed files after agent completes
3. **Allowlist check** — Only permit changes to `plan.md` and `prd.json`
4. **Fail if violations** — If any other file was modified, fail the phase

**Current Gap:** The system relies on prompt instructions only. There is no programmatic enforcement preventing code changes during planning. Unintended changes can leak into the PR phase where they get auto-committed.

---

## Triggers

### Automatic Trigger

- Via `wreckit` (runs all phases) when item state is `researched`
- Via `wreckit run <id>` when item state is `researched`

### Manual Trigger

- Via `wreckit plan <id>` - explicitly runs plan phase for a specific item

### State Prerequisites

- Item must be in `researched` state (unless `--force` is used)
- `research.md` must exist in the item directory

## Agent Responsibilities

The agent is expected to:

1. **Validate Research Findings** - Cross-reference requirements with actual code, identify gaps
2. **Design the Solution** - Evaluate implementation approaches, break down into testable phases
3. **Create plan.md** - Detailed implementation plan with phases, file references, and success criteria
4. **Produce prd.json** - Call the `save_prd` MCP tool OR write directly to disk
5. **Print Completion Signal** - Output the configured completion signal when finished

## Template Variables

| Variable                | Description                        |
| ----------------------- | ---------------------------------- |
| `{{id}}`                | Item ID (e.g., `001-feature-name`) |
| `{{title}}`             | Item title                         |
| `{{section}}`           | Item section/category              |
| `{{overview}}`          | Item description                   |
| `{{branch_name}}`       | Git branch name                    |
| `{{base_branch}}`       | Base branch (e.g., `main`)         |
| `{{item_path}}`         | Absolute path to item directory    |
| `{{research}}`          | Contents of `research.md`          |
| `{{completion_signal}}` | Agent completion signal string     |

## Artifacts Produced

### plan.md

**Location**: `.wreckit/items/<id>/plan.md`

A detailed implementation plan containing:

- Implementation plan title and overview
- Current state analysis
- Desired end state specification
- Key discoveries with file:line references
- Out-of-scope items (explicit)
- Implementation approach with phases
- For each phase: overview, changes required, success criteria
- Testing strategy
- Migration notes (if applicable)

### prd.json

**Location**: `.wreckit/items/<id>/prd.json`

A structured PRD containing:

- **schema_version**: Always 1
- **id**: Item ID
- **branch_name**: Git branch name
- **user_stories**: Array of user stories

Each **user story** contains:

- **id**: Story ID (e.g., "US-001")
- **title**: Short descriptive title
- **acceptance_criteria**: Array of specific, testable criteria
- **priority**: 1 = highest priority
- **status**: Either "pending" or "done"
- **notes**: Implementation notes (can be empty)

### Story Prioritization

| Priority | Description                                  |
| -------- | -------------------------------------------- |
| 1        | Core functionality, must be done first       |
| 2        | Important features that depend on Priority 1 |
| 3        | Nice-to-have, can be deferred                |
| 4        | Optional enhancements                        |

---

## Quality Requirements

### What Makes a Good User Story

A well-structured user story is implementable, testable, and right-sized:

| Quality Signal                | Description                                               |
| ----------------------------- | --------------------------------------------------------- |
| **Single outcome**            | One cohesive slice of work, not multiple bundled goals    |
| **Clear acceptance criteria** | Observable, testable conditions (3-7 specific criteria)   |
| **Minimal coupling**          | Can be implemented and verified largely independently     |
| **Right abstraction**         | Describes _what_ and _why_, not pure implementation steps |
| **Logical priority**          | P1 enables P2, dependencies respected                     |
| **Explicit scope**            | States what's out-of-scope if commonly confused           |

### What Makes a Poor User Story

Stories that will cause implementation problems:

| Anti-Pattern                 | Example                                           |
| ---------------------------- | ------------------------------------------------- |
| **Vague goals**              | "Improve performance" without measurable outcomes |
| **Bundled concerns**         | "Refactor X and add feature Y and update UI"      |
| **Untestable criteria**      | "Works well", "No bugs", "User-friendly"          |
| **Too large**                | Cannot be estimated or verified as a single unit  |
| **Implementation checklist** | Steps to code, not user-visible outcomes          |
| **Missing verification**     | No mention of how to test or validate             |

### Plan Quality Signals

A high-quality plan demonstrates thorough analysis:

| Quality Signal                | Description                            |
| ----------------------------- | -------------------------------------- |
| **File references**           | Specific `path/to/file:line` citations |
| **Current vs. desired state** | Clear gap analysis                     |
| **Explicit exclusions**       | "What We're NOT Doing" section         |
| **Phased approach**           | Logical ordering with dependencies     |
| **Testable phases**           | Each phase independently verifiable    |
| **Risk awareness**            | Identifies challenges with mitigations |

### Validation (Recommended)

To ensure plan quality, validate:

1. **Required sections present** — All template headings exist in plan.md
2. **Story count reasonable** — At least 1 story, not more than ~15
3. **Acceptance criteria density** — Each story has 2+ criteria
4. **Story ID format** — Follows `US-###` convention
5. **Priority range** — Values within expected range (1-4)

**Current Gap:** The system only validates that artifacts exist and PRD parses correctly. No content quality validation exists.

---

## State Transitions

### Validation Rules

To transition from `researched` to `planned`, the following must be true:

- `plan.md` exists in the item directory
- `prd.json` exists and passes schema validation

### Successful Transition

When all validations pass:

- Item state is updated to `planned`
- Any previous `last_error` is cleared

## Skip Behavior

The phase is skipped (no agent run) when ALL of:

1. `--force` flag is NOT set
2. `plan.md` already exists
3. `prd.json` already exists

When skipped, if the item is still in `researched` state and the PRD is valid, the state is transitioned to `planned`.

## Error Scenarios

| Error Condition                    | Behavior                          |
| ---------------------------------- | --------------------------------- |
| Agent fails or times out           | `last_error` set, state unchanged |
| `plan.md` not created              | Error logged, state unchanged     |
| `prd.json` not created             | Error logged, state unchanged     |
| `prd.json` fails schema validation | Error logged, state unchanged     |

---

## Security Error Cases

### Unintended Code Modifications

If the agent modifies repository files during planning:

| Scenario                       | Current Behavior                  | Recommended Behavior   |
| ------------------------------ | --------------------------------- | ---------------------- |
| Agent edits source file        | Phase succeeds if artifacts exist | Should fail and revert |
| Agent creates new file in repo | Phase succeeds                    | Should fail            |
| Agent modifies config files    | Phase succeeds                    | Should fail            |

**Risk:** Unintended changes leak into the PR phase. The PR phase auto-commits uncommitted changes, meaning planning-time code edits get included in the implementation PR without explicit review.

### Write Containment Violations

The agent should only write to:

- `.wreckit/items/<id>/plan.md`
- `.wreckit/items/<id>/prd.json`

Any other writes should be treated as violations:

| Violation                       | Impact                      |
| ------------------------------- | --------------------------- |
| Write to source files           | Code changes without review |
| Write to research.md            | Overwrites prior phase work |
| Write to other item directories | Cross-item contamination    |
| Write outside repository        | System file access          |

### PRD Schema Validation

The PRD is validated against a schema. Common validation failures:

| Validation Error        | Cause                                                                       |
| ----------------------- | --------------------------------------------------------------------------- |
| Invalid JSON            | Malformed JSON syntax                                                       |
| Missing required field  | `user_stories`, `id`, or `branch_name` absent                               |
| Invalid story structure | Story missing `id`, `title`, `acceptance_criteria`, `priority`, or `status` |
| Wrong status value      | Status not "pending" or "done"                                              |
| Wrong schema version    | schema_version not matching expected value                                  |

**Note:** MCP tool submissions enforce `schema_version: 1` strictly. Direct file writes are more lenient (any number). Consider tightening file validation to match.

---

## Resumability

### Re-run Commands

To resume a failed plan phase:

- `wreckit plan <id>` - Re-run just the plan phase
- `wreckit run <id>` - Re-run the item through all phases

### Artifact Detection on Re-run

1. If both `plan.md` AND `prd.json` exist: skip agent, transition state if valid
2. If either is missing: run agent to create missing artifacts

### Force Regeneration

Use `wreckit plan <id> --force` to:

- Ignore existing artifacts
- Run agent unconditionally
- Overwrite `plan.md` and/or `prd.json`

### Doctor Repair

`wreckit doctor --fix` can detect and report state mismatches:

- State is `planned` but `plan.md` missing
- State is `planned` but `prd.json` missing
- `prd.json` exists but fails schema validation

---

## Implementation Status

| Feature                                       | Status         | Notes                                               |
| --------------------------------------------- | -------------- | --------------------------------------------------- |
| **Core plan phase**                           | ✅ Implemented | See `src/workflow/itemWorkflow.ts:runPhasePlan`     |
| **Prompt template loading**                   | ✅ Implemented | Project overrides in `.wreckit/prompts/plan.md`     |
| **Template variable substitution**            | ✅ Implemented | All variables including `{{research}}`              |
| **Artifact validation (exists)**              | ✅ Implemented | Checks `plan.md` and `prd.json` exist               |
| **PRD schema validation**                     | ✅ Implemented | Zod schema in `src/schemas.ts`                      |
| **Skip if artifacts exist**                   | ✅ Implemented | `--force` flag to regenerate                        |
| **Tool allowlist (read + write)**             | ✅ Implemented | See `src/agent/toolAllowlist.ts`                    |
| **Git status comparison (write containment)** | ✅ Implemented | Before/after status comparison blocks violations    |
| **Plan quality validation**                   | ✅ Implemented | See `src/domain/validation.ts:validatePlanQuality`  |
| **Story quality validation**                  | ✅ Implemented | See `src/domain/validation.ts:validateStoryQuality` |
| **MCP tool: save_prd**                        | ✅ Implemented | See `src/agent/mcp/wreckitMcpServer.ts`             |
| **State transitions**                         | ✅ Implemented | `researched` → `planned` on success                 |
| **Error handling**                            | ✅ Implemented | `last_error` set on failure                         |
| **Dry-run mode**                              | ✅ Implemented | `--dry-run` flag works                              |

---

## Known Gaps

### Gap 1: No Programmatic Design-Only Enforcement ✅ FIXED

~~The plan phase relies entirely on prompt instructions to prevent code changes.~~

**Status:** Fixed - Git status comparison before/after planning detects and blocks violations. See `getGitStatus()` and `compareGitStatus()` in `src/git/index.ts`.

### Gap 2: No Plan Content Quality Validation ✅ FIXED

~~The system only checks that `plan.md` exists, not that it contains required sections.~~

**Status:** Fixed - Plan quality validation implemented in `src/domain/validation.ts:validatePlanQuality()`. Checks required sections, file references, and structure.

### Gap 3: No Story Quality Validation ✅ FIXED

~~The system validates PRD schema but not story quality.~~

**Status:** Fixed - Story quality validation implemented in `src/domain/validation.ts:validateStoryQuality()`. Validates minimum acceptance criteria, story ID format, and priority ranges.

### Gap 4: Schema Version Inconsistency ✅ FIXED

~~MCP tool submissions enforce `schema_version: 1` strictly, but direct file writes accept any number.~~

**Status:** Fixed - Both MCP and direct file validation require `schema_version: 1`.

---

## See Also

- [002-research-phase.md](./002-research-phase.md) — Previous phase
- [004-implement-phase.md](./004-implement-phase.md) — Next phase in workflow
