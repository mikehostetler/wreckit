# The Loop

Understanding the Research → Plan → Implement workflow.

## Item States

Each item progresses through these states:

```
raw → researched → planned → implementing → in_pr → done
```

| State | What Happened |
|-------|---------------|
| `raw` | Ingested, waiting for attention |
| `researched` | Agent analyzed codebase, wrote `research.md` |
| `planned` | Agent created `plan.md` + `prd.json` with user stories |
| `implementing` | Agent coding through stories, committing as it goes |
| `in_pr` | PR opened, awaiting your review |
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

### 4. PR

Agent opens a pull request. You review. You merge. You ship.

**What happens:**
- Agent creates a pull request with all changes
- PR includes description of work done
- You review and merge
- Item state moves to `done`

Previous: [Configuration](/guide/configuration) | Next: [Folder Structure](/guide/folder-structure)
