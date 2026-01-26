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

## Sections

- [Quick Migration](/migration/quick-migration) - Get migrated quickly
- [Environment Variables](/migration/environment) - Environment variable configuration
- [Troubleshooting](/migration/troubleshooting) - Common issues and solutions

For the complete migration guide, see [MIGRATION.md](https://github.com/mikehostetler/wreckit/blob/main/MIGRATION.md) in the repository.
