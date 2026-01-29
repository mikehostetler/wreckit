# Sandbox Usability Layer (CLI Flag & Ephemeral Mode) Implementation Plan

## Overview
Implement a seamless user experience for sandboxed execution via a `--sandbox` CLI flag. This abstracts away the complexity of configuring the Sprite agent, managing VM lifecycles, and handling synchronization, making safe remote execution accessible with a single command.

## Current State Analysis
*   **Sprite Agent Infrastructure**: `runSpriteAgent()` handles VM init and sync.
*   **CLI**: No `--sandbox` flag exists.
*   **Config**: `applyOverrides` exists but lacks sandbox logic.
*   **Lifecycle**: VMs persist after execution (no auto-cleanup).

## Phases

### Phase 1: Config Override Layer
*   Extend `ConfigOverrides` with `sandbox?: boolean`.
*   Implement `applySandboxMode()` to transform config to Sprite defaults.
*   Update `src/config.ts`.

### Phase 2: CLI Flag Integration
*   Add `--sandbox` to global options in `src/index.ts`.
*   Pass flag through `orchestrateAll`, `runCommand`, `runPhaseCommand`.
*   Update `src/commands/run.ts` and `src/commands/phase.ts`.

### Phase 3: Ephemeral VM Lifecycle
*   Add `ephemeral?: boolean` to `SpriteRunAgentOptions`.
*   Implement `currentEphemeralVM` tracking in `src/agent/sprite-runner.ts`.
*   Add `finally` block to cleanup VM if ephemeral.
*   Enhance VM naming with item ID.

### Phase 4: Interrupt Safety
*   Update `src/cli-utils.ts` `setupInterruptHandler` to accept cleanup callback.
*   Register cleanup handler in `runCommand` to kill VM on SIGINT.

### Phase 5: Testing & Documentation
*   Add integration tests in `tests/integration/sandbox.test.ts`.
*   Update `README.md` and error messages.

## Testing Strategy
*   Unit tests for config transformation.
*   Integration tests for VM lifecycle (mocked).
*   Manual verification of Ctrl+C cleanup.