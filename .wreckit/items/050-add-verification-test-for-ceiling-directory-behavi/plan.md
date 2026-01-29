# Add verification test for ceiling directory behavior Implementation Plan

## Overview
This implementation fixes the mock pollution issue that prevents the `GIT_CEILING_DIRECTORIES` verification tests from running in the full test suite. The core implementation is complete (item 049), and verification tests are written and passing in isolation. The blocker is that `src/__tests__/commands/ideas.test.ts` uses `mock.module()` to mock git functions, and these mocks persist when `src/__tests__/git/index.test.ts` runs, causing the verification tests to fail.

## Current State Analysis

### What Exists Now
- **Implementation**: ✅ Complete in `src/git/validation.ts:186-190`
  - `isGitRepo()` correctly sets `GIT_CEILING_DIRECTORIES` environment variable
  - Prevents git from searching parent directories
  - Documented in `TESTING.md:27-113`

- **Verification Tests**: ⚠️ Written but skipped in `src/__tests__/git/index.test.ts:381-426`
  - Test 1: Verifies `isGitRepo(subDir)` returns `false` when subdirectory is not a git repo
  - Test 2: Verifies `isGitRepo(repoRoot)` returns `true` for actual git repo
  - Tests pass when run in isolation: `bun test src/__tests__/git/index.test.ts`
  - Tests fail in full suite due to mock pollution

- **Mock Pollution Source**: `src/__tests__/commands/ideas.test.ts:14-45`
  - Uses `mock.module()` to mock git functions including `isGitRepo`
  - Mocks persist across test files despite `test-preload.ts` calling `mock.restore()`
  - The mocked `isGitRepo` interferes with real git execution in verification tests

### What's Missing
- Mock cleanup in `commands/ideas.test.ts` to restore real git functions after tests
- The `describe.skip` directive needs to be removed from `git/index.test.ts:381`
- Full test suite validation to ensure no regressions

### Key Constraints
- Must not break existing `commands/ideas.test.ts` tests
- Must ensure `test-preload.ts` properly cleans up mocks
- Must preserve the ability to run tests in any order
- Tests must pass in CI environment

## Desired End State

### Specification
The verification tests for `GIT_CEILING_DIRECTORIES` behavior run successfully in the full test suite without mock pollution. The tests validate that:

1. `isGitRepo()` returns `false` for subdirectories inside a git repo (due to ceiling directory)
2. `isGitRepo()` returns `true` for actual git repository roots
3. No mock pollution from other test files interferes with real git execution

### Verification
```bash
# Run full test suite - verification tests should pass
bun test

# Run git tests specifically - should still pass
bun test src/__tests__/git/index.test.ts

# Run ideas tests - should still pass
bun test src/__tests__/commands/ideas.test.ts
```

All three commands should complete successfully with no test failures.

### Key Discoveries
- **Issue Location**: `src/__tests__/commands/ideas.test.ts:14-45` mocks git module
- **Pattern to Follow**: Add `afterEach` mock restoration in `commands/ideas.test.ts`
- **Constraint**: The `test-preload.ts` already calls `mock.restore()`, but module-level mocks need explicit cleanup
- **File Reference**: `src/__tests__/git/index.test.ts:381-426` contains the skipped tests

