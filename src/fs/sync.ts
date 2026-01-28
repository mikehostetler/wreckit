import * as fs from "node:fs/promises";
import { spawn } from "node:child_process";
import * as path from "node:path";
import type { Logger } from "../logging";
import type { SpriteAgentConfig } from "../schemas";
import { execSprite } from "../agent/sprite-core";
import { SpriteSyncError } from "../errors";

/**
 * Result from creating a project archive.
 */
export interface CreateArchiveResult {
  success: boolean;
  archivePath?: string;
  archiveSize?: number;
  error?: string;
}

/**
 * Result from uploading archive to VM.
 */
export interface UploadArchiveResult {
  success: boolean;
  vmPath?: string;
  error?: string;
}

/**
 * Options for creating project archive.
 */
export interface CreateArchiveOptions {
  projectRoot: string;
  excludePatterns?: string[];
  logger: Logger;
}

/**
 * Options for uploading archive to VM.
 */
export interface UploadArchiveOptions {
  vmName: string;
  archivePath: string;
  config: SpriteAgentConfig;
  logger: Logger;
}

/**
 * Default exclude patterns for project synchronization.
 */
const DEFAULT_EXCLUDE_PATTERNS = [
  ".git",
  "node_modules",
  ".wreckit",
  "dist",
  "build",
  ".DS_Store",
];

/**
 * Create a tar.gz archive of the project, excluding specified patterns.
 * Uses system tar command for compatibility and to avoid npm dependencies.
 */
export async function createProjectArchive(
  options: CreateArchiveOptions,
): Promise<CreateArchiveResult> {
  const {
    projectRoot,
    excludePatterns = DEFAULT_EXCLUDE_PATTERNS,
    logger,
  } = options;

  logger.debug(`Creating project archive from ${projectRoot}`);

  const wreckitDir = path.join(projectRoot, ".wreckit");
  try {
    await fs.mkdir(wreckitDir, { recursive: true });
  } catch (err) {
    // Ignore if exists
  }

  const archivePath = path.join(wreckitDir, "project-sync.tar.gz");
  // Ensure we don't include the archive itself if it's running
  try {
    await fs.unlink(archivePath);
  } catch {
    // Ignore
  }

  const excludeArgs = excludePatterns.flatMap((p) => ["--exclude", p]);

  return new Promise((resolve) => {
    // tar czf .wreckit/project-sync.tar.gz --exclude ... -C projectRoot .
    const tar = spawn("tar", [
      "czf",
      archivePath,
      ...excludeArgs,
      "-C",
      projectRoot,
      ".",
    ]);

    let stderr = "";

    tar.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    tar.on("close", async (code) => {
      if (code !== 0) {
        resolve({
          success: false,
          error: `tar failed with exit code ${code}: ${stderr}`,
        });
        return;
      }

      try {
        const stats = await fs.stat(archivePath);
        logger.debug(`Archive created: ${archivePath} (${stats.size} bytes)`);

        resolve({
          success: true,
          archivePath,
          archiveSize: stats.size,
        });
      } catch (err) {
        resolve({
          success: false,
          error: `Failed to read archive: ${(err as Error).message}`,
        });
      }
    });

    tar.on("error", (err) => {
      resolve({
        success: false,
        error: `tar process error: ${err.message}`,
      });
    });
  });
}

/**
 * Upload archive to Sprite VM and extract it to the target directory.
 * Uses base64 encoding to safely transfer binary data.
 */
export async function uploadToSpriteVM(
  options: UploadArchiveOptions,
): Promise<UploadArchiveResult> {
  const { vmName, archivePath, config, logger } = options;

  logger.debug(`Uploading archive to Sprite VM '${vmName}'`);

  const targetDir = "/home/user/project";

  try {
    const archiveBuffer = await fs.readFile(archivePath);
    const base64Archive = archiveBuffer.toString("base64");

    // We stream the base64 data to a file inside the VM, then decode it.
    // echo "base64" | base64 -d | tar xzf - -C targetDir
    // Note: command line length limits might be an issue for huge files.
    // If > 1MB, we might need to chunk it.
    // For now, simple implementation.

    const result = await execSprite(
      vmName,
      [
        "sh",
        "-c",
        `mkdir -p ${targetDir} && echo "${base64Archive}" | base64 -d | tar xzf - -C ${targetDir}`,
      ],
      config,
      logger,
    );

    if (!result.success && result.exitCode !== 0) {
      return {
        success: false,
        error: `Upload failed: ${result.stderr}`,
      };
    }

    logger.debug(`Archive extracted to ${targetDir}`);

    return {
      success: true,
      vmPath: targetDir,
    };
  } catch (err) {
    return {
      success: false,
      error: `Upload error: ${(err as Error).message}`,
    };
  }
}

/**
 * Synchronize project to Sprite VM by creating archive and uploading it.
 * Automatically cleans up local archive after upload.
 */
export async function syncProjectToVM(
  vmName: string,
  projectRoot: string,
  config: SpriteAgentConfig,
  logger: Logger,
): Promise<boolean> {
  // Check if sync is enabled in config (default true if not specified)
  // Assuming optional config field for now
  // if (config.syncEnabled === false) return true;

  const archiveResult = await createProjectArchive({
    projectRoot,
    logger,
  });

  if (!archiveResult.success) {
    logger.error(`Failed to create project archive: ${archiveResult.error}`);
    // Throw specific error
    throw new SpriteSyncError(
      "archive",
      projectRoot,
      archiveResult.error || "Unknown error",
    );
  }

  logger.info(`Project archive created: ${archiveResult.archiveSize} bytes`);

  try {
    const uploadResult = await uploadToSpriteVM({
      vmName,
      archivePath: archiveResult.archivePath!,
      config,
      logger,
    });

    if (!uploadResult.success) {
      throw new SpriteSyncError(
        "upload",
        projectRoot,
        uploadResult.error || "Unknown error",
      );
    }

    logger.info(`Project synchronized to ${uploadResult.vmPath}`);
    return true;
  } finally {
    // Clean up local archive
    if (archiveResult.archivePath) {
      try {
        await fs.unlink(archiveResult.archivePath);
        logger.debug("Cleaned up local archive");
      } catch (err) {
        logger.warn(`Failed to clean up archive: ${(err as Error).message}`);
      }
    }
  }
}
