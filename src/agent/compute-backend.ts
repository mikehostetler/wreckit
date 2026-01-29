import type { Logger } from "pino";
import type { ComputeConfig, LimitsConfig, AgentConfigUnion } from "../schemas";
import { runAgentUnion } from "./runner";
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
  logger: Logger;
  sessionId?: string;
}

/**
 * Result from agent execution
 */
export interface AgentResult {
  success: boolean;
  error?: string;
  iterations: number;
  duration: number;
  filesModified: string[];
  output: string;
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
    const { itemId, agentConfig, cwd, logger } = options;

    logger.info({ itemId }, "Executing agent in local backend");

    const startTime = Date.now();

    try {
      // Call existing agent runner
      const result = await runAgentUnion({
        itemId,
        config: agentConfig,
        cwd,
        logger,
      });

      return {
        success: result.success,
        iterations: result.iterations || 0,
        duration: (Date.now() - startTime) / 1000,
        filesModified: result.filesModified || [],
        output: result.output || "",
        error: result.error,
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
    } = options;

    logger.info({ itemId, sessionId }, "Executing agent in sprites backend");

    const startTime = Date.now();

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
      // Call sprite runner with session info
      const result = await runSpriteAgent({
        itemId,
        config: {
          ...agentConfig,
          ...this.spritesConfig,
        },
        limits: limitsConfig,
        cwd,
        logger,
        sessionId,
        resumeFromIteration: session?.checkpoint?.iteration,
        vmName: session?.vmName, // Use existing VM if resuming
      });

      // Update session state on success
      if (sessionId) {
        const store = this.getSessionStore(cwd, logger);
        await store.updateState(sessionId, "completed");
      }

      return {
        success: true,
        iterations: result.iterations || 0,
        duration: (Date.now() - startTime) / 1000,
        filesModified: result.filesModified || [],
        output: result.output || "",
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
      throw error;
    }
  }
}

/**
 * Factory function to create a compute backend from config
 */
export function createComputeBackend(config: ComputeConfig): ComputeBackend {
  switch (config.backend) {
    case "local":
      return new LocalBackend();

    case "sprites":
      if (!config.sprites) {
        throw new Error(
          "Sprites backend requires sprites configuration. " +
            'Add "sprites" section to compute config.',
        );
      }
      return new SpritesBackend(config.sprites);

    default:
      throw new Error(`Unknown compute backend: ${config.backend}`);
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
