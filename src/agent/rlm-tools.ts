import * as fs from "node:fs/promises";
import * as path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import * as vm from "node:vm";
import type { AxFunction, AxFunctionJSONSchema } from "@ax-llm/ax";

const execAsync = promisify(exec);

export type ToolRegistry = Record<string, AxFunction>;

export class JSRuntime {
  private context: vm.Context;

  constructor(initialContext: Record<string, any> = {}) {
    this.context = vm.createContext({
      console: {
        log: (...args: any[]) => this.log("log", ...args),
        error: (...args: any[]) => this.log("error", ...args),
        warn: (...args: any[]) => this.log("warn", ...args),
      },
      ...initialContext,
    });
  }

  private logs: string[] = [];

  private log(level: string, ...args: any[]) {
    this.logs.push(
      `[${level}] ${args
        .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
        .join(" ")}`,
    );
  }

  run(code: string): string {
    this.logs = [];
    try {
      const result = vm.runInContext(code, this.context);
      const output = this.logs.join("\n");
      return output ? `${output}\nResult: ${String(result)}` : String(result);
    } catch (error: any) {
      return `Runtime Error: ${error.message}`;
    }
  }
}

// Tool factory to create a RunJS tool bound to a specific runtime instance
export function createRunJSTool(runtime: JSRuntime): AxFunction {
  return {
    name: "RunJS",
    description:
      "Execute JavaScript code to process data. Access the global variable 'CONTEXT_DATA' to see the user's input.",
    parameters: {
      type: "object",
      properties: {
        code: { type: "string", description: "JavaScript code to execute" },
      },
      required: ["code"],
    } as AxFunctionJSONSchema,
    func: async ({ code }: { code: string }) => {
      return runtime.run(code);
    },
  };
}

const ReadTool: AxFunction = {
  name: "Read",
  description: "Read the contents of a file. Returns the content as a string.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "The path to the file to read" },
    },
    required: ["path"],
  } as AxFunctionJSONSchema,
  func: async ({ path: filePath }: { path: string }) => {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      return content;
    } catch (error: any) {
      return `Error reading file ${filePath}: ${error.message}`;
    }
  },
};

const WriteTool: AxFunction = {
  name: "Write",
  description:
    "Write content to a file. Creates parent directories if they don't exist.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "The path to the file to write" },
      content: { type: "string", description: "The content to write" },
    },
    required: ["path", "content"],
  } as AxFunctionJSONSchema,
  func: async ({
    path: filePath,
    content,
  }: {
    path: string;
    content: string;
  }) => {
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, "utf-8");
      return `Successfully wrote to ${filePath}`;
    } catch (error: any) {
      return `Error writing file ${filePath}: ${error.message}`;
    }
  },
};

const EditTool: AxFunction = {
  name: "Edit",
  description:
    "Edit a file by replacing a string with a new string. Returns success message or error.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "The path to the file to edit" },
      oldText: { type: "string", description: "The exact text to replace" },
      newText: { type: "string", description: "The new text to insert" },
    },
    required: ["path", "oldText", "newText"],
  } as AxFunctionJSONSchema,
  func: async ({
    path: filePath,
    oldText,
    newText,
  }: {
    path: string;
    oldText: string;
    newText: string;
  }) => {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      if (!content.includes(oldText)) {
        return `Error: oldText not found in ${filePath}`;
      }
      const newContent = content.replace(oldText, newText);
      await fs.writeFile(filePath, newContent, "utf-8");
      return `Successfully edited ${filePath}`;
    } catch (error: any) {
      return `Error editing file ${filePath}: ${error.message}`;
    }
  },
};

const GlobTool: AxFunction = {
  name: "Glob",
  description: "Find files matching a glob pattern.",
  parameters: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: "The glob pattern (e.g., '**/*.ts')",
      },
      path: {
        type: "string",
        description: "The directory to search in (default: current directory)",
      },
    },
    required: ["pattern"],
  } as AxFunctionJSONSchema,
  func: async ({
    pattern,
    path: searchPath,
  }: {
    pattern: string;
    path?: string;
  }) => {
    try {
      // Using 'find' as a fallback since fast-glob might not be available
      // Note: This is a simplified implementation and might not support all glob features
      const dir = searchPath || ".";
      const { stdout } = await execAsync(`find ${dir} -name "${pattern}"`);
      return stdout.trim();
    } catch (error: any) {
      return `Error finding files: ${error.message}`;
    }
  },
};

