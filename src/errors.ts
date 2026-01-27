export class WreckitError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = "WreckitError";
  }
}

/**
 * Error codes for programmatic error handling.
 * All error codes are uppercase snake_case.
 */
export const ErrorCodes = {
  // Existing codes
  REPO_NOT_FOUND: "REPO_NOT_FOUND",
  INVALID_JSON: "INVALID_JSON",
  SCHEMA_VALIDATION: "SCHEMA_VALIDATION",
  FILE_NOT_FOUND: "FILE_NOT_FOUND",
  CONFIG_ERROR: "CONFIG_ERROR",
  AGENT_ERROR: "AGENT_ERROR",
  GIT_ERROR: "GIT_ERROR",
  TIMEOUT: "TIMEOUT",
  INTERRUPTED: "INTERRUPTED",
  PAYLOAD_VALIDATION: "PAYLOAD_VALIDATION",
  MCP_TOOL_NOT_CALLED: "MCP_TOOL_NOT_CALLED",
  AMBIGUOUS_ID: "AMBIGUOUS_ID",
  ITEM_NOT_FOUND: "ITEM_NOT_FOUND",
  NOT_GIT_REPO: "NOT_GIT_REPO",
  WRECKIT_EXISTS: "WRECKIT_EXISTS",
  WRAPPED_ERROR: "WRAPPED_ERROR",

  // Phase errors
  PHASE_FAILED: "PHASE_FAILED",
  PHASE_VALIDATION: "PHASE_VALIDATION",
  INVALID_TRANSITION: "INVALID_TRANSITION",
  INVALID_STATE: "INVALID_STATE",
  ARTIFACT_NOT_CREATED: "ARTIFACT_NOT_CREATED",

  // Quality validation errors
  RESEARCH_QUALITY: "RESEARCH_QUALITY",
  PLAN_QUALITY: "PLAN_QUALITY",
  STORY_QUALITY: "STORY_QUALITY",

  // Git operation errors
  BRANCH_ERROR: "BRANCH_ERROR",
  PUSH_ERROR: "PUSH_ERROR",
  PR_CREATION_ERROR: "PR_CREATION_ERROR",
  MERGE_CONFLICT: "MERGE_CONFLICT",
  REMOTE_VALIDATION: "REMOTE_VALIDATION",

  // Sprite/Wisp errors (Item 073)
  WISP_NOT_FOUND: "WISP_NOT_FOUND",
  SPRITE_START_FAILED: "SPRITE_START_FAILED",
  SPRITE_ATTACH_FAILED: "SPRITE_ATTACH_FAILED",
  SPRITE_KILL_FAILED: "SPRITE_KILL_FAILED",

  // Artifact read errors (for permission/I/O issues)
  ARTIFACT_READ_ERROR: "ARTIFACT_READ_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export class RepoNotFoundError extends WreckitError {
  constructor(message: string) {
    super(message, ErrorCodes.REPO_NOT_FOUND);
    this.name = "RepoNotFoundError";
  }
}

export class InvalidJsonError extends WreckitError {
  constructor(message: string) {
    super(message, ErrorCodes.INVALID_JSON);
    this.name = "InvalidJsonError";
  }
}

export class SchemaValidationError extends WreckitError {
  constructor(message: string) {
    super(message, ErrorCodes.SCHEMA_VALIDATION);
    this.name = "SchemaValidationError";
  }
}

export class FileNotFoundError extends WreckitError {
  constructor(message: string) {
    super(message, ErrorCodes.FILE_NOT_FOUND);
    this.name = "FileNotFoundError";
  }
}

/**
 * Thrown when an artifact exists but cannot be read due to permission or I/O errors.
 * This distinguishes "file cannot be accessed" from "file does not exist" (FileNotFoundError).
 */
export class ArtifactReadError extends WreckitError {
  constructor(
    public readonly filePath: string,
    public readonly cause: Error,
  ) {
    super(
      `Cannot read artifact ${filePath}: ${cause.message}`,
      ErrorCodes.ARTIFACT_READ_ERROR,
    );
    this.name = "ArtifactReadError";
  }
}

export class ConfigError extends WreckitError {
  constructor(message: string) {
    super(message, ErrorCodes.CONFIG_ERROR);
    this.name = "ConfigError";
  }
}

