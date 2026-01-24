# Add Distinct Error Types for Different Failure Modes Implementation Plan

## Implementation Plan Title

Add distinct error types for different failure modes across all phases

## Overview

This implementation adds distinct error types for different failure modes across all phases of the wreckit workflow. The goal is to replace generic `Error` throws and string-based error returns with typed error classes that enable programmatic error handling, consistent exit codes, and better debugging.

## Current State

The codebase has an existing error hierarchy in `src/errors.ts:1-145` with:
- **Base class**: `WreckitError` with `message` and `code` properties
- **14 existing subclasses**: `RepoNotFoundError`, `InvalidJsonError`, `SchemaValidationError`, `FileNotFoundError`, `ConfigError`, `AgentError`, `GitError`, `TimeoutError`, `InterruptedError`, `PayloadValidationError`, `McpToolNotCalledError`, `AmbiguousIdError`, `ItemNotFoundError`, `NotGitRepoError`, `WreckitExistsError`
- **Utility functions**: `toExitCode()`, `wrapError()`, `isWreckitError()`

**Key gaps identified:**

1. **Git operations** (`src/git/index.ts`) use generic `throw new Error()` instead of `GitError` subclasses (lines 343, 361, 463-476, 637-640, 708-714, 828, 834, 845)

2. **Workflow layer** (`src/workflow/itemWorkflow.ts`) returns string errors via `PhaseResult.error` instead of typed errors (lines 203-208, 269-280, 318-323, etc.)

3. **Missing error types** for:
   - Phase-specific failures (validation, execution, artifact creation)
   - Quality validation failures (research, plan, story)
   - Git operation subtypes (branch, push, PR, merge conflict)

## Desired End State

After implementation:
1. All error throws use typed `WreckitError` subclasses with specific error codes
2. `PhaseResult.error` supports both strings (backwards compatible) and `WreckitError`
3. Git operations throw specific error subtypes (`BranchError`, `PushError`, etc.)
4. Error codes exported as constants for programmatic use
5. All new error types tested with consistent patterns

**Verification:**
- Run `npm test` - all tests pass including new error type tests
- Run `npm run typecheck` - no type errors
- Grep for `throw new Error` shows only test files and legitimate non-wreckit errors

### Key Discoveries:

- `src/errors.ts:1-145` - Well-structured error hierarchy to extend
- `src/errors.ts:74-91` - `toExitCode()` maps errors to exit codes (0, 1, 130)
- `src/workflow/itemWorkflow.ts:80-84` - `PhaseResult.error` is currently `string | undefined`
- `src/git/index.ts:343-475` - Multiple `throw new Error()` sites need conversion
- `src/domain/transitions.ts:11-14` - `TransitionError` interface exists but is not a class
- `src/commands/init.ts:14-28` - Pattern for command-specific errors (`NotGitRepoError`, `WreckitExistsError`)

## What We're NOT Doing

1. **NOT changing validation function return types** - `validateResearchQuality`, `validatePlanQuality`, etc. will continue returning `ValidationResult` objects. Error types are for thrown errors, not validation results.

2. **NOT breaking backwards compatibility** - `PhaseResult.error` will accept both strings and `WreckitError` via union type.

3. **NOT adding recovery/rollback logic** - This item only defines error types. Recovery logic is a separate milestone item.

4. **NOT changing exit code mappings** - All new errors map to exit code 1 (standard error), preserving existing behavior for `InterruptedError` (130).

5. **NOT adding error telemetry or reporting** - Error types only; observability is separate.

## Implementation Approach

We'll implement in 4 phases to minimize risk and enable incremental testing:

1. **Phase 1**: Define all new error types in `src/errors.ts` with error code constants
2. **Phase 2**: Update Git operations to use typed errors
3. **Phase 3**: Update workflow layer with typed errors while maintaining backwards compatibility
4. **Phase 4**: Add comprehensive tests for all new error types

---

## Phases

### Phase 1: Define New Error Types

### Overview

Add all new error classes to `src/errors.ts` following existing patterns. Export error codes as constants for programmatic access.

### Changes Required:

#### 1. Error Codes Constants
**File**: `src/errors.ts`
**Location**: After line 9 (after `WreckitError` class)
**Changes**: Add error code constants

