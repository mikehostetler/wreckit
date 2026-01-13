import pino from "pino";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  json(data: unknown): void;
}

export interface LoggerOptions {
  verbose?: boolean;
  quiet?: boolean;
  noColor?: boolean;
  debug?: boolean;
}

function createPinoLogger(options?: LoggerOptions): pino.Logger {
  const { verbose = false, quiet = false, debug = false } = options ?? {};

  const level = quiet ? "error" : verbose ? "debug" : "info";

  if (debug) {
    return pino({
      level,
      timestamp: pino.stdTimeFunctions.isoTime,
    });
  }

  return pino({
    level,
    transport: {
      target: "pino-pretty",
      options: {
        colorize: !(options?.noColor ?? false),
        ignore: "pid,hostname",
        translateTime: false,
        messageFormat: "{msg}",
        customPrettifiers: {
          level: () => "",
        },
      },
    },
  });
}

function createFallbackLogger(options?: LoggerOptions): pino.Logger {
  const { verbose = false, quiet = false } = options ?? {};
  const level = quiet ? "error" : verbose ? "debug" : "info";

  return pino({
    level,
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

export function createLogger(options?: LoggerOptions): Logger {
  let pinoLogger: pino.Logger;

  try {
    pinoLogger = createPinoLogger(options);
  } catch {
    pinoLogger = createFallbackLogger(options);
  }

  return {
    debug(message: string, ...args: unknown[]): void {
      if (args.length > 0) {
        pinoLogger.debug({ args }, message);
      } else {
        pinoLogger.debug(message);
      }
    },
    info(message: string, ...args: unknown[]): void {
      if (args.length > 0) {
        pinoLogger.info({ args }, message);
      } else {
        pinoLogger.info(message);
      }
    },
    warn(message: string, ...args: unknown[]): void {
      if (args.length > 0) {
        pinoLogger.warn({ args }, message);
      } else {
        pinoLogger.warn(message);
      }
    },
    error(message: string, ...args: unknown[]): void {
      if (args.length > 0) {
        pinoLogger.error({ args }, message);
      } else {
        pinoLogger.error(message);
      }
    },
    json(data: unknown): void {
      console.log(JSON.stringify(data));
    },
  };
}

export let logger: Logger = createLogger();

export function setLogger(l: Logger): void {
  logger = l;
}

export function initLogger(options?: LoggerOptions): Logger {
  const l = createLogger(options);
  setLogger(l);
  return l;
}