export class AgentError extends WreckitError {
  constructor(message: string) {
    super(message, ErrorCodes.AGENT_ERROR);
    this.name = "AgentError";
  }
}

export class GitError extends WreckitError {
  constructor(message: string) {
    super(message, ErrorCodes.GIT_ERROR);
    this.name = "GitError";
  }
}

export class TimeoutError extends WreckitError {
  constructor(message: string) {
    super(message, ErrorCodes.TIMEOUT);
    this.name = "TimeoutError";
  }
}

export class InterruptedError extends WreckitError {
  constructor() {
    super("Operation interrupted", ErrorCodes.INTERRUPTED);
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
    return new WreckitError(
      `${context}: ${error.message}`,
      ErrorCodes.WRAPPED_ERROR,
    );
  }

  return new WreckitError(
    `${context}: ${String(error)}`,
    ErrorCodes.WRAPPED_ERROR,
  );
}

export class PayloadValidationError extends WreckitError {
  constructor(message: string) {
    super(message, ErrorCodes.PAYLOAD_VALIDATION);
    this.name = "PayloadValidationError";
  }
}

export class McpToolNotCalledError extends WreckitError {
  constructor(message: string) {
    super(message, ErrorCodes.MCP_TOOL_NOT_CALLED);
    this.name = "McpToolNotCalledError";
  }
}

export class AmbiguousIdError extends WreckitError {
  constructor(
    public input: string,
    public matches: string[],
  ) {
    const matchList = matches.map((id) => `  - ${id}`).join("\n");
    super(
      `Ambiguous ID '${input}' matches multiple items:\n${matchList}\nUse the full ID to specify which item.`,
      ErrorCodes.AMBIGUOUS_ID,
    );
    this.name = "AmbiguousIdError";
  }
}

export class ItemNotFoundError extends WreckitError {
  constructor(input: string) {
    super(
      `Item not found: '${input}'. Use 'wreckit list' to see available items.`,
      ErrorCodes.ITEM_NOT_FOUND,
    );
    this.name = "ItemNotFoundError";
  }
}

// ============================================================================
// Phase-Specific Error Classes (US-002)
// ============================================================================

/**
 * Thrown when a phase fails to complete successfully.
 */
export class PhaseFailedError extends WreckitError {
  constructor(
    public readonly phase: string,
    public readonly itemId: string,
    message: string,
  ) {
    super(message, ErrorCodes.PHASE_FAILED);
    this.name = "PhaseFailedError";
  }
}

/**
 * Thrown when phase prerequisites or validation fails.
 */
export class PhaseValidationError extends WreckitError {
  constructor(
    public readonly phase: string,
    message: string,
  ) {
    super(message, ErrorCodes.PHASE_VALIDATION);
    this.name = "PhaseValidationError";
  }
}

/**
 * Thrown when a state transition is invalid.
 */
export class TransitionError extends WreckitError {
  constructor(
    public readonly fromState: string,
    public readonly toState: string,
    message: string,
  ) {
    super(message, ErrorCodes.INVALID_TRANSITION);
    this.name = "TransitionError";
  }
}

/**
 * Thrown when an expected artifact is not created by an agent.
 */
export class ArtifactNotCreatedError extends WreckitError {
  constructor(
    public readonly artifactPath: string,
    public readonly phase: string,
  ) {
    super(
      `Agent did not create ${artifactPath} during ${phase} phase`,
      ErrorCodes.ARTIFACT_NOT_CREATED,
    );
    this.name = "ArtifactNotCreatedError";
  }
}

// ============================================================================
// Quality Validation Error Classes (US-003)
// ============================================================================

/**
 * Thrown when research document fails quality validation.
 */
export class ResearchQualityError extends WreckitError {
  constructor(public readonly errors: string[]) {
    super(
      `Research quality validation failed:\n${errors.join("\n")}`,
      ErrorCodes.RESEARCH_QUALITY,
    );
    this.name = "ResearchQualityError";
  }
}

/**
 * Thrown when plan document fails quality validation.
 */
export class PlanQualityError extends WreckitError {
  constructor(public readonly errors: string[]) {
    super(
      `Plan quality validation failed:\n${errors.join("\n")}`,
      ErrorCodes.PLAN_QUALITY,
    );
    this.name = "PlanQualityError";
  }
}

