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
