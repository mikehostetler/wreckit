import type { ConfigResolved } from "../config";
import type { Logger } from "../logging";
import type { AgentEvent } from "../tui/agentEvents";
import type { AgentConfigUnion, ProcessAgentConfig, ClaudeSdkAgentConfig } from "../schemas";

// ============================================================
// Lifecycle Management (Re-exported from lifecycle module)
// ============================================================

export {
  registerSdkController,
  unregisterSdkController,
  registerProcessAgent,
  unregisterProcessAgent,
  terminateAllAgents,
} from "./lifecycle.js";

// ============================================================
// Process Runner (Re-exported from process-runner module)
// ============================================================

export { runProcessAgent } from "./process-runner.js";

// ============================================================
// Type Definitions
// ============================================================

/**
 * Legacy agent configuration format (mode-based).
 * @deprecated Use AgentConfigUnion (kind-based) instead.
 */
export interface AgentConfig {
  mode: "process" | "sdk";
  command: string;
  args: string[];
  completion_signal: string;
  timeout_seconds: number;
  max_iterations: number;
}

/**
 * Result returned by all agent runners.
 * Contains success status, output, timeout info, and exit code.
 */
export interface AgentResult {
  success: boolean;
  output: string;
  timedOut: boolean;
  exitCode: number | null;
  completionDetected: boolean;
}

/**
 * Options for running an agent with legacy config format.
 * @deprecated Use UnionRunAgentOptions instead.
 */
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
  mcpServers?: Record<string, unknown>;
  /** Restrict agent to only specific tools (e.g., MCP tools). Prevents use of Read, Write, Bash, etc. */
  allowedTools?: string[];
}

// ============================================================
// New API (Preferred)
// ============================================================

/**
 * Get agent configuration in union format from resolved config.
 *
 * This is the **new** helper that returns the discriminated union format
 * directly from the resolved config. Use this with `runAgentUnion` for
 * the modern agent dispatch system.
 *
 * @param config - The resolved wreckit configuration
 * @returns The agent configuration in union format (AgentConfigUnion)
 *
 * @example
 * ```typescript
 * const agentConfig = getAgentConfigUnion(resolvedConfig);
 * const result = await runAgentUnion({ config: agentConfig, cwd: "/project", ... });
 * ```
 */
export function getAgentConfigUnion(config: ConfigResolved): AgentConfigUnion {
  return config.agent;
}

// ============================================================
// Legacy API (Deprecated)
// ============================================================

/**
 * Get legacy agent configuration from resolved config.
 *
 * @deprecated Use `getAgentConfigUnion` and `runAgentUnion` instead.
 * This function converts the new AgentConfigUnion format back to the
 * legacy AgentConfig format for backward compatibility.
 *
 * **Migration path:**
 * - Old: `getAgentConfig(config)` → `AgentConfig` (mode-based)
 * - New: `getAgentConfigUnion(config)` → `AgentConfigUnion` (kind-based)
 *
 * @param config - The resolved wreckit configuration
 * @returns The agent configuration in legacy format (AgentConfig)
 */
export function getAgentConfig(config: ConfigResolved): AgentConfig {
  const agent = config.agent;

  // Convert from new kind-based format to legacy mode-based format
  if (agent.kind === "process") {
    return {
      mode: "process",
      command: agent.command,
      args: agent.args,
      completion_signal: agent.completion_signal,
      timeout_seconds: config.timeout_seconds,
      max_iterations: config.max_iterations,
    };
  }

  // All SDK kinds map to legacy mode: "sdk"
  return {
    mode: "sdk",
    command: "claude",
    args: [],
    completion_signal: "<promise>COMPLETE</promise>",
    timeout_seconds: config.timeout_seconds,
    max_iterations: config.max_iterations,
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

/**
 * Legacy agent runner for backward compatibility.
 *
 * @deprecated Use `runAgentUnion` instead. This function maintains the old
 * `mode: "process" | "sdk"` API and internally converts to the new union format.
 *
 * **Behavior:**
 * - If `config.mode === "sdk"`: Runs Claude SDK agent with fallback to process on auth error
 * - If `config.mode === "process"`: Runs process-based agent directly
 * - Supports dry-run and mock-agent modes for testing
 *
 * **Migration path:**
 * - Old: `runAgent({ config: legacyConfig, ...options })`
 * - New: `runAgentUnion({ config: unionConfig, ...options })`
 *
 * @param options - Legacy run options with AgentConfig
 * @returns Promise<AgentResult> with execution results
 */
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

      // Convert legacy config to ClaudeSdkAgentConfig
      const claudeConfig: ClaudeSdkAgentConfig = {
        kind: "claude_sdk",
        model: "claude-sonnet-4-20250514",
        max_tokens: 8192,
      };

      const result = await runClaudeSdkAgent({
        config: claudeConfig,
        cwd,
        prompt,
        logger,
        dryRun: options.dryRun,
        mockAgent: options.mockAgent,
        onStdoutChunk: options.onStdoutChunk,
        onStderrChunk: options.onStderrChunk,
        onAgentEvent: options.onAgentEvent,
        mcpServers: options.mcpServers,
        allowedTools: options.allowedTools,
        timeoutSeconds: config.timeout_seconds,
      });

      // If SDK fails due to auth, fall back to process mode
      if (!result.success && result.output.includes("Authentication Error")) {
        logger.warn("SDK authentication failed, falling back to process mode");
        return runLegacyProcessAgent(options, { ...config, mode: "process" });
      }

      return result;
    } catch (error) {
      logger.error(`SDK mode failed: ${error}`);
      // Fall back to process mode on any error
      logger.warn("Falling back to process mode");
      return runLegacyProcessAgent(options, { ...config, mode: "process" });
    }
  }

  // Default to process-based execution (existing code)
  return runLegacyProcessAgent(options, config);
}

