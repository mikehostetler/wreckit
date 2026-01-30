# Testing Guide

This document explains testing conventions and special considerations for the Wreckit codebase.

## Running Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test src/__tests__/git/index.test.ts

# Run with coverage
bun test --coverage
```

## Git Integration Testing

### CI vs Local Testing Environments

Git integration tests behave differently in CI environments compared to local development due to how git searches for repository directories.

**The Problem:**

In GitHub Actions CI, the workspace runs inside a git repository (`/home/runner/work/wreckit/wreckit`). When tests create temporary directories using `fs.mkdtemp(os.tmpdir(), ...)`, these directories may be nested inside the workspace's git repository. Git commands search upward through parent directories and can incorrectly find the workspace's `.git` directory, causing tests to fail with false positives.

**Example:**

```typescript
// Test creates temp directory
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-test-"));
// tempDir might be /tmp/wreckit-test-XXX

// Without fix: git searches upward, finds /home/runner/work/wreckit/wreckit/.git
const isRepo = await isGitRepo(tempDir);
// Expected: false
// Actual in CI: true (WRONG!)
```

**The Solution:**

The `isGitRepo()` function in `src/git/validation.ts` uses the `GIT_CEILING_DIRECTORIES` environment variable to prevent git from searching above a specified directory:

```typescript
export async function isGitRepo(cwd: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      // Set GIT_CEILING_DIRECTORIES to prevent git from searching parent directories
      // This ensures that even when running inside a git repo (e.g., in CI),
      // checking a subdirectory correctly returns false if that subdirectory is not itself a git repo
      const ceilingDir = path.dirname(cwd);
      const env = { ...process.env, GIT_CEILING_DIRECTORIES: ceilingDir };

      proc = spawn("git", ["rev-parse", "--git-dir"], {
        cwd,
        stdio: ["pipe", "pipe", "pipe"],
        env, // Pass custom environment
      });
    } catch {
      resolve(false);
      return;
    }
    // ... rest of function
  });
}
```

**How It Works:**

- `GIT_CEILING_DIRECTORIES` tells git to stop searching above the specified directory
- Setting it to `path.dirname(cwd)` means "don't search above the parent of the directory we're checking"
- This ensures that `/tmp/wreckit-test-XXX` is correctly identified as non-git, even when `/home/runner/work/wreckit/wreckit` is a git repo

### Writing Git Tests

When writing tests that interact with git:

1. **Use temporary directories** - Always use `fs.mkdtemp()` for isolated test environments
2. **Clean up properly** - Use `try/finally` to ensure temp directories are deleted
3. **Test the actual `isGitRepo()` function** - Don't use local implementations that bypass the fix
4. **Consider CI environment** - Tests that pass locally may fail in CI if they don't account for the parent repository

**Example Test:**

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

  it("returns true when directory is actually a git repo", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-test-"));
    try {
      // Initialize git repo
      await spawn("git", ["init"], { cwd: tempDir });

      const result = await isGitRepo(tempDir);
      expect(result).toBe(true);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
```

## Test Organization

### Test File Locations

- `src/__tests__/git/` - Git operation tests
- `src/__tests__/edge-cases/` - Edge case and boundary tests
- `src/__tests__/integration/` - Integration tests
- `src/__tests__/unit/` - Unit tests for individual modules

### Test Naming

- Use `.test.ts` suffix for test files
- Use `.isospec.ts` for property-based tests (fast-check)
- Group related tests in `describe()` blocks
- Use descriptive test names that explain what is being tested

## Mocking

Git operations are mocked in some tests to avoid dependencies on git being installed:

```typescript
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));
```

When mocking git, ensure tests still verify the correct behavior with ceiling directories.

## CI Test Failures

If git tests fail in CI but pass locally:

1. Check if the test uses `isGitRepo()` - It should use the version with `GIT_CEILING_DIRECTORIES`
2. Verify temp directories are created in `/tmp/` or outside the workspace
3. Look for false positives where git finds the workspace's `.git` directory
4. Check `specs/fix-git-tests-ci.md` for known issues and solutions

## References

- **Implementation**: `src/git/validation.ts:181-222` (specifically lines 186-190)
- **Specification**: `specs/fix-git-tests-ci.md`
- **Test Example**: `src/__tests__/git/index.test.ts` (isGitRepo describe block)
- **Milestone**: ROADMAP.md [DONE-11] Complete Git Integration Test Fix
