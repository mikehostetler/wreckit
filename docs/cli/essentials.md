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
- Finds first item in `raw`, `researched`, or `planned` state
- Runs it through all phases
- Useful for iterative workflow

**Use case:**
```bash
# Run one item at a time, review between each
wreckit next  # Runs first item
# Review and merge PR
wreckit next  # Runs next item
# Review and merge PR
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
