# Wreckit: The Autonomous PR Factory

## Core Identity
Wreckit is an autonomous CLI agent that acts as a "synthetic developer." It does not just write code; it manages the entire lifecycle of software delivery from idea to pull request.

## Deep Architecture

### 1. The Orchestrator (The Brain)
At its heart is `src/commands/orchestrator.ts`. It runs an infinite loop (or batch mode) that scans the file system for "Items" (work units).
- **State Machine**: Defined in `src/domain/states.ts` and `src/workflow/index.ts`. It enforces a rigid progression:
  `Idea → Researched → Planned → Implementing → Critique → In_PR → Done`
- **Resumability**: It maintains `BatchProgress` in `.wreckit/batch-progress.json`, allowing it to survive crashes and resume exactly where it left off.

### 2. The Agent Layer (The Hands)
Located in `src/agent/index.ts`, this is the interface to the LLM (Claude, etc.).
- **Abstraction**: It supports multiple backends (`claude_sdk`, `process`, `rlm`).
- **Tools**: It exposes a standardized toolset (`read_file`, `write_file`, `run_shell_command`) that allows the LLM to interact with the host system safely.
- **RLM (Recursive Language Model)**: This is the most advanced mode (`src/agent/rlm-runner.ts`). It offloads the prompt context to a JavaScript runtime (JSRuntime), effectively giving the agent "infinite context" by allowing it to programmatically read/query its own instructions using a `RunJS` tool.

### 3. The Phase System (The Process)
Each phase of work is a distinct module in `src/commands/phase.ts`:
- **Research**: Scans the codebase, creates `research.md`.
- **Plan**: Writes a PRD and breaks it down into User Stories (`prd.json`).
- **Implement**: Loops through the User Stories, writing code and tests for each.
- **Critique**: Self-reviews the changes.
- **PR**: Uses `gh` CLI to open a pull request.

### 4. Self-Healing (The Immune System)
The `doctorCommand` (`src/commands/doctor.ts`) and `watchdogCommand` run alongside the agent. If the agent gets stuck or crashes, the doctor analyzes the logs, identifies the failure pattern, and attempts to "heal" the state (e.g., by rolling back a failed file edit or resetting a stuck item).

---

## Key Files
- `src/index.ts`: The CLI entry point.
- `src/commands/orchestrator.ts`: The main loop.
- `src/agent/index.ts`: The AI interface.
- `src/workflow/index.ts`: The business logic of software delivery.
