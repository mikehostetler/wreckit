import type { Logger } from "../logging";
import type { SpriteAgentConfig } from "../schemas";
import type { AgentResult } from "./runner";
import {
  WispNotFoundError,
  SpriteSyncError,
} from "../errors";
import {
  AxAgent,
  AxAIAnthropic,
  AxAIOpenAI,
  AxAIGoogleGemini,
  type AxAIService,
  type AxFunction,
} from "@ax-llm/ax";
import { buildAxAIEnv } from "./env";
import { buildRemoteToolRegistry } from "./remote-tools";
import { adaptMcpServersToAxTools } from "./mcp/mcporterAdapter";
import { registerSdkController, unregisterSdkController } from "./lifecycle";
import { AgentEvent } from "../tui/agentEvents";
import { findRepoRoot } from "../fs/paths";
import { syncProjectToVM } from "../fs/sync";

// Re-export core primitives
export * from "./sprite-core";

import {
  startSprite,
  listSprites,
  parseWispJson,
  type WispSpriteInfo,
} from "./sprite-core";

// ============================================================
// Sprite Agent Runner
// ============================================================

export interface SpriteRunAgentOptions {
  config: SpriteAgentConfig;
  cwd: string;
  prompt: string;
  logger: Logger;
  dryRun?: boolean;
  mockAgent?: boolean;
  timeoutSeconds?: number;
  onStdoutChunk?: (chunk: string) => void;
  onStderrChunk?: (chunk: string) => void;
  onAgentEvent?: (event: AgentEvent) => void;
  mcpServers?: Record<string, unknown>;
  allowedTools?: string[];
}

/**
 * Ensure a Sprite VM is running. Starts it if it doesn't exist or isn't running.
 */
async function ensureSpriteRunning(
  name: string,
  config: SpriteAgentConfig,
  logger: Logger
): Promise<boolean> {
  const listResult = await listSprites(config, logger);
  const sprites = parseWispJson(listResult.stdout, logger) as WispSpriteInfo[];
  
  const exists = Array.isArray(sprites) && sprites.some(s => s.name === name && s.state === "running");

  if (exists) {
    logger.debug(`Sprite VM '${name}' is already running`);
    return true;
  }

  logger.info(`Starting Sprite VM '${name}'...`);
  try {
    const startResult = await startSprite(name, config, logger);
    return startResult.success;
  } catch (err) {
    logger.error(`Failed to start Sprite VM '${name}': ${err}`);
    return false;
  }
}

function handleAxAIError(error: any, logger: Logger): string {
  const msg = error instanceof Error ? error.message : String(error);
  logger.error(`AxAI Error: ${msg}`);
  return `Agent Error: ${msg}`;
}

export async function runSpriteAgent(
  config: SpriteAgentConfig,
  options: SpriteRunAgentOptions,
): Promise<AgentResult> {
  const { logger, dryRun = false, mockAgent = false, cwd, prompt, onStdoutChunk, onAgentEvent } = options;

  if (dryRun) {
    logger.info(`[dry-run] Would run Sprite agent in VM: ${config.vmName || "auto-generated"}`);
    return {
      success: true,
      output: "[dry-run] No output",
      timedOut: false,
      exitCode: 0,
      completionDetected: true,
    };
  }

  const abortController = new AbortController();
  registerSdkController(abortController);
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    // 1. Initialize VM
    const vmName = config.vmName || `wreckit-agent-${Date.now()}`;
    logger.info(`Initializing Sprite environment (${vmName})...`);
    
    const vmReady = await ensureSpriteRunning(vmName, config, logger);
    if (!vmReady) {
      return {
        success: false,
        output: "Failed to initialize Sprite VM",
        timedOut: false,
        exitCode: 1,
        completionDetected: false,
      };
    }

    // === SYNC ===
    logger.info('Synchronizing project to Sprite VM...');
    try {
      const projectRoot = findRepoRoot(cwd);
      const syncSuccess = await syncProjectToVM(vmName, projectRoot, config, logger);

      if (!syncSuccess) {
        return {
          success: false,
          output: 'Project synchronization failed.',
          timedOut: false,
          exitCode: 1,
          completionDetected: false,
        };
      }
      logger.info('Project synchronized successfully');
    } catch (err) {
      if ((err as Error).name === 'RepoNotFoundError') {
        logger.warn(`Not in a wreckit repository, skipping sync`);
      } else {
        throw err;
      }
    }
    // === END SYNC ===

    // 2. Build Environment
    const env = await buildAxAIEnv({ cwd, logger, provider: "anthropic" });

    // 3. Initialize AI
    let ai: AxAIService;
    if (env.ANTHROPIC_API_KEY) {
       ai = new AxAIAnthropic({ apiKey: env.ANTHROPIC_API_KEY, apiURL: env.ANTHROPIC_BASE_URL });
    } else if (env.OPENAI_API_KEY) {
      ai = new AxAIOpenAI({ apiKey: env.OPENAI_API_KEY });
    } else if (env.GOOGLE_API_KEY) {
      ai = new AxAIGoogleGemini({ apiKey: env.GOOGLE_API_KEY });
    } else {
       throw new Error("No AI API key found");
    }

    // 4. Build Tools
    const remoteTools = buildRemoteToolRegistry(vmName, config, logger, options.allowedTools);
    let mcpTools: AxFunction[] = [];
    if (options.mcpServers) {
      mcpTools = adaptMcpServersToAxTools(options.mcpServers, options.allowedTools);
    }
    const tools = [...remoteTools, ...mcpTools];

    // 5. Initialize Agent
    const agent = new AxAgent({
      ai,
      name: "Sprite Agent",
      description: `You are an expert software engineer working inside a sandboxed Linux microVM.
      The project has been synchronized to /home/user/project.
      You can access and modify code there.
      `,
      signature: "task:string -> answer:string",
      functions: tools,
    });

    // 6. Timeout
    if (options.timeoutSeconds && options.timeoutSeconds > 0) {
      timeoutId = setTimeout(() => {
        abortController.abort();
        logger.warn(`Agent timed out after ${options.timeoutSeconds}s`);
      }, options.timeoutSeconds * 1000);
    }

    // 7. Run Loop
    logger.info(`Starting Sprite agent execution in ${vmName}`);
    const stream = agent.streamingForward(ai, { task: prompt });

    let fullOutput = "";
    for await (const chunk of stream) {
      if (abortController.signal.aborted) throw new Error("Agent aborted");
      if (typeof chunk === "string") {
        process.stdout.write(chunk);
        fullOutput += chunk;
        if (onStdoutChunk) onStdoutChunk(chunk);
      } else if (chunk && typeof chunk === "object") {
        const c = chunk as any;
        if (c.content) {
          process.stdout.write(c.content);
          fullOutput += c.content;
          if (onStdoutChunk) onStdoutChunk(c.content);
        }
        if (c.functionCall && onAgentEvent) {
          onAgentEvent({
            type: "tool_use",
            tool: c.functionCall.name,
            input: c.functionCall.arguments,
          });
        }
      }
    }

    if (timeoutId) clearTimeout(timeoutId);
    return {
      success: true,
      output: fullOutput,
      timedOut: false,
      exitCode: 0,
      completionDetected: true,
    };

  } catch (err: any) {
    if (timeoutId) clearTimeout(timeoutId);
    return {
      success: false,
      output: handleAxAIError(err, logger),
      timedOut: err.message === "Agent aborted",
      exitCode: 1,
      completionDetected: false,
    };
  } finally {
    unregisterSdkController(abortController);
  }
}