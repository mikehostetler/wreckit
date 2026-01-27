import type { Logger } from "../logging";
import type { AgentConfigUnion } from "../schemas";
import type { AgentEvent } from "../tui/agentEvents";
import type { AgentResult } from "./result";

/**
 * Common options passed to all agent runners.
 * This interface unifies the options across different SDK runners.
 */
export interface CommonRunAgentOptions {
  /** Agent configuration in discriminated union format */
  config: AgentConfigUnion;
  /** Working directory for agent execution */
  cwd: string;
  /** Prompt/task for the agent */
  prompt: string;
  /** Logger instance */
  logger: Logger;
  /** Dry run mode - don't actually execute */
  dryRun?: boolean;
  /** Mock agent mode - simulate execution */
  mockAgent?: boolean;
  /** Timeout in seconds (optional, defaults to config.timeout_seconds) */
  timeoutSeconds?: number;
  /** Callback for stdout chunks */
  onStdoutChunk?: (chunk: string) => void;
  /** Callback for stderr chunks */
  onStderrChunk?: (chunk: string) => void;
  /** Callback for structured agent events */
  onAgentEvent?: (event: AgentEvent) => void;
  /** MCP servers to make available to the agent */
  mcpServers?: Record<string, unknown>;
  /** Restrict agent to only specific tools (e.g., MCP tools only) */
  allowedTools?: string[];
}
