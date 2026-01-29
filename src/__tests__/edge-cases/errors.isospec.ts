import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  afterAll,
  vi,
} from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { Logger } from "../../logging";
import { RepoNotFoundError } from "../../errors";

import * as childProcess from "node:child_process";
import {
  runAgentUnion,
  type AgentConfigUnion,
  type UnionRunAgentOptions,
} from "../../agent";
import { pushBranch, getPrByBranch, type GitOptions } from "../../git";
import { findRepoRoot } from "../../fs";

const spawn = vi.spyOn(childProcess, "spawn");

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
  stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
  on: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
  killed: boolean;
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
    stdin: { write: vi.fn(), end: vi.fn() },
    on: onFn,
    kill: vi.fn(),
    killed: false,
  };
}

function createMockProcessWithError(error: Error): MockProcess {
  const stdoutOn = vi.fn();
  const stderrOn = vi.fn();
  const onFn = vi.fn((event: string, cb: (err?: Error) => void) => {
    if (event === "error") {
      setTimeout(() => cb(error), 5);
    }
  });

  return {
    stdout: { on: stdoutOn },
    stderr: { on: stderrOn },
    stdin: { write: vi.fn(), end: vi.fn() },
    on: onFn,
    kill: vi.fn(),
    killed: false,
  };
}

function mockSpawnOnce(stdout: string, exitCode: number): void {
  const mockProc = createMockProcess(stdout, exitCode);
  spawn.mockReturnValueOnce(mockProc as any);
}

function mockSpawnError(error: Error): MockProcess {
  const mockProc = createMockProcessWithError(error);
  spawn.mockReturnValueOnce(mockProc as any);
  return mockProc;
}

