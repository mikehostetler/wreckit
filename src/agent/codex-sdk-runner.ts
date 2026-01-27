import { Codex } from "@openai/codex-sdk";
import type { Logger } from "../logging";
import type { AgentResult } from "./runner";
import { registerSdkController, unregisterSdkController } from "./lifecycle.js";
import type { CodexSdkAgentConfig } from "../schemas";
import type { AgentEvent } from "../tui/agentEvents";
import { getAllowedToolsForPhase } from "./toolAllowlist";
import { buildSdkEnv } from "./env.js";

export interface CodexRunAgentOptions {
  config: CodexSdkAgentConfig;
  cwd: string;
  prompt: string;
  logger: Logger;
  dryRun?: boolean;
  onStdoutChunk?: (chunk: string) => void;
  onStderrChunk?: (chunk: string) => void;
  onAgentEvent?: (event: AgentEvent) => void;
  mcpServers?: Record<string, unknown>;
  allowedTools?: string[];
  phase?: string;
}

function getEffectiveToolAllowlist(
  options: CodexRunAgentOptions,
): string[] | undefined {
  if (options.allowedTools !== undefined) {
    return options.allowedTools;
  }
  if (options.phase) {
    return getAllowedToolsForPhase(options.phase);
  }
  return undefined;
}

export async function runCodexSdkAgent(
  options: CodexRunAgentOptions,
): Promise<AgentResult> {
  const { cwd, prompt, logger, dryRun, onStdoutChunk } = options;

  if (dryRun) {
    const effectiveTools = getEffectiveToolAllowlist(options);
    if (effectiveTools && effectiveTools.length > 0) {
      logger.debug(`Tool restrictions: ${effectiveTools.join(", ")}`);
    }
    logger.info("[dry-run] Would run Codex SDK agent");
    return {
      success: true,
      output: "[dry-run] Codex SDK agent not executed",
      timedOut: false,
      exitCode: 0,
      completionDetected: true,
    };
  }

  let output = "";
  const abortController = new AbortController();
  registerSdkController(abortController);

  try {
    const sdkEnv = await buildSdkEnv({ cwd, logger });
    const effectiveTools = getEffectiveToolAllowlist(options);

    logger.info("Executing Codex SDK...");

    // Real Codex SDK usage
    const client = new Codex({
      apiKey:
        sdkEnv.CODEX_API_KEY ||
        process.env.CODEX_API_KEY ||
        process.env.OPENAI_API_KEY,
    });

    const thread = await client.startThread();

    // Use non-streaming run for simplicity and type safety
    const result = await thread.run(prompt);

    output = (result as any).text || (result as any).content || "";
    if (onStdoutChunk) onStdoutChunk(output);

    return {
      success: true,
      output,
      timedOut: false,
      exitCode: 0,
      completionDetected: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Codex SDK error: ${errorMessage}`);
    return {
      success: false,
      output: output + `\nError: ${errorMessage}`,
      timedOut: false,
      exitCode: 1,
      completionDetected: false,
    };
  } finally {
    unregisterSdkController(abortController);
  }
}