```typescript
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
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];
```

#### 2. Phase-Specific Error Classes
**File**: `src/errors.ts`
**Location**: After existing error classes (before `toExitCode`)
**Changes**: Add phase-specific errors

```typescript
/**
 * Thrown when a phase fails to complete successfully.
 */
export class PhaseFailedError extends WreckitError {
  constructor(
    public readonly phase: string,
    public readonly itemId: string,
    message: string
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
    message: string
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
    message: string
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
    public readonly phase: string
  ) {
    super(`Agent did not create ${artifactPath} during ${phase} phase`, ErrorCodes.ARTIFACT_NOT_CREATED);
    this.name = "ArtifactNotCreatedError";
  }
}
```

#### 3. Quality Validation Error Classes
**File**: `src/errors.ts`
**Location**: After phase errors
**Changes**: Add quality validation errors

```typescript
/**
 * Thrown when research document fails quality validation.
 */
export class ResearchQualityError extends WreckitError {
  constructor(
    public readonly errors: string[]
  ) {
    super(`Research quality validation failed:\n${errors.join("\n")}`, ErrorCodes.RESEARCH_QUALITY);
    this.name = "ResearchQualityError";
  }
}

/**
 * Thrown when plan document fails quality validation.
 */
export class PlanQualityError extends WreckitError {
  constructor(
    public readonly errors: string[]
  ) {
    super(`Plan quality validation failed:\n${errors.join("\n")}`, ErrorCodes.PLAN_QUALITY);
    this.name = "PlanQualityError";
  }
}

/**
 * Thrown when stories fail quality validation.
 */
export class StoryQualityError extends WreckitError {
  constructor(
    public readonly errors: string[]
  ) {
    super(`Story quality validation failed:\n${errors.join("\n")}`, ErrorCodes.STORY_QUALITY);
    this.name = "StoryQualityError";
  }
}
```

#### 4. Git Operation Error Classes
**File**: `src/errors.ts`
**Location**: After quality errors
**Changes**: Add git operation errors

```typescript
/**
 * Thrown when a git branch operation fails.
 */
export class BranchError extends WreckitError {
  constructor(
    public readonly branchName: string,
    public readonly operation: "create" | "checkout" | "delete",
    message: string
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
    message: string
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
    message: string
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
    public readonly targetBranch: string
  ) {
    super(
      `Merge conflict detected: ${sourceBranch} cannot be cleanly merged into ${targetBranch}`,
      ErrorCodes.MERGE_CONFLICT
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
    public readonly allowedPatterns: string[]
  ) {
    super(
      `Remote URL validation failed. URL '${actualUrl}' does not match allowed patterns: ${allowedPatterns.join(", ")}`,
      ErrorCodes.REMOTE_VALIDATION
    );
    this.name = "RemoteValidationError";
  }
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Tests pass: `npm test`
- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] New error classes are exported from `src/errors.ts`
- [ ] `ErrorCodes` constant is exported and contains all codes
- [ ] Each error class has correct `code` and `name` properties

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to Phase 2.

---

### Phase 2: Update Git Operations

### Overview

Replace generic `throw new Error()` in `src/git/index.ts` with specific typed errors.

### Changes Required:

#### 1. Import New Errors
**File**: `src/git/index.ts`
**Location**: Add import at top
**Changes**:

```typescript
import {
  BranchError,
  PushError,
  PrCreationError,
  MergeConflictError,
  GitError,
} from "../errors";
```

#### 2. Update getCurrentBranch
**File**: `src/git/index.ts`
**Location**: Line 342-346
**Changes**: Replace generic Error

```typescript
// Before:
if (result.exitCode !== 0) {
  throw new Error("Failed to get current branch");
}

// After:
if (result.exitCode !== 0) {
  throw new GitError("Failed to get current branch");
}
```

#### 3. Update getBranchSha
**File**: `src/git/index.ts`
**Location**: Line 360-362
**Changes**: Replace generic Error

```typescript
// Before:
if (result.exitCode !== 0) {
  throw new Error(`Failed to get SHA for ${branch}`);
}