describe("Edge Case Tests 59-65: Error Conditions", () => {
  let tempDir: string;
  let mockLogger: Logger;

  beforeEach(async () => {
    vi.clearAllMocks();
    spawn.mockReset();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-error-test-"));
    mockLogger = createMockLogger();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  afterAll(() => {
    spawn.mockRestore();
  });

  describe("Test 59: Agent spawn failure - config points to non-existent binary", () => {
    it("returns success: false and exitCode: null when agent binary not found", async () => {
      mockSpawnError(new Error("ENOENT: spawn /nonexistent/binary failed"));

      const config: AgentConfigUnion = {
        kind: "process",
        command: "/nonexistent/binary",
        args: [],
        completion_signal: "<promise>COMPLETE</promise>",
      };

      const options: UnionRunAgentOptions = {
        config,
        cwd: tempDir,
        prompt: "test prompt",
        logger: mockLogger,
      };

      const result = await runAgentUnion(options);

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(null);
      expect(result.completionDetected).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it("logs spawn failure with clear error message", async () => {
      mockSpawnError(new Error("ENOENT: spawn failed"));

      const config: AgentConfigUnion = {
        kind: "process",
        command: "/path/to/missing/agent",
        args: ["--flag"],
        completion_signal: "<promise>COMPLETE</promise>",
      };

      const options: UnionRunAgentOptions = {
        config,
        cwd: tempDir,
        prompt: "test prompt",
        logger: mockLogger,
      };

      const result = await runAgentUnion(options);

      expect(result.success).toBe(false);
      expect(result.output).toContain("error");
    });
  });

  describe("Test 60: Agent timeout - agent runs longer than timeout_seconds", () => {
    it("sends SIGTERM and returns timedOut: true", async () => {
      const mockProc: MockProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn(),
        kill: vi.fn(),
        killed: false,
      };

      let closeCallback: ((code: number | null) => void) | null = null;
      mockProc.on.mockImplementation(
        (event: string, cb: (code?: number | null) => void) => {
          if (event === "close") {
            closeCallback = cb as (code: number | null) => void;
          }
        },
      );

      spawn.mockReturnValueOnce(mockProc as any);

      const config: AgentConfigUnion = {
        kind: "process",
        command: "sleep",
        args: ["10"],
        completion_signal: "<promise>COMPLETE</promise>",
      };

      const options: UnionRunAgentOptions = {
        config,
        cwd: tempDir,
        prompt: "test prompt",
        logger: mockLogger,
        timeoutSeconds: 1,
      };

      const resultPromise = runAgentUnion(options);

      await new Promise((resolve) => setTimeout(resolve, 1100));

      expect(mockProc.kill).toHaveBeenCalledWith("SIGTERM");
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("timed out"),
      );

      if (closeCallback) {
        (closeCallback as (code: number | null) => void)(null);
      }

      const result = await resultPromise;
      expect(result.timedOut).toBe(true);
      expect(result.success).toBe(false);
    });

    it("sets timedOut flag when agent exceeds timeout", async () => {
      const mockProc: MockProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn(),
        kill: vi.fn(),
        killed: false,
      };

      let closeCallback: ((code: number | null) => void) | null = null;
      mockProc.on.mockImplementation(
        (event: string, cb: (code?: number | null) => void) => {
          if (event === "close") {
            closeCallback = cb as (code: number | null) => void;
          }
        },
      );

      spawn.mockReturnValueOnce(mockProc as any);

      const config: AgentConfigUnion = {
        kind: "process",
        command: "long-running-agent",
        args: [],
        completion_signal: "<promise>COMPLETE</promise>",
      };

      const options: UnionRunAgentOptions = {
        config,
        cwd: tempDir,
        prompt: "test prompt",
        logger: mockLogger,
        timeoutSeconds: 1,
      };

      const resultPromise = runAgentUnion(options);

      await new Promise((resolve) => setTimeout(resolve, 1100));

      if (closeCallback) {
        (closeCallback as (code: number | null) => void)(null);
      }

      const result = await resultPromise;
      expect(result.timedOut).toBe(true);
      expect(result.completionDetected).toBe(false);
    });
  });

  describe("Test 61: Completion signal not detected - agent exits 0 without signal", () => {
    it("returns success: false and completionDetected: false", async () => {
      mockSpawnOnce("Some output without completion signal\n", 0);

      const config: AgentConfigUnion = {
        kind: "process",
        command: "sh",
        args: ["-c", "echo 'output'"],
        completion_signal: "<promise>COMPLETE</promise>",
      };

      const options: UnionRunAgentOptions = {
        config,
        cwd: tempDir,
        prompt: "test prompt",
        logger: mockLogger,
      };

      const result = await runAgentUnion(options);

      expect(result.success).toBe(false);
      expect(result.completionDetected).toBe(false);
      expect(result.exitCode).toBe(0);
      expect(result.timedOut).toBe(false);
    });

    it("treats partial completion signal as not detected", async () => {
      mockSpawnOnce("<promise>COMPLE", 0);

      const config: AgentConfigUnion = {
        kind: "process",
        command: "sh",
        args: ["-c", "echo partial"],
        completion_signal: "<promise>COMPLETE</promise>",
      };

      const options: UnionRunAgentOptions = {
        config,
        cwd: tempDir,
        prompt: "test prompt",
        logger: mockLogger,
      };

      const result = await runAgentUnion(options);

      expect(result.success).toBe(false);
      expect(result.completionDetected).toBe(false);
    });
  });

  describe("Test 62: Git failure (push denied) - push fails", () => {
    it("propagates error when push is denied", async () => {
      mockSpawnOnce("", 1);

      const options: GitOptions = {
        cwd: "/repo",
        logger: mockLogger,
      };

      await expect(pushBranch("feature-branch", options)).rejects.toThrow();

      expect(spawn).toHaveBeenCalledWith(
        "git",
        ["push", "-u", "origin", "feature-branch"],
        expect.any(Object),
      );
    });

    it("handles permission denied error", async () => {
      mockSpawnOnce("", 128);

      const options: GitOptions = {
        cwd: "/repo",
        logger: mockLogger,
      };

      await expect(pushBranch("protected-branch", options)).rejects.toThrow();

      expect(spawn).toHaveBeenCalled();
    });

    it("handles network failure during push", async () => {
      mockSpawnOnce("", 1);

      const options: GitOptions = {
        cwd: "/repo",
        logger: mockLogger,
      };

      await expect(pushBranch("feature-branch", options)).rejects.toThrow();

      expect(spawn).toHaveBeenCalled();
    });
  });

  describe("Test 63: GH CLI not installed/unauthenticated - gh missing or unauthorized", () => {
    it("returns null when gh CLI exits with non-zero code", async () => {
      mockSpawnOnce("", 1);

      const options: GitOptions = {
        cwd: "/repo",
        logger: mockLogger,
      };

      const result = await getPrByBranch("feature-branch", options);

      expect(result).toBeNull();
    });

    it("returns null when gh CLI returns auth error (exit code 1)", async () => {
      mockSpawnOnce("", 1);

      const options: GitOptions = {
        cwd: "/repo",
        logger: mockLogger,
      };

      const result = await getPrByBranch("feature-branch", options);

      expect(result).toBeNull();
    });

    it("returns null when gh CLI is unauthenticated (exit code 4)", async () => {
      mockSpawnOnce("", 4);

      const options: GitOptions = {
        cwd: "/repo",
        logger: mockLogger,
      };

      const result = await getPrByBranch("feature-branch", options);

      expect(result).toBeNull();
    });

    it("returns null when no PR exists for branch", async () => {
      mockSpawnOnce("", 1);

      const options: GitOptions = {
        cwd: "/repo",
        logger: mockLogger,
      };

      const result = await getPrByBranch("no-pr-branch", options);

      expect(result).toBeNull();
    });
  });

  describe("Test 64: PR view JSON parse failure - gh pr view returns malformed JSON", () => {
    it("returns null when gh returns invalid JSON", async () => {
      mockSpawnOnce("{ invalid json }", 0);

      const options: GitOptions = {
        cwd: "/repo",
        logger: mockLogger,
      };

      const result = await getPrByBranch("feature-branch", options);

      expect(result).toBeNull();
    });

    it("returns null when gh returns empty response with success code", async () => {
      mockSpawnOnce("", 0);

      const options: GitOptions = {
        cwd: "/repo",
        logger: mockLogger,
      };

      const result = await getPrByBranch("feature-branch", options);

      expect(result).toBeNull();
    });

    it("returns null when gh returns truncated JSON", async () => {
      mockSpawnOnce('{"url": "https://github.com/org/repo/pull/50", "numb', 0);

      const options: GitOptions = {
        cwd: "/repo",
        logger: mockLogger,
      };

      const result = await getPrByBranch("feature-branch", options);

      expect(result).toBeNull();
    });

    it("handles HTML error responses gracefully", async () => {
      mockSpawnOnce("<html><body>Error 500</body></html>", 0);

      const options: GitOptions = {
        cwd: "/repo",
        logger: mockLogger,
      };

      const result = await getPrByBranch("feature-branch", options);

      expect(result).toBeNull();
    });

    it("returns parsed data when valid JSON is returned", async () => {
      mockSpawnOnce(
        JSON.stringify({
          url: "https://github.com/org/repo/pull/50",
          number: 50,
        }),
        0,
      );

      const options: GitOptions = {
        cwd: "/repo",
        logger: mockLogger,
      };

      const result = await getPrByBranch("feature-branch", options);

      expect(result).toEqual({
        url: "https://github.com/org/repo/pull/50",
        number: 50,
      });
    });
  });

  describe("Test 65: Repo root not found by findRepoRoot - missing .git or .wreckit", () => {
    it("throws RepoNotFoundError when no .git or .wreckit exist", async () => {
      const emptyDir = path.join(tempDir, "empty-project");
      await fs.mkdir(emptyDir, { recursive: true });

      expect(() => findRepoRoot(emptyDir)).toThrow(RepoNotFoundError);
      expect(() => findRepoRoot(emptyDir)).toThrow(
        "Could not find repository root with .git and .wreckit directories",
      );
    });

    it("throws RepoNotFoundError with informative message when .wreckit exists without .git", async () => {
      const mismatchDir = path.join(tempDir, "mismatched-repo");
      await fs.mkdir(path.join(mismatchDir, ".wreckit"), { recursive: true });

      expect(() => findRepoRoot(mismatchDir)).toThrow(RepoNotFoundError);
      expect(() => findRepoRoot(mismatchDir)).toThrow(
        /Found .wreckit at .* but no .git directory/,
      );
    });

    it("throws RepoNotFoundError when only .git exists (no .wreckit)", async () => {
      const gitOnlyDir = path.join(tempDir, "git-only-repo");
      await fs.mkdir(path.join(gitOnlyDir, ".git"), { recursive: true });

      expect(() => findRepoRoot(gitOnlyDir)).toThrow(RepoNotFoundError);
      expect(() => findRepoRoot(gitOnlyDir)).toThrow(
        "Could not find repository root with .git and .wreckit directories",
      );
    });

    it("walks up directory tree and fails if no valid root found", async () => {
      const deepDir = path.join(tempDir, "a", "b", "c", "d");
      await fs.mkdir(deepDir, { recursive: true });

      expect(() => findRepoRoot(deepDir)).toThrow(RepoNotFoundError);
    });

    it("finds repo root when both .git and .wreckit exist", async () => {
      const validRepo = path.join(tempDir, "valid-repo");
      await fs.mkdir(path.join(validRepo, ".git"), { recursive: true });
      await fs.mkdir(path.join(validRepo, ".wreckit"), { recursive: true });

      const result = findRepoRoot(validRepo);
      expect(result).toBe(validRepo);
    });

    it("finds repo root from nested subdirectory", async () => {
      const validRepo = path.join(tempDir, "nested-repo");
      await fs.mkdir(path.join(validRepo, ".git"), { recursive: true });
      await fs.mkdir(path.join(validRepo, ".wreckit"), { recursive: true });
      const nestedDir = path.join(validRepo, "src", "components", "ui");
      await fs.mkdir(nestedDir, { recursive: true });

      const result = findRepoRoot(nestedDir);
      expect(result).toBe(validRepo);
    });

    it("throws when .wreckit is found before .git while walking up", async () => {
      const repoRoot = path.join(tempDir, "parent-git");
      await fs.mkdir(path.join(repoRoot, ".git"), { recursive: true });

      const childWithWreckit = path.join(repoRoot, "child-wreckit");
      await fs.mkdir(path.join(childWithWreckit, ".wreckit"), {
        recursive: true,
      });

      expect(() => findRepoRoot(childWithWreckit)).toThrow(RepoNotFoundError);
      expect(() => findRepoRoot(childWithWreckit)).toThrow(
        /Found .wreckit at .* but no .git directory/,
      );
    });
  });
});
