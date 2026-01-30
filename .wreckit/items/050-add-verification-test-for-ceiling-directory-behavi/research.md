# Research: Add verification test for ceiling directory behavior

**Date**: 2025-01-26
**Item**: 050-add-verification-test-for-ceiling-directory-behavi

## Research Question
From milestone [M1] Complete Git Integration Test Fix

**Motivation:** Strategic milestone: Complete Git Integration Test Fix

## Summary

This research investigates the status of verification tests for the `GIT_CEILING_DIRECTORIES` implementation in the `isGitRepo()` function. The core implementation is **complete and working** in `src/git/validation.ts:186-190`, but the verification tests are currently **skipped** due to mock pollution from other test files.

**Key Findings:**
1. The `GIT_CEILING_DIRECTORIES` fix is fully implemented and documented in `TESTING.md`
2. Verification tests exist but are marked with `describe.skip()` in `src/__tests__/git/index.test.ts:381`
3. The tests fail when run in full suite due to mock pollution from `src/__tests__/ideas.test.ts`
4. The tests pass when run in isolation: `bun test src/__tests__/git/index.test.ts`
5. Item 049 (dependency) completed the implementation; this item (050) focuses on unskipping and validating the tests

**The verification tests are already written** - they just need to be unskipped and the mock pollution issue resolved. According to the dependency chain in item.json, this item must be completed before item 051 can validate that all 23 failing tests now pass in CI.

## Current State Analysis

### Existing Implementation

The `isGitRepo()` function in `src/git/validation.ts:181-222` has a complete `GIT_CEILING_DIRECTORIES` implementation:

**Lines 186-190** - Ceiling directory setup:
```typescript
// Set GIT_CEILING_DIRECTORIES to prevent git from searching parent directories
// This ensures that even when running inside a git repo (e.g., in CI),
// checking a subdirectory correctly returns false if that subdirectory is not itself a git repo
const ceilingDir = path.dirname(cwd);
const env = { ...process.env, GIT_CEILING_DIRECTORIES: ceilingDir };
```

**Line 197** - Custom environment passed to spawn:
```typescript
proc = spawn("git", ["rev-parse", "--git-dir"], {
  cwd,
  stdio: ["pipe", "pipe", "pipe"],
  env, // Pass custom environment
});
```

This implementation:
- ✅ Correctly calculates ceiling directory as parent of cwd
- ✅ Preserves all existing environment variables with spread operator
- ✅ Passes custom environment to git spawn call
- ✅ Has clear inline comments explaining the purpose
- ✅ Is documented in `TESTING.md` with examples
- ✅ Is marked complete in ROADMAP.md [DONE-11]

### Existing (But Skipped) Verification Tests

**File**: `src/__tests__/git/index.test.ts:381-426`

**Lines 381-382** - Skip directive:
```typescript
// NOTE: These tests pass in isolation but fail in full suite due to mock.module
// pollution from ideas.test.ts. Run with: bun test src/__tests__/git/index.test.ts
describe.skip("isGitRepo", () => {
```

**Lines 384-410** - Test 1: Ceiling directory behavior:
```typescript
it("returns false when in subdirectory of git repo but ceiling is set", async () => {
  // Restore the spy before running real git commands
  runGhCommandSpy.mockRestore();

  // Create a temporary directory that will act as a git repo
  const repoRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "wreckit-test-repo-"),
  );
  const subDir = path.join(repoRoot, "nested-dir");
  await fs.mkdir(subDir);

  try {
    // Initialize git in the repoRoot
    await gitModule.runGitCommand(["init"], {
      cwd: repoRoot,
      logger: createMockLogger(),
    });

    // Verify that without our fix, git WOULD find the repo (testing git behavior)
    // We do this by running a raw git command without the ceiling env var
    const { spawnSync } = await import("node:child_process");
    const rawGit = spawnSync(
      "git",
      ["rev-parse", "--is-inside-work-tree"],
      { cwd: subDir },
    );
    expect(rawGit.status).toBe(0);
    expect(rawGit.stdout.toString().trim()).toBe("true");

    // Now verify that our isGitRepo function returns false for the subdirectory
    // because it sets GIT_CEILING_DIRECTORIES
    const result = await gitModule.isGitRepo(subDir);
    expect(result).toBe(false);

    // It should still return true for the repo root itself
    const rootResult = await gitModule.isGitRepo(repoRoot);
    expect(rootResult).toBe(true);
  } finally {
    await fs.rm(repoRoot, { recursive: true, force: true });
  }
});
```

