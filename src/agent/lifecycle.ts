import { spawn, type ChildProcess } from "node:child_process";
import type { Logger } from "../logging";

// ============================================================
// Lifecycle Management for Agent Execution
// ============================================================
// This module handles registration, unregistration, and termination
// of all active agents (both SDK and process-based). It ensures
// proper cleanup on process exit or when the user interrupts execution.

// Registry for cleanup on exit - tracks both SDK AbortControllers and process ChildProcesses
const activeSdkControllers = new Set<AbortController>();
const activeProcessAgents = new Set<ChildProcess>();

/**
 * Register an SDK agent's AbortController for cleanup on process exit.
 * Called by each SDK runner (claude, amp, codex, opencode, rlm) when an agent starts.
 *
 * @param controller - The AbortController to register for cleanup
 */
export function registerSdkController(controller: AbortController): void {
  activeSdkControllers.add(controller);
}

/**
 * Unregister an SDK agent's AbortController after normal completion.
 * Called by each SDK runner in their finally block.
 *
 * @param controller - The AbortController to unregister
 */
export function unregisterSdkController(controller: AbortController): void {
  activeSdkControllers.delete(controller);
}

/**
 * Register a process-based agent for cleanup on process exit.
 * Called when a process agent is spawned.
 *
 * @param child - The ChildProcess to register for cleanup
 */
export function registerProcessAgent(child: ChildProcess): void {
  activeProcessAgents.add(child);
}

/**
 * Unregister a process-based agent after normal completion.
 * Called when a process agent exits.
 *
 * @param child - The ChildProcess to unregister
 */
export function unregisterProcessAgent(child: ChildProcess): void {
  activeProcessAgents.delete(child);
}

/**
 * Terminate all active agents (both SDK and process-based).
 * Called on process exit or when user interrupts execution (Ctrl+C).
 *
 * **SDK agents**: Aborts their AbortController, which signals cancellation to the SDK.
 * **Process agents**: Sends SIGTERM, then SIGKILL after 5 seconds if still running.
 *
 * @param logger - Optional logger for debug output
 */
export function terminateAllAgents(logger?: Logger): void {
  // Abort all SDK agents
  for (const controller of [...activeSdkControllers]) {
    logger?.debug?.("Aborting SDK agent");
    try {
      controller.abort();
    } catch {
      // ignore
    }
  }
  activeSdkControllers.clear();

  // Kill all process-based agents (fallback mode)
  for (const child of [...activeProcessAgents]) {
    if (!child || child.killed) continue;
    logger?.debug?.(`Terminating agent process pid=${child.pid}`);

    try {
      child.kill("SIGTERM");
    } catch {
      // ignore
    }

    setTimeout(() => {
      if (child && !child.killed) {
        logger?.debug?.(`Force-killing agent process pid=${child.pid}`);
        try {
          child.kill("SIGKILL");
        } catch {
          // ignore
        }
      }
    }, 5000);
  }
  activeProcessAgents.clear();
}
