# Wreckit Specification vs. Reality Check

**Target:** Wreckit Codebase (`/Users/speed/wreckit`)

## Executive Summary
The provided "Wreckit PRD/Spec" is **factually incorrect** and likely describes a different or hypothetical version of the software. The actual codebase is significantly more advanced, featuring a React-based TUI, multi-provider agent SDK support, and built-in MCP servers.

## 1. Dependency Analysis

| Category | Spec Claim | Actual Codebase | Verdict |
|----------|------------|-----------------|---------|
| **Core** | `@anthropic-ai/sdk` | `@anthropic-ai/claude-agent-sdk` | ❌ Mismatch |
| **Agents** | `@ax-llm/ax` | `@openai/codex-sdk`, `@opencode-ai/sdk`, `@sourcegraph/amp-sdk` | ❌ Completely Different |
| **CLI/UI** | `commander` | `commander`, **`ink` (React)**, `@clack/prompts` | ❌ Missing TUI |
| **MCP** | `mcporter` | **Built-in MCP Servers** (no `mcporter`) | ❌ Different Arch |
| **Config** | `yaml` | No `yaml` dependency found | ❌ Uses internal config |

## 2. Architectural Discrepancies

### Agent Runners
*   **Spec:** Describes two modes: `Direct` (simple) and `RLM` (ReAct loop).
*   **Reality:** Implements **Provider Runners**:
    *   `claude-sdk-runner.ts`
    *   `codex-sdk-runner.ts`
    *   `amp-sdk-runner.ts`
    *   `opencode-sdk-runner.ts`
    This suggests Wreckit is a **multi-model agent orchestrator**, not just a wrapper around `Ax`.

### User Interface
*   **Spec:** Standard CLI with flags.
*   **Reality:** Full **Terminal UI (TUI)** built with React (`src/tui/InkApp.tsx`). Features dashboard, logs pane, and interactive components.

### MCP Integration
*   **Spec:** Loads external MCP servers via `mcporter`.
*   **Reality:** Hosts its **own** MCP servers:
    *   `ideasMcpServer.ts`
    *   `dreamMcpServer.ts`
    *   `wreckitMcpServer.ts`
    This implies Wreckit *is* an MCP server itself, exposing its capabilities (ideas, dreaming) to other tools.

## 3. Code Structure

| Path | Spec Claim | Actual File |
|------|------------|-------------|
| `src/agent/direct.ts` | **Yes** | **No** |
| `src/agent/rlm.ts` | **Yes** | **No** |
| `src/cli/index.ts` | **Yes** | **Yes** (but bootstraps TUI) |
| `src/tui/InkApp.tsx` | **No** | **Yes** |
| `src/agent/mcp/dreamMcpServer.ts` | **No** | **Yes** |

## Conclusion
The spec should be **discarded**. It does not reflect the current reality of Wreckit, which is a sophisticated, multi-agent TUI platform rather than a simple CLI wrapper.
