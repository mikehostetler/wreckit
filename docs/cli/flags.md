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
wreckit list --state raw
wreckit list --state implementing
```

**Available states:**
- `raw`
- `researched`
- `planned`
- `implementing`
- `in_pr`
- `done`

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

[Back to CLI Reference](/cli/)
