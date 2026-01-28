import { spawn, type ChildProcess } from "node:child_process";
import type { Logger } from "../logging";
import type { SpriteAgentConfig } from "../schemas";
import {
  WispNotFoundError,
  SpriteStartError,
  SpriteAttachError,
  SpriteKillError,
  SpriteExecError,
} from "../errors";

// ============================================================
// Sprite Runner - Sprites.dev CLI Wrapper (Core)
// ============================================================

/**
 * Result from running a Wisp command.
 */
export interface WispResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  error?: string;
}

/**
 * Configuration for running Sprite/Wisp commands.
 */
export interface WispCommandOptions {
  /** Path to sprite/wisp CLI binary (default: 'sprite') */
  wispPath: string;
  /** Logger instance for debug/error output */
  logger: Logger;
  /** Timeout in seconds (default: 300 = 5 minutes) */
  timeout?: number;
  /** Optional callback for stdout chunks */
  onStdoutChunk?: (chunk: string) => void;
  /** Optional callback for stderr chunks */
  onStderrChunk?: (chunk: string) => void;
  /** Optional authentication token for Sprites.dev */
  token?: string;
}

/**
 * Parsed JSON output from Wisp commands.
 */
export interface WispSpriteInfo {
  id: string;
  name: string;
  state: "running" | "stopped" | "error";
  pid?: number;
  address?: string; // Connection address for attach
  [key: string]: unknown; // Allow additional fields
}

export async function runWispCommand(
  args: string[],
  options: WispCommandOptions,
): Promise<WispResult> {
  const {
    wispPath,
    logger,
    timeout = 300,
    onStdoutChunk,
    onStderrChunk,
    token,
  } = options;

  // Build environment with token if provided
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }
  if (token) {
    env.SPRITES_TOKEN = token;
    logger.debug(`SPRITES_TOKEN: present (redacted)`);
  }

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let child: ChildProcess;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      child = spawn(wispPath, args, {
        stdio: ["pipe", "pipe", "pipe"],
        env,
      });
      if (!child) {
        throw new Error("spawn returned undefined");
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        logger.error(`Sprite CLI not found at: ${wispPath}`);
        resolve({
          success: false,
          stdout: "",
          stderr: "",
          exitCode: null,
          error: `Sprite CLI not found at '${wispPath}'.

To enable Sprite support:
1. Install the Sprite CLI from https://sprites.dev
2. Or run: npm install -g @sprites-dev/cli
3. If installed elsewhere, set wispPath in config.json

Sandbox mode (--sandbox) requires Sprite CLI to be installed.`,
        });
        return;
      }

      logger.error(`Failed to spawn sprite process: ${err}`);
      resolve({
        success: false,
        stdout: "",
        stderr: "",
        exitCode: null,
        error: `Failed to spawn sprite: ${err}`,
      });
      return;
    }

    if (timeout > 0) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        logger.warn(`Sprite command timed out after ${timeout} seconds`);
        try {
          child.kill("SIGTERM");
        } catch {
          // ignore
        }
        setTimeout(() => {
          if (!child.killed) {
            try {
              child.kill("SIGKILL");
            } catch {
              // ignore
            }
          }
        }, 5000);
      }, timeout * 1000);
    }

    child.stdout?.on("data", (data: Buffer) => {
      const chunk = data.toString();
      stdout += chunk;
      if (onStdoutChunk) {
        onStdoutChunk(chunk);
      }
    });

    child.stderr?.on("data", (data: Buffer) => {
      const chunk = data.toString();
      stderr += chunk;
      if (onStderrChunk) {
        onStderrChunk(chunk);
      }
    });

    child.on("error", (err) => {
      if (timeoutId) clearTimeout(timeoutId);
      logger.error(`Sprite process error: ${err}`);
      resolve({
        success: false,
        stdout,
        stderr,
        exitCode: null,
        error: `Process error: ${err}`,
      });
    });

    child.on("close", (code) => {
      if (timeoutId) clearTimeout(timeoutId);
      const success = code === 0 && !timedOut;
      logger.debug(`Sprite exited with code ${code}`);

      resolve({
        success,
        stdout,
        stderr,
        exitCode: code,
        error: timedOut
          ? `Command timed out after ${timeout} seconds`
          : undefined,
      });
    });
  });
}

