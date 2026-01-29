# 004 - Implement Phase

## Overview

The Implement phase executes user stories from the PRD iteratively until all stories are complete. This is the core execution phase where the agent performs actual code changes, runs tests, and commits work.

**Purpose:** Execute user stories iteratively until all complete  
**State transition:** `planned` → `implementing` (remains in `implementing` until all stories done)  
**Phase type:** Iterative (loops until completion or max iterations)

---

## Security Model: Scoped Implementation

The implement phase is the **only phase where code changes are expected**. However, changes should be scoped to the current story being implemented—not arbitrary modifications across the codebase.

### Core Principle

Implementation is about **executing the plan**, not **improvising**. The agent should implement exactly what was designed, following the PRD stories and acceptance criteria.

### Guardrails Required

| Guardrail                     | Purpose                                                |
| ----------------------------- | ------------------------------------------------------ |
| **Story-Scoped Changes**      | Changes should relate to the story being implemented   |
| **No Unplanned Refactors**    | Agent should not refactor unrelated code               |
| **Acceptance Criteria Focus** | Work should satisfy stated criteria, nothing more      |
| **Test Evidence**             | Implementation should be accompanied by passing tests  |
| **Atomic Commits**            | Each story should produce coherent, reviewable commits |

### What the Agent Should NOT Do

During implementation, the agent should avoid:

- Refactoring code unrelated to the current story
- Adding features not in the PRD
- "Improving" code outside the story scope
- Making architectural changes beyond the plan
- Introducing dependencies not discussed in research/planning

**Current Gap:** There is no technical enforcement of story scope. The system trusts the agent to follow instructions. Unscoped changes are only caught during human review (if any).

---

## Triggers

### Automatic Execution

- Via `wreckit` command when item state is `planned`
- Via `wreckit run <id>` when item state is `planned`

### Manual Execution

- Via `wreckit implement <id>` — allows resuming from `implementing` state

### Allowable Entry States

The phase accepts items in either `planned` or `implementing` state. This dual-state allowance enables resumability—an interrupted implementation can be continued without manual state manipulation.

## Iteration Loop

The implement phase runs an iterative loop, processing one story per iteration.

At the start of the phase, the system loads and validates the PRD. If the item is in `planned` state, it transitions to `implementing` before any agent work begins.

Each iteration follows this sequence:

1. Select the highest-priority pending story from the PRD
2. If no pending stories remain, exit successfully
3. Render the implement prompt with full context (research, plan, PRD, progress)
4. Run the agent in the item directory
5. Capture story status updates as the agent completes work
6. Write the updated PRD to disk
7. Append an entry to the progress log

The loop continues until all stories are marked done, or the maximum iteration limit is reached. If the limit is reached with stories still pending, the phase fails.

## Story Selection

Stories are selected by priority order as defined in the PRD. The system filters for stories with `pending` status and selects the first one in the list. This means the PRD author controls execution order through story placement.

### Story Status Values

| Status    | Description            |
| --------- | ---------------------- |
| `pending` | Not yet started        |
| `done`    | Successfully completed |

## Agent Behavior

Each iteration, the agent receives a prompt containing the full context needed to implement the next story:

- Research findings from the research phase
- Implementation plan from the plan phase
- Current PRD with all story statuses
- Progress log showing work completed so far

### Agent Responsibilities

1. **Read context** — Understand research, plan, and current PRD state
2. **Implement story** — Write code according to acceptance criteria
3. **Test** — Run existing tests, add new tests as needed
4. **Commit** — Create atomic git commits for the work
5. **Signal completion** — Mark the story as done when finished

The agent works from the item directory, giving it access to all item artifacts while making changes to the repository code.

## Artifacts Produced

### progress.log

Appended after each iteration with a summary of work completed. Example:

```
Completed iteration 1 for story US-001
Completed iteration 2 for story US-002
Completed iteration 3 for story US-003
```

### prd.json

Story statuses are updated in place as the agent completes each story. The `status` field changes from `pending` to `done`.

## State Transitions

The phase performs an immediate state transition from `planned` to `implementing` before any agent work begins. This ensures interrupted runs can be resumed.

When the phase completes successfully (all stories done), the state remains `implementing`. The subsequent PR phase will transition to `in_pr`.

---

## Quality Requirements

### Story Completion Verification

A story marked "done" should have evidence of completion:

