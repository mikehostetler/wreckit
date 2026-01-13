import { Logger } from './logging';
import { toExitCode, isWreckitError } from './errors';

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
  options: CommandOptions
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
  options: CommandOptions
): void {
  if (isWreckitError(error)) {
    logger.error(`[${error.code}] ${error.message}`);
  } else if (error instanceof Error) {
    logger.error(error.message);
    if (options.verbose) {
      logger.debug(error.stack || '');
    }
  } else {
    logger.error(String(error));
  }
}

export function setupInterruptHandler(logger: Logger): void {
  let interrupted = false;

  process.on('SIGINT', () => {
    if (interrupted) {
      process.exit(130);
    }
    interrupted = true;
    logger.warn('\nInterrupted. Press Ctrl+C again to force exit.');
    setTimeout(() => process.exit(130), 100);
  });
}
