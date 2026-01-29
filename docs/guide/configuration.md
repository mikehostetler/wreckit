# Configuration

Set up your agent and workflow preferences.

## Config File Location

Configuration lives in `.wreckit/config.json`:

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

## Agent Options

Wreckit supports multiple agent execution backends:

| Kind | Description | Configuration |
|------|-------------|---------------|
| `claude_sdk` | Claude Agent SDK (recommended) | model, max_tokens, tools |
| `amp_sdk` | Amp SDK (experimental) | model (optional) |
| `codex_sdk` | Codex SDK (experimental) | model (default: codex-1) |
| `opencode_sdk` | OpenCode SDK (experimental) | none |
| `process` | External CLI process | command, args, completion_signal |

### Claude SDK Mode (Recommended)

Uses the Claude Agent SDK directly for best performance and error handling:

```json
{
  "agent": {
    "kind": "claude_sdk",
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 8192
  }
}
```

### Experimental SDK Modes

Wreckit also supports experimental SDK integrations. These use the same underlying SDK infrastructure and share authentication/environment variable resolution with `claude_sdk`.

> **Note:** Experimental SDKs may have API changes in future releases.

**Amp SDK:**
```json
{
  "agent": {
    "kind": "amp_sdk",
    "model": "custom-model"
  }
}
```

**Codex SDK:**
```json
{
  "agent": {
    "kind": "codex_sdk",
    "model": "codex-1"
  }
}
```

**OpenCode SDK:**
```json
{
  "agent": {
    "kind": "opencode_sdk"
  }
}
```

### Process Mode

Spawns an external CLI process (for backward compatibility or custom agents):

**Amp CLI:**
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

**Claude CLI:**
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

See [Migration Guide](/migration/) for detailed configuration and environment variable documentation.

Previous: [Quick Start](/guide/quick-start) | Next: [The Loop](/guide/loop)
