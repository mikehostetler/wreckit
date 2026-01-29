import { logger } from "../logging";
import type { Logger } from "../logging";
import { findRepoRoot, resolveCwd } from "../fs/paths";
import {
  calculateAllHashes,
  readBuildMetadata,
  isOutOfSync,
  startWatcher,
  safeRebuild,
} from "../integrity";

export interface CheckIntegrityOptions {
  cwd: string;
  json?: boolean;
}

export interface WatchdogOptions {
  cwd: string;
  debounceMs?: number;
  json?: boolean;
}

/**
 * Check build integrity by comparing current source hashes with stored metadata.
 *
 * Exit codes:
 * - 0: Build is up-to-date
 * - 1: Build is out-of-sync or missing
 */
export async function checkIntegrityCommand(
  options: CheckIntegrityOptions,
  log: Logger = logger,
): Promise<void> {
  const root = findRepoRoot(options.cwd);

  try {
    // Calculate current hashes
    log.info("Calculating source hashes...");
    const { sourceHash, promptsHash } = await calculateAllHashes();

    // Read stored metadata
    const metadata = await readBuildMetadata(root);

    if (!metadata) {
      log.warn("No build metadata found - dist/ may be out-of-sync");
      if (options.json) {
        console.log(
          JSON.stringify({
            status: "stale",
            reason: "no_metadata",
            message: "No build metadata found",
          }),
        );
      }
      process.exit(1);
    }

    // Check if out-of-sync
    const outOfSync = await isOutOfSync(sourceHash, promptsHash, root);

    if (outOfSync) {
      log.warn("Build is out-of-sync - run 'wreckit build' or 'npm run build'");
      if (options.json) {
        console.log(
          JSON.stringify({
            status: "stale",
            reason: "hash_mismatch",
            message: "Source files have changed since last build",
            current: { sourceHash, promptsHash },
            stored: {
              sourceHash: metadata.sourceHash,
              promptsHash: metadata.promptsHash,
            },
          }),
        );
      }
      process.exit(1);
    }

    // Build is up-to-date
    log.info("Build is up-to-date");
    if (options.json) {
      console.log(
        JSON.stringify({
          status: "ok",
          message: "Build is up-to-date",
          lastBuildTime: metadata.lastBuildTime,
        }),
      );
    }
    process.exit(0);
  } catch (err) {
    log.error(`Failed to check integrity: ${(err as Error).message}`);
    if (options.json) {
      console.log(
        JSON.stringify({
          status: "error",
          error: (err as Error).message,
        }),
      );
    }
    process.exit(1);
  }
}

/**
 * Watchdog daemon mode - watch files and rebuild on changes.
 */
export async function watchdogCommand(
  options: WatchdogOptions,
  log: Logger = logger,
): Promise<void> {
  const root = findRepoRoot(options.cwd);

  log.info("Starting Watchdog daemon...");
  log.info(`Watching ${root}/src for changes...`);
  log.info("Press Ctrl+C to stop");

  // Track build stats
  let buildCount = 0;
  let successCount = 0;
  let errorCount = 0;

  const handle = startWatcher({
    root,
    debounceMs: options.debounceMs || 500,
    logger: log,
    onChange: (files) => {
      if (options.json) {
        console.log(
          JSON.stringify({
            event: "change",
            files,
            timestamp: new Date().toISOString(),
          }),
        );
      } else {
        log.debug(`Changes detected in ${files.length} file(s)`);
      }
    },
    onBuildStart: () => {
      buildCount++;
      if (options.json) {
        console.log(
          JSON.stringify({
            event: "build_start",
            build: buildCount,
            timestamp: new Date().toISOString(),
          }),
        );
      } else {
        log.info(`Build #${buildCount} started`);
      }
    },
    onBuildSuccess: (duration) => {
      successCount++;
      if (options.json) {
        console.log(
          JSON.stringify({
            event: "build_success",
            build: buildCount,
            duration,
            timestamp: new Date().toISOString(),
          }),
        );
      } else {
        log.info(`Build #${buildCount} succeeded in ${duration}ms`);
        log.info(`Stats: ${successCount} successful, ${errorCount} failed`);
      }
    },
    onBuildError: (error) => {
      errorCount++;
      if (options.json) {
        console.log(
          JSON.stringify({
            event: "build_error",
            build: buildCount,
            error,
            timestamp: new Date().toISOString(),
          }),
        );
      } else {
        log.error(`Build #${buildCount} failed: ${error}`);
        log.info(`Stats: ${successCount} successful, ${errorCount} failed`);
      }
    },
  });

  // Handle graceful shutdown
  process.on("SIGINT", async () => {
    log.info("\nShutting down Watchdog...");
    await handle.stop();
    log.info(`Final stats: ${buildCount} builds, ${successCount} successful, ${errorCount} failed`);
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    log.info("\nShutting down Watchdog...");
    await handle.stop();
    log.info(`Final stats: ${buildCount} builds, ${successCount} successful, ${errorCount} failed`);
    process.exit(0);
  });

  // Keep process alive
  await new Promise(() => {});
}

/**
 * CLI command for checking build integrity.
 */
export function createCheckIntegrityCommand() {
  return {
    command: "check-integrity",
    describe: "Check if dist/ is in sync with src/",
    builder: (yargs: any) => {
      return yargs.option("json", {
        type: "boolean",
        description: "Output as JSON",
      });
    },
    handler: async (argv: any) => {
      await checkIntegrityCommand({
        cwd: resolveCwd(argv.cwd),
        json: argv.json,
      });
    },
  };
}

/**
 * CLI command for watchdog daemon.
 */
export function createWatchdogCommand() {
  return {
    command: "watchdog",
    describe: "Watch source files and rebuild on changes",
    builder: (yargs: any) => {
      return yargs
        .option("debounce-ms", {
          type: "number",
          description: "Debounce delay in milliseconds",
          default: 500,
        })
        .option("json", {
          type: "boolean",
          description: "Output as JSON",
        });
    },
    handler: async (argv: any) => {
      await watchdogCommand({
        cwd: resolveCwd(argv.cwd),
        debounceMs: argv.debounceMs,
        json: argv.json,
      });
    },
  };
}
