import { spawn, type ChildProcess } from "node:child_process";
import type { Logger } from "../logging";
import type { AgentEvent } from "../tui/agentEvents";
import type { ProcessAgentConfig } from "../schemas";
import type { AgentResult } from "./runner";
import { registerProcessAgent, unregisterProcessAgent } from "./lifecycle.js";

// ============================================================
// Process-Based Agent Execution
// ============================================================
// This module handles execution of external process-based agents.
// It's used as a fallback when SDK agents are unavailable or fail.

export interface ProcessRunnerOptions {
  /** The process agent configuration (command, args, completion signal) */
  config: ProcessAgentConfig;
  /** Working directory for agent execution */
  cwd: string;
  /** The prompt to send to the agent via stdin */
  prompt: string;
  /** Logger instance for debug/error output */
  logger: Logger;
  /** If true, log what would be executed but don't run */
  dryRun?: boolean;
  /** If true, simulate agent output without actually running */
  mockAgent?: boolean;
  /** Optional callback for stdout chunks (for streaming output) */
  onStdoutChunk?: (chunk: string) => void;
  /** Optional callback for stderr chunks (for streaming error output) */
  onStderrChunk?: (chunk: string) => void;
  /** Optional callback for structured agent events (tool use, results, errors) */
  onAgentEvent?: (event: AgentEvent) => void;
  /** Optional MCP servers to make available to the agent */
  mcpServers?: Record<string, unknown>;
  /** Optional tool allowlist (restricts agent to specific tools only) */
  allowedTools?: string[];
  /** Optional timeout in seconds (defaults to 3600 = 1 hour) */
  timeoutSeconds?: number;
}

/**
 * Run a process-based agent using the command specified in config.
 *
 * This is the fallback mode when SDK agents are unavailable or fail.
 * It spawns an external process, sends the prompt via stdin, and captures
 * stdout/stderr. The agent signals completion by outputting a specific
 * completion signal (e.g., `<promise>COMPLETE</promise>`).
 *
 * **Features:**
 * - Process spawning with timeout enforcement
 * - Stdout/stderr capture with optional streaming callbacks
 * - Completion signal detection for reliable success/failure determination
 * - Graceful shutdown (SIGTERM) → force kill (SIGKILL after 5s)
 * - Lifecycle registration for cleanup on process exit
 *
 * @param config - The process agent configuration
 * @param options - Execution options (cwd, prompt, callbacks, etc.)
 * @returns Promise<AgentResult> with success status, output, and exit code
 *
 * @example
 * ```typescript
 * const result = await runProcessAgent(
 *   { kind: "process", command: "node", args: ["agent.js"], completion_signal: "DONE" },
 *   { cwd: "/project", prompt: "Hello", logger: console }
 * );
 * ```
 */
export async function runProcessAgent(
  config: ProcessAgentConfig,
  options: ProcessRunnerOptions,
): Promise<AgentResult> {
  const { cwd, prompt, logger } = options;
  const timeoutSeconds = options.timeoutSeconds ?? 3600;

  return new Promise((resolve) => {
    let output = "";
    let timedOut = false;
    let completionDetected = false;
    let child: ChildProcess;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      child = spawn(config.command, config.args, {
        cwd,
        stdio: ["pipe", "pipe", "pipe"],
      });
      if (!child) {
        throw new Error("spawn returned undefined");
      }
      registerProcessAgent(child);
    } catch (err) {
      logger.error(`Failed to spawn agent: ${err}`);
      resolve({
        success: false,
        output: `Failed to spawn agent: ${err}`,
        timedOut: false,
        exitCode: null,
        completionDetected: false,
      });
      return;
    }

    if (timeoutSeconds > 0) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        logger.warn(`Agent timed out after ${timeoutSeconds} seconds`);
        try {
          child.kill("SIGTERM");
        } catch {
          // ignore
        }
        setTimeout(() => {
          if (!child.killed) {
            try {
              child.kill("SIGKILL");
            } catch {
              // ignore
            }
          }
        }, 5000);
      }, timeoutSeconds * 1000);
    }

    child.stdout?.on("data", (data: Buffer) => {
      const chunk = data.toString();
      output += chunk;
      if (options.onStdoutChunk) {
        options.onStdoutChunk(chunk);
      } else {
        process.stdout.write(chunk);
      }
      if (output.includes(config.completion_signal)) {
        completionDetected = true;
      }
    });

    child.stderr?.on("data", (data: Buffer) => {
      const chunk = data.toString();
      output += chunk;
      if (options.onStderrChunk) {
        options.onStderrChunk(chunk);
      } else {
        process.stderr.write(chunk);
      }
      if (output.includes(config.completion_signal)) {
        completionDetected = true;
      }
    });

    child.on("error", (err) => {
      unregisterProcessAgent(child);
      if (timeoutId) clearTimeout(timeoutId);
      logger.error(`Agent process error: ${err}`);
      resolve({
        success: false,
        output: output + `\nProcess error: ${err}`,
        timedOut: false,
        exitCode: null,
        completionDetected: false,
      });
    });

    child.on("close", (code) => {
      unregisterProcessAgent(child);
      if (timeoutId) clearTimeout(timeoutId);
      const success = code === 0 && completionDetected;
      logger.debug(
        `Agent exited with code ${code}, completion detected: ${completionDetected}`,
      );
      resolve({
        success,
        output,
        timedOut,
        exitCode: code,
        completionDetected,
      });
    });

    if (child.stdin) {
      child.stdin.write(prompt);
      child.stdin.end();
    }
  });
}
