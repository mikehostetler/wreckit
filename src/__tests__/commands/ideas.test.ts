import { describe, expect, it, beforeEach, afterEach, mock, spyOn, vi } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { ideasCommand, readFile } from "../../commands/ideas";
import type { Logger } from "../../logging";
import { FileNotFoundError } from "../../errors";

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

  beforeEach(async () => {
    tempDir = await setupTempRepo();
    mockLogger = createMockLogger();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("creates items from file input", async () => {
    const ideasFile = path.join(tempDir, "ideas.md");
    await fs.writeFile(ideasFile, "# Add dark mode\nTheme support\n\n# Fix bug\nBroken login");

    await ideasCommand({ file: ideasFile, cwd: tempDir }, mockLogger);

    const featuresDir = path.join(tempDir, ".wreckit", "features");
    const bugsDir = path.join(tempDir, ".wreckit", "bugs");

    const featureEntries = await fs.readdir(featuresDir);
    const bugEntries = await fs.readdir(bugsDir);

    expect(featureEntries).toContain("001-add-dark-mode");
    expect(bugEntries).toContain("001-fix-bug");
  });

  it("creates items with correct IDs", async () => {
    const ideasFile = path.join(tempDir, "ideas.md");
    await fs.writeFile(ideasFile, "# First feature\n\n# Second feature");

    await ideasCommand({ file: ideasFile, cwd: tempDir }, mockLogger);

    const featuresDir = path.join(tempDir, ".wreckit", "features");
    const entries = await fs.readdir(featuresDir);

    expect(entries).toContain("001-first-feature");
    expect(entries).toContain("002-second-feature");
  });

  it("prints created items", async () => {
    const ideasFile = path.join(tempDir, "ideas.md");
    await fs.writeFile(ideasFile, "# Add feature\n# Fix bug");

    const consoleSpy = spyOn(console, "log");
    await ideasCommand({ file: ideasFile, cwd: tempDir }, mockLogger);

    const calls = consoleSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.includes("Created 2 items:"))).toBe(true);
    expect(calls.some((c) => c.includes("features/001-add-feature"))).toBe(true);
    expect(calls.some((c) => c.includes("bugs/001-fix-bug"))).toBe(true);
    consoleSpy.mockRestore();
  });

  it("--dry-run doesn't create files", async () => {
    const ideasFile = path.join(tempDir, "ideas.md");
    await fs.writeFile(ideasFile, "# Add dark mode");

    const consoleSpy = spyOn(console, "log");
    await ideasCommand({ file: ideasFile, dryRun: true, cwd: tempDir }, mockLogger);

    const featuresDir = path.join(tempDir, ".wreckit", "features");
    await expect(fs.access(featuresDir)).rejects.toThrow();

    const calls = consoleSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.includes("Would create 1 items:"))).toBe(true);
    expect(calls.some((c) => c.includes("features/XXX-add-dark-mode"))).toBe(true);
    consoleSpy.mockRestore();
  });

  it("skips existing items (idempotent)", async () => {
    const ideasFile = path.join(tempDir, "ideas.md");
    await fs.writeFile(ideasFile, "# Add dark mode");

    await ideasCommand({ file: ideasFile, cwd: tempDir }, mockLogger);

    const consoleSpy = spyOn(console, "log");
    await ideasCommand({ file: ideasFile, cwd: tempDir }, mockLogger);

    const calls = consoleSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.includes("Skipped 1 existing items"))).toBe(true);
    consoleSpy.mockRestore();
  });

  it("handles empty input gracefully", async () => {
    const ideasFile = path.join(tempDir, "ideas.md");
    await fs.writeFile(ideasFile, "");

    const consoleSpy = spyOn(console, "log");
    await ideasCommand({ file: ideasFile, cwd: tempDir }, mockLogger);

    const calls = consoleSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.includes("No items created"))).toBe(true);
    consoleSpy.mockRestore();
  });

  it("handles input with only whitespace", async () => {
    const ideasFile = path.join(tempDir, "ideas.md");
    await fs.writeFile(ideasFile, "   \n\n   \n");

    const consoleSpy = spyOn(console, "log");
    await ideasCommand({ file: ideasFile, cwd: tempDir }, mockLogger);

    const calls = consoleSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.includes("No items created"))).toBe(true);
    consoleSpy.mockRestore();
  });

  it("works with inputOverride parameter", async () => {
    await ideasCommand({ cwd: tempDir }, mockLogger, "# Test feature\n# Fix test bug");

    const featuresDir = path.join(tempDir, ".wreckit", "features");
    const bugsDir = path.join(tempDir, ".wreckit", "bugs");

    const featureEntries = await fs.readdir(featuresDir);
    const bugEntries = await fs.readdir(bugsDir);

    expect(featureEntries).toContain("001-test-feature");
    expect(bugEntries).toContain("001-fix-test-bug");
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

    await expect(readFile(filePath)).rejects.toThrow(`File not found: ${filePath}`);
  });
});
