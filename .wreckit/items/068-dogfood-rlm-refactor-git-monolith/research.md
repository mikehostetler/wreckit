# Research: Dogfood RLM: Refactor Git Monolith

**Date**: 2025-06-18
**Item**: 068-dogfood-rlm-refactor-git-monolith

## Research Question
The Code Archaeology report (Item 067) identified `src/git/index.ts` as a 1200+ line 'God Object' and a top technical debt hotspot. We will use the RLM agent to break this monolith into focused modules: `branch.ts`, `pr.ts`, `status.ts`, and `validation.ts`.

## Summary
The `src/git/index.ts` file currently contains 1,425 lines and is indeed a monolithic "God Object" that handles all git operations. The file can be cleanly separated into four focused modules based on functional cohesion:

1. **branch.ts** (~400 lines) - Branch lifecycle operations (create, checkout, cleanup, sync)
2. **pr.ts** (~350 lines) - Pull request operations (create, update, query, mergeability)
3. **status.ts** (~350 lines) - Git status and file change tracking
4. **validation.ts** (~325 lines) - Preflight checks, validation, and remote URL validation

The refactoring will maintain full backward compatibility through a barrel export pattern in `index.ts`, which will re-export all public functions from the new modules. All imports across the codebase use `import { X } from "../git"` or `import { X } from "../git/index"`, so the refactoring will be transparent to consumers.

Key technical considerations include:
- The `Mutex` class and `gitMutex` instance (lines 71-98) should remain in `index.ts` as it's used by `runGitCommand`
- `runGitCommand`, `runGhCommand`, and the internal `runCommand` function should stay in `index.ts` as foundational infrastructure
- Type definitions can be co-located with their usage or kept in `index.ts` if shared across modules
- All functions are pure (no side effects except git operations) making them easy to move
- The existing `src/git/quality.ts` module already exists as a separate file, demonstrating the pattern

## Current State Analysis

### Existing Implementation
`src/git/index.ts` is a 1,425-line file containing:
- 37 exported functions (plus quality functions from `quality.ts`)
- 24 exported types/interfaces
- 1 internal class (`Mutex`) and 1 internal instance (`gitMutex`)
- 2 internal helper functions (`runCommand`, `normalizeUrlForMatching`, `getStatusDescription`)
- Mixed concerns: branch management, PR operations, status tracking, and validation

The module has no internal dependencies between functions (all are standalone), making it ideal for decomposition. Functions are grouped by functionality but intermixed throughout the file.

### Current Patterns and Conventions
1. **Error Handling**: Functions throw typed errors from `../errors` (BranchError, PushError, PrCreationError, MergeConflictError)
2. **Dry Run Support**: All functions respect `dryRun` option and log with `[dry-run]` prefix
3. **Logger Pattern**: All functions accept `logger: Logger` and log at appropriate levels
4. **TypeScript**: Full type safety with exported interfaces for all function parameters and results
5. **Async/Await**: All git operations are async functions
6. **Command Execution**: Uses `runGitCommand` and `runGhCommand` wrappers that provide mutex locking
7. **No State**: All functions are pure, operating only on their parameters

### Integration Points
The git module is imported by 14 files across the codebase:
- **Core workflow**: `src/workflow/itemWorkflow.ts` (imports 29 functions - heaviest user)
- **Commands**: `src/commands/strategy.ts`, `src/commands/rollback.ts`, `src/commands/ideas.ts`
- **Domain**: `src/domain/ideas-interview.ts`
- **Agent**: `src/agent/contextBuilder.ts`
- **Tests**: `src/__tests__/git/index.test.ts`, `src/__tests__/git-status-comparison.test.ts`, plus edge case and command tests

All imports use the pattern:
```typescript
import { functionNames } from "../git";
// or
import { functionNames } from "../git/index";
```

This means the barrel export pattern in `index.ts` will maintain backward compatibility without requiring any changes to import statements.

## Key Files

### Files to Refactor

