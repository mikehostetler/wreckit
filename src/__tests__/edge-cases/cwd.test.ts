import { describe, it, expect, beforeEach, afterEach, mock, spyOn, vi } from "bun:test";
import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { spawn } from "node:child_process";
import { findRepoRoot } from "../../fs";
import { RepoNotFoundError } from "../../errors";
import { runOnboardingIfNeeded } from "../../onboarding";
import type { Logger } from "../../logging";

async function isGitRepoReal(cwd: string): Promise<boolean> {
  return new Promise((resolve) => {
    let proc: ReturnType<typeof spawn> | undefined;

    try {
      proc = spawn("git", ["rev-parse", "--git-dir"], {
        cwd,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {
      resolve(false);
      return;
    }

    if (!proc || typeof proc.on !== "function") {
      resolve(false);
      return;
    }

    proc.on("close", (code) => {
      resolve(code === 0);
    });

    proc.on("error", () => {
      resolve(false);
    });
  });
}

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

function resolveCwd(cwdOption?: string): string {
  if (cwdOption) {
    return path.resolve(cwdOption);
  }
  return process.cwd();
}

function realPath(p: string): string {
  try {
    return fsSync.realpathSync(p);
  } catch {
    return p;
  }
}

describe("--cwd Flag Edge Cases", () => {
  let tempDir: string;

  beforeEach(async () => {
    const rawTempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-cwd-test-"));
    tempDir = fsSync.realpathSync(rawTempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("Test 1: Absolute vs relative path resolution", () => {
    it("resolves absolute path correctly", () => {
      const absolutePath = "/tmp/repo";
      const result = resolveCwd(absolutePath);
      expect(result).toBe(absolutePath);
    });

    it("resolves relative path to absolute", () => {
      const originalCwd = process.cwd();
      const result = resolveCwd("./subdir");
      expect(result).toBe(path.resolve(originalCwd, "./subdir"));
      expect(path.isAbsolute(result)).toBe(true);
    });

    it("resolves parent relative path correctly", async () => {
      const subdir = path.join(tempDir, "subdir");
      await fs.mkdir(subdir, { recursive: true });

      const originalCwd = process.cwd();
      try {
        process.chdir(subdir);
        const result = realPath(resolveCwd(".."));
        expect(result).toBe(tempDir);
      } finally {
        process.chdir(originalCwd);
      }
    });

    it("uses process.cwd() when no cwd option provided", () => {
      const result = resolveCwd();
      expect(result).toBe(process.cwd());
    });

    it("absolute and relative resolve to same canonical path", async () => {
      await fs.mkdir(path.join(tempDir, ".git"));
      await fs.mkdir(path.join(tempDir, ".wreckit"));
      const subdir = path.join(tempDir, "subdir");
      await fs.mkdir(subdir, { recursive: true });

      const absoluteResult = realPath(resolveCwd(tempDir));

      const originalCwd = process.cwd();
      try {
        process.chdir(subdir);
        const relativeResult = realPath(resolveCwd(".."));
        expect(absoluteResult).toBe(relativeResult);
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  describe("Test 2: --cwd pointing to subdirectory of repo", () => {
    it("findRepoRoot finds root from nested subdirectory", async () => {
      await fs.mkdir(path.join(tempDir, ".git"));
      await fs.mkdir(path.join(tempDir, ".wreckit"));
      const deepNested = path.join(tempDir, "packages", "pkgA", "src");
      await fs.mkdir(deepNested, { recursive: true });

      const result = findRepoRoot(deepNested);
      expect(result).toBe(tempDir);
    });

    it("findRepoRoot finds root from immediate subdirectory", async () => {
      await fs.mkdir(path.join(tempDir, ".git"));
      await fs.mkdir(path.join(tempDir, ".wreckit"));
      const subdir = path.join(tempDir, "src");
      await fs.mkdir(subdir, { recursive: true });

      const result = findRepoRoot(subdir);
      expect(result).toBe(tempDir);
    });

    it(".wreckit in repo root is used when running from subdirectory", async () => {
      await fs.mkdir(path.join(tempDir, ".git"));
      await fs.mkdir(path.join(tempDir, ".wreckit"));
      const subdir = path.join(tempDir, "packages", "pkgA");
      await fs.mkdir(subdir, { recursive: true });

      const resolvedCwd = resolveCwd(subdir);
      const repoRoot = findRepoRoot(resolvedCwd);

      expect(repoRoot).toBe(tempDir);
      expect(fsSync.existsSync(path.join(repoRoot, ".wreckit"))).toBe(true);
    });

    it("resolveCwd with . from subdirectory still finds repo root", async () => {
      await fs.mkdir(path.join(tempDir, ".git"));
      await fs.mkdir(path.join(tempDir, ".wreckit"));
      const subdir = path.join(tempDir, "packages", "pkgA");
      await fs.mkdir(subdir, { recursive: true });

      const originalCwd = process.cwd();
      try {
        process.chdir(subdir);
        const resolvedCwd = realPath(resolveCwd("."));
        const repoRoot = findRepoRoot(resolvedCwd);
        expect(repoRoot).toBe(tempDir);
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  describe("Test 3: --cwd pointing outside any git repo", () => {
    it("findRepoRoot throws RepoNotFoundError when no .git exists", async () => {
      expect(() => findRepoRoot(tempDir)).toThrow(RepoNotFoundError);
      expect(() => findRepoRoot(tempDir)).toThrow(
        /Could not find repository root/
      );
    });

    it("isGitRepo returns false for non-git directory", async () => {
      const result = await isGitRepoReal(tempDir);
      expect(result).toBe(false);
    });

    it("runOnboardingIfNeeded returns not-git-repo reason", async () => {
      const mockLogger = createMockLogger();
      const result = await runOnboardingIfNeeded(mockLogger, {
        cwd: tempDir,
        interactive: false,
        noTui: true,
      });

      expect(result.proceed).toBe(false);
      expect(result.reason).toBe("not-git-repo");
    });

    it("runOnboardingIfNeeded logs appropriate error for non-git repo", async () => {
      const mockLogger = createMockLogger();
      await runOnboardingIfNeeded(mockLogger, {
        cwd: tempDir,
        interactive: false,
        noTui: true,
      });

      expect(
        mockLogger.messages.some((m) => m.includes("Not a git repository"))
      ).toBe(true);
    });
  });

  describe("Test 4: .wreckit without .git (mismatched root)", () => {
    it("throws RepoNotFoundError with specific message", async () => {
      await fs.mkdir(path.join(tempDir, ".wreckit"));

      expect(() => findRepoRoot(tempDir)).toThrow(RepoNotFoundError);
      expect(() => findRepoRoot(tempDir)).toThrow(
        /Found .wreckit.*but no .git/
      );
    });

    it("error message includes the path where .wreckit was found", async () => {
      await fs.mkdir(path.join(tempDir, ".wreckit"));

      try {
        findRepoRoot(tempDir);
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(RepoNotFoundError);
        expect((err as RepoNotFoundError).message).toContain(tempDir);
      }
    });

    it("detects mismatch from nested subdirectory", async () => {
      await fs.mkdir(path.join(tempDir, ".wreckit"));
      const subdir = path.join(tempDir, "src", "deep");
      await fs.mkdir(subdir, { recursive: true });

      expect(() => findRepoRoot(subdir)).toThrow(RepoNotFoundError);
      expect(() => findRepoRoot(subdir)).toThrow(/Found .wreckit.*but no .git/);
    });
  });

  describe("Test 5: --cwd pointing above repo root", () => {
    it("treats parent of repo as not a git repo", async () => {
      const repoDir = path.join(tempDir, "repo");
      await fs.mkdir(path.join(repoDir, ".git"), { recursive: true });
      await fs.mkdir(path.join(repoDir, ".wreckit"));

      expect(() => findRepoRoot(tempDir)).toThrow(RepoNotFoundError);
      expect(() => findRepoRoot(tempDir)).toThrow(
        /Could not find repository root/
      );
    });

    it("isGitRepo returns false for parent directory", async () => {
      const repoDir = path.join(tempDir, "repo");
      await fs.mkdir(path.join(repoDir, ".git"), { recursive: true });

      const result = await isGitRepoReal(tempDir);
      expect(result).toBe(false);
    });

    it("runOnboardingIfNeeded fails when cwd is above repo", async () => {
      const repoDir = path.join(tempDir, "repo");
      await fs.mkdir(path.join(repoDir, ".git"), { recursive: true });
      await fs.mkdir(path.join(repoDir, ".wreckit"));

      const mockLogger = createMockLogger();
      const result = await runOnboardingIfNeeded(mockLogger, {
        cwd: tempDir,
        interactive: false,
        noTui: true,
      });

      expect(result.proceed).toBe(false);
      expect(result.reason).toBe("not-git-repo");
    });
  });

  describe("Test 6: Non-existent --cwd", () => {
    it("resolveCwd resolves non-existent path to absolute", () => {
      const nonExistent = path.join(tempDir, "missing", "dir");
      const result = resolveCwd(nonExistent);
      expect(result).toBe(nonExistent);
      expect(path.isAbsolute(result)).toBe(true);
    });

    it("findRepoRoot throws when path does not exist", () => {
      const nonExistent = path.join(tempDir, "missing");

      expect(() => findRepoRoot(nonExistent)).toThrow();
    });

    it("runOnboardingIfNeeded handles non-existent cwd gracefully", async () => {
      const mockLogger = createMockLogger();
      const nonExistent = path.join(tempDir, "missing");

      const result = await runOnboardingIfNeeded(mockLogger, {
        cwd: nonExistent,
        interactive: false,
        noTui: true,
      });

      expect(result.proceed).toBe(false);
      expect(result.reason).toBe("not-git-repo");
    });

    it("no partial initialization occurs with non-existent cwd", async () => {
      const mockLogger = createMockLogger();
      const nonExistent = path.join(tempDir, "missing");

      await runOnboardingIfNeeded(mockLogger, {
        cwd: nonExistent,
        interactive: false,
        noTui: true,
      });

      expect(fsSync.existsSync(nonExistent)).toBe(false);
      expect(fsSync.existsSync(path.join(nonExistent, ".wreckit"))).toBe(false);
    });
  });

  describe("Test 7: --cwd used with all subcommands", () => {
    let repoDir: string;
    let mockLogger: Logger & { messages: string[] };

    beforeEach(async () => {
      repoDir = path.join(tempDir, "repo");
      await fs.mkdir(path.join(repoDir, ".git"), { recursive: true });
      await fs.mkdir(path.join(repoDir, ".wreckit"));
      mockLogger = createMockLogger();
    });

    it("resolveCwd is consistent across invocations", () => {
      const cwd1 = resolveCwd(repoDir);
      const cwd2 = resolveCwd(repoDir);
      expect(cwd1).toBe(cwd2);
    });

    it("findRepoRoot works with resolved cwd", () => {
      const resolvedCwd = resolveCwd(repoDir);
      const result = findRepoRoot(resolvedCwd);
      expect(result).toBe(repoDir);
    });

    it("commands do not accidentally use process.cwd when --cwd is provided", async () => {
      const originalCwd = process.cwd();
      const resolvedCwd = resolveCwd(repoDir);

      expect(resolvedCwd).not.toBe(originalCwd);
      expect(resolvedCwd).toBe(repoDir);

      const result = findRepoRoot(resolvedCwd);
      expect(result).toBe(repoDir);
    });

    it("cwd option is passed correctly through onboarding", async () => {
      const result = await runOnboardingIfNeeded(mockLogger, {
        cwd: repoDir,
        interactive: false,
        noTui: true,
      });

      expect(result.reason).toBe("noninteractive");
    });

    it("relative cwd from different working directory resolves correctly", async () => {
      const otherDir = path.join(tempDir, "other");
      await fs.mkdir(otherDir, { recursive: true });

      const originalCwd = process.cwd();
      try {
        process.chdir(tempDir);
        const resolvedCwd = realPath(resolveCwd("./repo"));
        expect(resolvedCwd).toBe(repoDir);
        const result = findRepoRoot(resolvedCwd);
        expect(result).toBe(repoDir);
      } finally {
        process.chdir(originalCwd);
      }
    });

    it("absolute cwd works regardless of current working directory", async () => {
      const otherDir = path.join(tempDir, "other");
      await fs.mkdir(otherDir, { recursive: true });

      const originalCwd = process.cwd();
      try {
        process.chdir(otherDir);
        const resolvedCwd = resolveCwd(repoDir);
        expect(resolvedCwd).toBe(repoDir);
        const result = findRepoRoot(resolvedCwd);
        expect(result).toBe(repoDir);
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  describe("Edge cases for path normalization", () => {
    it("handles trailing slashes", () => {
      const withSlash = tempDir + "/";
      const result = resolveCwd(withSlash);
      expect(result).toBe(tempDir);
    });

    it("handles double slashes", () => {
      const doubleSlash = tempDir + "//subdir";
      const result = resolveCwd(doubleSlash);
      expect(result).toBe(path.join(tempDir, "subdir"));
    });

    it("handles . in path", () => {
      const dotPath = path.join(tempDir, ".", "subdir");
      const result = resolveCwd(dotPath);
      expect(result).toBe(path.join(tempDir, "subdir"));
    });

    it("handles .. in path", async () => {
      const subdir = path.join(tempDir, "a", "b");
      await fs.mkdir(subdir, { recursive: true });

      const dotDotPath = path.join(tempDir, "a", "b", "..", "..");
      const result = resolveCwd(dotDotPath);
      expect(result).toBe(tempDir);
    });
  });

  describe("Integration: Full cwd resolution workflow", () => {
    it("complete workflow from cwd option to repo root", async () => {
      await fs.mkdir(path.join(tempDir, ".git"));
      await fs.mkdir(path.join(tempDir, ".wreckit"));
      const deepPath = path.join(tempDir, "a", "b", "c", "d");
      await fs.mkdir(deepPath, { recursive: true });

      const cwdOption = deepPath;
      const resolvedCwd = resolveCwd(cwdOption);

      expect(path.isAbsolute(resolvedCwd)).toBe(true);
      expect(resolvedCwd).toBe(deepPath);

      const repoRoot = findRepoRoot(resolvedCwd);

      expect(repoRoot).toBe(tempDir);
      expect(fsSync.existsSync(path.join(repoRoot, ".git"))).toBe(true);
      expect(fsSync.existsSync(path.join(repoRoot, ".wreckit"))).toBe(true);
    });

    it("error handling workflow for invalid cwd", async () => {
      await fs.mkdir(path.join(tempDir, ".wreckit"));

      const cwdOption = tempDir;
      const resolvedCwd = resolveCwd(cwdOption);

      expect(() => findRepoRoot(resolvedCwd)).toThrow(RepoNotFoundError);

      try {
        findRepoRoot(resolvedCwd);
      } catch (err) {
        expect(err).toBeInstanceOf(RepoNotFoundError);
        expect((err as RepoNotFoundError).code).toBe("REPO_NOT_FOUND");
      }
    });
  });
});
