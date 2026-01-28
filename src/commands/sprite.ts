import type { Logger } from "../logging";
import type { SpriteAgentConfig } from "../schemas";
import { loadConfig } from "../config";
import { findRepoRoot } from "../fs/paths";
import {
  startSprite,
  attachSprite,
  listSprites,
  killSprite,
  execSprite,
  parseWispJson,
} from "../agent/sprite-runner";
import { WispNotFoundError, SpriteExecError } from "../errors";

// ============================================================
// Sprite Command Options
// ============================================================

export interface SpriteStartOptions {
  name: string;
  memory?: string;
  cpus?: string;
  cwd?: string;
  json?: boolean;
}

export interface SpriteListOptions {
  cwd?: string;
  json?: boolean;
}

export interface SpriteKillOptions {
  name: string;
  cwd?: string;
  json?: boolean;
}

export interface SpriteAttachOptions {
  name: string;
  cwd?: string;
  json?: boolean;
}

export interface SpriteExecOptions {
  name: string;
  command: string[];
  cwd?: string;
  json?: boolean;
}

// ============================================================
// Helper Functions
// ============================================================

/**
 * Load and validate the sprite agent configuration.
 */
async function getSpriteConfig(cwd: string): Promise<SpriteAgentConfig> {
  const root = findRepoRoot(cwd);
  const config = await loadConfig(root);

  // Validate that agent.kind is "sprite"
  if (config.agent.kind !== "sprite") {
    throw new Error(
      `Agent kind must be 'sprite' to use Sprite commands. Current kind: '${config.agent.kind}'. ` +
        `Set 'agent.kind: "sprite"' in .wreckit/config.json`,
    );
  }

  return config.agent;
}

/**
 * Output JSON result to stdout.
 */
function outputJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

// ============================================================
// Sprite Commands
// ============================================================

/**
 * Start a new Sprite VM.
 *
 * Usage: wreckit sprite start <name> [--memory <size>] [--cpus <count>] [--json]
 */
export async function spriteStartCommand(
  options: SpriteStartOptions,
  logger: Logger,
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const config = await getSpriteConfig(cwd);

  // Override config with CLI options if provided
  const effectiveConfig: SpriteAgentConfig = {
    ...config,
    ...(options.memory && { defaultMemory: options.memory }),
    ...(options.cpus && { defaultCPUs: options.cpus }),
  };

  logger.debug(`Starting Sprite '${options.name}'...`);

  try {
    const result = await startSprite(options.name, effectiveConfig, logger);

    if (result.success) {
      const outputData = {
        success: true,
        message: `Started Sprite '${options.name}'`,
        data: {
          name: options.name,
          memory: effectiveConfig.defaultMemory,
          cpus: effectiveConfig.defaultCPUs,
          stdout: result.stdout.trim(),
          stderr: result.stderr.trim(),
        },
      };

      if (options.json) {
        outputJson(outputData);
      } else {
        console.log(`✅ ${outputData.message}`);
        if (result.stdout.trim()) {
          console.log(`\nOutput:\n${result.stdout.trim()}`);
        }
      }
    } else {
      const errorData = {
        success: false,
        error: result.stderr || result.error || "Failed to start Sprite",
      };

      if (options.json) {
        outputJson(errorData);
      } else {
        console.error(`❌ ${errorData.error}`);
      }
      process.exit(1);
    }
  } catch (err) {
    if (err instanceof WispNotFoundError) {
      const errorData = {
        success: false,
        error: err.message,
      };

      if (options.json) {
        outputJson(errorData);
      } else {
        console.error(`❌ ${err.message}`);
      }
      process.exit(1);
    }

    throw err;
  }
}

/**
 * List all active Sprite VMs.
 *
 * Usage: wreckit sprite list [--json]
 */
export async function spriteListCommand(
  options: SpriteListOptions,
  logger: Logger,
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const config = await getSpriteConfig(cwd);

  logger.debug("Listing Sprites...");

  try {
    const result = await listSprites(config, logger);

    if (!result.success) {
      const errorData = {
        success: false,
        error: result.stderr || result.error || "Failed to list Sprites",
      };

      if (options.json) {
        outputJson(errorData);
      } else {
        console.error(`❌ ${errorData.error}`);
      }
      process.exit(1);
    }

    const sprites = parseWispJson(result.stdout, logger);
    const spriteList = sprites as Array<{
      id: string;
      name: string;
      state: string;
    } | null> | null;

    if (!Array.isArray(spriteList) || spriteList.length === 0) {
      const outputData = {
        success: true,
        message: "No active Sprites",
        data: {
          sprites: [],
        },
      };

      if (options.json) {
        outputJson(outputData);
      } else {
        console.log("📋 No active Sprites");
      }
    } else {
      const outputData = {
        success: true,
        message: `Active Sprites: ${spriteList.length}`,
        data: {
          sprites: spriteList,
        },
      };

      if (options.json) {
        outputJson(outputData);
      } else {
        console.log(`📋 ${outputData.message}`);
        console.log("");
        spriteList.forEach((sprite, index) => {
          if (sprite) {
            console.log(
              `  ${index + 1}. ${sprite.name || sprite.id} (${sprite.state})`,
            );
          }
        });
      }
    }
  } catch (err) {
    if (err instanceof WispNotFoundError) {
      const errorData = {
        success: false,
        error: err.message,
      };

      if (options.json) {
        outputJson(errorData);
      } else {
        console.error(`❌ ${err.message}`);
      }
      process.exit(1);
    }

    throw err;
  }
}