- `src/git/index.ts:1-1425` - The main monolith file to be split
  - Lines 1-23: Imports and re-exports (keep)
  - Lines 24-69: Shared types (keep or move to appropriate module)
  - Lines 71-173: Mutex, command execution infrastructure (keep)
  - Lines 175-319: Remote URL functions → move to `validation.ts`
  - Lines 321-479: Branch operations → move to `branch.ts`
  - Lines 537-666: More branch operations + preflight → move to `branch.ts` and `validation.ts`
  - Lines 668-706: Commit and push → move to `branch.ts`
  - Lines 708-793: PR operations → move to `pr.ts`
  - Lines 798-952: Merge operations → move to `branch.ts` (mergeAndPushToBase) or `pr.ts` (checkMergeConflicts)
  - Lines 954-1167: PR details and mergeability → move to `pr.ts`
  - Lines 1169-1426: Status operations → move to `status.ts`

- `src/git/quality.ts:1-313` - Already separate module (excellent pattern to follow)
  - This demonstrates the existing pattern of having focused git submodules
  - Exports: `runQualityChecks`, `runSecretScan`, `runPrePushQualityGates`, `scanForSecrets`
  - Uses `runGitCommand` from index.ts

### Files Using Git Module (Consumers)

- `src/workflow/itemWorkflow.ts:50-83` - Imports 29 functions, largest consumer
  - Uses: ensureBranch, getCurrentBranch, hasUncommittedChanges, commitAll, pushBranch, createOrUpdatePr, isPrMerged, getPrDetails, checkGitPreflight, isGitRepo, getBranchSha, mergeAndPushToBase, checkMergeConflicts, getGitStatus, compareGitStatus, formatViolations, runPrePushQualityGates, checkPrMergeability, validateRemoteUrl, runGitCommand, cleanupBranch, and types

- `src/commands/strategy.ts:10-15` - Uses status functions
  - Uses: getGitStatus, compareGitStatus, formatViolations, types

- `src/agent/contextBuilder.ts:13` - Single function import
  - Uses: getGitStatus, GitFileChange type

- `src/commands/rollback.ts:6` - Single function import
  - Uses: runGitCommand, GitOptions type

- `src/commands/ideas.ts` - Uses PR operations (need to verify)

- `src/domain/ideas-interview.ts` - Uses git operations (need to verify)

### Test Files

- `src/__tests__/git/index.test.ts:1-438` - Comprehensive test suite
  - Tests: checkPrMergeability (6 tests), checkMergeConflicts (2 tests), getPrDetails (10 tests), isGitRepo (2 tests, skipped)
  - Uses mocking with vi.spyOn for runGhCommand
  - Important: Tests import the entire git module, so barrel exports must work

- `src/__tests__/git-status-comparison.test.ts:1-100+` - Status comparison tests
  - Tests: parseGitStatusPorcelain, compareGitStatus, formatViolations
  - Uses real git operations in temp directories

- `src/__tests__/git/quality.test.ts` - Tests for quality.ts module
  - Demonstrates pattern of testing separate git modules

## Technical Considerations

### Dependencies
**External Dependencies:**
- `node:child_process` - Used by spawn in command execution (keep in index.ts)
- `node:path` - Used by isGitRepo (keep in index.ts)

**Internal Dependencies:**
- `../logging` - Logger type (all modules)
- `../errors` - Error classes (BranchError, PushError, PrCreationError, MergeConflictError, GitError)
- `../config` - PrChecksResolved type (exported from index.ts, used by quality.ts)
- `./index` - quality.ts imports runGitCommand (new modules will import from index.ts)

**Module Interdependencies:**
- New modules will import from `index.ts` for: `runGitCommand`, `runGhCommand`, `GitOptions`
- `index.ts` will import from new modules to re-export their functions
- No circular dependencies if index.ts is the "hub"

### Patterns to Follow

**Existing Pattern - quality.ts Module:**
The `src/git/quality.ts` file demonstrates the desired pattern:
1. Focused on a single concern (quality checks)
2. Imports `runGitCommand` from `./index`
3. Exports specific functions and types
4. No state, pure functions
5. Follows same error handling and logging patterns

**Barrel Export Pattern:**
```typescript
// index.ts after refactoring
export { runGitCommand, runGhCommand } from './infrastructure'; // or keep in index
export { ensureBranch, getCurrentBranch, cleanupBranch, ... } from './branch';
export { createOrUpdatePr, getPrDetails, checkPrMergeability, ... } from './pr';
export { getGitStatus, compareGitStatus, formatViolations, ... } from './status';
export { checkGitPreflight, validateRemoteUrl, ... } from './validation';
export * from './quality'; // existing module
```

