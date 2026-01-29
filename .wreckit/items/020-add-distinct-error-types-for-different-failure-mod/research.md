# Research: Add distinct error types for different failure modes across all phases

**Date**: 2025-01-13
**Item**: 020-add-distinct-error-types-for-different-failure-mod

## Research Question
From milestone [M3] Robust Error Handling and Recovery

**Motivation:** Strategic milestone: Robust Error Handling and Recovery

## Summary

The wreckit codebase has an existing error type system (`src/errors.ts:1-122`) with a base `WreckitError` class and 11 specialized subclasses. However, the current implementation has several gaps: many operations use generic `Error` throws instead of specific error types, error handling across phases is inconsistent, and several failure modes lack distinct error types. The ROADMAP.md [M3] milestone specifically calls out this item: "Add distinct error types for different failure modes across all phases."

The existing error hierarchy provides a solid foundation. The `WreckitError` base class includes an error code property that enables programmatic error handling and consistent exit code mapping (`src/errors.ts:74-91`). The current errors cover configuration, file system, JSON parsing, schema validation, agents, and git operations, but phase-specific errors, validation errors, and recovery-related errors are missing or underspecified.

Implementation should extend the existing pattern by adding new error types for: phase validation failures, transition failures, artifact creation failures, quality validation failures, timeout/recovery scenarios, and git operation subtypes. Each new error type should have a distinct error code and should be used consistently throughout the codebase to replace generic `Error` throws and string-based error returns.

## Current State Analysis

### Existing Error Type Hierarchy

The codebase has a well-designed error type hierarchy in `src/errors.ts:1-122`:

**Base Class:**
- `WreckitError` (`src/errors.ts:1-9`) - Base error with `message` and `code` properties

**Current Subclasses:**
| Error Type | Code | File:Line | Usage |
|------------|------|-----------|-------|
| `RepoNotFoundError` | `REPO_NOT_FOUND` | `src/errors.ts:11-16` | Repository/wreckit directory not found |
| `InvalidJsonError` | `INVALID_JSON` | `src/errors.ts:18-23` | JSON parsing failures |
| `SchemaValidationError` | `SCHEMA_VALIDATION` | `src/errors.ts:25-30` | Zod schema validation failures |
| `FileNotFoundError` | `FILE_NOT_FOUND` | `src/errors.ts:32-37` | File system file not found |
| `ConfigError` | `CONFIG_ERROR` | `src/errors.ts:39-44` | Configuration issues |
| `AgentError` | `AGENT_ERROR` | `src/errors.ts:46-51` | Agent execution failures |
| `GitError` | `GIT_ERROR` | `src/errors.ts:53-58` | Git operations failures |
| `TimeoutError` | `TIMEOUT` | `src/errors.ts:60-65` | Timeout conditions |
| `InterruptedError` | `INTERRUPTED` | `src/errors.ts:67-72` | User interruption (SIGINT) |
| `PayloadValidationError` | `PAYLOAD_VALIDATION` | `src/errors.ts:105-110` | Ideas payload size limits |
| `McpToolNotCalledError` | `MCP_TOOL_NOT_CALLED` | `src/errors.ts:112-117` | MCP tool call not detected |

**Utility Functions:**
- `toExitCode(error)` (`src/errors.ts:74-91`) - Maps errors to exit codes (0, 1, or 130)
- `wrapError(error, context)` (`src/errors.ts:93-103`) - Wraps errors with context
- `isWreckitError(error)` (`src/errors.ts:119-121`) - Type guard

### Current Error Usage Patterns

**1. Command Layer (`src/commands/`):**
Commands properly use `WreckitError` with codes:
- `src/commands/run.ts:71-72` - `WreckitError` with `ITEM_NOT_FOUND`
- `src/commands/run.ts:122-125` - `WreckitError` with `PHASE_FAILED`
- `src/commands/phase.ts:156` - `WreckitError` with `ITEM_NOT_FOUND`
- `src/commands/phase.ts:164-167` - `WreckitError` with `INVALID_TRANSITION`
- `src/commands/phase.ts:185-188` - `WreckitError` with `INVALID_STATE`
- `src/commands/init.ts:14-28` - Custom `NotGitRepoError` and `WreckitExistsError`

