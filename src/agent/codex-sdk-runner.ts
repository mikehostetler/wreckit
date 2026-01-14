import type { Logger } from "../logging";
import type { AgentResult } from "./runner";
import type { CodexSdkAgentConfig } from "../schemas";
import type { AgentEvent } from "../tui/agentEvents";

export interface CodexRunAgentOptions {
  config: CodexSdkAgentConfig;
  cwd: string;
  prompt: string;
  logger: Logger;
  dryRun?: boolean;
  onStdoutChunk?: (chunk: string) => void;
  onStderrChunk?: (chunk: string) => void;
  onAgentEvent?: (event: AgentEvent) => void;
}

export async function runCodexSdkAgent(
  options: CodexRunAgentOptions
): Promise<AgentResult> {
  const { logger, dryRun } = options;

  if (dryRun) {
    logger.info("[dry-run] Would run Codex SDK agent");
    return {
      success: true,
      output: "[dry-run] Codex SDK agent not executed",
      timedOut: false,
      exitCode: 0,
      completionDetected: true,
    };
  }

  // TODO: Implement Codex SDK integration
  logger.error("Codex SDK runner not yet implemented");
  return {
    success: false,
    output: "Codex SDK runner is not yet implemented. Use process mode or claude_sdk instead.",
    timedOut: false,
    exitCode: 1,
    completionDetected: false,
  };
}
