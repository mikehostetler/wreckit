import {
  describe,
  expect,
  it,
  beforeEach,
  afterEach,
  mock,
  spyOn,
  vi,
} from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { Logger } from "../../logging";
import { FileNotFoundError } from "../../errors";
import type { ParsedIdea } from "../../domain/ideas";
import * as gitModule from "../../git";

const mockedParseIdeasWithAgent =
  vi.fn<(text: string, root: string) => Promise<ParsedIdea[]>>();
const mockedRunIdeaInterview = vi.fn<(root: string) => Promise<ParsedIdea[]>>();
const mockedRunSimpleInterview = vi.fn<() => Promise<ParsedIdea[]>>();

mock.module("../../domain/ideas-agent", () => ({
  parseIdeasWithAgent: mockedParseIdeasWithAgent,
}));

mock.module("../../domain/ideas-interview", () => ({
  runIdeaInterview: mockedRunIdeaInterview,
  runSimpleInterview: mockedRunSimpleInterview,
}));

const { ideasCommand, readFile } = await import("../../commands/ideas");

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

async function setupTempRepo(): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-test-"));
  await fs.mkdir(path.join(tempDir, ".git"), { recursive: true });
  await fs.mkdir(path.join(tempDir, ".wreckit"), { recursive: true });
  return tempDir;
}