**File Organization:**
```
src/git/
├── index.ts          # Barrel exports + infrastructure (runGitCommand, runGhCommand, Mutex)
├── branch.ts         # Branch operations (ensureBranch, cleanupBranch, getCurrentBranch, etc.)
├── pr.ts             # PR operations (createOrUpdatePr, getPrDetails, checkPrMergeability, etc.)
├── status.ts         # Git status operations (getGitStatus, compareGitStatus, etc.)
├── validation.ts     # Preflight and validation (checkGitPreflight, validateRemoteUrl, etc.)
└── quality.ts        # Existing module (unchanged)
```

**Function Placement:**

1. **branch.ts** (~400 lines):
   - getCurrentBranch (line 365)
   - getBranchSha (line 383)
   - branchExists (line 394)
   - cleanupBranch (line 411)
   - ensureBranch (line 481)
   - commitAll (line 668)
   - pushBranch (line 683)
   - mergeAndPushToBase (line 896)
   - hasUncommittedChanges (line 537) - could also go in validation
   - isDetachedHead (line 544) - could also go in validation
   - hasRemote (line 552) - could also go in validation
   - getBranchSyncStatus (line 557)
   - Types: BranchResult, BranchCleanupResult, MergeConflictCheckResult

2. **pr.ts** (~350 lines):
   - getPrByBranch (line 708)
   - createOrUpdatePr (line 729)
   - checkMergeConflicts (line 816) - merge-related but PR-focused
   - getPrDetails (line 986)
   - isPrMerged (line 1089)
   - checkPrMergeability (line 1131)
   - Types: PrResult, PrDetails, PrMergeabilityResult

3. **status.ts** (~350 lines):
   - parseGitStatusPorcelain (line 1206)
   - getGitStatus (line 1246)
   - compareGitStatus (line 1264)
   - formatViolations (line 1349)
   - getStatusDescription (line 1413) - helper, internal to status.ts
   - Types: GitFileChange, GitStatusComparisonResult, StatusCompareOptions

4. **validation.ts** (~325 lines):
   - getRemoteUrl (line 196)
   - normalizeUrlForMatching (line 238) - helper, internal to validation.ts
   - validateRemoteUrl (line 262)
   - isGitRepo (line 321)
   - checkGitPreflight (line 598)
   - Types: RemoteValidationResult, GitPreflightErrorCode, GitPreflightError, GitPreflightResult, CheckPreflightOptions

5. **index.ts** (~250 lines remaining):
   - Imports (lines 1-23)
   - Type exports from config (lines 11-22)
   - Core types: GitOptions, CommandResult (lines 24-68)
   - Infrastructure: Mutex class, gitMutex, runGitCommand, runGhCommand, runCommand (lines 71-173)
   - Barrel exports from all modules
   - Note: runCommand is internal, not exported

**Type Placement Strategy:**
- Co-locate types with the functions that use them
- Keep shared types (GitOptions, CommandResult) in index.ts
- All types are exported, so they can be imported from the barrel

### Conventions Observed in the Codebase

1. **Import Style:**
   ```typescript
   import { specific, functions } from "../git";
   import type { Types, Used } from "../git";
   ```

2. **Error Throwing:**
   ```typescript
   if (error) {
     throw new SpecificError(param1, param2, "descriptive message");
   }
   ```

3. **Dry Run Pattern:**
   ```typescript
   if (dryRun) {
     logger.info(`[dry-run] Would do something`);
     return defaultValue;
   }
   ```

4. **Command Result Pattern:**
   ```typescript
   const result = await runGitCommand([...args], options);
   if (result.exitCode !== 0) {
     throw new Error("Failed: " + result.stdout);
   }
   return result.stdout;
   ```

5. **Mutex Pattern:**
   ```typescript
   return gitMutex.dispatch(() => runCommand("git", args, options));
   ```
   This prevents concurrent git operations that could cause index.lock issues

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking imports due to missing exports in barrel | High | Comprehensive test suite; verify all exports are re-exported from index.ts |
| Circular dependencies between modules | Medium | Keep all infrastructure (runGitCommand, runGhCommand) in index.ts; modules only import from index.ts |
| Type imports breaking (import type vs import) | Low | TypeScript compile-time check; all types are exported |
| Tests failing due to import changes | Medium | Tests use the same import pattern; barrel exports maintain compatibility |
| Internal functions accidentally exported | Low | Code review; only export functions that were previously exported |
| Moving functions to wrong module | Low | Document grouping criteria; focus on single responsibility principle |
| Git mutex becoming performance bottleneck | Low | Unchanged from current implementation; already working |

