# Wreckit Technical Specification (v1.0.0)

**Version:** 1.0.0
**Status:** Live / Production
**Codebase:** `/Users/speed/wreckit`

## 1. Executive Summary

Wreckit is a sophisticated, **multi-provider autonomous agent orchestrator** designed to turn high-level ideas into automated Pull Requests. Unlike simple CLI wrappers, Wreckit features a rich **Terminal User Interface (TUI)** built with React, a pluggable **Agent Runner** architecture supporting multiple AI SDKs (Claude, OpenAI, Sourcegraph, OpenCode), and native **Model Context Protocol (MCP)** integration where Wreckit acts as both a client and a server.

## 2. Architecture Overview

Wreckit is built on a modular architecture separating the User Interface, Agent Execution, and Workflow Logic.

```mermaid
graph TD
    User[User] --> TUI[Terminal UI (React/Ink)]
    TUI --> CLI[CLI Commands]
    CLI --> Workflow[Workflow Engine]
    
    subgraph "Agent Abstraction Layer"
        Workflow --> Runner{Provider Runner}
        Runner -->|Selects| Claude[Claude SDK Runner]
        Runner -->|Selects| Codex[Codex SDK Runner]
        Runner -->|Selects| Amp[Amp SDK Runner]
        Runner -->|Selects| OpenCode[OpenCode SDK Runner]
    end
    
    subgraph "MCP Ecosystem"
        WreckitMCP[Wreckit MCP Server]
        IdeasMCP[Ideas MCP Server]
        DreamMCP[Dream MCP Server]
    end
    
    Runner <--> WreckitMCP
```

## 3. Technology Stack

*   **Runtime:** `bun` (JavaScript/TypeScript)
*   **Language:** TypeScript
*   **UI Framework:** `react` + `ink` (Terminal Rendering)
*   **CLI Framework:** `commander`
*   **Validation:** `zod`
*   **Logging:** `pino`

### 3.1 Core Dependencies (Agent Providers)
Wreckit integrates multiple agent SDKs to allow switching backend intelligence:
*   `@anthropic-ai/claude-agent-sdk`: Native Claude integration.
*   `@openai/codex-sdk`: OpenAI Codex/GPT integration.
*   `@opencode-ai/sdk`: OpenCode integration.
*   `@sourcegraph/amp-sdk`: Sourcegraph Amp integration.

## 4. Core Systems

### 4.1 Agent Abstraction Layer (Runners)
Located in `src/agent/`, Wreckit implements a **Runner Pattern** to decouple the workflow logic from specific AI providers.

*   **Interface:** Standardized execution methods (`run`, `plan`, `implement`).
*   **Implementations:**
    *   `claude-sdk-runner.ts`: Orchestrates Claude agents.
    *   `codex-sdk-runner.ts`: Orchestrates OpenAI agents.
    *   `amp-sdk-runner.ts`: Orchestrates Amp agents.
    *   `opencode-sdk-runner.ts`: Orchestrates OpenCode agents.
*   **Tooling:** `toolAllowlist.ts` manages security permissions for agent capabilities.

### 4.2 Terminal User Interface (TUI)
Located in `src/tui/`, the UI is a full React application rendered to the terminal via `ink`.

*   **Entry Point:** `InkApp.tsx`
*   **Adapter:** `views/TuiViewAdapter.ts` bridges the imperative backend logic with the declarative React UI state.
*   **Components:**
    *   `Dashboard.ts`: Main layout manager.
    *   `ActiveItemPane.tsx`: Shows current task progress.
    *   `LogsPane.tsx`: Streaming logs and tool outputs.
    *   `AgentActivityPane.tsx`: Real-time agent thought process visualization.

### 4.3 Model Context Protocol (MCP)
Wreckit is a "Dual-Head" MCP implementation. It consumes MCP tools but also **hosts** MCP servers to expose its own internal state and capabilities to other tools.

*   **Servers (`src/agent/mcp/`):**
    *   `wreckitMcpServer.ts`: Exposes core Wreckit controls (start task, check status).
    *   `ideasMcpServer.ts`: Manages the "Ideas" database and lifecycle.
    *   `dreamMcpServer.ts`: Exposes the autonomous "Dream" mode capabilities.

### 4.4 Workflow Engine
Located in `src/workflow/`, this engine manages the lifecycle of a Wreckit "Item".

*   **Phases:** `Research` -> `Plan` -> `Implement` -> `Critique` -> `PR`
*   **State Machine:** `src/domain/states.ts` defines valid transitions.
*   **Commands:**
    *   `ideas`: Ingest and manage feature requests.
    *   `dream`: Autonomous mode where the agent generates its own roadmap.
    *   `critique`: Adversarial review phase.

## 5. Directory Structure Map

| Path | Purpose |
|------|---------|
| `src/index.ts` | CLI Entry Point |
| `src/commands/` | CLI Command implementations |
| `src/tui/` | React/Ink Terminal UI components |
| `src/agent/` | Agent Runners and Logic |
| `src/agent/mcp/` | Built-in MCP Servers |
| `src/workflow/` | Business logic for item lifecycle |
| `src/domain/` | Core types and state definitions |
| `src/fs/` | Filesystem utilities (locking, atomic writes) |

## 6. Key Capabilities

1.  **Multi-Model Orchestration:** Can swap "brains" (Claude vs. OpenAI vs. OpenCode) depending on the task type or user preference.
2.  **Autonomous "Dreaming":** The agent can scan the codebase, identify gaps, and propose its own roadmap items via `src/commands/dream.ts`.
3.  **Self-Correction:** Includes `healingRunner.ts` and `errorDetector.ts` to automatically attempt fixes when agent steps fail.
4.  **Interactive TUI:** Provides a dashboard-like experience in the terminal, far superior to standard scrolling log text.
