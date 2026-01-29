# Phase Commands

Commands for each workflow phase (primarily for debugging).

## Overview

These commands run individual phases of the workflow. Most of the time you'll use `wreckit` or `wreckit run` which handle all phases automatically. Phase commands are useful for:

- Debugging issues
- Re-running failed phases
- Understanding what each phase does
- Testing phase-specific logic

## Commands

### wreckit research

Run the research phase for an item.

```bash
wreckit research <id>
```

**Transition:** `raw` → `researched`

**What it does:**
- Agent analyzes your codebase
- Finds patterns and conventions
- Documents file paths and integration points
- Creates `.wreckit/<section>/<item>/research.md`

**When to use:**
- Regenerating research after codebase changes
- Debugging research phase issues
- Understanding what the agent found

---

### wreckit plan

Run the planning phase for an item.

```bash
wreckit plan <id>
```

**Transition:** `researched` → `planned`

**What it does:**
- Agent designs the implementation approach
- Breaks work into phases
- Creates user stories with acceptance criteria
- Generates `.wreckit/<section>/<item>/plan.md` and `prd.json`

**When to use:**
- Regenerating plan after research changes
- Debugging planning phase issues
- Reviewing implementation plan before coding

---

### wreckit implement

Run the implementation phase for an item.

```bash
wreckit implement <id>
```

**Transition:** `planned` → `implementing`

**What it does:**
- Agent works through user stories from `prd.json`
- Makes code changes
- Runs tests
- Commits frequently
- Updates story statuses
- Creates `.wreckit/<section>/<item>/progress.log`

**When to use:**
- Starting implementation after reviewing plan
- Re-running failed implementation
- Debugging implementation issues

---

### wreckit pr

Create a pull request for an implemented item.

```bash
wreckit pr <id>
```

**Transition:** `implementing` → `in_pr`

**What it does:**
- Creates a pull request with all commits
- Generates PR description from item metadata
- Outputs PR number

**When to use:**
- Creating PR after manual implementation
- Re-creating failed PR
- Manually triggering PR creation

---

### wreckit complete

Mark an item as complete (after merging PR).

```bash
wreckit complete <id>
```

**Transition:** `in_pr` → `done`

**What it does:**
- Updates item state to `done`
- Cleans up working branch (if configured)
- Archives item metadata

**When to use:**
- Marking direct-merge items as complete
- After manually merging a PR
- Finalizing workflow

---

## Example Workflow

```bash
# Debug a specific phase
wreckit research 1        # Research phase only
cat .wreckit/features/001-*/research.md  # Review results

wreckit plan 1            # Plan phase only
cat .wreckit/features/001-*/plan.md      # Review plan

wreckit implement 1       # Implementation phase
# Watch progress, Ctrl-C if needed

wreckit pr 1              # Create PR

wreckit complete 1        # Mark done
```

## Normal Usage

For normal workflow, use these instead:

```bash
wreckit run <id>    # Run all phases for one item
wreckit            # Run all phases for all items
wreckit next       # Run all phases for next item
```

[Back to CLI Reference](/cli/)