## Recommended Approach

### High-Level Strategy

1. **Preparation (1-2 hours):**
   - Create backup branch: `git checkout -b refactor/git-monolith`
   - Run existing test suite to establish baseline
   - Review all 37 exported functions and 24 types to categorize

2. **Create New Modules (3-4 hours):**
   - Create empty files: `branch.ts`, `pr.ts`, `status.ts`, `validation.ts`
   - For each module:
     a. Copy relevant functions and their types from index.ts
     b. Add imports for dependencies (Logger, errors, runGitCommand)
     c. Update internal imports if needed
     d. Verify no internal references to other functions being moved

3. **Update index.ts (1 hour):**
   - Remove moved functions and types
   - Keep infrastructure: Mutex, gitMutex, runGitCommand, runGhCommand, runCommand
   - Keep shared types: GitOptions, CommandResult
   - Add barrel exports: `export { ... } from './branch'` etc.
   - Export quality module as-is

4. **Testing (1-2 hours):**
   - Run full test suite: `bun test`
   - Pay special attention to:
     - `src/__tests__/git/index.test.ts`
     - `src/__tests__/git-status-comparison.test.ts`
     - `src/__tests__/git/quality.test.ts`
   - Run integration tests: `src/__tests__/commands/*.test.ts`
   - Manual smoke test: `wreckit list`, `wreckit show 001`

5. **Code Review & Refinement (1 hour):**
   - Check for any remaining code smells
   - Verify all exports are present
   - Ensure no duplicate type definitions
   - Add comments if needed for clarity

6. **Completion (30 min):**
   - Commit changes with descriptive message
   - Create PR following project conventions
   - Update documentation if needed

### Implementation Order

**Recommended sequence to minimize integration risk:**

1. Start with `status.ts` (most isolated, no dependencies on other git functions)
2. Then `pr.ts` (uses runGhCommand, well-defined scope)
3. Then `branch.ts` (largest module, but mostly self-contained)
4. Then `validation.ts` (some overlap with branch, but clear boundaries)
5. Finally update `index.ts` to barrel exports

### Testing Strategy

**Unit Tests:**
- All existing tests should pass without modification (they import from "../git")
- Add new test files if module-specific testing is needed:
  - `src/__tests__/git/branch.test.ts`
  - `src/__tests__/git/pr.test.ts`
  - `src/__tests__/git/status.test.ts`
  - `src/__tests__/git/validation.test.ts`

**Integration Tests:**
- Test actual git operations in temp directories
- Verify module interactions work correctly
- Test dry-run mode for each module

**Regression Tests:**
- Run all workflow tests (research, plan, implement, pr, complete phases)
- Test rollback command
- Test strategy command

### Validation Criteria

**Success Metrics:**
1. All tests pass (100%)
2. No breaking changes to imports (all 14 importing files work unchanged)
3. No new ESLint warnings
4. Each module < 500 lines
5. index.ts reduced to ~250 lines (infrastructure + barrel exports)
6. Clear separation of concerns (each module has single responsibility)

**Code Quality Checks:**
- [ ] No circular dependencies
- [ ] All types exported
- [ ] No duplicate code
- [ ] Consistent error handling
- [ ] Consistent logging
- [ ] No unused imports
- [ ] No `any` types

## Open Questions