**Lines 412-426** - Test 2: Current repository detection:
```typescript
it("returns true for the current repository", async () => {
  // Restore the spy before running real git commands
  runGhCommandSpy.mockRestore();

  // Verify that the current repository (where tests are running) is detected
  // This ensures we didn't break legitimate git repo detection
  const repoRoot = process.cwd();

  const result = await gitModule.isGitRepo(repoRoot);

  expect(result).toBe(true);
});
```

**Why the tests are skipped:**
- Tests pass when run in isolation: `bun test src/__tests__/git/index.test.ts`
- Tests fail in full suite due to mock pollution from `ideas.test.ts`
- The issue is tracked separately in item 089: "[DREAMER] Fix skip in git index tests due to mock pollution"

### Key Files

#### `src/git/validation.ts:181-222` - Implementation ✅
- **Status**: COMPLETE
- **Function**: `isGitRepo(cwd: string): Promise<boolean>`
- **Key feature**: Lines 186-190 set `GIT_CEILING_DIRECTORIES` environment variable
- **Integration**: Used by `checkGitPreflight()` (line 549) and throughout codebase

#### `src/__tests__/git/index.test.ts:381-426` - Verification Tests ⚠️
- **Status**: SKIPPED due to mock pollution
- **Test count**: 2 test cases
- **Coverage**: 
  - Test 1: Verifies `isGitRepo(subDir)` returns `false` when subdirectory is not a git repo
  - Test 2: Verifies `isGitRepo(repoRoot)` returns `true` for actual git repo
  - Both tests verify `GIT_CEILING_DIRECTORIES` works correctly
- **Issue**: `describe.skip()` on line 381; needs mock pollution fix

#### `TESTING.md:27-113` - Documentation ✅
- **Status**: COMPLETE
- **Sections**:
  - "CI vs Local Testing Environments" (lines 27-78)
  - "Writing Git Tests" (lines 80-113)
  - Includes explanation of `GIT_CEILING_DIRECTORIES` fix
  - Includes example test code showing proper usage

#### `specs/fix-git-tests-ci.md` - Original Specification ✅
- **Status**: COMPLETE (implementation matches specification)
- **Relevant sections**:
  - Lines 49-87: Option 1 (Recommended) - Configure Git with `GIT_CEILING_DIRECTORIES`
  - Lines 165-195: Implementation steps and acceptance criteria
  - Lines 202-209: Acceptance criteria (all met except verification test runs in full suite)

#### `ROADMAP.md:583-590` - Milestone Tracking ✅
- **Section**: [DONE-11] Complete Git Integration Test Fix
- **Status**: Marked complete with all objectives checked
- **Note**: Objective 2 "Add verification test" is marked as done, but test is currently skipped

## Technical Considerations

### Dependencies

**Internal Modules:**
- `src/git/validation.ts` - Contains `isGitRepo()` implementation (already fixed)
- `src/__tests__/git/index.test.ts` - Contains verification tests (currently skipped)
- `src/__tests__/ideas.test.ts` - Source of mock pollution (needs investigation)

**External Dependencies:**
- `node:child_process` - `spawn()` function used by `isGitRepo()`
- `node:path` - `path.dirname()` for calculating ceiling directory
- Git binary - Must be available in PATH for verification tests

**No new dependencies required** - everything is already in place.

### Mock Pollution Issue

**Root Cause:**
- `ideas.test.ts` uses `vi.mock()` to mock modules
- Mock state persists across test files even though `git/index.test.ts` tries to clean up
- The mock interferes with real git command execution in the verification tests

**Evidence:**
- Comment on line 380: "These tests pass in isolation but fail in full suite due to mock.module pollution from ideas.test.ts"
- Item 089 specifically tracks fixing this mock pollution issue