// After:
if (result.exitCode !== 0) {
  throw new GitError(`Failed to get SHA for ${branch}`);
}
```

#### 4. Update ensureBranch
**File**: `src/git/index.ts`
**Location**: Lines 461-476
**Changes**: Replace generic Errors with BranchError

```typescript
// Before:
if (checkoutResult.exitCode !== 0) {
  throw new Error(`Failed to checkout existing branch ${branchName}`);
}
// ...
if (checkoutBase.exitCode !== 0) {
  throw new Error(`Failed to checkout base branch ${baseBranch}`);
}
// ...
if (createBranch.exitCode !== 0) {
  throw new Error(`Failed to create branch ${branchName}`);
}

// After:
if (checkoutResult.exitCode !== 0) {
  throw new BranchError(branchName, "checkout", `Failed to checkout existing branch ${branchName}`);
}
// ...
if (checkoutBase.exitCode !== 0) {
  throw new BranchError(baseBranch, "checkout", `Failed to checkout base branch ${baseBranch}`);
}
// ...
if (createBranch.exitCode !== 0) {
  throw new BranchError(branchName, "create", `Failed to create branch ${branchName}`);
}
```

#### 5. Update pushBranch
**File**: `src/git/index.ts`
**Location**: Lines 636-641
**Changes**: Replace generic Error with PushError

```typescript
// Before:
if (result.exitCode !== 0) {
  throw new Error(
    `Failed to push branch ${branchName} to origin. ` +
    `Check that you have push access and the remote is configured correctly.`
  );
}

// After:
if (result.exitCode !== 0) {
  throw new PushError(
    branchName,
    "origin",
    `Failed to push branch ${branchName} to origin. ` +
    `Check that you have push access and the remote is configured correctly.`
  );
}
```

#### 6. Update createOrUpdatePr
**File**: `src/git/index.ts`
**Location**: Lines 707-714
**Changes**: Replace generic Errors with PrCreationError

```typescript
// Before:
if (result.exitCode !== 0) {
  throw new Error(`Failed to create PR: ${result.stdout}`);
}

const prInfo = await getPrByBranch(headBranch, options);
if (!prInfo) {
  throw new Error("PR was created but could not retrieve its info");
}

// After:
if (result.exitCode !== 0) {
  throw new PrCreationError(headBranch, baseBranch, `Failed to create PR: ${result.stdout}`);
}

const prInfo = await getPrByBranch(headBranch, options);
if (!prInfo) {
  throw new PrCreationError(headBranch, baseBranch, "PR was created but could not retrieve its info");
}
```

#### 7. Update mergeAndPushToBase
**File**: `src/git/index.ts`
**Location**: Lines 826-849
**Changes**: Replace generic Errors

```typescript
// Before:
if (checkoutResult.exitCode !== 0) {
  throw new Error(`Failed to checkout base branch ${baseBranch}`);
}
// ...
if (pullResult.exitCode !== 0) {
  throw new Error(
    `Failed to pull latest ${baseBranch}. Resolve conflicts manually or try again.`
  );
}
// ...
if (mergeResult.exitCode !== 0) {
  throw new Error(
    `Failed to merge ${featureBranch} into ${baseBranch}. ` +
    `There may be merge conflicts that need manual resolution.`
  );
}

// After:
if (checkoutResult.exitCode !== 0) {
  throw new BranchError(baseBranch, "checkout", `Failed to checkout base branch ${baseBranch}`);
}
// ...
if (pullResult.exitCode !== 0) {
  throw new GitError(
    `Failed to pull latest ${baseBranch}. Resolve conflicts manually or try again.`
  );
}
// ...
if (mergeResult.exitCode !== 0) {
  throw new MergeConflictError(featureBranch, baseBranch);
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Tests pass: `npm test`
- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] `grep "throw new Error" src/git/index.ts` returns no matches
- [ ] Git operations throw typed errors when simulating failures

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to Phase 3.

---

### Phase 3: Update Workflow Layer

### Overview

Update `PhaseResult.error` type to support typed errors while maintaining backwards compatibility. Update phase runners to use typed errors.

### Changes Required:

#### 1. Update PhaseResult Interface
**File**: `src/workflow/itemWorkflow.ts`
**Location**: Lines 80-84
**Changes**: Support both string and WreckitError

