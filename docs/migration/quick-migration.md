# Quick Migration

Get migrated quickly from process mode to SDK mode.

## Step 1: Update Config

Replace legacy `mode` format with `kind` format in `.wreckit/config.json`:

**Old:**
```json
{
  "agent": {
    "mode": "claude",
    "command": "claude",
    "args": ["--dangerously-skip-permissions", "--print"]
  }
}
```

**New:**
```json
{
  "agent": {
    "kind": "claude_sdk",
    "model": "claude-sonnet-4-20250514"
  }
}
```

## Step 2: Set Credentials

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

Or for a custom endpoint (e.g., Z.AI):
```bash
export ANTHROPIC_BASE_URL="https://api.z.ai/api/anthropic"
export ANTHROPIC_AUTH_TOKEN="your-token-here"
```

## Step 3: Verify

```bash
wreckit doctor          # Validate configuration
wreckit --dry-run       # Preview without executing
wreckit run 1           # Run a single item
```

## Optional: Project-Specific Config

Create `.wreckit/config.local.json` (gitignored) for project-specific API routing:

```json
{
  "agent": {
    "env": {
      "ANTHROPIC_BASE_URL": "https://your-proxy.example.com",
      "ANTHROPIC_AUTH_TOKEN": "your-token"
    }
  }
}
```

For full details, see the [Environment Variables](/migration/environment) section or [MIGRATION.md](https://github.com/mikehostetler/wreckit/blob/main/MIGRATION.md) in the repository root.

[Back to Migration Guide](/migration/)