const GrepTool: AxFunction = {
  name: "Grep",
  description: "Search for a string in files.",
  parameters: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: "The regex pattern to search for",
      },
      path: {
        type: "string",
        description: "The directory to search in (default: current directory)",
      },
      include: {
        type: "string",
        description: "File pattern to include (e.g., '*.ts')",
      },
    },
    required: ["pattern"],
  } as AxFunctionJSONSchema,
  func: async ({
    pattern,
    path: searchPath,
    include,
  }: {
    pattern: string;
    path?: string;
    include?: string;
  }) => {
    try {
      const dir = searchPath || ".";
      const includeFlag = include ? `--include=\"${include}\"` : "";
      const { stdout } = await execAsync(
        `grep -r ${includeFlag} "${pattern}" ${dir}`,
      );
      return stdout.trim() || "No matches found";
    } catch (error: any) {
      // grep returns exit code 1 if no matches found, which execAsync throws as error
      if (error.code === 1) return "No matches found";
      return `Error searching files: ${error.message}`;
    }
  },
};

const BashTool: AxFunction = {
  name: "Bash",
  description: "Execute a bash command.",
  parameters: {
    type: "object",
    properties: {
      command: { type: "string", description: "The command to execute" },
    },
    required: ["command"],
  } as AxFunctionJSONSchema,
  func: async ({ command }: { command: string }) => {
    try {
      const { stdout, stderr } = await execAsync(command);
      return `Stdout:\n${stdout}\nStderr:\n${stderr}`;
    } catch (error: any) {
      return `Error executing command: ${error.message}\nStderr:\n${error.stderr}`;
    }
  },
};

// ============================================================================
// Sprite Management Tools (US-073-007)
// ============================================================================

/**
 * Default Sprite agent configuration for RLM tools.
 * In a future enhancement, this could be configurable via environment or RLM runner options.
 */
const DEFAULT_SPRITE_CONFIG = {
  kind: "sprite" as const,
  wispPath: "sprite",
  maxVMs: 5,
  defaultMemory: "512MiB",
  defaultCPUs: "1",
  timeout: 300,
  token: process.env.SPRITES_TOKEN,
  syncEnabled: true,
  syncExcludePatterns: [".git", "node_modules"],
  syncOnSuccess: false,
};

/**
 * Simple logger for Sprite tools.
 */
const spriteLogger: {
  debug: (msg: string, ...args: unknown[]) => void;
  info: (msg: string, ...args: unknown[]) => void;
  warn: (msg: string, ...args: unknown[]) => void;
  error: (msg: string, ...args: unknown[]) => void;
  json: (data: unknown) => void;
} = {
  debug: (msg: string, ...args: unknown[]) =>
    console.debug(`[Sprite] ${msg}`, ...args),
  info: (msg: string, ...args: unknown[]) =>
    console.info(`[Sprite] ${msg}`, ...args),
  warn: (msg: string, ...args: unknown[]) =>
    console.warn(`[Sprite] ${msg}`, ...args),
  error: (msg: string, ...args: unknown[]) =>
    console.error(`[Sprite] ${msg}`, ...args),
  json: (data: unknown) => console.log(JSON.stringify(data, null, 2)),
};

/**
 * SpawnSpriteTool - Start a new Sprite VM.
 *
 * This tool allows RLM agents to create isolated Firecracker microVMs
 * for secure, sandboxed execution environments.
 */