/**
 * Kill (terminate) a Sprite VM.
 *
 * Usage: wreckit sprite kill <name> [--json]
 */
export async function spriteKillCommand(
  options: SpriteKillOptions,
  logger: Logger,
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const config = await getSpriteConfig(cwd);

  logger.debug(`Killing Sprite '${options.name}'...`);

  try {
    const result = await killSprite(options.name, config, logger);

    if (result.success) {
      const outputData = {
        success: true,
        message: `Killed Sprite '${options.name}'`,
        data: {
          name: options.name,
          stdout: result.stdout.trim(),
          stderr: result.stderr.trim(),
        },
      };

      if (options.json) {
        outputJson(outputData);
      } else {
        console.log(`✅ ${outputData.message}`);
        if (result.stdout.trim()) {
          console.log(`\nOutput:\n${result.stdout.trim()}`);
        }
      }
    } else {
      const errorData = {
        success: false,
        error: result.stderr || result.error || "Failed to kill Sprite",
      };

      if (options.json) {
        outputJson(errorData);
      } else {
        console.error(`❌ ${errorData.error}`);
      }
      process.exit(1);
    }
  } catch (err) {
    if (err instanceof WispNotFoundError) {
      const errorData = {
        success: false,
        error: err.message,
      };

      if (options.json) {
        outputJson(errorData);
      } else {
        console.error(`❌ ${err.message}`);
      }
      process.exit(1);
    }

    throw err;
  }
}

/**
 * Attach to a running Sprite VM.
 *
 * Usage: wreckit sprite attach <name> [--json]
 */
export async function spriteAttachCommand(
  options: SpriteAttachOptions,
  logger: Logger,
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const config = await getSpriteConfig(cwd);

  logger.debug(`Attaching to Sprite '${options.name}'...`);

  try {
    const result = await attachSprite(options.name, config, logger);

    if (result.success) {
      const outputData = {
        success: true,
        message: `Attached to Sprite '${options.name}'`,
        data: {
          name: options.name,
          stdout: result.stdout.trim(),
          stderr: result.stderr.trim(),
        },
      };

      if (options.json) {
        outputJson(outputData);
      } else {
        console.log(`✅ ${outputData.message}`);
        if (result.stdout.trim()) {
          console.log(`\nOutput:\n${result.stdout.trim()}`);
        }
      }
    } else {
      const errorData = {
        success: false,
        error: result.stderr || result.error || "Failed to attach to Sprite",
      };

      if (options.json) {
        outputJson(errorData);
      } else {
        console.error(`❌ ${errorData.error}`);
      }
      process.exit(1);
    }
  } catch (err) {
    if (err instanceof WispNotFoundError) {
      const errorData = {
        success: false,
        error: err.message,
      };

      if (options.json) {
        outputJson(errorData);
      } else {
        console.error(`❌ ${err.message}`);
      }
      process.exit(1);
    }

    throw err;
  }
}

/**
 * Execute a command inside a running Sprite VM.
 *
 * Usage: wreckit sprite exec <name> <command...> [--json]
 *
 * @example
 * ```bash
 * wreckit sprite exec my-vm ls -la
 * wreckit sprite exec my-vm npm install
 * wreckit sprite exec my-vm --json -- npm test
 * ```
 */
export async function spriteExecCommand(
  options: SpriteExecOptions,
  logger: Logger,
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const config = await getSpriteConfig(cwd);

  const commandStr = options.command.join(" ");
  logger.debug(`Executing command in Sprite '${options.name}': ${commandStr}`);

  try {
    const result = await execSprite(
      options.name,
      options.command,
      config,
      logger,
    );

    if (result.success) {
      const outputData = {
        success: true,
        message: `Executed command in Sprite '${options.name}'`,
        data: {
          name: options.name,
          command: options.command,
          exitCode: result.exitCode,
          stdout: result.stdout.trim(),
          stderr: result.stderr.trim(),
        },
      };

      if (options.json) {
        outputJson(outputData);
      } else {
        console.log(`✅ ${outputData.message}`);
        if (result.stdout.trim()) {
          console.log(`\nOutput:\n${result.stdout.trim()}`);
        }
      }
    } else {
      // Command failed (non-zero exit code)
      const errorData = {
        success: false,
        error: result.stderr || result.error || "Command execution failed",
        data: {
          name: options.name,
          command: options.command,
          exitCode: result.exitCode,
          stdout: result.stdout.trim(),
          stderr: result.stderr.trim(),
        },
      };

      if (options.json) {
        outputJson(errorData);
      } else {
        console.error(`❌ Command failed with exit code ${result.exitCode}`);
        if (result.stderr.trim()) {
          console.error(`\nError output:\n${result.stderr.trim()}`);
        }
      }
      process.exit(1);
    }
  } catch (err) {
    if (err instanceof WispNotFoundError) {
      const errorData = {
        success: false,
        error: err.message,
      };

      if (options.json) {
        outputJson(errorData);
      } else {
        console.error(`❌ ${err.message}`);
      }
      process.exit(1);
    }

    if (err instanceof SpriteExecError) {
      const errorData = {
        success: false,
        error: err.message,
      };

      if (options.json) {
        outputJson(errorData);
      } else {
        console.error(`❌ ${err.message}`);
      }
      process.exit(1);
    }

    throw err;
  }
}
