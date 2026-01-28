import * as fs from "node:fs/promises";
import { spawn } from "node:child_process";
import * as path from "node:path";
import * as os from "node:os";
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
 * Result from downloading archive from VM.
 */
export interface DownloadArchiveResult {
  success: boolean;
  archiveBuffer?: Buffer;
  archiveSize?: number;
  error?: string;
}

/**
 * Result from extracting archive on host.
 */
export interface ExtractArchiveResult {
  success: boolean;
  extractedPath?: string;
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
 * Options for downloading archive from VM.
 */
export interface DownloadArchiveOptions {
  vmName: string;
  config: SpriteAgentConfig;
  logger: Logger;
  /** Path inside VM to archive (default: /home/user/project) */
  vmSourcePath?: string;
  /** Patterns to exclude from VM archive */
  excludePatterns?: string[];
}

/**
 * Options for extracting archive on host.
 */
export interface ExtractArchiveOptions {
  archiveBuffer: Buffer;
  projectRoot: string;
  logger: Logger;
}

/**
 * Default exclude patterns for project synchronization.
 */
const DEFAULT_EXCLUDE_PATTERNS = [
  ".git",
  "node_modules",
  ".wreckit/project-sync.tar.gz",
  ".wreckit/backups",
  ".wreckit/tmp",
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
    ], {
      env: { ...process.env, COPYFILE_DISABLE: "1" }
    });

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

      // We don't read the file into memory anymore for streaming.

      // Instead, we let the Sprite CLI handle the upload via the -file flag.

      const remoteArchive = "/tmp/project-sync.tar.gz";

  

      // Ensure target directory exists

      await execSprite(

        vmName,

        ["mkdir", "-p", targetDir],

        config,

        logger,

      );

  

      // Upload archive using -file flag and extract it

      // The execSprite wrapper maps 'files' to '-file source:dest' arguments

      const result = await execSprite(

        vmName,

        ["tar", "xzf", remoteArchive, "-C", targetDir],

        config,

        logger,

        { 

          files: [`${archivePath}:${remoteArchive}`]

        },

      );

  

      if (!result.success && result.exitCode !== 0) {

        return {

          success: false,

          error: `Upload/Extract failed: ${result.stderr}`,

        };

      }

  

      // Cleanup remote archive (best effort)

      await execSprite(vmName, ["rm", "-f", remoteArchive], config, logger);

  

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

    // Initialize git in the VM with host identity
    try {
      const remoteCwd = uploadResult.vmPath;
      logger.debug(`Initializing git in VM at ${remoteCwd}...`);
      
      await execSprite(vmName, ["sh", "-c", `cd ${remoteCwd} && git init`], config, logger);

      // Try to get host git config
      let userName = "WreckIt Bot";
      let userEmail = "bot@wreckit.local";

      try {
        const { exec } = await import("node:child_process");
        const { promisify } = await import("node:util");
        const execAsync = promisify(exec);
        
        const nameRes = await execAsync("git config get user.name").catch(() => ({ stdout: "" }));
        const emailRes = await execAsync("git config get user.email").catch(() => ({ stdout: "" }));
        
        if (nameRes.stdout.trim()) userName = nameRes.stdout.trim();
        if (emailRes.stdout.trim()) userEmail = emailRes.stdout.trim();
      } catch (e) {
        logger.debug("Could not read host git config, using defaults");
      }

      await execSprite(
        vmName,
        ["sh", "-c", `cd ${remoteCwd} && git config user.email "${userEmail}"`],
        config,
        logger,
      );
      await execSprite(
        vmName,
        ["sh", "-c", `cd ${remoteCwd} && git config user.name "${userName}"`],
        config,
        logger,
      );
      logger.debug(`Git initialized in VM as ${userName} <${userEmail}>`);
    } catch (err) {
      logger.warn(`Failed to initialize git in VM: ${(err as Error).message}`);
      // Don't fail the whole sync if git init fails
    }

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

/**
 * Download archive from Sprite VM by creating tar.gz inside VM and streaming it via base64.
 * Uses base64 encoding to safely transfer binary data via stdout.
 */
