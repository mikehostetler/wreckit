/**
 * Healing Procedures Module
 * Performs automated repair operations for recoverable errors.
 *
 * Part of Agent Doctor (Item 038) - Self-Healing Runtime
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { spawn } from "node:child_process";
import type { Logger } from "../logging";
import { pathExists } from "../fs/util";
import {
  getWreckitDir,
  getBatchProgressPath,
  getIndexPath,
  getConfigPath,
} from "../fs/paths";
import type { ErrorDiagnosis } from "./errorDetector";

/**
 * Result of a healing attempt
 */
export interface HealingResult {
  success: boolean;
  errorType: string;
  repairAttempted: string;
  message: string;
  durationMs: number;
}

/**
 * Configuration for healing behavior
 */
export interface HealingConfig {
  enabled: boolean;
  autoRepair: boolean | "safe-only"; // true = all repairs, false = none, "safe-only" = git lock + npm only
  maxRetries: number;
  timeoutMs: number;
}

/**
 * Apply healing based on error diagnosis
 */
export async function applyHealing(
  diagnosis: ErrorDiagnosis,
  cwd: string,
  config: HealingConfig,
  logger: Logger,
): Promise<HealingResult> {
  const startTime = Date.now();

  // Check if healing is enabled
  if (!config.enabled) {
    return {
      success: false,
      errorType: diagnosis.errorType,
      repairAttempted: "none",
      message: "Healing is disabled in config",
      durationMs: Date.now() - startTime,
    };
  }

  // Check if this repair is allowed by auto_repair setting
  const isSafeRepair =
    diagnosis.errorType === "git_lock" || diagnosis.errorType === "npm_failure";
  if (config.autoRepair === false) {
    return {
      success: false,
      errorType: diagnosis.errorType,
      repairAttempted: "none",
      message: "Auto-repair is disabled in config",
      durationMs: Date.now() - startTime,
    };
  }
  if (config.autoRepair === "safe-only" && !isSafeRepair) {
    return {
      success: false,
      errorType: diagnosis.errorType,
      repairAttempted: "none",
      message: `Repair type '${diagnosis.errorType}' not allowed in safe-only mode`,
      durationMs: Date.now() - startTime,
    };
  }

  // Apply the appropriate healing procedure
  try {
    switch (diagnosis.errorType) {
      case "git_lock":
        return await removeGitLock(cwd, config.timeoutMs, logger);

      case "npm_failure":
        return await runNpmInstall(cwd, config.timeoutMs, logger);

      case "json_corruption":
        return await validateAndRepairJson(cwd, logger);

      default:
        return {
          success: false,
          errorType: diagnosis.errorType,
          repairAttempted: "none",
          message: `No healing procedure for error type: ${diagnosis.errorType}`,
          durationMs: Date.now() - startTime,
        };
    }
  } catch (err) {
    return {
      success: false,
      errorType: diagnosis.errorType,
      repairAttempted: diagnosis.errorType,
      message: `Healing failed: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Remove stale .git/index.lock file
 * Follows FileLock stale detection pattern from src/fs/lock.ts:156-196
 */
async function removeGitLock(
  cwd: string,
  timeoutMs: number,
  logger: Logger,
): Promise<HealingResult> {
  const startTime = Date.now();
  const lockPath = path.join(cwd, ".git", "index.lock");

  // Check if lock file exists
  if (!(await pathExists(lockPath))) {
    return {
      success: false,
      errorType: "git_lock",
      repairAttempted: "remove_git_lock",
      message: "No .git/index.lock file found",
      durationMs: Date.now() - startTime,
    };
  }

  try {
    // Read lock file to check PID
    const lockContent = await fs.readFile(lockPath, "utf-8");
    let pid: number | null = null;
    let timestamp: number | undefined;

    // Try parsing as JSON (new format)
    try {
      const data = JSON.parse(lockContent);
      pid = data.pid;
      timestamp = data.timestamp;
    } catch {
      // Fall back to plain PID format (legacy)
      const trimmed = lockContent.trim();
      const parsed = parseInt(trimmed, 10);
      if (!isNaN(parsed)) {
        pid = parsed;
      }
    }

    // Check if lock is stale (process not running or lock > 60s old)
    const STALE_THRESHOLD_MS = 60000; // 60 seconds
    let isStale = false;

    if (pid !== null) {
      // Check if process is running
      try {
        process.kill(pid, 0); // Signal 0 checks if process exists
        // Process is running, check timestamp
        if (
          timestamp !== undefined &&
          Date.now() - timestamp > STALE_THRESHOLD_MS
        ) {
          isStale = true;
          logger.info(
            `Git lock is stale (timestamp: ${new Date(timestamp).toISOString()})`,
          );
        } else {
          return {
            success: false,
            errorType: "git_lock",
            repairAttempted: "remove_git_lock",
            message: `Git lock is held by active process (pid=${pid})`,
            durationMs: Date.now() - startTime,
          };
        }
      } catch {
        // Process is not running, lock is stale
        isStale = true;
        logger.info(`Git lock is stale (process ${pid} not running)`);
      }
    } else {
      // No PID found, treat as stale
      isStale = true;
      logger.info(`Git lock is stale (no PID found)`);
    }

    if (!isStale) {
      return {
        success: false,
        errorType: "git_lock",
        repairAttempted: "remove_git_lock",
        message: "Git lock is not stale, refusing to remove",
        durationMs: Date.now() - startTime,
      };
    }

    // Remove the stale lock file
    await fs.unlink(lockPath);
    logger.info(`Removed stale .git/index.lock`);

    return {
      success: true,
      errorType: "git_lock",
      repairAttempted: "remove_git_lock",
      message: "Removed stale .git/index.lock",
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    logger.error(`Failed to remove git lock: ${err}`);
    return {
      success: false,
      errorType: "git_lock",
      repairAttempted: "remove_git_lock",
      message: `Failed to remove: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Run npm install to repair missing dependencies
 */
async function runNpmInstall(
  cwd: string,
  timeoutMs: number,
  logger: Logger,
): Promise<HealingResult> {
  const startTime = Date.now();

  // Check if package.json exists
  const packageJsonPath = path.join(cwd, "package.json");
  if (!(await pathExists(packageJsonPath))) {
    return {
      success: false,
      errorType: "npm_failure",
      repairAttempted: "npm_install",
      message: "No package.json found in working directory",
      durationMs: Date.now() - startTime,
    };
  }

  try {
    logger.info("Running npm install to repair dependencies...");

    // Run npm install with timeout
    const result = await spawnCommand("npm", ["install"], cwd, timeoutMs);

    if (result.exitCode === 0) {
      logger.info("npm install completed successfully");
      return {
        success: true,
        errorType: "npm_failure",
        repairAttempted: "npm_install",
        message: "Ran npm install successfully",
        durationMs: Date.now() - startTime,
      };
    } else {
      logger.error(`npm install failed with exit code ${result.exitCode}`);
      return {
        success: false,
        errorType: "npm_failure",
        repairAttempted: "npm_install",
        message: `npm install failed with exit code ${result.exitCode}: ${result.stderr}`,
        durationMs: Date.now() - startTime,
      };
    }
  } catch (err) {
    logger.error(`Failed to run npm install: ${err}`);
    return {
      success: false,
      errorType: "npm_failure",
      repairAttempted: "npm_install",
      message: `Failed to run: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Validate and repair critical JSON files
 */
async function validateAndRepairJson(
  cwd: string,
  logger: Logger,
): Promise<HealingResult> {
  const startTime = Date.now();

  // Critical JSON files to check
  const criticalFiles = [
    { path: getConfigPath(cwd), name: "config.json" },
    { path: getIndexPath(cwd), name: "index.json" },
    { path: getBatchProgressPath(cwd), name: "batch-progress.json" },
  ];

  const corruptedFiles: Array<{ path: string; name: string; error: string }> =
    [];

  // Validate each file
  for (const file of criticalFiles) {
    if (await pathExists(file.path)) {
      try {
        const content = await fs.readFile(file.path, "utf-8");
        JSON.parse(content); // Will throw if invalid JSON
      } catch (err) {
        corruptedFiles.push({
          path: file.path,
          name: file.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  if (corruptedFiles.length === 0) {
    return {
      success: false,
      errorType: "json_corruption",
      repairAttempted: "validate_json",
      message: "No corrupted JSON files found",
      durationMs: Date.now() - startTime,
    };
  }

  // Attempt to restore from backup
  let restoredCount = 0;
  const errors: string[] = [];

  for (const file of corruptedFiles) {
    try {
      const restored = await restoreFromBackup(cwd, file.path, logger);
      if (restored) {
        restoredCount++;
        logger.info(`Restored ${file.name} from backup`);
      } else {
        errors.push(`${file.name}: no backup found`);
      }
    } catch (err) {
      errors.push(
        `${file.name}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  if (restoredCount > 0) {
    return {
      success: true,
      errorType: "json_corruption",
      repairAttempted: "restore_from_backup",
      message: `Restored ${restoredCount} corrupted JSON file(s) from backup`,
      durationMs: Date.now() - startTime,
    };
  } else {
    return {
      success: false,
      errorType: "json_corruption",
      repairAttempted: "restore_from_backup",
      message: `Failed to restore any files: ${errors.join("; ")}`,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Restore a file from the most recent backup
 */
async function restoreFromBackup(
  cwd: string,
  filePath: string,
  logger: Logger,
): Promise<boolean> {
  const wreckitDir = getWreckitDir(cwd);
  const backupsDir = path.join(wreckitDir, "backups");

  // Check if backups directory exists
  if (!(await pathExists(backupsDir))) {
    return false;
  }

  try {
    // List all backup sessions
    const sessions = await fs.readdir(backupsDir, { withFileTypes: true });
    const backupSessions = sessions
      .filter((e) => e.isDirectory() && e.name.startsWith("backup-"))
      .map((e) => e.name)
      .sort()
      .reverse(); // Most recent first

    // Find the file name
    const fileName = path.basename(filePath);

    // Search for the file in recent backups
    for (const session of backupSessions) {
      const sessionDir = path.join(backupsDir, session);
      const backedUpFilePath = path.join(sessionDir, fileName);

      if (await pathExists(backedUpFilePath)) {
        // Restore from backup
        const content = await fs.readFile(backedUpFilePath, "utf-8");

        // Validate restored content
        try {
          JSON.parse(content); // Ensure it's valid JSON
        } catch {
          // Backup is also corrupted, skip to next
          continue;
        }

        // Restore the file
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, content, "utf-8");
        logger.info(`Restored ${fileName} from backup ${session}`);
        return true;
      }
    }

    return false;
  } catch (err) {
    logger.error(`Failed to restore from backup: ${err}`);
    return false;
  }
}

/**
 * Helper to spawn a command with timeout
 */
interface SpawnResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

function spawnCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const child = spawn(command, args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const timeoutId = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) {
          child.kill("SIGKILL");
        }
      }, 5000);
    }, timeoutMs);

    child.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("error", (err) => {
      clearTimeout(timeoutId);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timeoutId);
      if (timedOut) {
        reject(new Error(`Command timed out after ${timeoutMs}ms`));
      } else {
        resolve({ exitCode: code, stdout, stderr });
      }
    });
  });
}
