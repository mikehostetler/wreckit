# ralph-orchestrator

**Repository:** https://github.com/mikeyobrien/ralph-orchestrator  
**Author:** Mikey O'Brien  
**Language:** Python (94.3%)  
**Stars:** 601  
**Forks:** 78  
**License:** MIT  
**Status:** Alpha (v1.2.3)

## Overview

A Python-based implementation of the Ralph Wiggum pattern with comprehensive agent support, ACP (Agent Client Protocol) integration, and robust testing. Focuses on multi-agent orchestration with async-first design.

## Key Features

### Multi-Agent Support
| Agent | Status | Description |
|-------|--------|-------------|
| Claude SDK | ✅ Complete | Official Claude Agent SDK |
| Kiro CLI | ✅ Complete | Successor to Q Chat |
| Q Chat | ✅ Complete | Legacy support |
| Gemini CLI | ✅ Complete | Google's Gemini |
| ACP Agents | ✅ Complete | Any ACP-compliant agent |

### ACP (Agent Client Protocol) Integration
Supports any agent implementing the Agent Client Protocol:
- JSON-RPC 2.0 message protocol
- Permission handling modes: `auto_approve`, `deny_all`, `allowlist`, `interactive`
- File operations with path security validation
- Terminal operations (create, output, wait, kill, release)
- Session management and streaming updates

### Core Features
- **Auto-detection:** Automatically detects available AI agents
- **WebSearch Support:** Claude can search the web
- **Checkpointing:** Git-based async checkpointing for recovery
- **Prompt Archiving:** Tracks prompt evolution over iterations
- **Error Recovery:** Automatic retry with exponential backoff (non-blocking)
- **State Persistence:** Saves metrics and state for analysis
- **Configurable Limits:** Max iterations, runtime limits, cost limits
- **Rich Terminal Output:** Syntax highlighting, formatted output
- **Security Features:** Automatic masking of API keys in logs
- **Async-First Design:** Non-blocking I/O throughout
- **Inline Prompts:** Run with `-p "your task"` without needing a file
- **Agent Scratchpad:** Context persistence via `.agent/scratchpad.md`

### CLI Usage
```bash
ralph run                    # Run with prompt file
ralph run -p "your task"     # Inline prompt
ralph status                 # Check status
ralph init                   # Initialize project
```

### Execution Flow
1. **Initialization:** Creates `.agent/` directories, validates prompt
2. **Agent Detection:** Auto-detects available AI agents
3. **Iteration Loop:**
   - Execute AI agent with current prompt
   - Monitor for completion marker
   - Create checkpoints at intervals
   - Handle errors with retry logic
4. **Completion:** Stops when limits reached or `LOOP_COMPLETE` detected

### Testing
- **920+ tests** with unit, integration, and async coverage
- Comprehensive test suite for all core functions
- Error handling and recovery tests

### Configuration (ralph.yml)
```yaml
agent: claude
max_iterations: 100
checkpoint_interval: 5
timeout: 3600
```

## Differentiators
- **Python-based** (vs TypeScript/Shell alternatives)
- **ACP Protocol Support** for agent interoperability
- **Most comprehensive agent support** (5 different agents)
- **Async-first architecture**
- **Extensive test suite** (920+ tests)
- **Full documentation site** (MkDocs)

## Installation
```bash
pip install ralph-orchestrator
# or
uv add ralph-orchestrator
```
