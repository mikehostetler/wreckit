import { describe, it, expect, beforeEach, afterAll, mock, vi } from "bun:test";
import * as realChildProcess from "node:child_process";
import type { Logger } from "../../logging";
import type { GitOptions } from "../../git";

const mockedSpawn = vi.fn();

afterAll(() => {
  mock.module("node:child_process", () => realChildProcess);
});

mock.module("node:child_process", () => ({
  spawn: mockedSpawn,
}));

const {
  getCurrentBranch,
  branchExists,
  ensureBranch,
} = await import("../../git");

function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    json: vi.fn(),
  };
}

interface MockProcess {
  stdout: { on: ReturnType<typeof vi.fn> };
  stderr: { on: ReturnType<typeof vi.fn> };
  on: ReturnType<typeof vi.fn>;
}

function createMockProcess(stdout: string, exitCode: number): MockProcess {
  const stdoutOn = vi.fn((event: string, cb: (data: Buffer) => void) => {
    if (event === "data") {
      setTimeout(() => cb(Buffer.from(stdout)), 0);
    }
  });
  const stderrOn = vi.fn();
  const onFn = vi.fn((event: string, cb: (code: number | null) => void) => {
    if (event === "close") {
      setTimeout(() => cb(exitCode), 10);
    }
  });

  return {
    stdout: { on: stdoutOn },
    stderr: { on: stderrOn },
    on: onFn,
  };
}

function mockSpawnOnce(stdout: string, exitCode: number): void {
  const mockProc = createMockProcess(stdout, exitCode);
  mockedSpawn.mockReturnValueOnce(mockProc as never);
}

function mockSpawnSequence(
  responses: Array<{ stdout: string; exitCode: number }>
): void {
  for (const r of responses) {
    mockSpawnOnce(r.stdout, r.exitCode);
  }
}

/**
 * Edge Case Tests 51-55: Branch Detection Edge Cases
 * 
 * From EDGE_CASE_TEST_PLAN.md Section 3: Branch Detection Edge Cases
 */
