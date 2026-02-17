# Migration Guide

Migrating from process mode to SDK mode.

## Overview

Wreckit v1.0.0 introduced **SDK mode** as the default agent execution method. Instead of spawning external CLI tools (like `claude` or `amp`) as subprocesses, wreckit now uses the [Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) directly.

### What Changed

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

### Step 1: Update Config

Replace legacy `mode` format with `kind` format:

**Old (process mode):**
```json
{
  "agent": {
    "mode": "claude",
    "command": "claude",
    "args": ["--dangerously-skip-permissions", "--print"]
  }
}
```

**New (SDK mode):**
```json
{
  "agent": {
    "kind": "claude_sdk",
    "model": "claude-sonnet-4-20250514"
  }
}
```

### Step 2: Set Credentials

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

Or use a custom endpoint:
```bash
export ANTHROPIC_BASE_URL="https://api.z.ai/api/anthropic"
export ANTHROPIC_AUTH_TOKEN="your-token-here"
```

### Step 3: Test

```bash
wreckit doctor          # Validate configuration
wreckit --dry-run       # Preview without executing
wreckit run 1           # Run a single item
```

---

## Environment Variables

### Authentication

| Variable | Purpose | Required For |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | Direct Anthropic API access | `claude_sdk` with direct API |
| `ANTHROPIC_AUTH_TOKEN` | Custom endpoint authentication | `claude_sdk` with custom endpoint |
| `ANTHROPIC_BASE_URL` | Custom API endpoint URL | Custom endpoints (Z.AI, proxies) |

When `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN` are both set, `ANTHROPIC_API_KEY` is automatically blanked to prevent credential fallback to the default Anthropic endpoint.

### Model Selection

| Variable | Purpose | Default |
|----------|---------|---------|
| `ANTHROPIC_MODEL` | Override model for SDK agents | Config value or `claude-sonnet-4-20250514` |

### Resolution Precedence

Environment variables are merged from multiple sources (highest priority first):

1. `.wreckit/config.local.json` `agent.env` (project-specific, gitignored)
2. `.wreckit/config.json` `agent.env` (project defaults)
3. `process.env` (shell environment)
4. `~/.claude/settings.json` `env` (Claude user settings)

### Custom Endpoint Example

Use `.wreckit/config.local.json` for project-specific API routing:

```json
{
  "agent": {
    "env": {
      "ANTHROPIC_BASE_URL": "https://api.z.ai/api/anthropic",
      "ANTHROPIC_AUTH_TOKEN": "your-token-here"
    }
  }
}
```

### Allowed Environment Variable Prefixes

SDK mode forwards environment variables matching these prefixes to the agent subprocess:

- `ANTHROPIC_` — API keys, base URLs, auth tokens, model overrides
- `CLAUDE_` — Claude-specific settings
- `OPENAI_` — For OpenAI-compatible endpoints
- `ZAI_` — Z.AI-specific keys

---

## Experimental SDK Modes

In addition to `claude_sdk`, wreckit supports experimental SDK integrations:

| Kind | Description | Notes |
|------|-------------|-------|
| `amp_sdk` | Amp SDK | Experimental, may have API changes |
| `codex_sdk` | Codex SDK | Default model: `codex-1` |
| `opencode_sdk` | OpenCode SDK | Experimental |

All experimental SDKs share authentication and environment variable resolution with `claude_sdk`.

---

## Troubleshooting

### "Credentials not found for SDK mode"

**Cause:** API key not configured.

**Solutions:**
1. Set environment variable: `export ANTHROPIC_API_KEY="your-key"`
2. Or set in `.wreckit/config.local.json`:
   ```json
   {"agent": {"env": {"ANTHROPIC_API_KEY": "your-key"}}}
   ```

### "Failed to initialize SDK client"

**Cause:** Invalid credentials or network issue.

**Solutions:**
1. Verify API key is valid
2. Check network connectivity
3. Test the API endpoint:
   ```bash
   curl https://api.anthropic.com/v1/messages \
     -H "x-api-key: $ANTHROPIC_API_KEY" \
     -H "anthropic-version: 2023-06-01"
   ```

### "Falling back to process mode"

**Cause:** SDK mode failed, using process mode fallback.

This is normal if you're intentionally using process mode or SDK credentials aren't configured. To use SDK mode, ensure credentials are set and update config to `kind: "claude_sdk"`.

### "Agent kind not recognized"

**Cause:** Invalid agent kind in config.

**Valid kinds:** `claude_sdk`, `amp_sdk`, `codex_sdk`, `opencode_sdk`, `process`, `rlm`

### Old Config Not Working

**Cause:** Using legacy `mode` format.

Migrate `{"agent": {"mode": "claude"}}` to `{"agent": {"kind": "claude_sdk"}}`.

### Debug Mode

```bash
wreckit --verbose       # Detailed logging
wreckit --debug         # JSON (ndjson) output
wreckit doctor          # Validate configuration
wreckit --dry-run       # Preview without executing
```

---

## Getting Help

1. Run `wreckit doctor` to validate your setup
2. Use `--verbose` for detailed logs
3. Open an issue: [GitHub Issues](https://github.com/mikehostetler/wreckit/issues)
