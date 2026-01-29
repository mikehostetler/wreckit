import { Logger } from "./logging";
import { toExitCode, isWreckitError } from "./errors";

export interface CommandOptions {
  verbose?: boolean;
  quiet?: boolean;
  dryRun?: boolean;
  noTui?: boolean;
  tuiDebug?: boolean;
  cwd?: string;
  mockAgent?: boolean;
}

export async function executeCommand(
  fn: () => Promise<void>,
  logger: Logger,
  options: CommandOptions,
): Promise<never | void> {
  try {
    await fn();
  } catch (error) {
    handleError(error, logger, options);
    process.exit(toExitCode(error));
  }
}

export function handleError(
  error: unknown,
  logger: Logger,
  options: CommandOptions,
): void {
  if (isWreckitError(error)) {
    logger.error(`[${error.code}] ${error.message}`);
  } else if (error instanceof Error) {
    logger.error(error.message);
    if (options.verbose) {
      logger.debug(error.stack || "");
    }
  } else {
    logger.error(String(error));
  }
}

export interface CleanupHandler {
  cleanup: () => Promise<void>;
  timeout?: number; // Default 10 seconds
}

export function setupInterruptHandler(
  logger: Logger,
  cleanup?: CleanupHandler,
): void {
  let interrupted = false;

  process.on("SIGINT", async () => {
    if (interrupted) {
      process.exit(130);
    }
    interrupted = true;
    logger.warn("\nInterrupted. Press Ctrl+C again to force exit.");

    // Run cleanup if provided
    if (cleanup) {
      try {
        logger.info("Interrupted. Cleaning up...");
        const timeout = cleanup.timeout || 10000; // Default 10 seconds
        await Promise.race([
          cleanup.cleanup(),
          new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error("Cleanup timeout")), timeout),
          ),
        ]);
        logger.info("Cleanup completed");
      } catch (err) {
        logger.error(`Cleanup failed: ${(err as Error).message}`);
        // Proceed with exit even if cleanup fails
      }
    }

    setTimeout(() => process.exit(130), 100);
  });
}