1. **Where should `hasUncommittedChanges`, `isDetachedHead`, and `hasRemote` go?**
   - Option A: branch.ts (they check branch state)
   - Option B: validation.ts (they're used in preflight checks)
   - **Recommendation**: Put in validation.ts as they're primarily used for validation

2. **Where should `checkMergeConflicts` go?**
   - Option A: pr.ts (it's called in PR workflow)
   - Option B: branch.ts (it's a merge operation)
   - **Recommendation**: pr.ts, as it's specifically for checking PR mergeability

3. **Where should `mergeAndPushToBase` go?**
   - Option A: branch.ts (it's a branch operation)
   - Option B: pr.ts (it's part of PR complete workflow)
   - **Recommendation**: branch.ts, as it's primarily a branch merge operation

4. **Should we split `index.ts` further into `infrastructure.ts`?**
   - **Recommendation**: No, keep runGitCommand, runGhCommand, and Mutex in index.ts as they're the foundation all other modules depend on

5. **How to handle the quality.ts module?**
   - **Recommendation**: Leave as-is, it's already well-structured and demonstrates the pattern we're following

6. **Should we update test imports to be more specific?**
   - **Recommendation**: No, the barrel export pattern is working well and makes imports cleaner. Tests importing from "../git" is fine.

## Implementation Notes

### Function Grouping for Module Creation

**branch.ts - Branch Lifecycle Management:**
```
getCurrentBranch       - Get current branch name
getBranchSha          - Get SHA of a branch
branchExists          - Check if branch exists
cleanupBranch         - Delete local and remote branch
ensureBranch          - Create or checkout branch
commitAll             - Commit all changes
pushBranch            - Push branch to remote
mergeAndPushToBase    - Merge feature branch to base
getBranchSyncStatus   - Check if branch is synced with remote
```

**pr.ts - Pull Request Operations:**
```
getPrByBranch         - Find PR by branch name
createOrUpdatePr      - Create or update PR
checkMergeConflicts   - Check if PR has conflicts
getPrDetails          - Get comprehensive PR details
isPrMerged            - Check if PR is merged (legacy)
checkPrMergeability   - Check if PR can be merged
```

**status.ts - Git Status Tracking:**
```
parseGitStatusPorcelain - Parse git status output
getGitStatus            - Get current git status
compareGitStatus        - Compare before/after status
formatViolations        - Format status violations
getStatusDescription    - Helper for status codes (internal)
```

**validation.ts - Preflight and Validation:**
```
getRemoteUrl            - Get remote URL
normalizeUrlForMatching - Helper for URL matching (internal)
validateRemoteUrl       - Validate remote against patterns
isGitRepo               - Check if directory is git repo
checkGitPreflight       - Run all preflight checks
hasUncommittedChanges   - Check for uncommitted changes
isDetachedHead          - Check for detached HEAD
hasRemote               - Check if remote configured
```

### Dependencies After Refactoring

**Module Import Dependencies:**
```
index.ts (infrastructure)
  ├── imports: none for infrastructure
  ├── exports: runGitCommand, runGhCommand, GitOptions, CommandResult

branch.ts
  ├── imports: runGitCommand (from index), Logger, errors
  ├── exports: branch operations, BranchResult, etc.

pr.ts
  ├── imports: runGhCommand (from index), Logger, errors
  ├── exports: PR operations, PrResult, PrDetails, etc.

status.ts
  ├── imports: runGitCommand (from index), Logger
  ├── exports: status operations, GitFileChange, etc.

validation.ts
  ├── imports: runGitCommand (from index), Logger, errors
  ├── exports: validation operations, GitPreflightResult, etc.

quality.ts (existing, unchanged)
  ├── imports: runGitCommand (from index), Logger, config types
  ├── exports: quality operations
```

This structure ensures no circular dependencies and clear separation of concerns.

### Estimated Line Counts After Refactoring

```
index.ts        ~250 lines (infrastructure + barrel exports)
branch.ts       ~400 lines (branch lifecycle)
pr.ts           ~350 lines (PR operations)
status.ts       ~300 lines (status tracking)
validation.ts   ~325 lines (preflight and validation)
quality.ts      ~313 lines (existing, unchanged)
─────────────────────────────────────────────────
Total:          ~1,938 lines (vs 1,425 current)
                Note: Increase due to duplicate imports per module
```

The slight increase in total lines is acceptable given the improved maintainability and organization.

### Final Module Structure

```
src/git/
├── index.ts          # Infrastructure + barrel exports
├── branch.ts         # Branch operations
├── pr.ts             # Pull request operations
├── status.ts         # Git status operations
├── validation.ts     # Preflight and validation
└── quality.ts        # Quality gates (existing)
```

This refactoring will reduce the main index.ts from 1,425 lines to ~250 lines while maintaining full backward compatibility and improving code organization.