```typescript
// Before:
export interface PhaseResult {
  success: boolean;
  item: Item;
  error?: string;
}

// After:
import { WreckitError } from "../errors";

export interface PhaseResult {
  success: boolean;
  item: Item;
  /**
   * Error message or typed error.
   * @deprecated Use typed WreckitError. String support retained for backwards compatibility.
   */
  error?: string | WreckitError;
}
```

#### 2. Add Helper Function for Error Messages
**File**: `src/workflow/itemWorkflow.ts`
**Location**: After PhaseResult interface
**Changes**: Add utility to extract error message

```typescript
/**
 * Extract error message from PhaseResult.error.
 * Handles both string and WreckitError for backwards compatibility.
 */
function getErrorMessage(error: string | WreckitError | undefined): string | undefined {
  if (error === undefined) return undefined;
  if (typeof error === "string") return error;
  return error.message;
}
```

#### 3. Update Command Layer Error Handling
**File**: `src/commands/run.ts`
**Location**: Lines 150-156
**Changes**: Handle typed errors

```typescript
// Before:
if (!result.success) {
  logger.error(`Phase ${nextPhase} failed for ${itemId}: ${result.error}`);
  throw new WreckitError(
    result.error ?? `Phase ${nextPhase} failed for ${itemId}`,
    "PHASE_FAILED"
  );
}

// After:
if (!result.success) {
  const errorMsg = typeof result.error === "string"
    ? result.error
    : result.error?.message ?? `Phase ${nextPhase} failed for ${itemId}`;
  logger.error(`Phase ${nextPhase} failed for ${itemId}: ${errorMsg}`);

  // Re-throw if already a WreckitError, otherwise wrap
  if (result.error instanceof WreckitError) {
    throw result.error;
  }
  throw new WreckitError(errorMsg, "PHASE_FAILED");
}
```

#### 4. Update runPhaseCommand Error Handling
**File**: `src/commands/phase.ts`
**Location**: Lines 210-215
**Changes**: Handle typed errors

```typescript
// Before:
} else {
  throw new WreckitError(
    result.error ?? `Phase ${phase} failed for ${itemId}`,
    "PHASE_FAILED"
  );
}

// After:
} else {
  const errorMsg = typeof result.error === "string"
    ? result.error
    : result.error?.message ?? `Phase ${phase} failed for ${itemId}`;

  // Re-throw if already a WreckitError, otherwise wrap
  if (result.error instanceof WreckitError) {
    throw result.error;
  }
  throw new WreckitError(errorMsg, "PHASE_FAILED");
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Tests pass: `npm test`
- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] Phase failures preserve typed error codes when re-thrown
- [ ] String errors still work (backwards compatibility)

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to Phase 4.

---

### Phase 4: Add Comprehensive Tests

### Overview

Add unit tests for all new error types following the pattern in `src/__tests__/logging.test.ts`.

### Changes Required:

#### 1. Create Error Types Test File
**File**: `src/__tests__/errors.test.ts`
**Changes**: New test file for error types

```typescript
import { describe, it, expect } from "vitest";
import {
  WreckitError,
  ErrorCodes,
  // Phase errors
  PhaseFailedError,
  PhaseValidationError,
  TransitionError,
  ArtifactNotCreatedError,
  // Quality errors
  ResearchQualityError,
  PlanQualityError,
  StoryQualityError,
  // Git errors
  BranchError,
  PushError,
  PrCreationError,
  MergeConflictError,
  RemoteValidationError,
  // Utilities
  toExitCode,
  isWreckitError,
} from "../errors";

describe("ErrorCodes", () => {
  it("exports all error codes as constants", () => {
    expect(ErrorCodes.PHASE_FAILED).toBe("PHASE_FAILED");
    expect(ErrorCodes.BRANCH_ERROR).toBe("BRANCH_ERROR");
    expect(ErrorCodes.RESEARCH_QUALITY).toBe("RESEARCH_QUALITY");
  });

  it("has consistent code values", () => {
    // Codes should match their key names
    for (const [key, value] of Object.entries(ErrorCodes)) {
      expect(value).toBe(key);
    }
  });
});

