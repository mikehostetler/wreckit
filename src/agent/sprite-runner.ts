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
// Sprite Agent Runner (US-073-005 & US-076-003)
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
  // Check if VM already exists
  const listResult = await listSprites(config, logger);
  const sprites = parseWispJson(listResult.stdout, logger) as WispSpriteInfo[];
  
  // If list fails or returns null, we can't be sure. Assume not running.
  const exists = Array.isArray(sprites) && sprites.some(s => s.name === name && s.state === "running");

  if (exists) {
    logger.debug(`Sprite VM '${name}' is already running`);
    return true;
  }

  // Start new VM
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

/**
 * Run a Sprite agent.
 *
 * Executes the agent loop using remote tools proxied to the Sprite VM.
 */
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
    // 1. Initialize or connect to Sprite VM
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

    // 2. Build Environment (API Keys)
    // We assume the user configures AI provider keys in their local env or config
    // The agent runs locally, tools run remotely.
    const env = await buildAxAIEnv({ cwd, logger, provider: "anthropic" }); // Defaulting to anthropic for now if not in config

    // 3. Initialize AI Service
    // TODO: Support provider selection from config. For now use Anthropic as default or what's in env.
    // Ideally config.aiProvider should exist on SpriteAgentConfig or we assume standard keys.
    let ai: AxAIService;
    
    // Auto-detect provider based on keys
    if (env.ANTHROPIC_API_KEY) {
       ai = new AxAIAnthropic({
        apiKey: env.ANTHROPIC_API_KEY,
        apiURL: env.ANTHROPIC_BASE_URL,
        config: { maxRetries: 3 },
      });
    } else if (env.OPENAI_API_KEY) {
      ai = new AxAIOpenAI({
        apiKey: env.OPENAI_API_KEY,
        config: { maxRetries: 3 },
      });
    } else if (env.GOOGLE_API_KEY) {
      ai = new AxAIGoogleGemini({
        apiKey: env.GOOGLE_API_KEY,
        config: { maxRetries: 3 },
      });
    } else {
       // Default fallback
       throw new Error("No AI API key found (ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY)");
    }

    // 4. Build Tools (Remote)
    const remoteTools = buildRemoteToolRegistry(vmName, config, logger, options.allowedTools);
    
    // Add MCP tools if any (these run locally on host, be careful!)
    let mcpTools: AxFunction[] = [];
    if (options.mcpServers) {
      mcpTools = adaptMcpServersToAxTools(options.mcpServers, options.allowedTools);
    }
    
    const tools = [...remoteTools, ...mcpTools];
    logger.debug(`Loaded ${tools.length} tools for Sprite agent`);

    // 5. Initialize Agent
    const agent = new AxAgent({
      ai,
      name: "Sprite Agent",
      description: `You are an expert software engineer working inside a sandboxed Linux microVM.
      You have access to standard tools (Bash, Read, Write) which execute INSIDE the VM.
      The VM starts empty. You may need to install tools or clone repositories first.
      `,
      signature: "task:string -> answer:string",
      functions: tools,
    });

    // 6. Setup Timeout
    if (options.timeoutSeconds && options.timeoutSeconds > 0) {
      timeoutId = setTimeout(() => {
        abortController.abort();
        logger.warn(`Agent timed out after ${options.timeoutSeconds}s`);
      }, options.timeoutSeconds * 1000);
    }

    // 7. Run Agent Loop
    logger.info(`Starting Sprite agent execution in ${vmName}`);
    
    let fullOutput = "";
    // Pass the user's prompt directly as the task
    const stream = agent.streamingForward(ai, { task: prompt });

    for await (const chunk of stream) {
      if (abortController.signal.aborted) {
        throw new Error("Agent aborted");
      }

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
    const errorOutput = handleAxAIError(err, logger);
    
    return {
      success: false,
      output: errorOutput,
      timedOut: err.message === "Agent aborted",
      exitCode: 1,
      completionDetected: false,
    };
  } finally {
    unregisterSdkController(abortController);
  }
}