**2. Git Operations (`src/git/index.ts`):**
Uses generic `Error` instead of `GitError`:
- `src/git/index.ts:343` - `throw new Error("Failed to get current branch")`
- `src/git/index.ts:361` - `throw new Error("Failed to get SHA for ${branch}")`
- `src/git/index.ts:463-476` - Multiple `throw new Error` for branch operations
- `src/git/index.ts:637-640` - `throw new Error` for push failure
- `src/git/index.ts:708-714` - `throw new Error` for PR creation

**3. Workflow Operations (`src/workflow/itemWorkflow.ts`):**
Returns error strings instead of typed errors:
- `src/workflow/itemWorkflow.ts:204-208` - Returns `{ error: "Item is in state..." }`
- `src/workflow/itemWorkflow.ts:253-258` - Returns `{ error: "Agent timed out" | "Agent failed..." }`
- `src/workflow/itemWorkflow.ts:262-265` - Returns `{ error: "Agent did not create research.md" }`
- `src/workflow/itemWorkflow.ts:272-278` - Returns `{ error: "Research quality validation failed" }`

**4. Validation (`src/domain/validation.ts`):**
Returns `ValidationResult` objects with string reasons:
- `src/domain/validation.ts:32-47` - Returns `{ valid: false, reason: "..." }`

### Gap Analysis: Missing Error Types

Based on the codebase analysis, the following distinct error types are missing:

**Phase-Specific Errors:**
1. `PhaseValidationError` - When phase prerequisites are not met
2. `PhaseFailedError` - When a phase fails to complete
3. `TransitionError` - Invalid state transitions
4. `ArtifactNotCreatedError` - Agent didn't create expected artifact

**Quality Validation Errors:**
5. `ResearchQualityError` - Research document fails quality checks
6. `PlanQualityError` - Plan document fails quality checks
7. `StoryQualityError` - Stories fail quality validation

**Git Operation Subtypes:**
8. `BranchError` - Branch operations (create, checkout, switch)
9. `PushError` - Push to remote failures
10. `PrCreationError` - PR creation failures
11. `MergeConflictError` - Merge conflict detection
12. `RemoteValidationError` - Remote URL validation failures

**Recovery Errors:**
13. `RollbackError` - Rollback operation failures
14. `BackupError` - Backup creation failures (for Gap 3 from spec 010)

### Key Files

- `src/errors.ts:1-122` - Core error type definitions
- `src/workflow/itemWorkflow.ts:1-1382` - Phase execution with string-based error returns
- `src/git/index.ts:1-1302` - Git operations using generic `Error`
- `src/commands/run.ts:1-161` - Command layer with `WreckitError` usage
- `src/commands/phase.ts:1-217` - Phase command with `WreckitError` usage
- `src/domain/validation.ts:1-857` - Validation functions with `ValidationResult` returns
- `src/domain/transitions.ts:1-46` - State transitions with `TransitionError` interface
- `src/config.ts:176-219` - Config loading with proper error types
- `src/fs/json.ts:23-62` - JSON reading with proper error types

### Integration Points

1. **Exit Code Mapping** (`src/errors.ts:74-91`): New errors must map to appropriate exit codes
2. **Error Display** (`src/cli-utils.ts:32-35`): Uses `isWreckitError()` for code display
3. **Logger Integration** (`src/logging.ts`): Errors should support structured logging
4. **Test Coverage** (`src/__tests__/logging.test.ts:127-214`): Error tests exist for current types

## Technical Considerations

### Dependencies

- **Zod** (`zod@4.3.5`) - Already used for schema validation, errors integrate with it
- **No external dependencies needed** - Pure TypeScript error class extensions

### Patterns to Follow

1. **Error Class Pattern** (from `src/errors.ts:11-16`):
```typescript
export class NewError extends WreckitError {
  constructor(message: string) {
    super(message, "ERROR_CODE");
    this.name = "NewError";
  }
}
```

