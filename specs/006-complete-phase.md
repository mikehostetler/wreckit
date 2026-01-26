# 006 - Complete Phase

## Overview

The Complete phase is the final step in the wreckit workflow. It verifies that a pull request has been merged and transitions the item to its terminal state.

- **Purpose**: Verify PR merge status and mark item complete
- **State transition**: `in_pr` → `done`
- **Agent work**: None - this is a pure status check

---

## Security Model: Verified Delivery

The complete phase confirms that work was successfully delivered to the codebase. It should verify not just that a PR was merged, but that it was merged correctly.

### Core Principle

Completion means **verified delivery**. The phase should confirm the work landed as expected, not just that GitHub shows "merged."

### Current Validation

| Check                       | Performed | Gap                             |
| --------------------------- | --------- | ------------------------------- |
| PR state is MERGED          | Yes       | Only check performed            |
| Merged to correct branch    | No        | Could be merged to wrong branch |
| Merge commit exists on base | No        | Not verified                    |
| CI/checks passed            | No        | Force-merged PRs accepted       |
| Code matches implementation | No        | PR could have drifted           |
| Branch cleanup              | No        | Feature branches linger         |

### Recommended Validation

| Check                       | Purpose                         |
| --------------------------- | ------------------------------- |
| PR state is MERGED          | Basic requirement               |
| Base branch matches config  | Ensure merged to correct target |
| Head branch matches item    | Ensure correct PR               |
| Merge commit on base branch | Verify merge actually landed    |
| Checks passed               | Ensure CI was green             |
| Record completion metadata  | Audit trail                     |

---

## Triggers

| Method    | Command                                               |
| --------- | ----------------------------------------------------- |
| Automatic | `wreckit` or `wreckit run <id>` when state is `in_pr` |
| Manual    | `wreckit complete <id>`                               |

## Behavior

This phase performs no AI agent work. It is a deterministic status check:

1. Validate that the item has an associated PR number
2. Query GitHub for the PR's merge status
3. If merged, transition to `done`
4. If not merged, fail with an informative message

## PR Merge Verification

The phase checks whether the pull request has been merged via the GitHub CLI. An item cannot complete until its PR is merged - this ensures all work goes through the configured merge process (code review, CI checks, etc.).

## Artifacts Produced

This is the only phase that produces no new artifact files. The item's state is simply updated to `done`.

## State Transitions

| Condition        | Result                              |
| ---------------- | ----------------------------------- |
| PR is merged     | State changes to `done` (terminal)  |
| PR is not merged | State remains `in_pr`, error thrown |

## Error Scenarios

| Condition              | Behavior              | Recovery                  |
| ---------------------- | --------------------- | ------------------------- |
| Missing PR number      | Cannot complete       | Re-run PR phase           |
| PR not yet merged      | Fails with message    | Merge PR in GitHub, retry |
| GitHub CLI unavailable | Treated as not merged | Fix authentication, retry |

### Edge Cases

| Scenario                          | Current Behavior                   | Recommended Behavior                            |
| --------------------------------- | ---------------------------------- | ----------------------------------------------- |
| PR closed without merge           | Returns "not merged"               | Distinct error: "PR was closed without merging" |
| PR merged to wrong branch         | Completes successfully             | Fail: "PR merged to X, expected Y"              |
| PR force-merged (bypassed checks) | Completes successfully             | Warn or fail based on config                    |
| PR head changed after push        | Completes successfully             | Warn: "PR head differs from expected"           |
| `gh` command fails                | Silent failure, returns not merged | Distinct error with auth hint                   |

---

## Direct Merge Mode Considerations

When `merge_mode: "direct"` is used, there is no PR to check. The complete phase is bypassed entirely—the PR phase transitions directly to `done`.

### Validation Gap

Direct merge mode has no post-merge validation:

| Missing Validation     | Risk                              |
| ---------------------- | --------------------------------- |
| Merge commit on remote | Local merge might not have pushed |
| Base branch updated    | Remote might reject push          |
| No PR record           | No audit trail of what was merged |

### Recommended Validation for Direct Mode

Before marking `done` in direct merge mode:

1. Verify merge commit exists on `origin/<base_branch>`
2. Record `merge_commit_sha` in item metadata
3. Delete feature branch (local and remote)
4. Log completion to progress file

---

## Branch Cleanup (Recommended)

After successful completion, clean up feature branches:

### PR Mode

| Action               | Condition                      |
| -------------------- | ------------------------------ |
| Delete remote branch | PR merged, branch matches item |
| Delete local branch  | PR merged, not current branch  |

GitHub can be configured to auto-delete branches on merge, but wreckit should clean up local branches regardless.

### Direct Mode

| Action               | Condition                     |
| -------------------- | ----------------------------- |
| Delete remote branch | After successful push to base |
| Delete local branch  | After successful push to base |

