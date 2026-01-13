import { describe, it, expect, beforeEach, afterAll, mock, spyOn, vi } from "bun:test";
import type { Logger } from "../logging";
import type { GitOptions } from "../git";
import * as realChildProcess from "node:child_process";

const mockedSpawn = vi.fn();

mock.module("node:child_process", () => ({
  spawn: mockedSpawn,
}));

afterAll(() => {
  mock.module("node:child_process", () => realChildProcess);
});

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

describe("isGitRepo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true in git repo", async () => {
    mockSpawnOnce(".git", 0);

    const result = await isGitRepo("/some/path");

    expect(result).toBe(true);
    expect(mockedSpawn).toHaveBeenCalledWith(
      "git",
      ["rev-parse", "--git-dir"],
      expect.objectContaining({ cwd: "/some/path" })
    );
  });

  it("returns false outside git repo", async () => {
    mockSpawnOnce("", 128);

    const result = await isGitRepo("/not/a/repo");

    expect(result).toBe(false);
  });
});

describe("getCurrentBranch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns current branch name", async () => {
    mockSpawnOnce("main\n", 0);
    const options: GitOptions = {
      cwd: "/repo",
      logger: createMockLogger(),
    };

    const result = await getCurrentBranch(options);

    expect(result).toBe("main");
    expect(mockedSpawn).toHaveBeenCalledWith(
      "git",
      ["rev-parse", "--abbrev-ref", "HEAD"],
      expect.objectContaining({ cwd: "/repo" })
    );
  });

  it("throws on failure", async () => {
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

describe("branchExists", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true for existing branch", async () => {
    mockSpawnOnce("", 0);
    const options: GitOptions = {
      cwd: "/repo",
      logger: createMockLogger(),
    };

    const result = await branchExists("feature-branch", options);

    expect(result).toBe(true);
    expect(mockedSpawn).toHaveBeenCalledWith(
      "git",
      ["show-ref", "--verify", "--quiet", "refs/heads/feature-branch"],
      expect.objectContaining({ cwd: "/repo" })
    );
  });

  it("returns false for non-existing branch", async () => {
    mockSpawnOnce("", 1);
    const options: GitOptions = {
      cwd: "/repo",
      logger: createMockLogger(),
    };

    const result = await branchExists("nonexistent", options);

    expect(result).toBe(false);
  });
});

describe("ensureBranch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates new branch when doesn't exist", async () => {
    mockSpawnSequence([
      { stdout: "", exitCode: 1 },
      { stdout: "", exitCode: 0 },
      { stdout: "", exitCode: 0 },
    ]);
    const logger = createMockLogger();
    const options: GitOptions = { cwd: "/repo", logger };

    const result = await ensureBranch("main", "wreckit/", "item-1", options);

    expect(result.branchName).toBe("wreckit/item-1");
    expect(result.created).toBe(true);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("Creating branch")
    );
  });

  it("switches to existing branch", async () => {
    mockSpawnSequence([
      { stdout: "", exitCode: 0 },
      { stdout: "", exitCode: 0 },
    ]);
    const logger = createMockLogger();
    const options: GitOptions = { cwd: "/repo", logger };

    const result = await ensureBranch("main", "wreckit/", "item-1", options);

    expect(result.branchName).toBe("wreckit/item-1");
    expect(result.created).toBe(false);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("exists, switching")
    );
  });

  it("handles dryRun", async () => {
    const logger = createMockLogger();
    const options: GitOptions = { cwd: "/repo", logger, dryRun: true };

    const result = await ensureBranch("main", "wreckit/", "item-1", options);

    expect(result.branchName).toBe("wreckit/item-1");
    expect(result.created).toBe(true);
    expect(mockedSpawn).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("[dry-run]")
    );
  });
});

describe("hasUncommittedChanges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when changes exist", async () => {
    mockSpawnOnce(" M file.ts\n", 0);
    const options: GitOptions = { cwd: "/repo", logger: createMockLogger() };

    const result = await hasUncommittedChanges(options);

    expect(result).toBe(true);
  });

  it("returns false when no changes", async () => {
    mockSpawnOnce("", 0);
    const options: GitOptions = { cwd: "/repo", logger: createMockLogger() };

    const result = await hasUncommittedChanges(options);

    expect(result).toBe(false);
  });
});

describe("commitAll", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds and commits changes", async () => {
    mockSpawnSequence([
      { stdout: "", exitCode: 0 },
      { stdout: "", exitCode: 0 },
    ]);
    const options: GitOptions = { cwd: "/repo", logger: createMockLogger() };

    await commitAll("Test commit message", options);

    expect(mockedSpawn).toHaveBeenCalledWith(
      "git",
      ["add", "-A"],
      expect.any(Object)
    );
    expect(mockedSpawn).toHaveBeenCalledWith(
      "git",
      ["commit", "-m", "Test commit message"],
      expect.any(Object)
    );
  });

  it("handles dryRun", async () => {
    const logger = createMockLogger();
    const options: GitOptions = { cwd: "/repo", logger, dryRun: true };

    await commitAll("Test commit", options);

    expect(mockedSpawn).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("[dry-run]")
    );
  });
});

describe("pushBranch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("pushes branch to origin", async () => {
    mockSpawnOnce("", 0);
    const options: GitOptions = { cwd: "/repo", logger: createMockLogger() };

    await pushBranch("feature-branch", options);

    expect(mockedSpawn).toHaveBeenCalledWith(
      "git",
      ["push", "-u", "origin", "feature-branch"],
      expect.any(Object)
    );
  });

  it("handles dryRun", async () => {
    const logger = createMockLogger();
    const options: GitOptions = { cwd: "/repo", logger, dryRun: true };

    await pushBranch("feature-branch", options);

    expect(mockedSpawn).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("[dry-run]")
    );
  });
});

