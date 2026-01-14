import type { Logger } from "../logging";
import type { AgentResult } from "./runner";
import type { OpenCodeSdkAgentConfig } from "../schemas";
import type { AgentEvent } from "../tui/agentEvents";

export interface OpenCodeRunAgentOptions {
  config: OpenCodeSdkAgentConfig;
  cwd: string;
  prompt: string;
  logger: Logger;
  dryRun?: boolean;
  onStdoutChunk?: (chunk: string) => void;
  onStderrChunk?: (chunk: string) => void;
  onAgentEvent?: (event: AgentEvent) => void;
}

export async function runOpenCodeSdkAgent(
  options: OpenCodeRunAgentOptions
): Promise<AgentResult> {
  const { logger, dryRun } = options;

  if (dryRun) {
    logger.info("[dry-run] Would run OpenCode SDK agent");
    return {
      success: true,
      output: "[dry-run] OpenCode SDK agent not executed",
      timedOut: false,
      exitCode: 0,
      completionDetected: true,
    };
  }

  // TODO: Implement OpenCode SDK integration
  logger.error("OpenCode SDK runner not yet implemented");
  return {
    success: false,
    output: "OpenCode SDK runner is not yet implemented. Use process mode or claude_sdk instead.",
    timedOut: false,
    exitCode: 1,
    completionDetected: false,
  };
}