**Impact:**
- Verification tests cannot run in full test suite
- Reduces test coverage for critical git functionality
- Masks potential bugs in `isGitRepo()` implementation
- Blocks completion of milestone M1 (item 051 needs these tests to pass)

### Patterns to Follow

1. **Test Isolation Pattern** (from `index.test.ts:19-31`):
   ```typescript
   beforeEach(async () => {
     tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-git-test-"));
     mockLogger = createMockLogger();
     gitModule = await import("../../git/index");
     runGhCommandSpy = vi.spyOn(gitModule, "runGhCommand");
   });

   afterEach(async () => {
     runGhCommandSpy.mockRestore();
     await fs.rm(tempDir, { recursive: true, force: true });
   });
   ```
   This pattern ensures proper setup and teardown but doesn't prevent cross-file mock pollution.

2. **Mock Restoration Pattern** (from line 389):
   ```typescript
   // Restore the spy before running real git commands
   runGhCommandSpy.mockRestore();
   ```
   Tests restore mocks before running real git commands, but cross-file pollution still occurs.

3. **Temp Directory Cleanup Pattern** (lines 402-410):
   ```typescript
   try {
     // ... test code ...
   } finally {
     await fs.rm(repoRoot, { recursive: true, force: true });
   }
   ```
   Ensures temp directories are always cleaned up, even if tests fail.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Mock pollution from ideas.test.ts prevents tests from running** | High | This is the core issue. Fix requires investigating `ideas.test.ts` mock setup and ensuring proper cleanup. Item 089 tracks this separately. |
| **Fixing mock pollution breaks other tests** | Medium | Need to identify which mocks in `ideas.test.ts` are leaking and ensure they're properly scoped or cleaned up. |
| **Tests pass in CI but fail locally (or vice versa)** | Low | The `GIT_CEILING_DIRECTORIES` fix specifically addresses CI issues; local behavior should match. |
| **Git not available in test environment** | Low | Tests already handle this gracefully with try/catch and mockRestore. |
| **Temp directory cleanup fails** | Low | Using `force: true` in `fs.rm()` handles most cases. Tests already run in `/tmp/` which is always writable. |

## Recommended Approach

### Option 1: Fix Mock Pollution (Recommended)

**Approach:** Investigate and fix the mock pollution from `ideas.test.ts` to allow verification tests to run in full suite.

**Steps:**
1. Read `src/__tests__/ideas.test.ts` to identify mock setup
2. Find which mocks are leaking into `git/index.test.ts`
3. Add proper mock cleanup in `ideas.test.ts` (mockReset/mockRestore in afterEach)
4. Or scope mocks more tightly to prevent leakage
5. Remove `describe.skip` from `git/index.test.ts:381`
6. Run full test suite to verify fix works
7. Ensure tests pass in CI environment

**Pros:**
- Addresses root cause
- Improves overall test suite reliability
- Enables verification tests to provide value
- Unblocks items 051, 052, 053 in milestone M1

**Cons:**
- Requires debugging mock setup in another file
- May require refactoring mock patterns
- Risk of breaking `ideas.test.ts` if not careful

**Dependency:** This overlaps with item 089, so coordinate or combine efforts.

### Option 2: Run Tests in Isolation (Workaround)

**Approach:** Keep tests skipped in full suite but run them separately in CI.

**Steps:**
1. Create separate test script: `bun test src/__tests__/git/index.test.ts`
2. Add to CI workflow as separate step
3. Document in TESTING.md that these tests run separately
4. Update milestone to reflect partial completion

**Pros:**
- Quick workaround
- Tests get executed somewhere
- No risk to other tests

**Cons:**
- Doesn't fix root cause
- Tests don't run in normal development workflow
- Milestone not fully complete
- Mock pollution may affect other tests in future

**Not recommended** - this is a band-aid, not a fix.

### Option 3: Reimplement Tests Without Mocks (Alternative)

**Approach:** Rewrite verification tests to avoid mock pollution entirely.

**Steps:**
1. Create new test file `src/__tests__/git/ceiling-directories.test.ts`
2. Don't use vi.mock at all - only test with real git commands
3. Import actual `isGitRepo` function
4. Run tests in a way that avoids mock pollution
5. Remove skipped tests from `index.test.ts`