## What We're NOT Doing
- ❌ Modifying the `GIT_CEILING_DIRECTORIES` implementation (already complete)
- ❌ Rewriting the verification tests (they're correct and pass in isolation)
- ❌ Changing the test-preload.ts file (it already has proper cleanup)
- ❌ Creating separate test files or test runners (use existing infrastructure)
- ❌ Implementing item 089 (separate item, though related)

## Implementation Approach

### Strategy
Fix the mock pollution at its source by ensuring `commands/ideas.test.ts` properly restores mocked modules after each test. The test file already has an `afterEach` hook, but it doesn't restore the `mock.module()` calls. We'll add explicit mock restoration to prevent leakage.

### Rationale
- **Minimal changes**: Only modify the test file causing the pollution
- **Follows existing patterns**: Use `afterEach` which is already in the file
- **Low risk**: Mock restoration happens after each test, so no test behavior changes
- **Enables dependent work**: Unblocks items 051, 052, 053 in milestone M1

---

## Phase 1: Fix Mock Pollution in ideas.test.ts

### Overview
Add mock restoration to `src/__tests__/commands/ideas.test.ts` to ensure mocked git modules are cleaned up after each test run.

### Changes Required:

#### 1. src/__tests__/commands/ideas.test.ts
**File**: `src/__tests__/commands/ideas.test.ts`
**Changes**: Add mock.module restoration in afterEach hook

**Current afterEach** (lines 64-67):
```typescript
afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});
```

**New afterEach**:
```typescript
afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  // Restore mocked modules to prevent pollution of other test files
  mock.restore();
});
```

**Rationale**: The `mock.module()` calls on lines 20-45 create persistent mocks that need to be explicitly restored. The global `test-preload.ts` calls `mock.restore()`, but it runs at the wrong scope. Adding it to the file's own `afterEach` ensures cleanup happens after each test in this file.

### Success Criteria:

#### Automated Verification:
- [ ] Run `bun test src/__tests__/commands/ideas.test.ts` - all tests pass
- [ ] Run `bun test src/__tests__/git/index.test.ts` - tests still pass in isolation
- [ ] No test failures related to mock pollution

#### Manual Verification:
- [ ] Verify mock restoration happens after each ideas.test.ts test
- [ ] Confirm no git module mocks leak into subsequent test files

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to next phase.

---

## Phase 2: Remove describe.skip from Verification Tests

### Overview
Unskip the `isGitRepo` verification tests in `src/__tests__/git/index.test.ts` now that mock pollution is fixed.

### Changes Required:

#### 1. src/__tests__/git/index.test.ts
**File**: `src/__tests__/git/index.test.ts`
**Changes**: Remove `describe.skip` and enable tests

**Current code** (lines 378-383):
```typescript
// NOTE: These tests pass in isolation but fail in full suite due to mock.module
// pollution from ideas.test.ts. Run with: bun test src/__tests__/git/index.test.ts
describe.skip("isGitRepo", () => {
```

**New code**:
```typescript
// NOTE: Mock pollution from ideas.test.ts has been fixed
// These tests validate GIT_CEILING_DIRECTORIES behavior
describe("isGitRepo", () => {
```

**Rationale**: With mock pollution fixed in Phase 1, these tests can now run in the full suite. The comment is updated to reflect the current state.

### Success Criteria:

#### Automated Verification:
- [ ] Run `bun test src/__tests__/git/index.test.ts` - verification tests pass
- [ ] Run `bun test` (full suite) - verification tests pass in full suite
- [ ] No tests skipped in the isGitRepo describe block

#### Manual Verification:
- [ ] Review test output to confirm both isGitRepo tests executed
- [ ] Verify tests create and clean up temporary git repositories
- [ ] Confirm tests validate ceiling directory behavior correctly

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to next phase.

---

## Phase 3: Validate Full Test Suite

### Overview
Run the complete test suite to ensure mock pollution fix works and no regressions were introduced.

### Changes Required:
No code changes - validation only.

### Success Criteria:

#### Automated Verification:
- [ ] Run `bun test` - entire test suite passes
- [ ] Run `npm run typecheck` - no type errors
- [ ] Run `npm run lint` - no linting errors
- [ ] Run `npm run build` - build succeeds

#### Manual Verification:
- [ ] Review test output for all git/index.test.ts tests
- [ ] Review test output for all commands/ideas.test.ts tests
- [ ] Confirm no test failures or timeouts
- [ ] Verify all 2 verification tests in isGitRepo block pass
- [ ] Check test execution time is reasonable

**Note**: Complete all automated verification, then pause for manual confirmation. This is the final phase.

---

## Testing Strategy

### Unit Tests:
- No new unit tests needed (verification tests already exist)
- Existing `commands/ideas.test.ts` tests must continue passing
- Existing `git/index.test.ts` tests must continue passing

### Integration Tests:
- Full test suite execution validates end-to-end behavior
- Verification tests validate real git execution with `GIT_CEILING_DIRECTORIES`

### Manual Testing Steps:
1. Run `bun test src/__tests__/commands/ideas.test.ts` - verify 24 tests pass
2. Run `bun test src/__tests__/git/index.test.ts` - verify all tests pass including previously skipped ones
3. Run `bun test` - verify full suite passes with no mock pollution errors
4. Check test output for the 2 verification tests: they should show as passing
5. Verify temporary git repositories are created and cleaned up properly

## Migration Notes
No migration needed - this is purely a test fix with no production code changes.

## References
- Research: `/home/user/project/.wreckit/items/050-add-verification-test-for-ceiling-directory-behavi/research.md`
- Implementation: `src/git/validation.ts:186-190`
- Verification Tests: `src/__tests__/git/index.test.ts:381-426`
- Mock Source: `src/__tests__/commands/ideas.test.ts:14-45`
- Test Preload: `src/__tests__/test-preload.ts`
- Dependency: Item 049 (implementation complete)
- Related: Item 089 (separate tracking for this issue)
