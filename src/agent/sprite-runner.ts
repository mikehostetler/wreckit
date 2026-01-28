import { spawn, type ChildProcess } from "node:child_process";
import type { Logger } from "../logging";
import type { SpriteAgentConfig } from "../schemas";
import type { AgentResult } from "./runner";
import {
  WispNotFoundError,
  SpriteStartError,
  SpriteAttachError,
  SpriteKillError,
  SpriteExecError,
} from "../errors";

// ============================================================
// Sprite Runner - Sprites.dev CLI Wrapper
// ============================================================
// This module handles execution of Sprites.dev CLI commands for managing
// Firecracker microVMs (Sprites). It shells out to the 'sprite' binary
// rather than reimplementing Go logic in TypeScript.
//
// Commands:
// - create: Start a new Sprite VM
// - console: Attach to a running Sprite
// - list: List all active Sprites
// - delete: Terminate a Sprite
// - exec: Execute a command inside a running Sprite

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

/**
 * Run a Wisp CLI command with proper error handling and timeout enforcement.
 *
 * This is the core primitive that all Sprite operations build on. It spawns
 * the wisp binary, captures stdout/stderr, enforces timeouts, and handles
 * the SIGTERM→SIGKILL escalation pattern.
 *
 * @param args - Arguments to pass to wisp (e.g., ['start', 'my-vm'])
 * @param options - Wisp command options (wispPath, logger, timeout)
 * @returns Promise<WispResult> with command output and exit status
 *
 * @example
 * ```typescript
 * const result = await runWispCommand(['list', '--json'], { wispPath: 'wisp', logger: console });
 * if (result.success) {
 *   const sprites = JSON.parse(result.stdout);
 * }
 * ```
 */
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
      // Handle ENOENT (sprite/wisp binary not found)
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        logger.error(`Sprite CLI not found at: ${wispPath}`);
        resolve({
          success: false,
          stdout: "",
          stderr: "",
          exitCode: null,
          error: `Sprite CLI not found at '${wispPath}'. Install Sprite to enable Sprite support.`,
        });
        return;
      }

      // Handle other spawn errors
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

    // Enforce timeout with SIGTERM→SIGKILL escalation
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

    // Capture stdout
    child.stdout?.on("data", (data: Buffer) => {
      const chunk = data.toString();
      stdout += chunk;
      if (onStdoutChunk) {
        onStdoutChunk(chunk);
      }
    });

    // Capture stderr
    child.stderr?.on("data", (data: Buffer) => {
      const chunk = data.toString();
      stderr += chunk;
      if (onStderrChunk) {
        onStderrChunk(chunk);
      }
    });

    // Handle process errors
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

    // Handle process exit
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

/**
 * Parse JSON output from Wisp, handling potential non-JSON output.
 *
 * Wisp commands may output human-readable text mixed with JSON, or may
 * fail before outputting valid JSON. This function extracts and parses
 * JSON from the output, with robust error handling.
 *
 * @param output - Raw stdout from Wisp command
 * @param logger - Logger for debug output
 * @returns Parsed JSON object or null if parsing fails
 */
export function parseWispJson(output: string, logger: Logger): unknown | null {
  if (!output || output.trim().length === 0) {
    return null;
  }

  // Try to parse the entire output as JSON first
  try {
    return JSON.parse(output);
  } catch {
    // If that fails, try to extract JSON from the output
    // Look for JSON objects between {...} or [...]
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

/**
 * Start a new Sprite VM using `sprite create` command.
 *
 * @param name - Name/ID for the Sprite
 * @param config - Sprite agent configuration
 * @param logger - Logger instance
 * @returns Promise<WispResult> with startup result
 */
export async function startSprite(
  name: string,
  config: SpriteAgentConfig,
  logger: Logger,
): Promise<WispResult> {
  const args = ["create", name];

  // Add optional resource parameters
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

  // Handle Sprite not found error
  if (result.error?.includes("not found")) {
    throw new WispNotFoundError(config.wispPath);
  }

  // Handle other start failures
  if (!result.success) {
    throw new SpriteStartError(
      name,
      result.stderr || result.error || "Unknown error",
    );
  }

  return result;
}

/**
 * Attach to a running Sprite VM using `sprite console` command.
 *
 * @param name - Name/ID of the Sprite to attach to
 * @param config - Sprite agent configuration
 * @param logger - Logger instance
 * @returns Promise<WispResult> with attach result
 */
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

  // Handle Sprite not found error
  if (result.error?.includes("not found")) {
    throw new WispNotFoundError(config.wispPath);
  }

  // Handle other attach failures
  if (!result.success) {
    throw new SpriteAttachError(
      name,
      result.stderr || result.error || "Unknown error",
    );
  }

  return result;
}

/**
 * List all active Sprites.
 *
 * @param config - Sprite agent configuration
 * @param logger - Logger instance
 * @returns Promise<WispResult> with list of Sprites (JSON format)
 */
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

  // Handle Sprite not found error
  if (result.error?.includes("not found")) {
    throw new WispNotFoundError(config.wispPath);
  }

  // Note: We don't throw for list failures - return the error result
  // so callers can handle empty lists gracefully
  return result;
}

/**
 * Kill (terminate) a running Sprite VM using `sprite delete` command.
 *
 * @param name - Name/ID of the Sprite to kill
 * @param config - Sprite agent configuration
 * @param logger - Logger instance
 * @returns Promise<WispResult> with kill result
 */
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

  // Handle Sprite not found error
  if (result.error?.includes("not found")) {
    throw new WispNotFoundError(config.wispPath);
  }

  // Handle other kill failures
  if (!result.success) {
    throw new SpriteKillError(
      name,
      result.stderr || result.error || "Unknown error",
    );
  }

  return result;
}