describe("Branch Operations Edge Cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedSpawn.mockReset();
  });

  /**
   * Test 51: Current branch equals base_branch
   * 
   * Setup: On `main`, `base_branch: "main"`
   * Command: Branch creation
   * Expected: Creates new branch from `main`; no unnecessary switches
   */
  describe("Test 51: Current branch equals base_branch", () => {
    it("creates new branch directly from main without unnecessary checkout", async () => {
      mockSpawnSequence([
        { stdout: "", exitCode: 1 },       // branchExists: branch doesn't exist
        { stdout: "", exitCode: 0 },       // checkout main (required by ensureBranch)
        { stdout: "", exitCode: 0 },       // checkout -b wreckit/item-1
      ]);
      const logger = createMockLogger();
      const options: GitOptions = { cwd: "/repo", logger };

      const result = await ensureBranch("main", "wreckit/", "item-1", options);

      expect(result.branchName).toBe("wreckit/item-1");
      expect(result.created).toBe(true);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining("Creating branch")
      );
      
      // Verify the git commands called
      expect(mockedSpawn).toHaveBeenCalledTimes(3);
      expect(mockedSpawn).toHaveBeenNthCalledWith(
        1,
        "git",
        ["show-ref", "--verify", "--quiet", "refs/heads/wreckit/item-1"],
        expect.any(Object)
      );
      expect(mockedSpawn).toHaveBeenNthCalledWith(
        2,
        "git",
        ["checkout", "main"],
        expect.any(Object)
      );
      expect(mockedSpawn).toHaveBeenNthCalledWith(
        3,
        "git",
        ["checkout", "-b", "wreckit/item-1"],
        expect.any(Object)
      );
    });

    it("creates branch from main when already on main", async () => {
      mockSpawnSequence([
        { stdout: "", exitCode: 1 },       // branchExists: branch doesn't exist
        { stdout: "", exitCode: 0 },       // checkout main (idempotent)
        { stdout: "", exitCode: 0 },       // checkout -b wreckit/raw-1
      ]);
      const logger = createMockLogger();
      const options: GitOptions = { cwd: "/repo", logger };

      const result = await ensureBranch("main", "wreckit/", "raw-1", options);

      expect(result.branchName).toBe("wreckit/raw-1");
      expect(result.created).toBe(true);
    });
  });

  /**
   * Test 52: Current branch is feature branch
   * 
   * Setup: On `feature/foo`, `base_branch: "main"`
   * Command: `run raw/1`
   * Expected: Switches to `main` before creating `wreckit/...` branch
   */
  describe("Test 52: Current branch is feature branch", () => {
    it("switches to base branch before creating wreckit branch", async () => {
      mockSpawnSequence([
        { stdout: "", exitCode: 1 },       // branchExists: wreckit/raw-1 doesn't exist
        { stdout: "", exitCode: 0 },       // checkout main (switch from feature/foo)
        { stdout: "", exitCode: 0 },       // checkout -b wreckit/raw-1
      ]);
      const logger = createMockLogger();
      const options: GitOptions = { cwd: "/repo", logger };

      const result = await ensureBranch("main", "wreckit/", "raw-1", options);

      expect(result.branchName).toBe("wreckit/raw-1");
      expect(result.created).toBe(true);
      
      // Verify it first checked out base branch (main) before creating
      expect(mockedSpawn).toHaveBeenNthCalledWith(
        2,
        "git",
        ["checkout", "main"],
        expect.any(Object)
      );
      expect(mockedSpawn).toHaveBeenNthCalledWith(
        3,
        "git",
        ["checkout", "-b", "wreckit/raw-1"],
        expect.any(Object)
      );
    });

    it("uses configured base_branch when switching", async () => {
      mockSpawnSequence([
        { stdout: "", exitCode: 1 },       // branchExists: branch doesn't exist
        { stdout: "", exitCode: 0 },       // checkout master (the configured base)
        { stdout: "", exitCode: 0 },       // checkout -b wreckit/feature-2
      ]);
      const logger = createMockLogger();
      const options: GitOptions = { cwd: "/repo", logger };

      const result = await ensureBranch("master", "wreckit/", "feature-2", options);

      expect(result.branchName).toBe("wreckit/feature-2");
      expect(result.created).toBe(true);
      
      // Should checkout master as base branch
      expect(mockedSpawn).toHaveBeenNthCalledWith(
        2,
        "git",
        ["checkout", "master"],
        expect.any(Object)
      );
    });
  });

  /**
   * Test 53: Detached HEAD
   * 
   * Setup: Checkout specific commit
   * Command: `wreckit run raw/1`
   * Expected: `getCurrentBranch` fails; clear error about detached HEAD
   */
  describe("Test 53: Detached HEAD", () => {
    it("getCurrentBranch returns HEAD when in detached HEAD state", async () => {
      mockSpawnOnce("HEAD\n", 0);
      const options: GitOptions = {
        cwd: "/repo",
        logger: createMockLogger(),
      };

      const result = await getCurrentBranch(options);

      // git rev-parse --abbrev-ref HEAD returns "HEAD" when detached
      expect(result).toBe("HEAD");
    });

    it("getCurrentBranch throws when git command fails", async () => {
      mockSpawnOnce("", 128);
      const options: GitOptions = {
        cwd: "/repo",
        logger: createMockLogger(),
      };

      await expect(getCurrentBranch(options)).rejects.toThrow(
        "Failed to get current branch"
      );
    });

    it("getCurrentBranch fails with clear error on detached HEAD state error", async () => {
      mockSpawnOnce("", 1);
      const options: GitOptions = {
        cwd: "/repo",
        logger: createMockLogger(),
      };

      await expect(getCurrentBranch(options)).rejects.toThrow(
        "Failed to get current branch"
      );
    });
  });

  /**
   * Test 54: Branch already exists
   * 
   * Setup: Branch `wreckit/raw-1` exists
   * Command: `run raw/1`
   * Expected: Logs "exists, switching to it"; `created: false`
   */
  describe("Test 54: Branch already exists", () => {
    it("switches to existing branch and returns created: false", async () => {
      mockSpawnSequence([
        { stdout: "", exitCode: 0 },       // branchExists: branch exists
        { stdout: "", exitCode: 0 },       // checkout wreckit/raw-1
      ]);
      const logger = createMockLogger();
      const options: GitOptions = { cwd: "/repo", logger };

      const result = await ensureBranch("main", "wreckit/", "raw-1", options);

      expect(result.branchName).toBe("wreckit/raw-1");
      expect(result.created).toBe(false);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining("exists, switching")
      );
    });

    it("logs correct message when branch exists", async () => {
      mockSpawnSequence([
        { stdout: "", exitCode: 0 },       // branchExists: branch exists
        { stdout: "", exitCode: 0 },       // checkout wreckit/item-1
      ]);
      const logger = createMockLogger();
      const options: GitOptions = { cwd: "/repo", logger };

      await ensureBranch("main", "wreckit/", "item-1", options);

      expect(logger.info).toHaveBeenCalledWith(
        "Branch wreckit/item-1 exists, switching to it"
      );
    });

    it("does not attempt to create branch when it exists", async () => {
      mockSpawnSequence([
        { stdout: "", exitCode: 0 },       // branchExists: branch exists
        { stdout: "", exitCode: 0 },       // checkout wreckit/existing-branch
      ]);
      const logger = createMockLogger();
      const options: GitOptions = { cwd: "/repo", logger };

      await ensureBranch("main", "wreckit/", "existing-branch", options);

      // Only 2 spawn calls: branchExists + checkout (no checkout -b)
      expect(mockedSpawn).toHaveBeenCalledTimes(2);
      expect(mockedSpawn).not.toHaveBeenCalledWith(
        "git",
        ["checkout", "-b", expect.any(String)],
        expect.any(Object)
      );
    });
  });

  /**
   * Test 55: Branch existence query failure
   * 
   * Setup: Simulate `git show-ref` failure
   * Command: Branch creation
   * Expected: `branchExists` returns `false`; attempts creation, propagates error if that fails
   */
  describe("Test 55: Branch existence query failure", () => {
    it("branchExists returns false when show-ref fails", async () => {
      mockSpawnOnce("", 1);
      const options: GitOptions = {
        cwd: "/repo",
        logger: createMockLogger(),
      };

      const result = await branchExists("nonexistent-branch", options);

      expect(result).toBe(false);
      expect(mockedSpawn).toHaveBeenCalledWith(
        "git",
        ["show-ref", "--verify", "--quiet", "refs/heads/nonexistent-branch"],
        expect.any(Object)
      );
    });

    it("branchExists returns false when show-ref exits with non-zero", async () => {
      mockSpawnOnce("", 128);
      const options: GitOptions = {
        cwd: "/repo",
        logger: createMockLogger(),
      };

      const result = await branchExists("any-branch", options);

      expect(result).toBe(false);
    });

    it("ensureBranch attempts creation when branchExists returns false due to failure", async () => {
      mockSpawnSequence([
        { stdout: "", exitCode: 128 },     // branchExists fails (git error)
        { stdout: "", exitCode: 0 },       // checkout main
        { stdout: "", exitCode: 0 },       // checkout -b wreckit/new-item
      ]);
      const logger = createMockLogger();
      const options: GitOptions = { cwd: "/repo", logger };

      const result = await ensureBranch("main", "wreckit/", "new-item", options);

      expect(result.branchName).toBe("wreckit/new-item");
      expect(result.created).toBe(true);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining("Creating branch")
      );
    });

    it("handles show-ref returning empty output gracefully", async () => {
      mockSpawnOnce("", 2);  // Unusual exit code
      const options: GitOptions = {
        cwd: "/repo",
        logger: createMockLogger(),
      };

      const result = await branchExists("some-branch", options);

      expect(result).toBe(false);
    });

    it("ensureBranch throws when branch creation fails after existence check", async () => {
      const createMockProcessWithStderr = (
        stdout: string,
        stderr: string,
        exitCode: number
      ): MockProcess => {
        const stdoutOn = vi.fn((event: string, cb: (data: Buffer) => void) => {
          if (event === "data" && stdout) {
            setTimeout(() => cb(Buffer.from(stdout)), 0);
          }
        });
        const stderrOn = vi.fn((event: string, cb: (data: Buffer) => void) => {
          if (event === "data" && stderr) {
            setTimeout(() => cb(Buffer.from(stderr)), 0);
          }
        });
        const onFn = vi.fn((event: string, cb: (code: number | null) => void) => {
          if (event === "close") {
            setTimeout(() => cb(exitCode), 10);
          }
        });

        return {
          stdout: { on: stdoutOn },
          stderr: { on: stderrOn },
          on: onFn,
        };
      };

      // branchExists returns false (branch doesn't exist)
      mockSpawnOnce("", 1);
      // checkout main succeeds
      mockSpawnOnce("", 0);
      // checkout -b fails (could fail for various reasons)
      const failProc = createMockProcessWithStderr("", "fatal: branch already exists", 128);
      mockedSpawn.mockReturnValueOnce(failProc as never);

      const logger = createMockLogger();
      const options: GitOptions = { cwd: "/repo", logger };

      // ensureBranch should throw when branch creation fails
      await expect(
        ensureBranch("main", "wreckit/", "problem-branch", options)
      ).rejects.toThrow("Failed to create branch wreckit/problem-branch");
    });
  });

  /**
   * Additional edge case tests for comprehensive coverage
   */
  describe("Additional branch operation edge cases", () => {
    it("handles custom branch prefix correctly", async () => {
      mockSpawnSequence([
        { stdout: "", exitCode: 1 },       // branchExists
        { stdout: "", exitCode: 0 },       // checkout main
        { stdout: "", exitCode: 0 },       // checkout -b
      ]);
      const logger = createMockLogger();
      const options: GitOptions = { cwd: "/repo", logger };

      const result = await ensureBranch("main", "feature/wreckit-", "item-5", options);

      expect(result.branchName).toBe("feature/wreckit-item-5");
      expect(result.created).toBe(true);
    });

    it("handles empty prefix correctly", async () => {
      mockSpawnSequence([
        { stdout: "", exitCode: 1 },
        { stdout: "", exitCode: 0 },
        { stdout: "", exitCode: 0 },
      ]);
      const logger = createMockLogger();
      const options: GitOptions = { cwd: "/repo", logger };

      const result = await ensureBranch("main", "", "raw-item-1", options);

      expect(result.branchName).toBe("raw-item-1");
      expect(result.created).toBe(true);
    });

    it("handles special characters in item slug", async () => {
      mockSpawnSequence([
        { stdout: "", exitCode: 1 },
        { stdout: "", exitCode: 0 },
        { stdout: "", exitCode: 0 },
      ]);
      const logger = createMockLogger();
      const options: GitOptions = { cwd: "/repo", logger };

      const result = await ensureBranch("main", "wreckit/", "section-001-add-feature", options);

      expect(result.branchName).toBe("wreckit/section-001-add-feature");
    });

    it("dry run returns created: true without executing git commands", async () => {
      const logger = createMockLogger();
      const options: GitOptions = { cwd: "/repo", logger, dryRun: true };

      const result = await ensureBranch("main", "wreckit/", "dry-run-item", options);

      expect(result.branchName).toBe("wreckit/dry-run-item");
      expect(result.created).toBe(true);
      expect(mockedSpawn).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining("[dry-run]")
      );
    });
  });
});