const SpawnSpriteTool: AxFunction = {
  name: "SpawnSprite",
  description:
    "Start a new Sprite VM (Firecracker microVM) for isolated, sandboxed execution. Returns connection info for the new VM.",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Name/ID for the Sprite VM (e.g., 'agent-session-1')",
      },
      memory: {
        type: "string",
        description:
          "Memory allocation for the VM (e.g., '512MiB', '1GiB'). Default: '512MiB'",
      },
      cpus: {
        type: "string",
        description: "CPU allocation for the VM (e.g., '1', '2'). Default: '1'",
      },
    },
    required: ["name"],
  } as AxFunctionJSONSchema,
  func: async ({
    name,
    memory,
    cpus,
  }: {
    name: string;
    memory?: string;
    cpus?: string;
  }) => {
    try {
      // Dynamic import to avoid circular dependency
      const { startSprite } = await import("./sprite-runner.js");

      const config = {
        ...DEFAULT_SPRITE_CONFIG,
        ...(memory && { defaultMemory: memory }),
        ...(cpus && { defaultCPUs: cpus }),
      };

      const result = await startSprite(name, config, spriteLogger);

      if (result.success) {
        return JSON.stringify(
          {
            success: true,
            message: `Started Sprite '${name}'`,
            data: {
              name,
              stdout: result.stdout,
              stderr: result.stderr,
            },
          },
          null,
          2,
        );
      } else {
        return JSON.stringify(
          {
            success: false,
            error: result.stderr || result.error || "Failed to start Sprite",
          },
          null,
          2,
        );
      }
    } catch (error: any) {
      // Catch and return errors in JSON format (don't throw)
      return JSON.stringify(
        {
          success: false,
          error: error.message || "Unknown error starting Sprite",
        },
        null,
        2,
      );
    }
  },
};

/**
 * AttachSpriteTool - Attach to a running Sprite VM.
 *
 * This tool allows RLM agents to attach to existing Sprite VMs
 * for interactive sessions or to retrieve output.
 */
const AttachSpriteTool: AxFunction = {
  name: "AttachSprite",
  description:
    "Attach to a running Sprite VM. Returns console output from the VM.",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Name/ID of the Sprite VM to attach to",
      },
    },
    required: ["name"],
  } as AxFunctionJSONSchema,
  func: async ({ name }: { name: string }) => {
    try {
      // Dynamic import to avoid circular dependency
      const { attachSprite } = await import("./sprite-runner.js");

      const result = await attachSprite(
        name,
        DEFAULT_SPRITE_CONFIG,
        spriteLogger,
      );

      if (result.success) {
        return JSON.stringify(
          {
            success: true,
            message: `Attached to Sprite '${name}'`,
            data: {
              name,
              stdout: result.stdout,
              stderr: result.stderr,
            },
          },
          null,
          2,
        );
      } else {
        return JSON.stringify(
          {
            success: false,
            error:
              result.stderr || result.error || "Failed to attach to Sprite",
          },
          null,
          2,
        );
      }
    } catch (error: any) {
      // Catch and return errors in JSON format (don't throw)
      return JSON.stringify(
        {
          success: false,
          error: error.message || "Unknown error attaching to Sprite",
        },
        null,
        2,
      );
    }
  },
};

/**
 * ListSpritesTool - List all active Sprite VMs.
 *
 * This tool allows RLM agents to query the current state of all Sprites.
 */
const ListSpritesTool: AxFunction = {
  name: "ListSprites",
  description:
    "List all active Sprite VMs. Returns a JSON array with Sprite information (ID, state, PID, etc.).",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  } as AxFunctionJSONSchema,
  func: async () => {
    try {
      // Dynamic import to avoid circular dependency
      const { listSprites, parseWispJson } = await import("./sprite-runner.js");

      const result = await listSprites(DEFAULT_SPRITE_CONFIG, spriteLogger);

      if (result.success) {
        const sprites = parseWispJson(result.stdout, spriteLogger);
        return JSON.stringify(
          {
            success: true,
            message: `Active Sprites: ${Array.isArray(sprites) ? sprites.length : 0}`,
            data: {
              sprites: sprites || [],
              rawOutput: result.stdout,
            },
          },
          null,
          2,
        );
      } else {
        return JSON.stringify(
          {
            success: false,
            error: result.stderr || result.error || "Failed to list Sprites",
          },
          null,
          2,
        );
      }
    } catch (error: any) {
      // Catch and return errors in JSON format (don't throw)
      return JSON.stringify(
        {
          success: false,
          error: error.message || "Unknown error listing Sprites",
        },
        null,
        2,
      );
    }
  },
};

/**
 * KillSpriteTool - Terminate a running Sprite VM.
 *
 * This tool allows RLM agents to cleanly shut down Sprite VMs when done.
 */