/**
 * Execute a command inside a running Sprite VM using `sprite exec` command.
 *
 * @param name - Name/ID of the Sprite to execute command in
 * @param command - Command and arguments to execute (e.g., ['npm', 'install'])
 * @param config - Sprite agent configuration
 * @param logger - Logger instance
 * @param options - Optional streaming callbacks for stdout/stderr
 * @returns Promise<WispResult> with execution result (includes exit code)
 *
 * @example
 * ```typescript
 * const result = await execSprite(
 *   'my-vm',
 *   ['ls', '-la'],
 *   config,
 *   logger
 * );
 * if (result.success) {
 *   console.log(`Output: ${result.stdout}`);
 * } else {
 *   console.error(`Command failed with exit code ${result.exitCode}`);
 * }
 * ```
 */
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

  // Handle Sprite binary not found error
  if (result.error?.includes("not found")) {
    throw new WispNotFoundError(config.wispPath);
  }

  // Handle subprocess errors (spawn failure, timeout) - throw for these
  // Note: We do NOT throw for command failures (non-zero exit code)
  // Command failures return success=false with the exit code in the result
  if (result.error && !result.exitCode) {
    // Only throw if there's an error but no exit code (subprocess failure)
    throw new SpriteExecError(
      name,
      result.stderr || result.error || "Command execution failed",
    );
  }

  return result;
}

// ============================================================
// Sprite Agent Runner (US-073-005)
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
}

/**
 * Run a Sprite agent.
 *
 * This is a minimal implementation that satisfies the agent runner interface.
 * For now, it verifies Wisp connectivity by listing Sprites. Full agent
 * execution inside Sprites (file mounting, code transfer, etc.) is deferred
 * to a follow-up item.
 *
 * @param config - Sprite agent configuration
 * @param options - Agent execution options
 * @returns Promise<AgentResult> with execution result
 */
export async function runSpriteAgent(
  config: SpriteAgentConfig,
  options: SpriteRunAgentOptions,
): Promise<AgentResult> {
  const { logger, dryRun = false, mockAgent = false, cwd, prompt } = options;

  // Handle dry-run mode
  if (dryRun) {
    logger.info(`[dry-run] Would run Sprite agent`);
    logger.info(`[dry-run] Wisp path: ${config.wispPath}`);
    logger.info(`[dry-run] Working directory: ${cwd}`);
    logger.info(`[dry-run] Prompt length: ${prompt.length} characters`);
    return {
      success: true,
      output: "[dry-run] No output",
      timedOut: false,
      exitCode: 0,
      completionDetected: true,
    };
  }

  // Handle mock-agent mode
  if (mockAgent) {
    logger.info(`[mock-agent] Simulating Sprite agent run...`);
    const completionSignal = "<promise>COMPLETE</promise>";
    const mockLines = [
      `🤖 [mock-agent] Starting simulated Sprite agent run...`,
      `📋 [mock-agent] Wisp path: ${config.wispPath}`,
      `🔍 [mock-agent] Verifying Wisp connectivity...`,
      `✅ [mock-agent] Wisp is accessible`,
      `📦 [mock-agent] Full agent execution in Sprites is not yet implemented`,
      completionSignal,
    ];
    let output = "";
    for (const line of mockLines) {
      const chunk = line + "\n";
      output += chunk;
      if (options.onStdoutChunk) {
        options.onStdoutChunk(chunk);
      }
    }
    return {
      success: true,
      output,
      timedOut: false,
      exitCode: 0,
      completionDetected: true,
    };
  }

  // Normal mode: Verify Wisp connectivity by listing Sprites
  logger.info(`Verifying Wisp connectivity...`);

  try {
    const result = await listSprites(config, logger);

    if (!result.success) {
      logger.error(
        `Wisp connectivity check failed: ${result.stderr || result.error}`,
      );
      return {
        success: false,
        output:
          result.stderr || result.error || "Wisp connectivity check failed",
        timedOut: false,
        exitCode: result.exitCode,
        completionDetected: false,
      };
    }

    const sprites = parseWispJson(result.stdout, logger);
    const spriteList = sprites as WispSpriteInfo[] | null;
    const spriteCount = Array.isArray(spriteList) ? spriteList.length : 0;

    logger.info(`Wisp is accessible. Active Sprites: ${spriteCount}`);

    const output = [
      `✅ Wisp connectivity verified`,
      `📋 Active Sprites: ${spriteCount}`,
      ``,
      `Note: Full agent execution inside Sprites is not yet implemented.`,
      `This is a placeholder that verifies Wisp connectivity.`,
      ``,
      `Use the CLI commands to manage Sprites manually:`,
      `  wreckit sprite start <name>  - Start a new Sprite`,
      `  wreckit sprite list           - List active Sprites`,
      `  wreckit sprite attach <name>  - Attach to a running Sprite`,
      `  wreckit sprite kill <name>    - Terminate a Sprite`,
    ].join("\n");

    return {
      success: true,
      output,
      timedOut: false,
      exitCode: 0,
      completionDetected: true,
    };
  } catch (err) {
    if (err instanceof WispNotFoundError) {
      logger.error(err.message);
      return {
        success: false,
        output: err.message,
        timedOut: false,
        exitCode: 1,
        completionDetected: false,
      };
    }

    logger.error(`Sprite agent failed: ${err}`);
    return {
      success: false,
      output: `Sprite agent failed: ${err}`,
      timedOut: false,
      exitCode: 1,
      completionDetected: false,
    };
  }
}
