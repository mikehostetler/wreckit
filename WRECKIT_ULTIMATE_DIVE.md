# Wreckit: The Metabolic Engine of Autonomy

## 1. The Core Philosophy
Wreckit is a **recursive development environment**. Its primary innovation is not "AI coding," but the **persistence of intent**. By treating every task as a state-tracked "Item," it allows a Large Language Model to inhabit a codebase over days or weeks, rather than just seconds.

## 2. The Five Systems of Wreckit (Internal VSM)

### System 1: Operations (The Runners)
- **Implementations**: `src/agent/rlm-runner.ts` (Recursive Language Model), `src/agent/sprite-runner.ts` (Cloud VMs).
- **Function**: These are the "muscles." They execute the actual bash commands and file edits. The RLM runner is the most advanced, using a virtual JS runtime to give the agent "infinite context."

### System 2: Coordination (The Protocol)
- **Implementation**: `src/agent/mcp/wreckitMcpServer.ts`.
- **Function**: Standardizes how the agent talks to the system. It uses the **Model Context Protocol (MCP)** to ensure that whether the agent is Claude or a local model, it "speaks" the same language of User Stories and PRDs.

### System 3: Control (The Orchestrator)
- **Implementation**: `src/commands/orchestrator.ts` and `src/domain/states.ts`.
- **Function**: The "Here and Now." It manages the `BatchProgress`, checks dependencies (`areDependenciesSatisfied`), and decides which Item is next in the queue. It ensures the system doesn't over-commit resources.

### System 4: Intelligence (The Dreamer)
- **Implementation**: `src/commands/dream.ts`.
- **Function**: The "Observer." It looks outward at the codebase, identifies technical debt, and "dreams" of future improvements. It proactively populates the backlog, ensuring the system never runs out of work.

### System 5: Policy (The Identity)
- **Implementation**: `src/config.ts` and `.wreckit/config.json`.
- **Function**: Defines the "rules of the game" (e.g., "Always use PR mode," "Use the GLM-4.7 model"). It balances the Dreamer's innovation with the Orchestrator's stability.

## 3. The "Wreckit Addition" to Cybernetic
Wreckit provides the **physicality** for Cybernetic aMCP. While Cybernetic thinks in terms of Stafford Beer’s VSM, Wreckit provides the **Sprite VMs** and **RLM sandboxes** where those thoughts become code. It acts as the "Metabolism"—the engine that consumes ideas and produces PRs.