describe("Phase Errors", () => {
  describe("PhaseFailedError", () => {
    it("creates error with phase and itemId", () => {
      const error = new PhaseFailedError("research", "item-123", "Agent timed out");
      expect(error.phase).toBe("research");
      expect(error.itemId).toBe("item-123");
      expect(error.message).toBe("Agent timed out");
      expect(error.code).toBe(ErrorCodes.PHASE_FAILED);
      expect(error.name).toBe("PhaseFailedError");
    });

    it("is instanceof WreckitError", () => {
      const error = new PhaseFailedError("plan", "item-456", "Failed");
      expect(error).toBeInstanceOf(WreckitError);
      expect(isWreckitError(error)).toBe(true);
    });
  });

  describe("PhaseValidationError", () => {
    it("creates error with phase", () => {
      const error = new PhaseValidationError("implement", "Not all stories done");
      expect(error.phase).toBe("implement");
      expect(error.code).toBe(ErrorCodes.PHASE_VALIDATION);
    });
  });

  describe("TransitionError", () => {
    it("creates error with state transition info", () => {
      const error = new TransitionError("idea", "implementing", "Cannot skip states");
      expect(error.fromState).toBe("idea");
      expect(error.toState).toBe("implementing");
      expect(error.code).toBe(ErrorCodes.INVALID_TRANSITION);
    });
  });

  describe("ArtifactNotCreatedError", () => {
    it("creates error with artifact path and phase", () => {
      const error = new ArtifactNotCreatedError("research.md", "research");
      expect(error.artifactPath).toBe("research.md");
      expect(error.phase).toBe("research");
      expect(error.message).toContain("research.md");
      expect(error.code).toBe(ErrorCodes.ARTIFACT_NOT_CREATED);
    });
  });
});

describe("Quality Errors", () => {
  describe("ResearchQualityError", () => {
    it("creates error with validation errors", () => {
      const errors = ["Missing Summary section", "Too few citations"];
      const error = new ResearchQualityError(errors);
      expect(error.errors).toEqual(errors);
      expect(error.message).toContain("Missing Summary section");
      expect(error.code).toBe(ErrorCodes.RESEARCH_QUALITY);
    });
  });

  describe("PlanQualityError", () => {
    it("creates error with validation errors", () => {
      const errors = ["Missing phases"];
      const error = new PlanQualityError(errors);
      expect(error.errors).toEqual(errors);
      expect(error.code).toBe(ErrorCodes.PLAN_QUALITY);
    });
  });

  describe("StoryQualityError", () => {
    it("creates error with validation errors", () => {
      const errors = ["Story US-001 has no acceptance criteria"];
      const error = new StoryQualityError(errors);
      expect(error.errors).toEqual(errors);
      expect(error.code).toBe(ErrorCodes.STORY_QUALITY);
    });
  });
});

describe("Git Errors", () => {
  describe("BranchError", () => {
    it("creates error for create operation", () => {
      const error = new BranchError("feature-123", "create", "Branch exists");
      expect(error.branchName).toBe("feature-123");
      expect(error.operation).toBe("create");
      expect(error.code).toBe(ErrorCodes.BRANCH_ERROR);
    });

    it("creates error for checkout operation", () => {
      const error = new BranchError("main", "checkout", "Checkout failed");
      expect(error.operation).toBe("checkout");
    });

    it("creates error for delete operation", () => {
      const error = new BranchError("old-branch", "delete", "Cannot delete");
      expect(error.operation).toBe("delete");
    });
  });

  describe("PushError", () => {
    it("creates error with branch and remote", () => {
      const error = new PushError("feature-123", "origin", "Permission denied");
      expect(error.branchName).toBe("feature-123");
      expect(error.remote).toBe("origin");
      expect(error.code).toBe(ErrorCodes.PUSH_ERROR);
    });
  });

  describe("PrCreationError", () => {
    it("creates error with head and base branches", () => {
      const error = new PrCreationError("feature-123", "main", "No commits");
      expect(error.headBranch).toBe("feature-123");
      expect(error.baseBranch).toBe("main");
      expect(error.code).toBe(ErrorCodes.PR_CREATION_ERROR);
    });
  });

  describe("MergeConflictError", () => {
    it("creates error with source and target branches", () => {
      const error = new MergeConflictError("feature-123", "main");
      expect(error.sourceBranch).toBe("feature-123");
      expect(error.targetBranch).toBe("main");
      expect(error.message).toContain("cannot be cleanly merged");
      expect(error.code).toBe(ErrorCodes.MERGE_CONFLICT);
    });
  });

  describe("RemoteValidationError", () => {
    it("creates error with remote info", () => {
      const error = new RemoteValidationError(
        "origin",
        "git@github.com:other/repo.git",
        ["github.com/myorg/"]
      );
      expect(error.remoteName).toBe("origin");
      expect(error.actualUrl).toBe("git@github.com:other/repo.git");
      expect(error.allowedPatterns).toEqual(["github.com/myorg/"]);
      expect(error.code).toBe(ErrorCodes.REMOTE_VALIDATION);
    });
  });
});

