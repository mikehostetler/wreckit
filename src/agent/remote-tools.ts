import { type AxFunction, type AxFunctionJSONSchema } from "@ax-llm/ax";
import type { Logger } from "../logging";
import type { SpriteAgentConfig } from "../schemas";
import { execSprite } from "./sprite-runner";
import { SpriteExecError } from "../errors";

/**
 * Build a registry of remote tools that execute inside a Sprite VM.
 */
export function buildRemoteToolRegistry(
  vmName: string,
  config: SpriteAgentConfig,
  logger: Logger,
  allowedTools?: string[],
): AxFunction[] {
  const remoteTools = [
    createRemoteReadTool(vmName, config, logger),
    createRemoteWriteTool(vmName, config, logger),
    createRemoteBashTool(vmName, config, logger),
    createRemoteGlobTool(vmName, config, logger),
    createRemoteGrepTool(vmName, config, logger),
  ];

  if (allowedTools) {
    return remoteTools.filter((tool) => allowedTools.includes(tool.name));
  }

  return remoteTools;
}

function createRemoteReadTool(
  vmName: string,
  config: SpriteAgentConfig,
  logger: Logger,
): AxFunction {
  const remoteCwd = "/home/user/project";
  return {
    name: "Read",
    description: "Read a file from the filesystem inside the Sprite VM.",
    parameters: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "The path to the file to read",
        },
      },
      required: ["file_path"],
    } as AxFunctionJSONSchema,
    func: async ({ file_path }: { file_path: string }) => {
      try {
        // Use cat | base64 to safely read binary content
        const result = await execSprite(
          vmName,
          ["sh", "-c", `cd ${remoteCwd} && cat \"${file_path}\" | base64`],
          config,
          logger,
        );

        if (!result.success && result.exitCode !== 0) {
          return `Error reading file ${file_path}: ${result.stderr}`;
        }

        const content = Buffer.from(result.stdout.trim(), "base64").toString(
          "utf-8",
        );
        return content;
      } catch (error: any) {
        if (error instanceof SpriteExecError) {
          return `Failed to execute read command: ${error.message}`;
        }
        return `Error reading file: ${error.message}`;
      }
    },
  };
}

function createRemoteWriteTool(
  vmName: string,
  config: SpriteAgentConfig,
  logger: Logger,
): AxFunction {
  const remoteCwd = "/home/user/project";
  return {
    name: "Write",
    description: "Write content to a file inside the Sprite VM.",
    parameters: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "The path to the file to write to",
        },
        content: {
          type: "string",
          description: "The content to write to the file",
        },
      },
      required: ["file_path", "content"],
    } as AxFunctionJSONSchema,
    func: async ({
      file_path,
      content,
    }: {
      file_path: string;
      content: string;
    }) => {
      try {
        // Use base64 | decode > file to safely write content
        const base64Content = Buffer.from(content).toString("base64");
        // We write the base64 string to a temp file then decode it, to avoid command line length limits/quoting hell
        // Actually, piping echo is risky if too long.
        // Better: write base64 to a temp file using printf or similar if possible, but echo is standard.
        // For now, simple echo | base64 -d > file.
        const result = await execSprite(
          vmName,
          [
            "sh",
            "-c",
            `cd ${remoteCwd} && echo \"${base64Content}\" | base64 -d > \"${file_path}\" `,
          ],
          config,
          logger,
        );

        if (!result.success && result.exitCode !== 0) {
          return `Error writing file ${file_path}: ${result.stderr}`;
        }

        return `Successfully wrote to ${file_path}`;
      } catch (error: any) {
        return `Error writing file: ${error.message}`;
      }
    },
  };
}

function createRemoteBashTool(
  vmName: string,
  config: SpriteAgentConfig,
  logger: Logger,
): AxFunction {
  const remoteCwd = "/home/user/project";
  return {
    name: "Bash",
    description: "Execute a bash command inside the Sprite VM.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The bash command to execute",
        },
      },
      required: ["command"],
    } as AxFunctionJSONSchema,
    func: async ({ command }: { command: string }) => {
      try {
        const result = await execSprite(
          vmName,
          ["sh", "-c", `cd ${remoteCwd} && ${command}`],
          config,
          logger,
        );

        if (result.exitCode !== 0) {
          return `Command failed with exit code ${result.exitCode}\nStdout: ${result.stdout}\nStderr: ${result.stderr}`;
        }

        return result.stdout;
      } catch (error: any) {
        return `Error executing command: ${error.message}`;
      }
    },
  };
}

function createRemoteGlobTool(
  vmName: string,
  config: SpriteAgentConfig,
  logger: Logger,
): AxFunction {
  const remoteCwd = "/home/user/project";
  return {
    name: "Glob",
    description: "Find files matching a glob pattern inside the Sprite VM.",
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "The glob pattern to match (e.g. **/*.ts)",
        },
        path: {
          type: "string",
          description: "The directory to search in (optional)",
        },
      },
      required: ["pattern"],
    } as AxFunctionJSONSchema,
    func: async ({ pattern, path: searchPath }: { pattern: string; path?: string }) => {
      try {
        // Map glob pattern to find command
        // Simple mapping: **/*.ts -> -name "*.ts"
        // This is a simplification. Ideally we'd use a real glob tool inside.
        // For now, let's assume 'find' is available.
        // If pattern contains **, use -name.
        const dir = searchPath || ".";
        const namePattern = pattern.replace("**/", ""); // Very naive

        // Better: just use `find . -name "pattern"`
        // Or if the VM has `glob` or python, use that.
        // Most robust: `find <path> -name "<pattern>"

        const result = await execSprite(
          vmName,
          ["sh", "-c", `cd ${remoteCwd} && find ${dir} -name "${namePattern}"`],
          config,
          logger,
        );

        if (result.exitCode !== 0) {
          return `Error finding files: ${result.stderr}`;
        }
        return result.stdout;
      } catch (error: any) {
        return `Error executing glob: ${error.message}`;
      }
    },
  };
}

function createRemoteGrepTool(
  vmName: string,
  config: SpriteAgentConfig,
  logger: Logger,
): AxFunction {
  const remoteCwd = "/home/user/project";
  return {
    name: "Grep",
    description: "Search for a pattern in files inside the Sprite VM.",
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "The pattern to search for",
        },
        path: {
          type: "string",
          description: "The directory to search in (optional)",
        },
        include: {
          type: "string",
          description: "File pattern to include (optional)",
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
        const includeArg = include ? `--include="${include}"` : "";

        // Arguments need to be filtered to remove empty strings if any
        const args = ["grep", "-r"];
        if (includeArg) args.push(includeArg);
        args.push(pattern);
        args.push(dir);

        const result = await execSprite(vmName, ["sh", "-c", `cd ${remoteCwd} && ${args.join(" ")}`], config, logger);

        if (result.exitCode !== 0 && result.exitCode !== 1) {
          // 1 means no matches, which is fine
          return `Error searching: ${result.stderr}`;
        }
        return result.stdout || "No matches found.";
      } catch (error: any) {
        return `Error executing grep: ${error.message}`;
      }
    },
  };
}
