import * as fs from "node:fs/promises";
import * as path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { AxFunction, AxFunctionJSONSchema } from "@ax-llm/ax";

const execAsync = promisify(exec);

export type ToolRegistry = Record<string, AxFunction>;

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
  description: "Write content to a file. Creates parent directories if they don't exist.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "The path to the file to write" },
      content: { type: "string", description: "The content to write" },
    },
    required: ["path", "content"],
  } as AxFunctionJSONSchema,
  func: async ({ path: filePath, content }: { path: string; content: string }) => {
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
  description: "Edit a file by replacing a string with a new string. Returns success message or error.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "The path to the file to edit" },
      oldText: { type: "string", description: "The exact text to replace" },
      newText: { type: "string", description: "The new text to insert" },
    },
    required: ["path", "oldText", "newText"],
  } as AxFunctionJSONSchema,
  func: async ({ path: filePath, oldText, newText }: { path: string; oldText: string; newText: string }) => {
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
      pattern: { type: "string", description: "The glob pattern (e.g., '**/*.ts')" },
      path: { type: "string", description: "The directory to search in (default: current directory)" },
    },
    required: ["pattern"],
  } as AxFunctionJSONSchema,
  func: async ({ pattern, path: searchPath }: { pattern: string; path?: string }) => {
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
      pattern: { type: "string", description: "The regex pattern to search for" },
      path: { type: "string", description: "The directory to search in (default: current directory)" },
      include: { type: "string", description: "File pattern to include (e.g., '*.ts')" },
    },
    required: ["pattern"],
  } as AxFunctionJSONSchema,
  func: async ({ pattern, path: searchPath, include }: { pattern: string; path?: string; include?: string }) => {
    try {
      const dir = searchPath || ".";
      const includeFlag = include ? `--include=\"${include}\"` : "";
      const { stdout } = await execAsync(`grep -r ${includeFlag} "${pattern}" ${dir}`);
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

const ALL_TOOLS: ToolRegistry = {
  Read: ReadTool,
  Write: WriteTool,
  Edit: EditTool,
  Glob: GlobTool,
  Grep: GrepTool,
  Bash: BashTool,
};

export function buildToolRegistry(allowedTools?: string[]): AxFunction[] {
  if (!allowedTools) {
    return Object.values(ALL_TOOLS);
  }

  return allowedTools
    .map((name) => ALL_TOOLS[name])
    .filter((tool): tool is AxFunction => tool !== undefined);
}
