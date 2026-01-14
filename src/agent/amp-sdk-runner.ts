import type { Logger } from "../logging";
import type { AgentResult } from "./runner";
import type { AmpSdkAgentConfig } from "../schemas";
import type { AgentEvent } from "../tui/agentEvents";

export interface AmpRunAgentOptions {
  config: AmpSdkAgentConfig;
  cwd: string;
  prompt: string;
  logger: Logger;
  dryRun?: boolean;
  onStdoutChunk?: (chunk: string) => void;
  onStderrChunk?: (chunk: string) => void;
  onAgentEvent?: (event: AgentEvent) => void;
}

export async function runAmpSdkAgent(
  options: AmpRunAgentOptions
): Promise<AgentResult> {
  const { logger, dryRun } = options;

  if (dryRun) {
    logger.info("[dry-run] Would run Amp SDK agent");
    return {
      success: true,
      output: "[dry-run] Amp SDK agent not executed",
      timedOut: false,
      exitCode: 0,
      completionDetected: true,
    };
  }

  // TODO: Implement Amp SDK integration
  logger.error("Amp SDK runner not yet implemented");
  return {
    success: false,
    output: "Amp SDK runner is not yet implemented. Use process mode or claude_sdk instead.",
    timedOut: false,
    exitCode: 1,
    completionDetected: false,
  };
}
