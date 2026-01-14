# iannuttall/ralph

**Repository:** https://github.com/iannuttall/ralph  
**Author:** Ian Nuttall  
**Language:** TypeScript (61.2%), Shell (19.7%), JavaScript (19.1%)  
**Stars:** 402  
**Forks:** 37  
**Version:** v0.1.3

## Overview

A minimal, file-based agent loop for autonomous coding. Each iteration starts fresh, reads on-disk state, and commits work for one story at a time. Distributed as an npm package with global CLI.

## Key Features

### Philosophy
- **Files and git as memory** (not model context)
- **PRD (JSON)** defines stories, gates, and status
- **Loop** executes one story per iteration
- **State** persists in `.ralph/`

### Global CLI
```bash
npm install -g @iannuttall/ralph
# or install directly
npx @iannuttall/ralph install
```

### Commands
```bash
ralph           # Run one iteration
ralph prd       # Generate PRD with AI
ralph install   # Install templates into project
ralph install --skills  # Install required skills
ralph --agent codex|claude|droid|opencode  # Switch agent
ralph --prd ./path/to/prd.json  # Override PRD path
ralph --no-commit  # Dry run (no commit)
```

### Agent Support
Set `AGENT_CMD` in `.agents/ralph/config.sh`:
- `codex` - OpenAI Codex
- `claude` - Claude Code CLI
- `droid` - Droid
- `opencode` - OpenCode (with server mode support)

### Template Hierarchy
1. `.agents/ralph/` in project (if present)
2. Bundled defaults from package

### State Files (.ralph/)
| File | Purpose |
|------|---------|
| `progress.md` | Append-only progress log |
| `guardrails.md` | "Signs" (lessons learned) |
| `activity.log` | Activity + timing log |
| `errors.log` | Repeated failures and notes |
| `runs/` | Raw run logs + summaries |

### PRD Story Status
- `open` → selectable
- `in_progress` → locked by running loop (with `startedAt`)
- `done` → completed (with `completedAt`)

Stale story handling: Set `STALE_SECONDS` in config to auto-reopen stalled stories.

### Skills (Installed Separately)
- **commit** - Git commit handling
- **dev-browser** - Browser verification
- **prd** - PRD generation

### Testing
```bash
npm test                    # Dry-run smoke tests
npm run test:ping           # Agent health check
npm run test:integration    # Full integration test
npm run test:loop           # Real agent loop test
```

## Differentiators
- **npm package** with global install
- **Minimal design** - files and git as memory
- **Multi-agent support** via config
- **Template hierarchy** (project → global defaults)
- **OpenCode server mode** for faster performance
- **Stale story auto-recovery**

## Installation
```bash
npm install -g @iannuttall/ralph
ralph install
ralph install --skills
```
