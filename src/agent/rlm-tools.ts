import * as fs from "node:fs/promises";
import * as path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import * as vm from "node:vm";
import type { AxFunction, AxFunctionJSONSchema } from "@ax-llm/ax";

const execAsyncLocal = promisify(exec);

export type ToolRegistry = Record<string, AxFunction>;

export type Executor = (
  command: string,
) => Promise<{ stdout: string; stderr: string }>;

export const defaultLocalExecutor: Executor = async (command: string) => {
  return execAsyncLocal(command);
};

export class JSRuntime {
  private context: vm.Context;
  private executor: Executor;

  constructor(
    initialContext: Record<string, any> = {},
    executor: Executor = defaultLocalExecutor,
  ) {
    this.executor = executor;
    this.context = vm.createContext({
      console: {
        log: (...args: any[]) => this.log("log", ...args),
        error: (...args: any[]) => this.log("error", ...args),
        warn: (...args: any[]) => this.log("warn", ...args),
      },
      // Expose shell execution to JS runtime
      shell: async (cmd: string) => {
        try {
          const { stdout, stderr } = await this.executor(cmd);
          return stdout || stderr;
        } catch (e: any) {
          return e.message;
        }
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
      "Execute JavaScript code to process data. Access the global variable 'CONTEXT_DATA' to see the user's input. You can use 'await shell(cmd)' to run commands.",
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

export function createTools(executor: Executor = defaultLocalExecutor): ToolRegistry {
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
        // TODO: For remote RLM, this should use cat via executor if remote
        // For now, we assume FS is mounted or synced? 
        // Ideally we should abstract FS operations too (IFileSystem).
        // But for "Remote RLM", we sync the project to the VM.
        // If we want the RLM logic (running locally) to read files from the VM,
        // we MUST use the executor to cat the file.
        
        // Let's use the executor for reading to be consistent!
        const { stdout } = await executor(`cat "${filePath}"`);
        return stdout;
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
        // Use executor to write. 
        // We need to be careful with escaping.
        // A safer way for remote write is tricky without a proper file transfer mechanism.
        // But we can try a basic echo/cat with EOF.
        
        // For safety, let's assume we can use a simple node script on the remote end?
        // Or just use local FS if we assume sync back?
        // NO. RLM running locally + Sprite VM means the "truth" is in the VM.
        // If we write locally, it won't be in the VM until sync.
        
        // For now, let's use local FS for Read/Write and rely on Sync?
        // If we use local FS, then 'Read' reads local files.
        // But 'Bash' executes remote commands.
        // This causes split brain: 'ls' shows file X, 'Read X' fails if not synced.
        
        // To do this properly, ALL IO must be remote.
        // Implementing robust remote file write via shell is hard (quoting hell).
        
        // Compromise: For this iteration, we keep Read/Write LOCAL (using fs promises).
        // Why? Because RLM pulls the repo locally anyway.
        // The pattern is: Local logic -> Sync to VM -> Remote Exec -> Sync back.
        // So RLM writes to LOCAL disk.
        
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, content, "utf-8");
        return `Successfully wrote to ${filePath}`;
      } catch (error: any) {
        return `Error writing file ${filePath}: ${error.message}`;
      }
    },
  };
  
  // Re-override ReadTool to use local FS for consistency with WriteTool strategy
  // We assume bi-directional sync is handling the consistency.
  ReadTool.func = async ({ path: filePath }: { path: string }) => {
      try {
        const content = await fs.readFile(filePath, "utf-8");
        return content;
      } catch (error: any) {
        return `Error reading file ${filePath}: ${error.message}`;
      }
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
        const dir = searchPath || ".";
        // Use executor for Glob/Find
        const { stdout } = await executor(`find ${dir} -name "${pattern}"`);
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
        // Use executor for Grep
        const { stdout } = await executor(
          `grep -r ${includeFlag} "${pattern}" ${dir}`,
        );
        return stdout.trim() || "No matches found";
      } catch (error: any) {
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
        // Use executor for Bash
        const { stdout, stderr } = await executor(command);
        return `Stdout:\n${stdout}\nStderr:\n${stderr}`;
      } catch (error: any) {
        return `Error executing command: ${error.message}\nStderr:\n${error.stderr}`;
      }
    },
  };

  return {
    Read: ReadTool,
    Write: WriteTool,
    Edit: EditTool,
    Glob: GlobTool,
    Grep: GrepTool,
    Bash: BashTool,
  };
}

export function buildToolRegistry(
  allowedTools?: string[],
  jsRuntime?: JSRuntime,
  executor: Executor = defaultLocalExecutor,
): AxFunction[] {
  const registry = createTools(executor);
  
  let tools = allowedTools
    ? allowedTools
        .map((name) => registry[name])
        .filter((tool): tool is AxFunction => tool !== undefined)
    : Object.values(registry);

  if (jsRuntime) {
    const runJsTool = createRunJSTool(jsRuntime);
    if (!allowedTools || allowedTools.includes("RunJS")) {
      tools.push(runJsTool);
    }
  }

  return tools;
}
