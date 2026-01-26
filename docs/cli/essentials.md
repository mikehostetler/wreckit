# Essential Commands

Core commands you'll use every day.

## wreckit

Run all incomplete items through the full workflow (research → plan → implement → PR).

```bash
wreckit
```

**What it does:**
- Finds all items in `raw`, `researched`, or `planned` state
- Runs each item through all phases sequentially
- Displays TUI progress interface
- Creates pull requests when implementation is complete

**Options:**
- `--no-tui` - Disable TUI (useful for CI)
- `--dry-run` - Preview without executing
- `--verbose` - More detailed logging
- `--quiet` - Errors only

**Example:**
```bash
wreckit                    # Run all items
wreckit --no-tui           # Run without TUI
wreckit --dry-run          # Preview what would happen
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
│   └── implement.md
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
- Sets initial state to `raw`

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
bugs/001-login-timeout          raw
infra/001-oauth2-migration      planned
```

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
- Creates PR when done

---

## wreckit next

Run the next incomplete item.

```bash
wreckit next
```

**What it does:**
- Finds the first item in `raw`, `researched`, or `planned` state.
- Runs it through all phases.
- Useful for iterative workflow.

---

## wreckit joke

**The "Proof of Life" Command.**

```bash
wreckit joke
```

**What it does:**
- Displays a random programming joke from a curated internal list.
- This command was autonomously researched, planned, and implemented by Wreckit itself (Item 045) to prove its sovereignty.

---

## wreckit dream

**Autonomous Ideation.**

```bash
wreckit dream [options]
```

**What it does:**
- Scans your codebase for `TODO` comments, technical debt, and architectural gaps.
- Autonomously generates new roadmap items based on its findings.
- This is the "Soul" of Wreckit—allowing it to plan its own future.

**Options:**
- `--max-items <n>` - Limit the number of items generated.
- `--source <type>` - Filter by source (e.g., `todo`, `gap`).

---

## wreckit geneticist

**Recursive Prompt Optimization.**

```bash
wreckit geneticist [options]
```

**What it does:**
- Analyzes the `.wreckit/healing-log.jsonl` file to identify recurring failure patterns.
- Autonomously submits PRs to update the system prompts in `src/prompts/*.md`.
- This is the "Brain" of Wreckit—allowing it to learn from its own mistakes and improve its instructions over time.

**Options:**
- `--dry-run` - Preview the optimization without creating PRs.
- `--auto-merge` - Automatically merge the optimization PRs if checks pass.
- `--min-error-count <n>` - Minimum number of errors required to trigger an optimization.

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

---

## wreckit learn

Extract and compile codebase patterns into reusable Skill artifacts.

```bash
wreckit learn [patterns...]
```

**What it does:**
- Analyzes completed items to identify reusable patterns
- Compiles patterns into Skill artifacts stored in `.wreckit/skills.json`
- Skills can be used in future work to leverage learned patterns
- Improves over time as more items are completed

**Options:**
- `--item <id>` - Extract patterns from specific item
- `--phase <state>` - Extract patterns from items in specific phase state
- `--all` - Extract patterns from all completed items
- `--output <path>` - Output path for skills.json (default: `.wreckit/skills.json`)
- `--merge <strategy>` - Merge strategy: `append` (default), `ask`, or `replace`
- `--review` - Review extracted skills before saving
- `--dry-run` - Preview without writing changes

**Merge Strategies:**

### Append (default)
Merges new skills with existing skills without removing any.

```bash
wreckit learn --merge append
```

**Behavior:**
- Keeps all existing skills
- Adds new skills from extracted patterns
- Merges phase assignments (skill can be in multiple phases)
- Keeps existing skill definitions (never overwrites)

### Replace
Replaces all existing skills with newly extracted skills.

```bash
wreckit learn --merge replace
```

**Behavior:**
- Discards all existing skills
- Uses only newly extracted skills
- Useful for complete skill regeneration

### Ask (interactive)
Interactively choose which skills to keep for each conflict.

```bash
wreckit learn --merge ask
```

**Behavior:**
- Prompts user for each skill phase conflict
- Non-TTY environments (CI/CD, piped input) automatically fall back to `append`
- Provides fine-grained control over skill merges
- Options for each conflict:
  - **Keep existing**: Maintain the skill's current phase assignment
  - **Use extracted**: Move the skill to the extracted phase
  - **Keep both**: Add the skill to both phases

**When to use:**
- Curating skills from multiple extraction sessions
- Merging skills with conflicting phase assignments
- Wanting manual control over which skills to keep

**Example interaction:**
```
Interactive Skill Merge
────────────────────────────────────────────────────────────
Found 2 conflicts to resolve:

[1/2] Skill: code-analysis
  Existing: phase=research
  Extracted: phase=plan
  Choose: 1 keep research, 2 use plan, 3 add to both, [default: 1] > 2
  → Moved to plan phase

[2/2] Skill: test-generation
  Existing: phase=implement
  Extracted: phase=plan
  Choose: 1 keep implement, 2 use plan, 3 add to both, [default: 1] > 3
  → Added to both phases

✓ Merge complete.
```

**Examples:**
```bash
wreckit learn                      # Learn from recent 5 completed items
wreckit learn --all                # Learn from all completed items
wreckit learn --item 001           # Learn from specific item
wreckit learn --merge ask          # Interactive merge
wreckit learn --dry-run            # Preview without writing
```

[Back to CLI Reference](/cli/)
