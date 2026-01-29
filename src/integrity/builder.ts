import * as fs from "node:fs/promises";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { findRepoRoot, resolveCwd } from "../fs/paths";
import { getBuildLockPath, getBackupsDir } from "../fs/paths";
import { FileLock } from "../fs/lock";
import type { Logger } from "../logging";
import { updateBuildMetadata } from "./metadata";
import { calculateAllHashes } from "./checksum";

export interface BuildOptions {
  cwd?: string;
  root?: string;
  logger?: Logger;
}

export interface BuildResult {
  success: boolean;
  error?: string;
  duration?: number;
}

/**
 * Create a backup of the dist/ directory.
 */
async function backupDist(root: string): Promise<string | null> {
  const distDir = path.join(root, "dist");

  try {
    await fs.access(distDir);
  } catch {
    // dist/ doesn't exist, nothing to backup
    return null;
  }

  // Create backup directory
  const backupId = `dist-pre-build-${Date.now()}`;
  const backupDir = path.join(getBackupsDir(root), backupId);
  await fs.mkdir(backupDir, { recursive: true });

  // Copy dist/ to backup
  await recursiveCopy(distDir, backupDir);

  return backupDir;
}

/**
 * Restore dist/ from backup.
 */
async function restoreDist(root: string, backupId: string): Promise<void> {
  const distDir = path.join(root, "dist");
  const backupDir = path.join(getBackupsDir(root), backupId);

  // Remove existing dist/
  await fs.rm(distDir, { recursive: true, force: true });

  // Restore from backup
  await recursiveCopy(backupDir, distDir);

  // Clean up backup
  await fs.rm(backupDir, { recursive: true, force: true });
}

/**
 * Recursively copy directory.
 */
async function recursiveCopy(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await recursiveCopy(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

/**
 * Verify that dist/index.js exists and is valid.
 */
async function verifyBuild(root: string): Promise<boolean> {
  const distIndex = path.join(root, "dist", "index.js");

  try {
    await fs.access(distIndex, fs.constants.F_OK);
    const stats = await fs.stat(distIndex);
    return stats.size > 0;
  } catch {
    return false;
  }
}

/**
 * Run the build command using tsup.
 */
async function runBuildCommand(
  root: string,
  log: Logger,
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const buildProcess = spawn(
      "bun",
      ["run", "build"],
      {
        cwd: root,
        stdio: "pipe",
      },
    );

    let stdout = "";
    let stderr = "";

    buildProcess.stdout?.on("data", (data) => {
      const output = data.toString();
      stdout += output;
      log.debug(output.trim());
    });

    buildProcess.stderr?.on("data", (data) => {
      const output = data.toString();
      stderr += output;
      log.debug(output.trim());
    });

    buildProcess.on("close", (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({
          success: false,
          error: stderr || `Build failed with exit code ${code}`,
        });
      }
    });

    buildProcess.on("error", (err) => {
      resolve({
        success: false,
        error: `Failed to start build: ${err.message}`,
      });
    });
  });
}

/**
 * Safely rebuild the project with backup and rollback.
 *
 * Steps:
 * 1. Acquire build lock
 * 2. Backup dist/ directory
 * 3. Run build command
 * 4. Verify dist/index.js exists
 * 5. Update build metadata
 * 6. Release lock
 * 7. If any step fails, restore backup and release lock
 */
export async function safeRebuild(
  options: BuildOptions = {},
): Promise<BuildResult> {
  const startTime = Date.now();
  const cwd = options.cwd ?? resolveCwd();
  const root = options.root ?? findRepoRoot(cwd);
  const log = options.logger || console;

  const lockPath = getBuildLockPath(root);

  try {
    // Acquire build lock
    log.debug("Acquiring build lock...");
    const lock = await FileLock.acquireExclusive(lockPath, {
      timeout: 60000, // 1 minute timeout
    });

    try {
      // Backup dist/
      log.debug("Backing up dist/ directory...");
      const backupId = await backupDist(root);

      try {
        // Run build
        log.info("Building project...");
        const buildResult = await runBuildCommand(root, log as Logger);

        if (!buildResult.success) {
          throw new Error(buildResult.error || "Build failed");
        }

        // Verify build
        log.debug("Verifying build artifacts...");
        const isValid = await verifyBuild(root);

        if (!isValid) {
          throw new Error("Build verification failed: dist/index.js not found");
        }

        // Verify prompts were copied
        const promptsDir = path.join(root, "dist", "prompts");
        try {
          await fs.access(promptsDir);
        } catch {
          throw new Error("Prompts directory not found in dist/");
        }

        // Calculate hashes
        log.debug("Calculating source hashes...");
        const { sourceHash, promptsHash } = await calculateAllHashes();

        // Update metadata
        log.debug("Updating build metadata...");
        await updateBuildMetadata(sourceHash, promptsHash, root);

        const duration = Date.now() - startTime;
        log.info(`Build completed successfully in ${duration}ms`);

        return {
          success: true,
          duration,
        };
      } catch (buildErr) {
        // Build failed, restore backup
        const errorMsg = (buildErr as Error).message;
        log.error(`Build failed: ${errorMsg}`);

        if (backupId) {
          log.info("Restoring dist/ from backup...");
          try {
            await restoreDist(root, backupId);
            log.info("Restored dist/ to pre-build state");
          } catch (restoreErr) {
            log.error(`Failed to restore backup: ${(restoreErr as Error).message}`);
          }
        }

        return {
          success: false,
          error: errorMsg,
        };
      }
    } finally {
      // Release lock
      await lock.release();
      log.debug("Released build lock");
    }
  } catch (lockErr) {
    const errorMsg = (lockErr as Error).message;
    log.error(`Failed to acquire build lock: ${errorMsg}`);
    return {
      success: false,
      error: errorMsg,
    };
  }
}
