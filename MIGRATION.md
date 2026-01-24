# Migration Guide: Process Mode to SDK Mode

This guide helps you migrate from wreckit's process mode (spawning external CLI agents) to SDK mode (using the Claude Agent SDK directly).

## Table of Contents

- [Overview](#overview)
- [Quick Migration](#quick-migration)
- [Configuration Reference](#configuration-reference)
- [Environment Variables](#environment-variables)
- [Verification](#verification)
- [Fallback Behavior](#fallback-behavior)
- [Troubleshooting](#troubleshooting)
- [Staying on Process Mode](#staying-on-process-mode)

---

## Overview

### What Changed in v1.0.0

Wreckit v1.0.0 introduced **SDK mode** as the default agent execution method. Instead of spawning external CLI tools (like `claude` or `amp`) as subprocesses, wreckit now uses the [Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) directly.

### Benefits of SDK Mode

| Feature | Process Mode | SDK Mode |
|---------|--------------|----------|
| **Performance** | Subprocess overhead | In-process execution |
| **Error handling** | Parse CLI output | Structured error types |
| **Tool support** | CLI-defined | Built-in + MCP servers |
| **Authentication** | CLI manages | Explicit credentials |
| **Context management** | CLI-managed | SDK-managed |

### Backward Compatibility

**Your existing configuration continues to work.** Wreckit automatically:
- Migrates legacy `mode`-based configs to the new `kind`-based format
- Falls back to process mode if SDK authentication fails
- Supports both old and new configuration formats

---

## Quick Migration

### Users with No Custom Config

If you haven't customized `.wreckit/config.json`, you're already on SDK mode. Just ensure you have credentials set up:

```bash
# Option 1: Set API key in shell
export ANTHROPIC_API_KEY=sk-ant-...

# Option 2: Use a custom endpoint (like Zai)
export ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic
export ANTHROPIC_AUTH_TOKEN=your-token

# Verify setup
wreckit sdk-info
```

### Users with Custom Config

If you have a custom agent configuration, you have two options:

**Option A: Switch to SDK mode (recommended)**

Replace your process configuration:

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

With the minimal SDK configuration:

```json
{
  "agent": {
    "kind": "claude_sdk"
  }
}
```

**Option B: Keep process mode**

If you prefer external CLI agents, explicitly set process mode:

```json
{
  "agent": {
    "kind": "process",
    "command": "claude",
    "args": ["--dangerously-skip-permissions", "--print"],
    "completion_signal": "<promise>COMPLETE</promise>"
  }
}
```

---

## Configuration Reference

### Legacy Format (Process Mode)

The old mode-based format is still supported:

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

Or for SDK mode (legacy):

```json
{
  "agent": {
    "mode": "sdk"
  }
}
```

### New Format (Kind-Based)

The new discriminated union format offers more control:

**SDK Mode (Claude Agent SDK):**

```json
{
  "agent": {
    "kind": "claude_sdk",
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 4096
  }
}
```

**Process Mode (External CLI):**

```json
{
  "agent": {
    "kind": "process",
    "command": "amp",
    "args": ["--dangerously-allow-all"],
    "completion_signal": "<promise>COMPLETE</promise>"
  }
}
```

### Default Configuration

When no agent config is specified, wreckit uses:

```json
{
  "agent": {
    "kind": "claude_sdk",
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 4096
  }
}
```

### Config Migration Rules

Wreckit automatically converts legacy configs:

| Legacy | New |
|--------|-----|
| `mode: "sdk"` | `kind: "claude_sdk"` |
| `mode: "process"` with `command` | `kind: "process"` with same settings |
| No agent config | `kind: "claude_sdk"` (default) |

---

## Environment Variables

SDK mode requires explicit API credentials. The Claude CLI's OAuth login is **not** automatically available to wreckit's SDK mode.

### Key Variables

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Direct Anthropic API authentication |
| `ANTHROPIC_BASE_URL` | Custom API endpoint (e.g., Zai proxy) |
| `ANTHROPIC_AUTH_TOKEN` | Authentication for custom endpoints |

### Precedence (Highest to Lowest)

Environment variables are resolved from multiple sources:

1. **`.wreckit/config.local.json`** `agent.env` — Project-specific, gitignored
2. **`.wreckit/config.json`** `agent.env` — Project defaults, committed
3. **`process.env`** — Shell environment
4. **`~/.claude/settings.json`** `env` — Claude user settings

### Configuration Examples

**Direct Anthropic API (simplest):**

Set in your shell:
```bash
export ANTHROPIC_API_KEY=sk-ant-api03-...
```

Or in `~/.claude/settings.json`:
```json
{
  "env": {
    "ANTHROPIC_API_KEY": "sk-ant-api03-..."
  }
}
```

**Custom Endpoint (Zai, internal proxy, etc.):**

Create `.wreckit/config.local.json` (gitignored):
```json
{
  "agent": {
    "env": {
      "ANTHROPIC_BASE_URL": "https://api.z.ai/api/anthropic",
      "ANTHROPIC_AUTH_TOKEN": "your-zai-token"
    }
  }
}
```

> **Note:** When both `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN` are set, `ANTHROPIC_API_KEY` is automatically blanked to prevent credential fallback.

**Project-Wide Defaults:**

Add to `.wreckit/config.json` (committed):
```json
{
  "agent": {
    "kind": "claude_sdk",
    "env": {
      "ANTHROPIC_BASE_URL": "https://your-company-proxy.example.com"
    }
  }
}
```

Team members then set their token in `.wreckit/config.local.json` or shell environment.

### Advanced Configuration

#### Model Selection Variables

These variables allow overriding the default model selection:

| Variable | Purpose | Example |
|----------|---------|---------|
| `ANTHROPIC_MODEL` | Override the model for all requests | `claude-sonnet-4-20250514` |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | Override the default Sonnet model | `claude-sonnet-4-20250514` |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | Override the default Haiku model | `claude-haiku-3-20240307` |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | Override the default Opus model | `claude-opus-4-20250514` |

#### Allowed Prefixes for Claude Settings Import

When reading from `~/.claude/settings.json`, wreckit only imports environment variables with these prefixes:

- `ANTHROPIC_` — API credentials and model selection
- `CLAUDE_CODE_` — Claude Code specific settings
- `API_TIMEOUT` — Timeout configuration

This prefix filtering applies **only** to `~/.claude/settings.json` imports. Variables set in `.wreckit/config.json`, `.wreckit/config.local.json`, or shell environment are imported without prefix restrictions.

---

## Verification

### Check Your Setup

Run the diagnostic command to verify credentials:

```bash
wreckit sdk-info
```

This shows:
- Resolved environment variables (from all sources)
- Account info from the SDK
- Supported models

Example output:
```
Fetching SDK configuration info...

Resolved Environment (merged from all sources):
  ANTHROPIC_BASE_URL: https://api.z.ai/api/anthropic
  ANTHROPIC_AUTH_TOKEN: (set)
  ANTHROPIC_API_KEY: (blanked)
  ANTHROPIC_MODEL: (not set)

Sources checked (highest to lowest precedence):
  1. .wreckit/config.local.json agent.env
  2. .wreckit/config.json agent.env
  3. process.env (shell)
  4. ~/.claude/settings.json env

Querying SDK for account info...

Account Info from SDK:
  email: user@example.com
  organization: Example Org
  ...

Supported Models:
  - Claude Sonnet 4
  - Claude Opus 4
  ...
```

### Test with Dry Run

Before running a real task, test with `--dry-run`:

```bash
wreckit next --dry-run
```

This validates the configuration without executing the agent.

---

## Fallback Behavior

Wreckit includes automatic fallback for smoother migration:

### SDK to Process Fallback

If SDK authentication fails, wreckit automatically falls back to process mode:

```
[sdk] Starting agent...
[sdk] Authentication Error: API key not found
[warn] SDK authentication failed, falling back to process mode
[process] Starting claude agent...
```

This allows teams to gradually migrate without breaking existing workflows.

### When Fallback Triggers

Fallback occurs when:
- `ANTHROPIC_API_KEY` is not set and no custom endpoint is configured
- The SDK returns a 401 Unauthorized error
- Authentication token is invalid or expired

### Disabling Fallback

To enforce SDK-only mode (fail instead of fallback), ensure proper credentials are set and monitor for fallback warnings in logs.

---

## Troubleshooting

### Authentication Error

**Symptom:**
```
Authentication Error: Invalid API key
```

**Solutions:**

1. Verify credentials are set:
   ```bash
   wreckit sdk-info
   ```

2. Check credential sources (in order of precedence):
   - `.wreckit/config.local.json` `agent.env`
   - `.wreckit/config.json` `agent.env`
   - Shell environment (`echo $ANTHROPIC_API_KEY`)
   - `~/.claude/settings.json` `env`

3. For custom endpoints, ensure both URL and token are set:
   ```json
   {
     "agent": {
       "env": {
         "ANTHROPIC_BASE_URL": "https://your-endpoint",
         "ANTHROPIC_AUTH_TOKEN": "your-token"
       }
     }
   }
   ```

### Rate Limit Exceeded

**Symptom:**
```
Rate limit exceeded: 429 Too Many Requests
```

**Solutions:**
- Wait and retry (rate limits reset over time)
- Reduce concurrency if running multiple wreckit instances
- Consider upgrading your API tier
- Use a different endpoint with higher limits

### Context Window Error

**Symptom:**
```
Context error: maximum context length exceeded
```

**Solutions:**
- Break tasks into smaller pieces
- Reduce scope of individual items
- Use more specific research/plan prompts

### Network Error

**Symptom:**
```
Network error: ECONNREFUSED
```

**Solutions:**
- Check internet connection
- Verify `ANTHROPIC_BASE_URL` is correct (if using custom endpoint)
- Check if firewall/proxy is blocking the connection
- Try again (transient network issues)

### SDK Not Available

**Symptom:**
```
Cannot find module '@anthropic-ai/claude-agent-sdk'
```

**Solution:**
Reinstall wreckit:
```bash
npm install -g wreckit
```

### Fallback to Process Mode Warning

**Symptom:**
```
[warn] SDK authentication failed, falling back to process mode
```

**Cause:**
When SDK mode is configured but authentication fails, wreckit automatically falls back to process mode. This allows teams to gradually migrate without breaking existing workflows.

**Solutions:**

1. If you **want SDK mode**, fix the authentication:
   ```bash
   # Verify credentials are set
   wreckit sdk-info

   # Check for common issues:
   # - ANTHROPIC_API_KEY not set
   # - ANTHROPIC_AUTH_TOKEN invalid or expired
   # - Custom endpoint (ANTHROPIC_BASE_URL) returning 401
   ```

2. If you **want process mode** (no warning), configure it explicitly:
   ```json
   {
     "agent": {
       "kind": "process",
       "command": "claude",
       "args": ["--dangerously-skip-permissions", "--print"],
       "completion_signal": "<promise>COMPLETE</promise>"
     }
   }
   ```

**Reference:** See [Fallback Behavior](#fallback-behavior) for more details on when fallback triggers.

### Config Schema Validation Error

**Symptom:**
```
SchemaValidationError: Schema validation failed for .wreckit/config.json
```

**Cause:**
The configuration file contains invalid or unrecognized properties. This often occurs after migrating from an older wreckit version.

**Solutions:**

1. Run the doctor to diagnose config issues:
   ```bash
   wreckit doctor
   ```

2. Check for legacy `mode` vs new `kind` format:

   | Legacy (deprecated) | New (current) |
   |---------------------|---------------|
   | `mode: "sdk"` | `kind: "claude_sdk"` |
   | `mode: "process"` | `kind: "process"` |
   | No agent config | `kind: "claude_sdk"` (default) |

3. Example migration:

   **Before (legacy):**
   ```json
   {
     "agent": {
       "mode": "process",
       "command": "claude",
       "args": ["--print"]
     }
   }
   ```

   **After (current):**
   ```json
   {
     "agent": {
       "kind": "process",
       "command": "claude",
       "args": ["--print"],
       "completion_signal": "<promise>COMPLETE</promise>"
     }
   }
   ```

4. Verify the corrected config:
   ```bash
   wreckit doctor
   ```

**Note:** Wreckit automatically migrates legacy configs in memory, but you should update your config file to avoid future issues.

### Git Repository Issues

Git pre-flight checks run before each workflow phase to ensure a clean working state.

#### NOT_GIT_REPO

**Symptom:**
```
Git pre-flight check failed:
• Not a git repository
```

**Solutions:**
- Run `git init` to initialize a new repository
- Or navigate to an existing git repository

#### DETACHED_HEAD

**Symptom:**
```
Git pre-flight check failed:
• Repository is in detached HEAD state
```

**Solutions:**
- Run `git checkout <branch-name>` to switch to a branch
- Or run `git checkout -b <new-branch>` to create a new branch from current state

#### UNCOMMITTED_CHANGES

**Symptom:**
```
Git pre-flight check failed:
• There are uncommitted changes in the working directory
```

**Solutions:**
- Run `git stash` to temporarily save changes
- Or run `git commit -am "message"` to commit changes
- Or run `git checkout -- .` to discard changes (destructive)

#### BRANCH_DIVERGED

**Symptom:**
```
Git pre-flight check failed:
• Local branch has diverged from remote
```

**Solutions:**
- Run `git pull --rebase` to rebase local changes on top of remote
- Or run `git pull` to merge remote changes
- Resolve any conflicts and commit

#### NO_REMOTE

**Symptom:**
```
Git pre-flight check failed:
• No remote repository configured
```

**Solution:**
- Run `git remote add origin <url>` to add a remote

### State and Artifact Mismatches

Wreckit maintains workflow state in `item.json` and expects corresponding artifacts (files) to exist.

#### STATE_FILE_MISMATCH

**Symptom:**
```
warning: State is 'researched' but research.md is missing
warning: State is 'planned' but plan.md and prd.json are missing
```

**Cause:**
The item's state indicates a phase was completed, but the expected output file is missing.

**Solutions:**
1. Auto-repair with doctor:
   ```bash
   wreckit doctor --fix
   ```
   This will reset the state to match the available artifacts.

2. Manually re-run the phase:
   ```bash
   wreckit phase research --item <id> --force
   ```

#### INDEX_STALE

**Symptom:**
```
warning: index.json is out of sync: 3 items missing from index
```

**Cause:**
The cached index doesn't match the actual item directories.

**Solution:**
```bash
wreckit doctor --fix
```
This rebuilds index.json from the actual items directory.

#### MISSING_ITEM_JSON

**Symptom:**
```
error: item.json missing in .wreckit/items/<id>
```

**Cause:**
An item directory exists but lacks the required item.json file.

**Solution:**
Either remove the orphan directory or recreate the item.json manually.

#### INVALID_PRD

**Symptom:**
```
error: prd.json is invalid: Expected number, received string
```

**Cause:**
The prd.json file doesn't match the expected schema.

**Solution:**
Review and fix the prd.json file. Common issues:
- Story priority should be a number (1-4), not a string
- Story status should be "pending" or "done"
- Story IDs should follow the "US-###" format

#### CIRCULAR_DEPENDENCY

**Symptom:**
```
error: Circular dependency detected: item-a -> item-b -> item-a
```

**Cause:**
Item dependencies form a cycle that cannot be resolved.

**Solution:**
Edit the item.json files to remove the circular reference in the `depends_on` arrays.

#### MISSING_DEPENDENCY

**Symptom:**
```
warning: Depends on non-existent item: 999-nonexistent-item
```

**Cause:**
An item references a dependency that doesn't exist.

**Solution:**
Either create the missing item or remove it from the `depends_on` array.

---

## Staying on Process Mode

If you prefer external CLI agents (for compatibility, specific CLI features, or other reasons):

### Explicit Process Mode Configuration

Use the new `kind: "process"` format:

```json
{
  "agent": {
    "kind": "process",
    "command": "claude",
    "args": ["--dangerously-skip-permissions", "--print"],
    "completion_signal": "<promise>COMPLETE</promise>"
  }
}
```

### Using Amp CLI

```json
{
  "agent": {
    "kind": "process",
    "command": "amp",
    "args": ["--dangerously-allow-all"],
    "completion_signal": "<promise>COMPLETE</promise>"
  }
}
```

### Process Mode Requirements

- The CLI tool (`claude`, `amp`) must be installed and in PATH
- The CLI handles its own authentication (OAuth, etc.)
- Wreckit communicates via stdin/stdout

---

## Related Documentation

- [README.md](./README.md) — Overview and quick start
- [AGENTS.md](./AGENTS.md) — Agent guidelines and patterns
- [CHANGELOG.md](./CHANGELOG.md) — Version history and release notes