describe("Error Exit Codes", () => {
  it("all new errors return exit code 1", () => {
    expect(toExitCode(new PhaseFailedError("test", "id", "msg"))).toBe(1);
    expect(toExitCode(new BranchError("br", "create", "msg"))).toBe(1);
    expect(toExitCode(new ResearchQualityError(["err"]))).toBe(1);
    expect(toExitCode(new MergeConflictError("a", "b"))).toBe(1);
  });
});

describe("isWreckitError", () => {
  it("returns true for all new error types", () => {
    expect(isWreckitError(new PhaseFailedError("p", "i", "m"))).toBe(true);
    expect(isWreckitError(new PhaseValidationError("p", "m"))).toBe(true);
    expect(isWreckitError(new TransitionError("a", "b", "m"))).toBe(true);
    expect(isWreckitError(new ArtifactNotCreatedError("f", "p"))).toBe(true);
    expect(isWreckitError(new ResearchQualityError([]))).toBe(true);
    expect(isWreckitError(new PlanQualityError([]))).toBe(true);
    expect(isWreckitError(new StoryQualityError([]))).toBe(true);
    expect(isWreckitError(new BranchError("b", "create", "m"))).toBe(true);
    expect(isWreckitError(new PushError("b", "r", "m"))).toBe(true);
    expect(isWreckitError(new PrCreationError("h", "b", "m"))).toBe(true);
    expect(isWreckitError(new MergeConflictError("s", "t"))).toBe(true);
    expect(isWreckitError(new RemoteValidationError("o", null, []))).toBe(true);
  });
});
```

### Success Criteria:

#### Automated Verification:
- [ ] Tests pass: `npm test`
- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] All new error types have test coverage
- [ ] Tests follow existing patterns in `src/__tests__/logging.test.ts`

---

## Testing Strategy

### Unit Tests:
- Error class instantiation and properties
- Error code constants
- `toExitCode()` mapping for all new types
- `isWreckitError()` type guard for all new types
- `wrapError()` behavior with new types

### Integration Tests:
- Git operations throw correct error types on failure
- Phase runners return typed errors in `PhaseResult.error`
- Command layer properly re-throws or wraps errors

### Manual Testing Steps:
1. Force a git branch checkout failure and verify `BranchError` is thrown
2. Force a PR creation failure and verify `PrCreationError` is thrown
3. Run a phase with missing prerequisites and verify error codes in output
4. Verify exit codes are correct (1 for errors, 130 for interrupt)

## Migration Notes

### Backwards Compatibility
- `PhaseResult.error` accepts both `string` and `WreckitError` via union type
- Existing code that sets `error: "some message"` continues to work
- Existing code that reads `result.error` as string continues to work (may need type narrowing)

### Future Deprecation Path
1. In next minor version: Add deprecation warning in JSDoc for string usage
2. In next major version: Remove string support from `PhaseResult.error` type

### Consumer Code Changes
Code that checks `result.error` may need updates:
```typescript
// Before:
if (result.error) {
  console.log(result.error); // string
}

// After (type-safe):
if (result.error) {
  const msg = typeof result.error === "string"
    ? result.error
    : result.error.message;
  console.log(msg);
}
```

## References
- Research: `/Users/speed/wreckit/.wreckit/items/020-add-distinct-error-types-for-different-failure-mod/research.md`
- Error hierarchy: `src/errors.ts:1-145`
- Exit code mapping: `src/errors.ts:74-91`
- Phase result interface: `src/workflow/itemWorkflow.ts:80-84`
- Git operations: `src/git/index.ts:337-860`
- Existing error tests: `src/__tests__/logging.test.ts:127-215`