| Evidence Type               | Description                                 |
| --------------------------- | ------------------------------------------- |
| **Code changes**            | Git diff shows relevant modifications       |
| **Tests pass**              | Related tests run successfully              |
| **Acceptance criteria met** | Each criterion has observable verification  |
| **Commits created**         | Work is committed with descriptive messages |

**Current Gap:** Story completion is status-based only. The system accepts `done` status without verifying that acceptance criteria are actually met. No automated test execution is required.

### What Good Implementation Looks Like

| Quality Signal            | Description                                        |
| ------------------------- | -------------------------------------------------- |
| **Tests added/updated**   | Behavior changes have corresponding test coverage  |
| **Lint/typecheck passes** | Code meets project standards                       |
| **Minimal diff**          | Changes aligned to story scope, no unrelated churn |
| **Atomic commits**        | Each commit is coherent and reviewable             |
| **No TODOs introduced**   | Work is complete, not deferred                     |
| **Security basics**       | No secrets committed, no unsafe patterns           |

### What Poor Implementation Looks Like

| Anti-Pattern                               | Risk                             |
| ------------------------------------------ | -------------------------------- |
| **Story marked done without code changes** | False completion                 |
| **Large unrelated refactors**              | Scope creep, review burden       |
| **No tests for behavior changes**          | Regression risk                  |
| **Multiple stories in one iteration**      | Tangled commits, harder rollback |
| **Direct merge without CI**                | Ships broken code                |

### Verification (Recommended)

Before accepting a story as done:

1. **Non-empty diff** — At least one file changed
2. **Test execution** — Relevant tests ran (pass/fail logged)
3. **Commit created** — Changes are committed, not just staged

**Current Gap:** No verification is performed. The agent's assertion that a story is "done" is trusted without evidence.

---

## Error Scenarios

| Error                                    | Cause                                    | Handling                                     |
| ---------------------------------------- | ---------------------------------------- | -------------------------------------------- |
| PRD not found or invalid                 | Missing or malformed PRD at start        | Fail immediately, do not transition state    |
| PRD became invalid during implementation | File corrupted mid-run                   | Fail immediately, preserve current state     |
| Max iterations reached                   | Too many iterations with stories pending | Fail, state remains `implementing` for retry |
| Agent timeout                            | Agent exceeded configured timeout        | Fail immediately, partial work preserved     |
| Agent error                              | Agent subprocess failed                  | Fail immediately, partial work preserved     |

### Iteration Limits

The `max_iterations` config option (default: 100) caps how many iterations can run. If this limit is reached with stories still pending, the phase fails. This prevents runaway loops when the agent cannot complete a story.

## Resumability

The implement phase is fully resumable. An interrupted run can be continued via:

- `wreckit implement <id>` — Manual resume
- `wreckit run <id>` — Checks state, resumes if implementing
- `wreckit` — Batch run picks up implementing items

### Resume Behavior

The PRD serves as the source of truth. On resume, the system reads the current PRD state and only processes stories still marked `pending`. Completed stories are skipped. Any uncommitted changes from a previous run remain in the working tree.

## Template Variables

| Variable                | Description                                 |
| ----------------------- | ------------------------------------------- |
| `{{title}}`             | Item title for context                      |
| `{{research}}`          | Research phase output                       |
| `{{plan}}`              | Plan phase output                           |
| `{{prd}}`               | Current PRD with story statuses             |
| `{{progress}}`          | Implementation progress so far              |
| `{{completion_signal}}` | Instructions for signaling story completion |

## Configuration

| Option            | Effect                                               |
| ----------------- | ---------------------------------------------------- |
| `max_iterations`  | Maximum story implementation attempts before failure |
| `timeout_seconds` | Per-iteration agent timeout                          |

---

## Security Error Cases

### False Story Completion

If the agent marks a story "done" without actually completing it:

| Scenario                            | Current Behavior     | Impact                     |
| ----------------------------------- | -------------------- | -------------------------- |
| Story marked done, no code changes  | Accepted as complete | Empty implementation ships |
| Story marked done, tests fail       | Accepted as complete | Broken code ships          |
| Story marked done, criteria not met | Accepted as complete | Incomplete feature ships   |

**Risk:** In direct merge mode, false completions merge immediately without review. In PR mode, they create PRs that may pass cursory review.

### Scope Creep

