import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  afterAll,
  mock,
  vi,
} from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import * as realChildProcess from "node:child_process";
import { runOnboardingIfNeeded } from "../../onboarding";
import { findRepoRoot } from "../../fs";
import { RepoNotFoundError } from "../../errors";
import { loadConfig, DEFAULT_CONFIG } from "../../config";
import type { Logger } from "../../logging";

const mockedSpawn = vi.fn();

afterAll(() => {
  mock.restore();
});

// Preserve all exports from node:child_process, only mock spawn
mock.module("node:child_process", () => ({
  ...realChildProcess,
  spawn: mockedSpawn,
}));

const { isGitRepo, getCurrentBranch, branchExists, ensureBranch } =
  await import("../../git");

function createMockLogger(): Logger & { messages: string[] } {
  const messages: string[] = [];
  return {
    messages,
    debug: vi.fn((msg: string) => messages.push(`debug: ${msg}`)),
    info: vi.fn((msg: string) => messages.push(`info: ${msg}`)),
    warn: vi.fn((msg: string) => messages.push(`warn: ${msg}`)),
    error: vi.fn((msg: string) => messages.push(`error: ${msg}`)),
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
  mockedSpawn.mockReturnValueOnce(mockProc as any);
}

function mockSpawnSequence(
  responses: Array<{ stdout: string; exitCode: number }>,
): void {
  for (const r of responses) {
    mockSpawnOnce(r.stdout, r.exitCode);
  }
}

describe("Repo State Detection - Tests 31-41", () => {
  let tempDir: string;
  let mockLogger: Logger & { messages: string[] };

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-repo-state-"));
    mockLogger = createMockLogger();
    vi.clearAllMocks();
    mockedSpawn.mockReset();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  afterAll(() => {
    mockedSpawn.mockRestore();
  });

  describe("2.1 Git repo detection", () => {
    describe("Test 31: Interactive, not a git repo", () => {
      it("returns { proceed: false, reason: 'not-git-repo' } when not in git repo", async () => {
        const result = await runOnboardingIfNeeded(mockLogger, {
          cwd: tempDir,
          interactive: true,
          noTui: true,
        });

        expect(result.proceed).toBe(false);
        expect(result.reason).toBe("not-git-repo");
      });

      it("logs guidance about not being a git repository", async () => {
        await runOnboardingIfNeeded(mockLogger, {
          cwd: tempDir,
          interactive: true,
          noTui: true,
        });

        expect(
          mockLogger.messages.some((l) => l.includes("Not a git repository")),
        ).toBe(true);
      });
    });

    describe("Test 32: Non-interactive, not a git repo", () => {
      it("returns not-git-repo in non-interactive mode", async () => {
        const result = await runOnboardingIfNeeded(mockLogger, {
          cwd: tempDir,
          interactive: false,
          noTui: false,
        });

        expect(result.proceed).toBe(false);
        expect(result.reason).toBe("not-git-repo");
      });

      it("logs guidance with git init instructions", async () => {
        await runOnboardingIfNeeded(mockLogger, {
          cwd: tempDir,
          interactive: false,
          noTui: false,
        });

        expect(mockLogger.error).toHaveBeenCalledWith("Not a git repository.");
        expect(mockLogger.messages.some((l) => l.includes("git init"))).toBe(
          true,
        );
      });
    });

    describe("Test 33: Git not installed - isGitRepo returns false", () => {
      it("isGitRepo returns false when git command fails", async () => {
        const mockProc = {
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event: string, cb: (code: number | null) => void) => {
            if (event === "error") {
              setTimeout(() => cb(null), 0);
            }
          }),
        };
        mockedSpawn.mockReturnValueOnce(mockProc as never);

        mockProc.on.mockImplementation(
          (event: string, cb: (code: number | null) => void) => {
            if (event === "error") {
              setTimeout(
                () =>
                  (cb as (arg: unknown) => void)(new Error("spawn git ENOENT")),
                0,
              );
            }
            return mockProc;
          },
        );

        const result = await isGitRepo(tempDir);
        expect(result).toBe(false);
      });

      it("getCurrentBranch throws clear error when git not available", async () => {
        mockSpawnOnce("", 1);

        const options = {
          cwd: tempDir,
          logger: mockLogger,
        };

        await expect(getCurrentBranch(options)).rejects.toThrow(
          "Failed to get current branch",
        );
      });
    });
  });

  describe("2.2 Default branch detection (main vs master)", () => {
    describe("Test 34: Repo with main only; base_branch unset - defaults to main", () => {
      beforeEach(async () => {
        await fs.mkdir(path.join(tempDir, ".git"));
        await fs.mkdir(path.join(tempDir, ".wreckit"));
      });

      it("defaults base_branch to main when config file is missing", async () => {
        const config = await loadConfig(tempDir);

        expect(config.base_branch).toBe("main");
      });

      it("uses main as default from DEFAULT_CONFIG", () => {
        expect(DEFAULT_CONFIG.base_branch).toBe("main");
      });
    });

    describe("Test 35: Repo with master only; base_branch set to master - uses master", () => {
      beforeEach(async () => {
        await fs.mkdir(path.join(tempDir, ".git"));
        await fs.mkdir(path.join(tempDir, ".wreckit"));
        await fs.writeFile(
          path.join(tempDir, ".wreckit", "config.json"),
          JSON.stringify({
            schema_version: 1,
            base_branch: "master",
            agent: {
              command: "test",
              args: [],
              completion_signal: "DONE",
            },
          }),
        );
      });

      it("uses master when configured", async () => {
        const config = await loadConfig(tempDir);

        expect(config.base_branch).toBe("master");
      });

      it("ensureBranch uses configured master branch", async () => {
        mockSpawnSequence([
          { stdout: "", exitCode: 1 },
          { stdout: "", exitCode: 0 },
          { stdout: "", exitCode: 0 },
        ]);

        const result = await ensureBranch("master", "wreckit/", "item-1", {
          cwd: tempDir,
          logger: mockLogger,
        });

        expect(result.branchName).toBe("wreckit/item-1");
        expect(mockedSpawn).toHaveBeenCalledWith(
          "git",
          ["checkout", "master"],
          expect.any(Object),
        );
      });
    });

    describe("Test 36: Repo with both main and master; config specifies one - uses configured", () => {
      beforeEach(async () => {
        await fs.mkdir(path.join(tempDir, ".git"));
        await fs.mkdir(path.join(tempDir, ".wreckit"));
      });

      it("uses main when config specifies main", async () => {
        await fs.writeFile(
          path.join(tempDir, ".wreckit", "config.json"),
          JSON.stringify({
            schema_version: 1,
            base_branch: "main",
            agent: { command: "test", args: [], completion_signal: "DONE" },
          }),
        );

        const config = await loadConfig(tempDir);

        expect(config.base_branch).toBe("main");
      });

      it("uses master when config specifies master", async () => {
        await fs.writeFile(
          path.join(tempDir, ".wreckit", "config.json"),
          JSON.stringify({
            schema_version: 1,
            base_branch: "master",
            agent: { command: "test", args: [], completion_signal: "DONE" },
          }),
        );

        const config = await loadConfig(tempDir);
        expect(config.base_branch).toBe("master");
      });

      it("supports custom branch names like develop", async () => {
        await fs.writeFile(
          path.join(tempDir, ".wreckit", "config.json"),
          JSON.stringify({
            schema_version: 1,
            base_branch: "develop",
            agent: { command: "test", args: [], completion_signal: "DONE" },
          }),
        );

        const config = await loadConfig(tempDir);
        expect(config.base_branch).toBe("develop");
      });
    });

    describe("Test 37: Repo with neither main nor master - clear error about missing base branch", () => {
      beforeEach(async () => {
        await fs.mkdir(path.join(tempDir, ".git"));
        await fs.mkdir(path.join(tempDir, ".wreckit"));
        await fs.writeFile(
          path.join(tempDir, ".wreckit", "config.json"),
          JSON.stringify({
            schema_version: 1,
            base_branch: "nonexistent",
            agent: { command: "test", args: [], completion_signal: "DONE" },
          }),
        );
      });

      it("ensureBranch fails when base branch does not exist", async () => {
        mockSpawnSequence([
          { stdout: "", exitCode: 1 },
          {
            stdout: "error: pathspec 'nonexistent' did not match",
            exitCode: 1,
          },
        ]);

        await expect(
          ensureBranch("nonexistent", "wreckit/", "item-1", {
            cwd: tempDir,
            logger: mockLogger,
          }),
        ).rejects.toThrow();
      });

      it("branchExists returns false for missing branch", async () => {
        mockSpawnOnce("", 1);

        const exists = await branchExists("nonexistent", {
          cwd: tempDir,
          logger: mockLogger,
        });

        expect(exists).toBe(false);
      });
    });

    describe("Test 38: Case sensitivity of base_branch - fail with clear error", () => {
      beforeEach(async () => {
        await fs.mkdir(path.join(tempDir, ".git"));
        await fs.mkdir(path.join(tempDir, ".wreckit"));
      });

      it("git is case-sensitive - Main does not match main", async () => {
        await fs.writeFile(
          path.join(tempDir, ".wreckit", "config.json"),
          JSON.stringify({
            schema_version: 1,
            base_branch: "Main",
            agent: { command: "test", args: [], completion_signal: "DONE" },
          }),
        );

        mockSpawnSequence([
          { stdout: "", exitCode: 1 },
          { stdout: "error: pathspec 'Main' did not match", exitCode: 1 },
        ]);

        await expect(
          ensureBranch("Main", "wreckit/", "item-1", {
            cwd: tempDir,
            logger: mockLogger,
          }),
        ).rejects.toThrow();
      });

      it("branchExists is case-sensitive", async () => {
        mockSpawnOnce("", 1);

        const existsMain = await branchExists("Main", {
          cwd: tempDir,
          logger: mockLogger,
        });
        expect(existsMain).toBe(false);

        mockSpawnOnce("", 0);
        const existsmain = await branchExists("main", {
          cwd: tempDir,
          logger: mockLogger,
        });
        expect(existsmain).toBe(true);
      });
    });
  });

  describe("2.3 .wreckit folder presence & mismatch", () => {
    describe("Test 39: No .wreckit, interactive - prompts via promptInit", () => {
      beforeEach(async () => {
        await fs.mkdir(path.join(tempDir, ".git"));
      });

      it("returns noninteractive when noTui is true", async () => {
        const result = await runOnboardingIfNeeded(mockLogger, {
          cwd: tempDir,
          interactive: true,
          noTui: true,
        });

        expect(result.proceed).toBe(false);
        expect(result.reason).toBe("noninteractive");
      });

      it("logs guidance about wreckit init when not interactive", async () => {
        await runOnboardingIfNeeded(mockLogger, {
          cwd: tempDir,
          interactive: false,
          noTui: false,
        });

        expect(
          mockLogger.messages.some((l) =>
            l.includes("wreckit is not initialized"),
          ),
        ).toBe(true);
        expect(
          mockLogger.messages.some((l) => l.includes("wreckit init")),
        ).toBe(true);
      });
    });

    describe("Test 40: No .wreckit, non-interactive - logs guidance, exit non-zero", () => {
      beforeEach(async () => {
        await fs.mkdir(path.join(tempDir, ".git"));
      });

      it("returns noninteractive reason", async () => {
        const result = await runOnboardingIfNeeded(mockLogger, {
          cwd: tempDir,
          interactive: false,
          noTui: false,
        });

        expect(result.proceed).toBe(false);
        expect(result.reason).toBe("noninteractive");
      });

      it("logs wreckit init command", async () => {
        await runOnboardingIfNeeded(mockLogger, {
          cwd: tempDir,
          interactive: false,
          noTui: false,
        });

        expect(mockLogger.error).toHaveBeenCalledWith(
          "wreckit is not initialized in this repo.",
        );
        expect(mockLogger.info).toHaveBeenCalledWith("  wreckit init");
      });

      it("logs wreckit ideas guidance", async () => {
        await runOnboardingIfNeeded(mockLogger, {
          cwd: tempDir,
          interactive: false,
          noTui: false,
        });

        expect(
          mockLogger.messages.some((l) => l.includes("wreckit ideas")),
        ).toBe(true);
      });
    });

    describe("Test 41: .wreckit present without .git - RepoNotFoundError", () => {
      beforeEach(async () => {
        await fs.mkdir(path.join(tempDir, ".wreckit"));
      });

      it("findRepoRoot throws RepoNotFoundError", () => {
        expect(() => findRepoRoot(tempDir)).toThrow(RepoNotFoundError);
      });

      it("error message indicates .wreckit exists but no .git", () => {
        expect(() => findRepoRoot(tempDir)).toThrow(
          /Found .wreckit.*but no .git/,
        );
      });

      it("findRepoRoot from nested directory also throws", async () => {
        const nestedDir = path.join(tempDir, "src", "deep", "nested");
        await fs.mkdir(nestedDir, { recursive: true });

        expect(() => findRepoRoot(nestedDir)).toThrow(RepoNotFoundError);
        expect(() => findRepoRoot(nestedDir)).toThrow(
          /Found .wreckit.*but no .git/,
        );
      });
    });
  });

  describe("Combined scenarios", () => {
    it("git repo with .wreckit and ideas proceeds successfully", async () => {
      await fs.mkdir(path.join(tempDir, ".git"));
      await fs.mkdir(path.join(tempDir, ".wreckit"));
      await fs.writeFile(
        path.join(tempDir, ".wreckit", "config.json"),
        JSON.stringify({ schema_version: 1 }),
      );

      const ideaDir = path.join(
        tempDir,
        ".wreckit",
        "features",
        "001-test-idea",
      );
      await fs.mkdir(ideaDir, { recursive: true });
      await fs.writeFile(
        path.join(ideaDir, "item.json"),
        JSON.stringify({
          schema_version: 1,
          id: "features/001-test-idea",
          title: "Test idea",
          section: "features",
          state: "idea",
          overview: "",
          branch: null,
          pr_url: null,
          pr_number: null,
          last_error: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      );

      const result = await runOnboardingIfNeeded(mockLogger, {
        cwd: tempDir,
        interactive: false,
        noTui: false,
      });

      expect(result.proceed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("findRepoRoot works with both .git and .wreckit present", async () => {
      await fs.mkdir(path.join(tempDir, ".git"));
      await fs.mkdir(path.join(tempDir, ".wreckit"));

      const result = findRepoRoot(tempDir);
      expect(result).toBe(tempDir);
    });

    it("findRepoRoot finds root from nested directory", async () => {
      await fs.mkdir(path.join(tempDir, ".git"));
      await fs.mkdir(path.join(tempDir, ".wreckit"));
      const nestedDir = path.join(tempDir, "src", "components");
      await fs.mkdir(nestedDir, { recursive: true });

      const result = findRepoRoot(nestedDir);
      expect(result).toBe(tempDir);
    });
  });
});
