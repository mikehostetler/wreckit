import type { Logger } from "../logging";
import type { ComputeConfig, LimitsConfig, AgentConfigUnion } from "../schemas";
import { runAgentUnion } from "./runner";
import { runSpriteAgent } from "./sprite-runner";
import { enforceLimits, LimitsTracker } from "./limits";
import { SpriteSessionStore } from "./sprite-session-store";

export interface ExecuteAgentOptions {
  itemId: string;
  agentConfig: unknown;
  computeConfig: ComputeConfig;
  limitsConfig?: LimitsConfig;
  cwd: string;
  logger: Logger;
  sessionId?: string;
  // Common runner options
  prompt?: string;
  dryRun?: boolean;
  timeoutSeconds?: number;
  onStdoutChunk?: (chunk: string) => void;
  onStderrChunk?: (chunk: string) => void;
  onAgentEvent?: (event: any) => void;
  mcpServers?: Record<string, unknown>;
  allowedTools?: string[];
}

export interface AgentResult {
  success: boolean;
  error?: string;
  iterations: number;
  duration: number;
  filesModified: string[];
  output: string;
}

export interface ComputeBackend {
  readonly kind: "local" | "sprites";
  executeAgent(options: ExecuteAgentOptions): Promise<AgentResult>;
}

export class LocalBackend implements ComputeBackend {
  readonly kind = "local" as const;

  async executeAgent(options: ExecuteAgentOptions): Promise<AgentResult> {
    const { itemId, agentConfig, limitsConfig, cwd, logger } = options;

    logger.debug({ itemId }, "Executing agent in local backend");

    const startTime = Date.now();

    try {
      // Call existing agent runner
      const result = await runAgentUnion({
        config: agentConfig as AgentConfigUnion,
        cwd,
        prompt: options.prompt || "",
        logger,
        dryRun: options.dryRun,
        timeoutSeconds: options.timeoutSeconds,
        onStdoutChunk: options.onStdoutChunk,
        onStderrChunk: options.onStderrChunk,
        onAgentEvent: options.onAgentEvent,
        mcpServers: options.mcpServers,
        allowedTools: options.allowedTools,
        itemId: options.itemId,
        limits: limitsConfig, // Pass limitsConfig to runAgentUnion
      });

      return {
        success: result.success,
        iterations: (result as any).iterations || 0,
        duration: (Date.now() - startTime) / 1000,
        filesModified: (result as any).filesModified || [],
        output: result.output || "",
        error: result.success ? undefined : result.output,
      };
    } catch (error) {
      logger.error({ error, itemId }, "Local execution failed");
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        iterations: 0,
        duration: (Date.now() - startTime) / 1000,
        filesModified: [],
        output: "",
      };
    }
  }
}

export class SpritesBackend implements ComputeBackend {
  readonly kind = "sprites" as const;
  private spritesConfig: NonNullable<ComputeConfig["sprites"]>;
  private sessionStore: SpriteSessionStore | null = null;

  constructor(spritesConfig?: NonNullable<ComputeConfig["sprites"]>) {
    this.spritesConfig = spritesConfig || {};
  }

  private getSessionStore(cwd: string, logger: Logger): SpriteSessionStore {
    if (!this.sessionStore) {
      this.sessionStore = new SpriteSessionStore(cwd, logger);
    }
    return this.sessionStore;
  }

  async executeAgent(options: ExecuteAgentOptions): Promise<AgentResult> {
    const { itemId, agentConfig, limitsConfig, cwd, logger, sessionId } = options;

    logger.debug({ itemId, sessionId }, "Executing agent in sprites backend");

    const startTime = Date.now();

    // Load session if resuming
    let session = null;
    let vmName = this.spritesConfig.vmName;

    if (sessionId) {
      const store = this.getSessionStore(cwd, logger);
      session = await store.load(sessionId);

      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      if (session.state !== "paused") {
        throw new Error(
          `Cannot resume session in state: ${session.state}. ` +
            `Only paused sessions can be resumed.`,
        );
      }

      // Mark session as running
      await store.updateState(sessionId, "running");
      vmName = session.vmName;

      logger.info(
        {
          sessionId,
          vmName: session.vmName,
          iteration: session.checkpoint?.iteration,
        },
        "Resuming session",
      );
    }

    try {
      // Call sprite runner with limits and session info
      const result = await runSpriteAgent({
        itemId,
        config: {
          ...(agentConfig as any),
          ...this.spritesConfig,
          vmName, // Use session VM if resuming
        },
        limits: limitsConfig,
        cwd,
        logger,
        prompt: options.prompt || "",
        dryRun: options.dryRun,
        timeoutSeconds: options.timeoutSeconds,
        onStdoutChunk: options.onStdoutChunk,
        onStderrChunk: options.onStderrChunk,
        onAgentEvent: options.onAgentEvent,
        mcpServers: options.mcpServers,
        allowedTools: options.allowedTools,
        sessionId,
        ephemeral: !vmName, // Ephemeral if no vmName specified/loaded
        resumeFromIteration: session?.checkpoint?.iteration,
      });

      // Update session state on success
      if (sessionId) {
        const store = this.getSessionStore(cwd, logger);
        await store.updateState(sessionId, "completed");
      }

      return {
        success: result.success,
        iterations: 0, // Sprite runner handles tracking internally
        duration: (Date.now() - startTime) / 1000,
        filesModified: [], // Files synced back
        output: result.output,
        error: result.success ? undefined : result.output,
      };
    } catch (error) {
      // Update session state on error
      if (sessionId) {
        const store = this.getSessionStore(cwd, logger);
        await store.updateState(sessionId, "failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      logger.error({ error, itemId }, "Sprites execution failed");
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        iterations: 0,
        duration: (Date.now() - startTime) / 1000,
        filesModified: [],
        output: "",
      };
    }
  }
}

export function createComputeBackend(config?: ComputeConfig): ComputeBackend {
  if (!config) {
    return new LocalBackend();
  }

  switch (config.backend) {
    case "local":
      return new LocalBackend();

    case "sprites":
      if (!config.sprites) {
        throw new Error(
          "Sprites backend requires sprites configuration. " +
            "Add 'sprites' section to compute config.",
        );
      }
      return new SpritesBackend(config.sprites);

    default:
      // Fallback to local
      return new LocalBackend();
  }
}

export async function executeAgentOnBackend(
  backend: ComputeBackend,
  options: ExecuteAgentOptions,
): Promise<AgentResult> {
  return backend.executeAgent(options);
}