export function parseWispJson(output: string, logger: Logger): unknown | null {
  if (!output || output.trim().length === 0) {
    return null;
  }
  try {
    return JSON.parse(output);
  } catch {
    const jsonMatch = output.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (err) {
        logger.debug(`Failed to parse extracted JSON: ${err}`);
      }
    }
    logger.debug(`No valid JSON found in Wisp output`);
    return null;
  }
}

export async function startSprite(
  name: string,
  config: SpriteAgentConfig,
  logger: Logger,
): Promise<WispResult> {
  const args = ["create", name];
  if (config.defaultMemory) {
    args.push("--memory", config.defaultMemory);
  }
  if (config.defaultCPUs) {
    args.push("--cpus", config.defaultCPUs);
  }

  logger.debug(`Starting Sprite: ${config.wispPath} ${args.join(" ")}`);

  const result = await runWispCommand(args, {
    wispPath: config.wispPath,
    logger,
    timeout: config.timeout,
    token: config.token,
  });

  if (result.error?.includes("not found")) {
    throw new WispNotFoundError(config.wispPath);
  }

  if (!result.success) {
    throw new SpriteStartError(
      name,
      result.stderr || result.error || "Unknown error",
    );
  }

  return result;
}

export async function attachSprite(
  name: string,
  config: SpriteAgentConfig,
  logger: Logger,
): Promise<WispResult> {
  const args = ["console", name];
  logger.debug(`Attaching to Sprite: ${config.wispPath} ${args.join(" ")}`);
  const result = await runWispCommand(args, {
    wispPath: config.wispPath,
    logger,
    timeout: config.timeout,
    token: config.token,
  });
  if (result.error?.includes("not found")) {
    throw new WispNotFoundError(config.wispPath);
  }
  if (!result.success) {
    throw new SpriteAttachError(
      name,
      result.stderr || result.error || "Unknown error",
    );
  }
  return result;
}

export async function listSprites(
  config: SpriteAgentConfig,
  logger: Logger,
): Promise<WispResult> {
  const args = ["list", "--json"];
  logger.debug(`Listing Sprites: ${config.wispPath} ${args.join(" ")}`);
  const result = await runWispCommand(args, {
    wispPath: config.wispPath,
    logger,
    timeout: config.timeout,
    token: config.token,
  });
  if (result.error?.includes("not found")) {
    throw new WispNotFoundError(config.wispPath);
  }
  return result;
}

export async function killSprite(
  name: string,
  config: SpriteAgentConfig,
  logger: Logger,
): Promise<WispResult> {
  const args = ["delete", name];
  logger.debug(`Killing Sprite: ${config.wispPath} ${args.join(" ")}`);
  const result = await runWispCommand(args, {
    wispPath: config.wispPath,
    logger,
    timeout: config.timeout,
    token: config.token,
  });
  if (result.error?.includes("not found")) {
    throw new WispNotFoundError(config.wispPath);
  }
  if (!result.success) {
    throw new SpriteKillError(
      name,
      result.stderr || result.error || "Unknown error",
    );
  }
  return result;
}

export async function execSprite(
  name: string,
  command: string[],
  config: SpriteAgentConfig,
  logger: Logger,
  options?: {
    onStdoutChunk?: (chunk: string) => void;
    onStderrChunk?: (chunk: string) => void;
  },
): Promise<WispResult> {
  const args = ["exec", name, ...command];
  logger.debug(`Executing in Sprite: ${config.wispPath} ${args.join(" ")}`);
  const result = await runWispCommand(args, {
    wispPath: config.wispPath,
    logger,
    timeout: config.timeout,
    token: config.token,
    onStdoutChunk: options?.onStdoutChunk,
    onStderrChunk: options?.onStderrChunk,
  });
  if (result.error?.includes("not found")) {
    throw new WispNotFoundError(config.wispPath);
  }
  if (result.error && !result.exitCode) {
    throw new SpriteExecError(
      name,
      result.stderr || result.error || "Command execution failed",
    );
  }
  return result;
}
