# ralph-tui

**Repository:** https://github.com/subsy/ralph-tui  
**Author:** Ben Williams  
**Language:** TypeScript (99.4%)  
**Stars:** Not specified (npm package)  
**License:** MIT

## Overview

Ralph TUI is an **AI Agent Loop Orchestrator** with a full terminal UI. It's a Bun-based application using React and OpenTUI for the interface. Connects AI coding assistants (Claude Code, OpenCode) to task trackers (prd.json, Beads) and runs them autonomously.

## Key Features

### TUI Interface
- **Left Panel:** Task list with status indicators
- **Right Panel:** Live agent output (stdout/stderr)
- **Header:** Current iteration, active task
- **Footer:** Keyboard shortcuts
- **Subagent Tracing:** Dedicated panel for subagent tree/details

### Keyboard Controls
| Key | Action |
|-----|--------|
| `s` | Start execution |
| `p` | Pause/Resume |
| `d` | Toggle progress dashboard |
| `i` | Iteration history view |
| `l` | Load/switch epic |
| `u` | Subagent tracing panel |
| `T` | Subagent tree panel |
| `Ctrl+C` | Interrupt agent (with confirmation) |

### Agent Plugins
| Plugin | CLI | Description |
|--------|-----|-------------|
| `claude` | `claude --print` | Claude Code CLI with streaming |
| `opencode` | `opencode run` | OpenCode CLI |

### Tracker Plugins
| Plugin | Description | Features |
|--------|-------------|----------|
| `json` | prd.json file-based | Simple, no external tools |
| `beads` | Beads issue tracker | Hierarchy, dependencies, labels |
| `beads-bv` | Beads + graph analysis | PageRank, critical path |

### CLI Commands
```bash
ralph-tui              # Launch interactive TUI
ralph-tui run          # Start execution
ralph-tui resume       # Resume interrupted session
ralph-tui status       # Check session status (headless/CI)
ralph-tui logs         # View/manage iteration logs
ralph-tui setup        # Interactive project setup
ralph-tui create-prd   # Create PRD interactively (AI chat mode)
ralph-tui convert      # Convert PRD markdown to JSON
ralph-tui config show  # Display merged config
ralph-tui template     # Show/init prompt templates
ralph-tui plugins      # List available agents/trackers
```

### Configuration
- TOML configuration files
- Layered overrides: global → project → CLI flags
- Handlebars prompt templates
- Model selection per agent

### Completion Detection
Uses `<promise>COMPLETE</promise>` token in agent output to detect task completion.

### Session Management
- Pause/resume execution
- Session persistence (survives crashes)
- Headless mode for CI

## Differentiators
- **Full TUI** with React-based interface
- **Multiple tracker backends** (JSON, Beads)
- **Plugin architecture** for agents and trackers
- **Interactive PRD creation** with AI chat mode
- **Bun-only** (requires Bun runtime)

## Installation
```bash
npm install -g ralph-tui
# or
bun add -g ralph-tui
```