describe("ideasCommand", () => {
  let tempDir: string;
  let mockLogger: Logger & { messages: string[] };
  let hasUncommittedChangesSpy: ReturnType<typeof vi.spyOn>;
  let isGitRepoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tempDir = await setupTempRepo();
    mockLogger = createMockLogger();
    mockedParseIdeasWithAgent.mockReset();

    // Spy on git functions instead of mocking the entire module
    hasUncommittedChangesSpy = vi.spyOn(
      gitModule,
      "hasUncommittedChanges",
    ).mockResolvedValue(false);
    isGitRepoSpy = vi.spyOn(gitModule, "isGitRepo").mockResolvedValue(true);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    // Restore spied functions
    hasUncommittedChangesSpy.mockRestore();
    isGitRepoSpy.mockRestore();
    // Restore mocked modules to prevent pollution of other test files
    mock.restore();
  });

  it("creates items from file input", async () => {
    const ideasFile = path.join(tempDir, "ideas.md");
    await fs.writeFile(
      ideasFile,
      "# Add dark mode\nTheme support\n\n# Fix bug\nBroken login",
    );

    mockedParseIdeasWithAgent.mockResolvedValue([
      { title: "Add dark mode", description: "Theme support" },
      { title: "Fix bug", description: "Broken login" },
    ]);

    await ideasCommand({ file: ideasFile, cwd: tempDir }, mockLogger);

    const itemsDir = path.join(tempDir, ".wreckit", "items");
    const entries = await fs.readdir(itemsDir);

    expect(entries).toContain("001-add-dark-mode");
    expect(entries).toContain("002-fix-bug");
  });

  it("creates items with correct IDs", async () => {
    const ideasFile = path.join(tempDir, "ideas.md");
    await fs.writeFile(ideasFile, "# First feature\n\n# Second feature");

    mockedParseIdeasWithAgent.mockResolvedValue([
      { title: "First feature", description: "" },
      { title: "Second feature", description: "" },
    ]);

    await ideasCommand({ file: ideasFile, cwd: tempDir }, mockLogger);

    const itemsDir = path.join(tempDir, ".wreckit", "items");
    const entries = await fs.readdir(itemsDir);

    expect(entries).toContain("001-first-feature");
    expect(entries).toContain("002-second-feature");
  });

  it("prints created items", async () => {
    const ideasFile = path.join(tempDir, "ideas.md");
    await fs.writeFile(ideasFile, "# Add feature\n# Fix bug");

    mockedParseIdeasWithAgent.mockResolvedValue([
      { title: "Add feature", description: "" },
      { title: "Fix bug", description: "" },
    ]);

    const consoleSpy = spyOn(console, "log");
    await ideasCommand({ file: ideasFile, cwd: tempDir }, mockLogger);

    const calls = consoleSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.includes("Created 2 items:"))).toBe(true);
    expect(calls.some((c) => c.includes("001-add-feature"))).toBe(true);
    expect(calls.some((c) => c.includes("002-fix-bug"))).toBe(true);
    consoleSpy.mockRestore();
  });

  it("--dry-run doesn't create files", async () => {
    const ideasFile = path.join(tempDir, "ideas.md");
    await fs.writeFile(ideasFile, "# Add dark mode");

    mockedParseIdeasWithAgent.mockResolvedValue([
      { title: "Add dark mode", description: "" },
    ]);

    const consoleSpy = spyOn(console, "log");
    await ideasCommand(
      { file: ideasFile, dryRun: true, cwd: tempDir },
      mockLogger,
    );

    const itemsDir = path.join(tempDir, ".wreckit", "items");
    await expect(fs.access(itemsDir)).rejects.toThrow();

    const calls = consoleSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.includes("Would create 1 items:"))).toBe(true);
    expect(calls.some((c) => c.includes("XXX-add-dark-mode"))).toBe(true);
    consoleSpy.mockRestore();
  });

  it("skips existing items (idempotent)", async () => {
    const ideasFile = path.join(tempDir, "ideas.md");
    await fs.writeFile(ideasFile, "# Add dark mode");

    mockedParseIdeasWithAgent.mockResolvedValue([
      { title: "Add dark mode", description: "" },
    ]);

    await ideasCommand({ file: ideasFile, cwd: tempDir }, mockLogger);

    const consoleSpy = spyOn(console, "log");
    await ideasCommand({ file: ideasFile, cwd: tempDir }, mockLogger);

    const calls = consoleSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.includes("Skipped 1 existing items"))).toBe(
      true,
    );
    consoleSpy.mockRestore();
  });

  it("handles empty input gracefully", async () => {
    const ideasFile = path.join(tempDir, "ideas.md");
    await fs.writeFile(ideasFile, "");

    mockedParseIdeasWithAgent.mockResolvedValue([]);

    const consoleSpy = spyOn(console, "log");
    await ideasCommand({ file: ideasFile, cwd: tempDir }, mockLogger);

    const calls = consoleSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.includes("No items created"))).toBe(true);
    consoleSpy.mockRestore();
  });

  it("handles input with only whitespace", async () => {
    const ideasFile = path.join(tempDir, "ideas.md");
    await fs.writeFile(ideasFile, "   \n\n   \n");

    mockedParseIdeasWithAgent.mockResolvedValue([]);

    const consoleSpy = spyOn(console, "log");
    await ideasCommand({ file: ideasFile, cwd: tempDir }, mockLogger);

    const calls = consoleSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.includes("No items created"))).toBe(true);
    consoleSpy.mockRestore();
  });

  it("works with inputOverride parameter", async () => {
    mockedParseIdeasWithAgent.mockResolvedValue([
      { title: "Test feature", description: "" },
      { title: "Fix test bug", description: "" },
    ]);

    await ideasCommand(
      { cwd: tempDir },
      mockLogger,
      "# Test feature\n# Fix test bug",
    );

    const itemsDir = path.join(tempDir, ".wreckit", "items");
    const entries = await fs.readdir(itemsDir);

    expect(entries).toContain("001-test-feature");
    expect(entries).toContain("002-fix-test-bug");
  });
});

describe("readFile", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("reads file content", async () => {
    const filePath = path.join(tempDir, "test.txt");
    await fs.writeFile(filePath, "Hello, World!");

    const content = await readFile(filePath);

    expect(content).toBe("Hello, World!");
  });

  it("throws FileNotFoundError for missing file", async () => {
    const filePath = path.join(tempDir, "nonexistent.txt");

    await expect(readFile(filePath)).rejects.toThrow(FileNotFoundError);
  });

  it("throws FileNotFoundError with correct message", async () => {
    const filePath = path.join(tempDir, "nonexistent.txt");

    await expect(readFile(filePath)).rejects.toThrow(
      `File not found: ${filePath}`,
    );
  });
});

