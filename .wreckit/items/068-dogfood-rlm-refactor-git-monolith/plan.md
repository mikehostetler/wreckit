# Dogfood RLM: Refactor Git Monolith Implementation Plan

## Overview
Break down the 1,425-line `src/git/index.ts` "God Object" into focused, maintainable modules while maintaining 100% backward compatibility. The refactoring will separate concerns into four new modules (`branch.ts`, `pr.ts`, `status.ts`, `validation.ts`) and keep the existing `quality.ts` module unchanged.

## Current State Analysis

### Existing Implementation
`src/git/index.ts` is a 1,425-line monolithic file containing:
- **37 exported functions** across multiple concerns (branch, PR, status, validation)
- **24 exported types/interfaces**
- **1 internal class** (`Mutex`) and **1 internal instance** (`gitMutex`) for command serialization
- **2 internal helper functions** (`runCommand`, `normalizeUrlForMatching`, `getStatusDescription`)
- **Mixed concerns**: branch management, PR operations, status tracking, and validation intermixed throughout

### Key Discoveries
- **No internal dependencies**: All functions are standalone and can be moved safely
- **Existing pattern**: `src/git/quality.ts` already demonstrates the focused module pattern
- **Barrel export compatible**: All imports use `import { X } from "../git"` or `import { X } from "../git/index"`
- **Infrastructure foundation**: `runGitCommand`, `runGhCommand`, and `Mutex` must stay in `index.ts` as all modules depend on them

### Integration Points
The git module is used by 14 files across the codebase:
- `src/workflow/itemWorkflow.ts` (imports 29 functions - heaviest user)
- `src/commands/strategy.ts`, `src/commands/rollback.ts`, `src/commands/ideas.ts`
- `src/domain/ideas-interview.ts`
- `src/agent/contextBuilder.ts`
- Test files: `src/__tests__/git/index.test.ts`, `src/__tests__/git-status-comparison.test.ts`

All imports use the barrel pattern, so the refactoring will be transparent to consumers.

## Desired End State

### Final Module Structure
```
src/git/
├── index.ts          # ~250 lines - Infrastructure + barrel exports
├── branch.ts         # ~400 lines - Branch lifecycle operations
├── pr.ts             # ~350 lines - Pull request operations
├── status.ts         # ~300 lines - Git status tracking
├── validation.ts     # ~325 lines - Preflight and validation
└── quality.ts        # ~313 lines - Quality gates (existing, unchanged)
```

### Module Responsibilities

**index.ts** (Infrastructure Hub)
- Keep: `Mutex` class, `gitMutex` instance, `runGitCommand`, `runGhCommand`, `runCommand`
- Keep: Shared types (`GitOptions`, `CommandResult`)
- Add: Barrel exports from all modules
- Remove: All business logic functions (moved to modules)

**branch.ts** (Branch Lifecycle)
- `getCurrentBranch`, `getBranchSha`, `branchExists`, `cleanupBranch`, `ensureBranch`
- `commitAll`, `pushBranch`, `mergeAndPushToBase`, `getBranchSyncStatus`
- Types: `BranchResult`, `BranchCleanupResult`

**pr.ts** (Pull Request Operations)
- `getPrByBranch`, `createOrUpdatePr`, `checkMergeConflicts`
- `getPrDetails`, `isPrMerged`, `checkPrMergeability`
- Types: `PrResult`, `PrDetails`, `PrMergeabilityResult`, `MergeConflictCheckResult`

**status.ts** (Git Status Tracking)
- `parseGitStatusPorcelain`, `getGitStatus`, `compareGitStatus`, `formatViolations`
- Internal helper: `getStatusDescription`
- Types: `GitFileChange`, `GitStatusComparisonResult`, `StatusCompareOptions`

**validation.ts** (Preflight and Validation)
- `getRemoteUrl`, `validateRemoteUrl`, `isGitRepo`, `checkGitPreflight`
- `hasUncommittedChanges`, `isDetachedHead`, `hasRemote`
- Internal helper: `normalizeUrlForMatching`
- Types: `RemoteValidationResult`, `GitPreflightErrorCode`, `GitPreflightError`, `GitPreflightResult`, `CheckPreflightOptions`

**quality.ts** (Existing - Unchanged)
- Already follows the focused module pattern
- Will continue to import from `index.ts`

