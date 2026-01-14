# Competitor Analysis

This directory contains feature overviews of "real" Ralph Wiggum loop implementations—those that are actual CLI tools with substantial code, not just shell scripts or written guidance.

## Criteria for Inclusion

To be included, a project must be:
1. **Real software** - Not just a bash script wrapper or documentation
2. **CLI tool** - Runnable from the command line
3. **Has features beyond basic loop** - Tests, configuration, plugins, etc.

## Included Implementations

| Name | Language | TUI | Stars | Key Differentiator |
|------|----------|-----|-------|-------------------|
| [ralph-tui](ralph-tui.md) | TypeScript | ✅ Full | - | React-based TUI, plugin architecture |
| [ralph-orchestrator](ralph-orchestrator.md) | Python | Rich output | 601 | Multi-agent (5), ACP protocol, 920+ tests |
| [iannuttall/ralph](iannuttall-ralph.md) | TypeScript | ❌ | 402 | npm package, minimal design |
| [ralph-claude-code](ralph-claude-code.md) | Shell | tmux | - | Dual exit detection, 308 tests |

## Excluded (Shell Scripts/Plugins)

These were reviewed but excluded as they're primarily shell scripts, prompts, or Claude plugins rather than standalone software:

- **snarktank/ralph** - Original reference implementation (bash + prompts)
- **smart-ralph** - Claude Code plugin (shell scripts)
- **hmemcpy/ralph-wiggum** - Loop generator script
- **copilot-ralph** - Copilot CLI adaptation (minimal shell)
- **claude-ralph** - Claude Code adaptation (minimal shell)

## Feature Comparison Matrix

| Feature | wreckit | ralph-tui | ralph-orchestrator | iannuttall | ralph-claude-code |
|---------|---------|-----------|-------------------|------------|-------------------|
| **Language** | TypeScript | TypeScript | Python | TypeScript | Shell |
| **TUI** | ✅ | ✅ Full | Rich output | ❌ | tmux |
| **State Machine** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Multi-Agent** | ❌ | ✅ (2) | ✅ (5) | ✅ (4) | ❌ |
| **Plugin System** | ❌ | ✅ | ✅ (ACP) | ❌ | ❌ |
| **PRD Generation** | ❌ | ✅ | ❌ | ✅ | ✅ |
| **Session Persist** | ❌ | ✅ | ✅ | ❌ | ✅ |
| **Test Suite** | ✅ | ❓ | 920+ | ✅ | 308 |
| **npm Package** | ❓ | ✅ | ❌ (pip) | ✅ | ❌ |
