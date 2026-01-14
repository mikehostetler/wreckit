<p align="center">
  <img src="img/wreckit.png" alt="Wreck it Ralph Wiggum holding a sign 'MY CODE IS IN DANGER'" width="1024">
</p>

# Wreck it Ralph Wiggum 🔨

> *"I'm gonna wreck it!"* — Wreck-It Ralph  
> *"I'm in danger."* — Ralph Wiggum, also your codebase

**Your AI agent, unsupervised, wrecking through your backlog while you sleep.**

```bash
wreckit ideas < BACKLOG.md && wreckit  # go touch grass
```

---

## What Is This

A CLI that runs a **Ralph Wiggum Loop** over your roadmap:

```
ideas → research → plan → implement → PR → done
       └──────────────────────────────────┘
         "I'm helping!" — the agent, probably
```

You dump a text file of half-baked ideas. Wreckit turns them into researched, planned, implemented, and PR'd code. You review. Merge. Ship.

It's the [HumanLayer](https://github.com/humanlayer/humanlayer) **Research → Plan → Implement** workflow, fully automated. The agent researches your codebase, writes a detailed plan, then executes it story-by-story until there's a PR ready for your review.

**Files are truth.** Everything lives in `.wreckit/` as JSON and Markdown. Git-trackable. Inspectable. Resumable. No magic databases. No cloud sync. Just files.

---

## Quick Start

```bash
# Install the chaos
npm install -g wreckit

# Initialize in your repo
cd my-project
wreckit init

# Feed it ideas (literally anything)
wreckit ideas < IDEAS.md
# or: echo "add dark mode" | wreckit ideas
# or: wreckit ideas --file ROADMAP.md

# Let Ralph loose
wreckit

# Go do something else. Come back to PRs.
```

---

## The Loop

Each item progresses through states:

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

### The Workflow

1. **Research** — Agent reads your codebase thoroughly. Finds patterns. Documents file paths, conventions, integration points. Outputs `research.md`.

2. **Plan** — Agent designs the solution. Breaks it into phases with success criteria. Creates user stories with acceptance criteria. Outputs `plan.md` + `prd.json`.

3. **Implement** — Agent picks the highest priority story, implements it, runs tests, commits, marks it done. Repeats until all stories complete.

4. **PR** — Agent opens a pull request. You review. You merge. You ship.

---

## CLI Commands

### The Essentials

| Command | What It Does |
|---------|--------------|
| `wreckit` | Run everything. TUI shows progress. |
| `wreckit init` | Initialize `.wreckit/` in repo |
| `wreckit ideas < FILE` | Ingest ideas from stdin |
| `wreckit status` | List all items with state |
| `wreckit run <id>` | Run single item through all phases |
| `wreckit next` | Run the next incomplete item |
| `wreckit doctor` | Validate items, find issues |

### Phase Commands (for debugging)

| Command | Transition |
|---------|------------|
| `wreckit research <id>` | raw → researched |
| `wreckit plan <id>` | researched → planned |
| `wreckit implement <id>` | planned → implementing |
| `wreckit pr <id>` | implementing → in_pr |
| `wreckit complete <id>` | in_pr → done |

### Flags

| Flag | What |
|------|------|
| `--verbose` | More logs |
| `--quiet` | Errors only |
| `--no-tui` | Disable TUI (CI mode) |
| `--dry-run` | Preview, don't execute |
| `--force` | Regenerate artifacts |

---

## Configuration

Lives in `.wreckit/config.json`:

```json
{
  "schema_version": 1,
  "base_branch": "main",
  "branch_prefix": "wreckit/",
  "agent": {
    "command": "amp",
    "args": ["--dangerously-allow-all"],
    "completion_signal": "<promise>COMPLETE</promise>"
  },
  "max_iterations": 100,
  "timeout_seconds": 3600
}
```

### Agent Options

Wreckit supports two agent execution modes:

#### SDK Mode (Recommended)
Uses the Claude Agent SDK directly for better performance and error handling:

```json
{
  "agent": {
    "mode": "sdk",
    "sdk_model": "claude-sonnet-4-20250514",
    "sdk_max_tokens": 8192,
    "sdk_tools": ["Read", "Edit", "Bash", "Glob", "Grep"]
  }
}
```

#### Process Mode (Default)
Spawns an external Claude Code process (backward compatible):

**Amp:**
```json
{
  "agent": {
    "mode": "process",
    "command": "amp",
    "args": ["--dangerously-allow-all"],
    "completion_signal": "<promise>COMPLETE</promise>"
  }
}
```

