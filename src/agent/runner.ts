import { spawn, type ChildProcess } from "node:child_process";
import type { ConfigResolved } from "../config";
import type { Logger } from "../logging";
import type { AgentEvent } from "../tui/agentEvents";

// Registry for cleanup on exit - tracks both SDK AbortControllers and process ChildProcesses
const activeSdkControllers = new Set<AbortController>();
const activeProcessAgents = new Set<ChildProcess>();

export function registerSdkController(controller: AbortController): void {
  activeSdkControllers.add(controller);
}

export function unregisterSdkController(controller: AbortController): void {
  activeSdkControllers.delete(controller);
}

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
    if (child.killed) continue;
    logger?.debug?.(`Terminating agent process pid=${child.pid}`);

    try {
      child.kill("SIGTERM");
    } catch {
      // ignore
    }

    setTimeout(() => {
      if (!child.killed) {
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

export interface AgentConfig {
  mode: "process" | "sdk";
  command: string;
  args: string[];
  completion_signal: string;
  timeout_seconds: number;
  max_iterations: number;
  sdk_model?: string;
  sdk_max_tokens?: number;
  sdk_tools?: string[];
}

export interface AgentResult {
  success: boolean;
  output: string;
  timedOut: boolean;
  exitCode: number | null;
  completionDetected: boolean;
}

export interface RunAgentOptions {
  config: AgentConfig;
  cwd: string;
  prompt: string;
  logger: Logger;
  dryRun?: boolean;
  mockAgent?: boolean;
  onStdoutChunk?: (chunk: string) => void;
  onStderrChunk?: (chunk: string) => void;
  onAgentEvent?: (event: AgentEvent) => void;
}

export function getAgentConfig(config: ConfigResolved): AgentConfig {
  return {
    mode: config.agent.mode,
    command: config.agent.command,
    args: config.agent.args,
    completion_signal: config.agent.completion_signal,
    timeout_seconds: config.timeout_seconds,
    max_iterations: config.max_iterations,
    sdk_model: config.agent.sdk_model,
    sdk_max_tokens: config.agent.sdk_max_tokens,
    sdk_tools: config.agent.sdk_tools,
  };
}

async function simulateMockAgent(options: RunAgentOptions, config: AgentConfig): Promise<AgentResult> {
  const mockLines = [
    "🤖 [mock-agent] Starting simulated agent run...",
    "📋 [mock-agent] Analyzing prompt...",
    "🔍 [mock-agent] Researching codebase...",
    "✏️  [mock-agent] Making changes...",
    "✅ [mock-agent] Changes complete!",
    `${config.completion_signal}`,
  ];

  let output = "";
  for (const line of mockLines) {
    const delay = 300 + Math.random() * 400;
    await new Promise((resolve) => setTimeout(resolve, delay));
    const chunk = line + "\n";
    output += chunk;
    if (options.onStdoutChunk) {
      options.onStdoutChunk(chunk);
    } else {
      process.stdout.write(chunk);
    }
  }

  return {
    success: true,
    output,
    timedOut: false,
    exitCode: 0,
    completionDetected: true,
  };
}

export async function runAgent(options: RunAgentOptions): Promise<AgentResult> {
  const { config, cwd, prompt, logger, dryRun = false, mockAgent = false } = options;

  if (dryRun) {
    const modeLabel = config.mode === "sdk" ? "SDK agent" : `process: ${config.command} ${config.args.join(" ")}`;
    logger.info(`[dry-run] Would run ${modeLabel}`);
    logger.info(`[dry-run] Working directory: ${cwd}`);
    logger.info(`[dry-run] Prompt length: ${prompt.length} characters`);
    return {
      success: true,
      output: "[dry-run] No output",
      timedOut: false,
      exitCode: 0,
      completionDetected: true,
    };
  }

  if (mockAgent) {
    logger.info(`[mock-agent] Simulating agent run...`);
    return simulateMockAgent(options, config);
  }

  // Try SDK mode first
  if (config.mode === "sdk") {
    try {
      const { runClaudeSdkAgent } = await import("./claude-sdk-runner.js");
      const result = await runClaudeSdkAgent(options, config);

      // If SDK fails due to auth, fall back to process mode
      if (!result.success && result.output.includes("Authentication Error")) {
        logger.warn("SDK authentication failed, falling back to process mode");
        return runProcessAgent(options, { ...config, mode: "process" });
      }

      return result;
    } catch (error) {
      logger.error(`SDK mode failed: ${error}`);
      // Fall back to process mode on any error
      logger.warn("Falling back to process mode");
      return runProcessAgent(options, { ...config, mode: "process" });
    }
  }

  // Default to process-based execution (existing code)
  return runProcessAgent(options, config);
}

async function runProcessAgent(options: RunAgentOptions): Promise<AgentResult> {
  const { config, cwd, prompt, logger } = options;

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
      activeProcessAgents.add(child);
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

    if (config.timeout_seconds > 0) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        logger.warn(`Agent timed out after ${config.timeout_seconds} seconds`);
        child.kill("SIGTERM");
        setTimeout(() => {
          if (!child.killed) {
            child.kill("SIGKILL");
          }
        }, 5000);
      }, config.timeout_seconds * 1000);
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
      activeProcessAgents.delete(child);
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
      activeProcessAgents.delete(child);
      if (timeoutId) clearTimeout(timeoutId);
      const success = code === 0 && completionDetected;
      logger.debug(`Agent exited with code ${code}, completion detected: ${completionDetected}`);
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

// ============================================================
// New Agent Dispatch System (Phase 4 - Discriminated Union)
// ============================================================

import type { AgentConfigUnion } from "../schemas";

export interface UnionRunAgentOptions {
  config: AgentConfigUnion;
  cwd: string;
  prompt: string;
  logger: Logger;
  dryRun?: boolean;
  mockAgent?: boolean;
  timeoutSeconds?: number;
  onStdoutChunk?: (chunk: string) => void;
  onStderrChunk?: (chunk: string) => void;
  onAgentEvent?: (event: AgentEvent) => void;
}

function exhaustiveCheck(x: never): never {
  throw new Error(`Unhandled agent kind: ${JSON.stringify(x)}`);
}

/**
 * Run an agent using the new discriminated union config.
 * This is the new dispatch system that supports multiple agent backends.
 */
export async function runAgentUnion(options: UnionRunAgentOptions): Promise<AgentResult> {
  const { config, logger, dryRun = false, mockAgent = false } = options;

  if (dryRun) {
    logger.info(`[dry-run] Would run agent with kind: ${config.kind}`);
    return {
      success: true,
      output: "[dry-run] No output",
      timedOut: false,
      exitCode: 0,
      completionDetected: true,
    };
  }

  if (mockAgent) {
    logger.info(`[mock-agent] Simulating ${config.kind} agent run...`);
    const mockLines = [
      `🤖 [mock-agent] Starting simulated ${config.kind} agent run...`,
      "📋 [mock-agent] Analyzing prompt...",
      "🔍 [mock-agent] Researching codebase...",
      "✏️  [mock-agent] Making changes...",
      "✅ [mock-agent] Changes complete!",
      "DONE",
    ];
    let output = "";
    for (const line of mockLines) {
      const chunk = line + "\n";
      output += chunk;
      if (options.onStdoutChunk) {
        options.onStdoutChunk(chunk);
      }
    }
    return {
      success: true,
      output,
      timedOut: false,
      exitCode: 0,
      completionDetected: true,
    };
  }

  switch (config.kind) {
    case "process": {
      // Convert to legacy options for process agent
      const legacyConfig: AgentConfig = {
        mode: "process",
        command: config.command,
        args: config.args,
        completion_signal: config.completion_signal,
        timeout_seconds: options.timeoutSeconds ?? 3600,
        max_iterations: 100,
      };
      const legacyOptions: RunAgentOptions = {
        config: legacyConfig,
        cwd: options.cwd,
        prompt: options.prompt,
        logger: options.logger,
        dryRun: options.dryRun,
        mockAgent: options.mockAgent,
        onStdoutChunk: options.onStdoutChunk,
        onStderrChunk: options.onStderrChunk,
      };
      return runProcessAgent(legacyOptions);
    }

    case "claude_sdk": {
      const { runClaudeSdkAgent } = await import("./claude-sdk-runner.js");
      // Convert to legacy format for now
      const legacyConfig: AgentConfig = {
        mode: "sdk",
        command: "claude",
        args: [],
        completion_signal: "DONE",
        timeout_seconds: options.timeoutSeconds ?? 3600,
        max_iterations: 100,
        sdk_model: config.model,
        sdk_max_tokens: config.max_tokens,
        sdk_tools: config.tools,
      };
      const legacyOptions: RunAgentOptions = {
        config: legacyConfig,
        cwd: options.cwd,
        prompt: options.prompt,
        logger: options.logger,
        dryRun: options.dryRun,
        mockAgent: options.mockAgent,
        onStdoutChunk: options.onStdoutChunk,
        onStderrChunk: options.onStderrChunk,
      };
      return runClaudeSdkAgent(legacyOptions, legacyConfig);
    }

    case "amp_sdk": {
      const { runAmpSdkAgent } = await import("./amp-sdk-runner.js");
      return runAmpSdkAgent({
        config,
        cwd: options.cwd,
        prompt: options.prompt,
        logger: options.logger,
        dryRun: options.dryRun,
        onStdoutChunk: options.onStdoutChunk,
        onStderrChunk: options.onStderrChunk,
      });
    }

    case "codex_sdk": {
      const { runCodexSdkAgent } = await import("./codex-sdk-runner.js");
      return runCodexSdkAgent({
        config,
        cwd: options.cwd,
        prompt: options.prompt,
        logger: options.logger,
        dryRun: options.dryRun,
        onStdoutChunk: options.onStdoutChunk,
        onStderrChunk: options.onStderrChunk,
      });
    }

    case "opencode_sdk": {
      const { runOpenCodeSdkAgent } = await import("./opencode-sdk-runner.js");
      return runOpenCodeSdkAgent({
        config,
        cwd: options.cwd,
        prompt: options.prompt,
        logger: options.logger,
        dryRun: options.dryRun,
        onStdoutChunk: options.onStdoutChunk,
        onStderrChunk: options.onStderrChunk,
      });
    }

    default:
      return exhaustiveCheck(config);
  }
}