const KillSpriteTool: AxFunction = {
  name: "KillSprite",
  description: "Terminate (kill) a running Sprite VM. Returns success status.",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Name/ID of the Sprite VM to terminate",
      },
    },
    required: ["name"],
  } as AxFunctionJSONSchema,
  func: async ({ name }: { name: string }) => {
    try {
      // Dynamic import to avoid circular dependency
      const { killSprite } = await import("./sprite-runner.js");

      const result = await killSprite(
        name,
        DEFAULT_SPRITE_CONFIG,
        spriteLogger,
      );

      if (result.success) {
        return JSON.stringify(
          {
            success: true,
            message: `Killed Sprite '${name}'`,
            data: {
              name,
              stdout: result.stdout,
              stderr: result.stderr,
            },
          },
          null,
          2,
        );
      } else {
        return JSON.stringify(
          {
            success: false,
            error: result.stderr || result.error || "Failed to kill Sprite",
          },
          null,
          2,
        );
      }
    } catch (error: any) {
      // Catch and return errors in JSON format (don't throw)
      return JSON.stringify(
        {
          success: false,
          error: error.message || "Unknown error killing Sprite",
        },
        null,
        2,
      );
    }
  },
};

/**
 * ExecSpriteTool - Execute a command inside a running Sprite VM.
 *
 * This tool allows RLM agents to run arbitrary commands inside Sprite VMs,
 * enabling them to perform work (clone, build, test) inside the sandbox.
 */
const ExecSpriteTool: AxFunction = {
  name: "ExecSprite",
  description:
    "Execute a command inside a running Sprite VM. Returns command output and exit code.",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Name/ID of the Sprite VM to execute command in",
      },
      command: {
        type: "array",
        items: { type: "string" },
        description:
          "Command and arguments to execute (e.g., ['npm', 'install'])",
      },
    },
    required: ["name", "command"],
  } as AxFunctionJSONSchema,
  func: async ({ name, command }: { name: string; command: string[] }) => {
    try {
      // Dynamic import to avoid circular dependency
      const { execSprite } = await import("./sprite-runner.js");

      const result = await execSprite(
        name,
        command,
        DEFAULT_SPRITE_CONFIG,
        spriteLogger,
      );

      if (result.success) {
        return JSON.stringify(
          {
            success: true,
            message: `Executed command in Sprite '${name}'`,
            data: {
              name,
              command,
              exitCode: result.exitCode,
              stdout: result.stdout,
              stderr: result.stderr,
            },
          },
          null,
          2,
        );
      } else {
        // Command failed (non-zero exit code) - return failure with exit code
        return JSON.stringify(
          {
            success: false,
            message: `Command failed with exit code ${result.exitCode}`,
            error: result.stderr || result.error || "Command execution failed",
            data: {
              name,
              command,
              exitCode: result.exitCode,
              stdout: result.stdout,
              stderr: result.stderr,
            },
          },
          null,
          2,
        );
      }
    } catch (error: any) {
      // Catch and return errors in JSON format (don't throw)
      return JSON.stringify(
        {
          success: false,
          error: error.message || "Unknown error executing command",
        },
        null,
        2,
      );
    }
  },
};

const ALL_TOOLS: ToolRegistry = {
  Read: ReadTool,
  Write: WriteTool,
  Edit: EditTool,
  Glob: GlobTool,
  Grep: GrepTool,
  Bash: BashTool,
  // Sprite management tools (US-073-007)
  SpawnSprite: SpawnSpriteTool,
  AttachSprite: AttachSpriteTool,
  ListSprites: ListSpritesTool,
  KillSprite: KillSpriteTool,
  ExecSprite: ExecSpriteTool,
};

export function buildToolRegistry(
  allowedTools?: string[],
  jsRuntime?: JSRuntime,
): AxFunction[] {
  let tools = allowedTools
    ? allowedTools
        .map((name) => ALL_TOOLS[name])
        .filter((tool): tool is AxFunction => tool !== undefined)
    : Object.values(ALL_TOOLS);

  // If a JS runtime is provided, always add the RunJS tool (it's the core RLM mechanic)
  // But we respect allowlists if "RunJS" is explicitly excluded (which it won't be in most cases)
  if (jsRuntime) {
    const runJsTool = createRunJSTool(jsRuntime);
    if (!allowedTools || allowedTools.includes("RunJS")) {
      tools.push(runJsTool);
    }
  }

  return tools;
}
