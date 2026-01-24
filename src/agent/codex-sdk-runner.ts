import type { Logger } from "../logging";
import type { AgentResult } from "./runner";
import type { CodexSdkAgentConfig } from "../schemas";
import type { AgentEvent } from "../tui/agentEvents";
import { getAllowedToolsForPhase } from "./toolAllowlist";

export interface CodexRunAgentOptions {
  config: CodexSdkAgentConfig;
  cwd: string;
  prompt: string;
  logger: Logger;
  dryRun?: boolean;
  onStdoutChunk?: (chunk: string) => void;
  onStderrChunk?: (chunk: string) => void;
  onAgentEvent?: (event: AgentEvent) => void;
  /** MCP servers to make available to the agent (e.g., wreckit server for PRD capture) */
  mcpServers?: Record<string, unknown>;
  /** Restrict agent to only specific tools (e.g., MCP tools). Prevents use of Read, Write, Bash, etc. */
  allowedTools?: string[];
  /** Current workflow phase for tool allowlist enforcement (Spec 008 Gap 1) */
  phase?: string;
}

/**
 * Get the effective tool allowlist for Codex SDK agent.
 *
 * Per Spec 008 Gap 1: "No Enforcement for Non-Ideas Phases"
 * The tool allowlist must be enforced for all SDK runners, not just claude_sdk.
 *
 * Priority:
 * 1. Explicit allowedTools from options (highest priority)
 * 2. Phase-based allowlist from toolAllowlist.ts (if phase specified)
 * 3. undefined (no restrictions - default SDK behavior)
 */
function getEffectiveToolAllowlist(options: CodexRunAgentOptions): string[] | undefined {
  // Explicit allowedTools takes precedence
  if (options.allowedTools !== undefined) {
    return options.allowedTools;
  }

  // Fall back to phase-based allowlist if phase is specified
  if (options.phase) {
    return getAllowedToolsForPhase(options.phase);
  }

  // No restrictions
  return undefined;
}

export async function runCodexSdkAgent(
  options: CodexRunAgentOptions
): Promise<AgentResult> {
  const { logger, dryRun, config } = options;

  if (dryRun) {
    logger.info("[dry-run] Would run Codex SDK agent");
    const effectiveTools = getEffectiveToolAllowlist(options);
    if (effectiveTools) {
      logger.debug(`[dry-run] Tool restrictions: ${effectiveTools.join(", ")}`);
    }
    return {
      success: true,
      output: "[dry-run] Codex SDK agent not executed",
      timedOut: false,
      exitCode: 0,
      completionDetected: true,
    };
  }

  // TODO: Implement Codex SDK integration with tool allowlist enforcement
  const effectiveTools = getEffectiveToolAllowlist(options);
  if (effectiveTools) {
    logger.info(`Tool restrictions active: ${effectiveTools.join(", ")}`);
  }

  logger.error("Codex SDK runner not yet implemented");
  return {
    success: false,
    output: "Codex SDK runner is not yet implemented. Use process mode or claude_sdk instead.",
    timedOut: false,
    exitCode: 1,
    completionDetected: false,
  };
}