describe("createOrUpdatePr", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates new PR when none exists", async () => {
    mockSpawnSequence([
      { stdout: "", exitCode: 1 },
      { stdout: "https://github.com/org/repo/pull/42", exitCode: 0 },
      { stdout: JSON.stringify({ url: "https://github.com/org/repo/pull/42", number: 42 }), exitCode: 0 },
    ]);
    const logger = createMockLogger();
    const options: GitOptions = { cwd: "/repo", logger };

    const result = await createOrUpdatePr(
      "main",
      "feature-branch",
      "My PR Title",
      "PR body",
      options
    );

    expect(result.url).toBe("https://github.com/org/repo/pull/42");
    expect(result.number).toBe(42);
    expect(result.created).toBe(true);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("Creating new PR")
    );
  });

  it("updates existing PR", async () => {
    mockSpawnSequence([
      { stdout: JSON.stringify({ url: "https://github.com/org/repo/pull/99", number: 99 }), exitCode: 0 },
      { stdout: "", exitCode: 0 },
    ]);
    const logger = createMockLogger();
    const options: GitOptions = { cwd: "/repo", logger };

    const result = await createOrUpdatePr(
      "main",
      "feature-branch",
      "Updated Title",
      "Updated body",
      options
    );

    expect(result.url).toBe("https://github.com/org/repo/pull/99");
    expect(result.number).toBe(99);
    expect(result.created).toBe(false);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("Updating existing PR")
    );
  });

  it("handles dryRun", async () => {
    const logger = createMockLogger();
    const options: GitOptions = { cwd: "/repo", logger, dryRun: true };

    const result = await createOrUpdatePr(
      "main",
      "feature-branch",
      "Title",
      "Body",
      options
    );

    expect(result.created).toBe(true);
    expect(result.number).toBe(0);
    expect(mockedSpawn).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("[dry-run]")
    );
  });
});

describe("isPrMerged", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true for merged PR", async () => {
    mockSpawnOnce(JSON.stringify({ state: "MERGED" }), 0);
    const options: GitOptions = { cwd: "/repo", logger: createMockLogger() };

    const result = await isPrMerged(42, options);

    expect(result).toBe(true);
    expect(mockedSpawn).toHaveBeenCalledWith(
      "gh",
      ["pr", "view", "42", "--json", "state"],
      expect.any(Object)
    );
  });

  it("returns false for open PR", async () => {
    mockSpawnOnce(JSON.stringify({ state: "OPEN" }), 0);
    const options: GitOptions = { cwd: "/repo", logger: createMockLogger() };

    const result = await isPrMerged(42, options);

    expect(result).toBe(false);
  });

  it("returns false when PR not found", async () => {
    mockSpawnOnce("", 1);
    const options: GitOptions = { cwd: "/repo", logger: createMockLogger() };

    const result = await isPrMerged(999, options);

    expect(result).toBe(false);
  });
});

describe("getPrByBranch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns PR info when exists", async () => {
    mockSpawnOnce(
      JSON.stringify({ url: "https://github.com/org/repo/pull/50", number: 50 }),
      0
    );
    const options: GitOptions = { cwd: "/repo", logger: createMockLogger() };

    const result = await getPrByBranch("feature-branch", options);

    expect(result).toEqual({
      url: "https://github.com/org/repo/pull/50",
      number: 50,
    });
  });

  it("returns null when no PR exists", async () => {
    mockSpawnOnce("", 1);
    const options: GitOptions = { cwd: "/repo", logger: createMockLogger() };

    const result = await getPrByBranch("no-pr-branch", options);

    expect(result).toBeNull();
  });
});

describe("runGitCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("executes git commands with args", async () => {
    mockSpawnOnce("output\n", 0);
    const options: GitOptions = { cwd: "/repo", logger: createMockLogger() };

    const result = await runGitCommand(["status"], options);

    expect(result.stdout).toBe("output");
    expect(result.exitCode).toBe(0);
    expect(mockedSpawn).toHaveBeenCalledWith(
      "git",
      ["status"],
      expect.objectContaining({ cwd: "/repo" })
    );
  });

  it("handles dryRun", async () => {
    const logger = createMockLogger();
    const options: GitOptions = { cwd: "/repo", logger, dryRun: true };

    const result = await runGitCommand(["status"], options);

    expect(result.stdout).toBe("");
    expect(result.exitCode).toBe(0);
    expect(mockedSpawn).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("[dry-run]")
    );
  });
});

describe("runGhCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("executes gh commands with args", async () => {
    mockSpawnOnce("pr output\n", 0);
    const options: GitOptions = { cwd: "/repo", logger: createMockLogger() };

    const result = await runGhCommand(["pr", "list"], options);

    expect(result.stdout).toBe("pr output");
    expect(result.exitCode).toBe(0);
    expect(mockedSpawn).toHaveBeenCalledWith(
      "gh",
      ["pr", "list"],
      expect.objectContaining({ cwd: "/repo" })
    );
  });

  it("handles dryRun", async () => {
    const logger = createMockLogger();
    const options: GitOptions = { cwd: "/repo", logger, dryRun: true };

    const result = await runGhCommand(["pr", "list"], options);

    expect(result.stdout).toBe("");
    expect(result.exitCode).toBe(0);
    expect(mockedSpawn).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("[dry-run]")
    );
  });
});
