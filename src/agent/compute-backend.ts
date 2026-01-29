import type { Logger } from "../logging";
import type { ComputeConfig, LimitsConfig, AgentConfigUnion } from "../schemas";
import { runAgentUnion, type AgentResult } from "./runner";
import { runSpriteAgent } from "./sprite-runner";
import { SpriteSessionStore } from "./sprite-session-store";

/**
 * Options for executing an agent on a backend
 */
export interface ExecuteAgentOptions {
  itemId: string;
  agentConfig: AgentConfigUnion;
  computeConfig: ComputeConfig;
  limitsConfig?: LimitsConfig;
  cwd: string;
  prompt: string;
  logger: Logger;
  sessionId?: string;
  onStdoutChunk?: (chunk: string) => void;
  onStderrChunk?: (chunk: string) => void;
  onAgentEvent?: (event: import("../tui/agentEvents").AgentEvent) => void;
  mcpServers?: Record<string, unknown>;
  allowedTools?: string[];
  timeoutSeconds?: number;
}

/**
 * Compute backend interface
 * Abstraction for different execution backends (local, sprites, etc.)
 */
export interface ComputeBackend {
  readonly kind: "local" | "sprites";
  executeAgent(options: ExecuteAgentOptions): Promise<AgentResult>;
}

/**
 * Local backend - runs agent on the host machine
 */
export class LocalBackend implements ComputeBackend {
  readonly kind = "local" as const;

  async executeAgent(options: ExecuteAgentOptions): Promise<AgentResult> {
    const { itemId, agentConfig, cwd, logger, prompt } = options;

    logger.info({ itemId }, "Executing agent in local backend");

    try {
      // Call existing agent runner
      const result = await runAgentUnion({
        config: agentConfig,
        cwd,
        prompt,
        logger,
        onStdoutChunk: options.onStdoutChunk,
        onStderrChunk: options.onStderrChunk,
        onAgentEvent: options.onAgentEvent,
        mcpServers: options.mcpServers,
        allowedTools: options.allowedTools,
        timeoutSeconds: options.timeoutSeconds,
        itemId,
      });

      return result;
    } catch (error) {
      logger.error({ error, itemId }, "Local execution failed");
      return {
        success: false,
        output: error instanceof Error ? error.message : String(error),
        timedOut: false,
        exitCode: 1,
        completionDetected: false,
      };
    }
  }
}

/**
 * Sprites backend - runs agent in Fly.io Sprite VM
 */
export class SpritesBackend implements ComputeBackend {
  readonly kind = "sprites" as const;
  private readonly spritesConfig: NonNullable<ComputeConfig["sprites"]>;
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
    const {
      itemId,
      agentConfig,
      limitsConfig,
      cwd,
      logger,
      sessionId,
      prompt,
    } = options;

    logger.info({ itemId, sessionId }, "Executing agent in sprites backend");

    // Load session if resuming
    let session = null;
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
      // Merge agent config with sprites config
      // Note: agentConfig must be kind="sprite" for sprites backend
      const mergedConfig = {
        ...agentConfig,
        ...this.spritesConfig,
      };

      // Call sprite runner with session info
      const result = await runSpriteAgent(mergedConfig, {
        cwd,
        prompt,
        logger,
        onStdoutChunk: options.onStdoutChunk,
        onStderrChunk: options.onStderrChunk,
        onAgentEvent: options.onAgentEvent,
        mcpServers: options.mcpServers,
        allowedTools: options.allowedTools,
        timeoutSeconds: options.timeoutSeconds,
        sessionId,
        resumeFromIteration: session?.checkpoint?.iteration,
        vmName: session?.vmName,
        limits: limitsConfig,
        ephemeral: !session?.vmName, // Ephemeral if no existing VM
        itemId,
      });

      // Update session state on success
      if (sessionId && result.success) {
        const store = this.getSessionStore(cwd, logger);
        await store.updateState(sessionId, "completed");
      }

      return result;
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
        output: error instanceof Error ? error.message : String(error),
        timedOut: false,
        exitCode: 1,
        completionDetected: false,
      };
    }
  }
}

/**
 * Factory function to create a compute backend from config
 */
export function createComputeBackend(config?: ComputeConfig): ComputeBackend {
  // Default to local backend if no config provided
  const backend = config?.backend || "local";

  switch (backend) {
    case "local":
      return new LocalBackend();

    case "sprites":
      if (!config?.sprites) {
        throw new Error(
          "Sprites backend requires sprites configuration. " +
            'Add "sprites" section to compute config.',
        );
      }
      return new SpritesBackend(config.sprites);

    default:
      throw new Error(`Unknown compute backend: ${backend}`);
  }
}

/**
 * Execute an agent on the specified backend
 */
export async function executeAgentOnBackend(
  backend: ComputeBackend,
  options: ExecuteAgentOptions,
): Promise<AgentResult> {
  return backend.executeAgent(options);
}