/**
 * Thrown when stories fail quality validation.
 */
export class StoryQualityError extends WreckitError {
  constructor(public readonly errors: string[]) {
    super(
      `Story quality validation failed:\n${errors.join("\n")}`,
      ErrorCodes.STORY_QUALITY,
    );
    this.name = "StoryQualityError";
  }
}

// ============================================================================
// Git Operation Error Classes (US-004)
// ============================================================================

/**
 * Thrown when a git branch operation fails.
 */
export class BranchError extends WreckitError {
  constructor(
    public readonly branchName: string,
    public readonly operation: "create" | "checkout" | "delete",
    message: string,
  ) {
    super(message, ErrorCodes.BRANCH_ERROR);
    this.name = "BranchError";
  }
}

/**
 * Thrown when pushing to remote fails.
 */
export class PushError extends WreckitError {
  constructor(
    public readonly branchName: string,
    public readonly remote: string,
    message: string,
  ) {
    super(message, ErrorCodes.PUSH_ERROR);
    this.name = "PushError";
  }
}

/**
 * Thrown when PR creation fails.
 */
export class PrCreationError extends WreckitError {
  constructor(
    public readonly headBranch: string,
    public readonly baseBranch: string,
    message: string,
  ) {
    super(message, ErrorCodes.PR_CREATION_ERROR);
    this.name = "PrCreationError";
  }
}

/**
 * Thrown when a merge conflict is detected.
 */
export class MergeConflictError extends WreckitError {
  constructor(
    public readonly sourceBranch: string,
    public readonly targetBranch: string,
  ) {
    super(
      `Merge conflict detected: ${sourceBranch} cannot be cleanly merged into ${targetBranch}`,
      ErrorCodes.MERGE_CONFLICT,
    );
    this.name = "MergeConflictError";
  }
}

/**
 * Thrown when remote URL validation fails.
 */
export class RemoteValidationError extends WreckitError {
  constructor(
    public readonly remoteName: string,
    public readonly actualUrl: string | null,
    public readonly allowedPatterns: string[],
  ) {
    super(
      `Remote URL validation failed. URL '${actualUrl}' does not match allowed patterns: ${allowedPatterns.join(", ")}`,
      ErrorCodes.REMOTE_VALIDATION,
    );
    this.name = "RemoteValidationError";
  }
}

export function isWreckitError(error: unknown): error is WreckitError {
  return error instanceof WreckitError;
}

// ============================================================================
// Sprite/Wisp Error Classes (US-073-003)
// ============================================================================

/**
 * Thrown when the wisp CLI binary is not found.
 */
export class WispNotFoundError extends WreckitError {
  constructor(
    public readonly wispPath: string,
  ) {
    super(
      `Wisp CLI not found at '${wispPath}'. Install Wisp to enable Sprite support:\n  https://github.com/example/wisp (replace with actual URL)`,
      ErrorCodes.WISP_NOT_FOUND,
    );
    this.name = "WispNotFoundError";
  }
}

/**
 * Thrown when starting a Sprite VM fails.
 */
export class SpriteStartError extends WreckitError {
  constructor(
    public readonly spriteName: string,
    message: string,
  ) {
    super(`Failed to start Sprite '${spriteName}': ${message}`, ErrorCodes.SPRITE_START_FAILED);
    this.name = "SpriteStartError";
  }
}

/**
 * Thrown when attaching to a Sprite VM fails.
 */
export class SpriteAttachError extends WreckitError {
  constructor(
    public readonly spriteName: string,
    message: string,
  ) {
    super(`Failed to attach to Sprite '${spriteName}': ${message}`, ErrorCodes.SPRITE_ATTACH_FAILED);
    this.name = "SpriteAttachError";
  }
}

/**
 * Thrown when killing a Sprite VM fails.
 */
export class SpriteKillError extends WreckitError {
  constructor(
    public readonly spriteName: string,
    message: string,
  ) {
    super(`Failed to kill Sprite '${spriteName}': ${message}`, ErrorCodes.SPRITE_KILL_FAILED);
    this.name = "SpriteKillError";
  }
}