export async function downloadFromSpriteVM(
  options: DownloadArchiveOptions,
): Promise<DownloadArchiveResult> {
  const {
    vmName,
    config,
    logger,
    vmSourcePath = "/home/user/project",
    excludePatterns = DEFAULT_EXCLUDE_PATTERNS,
  } = options;

  logger.debug(`Creating archive in VM '${vmName}' at ${vmSourcePath}`);

  const excludeArgs = excludePatterns.flatMap((p) => ["--exclude", p]);
  const tarArgs = ["tar", "czf", "-", ...excludeArgs, "-C", vmSourcePath, "."];

  // Execute tar inside VM, output to stdout as base64
  const result = await execSprite(
    vmName,
    ["sh", "-c", `${tarArgs.join(" ")} | base64`],
    config,
    logger,
  );

  if (!result.success || result.exitCode !== 0) {
    return {
      success: false,
      error: `Archive creation in VM failed: ${result.stderr}`,
    };
  }

  try {
    // Decode base64 output to get archive buffer
    const archiveBuffer = Buffer.from(result.stdout.trim(), "base64");
    logger.debug(`Downloaded archive: ${archiveBuffer.length} bytes`);

    return {
      success: true,
      archiveBuffer,
      archiveSize: archiveBuffer.length,
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to decode archive: ${(err as Error).message}`,
    };
  }
}

/**
 * Extract a tar.gz archive buffer to the project directory.
 * Writes buffer to temp file, then uses system tar to extract.
 */
export async function extractProjectArchive(
  options: ExtractArchiveOptions,
): Promise<ExtractArchiveResult> {
  const { archiveBuffer, projectRoot, logger } = options;

  logger.debug(`Extracting archive to ${projectRoot}`);

  // Write buffer to temp file
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "wreckit-sync-pull-"),
  );
  const tempArchivePath = path.join(tempDir, "pull-archive.tar.gz");

  try {
    await fs.writeFile(tempArchivePath, archiveBuffer);
    logger.debug(`Wrote temp archive: ${tempArchivePath}`);

    // Extract using system tar
    return new Promise((resolve) => {
      const tar = spawn("tar", ["xzf", tempArchivePath, "-C", projectRoot]);

      let stderr = "";

      tar.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      tar.on("close", async (code) => {
        // Clean up temp archive
        try {
          await fs.unlink(tempArchivePath);
          await fs.rm(tempDir, { recursive: true });
        } catch (cleanupErr) {
          logger.warn(
            `Failed to clean up temp archive: ${(cleanupErr as Error).message}`,
          );
        }

        if (code !== 0) {
          resolve({
            success: false,
            error: `tar extraction failed with exit code ${code}: ${stderr}`,
          });
          return;
        }

        logger.debug(`Archive extracted to ${projectRoot}`);
        resolve({
          success: true,
          extractedPath: projectRoot,
        });
      });

      tar.on("error", (err) => {
        resolve({
          success: false,
          error: `tar process error: ${err.message}`,
        });
      });
    });
  } catch (err) {
    // Clean up on error
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {}
    return {
      success: false,
      error: `Failed to write temp archive: ${(err as Error).message}`,
    };
  }
}

/**
 * Synchronize files from Sprite VM back to host machine.
 * Creates archive in VM, downloads it, extracts to project directory.
 * This is the mirror operation of syncProjectToVM().
 */
export async function syncProjectFromVM(
  vmName: string,
  projectRoot: string,
  config: SpriteAgentConfig,
  logger: Logger,
): Promise<boolean> {
  logger.info(`Pulling files from Sprite VM '${vmName}'...`);

  const downloadResult = await downloadFromSpriteVM({
    vmName,
    config,
    logger,
  });

  if (!downloadResult.success) {
    logger.error(`Failed to download from VM: ${downloadResult.error}`);
    throw new SpriteSyncError(
      "download",
      projectRoot,
      downloadResult.error || "Unknown error",
    );
  }

  logger.info(`Downloaded archive: ${downloadResult.archiveSize} bytes`);

  const extractResult = await extractProjectArchive({
    archiveBuffer: downloadResult.archiveBuffer!,
    projectRoot,
    logger,
  });

  if (!extractResult.success) {
    logger.error(`Failed to extract archive: ${extractResult.error}`);
    throw new SpriteSyncError(
      "extract",
      projectRoot,
      extractResult.error || "Unknown error",
    );
  }

  logger.info(`Files pulled to ${extractResult.extractedPath}`);
  return true;
}
