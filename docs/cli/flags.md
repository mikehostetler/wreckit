# Flags

Global and command-specific flags.

## Global Flags

These flags work with all `wreckit` commands:

### --verbose

Enable more detailed logging.

```bash
wreckit --verbose
wreckit run 1 --verbose
```

**What it does:**
- Shows detailed agent prompts
- Displays file operations
- Logs all state transitions
- Useful for debugging

---

### --quiet

Suppress all output except errors.

```bash
wreckit --quiet
```

**What it does:**
- No progress updates
- No informational messages
- Only errors are displayed
- Useful for scripting

---

### --debug

Enable JSON output (ndjson - newline-delimited JSON).

```bash
wreckit --debug
```

**What it does:**
- Outputs structured logs as JSON
- One JSON object per line
- Machine-readable output
- Useful for log parsing and monitoring

**Example output:**
```json
{"level":"info","message":"Starting research phase","item":"features/001-dark-mode"}
{"level":"debug","message":"Reading codebase","files":42}
```

---

### --no-tui

Disable terminal UI (TUI).

```bash
wreckit --no-tui
```

**What it does:**
- Runs without interactive TUI
- Simple text output only
- Useful for CI/CD environments
- Required when stdout is not a TTY

**Use cases:**
- CI/CD pipelines
- Running in background jobs
- Logging to file
- Non-interactive environments

---

### --dry-run

Preview actions without executing.

```bash
wreckit --dry-run
wreckit run 1 --dry-run
```

**What it does:**
- Shows what would happen
- Doesn't modify files
- Doesn't create git commits
- Doesn't call agent API

**Use cases:**
- Previewing workflow
- Testing configurations
- Understanding what will change
- Safe exploration

---

### --force

Regenerate artifacts even if they exist.

```bash
wreckit plan 1 --force
wreckit research 1 --force
```

**What it does:**
- Overwrites existing research.md, plan.md, etc.
- Re-runs phases even if complete
- Useful when codebase changed
- Useful when templates changed

**Use cases:**
- After codebase changes
- After updating prompt templates
- Fixing incorrect artifacts
- Starting phase over

---

### --cwd

Override working directory.

**What it does:**
- Runs Wreckit in specified directory
- Useful for multi-project setups
- Useful for running from scripts

**Example:**
```bash
# Run Wreckit on a different project
wreckit --cwd ~/projects/myapp status
```

---

### --parallel

Process multiple items simultaneously.

```bash
wreckit --parallel 3
```

**What it does:**
- Runs N items in parallel (default: 1)
- Each item gets its own branch and agent instance
- Useful for processing large backlogs faster

**Edge cases:**
- High parallelism can cause merge conflicts in direct mode
- Each parallel agent consumes API tokens independently
- Value of 2 is safe for most workloads

---

### --no-resume

Start a fresh batch run, ignoring saved progress.

```bash
wreckit --no-resume
```

**What it does:**
- Ignores any saved batch progress from previous runs
- Starts processing from the beginning of the item list
- Useful when you want a clean slate

---

### --retry-failed

Include previously failed items when resuming.

```bash
wreckit --retry-failed
```

**What it does:**
- On resume, includes items that failed in previous runs
- Without this flag, failed items are skipped on resume
- Useful after fixing the cause of failures

---

### --no-healing

Disable automatic self-healing.

```bash
wreckit --no-healing
```

**What it does:**
- Disables the automatic error recovery system
- Agent errors will not be automatically retried with healing prompts
- Useful for debugging to see raw error behavior

---

### --agent

Override the agent execution backend.

```bash
wreckit --agent rlm run 1
wreckit --agent claude_sdk
```

**Valid values:** `claude_sdk`, `amp_sdk`, `codex_sdk`, `opencode_sdk`, `rlm`, `sprite`

**What it does:**
- Overrides the `agent.kind` setting from config
- Useful for testing different agent backends
- Takes precedence over config file settings

---

### --rlm

Shorthand for `--agent rlm`.

```bash
wreckit --rlm run 1
```

**What it does:**
- Runs the item using RLM (Recursive Language Model) mode
- Equivalent to `--agent rlm`
- See [RLM Mode](/guide/rlm) for details

---

### --sandbox

Run in an isolated Sprite VM.

```bash
wreckit --sandbox run 1
```

**What it does:**
- Implies `--agent sprite`
- Spawns an ephemeral Firecracker microVM
- Syncs project files into the VM
- Runs the agent in isolation
- Pulls changes back on success
- Automatically destroys the VM when done

---

### --mock-agent

Simulate agent responses without calling the real agent.

```bash
wreckit --mock-agent run 1
```

**What it does:**
- Returns simulated agent responses
- No API calls are made
- Useful for testing the workflow pipeline
- Useful for development and CI

---

### --tui-debug

Enable TUI debug mode.

```bash
wreckit --tui-debug
```

**What it does:**
- Logs TUI render frames
- Useful for debugging terminal UI display issues

---

## Command-Specific Flags

Some commands have additional flags:

### wreckit doctor --fix

Auto-repair issues found by doctor.

```bash
wreckit doctor --fix
```

**What it does:**
- Automatically repairs common issues
- Resets invalid states
- Regenerates missing artifacts
- Cleans up orphaned branches

---

### wreckit ideas --file

Read ideas from file instead of stdin.

```bash
wreckit ideas --file IDEAS.md
```

**Alternative to:**
```bash
wreckit ideas < IDEAS.md
```

---

### wreckit list --state

Filter items by state.

```bash
wreckit list --state idea
wreckit list --state implementing
```

**Available states:**
- `idea`
- `researched`
- `planned`
- `implementing`
- `critique`
- `in_pr`
- `done`

---

### wreckit dream --max-items

Limit the number of items generated during autonomous ideation.

```bash
wreckit dream --max-items 10
```

### wreckit dream --source

Filter by source type during ideation.

```bash
wreckit dream --source todo    # Only TODO comments
wreckit dream --source gap     # Only architectural gaps
wreckit dream --source debt    # Only technical debt
wreckit dream --source all     # Everything (default)
```

---

### wreckit geneticist options

```bash
wreckit geneticist --auto-merge           # Auto-submit optimization PRs
wreckit geneticist --time-window 72       # Analyze last 72 hours of logs
wreckit geneticist --min-errors 5         # Require 5+ occurrences to trigger
```

---

### wreckit learn options

```bash
wreckit learn --item 001                  # Learn from specific item
wreckit learn --all                       # Learn from all completed items
wreckit learn --merge replace             # Replace existing skills
wreckit learn --review                    # Review before saving
wreckit learn --output path/to/skills.json  # Custom output path
```

---

## Examples

### Verbose debugging

```bash
wreckit run 1 --verbose
```

### CI/CD mode

```bash
wreckit --no-tui --quiet
```

### Parallel processing

```bash
wreckit --parallel 3 --no-tui
```

### Dry run to preview

```bash
wreckit --dry-run
```

### JSON logs for monitoring

```bash
wreckit --debug 2>&1 | logger
```

### Force re-run research

```bash
wreckit research 1 --force
```

### Auto-fix issues

```bash
wreckit doctor --fix
```

### RLM mode

```bash
wreckit --rlm run 1
```

[Back to CLI Reference](/cli/)
