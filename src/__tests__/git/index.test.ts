import { describe, it, expect, beforeEach, afterEach, vi, spyOn } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { Logger } from "../../logging";
import { checkPrMergeability, checkMergeConflicts, getPrDetails, type PrDetails } from "../../git";

function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    json: vi.fn(),
  };
}

// Import the git module to spy on its internal function
import * as gitModule from "../../git";

describe("git/index", () => {
  let tempDir: string;
  let mockLogger: Logger;
  let runGhCommandSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-git-test-"));
    mockLogger = createMockLogger();
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

      const result = await checkPrMergeability(123, {
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

      const result = await checkPrMergeability(456, {
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

      const result = await checkPrMergeability(789, {
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

      const result = await checkPrMergeability(999, {
        cwd: tempDir,
        logger: mockLogger,
        dryRun: false,
      });

      expect(result.mergeable).toBe(false);
      expect(result.determined).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining("Failed to check mergeability"));
    });

    it("returns determined: false when JSON parsing fails", async () => {
      runGhCommandSpy.mockResolvedValue({
        stdout: "invalid json",
        exitCode: 0,
      });

      const result = await checkPrMergeability(111, {
        cwd: tempDir,
        logger: mockLogger,
        dryRun: false,
      });

      expect(result.mergeable).toBe(false);
      expect(result.determined).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining("Failed to parse mergeability"));
    });

    it("returns success in dryRun mode", async () => {
      const result = await checkPrMergeability(222, {
        cwd: tempDir,
        logger: mockLogger,
        dryRun: true,
      });

      expect(result.mergeable).toBe(true);
      expect(result.determined).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("[dry-run]"));
      // In dryRun mode, runGhCommand should not be called
      expect(runGhCommandSpy).not.toHaveBeenCalled();
    });
  });

  describe("checkMergeConflicts", () => {
    it("returns no conflicts in dryRun mode", async () => {
      const result = await checkMergeConflicts("main", "feature-branch", {
        cwd: tempDir,
        logger: mockLogger,
        dryRun: true,
      });

      expect(result.hasConflicts).toBe(false);
      // In dry run, error is not set
      expect(result.error).toBeUndefined();
    });

    it("returns correct result structure", async () => {
      const result = await checkMergeConflicts("main", "feature-branch", {
        cwd: tempDir,
        logger: mockLogger,
        dryRun: true,
      });

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

      const result = await getPrDetails(42, {
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

      const result = await getPrDetails(42, {
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

      const result = await getPrDetails(42, {
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

      const result = await getPrDetails(42, {
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

      const result = await getPrDetails(999, {
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

      const result = await getPrDetails(42, {
        cwd: tempDir,
        logger: mockLogger,
        dryRun: false,
      });

      expect(result.merged).toBe(false);
      expect(result.querySucceeded).toBe(false); // gh command itself failed
      expect(result.error).toContain("gh command failed");
    });

    it("returns dry-run stub data", async () => {
      const result = await getPrDetails(42, {
        cwd: tempDir,
        logger: mockLogger,
        dryRun: true,
      });

      expect(result.merged).toBe(true);
      expect(result.querySucceeded).toBe(true);
      expect(result.baseRefName).toBe("main");
      expect(result.headRefName).toBe("feature-branch");
      expect(result.mergeCommitOid).toBe("abc123");
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("[dry-run]"));
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

      const result = await getPrDetails(42, {
        cwd: tempDir,
        logger: mockLogger,
        dryRun: false,
      });

      expect(result.merged).toBe(true);
      expect(result.baseRefName).toBe("develop"); // Caller should validate against config.base_branch
    });
  });
});