/**
 * Legacy wrapper for process agent execution.
 * Converts legacy AgentConfig to ProcessAgentConfig and calls process-runner module.
 * @deprecated Use process-runner.runProcessAgent with union config instead.
 */
async function runLegacyProcessAgent(options: RunAgentOptions, config: AgentConfig): Promise<AgentResult> {
  const { runProcessAgent } = await import("./process-runner.js");

  // Convert legacy config to ProcessAgentConfig
  const processConfig: ProcessAgentConfig = {
    kind: "process",
    command: config.command,
    args: config.args,
    completion_signal: config.completion_signal,
  };

  return runProcessAgent(processConfig, {
    config: processConfig,
    cwd: options.cwd,
    prompt: options.prompt,
    logger: options.logger,
    dryRun: options.dryRun,
    mockAgent: options.mockAgent,
    onStdoutChunk: options.onStdoutChunk,
    onStderrChunk: options.onStderrChunk,
    onAgentEvent: options.onAgentEvent,
    mcpServers: options.mcpServers,
    allowedTools: options.allowedTools,
    timeoutSeconds: config.timeout_seconds,
  });
}

// ============================================================
// New Agent Dispatch System (Phase 4 - Discriminated Union)
// ============================================================

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
  /** MCP servers to make available to the agent (e.g., wreckit server for PRD capture) */
  mcpServers?: Record<string, unknown>;
  /** Restrict agent to only specific tools (e.g., MCP tools). Prevents use of Read, Write, Bash, etc. */
  allowedTools?: string[];
}

function exhaustiveCheck(x: never): never {
  throw new Error(`Unhandled agent kind: ${JSON.stringify(x)}`);
}

/**
 * Run an agent using the discriminated union config.
 *
 * This is the **new** dispatch system that supports multiple agent backends
 * via a kind-based discriminated union. It's the preferred way to run agents
 * in wreckit.
 *
 * **Supported agent kinds:**
 * - `process`: External process-based agent (fallback mode)
 * - `claude_sdk`: Claude Agent SDK integration
 * - `amp_sdk`: Sourcegraph Amp SDK integration
 * - `codex_sdk`: OpenAI Codex SDK integration
 * - `opencode_sdk`: OpenCode SDK integration
 * - `rlm`: Recursive Language Model mode (experimental)
 *
 * **Features:**
 * - Type-safe dispatch based on agent kind
 * - Direct passing of union configs (no conversion overhead)
 * - Support for dry-run and mock-agent modes
 * - MCP server integration
 * - Tool allowlist support
 * - Streaming output via callbacks
 *
 * @param options - Union run options with AgentConfigUnion
 * @returns Promise<AgentResult> with execution results
 *
 * @example
 * ```typescript
 * const result = await runAgentUnion({
 *   config: { kind: "claude_sdk", model: "claude-sonnet-4-20250514", max_tokens: 8192 },
 *   cwd: "/project",
 *   prompt: "Fix the bug",
 *   logger: console,
 *   timeoutSeconds: 3600
 * });
 * ```
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
      const { runProcessAgent } = await import("./process-runner.js");
      return runProcessAgent(config, {
        config,
        cwd: options.cwd,
        prompt: options.prompt,
        logger: options.logger,
        dryRun: options.dryRun,
        mockAgent: options.mockAgent,
        onStdoutChunk: options.onStdoutChunk,
        onStderrChunk: options.onStderrChunk,
        onAgentEvent: options.onAgentEvent,
        mcpServers: options.mcpServers,
        allowedTools: options.allowedTools,
        timeoutSeconds: options.timeoutSeconds,
      });
    }

    case "claude_sdk": {
      const { runClaudeSdkAgent } = await import("./claude-sdk-runner.js");
      return runClaudeSdkAgent({
        config,
        cwd: options.cwd,
        prompt: options.prompt,
        logger: options.logger,
        dryRun: options.dryRun,
        mockAgent: options.mockAgent,
        onStdoutChunk: options.onStdoutChunk,
        onStderrChunk: options.onStderrChunk,
        onAgentEvent: options.onAgentEvent,
        mcpServers: options.mcpServers,
        allowedTools: options.allowedTools,
        timeoutSeconds: options.timeoutSeconds,
      });
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
        onAgentEvent: options.onAgentEvent,
        mcpServers: options.mcpServers,
        allowedTools: options.allowedTools,
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
        onAgentEvent: options.onAgentEvent,
        mcpServers: options.mcpServers,
        allowedTools: options.allowedTools,
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
        onAgentEvent: options.onAgentEvent,
        mcpServers: options.mcpServers,
        allowedTools: options.allowedTools,
      });
    }

    case "rlm": {
      const { runRlmAgent } = await import("./rlm-runner.js");
      return runRlmAgent({
        config,
        cwd: options.cwd,
        prompt: options.prompt,
        logger: options.logger,
        dryRun: options.dryRun,
        onStdoutChunk: options.onStdoutChunk,
        onStderrChunk: options.onStderrChunk,
        onAgentEvent: options.onAgentEvent,
        mcpServers: options.mcpServers,
        allowedTools: options.allowedTools,
        timeoutSeconds: options.timeoutSeconds,
      });
    }

    default:
      return exhaustiveCheck(config);
  }
}