## What We're NOT Doing
- ❌ NOT changing any function signatures or behavior
- ❌ NOT updating any import statements in consuming files (barrel exports handle this)
- ❌ NOT splitting `index.ts` infrastructure into a separate file (keep it simple)
- ❌ NOT creating new tests (existing tests should pass without modification)
- ❌ NOT changing the `quality.ts` module (it's already well-structured)
- ❌ NOT moving the `Mutex` class or `runGitCommand`/`runGhCommand` (they're foundational)

## Implementation Approach

**Strategy**: Incremental, test-driven refactoring with barrel exports for backward compatibility.

**Key Principles**:
1. **Maintain backward compatibility** through barrel exports
2. **No behavior changes** - only moving code
3. **Test continuously** - run tests after each module creation
4. **Follow existing patterns** - quality.ts demonstrates the approach
5. **Keep infrastructure in index.ts** - all modules depend on it

**Dependency Flow**:
```
index.ts (infrastructure)
  ├── exports: runGitCommand, runGhCommand, GitOptions, CommandResult
  ├── imports from branch.ts, pr.ts, status.ts, validation.ts
  └── re-exports all public functions (barrel pattern)

branch.ts, pr.ts, status.ts, validation.ts
  ├── import: runGitCommand/runGhCommand from index.ts
  ├── import: Logger, errors from their modules
  └── export: their functions and types
```

This ensures no circular dependencies (index.ts is the "hub").

---

## Phase 1: Create status.ts Module

### Overview
Create the `status.ts` module with git status tracking functions. This is the safest starting point as these functions have the fewest dependencies and are self-contained.

### Changes Required

#### 1. Create `src/git/status.ts`

**File**: `src/git/status.ts` (NEW)
**Changes**: Create new file with status operations

```typescript
import type { Logger } from "../logging";
import { runGitCommand } from "./index";

export interface GitFileChange {
  path: string;
  statusCode: string;
}

export interface GitStatusComparisonResult {
  valid: boolean;
  violations: GitFileChange[];
  allChanges: GitFileChange[];
}

export interface StatusCompareOptions {
  cwd: string;
  logger: Logger;
  dryRun?: boolean;
  allowedPaths?: string[];
}

// Move parseGitStatusPorcelain (lines 1206-1238)
// Move getGitStatus (lines 1246-1251)
// Move compareGitStatus (lines 1264-1340)
// Move formatViolations (lines 1349-1405)
// Move getStatusDescription as internal helper (lines 1413-1425)
```

**Implementation Steps**:
1. Create file with imports
2. Copy `parseGitStatusPorcelain` function (lines 1206-1238)
3. Copy `getGitStatus` function (lines 1246-1251)
4. Copy `compareGitStatus` function (lines 1264-1340)
5. Copy `formatViolations` function (lines 1349-1405)
6. Copy `getStatusDescription` function (lines 1413-1425) as internal (not exported)
7. Add type exports at top

#### 2. Update `src/git/index.ts`

**File**: `src/git/index.ts`
**Changes**: Remove status functions, add barrel export

```typescript
// Remove lines 1169-1426 (status functions and types)
// Remove types: GitFileChange, GitStatusComparisonResult, StatusCompareOptions

// Add barrel export at bottom (after quality exports):
export type {
  GitFileChange,
  GitStatusComparisonResult,
  StatusCompareOptions,
} from "./status";
export {
  parseGitStatusPorcelain,
  getGitStatus,
  compareGitStatus,
  formatViolations,
} from "./status";
```

### Success Criteria

#### Automated Verification:
- [ ] Tests pass: `bun test src/__tests__/git-status-comparison.test.ts`
- [ ] Type checking passes: `bun run typecheck`
- [ ] No import errors in consuming files
- [ ] `status.ts` exports match removed exports from `index.ts`

#### Manual Verification:
- [ ] Status comparison tests pass
- [ ] No regressions in workflow tests
- [ ] Git status operations work correctly in actual usage

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to next phase.

---

## Phase 2: Create pr.ts Module

### Overview
Create the `pr.ts` module with pull request operations. This module uses `runGhCommand` and has clear boundaries.

### Changes Required

#### 1. Create `src/git/pr.ts`

**File**: `src/git/pr.ts` (NEW)
**Changes**: Create new file with PR operations

```typescript
import type { Logger } from "../logging";
import { runGhCommand } from "./index";
import { PrCreationError } from "../errors";

export interface PrResult {
  url: string;
  number: number;
  created: boolean;
}

export interface PrDetails {
  merged: boolean;
  querySucceeded: boolean;
  baseRefName: string | null;
  headRefName: string | null;
  mergeCommitOid: string | null;
  mergedAt: string | null;
  checksPassed: boolean | null;
  error?: string;
}

export interface PrMergeabilityResult {
  mergeable: boolean;
  determined: boolean;
}

export interface MergeConflictCheckResult {
  hasConflicts: boolean;
  error?: string;
}

// Move getPrByBranch (lines 708-727)
// Move createOrUpdatePr (lines 729-793)
// Move checkMergeConflicts (lines 816-894)
// Move getPrDetails (lines 986-1083)
// Move isPrMerged (lines 1089-1108)
// Move checkPrMergeability (lines 1131-1167)
```

**Implementation Steps**:
1. Create file with imports (including `PrCreationError` from errors)
2. Copy all PR-related interfaces and types
3. Copy `getPrByBranch` function
4. Copy `createOrUpdatePr` function
5. Copy `checkMergeConflicts` function
6. Copy `getPrDetails` function
7. Copy `isPrMerged` function
8. Copy `checkPrMergeability` function

#### 2. Update `src/git/index.ts`

**File**: `src/git/index.ts`
**Changes**: Remove PR functions, add barrel export

```typescript
// Remove lines 708-793 (getPrByBranch, createOrUpdatePr)
// Remove lines 798-894 (MergeConflictCheckResult type, checkMergeConflicts)
// Remove lines 896-952 (mergeAndPushToBase - KEEP, goes to branch.ts)
// Remove lines 954-1167 (PrDetails, isPrMerged, PrMergeabilityResult, checkPrMergeability)

// Add barrel export:
export type {
  PrResult,
  PrDetails,
  PrMergeabilityResult,
  MergeConflictCheckResult,
} from "./pr";
export {
  getPrByBranch,
  createOrUpdatePr,
  checkMergeConflicts,
  getPrDetails,
  isPrMerged,
  checkPrMergeability,
} from "./pr";
```

### Success Criteria

#### Automated Verification:
- [ ] Tests pass: `bun test src/__tests__/git/index.test.ts` (PR tests)
- [ ] Type checking passes: `bun run typecheck`
- [ ] No import errors
- [ ] All PR functions accessible via barrel export

#### Manual Verification:
- [ ] PR creation/update tests pass
- [ ] PR mergeability tests pass
- [ ] PR details tests pass
- [ ] Merge conflict detection tests pass

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding.

---

## Phase 3: Create branch.ts Module

### Overview
Create the `branch.ts` module with branch lifecycle operations. This is the largest module and includes commit, push, and merge operations.

### Changes Required

#### 1. Create `src/git/branch.ts`

**File**: `src/git/branch.ts` (NEW)
**Changes**: Create new file with branch operations

```typescript
import type { Logger } from "../logging";
import { runGitCommand } from "./index";
import { BranchError, PushError, MergeConflictError, GitError } from "../errors";

export interface BranchResult {
  branchName: string;
  created: boolean;
}

export interface BranchCleanupResult {
  localDeleted: boolean;
  remoteDeleted: boolean;
  error?: string;
}

// Move getCurrentBranch (lines 365-374)
// Move getBranchSha (lines 383-392)
// Move branchExists (lines 394-403)
// Move cleanupBranch (lines 411-479)
// Move ensureBranch (lines 481-535)
// Move commitAll (lines 668-681)
// Move pushBranch (lines 683-706)
// Move mergeAndPushToBase (lines 896-952)
// Move getBranchSyncStatus (lines 557-596)
```

**Implementation Steps**:
1. Create file with imports (including all error types)
2. Copy all branch-related interfaces
3. Copy `getCurrentBranch` function
4. Copy `getBranchSha` function
5. Copy `branchExists` function
6. Copy `cleanupBranch` function
7. Copy `ensureBranch` function
8. Copy `commitAll` function
9. Copy `pushBranch` function
10. Copy `mergeAndPushToBase` function (from PR section)
11. Copy `getBranchSyncStatus` function

#### 2. Update `src/git/index.ts`

**File**: `src/git/index.ts`
**Changes**: Remove branch functions, add barrel export

```typescript
// Remove lines 30-33 (BranchResult type)
// Remove lines 365-479 (getCurrentBranch through cleanupBranch)
// Remove lines 481-535 (ensureBranch)
// Remove lines 557-596 (getBranchSyncStatus)
// Remove lines 405-409 (BranchCleanupResult type)
// Remove lines 668-706 (commitAll, pushBranch)
// Remove lines 896-952 (mergeAndPushToBase)

// Add barrel export:
export type {
  BranchResult,
  BranchCleanupResult,
} from "./branch";
export {
  getCurrentBranch,
  getBranchSha,
  branchExists,
  cleanupBranch,
  ensureBranch,
  commitAll,
  pushBranch,
  mergeAndPushToBase,
  getBranchSyncStatus,
} from "./branch";
```

### Success Criteria

#### Automated Verification:
- [ ] Tests pass: `bun test` (all git tests)
- [ ] Type checking passes: `bun run typecheck`
- [ ] No import errors
- [ ] All branch functions accessible via barrel export

#### Manual Verification:
- [ ] Branch creation/checkout tests pass
- [ ] Commit and push operations work
- [ ] Branch cleanup tests pass
- [ ] Merge operations work correctly

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding.

---

## Phase 4: Create validation.ts Module

### Overview
Create the `validation.ts` module with preflight checks and validation functions. This includes remote URL validation and git repository checks.

### Changes Required

#### 1. Create `src/git/validation.ts`

**File**: `src/git/validation.ts` (NEW)
**Changes**: Create new file with validation operations

```typescript
import { spawn } from "node:child_process";
import * as path from "node:path";
import type { Logger } from "../logging";
import { runGitCommand } from "./index";

export type GitPreflightErrorCode =
  | "NOT_GIT_REPO"
  | "DETACHED_HEAD"
  | "UNCOMMITTED_CHANGES"
  | "BRANCH_DIVERGED"
  | "NO_REMOTE"
  | "INVALID_REMOTE_URL";

export interface GitPreflightError {
  code: GitPreflightErrorCode;
  message: string;
  recoverySteps: string[];
}

export interface GitPreflightResult {
  valid: boolean;
  errors: GitPreflightError[];
}

export interface CheckPreflightOptions {
  cwd: string;
  logger: Logger;
  dryRun?: boolean;
  checkRemoteSync?: boolean;
}

export interface RemoteValidationResult {
  valid: boolean;
  actualUrl: string | null;
  errors: string[];
}

// Move getRemoteUrl (lines 196-227)
// Move normalizeUrlForMatching as internal helper (lines 238-249)
// Move validateRemoteUrl (lines 262-319)
// Move isGitRepo (lines 321-363)
// Move hasUncommittedChanges (lines 537-542)
// Move isDetachedHead (lines 544-550)
// Move hasRemote (lines 552-555)
// Move checkGitPreflight (lines 598-666)
```

**Implementation Steps**:
1. Create file with imports (node imports for isGitRepo)
2. Copy all validation-related interfaces and types
3. Copy `getRemoteUrl` function
4. Copy `normalizeUrlForMatching` function (internal, not exported)
5. Copy `validateRemoteUrl` function
6. Copy `isGitRepo` function
7. Copy `hasUncommittedChanges` function
8. Copy `isDetachedHead` function
9. Copy `hasRemote` function
10. Copy `checkGitPreflight` function

#### 2. Update `src/git/index.ts`

**File**: `src/git/index.ts`
**Changes**: Remove validation functions, add barrel export

```typescript
// Remove lines 41-62 (GitPreflightErrorCode, GitPreflightError, GitPreflightResult, CheckPreflightOptions)
// Remove lines 175-319 (getRemoteUrl through validateRemoteUrl)
// Remove lines 321-363 (isGitRepo)
// Remove lines 537-555 (hasUncommittedChanges, isDetachedHead, hasRemote)
// Remove lines 598-666 (checkGitPreflight)
// Remove lines 178-185 (RemoteValidationResult)

// Add barrel export:
export type {
  GitPreflightErrorCode,
  GitPreflightError,
  GitPreflightResult,
  CheckPreflightOptions,
  RemoteValidationResult,
} from "./validation";
export {
  getRemoteUrl,
  validateRemoteUrl,
  isGitRepo,
  hasUncommittedChanges,
  isDetachedHead,
  hasRemote,
  checkGitPreflight,
} from "./validation";
```

### Success Criteria

#### Automated Verification:
- [ ] Tests pass: `bun test` (all tests including workflow)
- [ ] Type checking passes: `bun run typecheck`
- [ ] No import errors
- [ ] All validation functions accessible via barrel export

#### Manual Verification:
- [ ] Preflight checks work correctly
- [ ] Remote URL validation works
- [ ] Git repo detection works
- [ ] All validation scenarios pass

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding.

---

## Phase 5: Final Cleanup and Verification

### Overview
Clean up `index.ts` to contain only infrastructure and barrel exports, then run comprehensive verification.

### Changes Required

#### 1. Finalize `src/git/index.ts`

**File**: `src/git/index.ts`
**Changes**: Ensure only infrastructure and barrel exports remain

**Final structure should be**:
```typescript
// Lines 1-3: node imports
import { spawn } from "node:child_process";
import * as path from "node:path";  // Remove if not needed after cleanup
import type { Logger } from "../logging";

// Lines 4-10: Error imports (keep for potential use, or remove if unused)
import {
  BranchError,
  PushError,
  PrCreationError,
  MergeConflictError,
  GitError,
} from "../errors";

// Lines 11-22: Config and quality type exports (keep)
export type { PrChecksResolved } from "../config";
export type {
  QualityCheckOptions,
  QualityCheckResult,
  SecretScanResult,
} from "./quality";
export {
  runPrePushQualityGates,
  runQualityChecks,
  runSecretScan,
  scanForSecrets,
} from "./quality";

// Lines 24-68: Core types (keep GitOptions, CommandResult, remove others)
export interface GitOptions {
  cwd: string;
  logger: Logger;
  dryRun?: boolean;
}

export interface CommandResult {
  stdout: string;
  stderr?: string;
  exitCode: number;
}

// Lines 70-98: Mutex and gitMutex (keep)
// Lines 100-112: runGitCommand, runGhCommand (keep)
// Lines 114-173: runCommand internal function (keep)

// Barrel exports from all modules (add at bottom)
export type {
  BranchResult,
  BranchCleanupResult,
} from "./branch";
export {
  getCurrentBranch,
  getBranchSha,
  branchExists,
  cleanupBranch,
  ensureBranch,
  commitAll,
  pushBranch,
  mergeAndPushToBase,
  getBranchSyncStatus,
} from "./branch";

export type {
  PrResult,
  PrDetails,
  PrMergeabilityResult,
  MergeConflictCheckResult,
} from "./pr";
export {
  getPrByBranch,
  createOrUpdatePr,
  checkMergeConflicts,
  getPrDetails,
  isPrMerged,
  checkPrMergeability,
} from "./pr";

export type {
  GitFileChange,
  GitStatusComparisonResult,
  StatusCompareOptions,
} from "./status";
export {
  parseGitStatusPorcelain,
  getGitStatus,
  compareGitStatus,
  formatViolations,
} from "./status";

export type {
  GitPreflightErrorCode,
  GitPreflightError,
  GitPreflightResult,
  CheckPreflightOptions,
  RemoteValidationResult,
} from "./validation";
export {
  getRemoteUrl,
  validateRemoteUrl,
  isGitRepo,
  hasUncommittedChanges,
  isDetachedHead,
  hasRemote,
  checkGitPreflight,
} from "./validation";
```

**Verify**:
- [ ] All business logic functions removed
- [ ] Only infrastructure remains (Mutex, runGitCommand, runGhCommand, runCommand)
- [ ] Only shared types remain (GitOptions, CommandResult)
- [ ] All modules properly re-exported
- [ ] No duplicate type definitions
- [ ] No unused imports

### Success Criteria

#### Automated Verification:
- [ ] **All tests pass**: `bun test` (100% pass rate)
- [ ] **Type checking passes**: `bun run typecheck` (0 errors)
- [ ] **Linting passes**: `bun run lint` (0 warnings)
- [ ] **Build succeeds**: `bun run build`
- [ ] **No circular dependencies**: Verify with TypeScript or tool
- [ ] **Line count verification**:
  - `index.ts`: ~250 lines
  - `branch.ts`: ~400 lines
  - `pr.ts`: ~350 lines
  - `status.ts`: ~300 lines
  - `validation.ts`: ~325 lines
  - `quality.ts`: ~313 lines (unchanged)

#### Manual Verification:
- [ ] **Import test**: All consuming files can still import from "../git"
- [ ] **Workflow test**: Run `wreckit list` and `wreckit show 001`
- [ ] **Integration test**: Create a test item and run through research phase
- [ ] **Smoke test**: Verify no regressions in normal usage
- [ ] **Code review**: Check for any remaining code smells or issues

#### Final Checklist:
- [ ] All 37 exported functions accessible via barrel exports
- [ ] All 24 exported types accessible via barrel exports
- [ ] No behavior changes (only code movement)
- [ ] All modules follow single responsibility principle
- [ ] No internal functions accidentally exported
- [ ] Consistent error handling across modules
- [ ] Consistent logging patterns across modules
- [ ] All internal helpers properly scoped (not exported)

**Note**: This is the final phase. Complete all verification before considering the refactoring complete.

---

## Testing Strategy

### Unit Tests
**Existing tests** (should pass without modification):
- `src/__tests__/git/index.test.ts` - PR operations, mergeability, conflicts
- `src/__tests__/git-status-comparison.test.ts` - Status parsing and comparison
- `src/__tests__/git/quality.test.ts` - Quality gates (unchanged)

**No new tests needed** - existing tests cover all functions. The barrel export pattern ensures tests continue to work.

### Integration Tests
**Test scenarios**:
1. **Workflow integration**: Run `wreckit list` to verify imports work
2. **Research phase**: Create test item, run research phase
3. **Plan phase**: Run plan phase to verify status validation
4. **Implementation**: Run implementation to verify branch operations
5. **PR phase**: Create PR to verify PR operations
6. **Complete phase**: Merge PR to verify all operations work together

### Regression Tests
**Critical paths to verify**:
1. Branch creation and checkout
2. Commit and push operations
3. PR creation and update
4. Merge conflict detection
5. Status comparison and validation
6. Preflight checks
7. Quality gates

### Manual Testing Steps
1. **Verify imports**: Check that all 14 consuming files can still import
2. **Run smoke tests**: `bun test` (all tests pass)
3. **Test workflow**: Create and complete a test item
4. **Check exports**: Verify all functions accessible from `import { X } from "../git"`
5. **Verify types**: Check type exports work with `import type { X } from "../git"`

## Migration Notes

### No Migration Required
This refactoring maintains 100% backward compatibility through barrel exports. No changes needed in:
- Consuming files (all imports work unchanged)
- Test files (all tests pass unchanged)
- Configuration (no config changes)
- User-facing behavior (no behavior changes)

### Rollback Strategy
If issues arise:
1. Delete new module files (`branch.ts`, `pr.ts`, `status.ts`, `validation.ts`)
2. Restore original `index.ts` from git
3. All imports will continue to work

The incremental approach (one module at a time) makes rollback safe at any point.

## References

### Key Files
- **Research**: `/Users/speed/wreckit/.wreckit/items/068-dogfood-rlm-refactor-git-monolith/research.md`
- **Monolith**: `/Users/speed/wreckit/src/git/index.ts` (1,425 lines)
- **Existing module**: `/Users/speed/wreckit/src/git/quality.ts` (pattern to follow)
- **Tests**: `/Users/speed/wreckit/src/__tests__/git/index.test.ts`

### Function Line References
**Branch operations** (→ `branch.ts`):
- `getCurrentBranch`: lines 365-374
- `getBranchSha`: lines 383-392
- `branchExists`: lines 394-403
- `cleanupBranch`: lines 411-479
- `ensureBranch`: lines 481-535
- `getBranchSyncStatus`: lines 557-596
- `commitAll`: lines 668-681
- `pushBranch`: lines 683-706
- `mergeAndPushToBase`: lines 896-952

**PR operations** (→ `pr.ts`):
- `getPrByBranch`: lines 708-727
- `createOrUpdatePr`: lines 729-793
- `checkMergeConflicts`: lines 816-894
- `getPrDetails`: lines 986-1083
- `isPrMerged`: lines 1089-1108
- `checkPrMergeability`: lines 1131-1167

**Status operations** (→ `status.ts`):
- `parseGitStatusPorcelain`: lines 1206-1238
- `getGitStatus`: lines 1246-1251
- `compareGitStatus`: lines 1264-1340
- `formatViolations`: lines 1349-1405
- `getStatusDescription` (internal): lines 1413-1425

**Validation operations** (→ `validation.ts`):
- `getRemoteUrl`: lines 196-227
- `normalizeUrlForMatching` (internal): lines 238-249
- `validateRemoteUrl`: lines 262-319
- `isGitRepo`: lines 321-363
- `hasUncommittedChanges`: lines 537-542
- `isDetachedHead`: lines 544-550
- `hasRemote`: lines 552-555
- `checkGitPreflight`: lines 598-666

### Import Patterns
**Current pattern** (works after refactoring):
```typescript
import { specificFunction } from "../git";
import type { SpecificType } from "../git";
```

**Barrel export in index.ts** (makes above work):
```typescript
export { specificFunction } from "./module";
export type { SpecificType } from "./module";
```
