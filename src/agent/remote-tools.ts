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
    createRemoteEditTool(vmName, config, logger),
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
        path: {
          type: "string",
          description: "The path to the file to read",
        },
      },
      required: ["path"],
    } as AxFunctionJSONSchema,
    func: async ({ path: filePath }: { path: string }) => {
      try {
        // Use cat | base64 to safely read binary content
        const result = await execSprite(
          vmName,
          ["sh", "-c", `cd ${remoteCwd} && cat \"${filePath}\" | base64`],
          config,
          logger,
        );

        if (!result.success && result.exitCode !== 0) {
          return `Error reading file ${filePath}: ${result.stderr}`;
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
        path: {
          type: "string",
          description: "The path to the file to write to",
        },
        content: {
          type: "string",
          description: "The content to write to the file",
        },
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
        // Use base64 | decode > file to safely write content
        const base64Content = Buffer.from(content).toString("base64");
        const result = await execSprite(
          vmName,
          [
            "sh",
            "-c",
            `cd ${remoteCwd} && echo \"${base64Content}\" | base64 -d > \"${filePath}\" `,
          ],
          config,
          logger,
        );

        if (!result.success && result.exitCode !== 0) {
          return `Error writing file ${filePath}: ${result.stderr}`;
        }

        return `Successfully wrote to ${filePath}`;
      } catch (error: any) {
        return `Error writing file: ${error.message}`;
      }
    },
  };
}

function createRemoteEditTool(
  vmName: string,
  config: SpriteAgentConfig,
  logger: Logger,
): AxFunction {
  const remoteCwd = "/home/user/project";
  return {
    name: "Edit",
    description: "Edit a file inside the Sprite VM by replacing a string with a new string.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The path to the file to edit",
        },
        old_string: {
          type: "string",
          description: "The exact literal text to replace",
        },
        new_string: {
          type: "string",
          description: "The new text to insert",
        },
      },
      required: ["path", "old_string", "new_string"],
    } as AxFunctionJSONSchema,
    func: async ({
      path: filePath,
      old_string,
      new_string,
    }: {
      path: string;
      old_string: string;
      new_string: string;
    }) => {
      try {
        // 1. Read file
        const readResult = await execSprite(
          vmName,
          ["sh", "-c", `cd ${remoteCwd} && cat \"${filePath}\" | base64`],
          config,
          logger,
        );

        if (!readResult.success && readResult.exitCode !== 0) {
          return `Error reading file ${filePath}: ${readResult.stderr}`;
        }

        const content = Buffer.from(readResult.stdout.trim(), "base64").toString("utf-8");

        // 2. Perform replacement
        if (!content.includes(old_string)) {
          return `Error: old_string not found in ${filePath}`;
        }
        const newContent = content.replace(old_string, new_string);

        // 3. Write file
        const base64Content = Buffer.from(newContent).toString("base64");
        const writeResult = await execSprite(
          vmName,
          [
            "sh",
            "-c",
            `cd ${remoteCwd} && echo \"${base64Content}\" | base64 -d > \"${filePath}\" `,
          ],
          config,
          logger,
        );

        if (!writeResult.success && writeResult.exitCode !== 0) {
          return `Error writing file ${filePath}: ${writeResult.stderr}`;
        }

        return `Successfully edited ${filePath}`;
      } catch (error: any) {
        return `Error editing file: ${error.message}`;
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
        const dir = searchPath || ".";
        let cmd = `find ${dir} -name "${pattern}"`;

        // Heuristic to handle standard recursive globs like "src/**/*.ts" or "**/*.ts"
        if (pattern.startsWith("**/")) {
          // Case: "**/*.ts" -> find . -name "*.ts"
          const ext = pattern.substring(3);
          cmd = `find ${dir} -name "${ext}"`;
        } else if (pattern.includes("/**/")) {
          // Case: "src/**/*.ts" -> find src -name "*.ts"
          const [base, rest] = pattern.split("/**/");
          if (base && rest && !rest.includes("/")) {
             const searchDir = dir === "." ? base : `${dir}/${base}`;
             cmd = `find ${searchDir} -name "${rest}"`;
          }
        }

        const result = await execSprite(
          vmName,
          ["sh", "-c", `cd ${remoteCwd} && ${cmd}`],
          config,
          logger,
        );

        if (result.exitCode !== 0) {
          // find returns non-zero if dir doesn't exist, which is a valid "no files" case usually, 
          // or strictly an error. Let's return error to be safe, but maybe empty string is better?
          // If the dir doesn't exist, glob returns empty.
          if (result.stderr.includes("No such file or directory")) {
            return "";
          }
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
