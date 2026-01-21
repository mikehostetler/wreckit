# Fix Git Integration Tests Failing in CI

## Problem Statement

Git integration tests in `src/__tests__/z-git.test.ts` pass locally but fail in GitHub Actions CI. The tests create temporary directories and expect certain behaviors when running git commands in those directories, but git's parent-directory search behavior causes different results in CI.

## Root Cause Analysis

### Why Tests Pass Locally

Local tests run in a user's home directory or project root, where temp directories created via `fs.mkdtemp(os.tmpdir(), ...)` are NOT nested inside a git repository. When git commands run in these temp directories, they correctly report:
- `isGitRepo(nonRepoDir)` → `false` (no git repo found)
- `getCurrentBranch()` → works correctly within the temp repo
- `branchExists("nonexistent")` → `false` (branch doesn't exist in temp repo)

### Why Tests Fail in CI

GitHub Actions workflow runs inside `/home/runner/work/wreckit/wreckit`, which IS a git repository. When tests create temp directories like `/tmp/wreckit-non-repo-XXXX`, git commands search upward through parent directories and find the workspace's `.git` directory.

This causes the following failures:

1. **`isGitRepo(nonRepoDir)` returns `true` instead of `false`**
   - `git rev-parse --git-dir` searches parent directories
   - Finds `.git` in `/home/runner/work/wreckit/wreckit`
   - Returns exit code 0 (success), function returns `true`

2. **`getCurrentBranch(gitOptions)` returns unexpected values**
   - May return branch from parent repo instead of temp repo
   - Test expects branch to be one of `["main", "master"]` but gets parent repo's branch

3. **`branchExists("nonexistent", gitOptions)` returns `true` instead of `false`**
   - If parent repo has a branch that matches the search, returns `true`

4. **`hasUncommittedChanges(gitOptions)` returns `true` instead of `false`**
   - Parent repo may have uncommitted changes

5. **`runGitCommand` with `dryRun: true` returns actual output instead of empty string**
   - Similar issue where commands run against parent repo

6. **Remote validation tests fail similarly**
   - All tests that expect operations to be isolated are affected

### The Core Issue

The `isGitRepo` function uses `git rev-parse --git-dir` which inherently searches parent directories. This is correct git behavior - a directory nested inside a git repo IS considered part of that repo. The test assumption that temp directories are "outside" any git repo is violated in CI environments.

## Solution Approach

### Option 1: Configure Git to Stop Parent Directory Search (Recommended)

Add `GIT_CEILING_DIRECTORIES` environment variable to prevent git from searching above a certain directory:

```typescript
// In src/git/index.ts
export async function isGitRepo(cwd: string): Promise<boolean> {
  return new Promise((resolve) => {
    let proc: ReturnType<typeof spawn> | undefined;

    try {
      // Set GIT_CEILING_DIRECTORIES to the parent of cwd
      // This prevents git from searching above this directory
      const ceilingDir = path.dirname(cwd);
      const env = { ...process.env, GIT_CEILING_DIRECTORIES: ceilingDir };

      proc = spawn("git", ["rev-parse", "--git-dir"], {
        cwd,
        stdio: ["pipe", "pipe", "pipe"],
        env,  // Pass custom environment
      });
    } catch {
      resolve(false);
      return;
    }
    // ... rest of function
  });
}
```

**Pros:**
- Minimal change to implementation
- Preserves intended behavior of `isGitRepo`
- Works in all environments

**Cons:**
- Need to ensure `path` module is imported
- Must apply to other git commands if they have similar issues

### Option 2: Add CI-Specific Test Skip

Skip the problematic tests when running in CI:

```typescript
// In src/__tests__/z-git.test.ts
describe("git functions", () => {
  const isCI = process.env.CI === 'true';

  describe("isGitRepo", () => {
    it("returns false outside git repo", async () => {
      if (isCI) {
        console.log("Skipping in CI - temp dirs are nested in repo");
        return;
      }
      // ... test code
    });
  });
});
```

**Pros:**
- Quick fix
- No production code changes

**Cons:**
- Reduces test coverage in CI
- Doesn't actually fix the underlying issue
- Tests should verify behavior in CI too

### Option 3: Use Alternative Git Repo Detection

Change `isGitRepo` to check for `.git` directory in the current path only, without using git commands:

```typescript
import { existsSync } from "node:fs";

export async function isGitRepo(cwd: string): Promise<boolean> {
  // Check for .git directory or file (for worktrees)
  const gitDir = path.join(cwd, ".git");
  return existsSync(gitDir);
}
```

**Pros:**
- Simple implementation
- No parent directory search

**Cons:**
- Doesn't work for git worktrees (`.git` is a file, not directory)
- Less robust than git's own detection
- May miss edge cases

### Option 4: Test Isolation via Subdirectory Creation

Create temp directories deeper in the path hierarchy:

```typescript
// In tests
const nonRepoDir = path.join(
  await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-")),
  "deeply",
  "nested",
  "non-repo"
);
await fs.mkdir(nonRepoDir, { recursive: true });
```

**Pros:**
- Tests remain meaningful
- No production code changes

**Cons:**
- Hacky solution
- Doesn't fix root cause
- May still fail if `/tmp` itself is in a git repo

## Recommended Implementation

**Option 1** is the best approach. Use `GIT_CEILING_DIRECTORIES` to ensure git commands respect the intended directory boundary.

### Implementation Steps

1. Update `isGitRepo` in `src/git/index.ts` to set `GIT_CEILING_DIRECTORIES`

2. Add test to verify the fix works:

```typescript
describe("isGitRepo with ceiling directories", () => {
  it("returns false when in subdirectory of git repo but ceiling is set", async () => {
    // This test verifies that even when running inside a git repo,
    // creating a temp directory and checking isGitRepo returns false
    // because GIT_CEILING_DIRECTORIES prevents upward search
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-test-"));
    try {
      const result = await isGitRepo(tempDir);
      expect(result).toBe(false);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
```

3. Run tests locally to verify they still pass

4. Push to CI and verify tests pass

### Additional Considerations

- The `runCommand` function already correctly uses `cwd` for git commands, so most other tests should work correctly once `isGitRepo` is fixed
- The dry-run tests may need similar treatment if they're still failing
- Remote validation tests in the same file may have similar issues and should be reviewed

## Acceptance Criteria

- [ ] All 23 failing tests in `src/__tests__/z-git.test.ts` pass in CI
- [ ] Tests continue to pass locally
- [ ] `isGitRepo` correctly identifies non-git directories even when nested in a git repo
- [ ] No regressions in production git operations
- [ ] Code includes comments explaining the `GIT_CEILING_DIRECTORIES` usage

## Related Files

- `src/git/index.ts` - Main implementation file
- `src/__tests__/z-git.test.ts` - Failing test file
- `.github/workflows/ci.yml` - CI configuration (for reference)
