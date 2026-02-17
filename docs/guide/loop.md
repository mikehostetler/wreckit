# The Loop

Understanding the Research → Plan → Implement → Critique workflow.

## Item States

Each item progresses through these states:

```
idea → researched → planned → implementing → critique → in_pr → done
```

| State | What Happened |
|-------|---------------|
| `idea` | Ingested, waiting for attention |
| `researched` | Agent analyzed codebase, wrote `research.md` |
| `planned` | Agent created `plan.md` + `prd.json` with user stories |
| `implementing` | Agent coding through stories, committing as it goes |
| `critique` | Agent reviews its own work, runs tests, checks quality |
| `in_pr` | PR opened, awaiting your review (PR mode only) |
| `done` | Merged. Ralph did it. |

## The Workflow

### 1. Research

Agent reads your codebase thoroughly. Finds patterns. Documents file paths, conventions, integration points. Outputs `research.md`.

**What happens:**
- Agent scans your entire codebase
- Identifies patterns and conventions
- Documents integration points
- Creates `.wreckit/<section>/<item>/research.md`

### 2. Plan

Agent designs the solution. Breaks it into phases with success criteria. Creates user stories with acceptance criteria. Outputs `plan.md` + `prd.json`.

**What happens:**
- Agent designs the implementation approach
- Breaks work into phases
- Creates user stories with acceptance criteria
- Generates `.wreckit/<section>/<item>/plan.md` and `prd.json`

### 3. Implement

Agent picks the highest priority story, implements it, runs tests, commits, marks it done. Repeats until all stories complete.

**What happens:**
- Agent works through stories in priority order
- Makes changes to codebase
- Runs tests
- Commits frequently
- Updates `prd.json` story status

### 4. Critique

Agent reviews its own implementation with an adversarial eye. Runs the full test suite, checks type safety, and verifies end-to-end behavior. If the work doesn't meet quality standards, it gets sent back for re-implementation.

**What happens:**
- Agent reviews all changes made during implementation
- Runs test suite and type checker
- Verifies acceptance criteria from `prd.json`
- Rejects substandard work and re-implements if needed
- Creates critique feedback in item artifacts

### 5. PR

Agent opens a pull request. You review. You merge. You ship.

**What happens:**
- Agent creates a pull request with all changes
- PR includes description of work done
- You review and merge
- Item state moves to `done`

**Note:** In direct merge mode, the PR step is skipped and code merges directly to the base branch.

Previous: [Configuration](/guide/configuration) | Next: [Folder Structure](/guide/folder-structure)
