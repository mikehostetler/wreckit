import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { Logger } from "../logging";
import { findRootFromOptions, getItemDir } from "../fs/paths";
import { readItem } from "../fs/json";
import { FileNotFoundError, WreckitError } from "../errors";

const execAsync = promisify(exec);

export interface ShellOptions {
  cwd?: string;
  json?: boolean;
}

/**
 * Execute a shell command in the context of a work item.
 */
export async function shellCommand(
  itemId: string,
  commandArgs: string[],
  options: ShellOptions,
  logger: Logger,
): Promise<void> {
  const { json = false } = options;
  const root = findRootFromOptions(options);

  const fullCommand = commandArgs.join(" ");
  logger.debug(`Executing shell command for item ${itemId}: ${fullCommand}`);

  try {
    const { stdout, stderr } = await execAsync(fullCommand, {
      cwd: root, // Execute in project root
    });

    const result = {
      success: true,
      itemId,
      command: fullCommand,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    };

    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      if (stdout.trim()) console.log(stdout.trim());
      if (stderr.trim()) console.error(stderr.trim());
    }
  } catch (err: any) {
    const result = {
      success: false,
      itemId,
      command: fullCommand,
      error: err.message,
      stdout: err.stdout?.trim() || "",
      stderr: err.stderr?.trim() || "",
    };

    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      if (result.stdout) console.log(result.stdout);
      if (result.stderr) console.error(result.stderr);
      console.error(`❌ Command failed: ${err.message}`);
    }
    process.exit(err.code || 1);
  }
}
