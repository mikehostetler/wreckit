import { createOpencodeClient } from "@opencode-ai/sdk";
import type { Logger } from "../logging";
import type { AgentResult } from "./runner";
import { registerSdkController, unregisterSdkController } from "./lifecycle.js";
import type { OpenCodeSdkAgentConfig } from "../schemas";
import type { AgentEvent } from "../tui/agentEvents";
import { getAllowedToolsForPhase } from "./toolAllowlist";
import { buildSdkEnv } from "./env.js";

export interface OpenCodeRunAgentOptions {
  config: OpenCodeSdkAgentConfig;
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
  options: OpenCodeRunAgentOptions,
): string[] | undefined {
  if (options.allowedTools !== undefined) {
    return options.allowedTools;
  }
  if (options.phase) {
    return getAllowedToolsForPhase(options.phase);
  }
  return undefined;
}

export async function runOpenCodeSdkAgent(
  options: OpenCodeRunAgentOptions,
): Promise<AgentResult> {
  const { cwd, prompt, logger, dryRun, onStdoutChunk } = options;

  if (dryRun) {
    const effectiveTools = getEffectiveToolAllowlist(options);
    if (effectiveTools && effectiveTools.length > 0) {
      logger.debug(`Tool restrictions: ${effectiveTools.join(", ")}`);
    }
    logger.info("[dry-run] Would run OpenCode SDK agent");
    return {
      success: true,
      output: "[dry-run] OpenCode SDK agent not executed",
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

    logger.info("Executing OpenCode SDK...");

    // Real OpenCode SDK usage
    const client = createOpencodeClient({
      baseUrl: sdkEnv.OPENCODE_BASE_URL,
      // API Key is automatically picked up from process.env.OPENCODE_API_KEY
      // or we can pass it if the types allow, but let's rely on standard env var behavior first.
    });

    const sessionResult = await client.session.create();

    if (sessionResult.error) {
      throw new Error(
        `Failed to create OpenCode session: ${String(sessionResult.error)}`,
      );
    }

    const session = sessionResult.data;
    if (!session) {
      throw new Error("OpenCode session creation returned no data");
    }

    // Cast to any because TS definitions seem to be missing 'prompt' despite runtime existence
    const response = await (session as any).prompt({
      text: prompt,
      tools: effectiveTools, // Pass allowlist
    });

    // Handle response
    const text =
      typeof response === "string"
        ? response
        : (response as any).content || JSON.stringify(response);
    output = text;
    if (onStdoutChunk) onStdoutChunk(text);

    return {
      success: true,
      output,
      timedOut: false,
      exitCode: 0,
      completionDetected: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`OpenCode SDK error: ${errorMessage}`);
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
