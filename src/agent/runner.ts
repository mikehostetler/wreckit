import type { ConfigResolved } from "../config";
import type { Logger } from "../logging";
import type { AgentEvent } from "../tui/agentEvents";
import type {
  AgentConfigUnion,
  ProcessAgentConfig,
  ClaudeSdkAgentConfig,
} from "../schemas";

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
// Agent API
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
  /** Item ID for VM naming (used when ephemeral mode is enabled) */
  itemId?: string;
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
export async function runAgentUnion(
  options: UnionRunAgentOptions,
): Promise<AgentResult> {
  const {
    config,
    logger,
    dryRun = false,
    mockAgent = false,
    cwd,
    prompt,
  } = options;

  if (dryRun) {
    const kindLabel =
      config.kind === "process"
        ? `process: ${config.command} ${config.args.join(" ")}`
        : `${config.kind} agent`;
    logger.info(`[dry-run] Would run ${kindLabel}`);
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
    logger.info(`[mock-agent] Simulating ${config.kind} agent run...`);
    // Use completion_signal from config if it's a process agent, otherwise default to "DONE"
    const completionSignal =
      config.kind === "process"
        ? config.completion_signal
        : "<promise>COMPLETE</promise>";
    const mockLines = [
      `🤖 [mock-agent] Starting simulated ${config.kind} agent run...`,
      "📋 [mock-agent] Analyzing prompt...",
      "🔍 [mock-agent] Researching codebase...",
      "✏️  [mock-agent] Making changes...",
      "✅ [mock-agent] Changes complete!",
      completionSignal,
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
        itemId: options.itemId,
      });
    }

    case "sprite": {
      const { runSpriteAgent } = await import("./sprite-runner.js");
      // Detect ephemeral mode: auto-generated VM name means ephemeral
      const isEphemeral = !config.vmName;
      return runSpriteAgent(config, {
        config,
        cwd: options.cwd,
        prompt: options.prompt,
        logger: options.logger,
        dryRun: options.dryRun,
        mockAgent: options.mockAgent,
        onStdoutChunk: options.onStdoutChunk,
        onStderrChunk: options.onStderrChunk,
        timeoutSeconds: options.timeoutSeconds,
        ephemeral: isEphemeral,
        itemId: options.itemId,
      });
    }

    default:
      return exhaustiveCheck(config);
  }
}