If the agent makes changes beyond the story scope:

| Scenario                 | Current Behavior       | Impact                          |
| ------------------------ | ---------------------- | ------------------------------- |
| Refactors unrelated code | Changes included in PR | Review burden, regression risk  |
| Adds unplanned features  | Changes included in PR | Scope creep, maintenance burden |
| Changes architecture     | Changes included in PR | Unexpected system changes       |

**Risk:** All changes made during implementation are included in the PR. There is no filtering or scope validation.

### Git Access

The agent has full git access during implementation:

| Capability            | Risk                                        |
| --------------------- | ------------------------------------------- |
| Create commits        | Can make arbitrary commits with any message |
| Create branches       | Could switch to wrong branch                |
| Modify history        | Could rebase, amend, or force-push          |
| Access other branches | Could pull in unrelated changes             |

**Mitigation:** The PR phase verifies the current branch matches the expected branch before proceeding.

### Iteration Runaway

If the agent cannot complete a story, iterations continue until the limit:

| Scenario                                 | Handling                                   |
| ---------------------------------------- | ------------------------------------------ |
| Agent fails repeatedly                   | Up to max_iterations attempts              |
| Agent marks done incorrectly then undoes | Loop continues                             |
| Agent stuck in infinite loop             | Timeout per iteration + max iterations cap |

**Mitigation:** `max_iterations` (default: 100) prevents truly infinite loops, but a stuck agent can consume significant time/cost.

---

## Implementation Status

| Feature                           | Status         | Notes                                                |
| --------------------------------- | -------------- | ---------------------------------------------------- |
| **Core implement phase**          | ✅ Implemented | See `src/workflow/itemWorkflow.ts:runPhaseImplement` |
| **Iteration loop**                | ✅ Implemented | Processes one story per iteration                    |
| **Story selection by priority**   | ✅ Implemented | Filters `pending` stories, selects first             |
| **MCP tool: update_story_status** | ✅ Implemented | See `src/agent/mcp/wreckitMcpServer.ts`              |
| **Progress log**                  | ✅ Implemented | Appends to `progress.log` after each iteration       |
| **PRD status updates**            | ✅ Implemented | Updates `prd.json` as stories complete               |
| **Tool allowlist (full access)**  | ✅ Implemented | See `src/agent/toolAllowlist.ts`                     |
| **Max iterations limit**          | ✅ Implemented | Configurable via `max_iterations`                    |
| **Resumability**                  | ✅ Implemented | Reads PRD state, skips completed stories             |
| **State transitions**             | ✅ Implemented | `planned` → `implementing`                           |
| **Error handling**                | ✅ Implemented | `last_error` set on failure                          |
| **Dry-run mode**                  | ✅ Implemented | `--dry-run` flag works                               |

---

## Known Gaps

### Gap 1: No Acceptance Criteria Verification ✅ MITIGATED

~~The system trusts the agent's assertion that a story is "done" without verifying acceptance criteria are met.~~

**Status:** Mitigated - When a story is marked as done via MCP tool, the system now verifies:

- Story exists in the PRD
- Story has acceptance criteria defined
- Acceptance criteria are not empty

Verification warnings are logged but do not block story completion (to avoid breaking existing flows). See `verifyStoryCompletion()` in `src/domain/validation.ts` and the MCP handler in `src/agent/mcp/wreckitMcpServer.ts`.

### Gap 2: No Story Scope Enforcement

The agent can modify any files during implementation. There is no check that changes relate to the current story.

**Impact:** Scope creep, unrelated refactors, tangled commits.

**Status:** Open - No diff-size/path heuristics implemented.

### Gap 3: No Automated Testing Requirement ✅ MITIGATED

~~The prompt instructs the agent to run tests, but there is no verification that tests were run or passed.~~

**Status:** Mitigated - Pre-push quality gates can be configured (see `pr_checks` in config). Tests run before PR push.

### Gap 4: Direct Merge Risk

In `merge_mode: "direct"`, completed stories merge immediately without PR review or CI.

**Impact:** Broken or incomplete code ships to production branch.

**Status:** Open - Direct merge still bypasses CI. Users should only use for greenfield projects.

---

## See Also

- [003-plan-phase.md](./003-plan-phase.md) — Previous phase
- [005-pr-phase.md](./005-pr-phase.md) — Next phase in workflow