describe("ideasCommand - git warnings", () => {
  let tempDir: string;
  let mockLogger: Logger & { messages: string[] };
  let hasUncommittedChangesSpy: ReturnType<typeof vi.spyOn>;
  let isGitRepoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tempDir = await setupTempRepo();
    mockLogger = createMockLogger();
    mockedParseIdeasWithAgent.mockReset();

    // Spy on git functions instead of mocking the entire module
    hasUncommittedChangesSpy = vi.spyOn(
      gitModule,
      "hasUncommittedChanges",
    ).mockResolvedValue(false);
    isGitRepoSpy = vi.spyOn(gitModule, "isGitRepo").mockResolvedValue(true);

    mockedParseIdeasWithAgent.mockResolvedValue([
      { title: "Test idea", description: "" },
    ]);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    // Restore spied functions
    hasUncommittedChangesSpy.mockRestore();
    isGitRepoSpy.mockRestore();
    // Restore mocked modules to prevent pollution of other test files
    mock.restore();
  });

  it("warns when uncommitted changes exist", async () => {
    // Set up: uncommitted changes exist
    hasUncommittedChangesSpy.mockResolvedValue(true);

    const ideasFile = path.join(tempDir, "ideas.md");
    await fs.writeFile(ideasFile, "# Test idea");

    await ideasCommand({ file: ideasFile, cwd: tempDir }, mockLogger);

    // Should have warning message
    const warningMessages = mockLogger.messages.filter((m) =>
      m.startsWith("warn:"),
    );
    expect(warningMessages.length).toBeGreaterThan(0);
    expect(warningMessages.some((m) => m.includes("uncommitted changes"))).toBe(
      true,
    );
  });

  it("does not warn when repo is clean", async () => {
    // Set up: no uncommitted changes (default from beforeEach)
    hasUncommittedChangesSpy.mockResolvedValue(false);

    const ideasFile = path.join(tempDir, "ideas.md");
    await fs.writeFile(ideasFile, "# Test idea");

    await ideasCommand({ file: ideasFile, cwd: tempDir }, mockLogger);

    // Should not have warning message
    const warningMessages = mockLogger.messages.filter((m) =>
      m.startsWith("warn:"),
    );
    expect(warningMessages.some((m) => m.includes("uncommitted changes"))).toBe(
      false,
    );
  });

  it("does not warn in dry-run mode even with changes", async () => {
    // Set up: uncommitted changes exist
    hasUncommittedChangesSpy.mockResolvedValue(true);

    const ideasFile = path.join(tempDir, "ideas.md");
    await fs.writeFile(ideasFile, "# Test idea");

    await ideasCommand(
      { file: ideasFile, cwd: tempDir, dryRun: true },
      mockLogger,
    );

    // Should not have warning message in dry-run
    const warningMessages = mockLogger.messages.filter((m) =>
      m.startsWith("warn:"),
    );
    expect(warningMessages.some((m) => m.includes("uncommitted changes"))).toBe(
      false,
    );
  });

  it("does not warn outside git repo", async () => {
    // Set up: not in a git repo
    isGitRepoSpy.mockResolvedValue(false);

    const ideasFile = path.join(tempDir, "ideas.md");
    await fs.writeFile(ideasFile, "# Test idea");

    await ideasCommand({ file: ideasFile, cwd: tempDir }, mockLogger);

    // Should not have warning message (and should not error)
    const warningMessages = mockLogger.messages.filter((m) =>
      m.startsWith("warn:"),
    );
    expect(warningMessages.some((m) => m.includes("uncommitted changes"))).toBe(
      false,
    );
  });
});
