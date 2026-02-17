# Essential Commands

Core commands you'll use every day.

## wreckit

Run all incomplete items through the full workflow (research → plan → implement → critique → PR).

```bash
wreckit
```

**What it does:**
- Finds all items in `idea`, `researched`, or `planned` state
- Runs each item through all phases sequentially
- Displays TUI progress interface
- Creates pull requests when implementation and critique are complete

**Options:**
- `--no-tui` - Disable TUI (useful for CI)
- `--dry-run` - Preview without executing
- `--verbose` - More detailed logging
- `--quiet` - Errors only
- `--parallel <n>` - Process N items simultaneously
- `--no-resume` - Start fresh, ignoring saved progress
- `--retry-failed` - Include previously failed items
- `--no-healing` - Disable automatic self-healing
- `--sandbox` - Run in isolated Sprite VMs

**Example:**
```bash
wreckit                    # Run all items
wreckit --no-tui           # Run without TUI
wreckit --dry-run          # Preview what would happen
wreckit --parallel 3       # Process 3 items at once
```

---

## wreckit init

Initialize `.wreckit/` directory structure in your repo.

```bash
wreckit init
```

**What it creates:**
```
.wreckit/
├── config.json              # Global config
├── index.json               # Item registry
├── prompts/                 # Prompt templates
│   ├── research.md
│   ├── plan.md
│   ├── implement.md
│   └── critique.md
└── items/                   # Item directories (created as needed)
```

**When to use:**
- First time setting up Wreckit in a project
- Creates default configuration
- Creates customizable prompt templates

---

## wreckit ideas

Ingest ideas from stdin or file and create items.

```bash
wreckit ideas < IDEAS.md
# or
echo "add dark mode" | wreckit ideas
# or
wreckit ideas --file ROADMAP.md
```

**What it does:**
- Reads ideas from input (one per line or markdown list)
- Creates item directories under appropriate sections
- Assigns sequential IDs
- Sets initial state to `idea`

**Input formats:**
```bash
# Plain text (one per line)
Add dark mode
Fix login bug
Migrate to OAuth

# Markdown list
- Add dark mode
- Fix login bug
- Migrate to OAuth

# Numbered list
1. Add dark mode
2. Fix login bug
3. Migrate to OAuth
```

---

## wreckit status

List all items with their current states.

```bash
wreckit status
```

**Output:**
```
ID                              STATE     PR
features/001-dark-mode-toggle   in_pr     #42
bugs/001-login-timeout          idea
infra/001-oauth2-migration      planned
```

**Options:**
- `--json` - Output as JSON for programmatic use

**Useful for:**
- Seeing what's ready for review
- Checking what's in progress
- Identifying stuck items

---

## wreckit run

Run a single item through all phases.

```bash
wreckit run <id>
```

**ID formats:**
- Short: `1`, `2`, `3` (sequential numbers)
- Full: `features/001-dark-mode-toggle`
- Partial: `001-dark-mode-toggle`

**Example:**
```bash
wreckit run 1                      # Run first item
wreckit run 001-dark-mode          # Run specific item
wreckit run features/001-dark-mode # Run with full path
```

**What it does:**
- Runs specified item through all phases
- Skips completed phases
- Resumes from current state if interrupted
- Creates PR (or direct-merges) when done

---

## wreckit next

Run the next incomplete item.

```bash
wreckit next
```

**What it does:**
- Finds the first item in `idea`, `researched`, or `planned` state.
- Runs it through all phases.
- Useful for iterative workflow.

---

## wreckit rollback

Undo a direct-merge item, reverting its changes from the base branch.

```bash
wreckit rollback <id>
```

**What it does:**
- Reverts the merge commit for a direct-merge item
- Resets the item state to pre-merge
- Only works for items merged via direct mode

**Options:**
- `--force` - Force rollback even if item is not in `done` state

---

## wreckit shell

Execute a shell command in the context of a work item (on its branch, in its working directory).

```bash
wreckit shell <id> <command...>
```

**Example:**
```bash
wreckit shell 1 npm test         # Run tests on item 1's branch
wreckit shell 1 git log --oneline  # See commits on item 1's branch
```

**What it does:**
- Checks out the item's feature branch
- Runs the given command
- Returns to the previous branch

---

## wreckit summarize

Generate feature visualization summaries for completed items.

```bash
wreckit summarize
```