**Claude:**
```json
{
  "agent": {
    "mode": "process",
    "command": "claude",
    "args": ["--dangerously-skip-permissions", "--print"],
    "completion_signal": "<promise>COMPLETE</promise>"
  }
}
```

See [MIGRATION.md](./MIGRATION.md) for detailed migration guide.

---

## Folder Structure

```
.wreckit/
├── config.json              # Global config
├── index.json               # Registry of all items
├── prompts/                 # Customizable prompt templates
│   ├── research.md
│   ├── plan.md
│   └── implement.md
└── <section>/
    └── <nnn>-<slug>/
        ├── item.json        # State and metadata
        ├── research.md      # Codebase analysis
        ├── plan.md          # Implementation plan
        ├── prd.json         # User stories
        ├── prompt.md        # Generated agent prompt
        └── progress.log     # What the agent learned
```

Items are organized by section (e.g., `features/`, `bugs/`, `infra/`) with sequential numbering.

---

## Customization

### Prompt Templates

Edit files in `.wreckit/prompts/` to customize agent behavior:

- `research.md` — How the agent analyzes your codebase
- `plan.md` — How it designs solutions
- `implement.md` — How it executes user stories

### Template Variables

| Variable | Description |
|----------|-------------|
| `{{id}}` | Item ID (e.g., `features/001-dark-mode`) |
| `{{title}}` | Item title |
| `{{section}}` | Section name |
| `{{overview}}` | Item description |
| `{{item_path}}` | Path to item folder |
| `{{branch_name}}` | Git branch name |
| `{{base_branch}}` | Base branch |
| `{{completion_signal}}` | Agent completion signal |
| `{{research}}` | Contents of research.md |
| `{{plan}}` | Contents of plan.md |
| `{{prd}}` | Contents of prd.json |
| `{{progress}}` | Contents of progress.log |

---

## Example Session

```bash
$ cat IDEAS.md
Add dark mode toggle
Fix the login timeout bug
Migrate auth to OAuth2

$ wreckit ideas < IDEAS.md
Created 3 items:
  features/001-dark-mode-toggle
  bugs/001-login-timeout
  infra/001-oauth2-migration

$ wreckit status
ID                              STATE
features/001-dark-mode-toggle   raw
bugs/001-login-timeout          raw
infra/001-oauth2-migration      raw

$ wreckit
# TUI runs, agent researches, plans, implements...
# You go do literally anything else

$ wreckit status
ID                              STATE     PR
features/001-dark-mode-toggle   in_pr     #42
bugs/001-login-timeout          in_pr     #43
infra/001-oauth2-migration      implementing

$ # Review PRs, merge, done
```

---

## Design Principles

1. **Files are truth** — JSON + Markdown, git-trackable
2. **Idempotent** — Re-run anything safely
3. **Resumable** — Ctrl-C and pick up where you left off
4. **Transparent** — Every prompt is inspectable and editable
5. **Recoverable** — `wreckit doctor --fix` repairs broken state

---

## Cloud Sandboxes

Wreckit is designed for **multi-actor parallelism** — spin up multiple sandboxes, each working on different items from the same repo. The file-based state in `.wreckit/` means no conflicts, no coordination headaches.

We recommend [Sprites](https://sprites.dev/) from Fly.io for cloud dev environments. Spin up a fleet of Ralphs, let them wreck in parallel.

```bash
# Each sandbox pulls the repo, runs one item
wreckit next  # grabs the next incomplete item, runs it
```

---

## Requirements

- Node.js 18+
- `gh` CLI (for GitHub PRs)
- An AI agent:
  - **SDK Mode** (recommended): Set `ANTHROPIC_API_KEY` environment variable
  - **Process Mode**: [Amp](https://ampcode.com) or [Claude](https://claude.ai) CLI

---

## Development

```bash
git clone https://github.com/mikehostetler/wreckit.git
cd wreckit
bun install
bun run build
bun run test
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error |
| 130 | Interrupted (Ctrl-C) |

---

## Acknowledgements

The "Ralph Wiggum Loop" methodology stands on the shoulders of giants:

- [Ryan Carson](https://x.com/ryancarson) — for the Ralph pattern that inspired the core loop
- [Geoff Huntley](https://x.com/GeoffreyHuntley) — for evangelizing the Ralph Wiggum agent pattern
- [Dexter Horthy](https://x.com/dexhorthy) and the entire [HumanLayer](https://humanlayer.dev) team — for the Research → Plan → Implement workflow that makes agents actually useful
- Everyone in the community teaching agents to stop vibing and start shipping

---

## License

MIT

---

*"My code is in danger!"* — your codebase, nervously
