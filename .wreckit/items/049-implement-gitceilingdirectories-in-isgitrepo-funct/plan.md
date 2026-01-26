# Implementation Plan: Implement `GIT_CEILING_DIRECTORIES` in `isGitRepo()` function

## Implementation Plan Title
Implement `GIT_CEILING_DIRECTORIES` in `isGitRepo()` function (specs/fix-git-tests-ci.md)

## Overview
This implementation plan validates and verifies the already-completed fix for git integration test failures in CI. The fix uses `GIT_CEILING_DIRECTORIES` environment variable to prevent git from searching parent directories when checking if a directory is a git repository. This is critical for CI environments where temp directories are created inside the workspace's git repository.

## Current State
The core implementation is **already complete** in `src/git/index.ts:308-342` (specifically lines 313-317).
- Environment variable set to `path.dirname(cwd)`
- Custom environment passed to `spawn()` call
- Clear comments explaining the purpose

## Desired End State
The `isGitRepo()` function correctly identifies whether a directory is a git repository, regardless of whether the test code itself is running inside a parent git repository.
- Dedicated test validates `isGitRepo(tempDir)` returns `false` inside a git repo
- All git integration tests pass in CI
- Local tests continue to pass

## What We're NOT Doing
- ❌ Re-implementing the fix (already in production)
- ❌ Changing other git functions
- ❌ Adding CI-specific test skips
- ❌ Alternative detection methods

## Implementation Approach
Verification-first approach:
1. Add a regression test locally.
2. Verify in CI.
3. Update Roadmap.

## Phases

### Phase 1: Add Verification Test
Add a dedicated test case to verify that `isGitRepo()` correctly returns `false` for temporary directories, even when the test runner itself is executing inside a git repository.

**Changes required in `src/__tests__/git/index.test.ts`**:
- Add `describe("isGitRepo")` block
- Add test case for ceiling directory behavior
- Add test case for legitimate git repo detection

### Phase 2: CI and Roadmap Verification
Run full suite locally and in CI to ensure no regressions and milestone completion.

## Testing Strategy
- **Unit Tests**: Add tests to `src/__tests__/git/index.test.ts` using real `git init` and temp directories.
- **Integration Tests**: Verify full `bun test` suite passes locally and in CI.
- **Manual Verification**: Manual check with `mktemp` and `bun -e`.