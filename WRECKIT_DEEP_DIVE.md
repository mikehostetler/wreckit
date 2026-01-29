# Wreckit: The Autonomous "Synthetic Developer"

## Overview
Wreckit is not just a task runner; it is a **Synthetic Developer Runtime**. It provides a "body" and "senses" for Large Language Models (LLMs) to inhabit, allowing them to perform long-horizon software engineering tasks autonomously.

## The Anatomy of a Synthetic Developer

### 1. The Brain (RLM - Recursive Language Model)
- **Code**: `src/agent/rlm-runner.ts`
- **Concept**: Conventional agents suffer from "context window exhaustion." Wreckit solves this with **RLM**.
  - Instead of feeding the whole project into the prompt, Wreckit boots a **virtual JavaScript Runtime (JSRuntime)** inside the agent's mind.
  - It loads the user's request into a global variable `CONTEXT_DATA`.
  - The agent uses a `RunJS` tool to programmatically inspect its own instructions, "thinking" in JavaScript before acting in the real world.
  - This effectively gives the agent **Infinite Context**—it can read 1GB of logs by writing a 3-line script to `grep` it, rather than stuffing it into the prompt.

### 2. The Nervous System (Orchestrator & State Machine)
- **Code**: `src/commands/orchestrator.ts` & `src/domain/states.ts`
- **Concept**: Software development is a state machine, not a chat stream.
  - **The Loop**: `orchestrateAll` runs an infinite loop, constantly scanning the `.wreckit/items` directory.
  - **The States**: It enforces a rigid progression for every task:
    1.  `Idea` (Raw input)
    2.  `Researched` (Agent reads code, writes `research.md`)
    3.  `Planned` (Agent writes `plan.md` & `prd.json`)
    4.  `Implementing` (Agent writes code, tests pass)
    5.  `Critique` (Agent reviews its own PR)
    6.  `Done` (Merged)
  - **Persistence**: Every state change is saved to JSON. If the process dies, it wakes up and resumes exactly where it left off (via `readBatchProgress`).

### 3. The Dreamer (Subconscious)
- **Code**: `src/commands/dream.ts` & `src/agent/mcp/dreamMcpServer.ts`
- **Concept**: A developer doesn't just do what they're told; they notice things.
  - The **Dreamer Agent** runs in the background. It reads `TODO` comments, spots messy code, and identifies architectural gaps.
  - It "dreams" up new User Stories (`[DREAMER] Fix race condition in...`) and saves them to the backlog using a specialized `save_dream_ideas` tool.
  - It uses Jaro-Winkler distance (`calculateSimilarity`) to ensure it doesn't dream the same idea twice.

### 4. The Immune System (Doctor & Self-Healing)
- **Code**: `src/agent/healingRunner.ts`
- **Concept**: Agents make mistakes. They hallucinate non-existent files or write bad JSON.
  - The **Healing Runtime** wraps every agent execution.
  - It catches errors (e.g., `JSON.parse` failure, `FileNotFound`).
  - Instead of crashing, it performs a **Diagnosis** (`detectRecoverableError`) and applies a **Repair Strategy** (e.g., "The file you tried to edit doesn't exist. Did you mean `src/index.ts`?").
  - It keeps a `healing-log.jsonl` to learn from its own sicknesses.

---

## Key Technical Innovations
- **Forensic Tooling**: The system is designed to be "debugged by itself." Every action leaves a file trail.
- **Sandboxed Execution**: Agents run in ephemeral VMs (`Sprite VM`) to prevent them from destroying the host machine.
- **Protocol Agnostic**: It speaks `Mcp` (Model Context Protocol) natively, allowing it to swap "brains" (Claude, OpenAI, Local LLM) without changing the "body" (Wreckit).
