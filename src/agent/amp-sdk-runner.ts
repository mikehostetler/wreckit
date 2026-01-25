import { AmpClient } from "@sourcegraph/amp-sdk";
import type { Logger } from "../logging";
import type { AgentResult } from "./runner";
import { registerSdkController, unregisterSdkController } from "./runner.js";
import type { AmpSdkAgentConfig } from "../schemas";
import type { AgentEvent } from "../tui/agentEvents";
import { getAllowedToolsForPhase } from "./toolAllowlist";
import { buildSdkEnv } from "./env.js";

export interface AmpRunAgentOptions {
  config: AmpSdkAgentConfig;
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

function getEffectiveToolAllowlist(options: AmpRunAgentOptions): string[] | undefined {
  if (options.allowedTools !== undefined) {
    return options.allowedTools;
  }
  if (options.phase) {
    return getAllowedToolsForPhase(options.phase);
  }
  return undefined;
}

export async function runAmpSdkAgent(
  options: AmpRunAgentOptions
): Promise<AgentResult> {
  const { cwd, prompt, logger, dryRun, onStdoutChunk, onStderrChunk, onAgentEvent } = options;

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

  let output = "";
  const abortController = new AbortController();
  registerSdkController(abortController);

  try {
    const sdkEnv = await buildSdkEnv({ cwd, logger });
    const effectiveTools = getEffectiveToolAllowlist(options);

    // Real Amp SDK usage
    const client = new AmpClient({
      apiKey: sdkEnv.AMP_API_KEY || process.env.AMP_API_KEY,
      baseUrl: sdkEnv.AMP_BASE_URL
    });

    const stream = await client.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      tools: effectiveTools, // Pass allowlist
      stream: true,
      abortSignal: abortController.signal
    });

    for await (const chunk of stream) {
      const text = chunk.delta?.content || "";
      output += text;
      if (onStdoutChunk) onStdoutChunk(text);
    }

    return {
      success: true,
      output,
      timedOut: false,
      exitCode: 0,
      completionDetected: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Amp SDK error: ${errorMessage}`);
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
