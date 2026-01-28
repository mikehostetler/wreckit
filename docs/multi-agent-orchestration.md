# Wreckit Multi-Agent Orchestration Mode

> **Status:** Future Feature (Planned)

## Overview

Wreckit's multi-agent orchestration mode coordinates multiple AI coding agents to execute development workflows. Rather than relying on a single agent, Wreckit can route tasks to the best agent for each phase or task type.

## Motivation

Different AI agents have different strengths:
- **Amp** (Sourcegraph): Multi-model (Opus, GPT-5.2, fast models), excellent for deep reasoning and complex codebases
- **Claude Code** (Anthropic): Strong reasoning, good for architecture decisions
- **Cursor**: Fast iteration, IDE-integrated, good for local edits
- **Codex/Copilot**: Quick completions, good for boilerplate

Wreckit's value is **higher-level workflow orchestration**, not competing with these agents. It provides:
- **CAPTURE** → **SYNTHESIZE** → **EXECUTE** pipeline
- Ticket routing across repos and agents
- Mobile-first UX via Telegram
- PR creation, preview URLs, merge automation

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Wreckit Orchestrator                     │
│                                                              │
│  ┌──────────┐   ┌──────────────┐   ┌──────────────────────┐ │
│  │ Telegram │ → │  Synthesizer │ → │   Agent Dispatcher   │ │
│  │ Gateway  │   │  (GPT-4o/ZAI)│   │                      │ │
│  └──────────┘   └──────────────┘   └──────────┬───────────┘ │
│                                                │             │
└────────────────────────────────────────────────┼─────────────┘
                                                 │
                 ┌───────────────────────────────┼───────────────────────────────┐
                 │                               │                               │
                 ▼                               ▼                               ▼
          ┌─────────────┐               ┌───────────────┐               ┌──────────────┐
          │     Amp     │               │  Claude Code  │               │    Cursor    │
          │ (Sourcegraph)│               │  (Anthropic)  │               │    Agent     │
          │             │               │               │               │              │
          │ • Opus      │               │ • Deep reason │               │ • Fast edits │
          │ • GPT-5.2   │               │ • Architecture│               │ • IDE native │
          │ • Fast      │               │ • Refactors   │               │ • Local      │
          └─────────────┘               └───────────────┘               └──────────────┘
```

## Routing Strategy

### Phase-Based Routing

| Phase | Recommended Agent | Rationale |
|-------|------------------|-----------|
| CAPTURE | N/A | Telegram gateway only |
| SYNTHESIZE | GPT-4o / Z.AI | Fast, good at structured output |
| EXECUTE (complex) | Amp | Multi-model, handles large codebases |
| EXECUTE (simple) | Cursor | Fast local edits |
| REVIEW | Claude Code | Strong reasoning for code review |

### Task-Type Routing

| Task Type | Recommended Agent |
|-----------|------------------|
| New feature (multi-file) | Amp |
| Bug fix (single file) | Cursor |
| Refactor / Architecture | Claude Code |
| Documentation | Any |
| Tests | Amp |

### Repo-Based Routing

Certain repositories may have agent preferences:
```json
{
  "repos": [
    {
      "owner": "org",
      "name": "backend",
      "preferredAgent": "amp"
    },
    {
      "owner": "org", 
      "name": "frontend",
      "preferredAgent": "cursor"
    }
  ]
}
```

## Configuration

Future config extension in `~/.wreckit/mobile-config.json`:

```json
{
  "agents": {
    "amp": {
      "enabled": true,
      "priority": 1,
      "capabilities": ["complex", "multi-file", "tests"]
    },
    "claude-code": {
      "enabled": true,
      "priority": 2,
      "capabilities": ["review", "architecture", "refactor"]
    },
    "cursor": {
      "enabled": false,
      "priority": 3,
      "capabilities": ["simple", "single-file", "local"]
    }
  },
  "routing": {
    "strategy": "task-type",
    "fallback": "amp"
  }
}
```

## Implementation Plan

### Phase 1: Single Agent (Current)
- WreckitGo uses Amp directly for all execution
- Synthesis uses configured LLM (GPT-4o, Z.AI)

### Phase 2: Agent Abstraction
- Define `Agent` interface with `execute(ticket)` method
- Implement `AmpAgent`, `ClaudeCodeAgent`, `CursorAgent`
- Each agent handles its own subprocess/API management

### Phase 3: Dispatcher
- Implement `AgentDispatcher` with routing logic
- Route based on ticket metadata, task type, or repo config
- Handle agent availability and fallback

### Phase 4: Parallel Execution
- Execute independent tickets in parallel across agents
- Coordinate commits/PRs when agents work on same repo
- Handle conflicts and merge order

## Current State

**WreckitGo currently uses Amp directly for execution.** Amp itself is a multi-model agent from Sourcegraph that internally uses:
- Claude Opus for complex reasoning
- GPT-5.2 for certain tasks
- Fast models for quick operations

This means we already get multi-model benefits through Amp. The multi-agent orchestration mode would add the ability to use different *agents* (not just models), each with their own tool access, context management, and execution patterns.

## Relationship to Amp

Amp is the **default execution agent** for WreckitGo. Key distinctions:

| Aspect | Amp | Wreckit |
|--------|-----|---------|
| Scope | Single session, single task | Multi-ticket workflows |
| Input | Natural language prompt | Synthesized tickets with spec |
| Context | Codebase + conversation | Cross-session, cross-repo |
| Output | Code changes + PR | Coordinated PRs across repos |
| UX | Terminal / IDE | Mobile-first (Telegram) |

Wreckit orchestrates *when* and *what* to send to Amp; Amp handles *how* to implement it.

## Future Considerations

- **Cost optimization**: Route to cheaper/faster agents for simple tasks
- **Latency optimization**: Use local agents (Cursor) when speed matters
- **Specialization**: Train/fine-tune agents for specific repos
- **Observability**: Track which agents perform best on which tasks
- **Fallback chains**: If Amp fails, try Claude Code, etc.
