export class WreckitError extends Error {
  constructor(
    message: string,
    public code: string
  ) {
    super(message);
    this.name = "WreckitError";
  }
}

export class RepoNotFoundError extends WreckitError {
  constructor(message: string) {
    super(message, "REPO_NOT_FOUND");
    this.name = "RepoNotFoundError";
  }
}

export class InvalidJsonError extends WreckitError {
  constructor(message: string) {
    super(message, "INVALID_JSON");
    this.name = "InvalidJsonError";
  }
}

export class SchemaValidationError extends WreckitError {
  constructor(message: string) {
    super(message, "SCHEMA_VALIDATION");
    this.name = "SchemaValidationError";
  }
}

export class FileNotFoundError extends WreckitError {
  constructor(message: string) {
    super(message, "FILE_NOT_FOUND");
    this.name = "FileNotFoundError";
  }
}

export class ConfigError extends WreckitError {
  constructor(message: string) {
    super(message, "CONFIG_ERROR");
    this.name = "ConfigError";
  }
}

export class AgentError extends WreckitError {
  constructor(message: string) {
    super(message, "AGENT_ERROR");
    this.name = "AgentError";
  }
}

export class GitError extends WreckitError {
  constructor(message: string) {
    super(message, "GIT_ERROR");
    this.name = "GitError";
  }
}

export class TimeoutError extends WreckitError {
  constructor(message: string) {
    super(message, "TIMEOUT");
    this.name = "TimeoutError";
  }
}

export class InterruptedError extends WreckitError {
  constructor() {
    super("Operation interrupted", "INTERRUPTED");
    this.name = "InterruptedError";
  }
}

export function toExitCode(error: unknown): number {
  if (error === null || error === undefined) {
    return 0;
  }

  if (error instanceof InterruptedError) {
    return 130;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes("sigint") || message.includes("interrupted")) {
      return 130;
    }
  }

  return 1;
}

export function wrapError(error: unknown, context: string): WreckitError {
  if (error instanceof WreckitError) {
    return new WreckitError(`${context}: ${error.message}`, error.code);
  }

  if (error instanceof Error) {
    return new WreckitError(`${context}: ${error.message}`, "WRAPPED_ERROR");
  }

  return new WreckitError(`${context}: ${String(error)}`, "WRAPPED_ERROR");
}

export class PayloadValidationError extends WreckitError {
  constructor(message: string) {
    super(message, "PAYLOAD_VALIDATION");
    this.name = "PayloadValidationError";
  }
}

export class McpToolNotCalledError extends WreckitError {
  constructor(message: string) {
    super(message, "MCP_TOOL_NOT_CALLED");
    this.name = "McpToolNotCalledError";
  }
}

export class AmbiguousIdError extends WreckitError {
  constructor(
    public input: string,
    public matches: string[]
  ) {
    const matchList = matches.map((id) => `  - ${id}`).join("\n");
    super(
      `Ambiguous ID '${input}' matches multiple items:\n${matchList}\nUse the full ID to specify which item.`,
      "AMBIGUOUS_ID"
    );
    this.name = "AmbiguousIdError";
  }
}

export class ItemNotFoundError extends WreckitError {
  constructor(input: string) {
    super(
      `Item not found: '${input}'. Use 'wreckit list' to see available items.`,
      "ITEM_NOT_FOUND"
    );
    this.name = "ItemNotFoundError";
  }
}

export function isWreckitError(error: unknown): error is WreckitError {
  return error instanceof WreckitError;
}