**Options:**
- `--item <id>` - Generate for specific item
- `--phase <state>` - Generate for items in specific state
- `--all` - Generate for all completed items

---

## wreckit execute-roadmap

Convert active ROADMAP milestones into wreckit items.

```bash
wreckit execute-roadmap
```

**What it does:**
- Reads `ROADMAP.md` in the project root
- Converts active milestones and objectives into wreckit items
- Bridges the gap between high-level roadmap planning and wreckit execution

**Options:**
- `--include-done` - Include completed objectives

**Prerequisite:** Run `wreckit strategy` first to generate `ROADMAP.md`.

---

## wreckit check-integrity

Check if the built `dist/` directory is in sync with `src/`.

```bash
wreckit check-integrity
```

**What it does:**
- Compares source files with built output
- Reports files that are out of sync
- Useful for verifying builds in CI

**Options:**
- `--json` - Output as JSON

---

## wreckit watchdog

Watch source files and automatically rebuild on changes.

```bash
wreckit watchdog
```

**What it does:**
- Watches `src/` for file changes
- Automatically runs `build` when changes are detected
- Debounces rapid changes to avoid redundant builds

**Options:**
- `--debounce-ms <ms>` - Debounce delay in milliseconds (default: 500)
- `--json` - Output as JSON

---

## wreckit dream

Autonomous ideation: scan your codebase for improvement opportunities.

```bash
wreckit dream [options]
```

**What it does:**
- Scans your codebase for `TODO` comments, technical debt, and architectural gaps
- Autonomously generates new roadmap items based on its findings
- Acts as an AI product manager for your project

**Options:**
- `--max-items <n>` - Limit the number of items generated (default: 5)
- `--source <type>` - Filter by source: `todo`, `gap`, `debt`, or `all` (default)

---

## wreckit strategy

Analyze codebase and generate/update ROADMAP.md.

```bash
wreckit strategy
```

**What it does:**
- Analyzes your codebase structure and patterns
- Generates or updates a `ROADMAP.md` with milestones and objectives
- Acts as an AI technical lead recommending next steps

**Options:**
- `--force` - Regenerate ROADMAP.md even if it exists
- `--analyze-dirs <dirs...>` - Directories to analyze (default: `src`)

---

## wreckit geneticist

Recursive prompt optimization: improve system prompts based on error patterns.

```bash
wreckit geneticist [options]
```

**What it does:**
- Analyzes `.wreckit/healing-log.jsonl` to identify recurring failure patterns
- Autonomously optimizes system prompts in `src/prompts/*.md`
- Acts as an immune system that learns from mistakes

**Options:**
- `--auto-merge` - Automatically submit PRs for optimized prompts
- `--time-window <hours>` - Analyze logs from last N hours (default: 48)
- `--min-errors <count>` - Threshold for recurrent pattern detection (default: 3)

---

## wreckit learn

Extract and compile codebase patterns into reusable Skill artifacts.

```bash
wreckit learn [patterns...]
```

**What it does:**
- Analyzes completed items to identify reusable patterns
- Compiles patterns into Skill artifacts stored in `.wreckit/skills.json`
- Skills improve agent performance on future items

**Options:**
- `--item <id>` - Extract patterns from specific item
- `--phase <state>` - Extract patterns from items in specific phase state
- `--all` - Extract patterns from all completed items
- `--output <path>` - Output path for skills.json (default: `.wreckit/skills.json`)
- `--merge <strategy>` - Merge strategy: `append` (default), `ask`, or `replace`
- `--review` - Review extracted skills before saving
- `--dry-run` - Preview without writing changes

**Examples:**
```bash
wreckit learn                      # Learn from recent completed items
wreckit learn --all                # Learn from all completed items
wreckit learn --item 001           # Learn from specific item
wreckit learn --merge ask          # Interactive merge
```

---

## wreckit doctor

Validate items and find issues.

```bash
wreckit doctor
```

**What it checks:**
- Invalid states
- Missing artifacts
- Orphaned git branches
- Corrupted item.json files

**Auto-fix:**
```bash
wreckit doctor --fix
```

**What --fix does:**
- Resets invalid states
- Regenerates missing artifacts
- Cleans up orphaned branches
- Repairs common issues

**Use when:**
- Something seems wrong
- After manual edits to `.wreckit/`
- Before running Wreckit after a long break

[Back to CLI Reference](/cli/)