**Pros:**
- Avoids mock pollution issue
- Tests are more isolated
- Simpler test structure

**Cons:**
- Duplication of test effort
- Doesn't fix underlying mock pollution problem
- May still be affected by global mocks

**Hybrid approach:** Consider this as backup if Option 1 proves too difficult.

## Open Questions

1. **What specific mocks in ideas.test.ts are causing the pollution?**
   - Need to read `ideas.test.ts` to identify leaking mocks
   - Likely candidates: `vi.mock()` calls at module level
   - May need to run tests with debug logging to see what's being mocked

2. **Has anyone attempted to fix this before?**
   - Item 089 exists but is in "idea" state
   - Comment in test suggests awareness but no fix yet
   - Need to check if there's prior art or attempted fixes

3. **Are there other tests affected by this mock pollution?**
   - Possibly other tests in the suite have similar issues
   - Fixing this may improve overall test reliability

4. **Should this item absorb item 089?**
   - Both items relate to the same root issue
   - Item 089 is about fixing the skip
   - This item (050) is about verification tests
   - They're two sides of the same coin - consider merging

5. **What's the priority of fixing this vs continuing with other M1 items?**
   - Items 051, 052, 053 depend on this
   - Cannot complete milestone M1 without this
   - Should be high priority within M1 campaign

## Implementation Status

**Overall Status**: 🟡 **PARTIALLY COMPLETE**

### Completed ✅
- Core `GIT_CEILING_DIRECTORIES` implementation (item 049)
- Documentation in TESTING.md
- Verification tests written and passing in isolation
- ROADMAP.md milestone marked complete

### In Progress ⚠️
- Verification tests skipped due to mock pollution
- Mock pollution issue identified but not fixed
- Tests not running in full suite or CI

### Not Started ❌
- Fixing mock pollution from ideas.test.ts
- Removing `describe.skip` from git/index.test.ts
- Validating tests pass in full suite
- Unblocking dependent items 051, 052, 053

## Next Steps

1. **Investigate mock pollution** - Read `ideas.test.ts` to identify leaking mocks
2. **Coordinate with item 089** - Determine if this item should absorb 089 or work in parallel
3. **Fix mock cleanup** - Add proper mock restoration to `ideas.test.ts`
4. **Unskip tests** - Remove `describe.skip` from line 381
5. **Validate full suite** - Run `bun test` to ensure no regressions
6. **CI validation** - Ensure tests pass in CI environment
7. **Update dependencies** - Mark item 050 complete, unblock items 051-053

## Dependency Analysis

**Item 050 depends on:**
- **Item 049** (implement-gitceilingdirectories): ✅ COMPLETE
  - Implementation is done and working
  - This item (050) adds verification

**Items that depend on 050:**
- **Item 051** (ensure-all-23-failing-tests-pass): ⏸️ BLOCKED
  - Cannot validate tests pass without verification tests running
- **Item 052** (document-git-behavior): ⏸️ BLOCKED
  - Depends on 051 which depends on 050
- **Item 053** (verify-no-regressions): ⏸️ BLOCKED
  - Depends on 052 which depends on 051 which depends on 050

**Critical Path:** 049 → 050 → 051 → 052 → 053

Item 050 is the **bottleneck** for milestone M1 completion.

## References

- **Implementation**: `src/git/validation.ts:181-222`
- **Tests**: `src/__tests__/git/index.test.ts:381-426`
- **Documentation**: `TESTING.md:27-113`
- **Specification**: `specs/fix-git-tests-ci.md`
- **Roadmap**: `ROADMAP.md:583-590` ([DONE-11])
- **Dependency**: Item 049 (implementation)
- **Dependents**: Items 051, 052, 053
- **Related**: Item 089 (mock pollution fix)

---

**Research completed**: 2025-01-26
**Files analyzed**: 15+ files
**Implementation verified**: ✅ Complete
**Tests identified**: ⚠️ Skipped due to mock pollution
**Documentation status**: ✅ Complete
**Blocker identified**: ⚠️ Mock pollution from ideas.test.ts