2. **Error Codes Convention**: Uppercase snake_case (e.g., `PHASE_FAILED`, `BRANCH_ERROR`)

3. **Additional Context Pattern**: Some errors may need additional properties:
```typescript
export class PhaseFailedError extends WreckitError {
  constructor(
    public phase: string,
    public itemId: string,
    message: string
  ) {
    super(message, "PHASE_FAILED");
    this.name = "PhaseFailedError";
  }
}
```

4. **Workflow Integration**: `PhaseResult` interface (`src/workflow/itemWorkflow.ts:80-84`) should remain but errors should be typed:
```typescript
export interface PhaseResult {
  success: boolean;
  item: Item;
  error?: WreckitError;  // Changed from string
}
```

### Backwards Compatibility

- Existing `WreckitError` subclasses must remain unchanged
- `toExitCode()` function must continue to map all errors correctly
- `wrapError()` should preserve new error codes when wrapping
- `isWreckitError()` works automatically for all subclasses

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking changes to `PhaseResult.error` type | High | Keep string support temporarily, deprecate over multiple releases |
| Inconsistent error usage across codebase | Medium | Add linting rules for error type usage in PRs |
| Performance overhead from error class instantiation | Low | Negligible - error paths are not performance critical |
| Test coverage gaps for new error types | Medium | Add comprehensive tests for each new error type |
| Git operations catching wrong error types | Medium | Update all try/catch blocks to handle specific types |
| Unclear which error to use in ambiguous cases | Low | Document error selection criteria in code comments |

## Recommended Approach

### Phase 1: Define New Error Types
1. Add new error classes to `src/errors.ts`:
   - Phase errors: `PhaseValidationError`, `PhaseExecutionError`, `TransitionError`, `ArtifactNotCreatedError`
   - Quality errors: `ResearchQualityError`, `PlanQualityError`, `StoryQualityError`
   - Git errors: `BranchError`, `PushError`, `PrCreationError`, `MergeConflictError`, `RemoteValidationError`
   - Recovery errors: `RollbackError`, `BackupError`

2. Update `toExitCode()` if any new errors need special exit code handling

### Phase 2: Update Git Operations
1. Replace generic `Error` throws in `src/git/index.ts` with specific `GitError` subclasses
2. Update all callers to catch appropriate error types

### Phase 3: Update Workflow Layer
1. Change `PhaseResult.error` type from `string` to `WreckitError | undefined`
2. Update all phase runners in `src/workflow/itemWorkflow.ts` to throw/return typed errors
3. Update command layer to handle typed errors

### Phase 4: Update Validation Layer
1. Create validation-specific error types for quality checks
2. Update `validateResearchQuality`, `validatePlanQuality`, `validateStoryQuality` to throw typed errors

### Phase 5: Testing and Documentation
1. Add unit tests for all new error types (pattern: `src/__tests__/logging.test.ts`)
2. Add edge case tests in `src/__tests__/edge-cases/errors.isospec.ts`
3. Update specs to document new error codes

## Open Questions

1. **Should `PhaseResult.error` become a union type or fully typed?**
   - Option A: `error?: string | WreckitError` (backwards compatible)
   - Option B: `error?: WreckitError` (clean break)
   - Recommendation: Option A first, then deprecate string

2. **Should git errors include git command output?**
   - Current: Error message only
   - Enhanced: Include stderr/stdout for debugging
   - Recommendation: Add optional `details` property to git errors

3. **How should nested errors be handled?**
   - Example: `PrCreationError` wrapping `PushError`
   - Current: `wrapError()` exists but loses type info
   - Recommendation: Add `cause` property (Node.js 16.9+ supports this)

4. **Should error codes be exported as constants?**
   - Current: Inline strings (`"PHASE_FAILED"`)
   - Alternative: `const ErrorCodes = { PHASE_FAILED: "PHASE_FAILED" as const, ... }`
   - Recommendation: Yes, for consistency and autocomplete

5. **What about the silent read errors gap (spec 010 Gap 4, spec 002 Gap 3)?**
   - This item addresses error types but related milestone item covers silent read errors
   - Recommendation: Define `ArtifactReadError` here, implement detection in separate item
