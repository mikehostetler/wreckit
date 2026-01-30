import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  spyOn,
  mock,
} from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { Logger } from "../../logging";

function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    json: vi.fn(),
  };
}

describe("git/index", () => {
  let tempDir: string;
  let mockLogger: Logger;
  let runGhCommandSpy: ReturnType<typeof vi.spyOn>;
  let gitModule: typeof import("../../git/index");

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-git-test-"));
    mockLogger = createMockLogger();
    // Import the git module
    gitModule = await import("../../git/index");
    // Spy on the internal runGhCommand function
    runGhCommandSpy = vi.spyOn(gitModule, "runGhCommand");
  });

  afterEach(async () => {
    runGhCommandSpy.mockRestore();
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("checkPrMergeability", () => {
    it("returns mergeable: true when PR is mergeable", async () => {
      runGhCommandSpy.mockResolvedValue({
        stdout: JSON.stringify({ mergeable: true }),
        exitCode: 0,
      });

      const result = await gitModule.checkPrMergeability(123, {
        cwd: tempDir,
        logger: mockLogger,
        dryRun: false,
      });

      expect(result.mergeable).toBe(true);
      expect(result.determined).toBe(true);
    });

    it("returns mergeable: false when PR has conflicts", async () => {
      runGhCommandSpy.mockResolvedValue({
        stdout: JSON.stringify({ mergeable: false }),
        exitCode: 0,
      });

      const result = await gitModule.checkPrMergeability(456, {
        cwd: tempDir,
        logger: mockLogger,
        dryRun: false,
      });

      expect(result.mergeable).toBe(false);
      expect(result.determined).toBe(true);
    });

    it("returns determined: false when GitHub hasn't calculated mergeability yet", async () => {
      runGhCommandSpy.mockResolvedValue({
        stdout: JSON.stringify({ mergeable: null }),
        exitCode: 0,
      });

      const result = await gitModule.checkPrMergeability(789, {
        cwd: tempDir,
        logger: mockLogger,
        dryRun: false,
      });

      expect(result.mergeable).toBe(false);
      expect(result.determined).toBe(false);
    });

    it("returns determined: false when gh command fails", async () => {
      runGhCommandSpy.mockResolvedValue({
        stdout: "",
        exitCode: 1,
      });

      const result = await gitModule.checkPrMergeability(999, {
        cwd: tempDir,
        logger: mockLogger,
        dryRun: false,
      });

      expect(result.mergeable).toBe(false);
      expect(result.determined).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to check mergeability"),
      );
    });

    it("returns determined: false when JSON parsing fails", async () => {
      runGhCommandSpy.mockResolvedValue({
        stdout: "invalid json",
        exitCode: 0,
      });

      const result = await gitModule.checkPrMergeability(111, {
        cwd: tempDir,
        logger: mockLogger,
        dryRun: false,
      });

      expect(result.mergeable).toBe(false);
      expect(result.determined).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to parse mergeability"),
      );
    });

    it("returns success in dryRun mode", async () => {
      const result = await gitModule.checkPrMergeability(222, {
        cwd: tempDir,
        logger: mockLogger,
        dryRun: true,
      });

      expect(result.mergeable).toBe(true);
      expect(result.determined).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("[dry-run]"),
      );
      // In dryRun mode, runGhCommand should not be called
      expect(runGhCommandSpy).not.toHaveBeenCalled();
    });
  });

  describe("checkMergeConflicts", () => {
    it("returns no conflicts in dryRun mode", async () => {
      const result = await gitModule.checkMergeConflicts(
        "main",
        "feature-branch",
        {
          cwd: tempDir,
          logger: mockLogger,
          dryRun: true,
        },
      );

      expect(result.hasConflicts).toBe(false);
      // In dry run, error is not set
      expect(result.error).toBeUndefined();
    });

    it("returns correct result structure", async () => {
      const result = await gitModule.checkMergeConflicts(
        "main",
        "feature-branch",
        {
          cwd: tempDir,
          logger: mockLogger,
          dryRun: true,
        },
      );

      // Verify result structure
      expect(result).toHaveProperty("hasConflicts");
      expect(typeof result.hasConflicts).toBe("boolean");
      // error is optional and may be undefined
      if ("error" in result) {
        if (result.error !== undefined) {
          expect(typeof result.error).toBe("string");
        }
      }
    });
  });

  describe("getPrDetails", () => {
    it("returns merged PR details with all fields", async () => {
      const mergedAt = "2024-01-15T10:30:00Z";
      const mergeCommitOid = "abc123def456";

      runGhCommandSpy.mockResolvedValue({
        stdout: JSON.stringify({
          state: "MERGED",
          baseRefName: "main",
          headRefName: "wreckit/001-test-feature",
          mergeCommit: { oid: mergeCommitOid },
          mergedAt: mergedAt,
          statusCheckRollup: [
            { status: "COMPLETED", conclusion: "SUCCESS" },
            { status: "COMPLETED", conclusion: "SUCCESS" },
          ],
        }),
        exitCode: 0,
      });

      const result = await gitModule.getPrDetails(42, {
        cwd: tempDir,
        logger: mockLogger,
        dryRun: false,
      });

      expect(result.merged).toBe(true);
      expect(result.querySucceeded).toBe(true);
      expect(result.baseRefName).toBe("main");
      expect(result.headRefName).toBe("wreckit/001-test-feature");
      expect(result.mergeCommitOid).toBe(mergeCommitOid);
      expect(result.mergedAt).toBe(mergedAt);
      expect(result.checksPassed).toBe(true);
    });

    it("returns not merged when PR state is not MERGED", async () => {
      runGhCommandSpy.mockResolvedValue({
        stdout: JSON.stringify({
          state: "OPEN",
          baseRefName: "main",
          headRefName: "wreckit/001-test-feature",
          mergeCommit: null,
          mergedAt: null,
          statusCheckRollup: [],
        }),
        exitCode: 0,
      });

      const result = await gitModule.getPrDetails(42, {
        cwd: tempDir,
        logger: mockLogger,
        dryRun: false,
      });

      expect(result.merged).toBe(false);
      expect(result.querySucceeded).toBe(true);
    });

    it("returns checksPassed=false when some checks failed", async () => {
      runGhCommandSpy.mockResolvedValue({
        stdout: JSON.stringify({
          state: "MERGED",
          baseRefName: "main",
          headRefName: "wreckit/001-test-feature",
          mergeCommit: { oid: "abc123" },
          mergedAt: "2024-01-15T10:30:00Z",
          statusCheckRollup: [
            { status: "COMPLETED", conclusion: "SUCCESS" },
            { status: "COMPLETED", conclusion: "FAILURE" },
          ],
        }),
        exitCode: 0,
      });

      const result = await gitModule.getPrDetails(42, {
        cwd: tempDir,
        logger: mockLogger,
        dryRun: false,
      });

      expect(result.checksPassed).toBe(false);
    });

    it("returns checksPassed=null when no checks present", async () => {
      runGhCommandSpy.mockResolvedValue({
        stdout: JSON.stringify({
          state: "MERGED",
          baseRefName: "main",
          headRefName: "wreckit/001-test-feature",
          mergeCommit: { oid: "abc123" },
          mergedAt: "2024-01-15T10:30:00Z",
          statusCheckRollup: [],
        }),
        exitCode: 0,
      });

      const result = await gitModule.getPrDetails(42, {
        cwd: tempDir,
        logger: mockLogger,
        dryRun: false,
      });

      expect(result.checksPassed).toBe(null);
    });

    it("distinguishes PR not found from gh command failure (Gap 3)", async () => {
      // Simulate PR not found
      runGhCommandSpy.mockResolvedValue({
        stdout: "",
        stderr: "Could not resolve to a PullRequest",
        exitCode: 1,
      });

      const result = await gitModule.getPrDetails(999, {
        cwd: tempDir,
        logger: mockLogger,
        dryRun: false,
      });

      expect(result.merged).toBe(false);
      expect(result.querySucceeded).toBe(true); // Query succeeded, PR just doesn't exist
      expect(result.error).toBe("PR not found");
    });

    it("detects gh command failures (auth issues)", async () => {
      // Simulate gh auth failure
      runGhCommandSpy.mockResolvedValue({
        stdout: "",
        stderr: "gh: authentication failed",
        exitCode: 1,
      });

      const result = await gitModule.getPrDetails(42, {
        cwd: tempDir,
        logger: mockLogger,
        dryRun: false,
      });

      expect(result.merged).toBe(false);
      expect(result.querySucceeded).toBe(false); // gh command itself failed
      expect(result.error).toContain("gh command failed");
    });

    it("returns dry-run stub data", async () => {
      const result = await gitModule.getPrDetails(42, {
        cwd: tempDir,
        logger: mockLogger,
        dryRun: true,
      });

      expect(result.merged).toBe(true);
      expect(result.querySucceeded).toBe(true);
      expect(result.baseRefName).toBe("main");
      expect(result.headRefName).toBe("feature-branch");
      expect(result.mergeCommitOid).toBe("abc123");
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("[dry-run]"),
      );
    });

    it("validates PR merged to correct branch (Gap 1)", async () => {
      // PR merged to wrong branch (develop instead of main)
      runGhCommandSpy.mockClear().mockResolvedValue({
        stdout: JSON.stringify({
          state: "MERGED",
          baseRefName: "develop", // Wrong branch
          headRefName: "wreckit/001-test-feature",
          mergeCommit: { oid: "abc123" },
          mergedAt: "2024-01-15T10:30:00Z",
          statusCheckRollup: [],
        }),
        exitCode: 0,
      });

      const result = await gitModule.getPrDetails(42, {
        cwd: tempDir,
        logger: mockLogger,
        dryRun: false,
      });

      expect(result.merged).toBe(true);
      expect(result.baseRefName).toBe("develop"); // Caller should validate against config.base_branch
    });
  });

  // NOTE: Mock pollution from ideas.test.ts has been fixed
  // These tests validate GIT_CEILING_DIRECTORIES behavior
  describe("isGitRepo", () => {
    beforeEach(async () => {
      // Restore all mocks and re-import git module to get real implementation
      mock.restore();
      // Re-import to get fresh module after mock.restore()
      gitModule = await import("../../git/index");
      // Re-establish spy on runGhCommand
      runGhCommandSpy = vi.spyOn(gitModule, "runGhCommand");
    });

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

    it("returns true for the current repository", async () => {
      // Restore the spy before running real git commands
      runGhCommandSpy.mockRestore();

      // Verify that the current repository (where tests are running) is detected
      // This ensures we didn't break legitimate git repo detection
      const repoRoot = process.cwd();

      const result = await gitModule.isGitRepo(repoRoot);

      expect(result).toBe(true);
    });
  });
});