### Safety Checks

Only delete branches if:

- PR is confirmed merged (or direct merge confirmed on remote)
- Branch name matches expected pattern (`branch_prefix` + item ID)
- Branch is not the base branch
- Branch is not the current branch (for local deletion)

## Resumability

- **Idempotent**: Pure status check with no side effects until success
- **Retry-safe**: Can be run indefinitely until the PR is merged
- **External dependency**: Requires human or CI to merge the PR in GitHub

Typical flow:

1. Run complete phase → "PR not merged yet"
2. Merge PR in GitHub (via UI, CLI, or CI automation)
3. Run complete phase again → Success

## Final State

After successful completion, the item reaches the `done` terminal state:

- The `done` state is terminal - no further phases apply
- Completed items are excluded from `wreckit` and `wreckit next` queues
- Items remain stored for historical reference
- Completed items can be viewed via `wreckit list --state done` or `wreckit show <id>`

---

## Audit Trail (Recommended)

Record completion metadata for audit and debugging:

### Recommended Fields

| Field                 | Source                 | Purpose                        |
| --------------------- | ---------------------- | ------------------------------ |
| `completed_at`        | Current timestamp      | When completion occurred       |
| `merged_at`           | PR `mergedAt` field    | When GitHub recorded merge     |
| `merge_commit_sha`    | PR `mergeCommit.oid`   | Exact commit that was merged   |
| `base_branch`         | PR `baseRefName`       | Branch that received the merge |
| `completion_mode`     | Config                 | `"pr"` or `"direct"`           |
| `checks_passed`       | PR `statusCheckRollup` | Whether CI was green           |
| `completion_warnings` | Validation             | Any warnings during completion |

### Progress Log Entry

Append a final entry to `progress.log`:

```
Completed: PR #42 merged to main at 2024-01-15T10:30:00Z
Merge commit: abc123def456
```

This provides a human-readable record alongside the structured metadata.

---

## Implementation Status

| Feature                    | Status         | Notes                                               |
| -------------------------- | -------------- | --------------------------------------------------- |
| **Core complete phase**    | ✅ Implemented | See `src/workflow/itemWorkflow.ts:runPhaseComplete` |
| **PR merge verification**  | ✅ Implemented | Uses `gh pr view`                                   |
| **Base branch validation** | ✅ Implemented | Verifies merged to correct branch                   |
| **Head branch validation** | ✅ Implemented | Warns if head differs from expected                 |
| **Checks status logging**  | ✅ Implemented | Logs CI check status                                |
| **Audit trail**            | ✅ Implemented | Metadata in item + progress.log                     |
| **State transitions**      | ✅ Implemented | `in_pr` → `done`                                    |
| **Error handling**         | ✅ Implemented | Distinct errors for different failures              |
| **Dry-run mode**           | ✅ Implemented | `--dry-run` flag works                              |

---

## Known Gaps

### Gap 1: Minimal Merge Validation ✅ FIXED

~~The complete phase only checks that `state === "MERGED"`.~~

**Status:** Fixed - Now verifies base branch, head branch, merge commit, and CI check status. See `getPrDetails()` in `src/git/index.ts`.

### Gap 2: No Direct Mode Verification ✅ FIXED

~~Direct merge mode bypasses the complete phase entirely. There is no verification that the merge actually landed on the remote.~~

**Status:** Fixed - Direct mode now verifies merge landed on remote:

- Fetches remote base branch after push
- Compares local HEAD SHA with remote HEAD SHA
- Fails with clear error if they don't match
- See `src/workflow/itemWorkflow.ts:961-1005`

### Gap 3: Silent `gh` Failures ✅ FIXED

~~If the `gh` command fails (auth issues, network), the result is treated as "not merged" with a generic error.~~

**Status:** Fixed - Returns distinct errors for command failures vs. not-merged states. See `getPrDetails()` with `querySucceeded` flag.

### Gap 4: No Branch Cleanup ✅ FIXED

Feature branches are not deleted after completion. They accumulate on local and remote.

**Impact:** Branch clutter, potential confusion.

**Status:** ✅ FIXED - Branch cleanup implemented via `cleanupBranch()` in `src/git/index.ts`. Configurable via `branch_cleanup.enabled` and `branch_cleanup.delete_remote` in config. Runs after successful completion in both PR and direct modes.

### Gap 5: No Audit Trail ✅ FIXED

~~Completion metadata (when, what commit, checks status) is not recorded.~~

**Status:** Fixed - Records `completed_at`, `merged_at`, `merge_commit_sha`, `checks_passed` in item. Also appends to `progress.log`.

---

## See Also

- [005-pr-phase.md](./005-pr-phase.md) — Previous phase
- [001-ideas-ingestion.md](./001-ideas-ingestion.md) — Start of workflow
