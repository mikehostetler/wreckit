import { describe, it, expect, beforeEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { Logger } from "../logging";
import type { GitOptions } from "../git";
import * as realChildProcess from "node:child_process";

// Import without mocking - these tests will use real git
const {
  isGitRepo,
  getCurrentBranch,
  branchExists,
  ensureBranch,
  hasUncommittedChanges,
  commitAll,
  pushBranch,
  createOrUpdatePr,
  isPrMerged,
  getPrByBranch,
  runGitCommand,
  runGhCommand,
} = await import("../git");

function createMockLogger(): Logger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    json: () => {},
  };
}

describe("git functions", () => {
  let tempDir: string;
  let mockLogger: Logger;
  let gitOptions: GitOptions;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-git-test-"));
    mockLogger = createMockLogger();
    gitOptions = {
      cwd: tempDir,
      logger: mockLogger,
    };

    // Initialize git repo
    await fs.writeFile(path.join(tempDir, ".gitkeep"), "");
    await Bun.$`cd ${tempDir} && git init`.quiet();
    await Bun.$`cd ${tempDir} && git config user.email "test@test.com" && git config user.name "Test"`.quiet();
    await Bun.$`cd ${tempDir} && git add . && git commit -m "init"`.quiet();
  });

  // Note: These tests use real git commands
  // They're integration tests rather than unit tests
  // This is because Bun's mock.module doesn't support proper cleanup

  describe("isGitRepo", () => {
    it("returns true in git repo", async () => {
      const result = await isGitRepo(tempDir);
      expect(result).toBe(true);
    });

    it("returns false outside git repo", async () => {
      const nonRepoDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-non-repo-"));
      try {
        const result = await isGitRepo(nonRepoDir);
        expect(result).toBe(false);
      } finally {
        await fs.rm(nonRepoDir, { recursive: true, force: true });
      }
    });
  });

  describe("getCurrentBranch", () => {
    it("returns current branch name", async () => {
      const result = await getCurrentBranch(gitOptions);
      expect(["main", "master"]).toContain(result); // git may use either
    });
  });

  describe("branchExists", () => {
    it("returns true for existing branch", async () => {
      // First get the actual branch name
      const currentBranch = await getCurrentBranch(gitOptions);
      const result = await branchExists(currentBranch, gitOptions);
      expect(result).toBe(true);
    });

    it("returns false for non-existing branch", async () => {
      const result = await branchExists("nonexistent", gitOptions);
      expect(result).toBe(false);
    });
  });

  describe("hasUncommittedChanges", () => {
    it("returns false when no changes", async () => {
      const result = await hasUncommittedChanges(gitOptions);
      expect(result).toBe(false);
    });

    it("returns true when changes exist", async () => {
      await fs.writeFile(path.join(tempDir, "newfile.txt"), "content");
      const result = await hasUncommittedChanges(gitOptions);
      expect(result).toBe(true);
    });
  });

  describe("runGitCommand", () => {
    it("executes git commands", async () => {
      const result = await runGitCommand(["status", "--porcelain"], gitOptions);
      expect(result.exitCode).toBe(0);
    });

    it("handles dryRun", async () => {
      const dryOptions: GitOptions = { ...gitOptions, dryRun: true };
      const result = await runGitCommand(["status"], dryOptions);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("");
    });
  });

  describe("runGhCommand", () => {
    it("executes gh commands (may fail if gh not installed)", async () => {
      const result = await runGhCommand(["--version"], gitOptions);
      // We don't assert success here since gh might not be installed
      expect(typeof result.exitCode).toBe("number");
    });

    it("handles dryRun", async () => {
      const dryOptions: GitOptions = { ...gitOptions, dryRun: true };
      const result = await runGhCommand(["--version"], dryOptions);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("");
    });
  });

  describe("commitAll", () => {
    it("handles dryRun", async () => {
      const dryOptions: GitOptions = { ...gitOptions, dryRun: true };
      await commitAll("Test commit", dryOptions);
      // Should not throw in dryRun mode
      const status = await runGitCommand(["status", "--porcelain"], gitOptions);
      expect(status.stdout).toBe(""); // No actual changes made
    });
  });

  describe("pushBranch", () => {
    it("handles dryRun", async () => {
      const dryOptions: GitOptions = { ...gitOptions, dryRun: true };
      await pushBranch("test-branch", dryOptions);
      // Should not throw in dryRun mode
    });
  });

  describe("createOrUpdatePr", () => {
    it("handles dryRun", async () => {
      const dryOptions: GitOptions = { ...gitOptions, dryRun: true };
      const result = await createOrUpdatePr(
        "main",
        "test-branch",
        "Test PR",
        "Body",
        dryOptions
      );
      expect(result.created).toBe(true);
      expect(result.number).toBe(0);
    });
  });

  describe("isPrMerged", () => {
    it("returns false when PR not found", async () => {
      // gh might not be configured, so we expect this to return false or throw
      const result = await isPrMerged(999, gitOptions);
      expect(result).toBe(false);
    });
  });

  describe("getPrByBranch", () => {
    it("returns null when PR not found", async () => {
      const result = await getPrByBranch("nonexistent-branch", gitOptions);
      expect(result).toBeNull();
    });
  });
});
