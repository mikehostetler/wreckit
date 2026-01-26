# Installation

## Requirements

- Node.js 18+
- `gh` CLI (for GitHub PRs)
- An AI agent:
  - **SDK Mode** (recommended): Direct API or custom endpoint
  - **Process Mode**: [Amp](https://ampcode.com) or [Claude](https://claude.ai) CLI

## Install

```bash
npm install -g wreckit
```

## Initialize

```bash
cd my-project
wreckit init
```

This creates the `.wreckit/` directory structure with default configuration and prompt templates.

## Verify Installation

```bash
wreckit --version
wreckit doctor
```

## Next Steps

- [Quick Start](/guide/quick-start) - Run your first Ralph Wiggum loop
- [Configuration](/guide/configuration) - Customize your setup
