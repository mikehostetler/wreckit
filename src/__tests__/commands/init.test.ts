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
import {
  initCommand,
  NotGitRepoError,
  WreckitExistsError,
} from "../../commands/init";
import type { Logger } from "../../logging";

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

async function setupTempDir(): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-init-test-"));
}

async function setupTempGitRepo(): Promise<string> {
  const tempDir = await setupTempDir();
  await fs.mkdir(path.join(tempDir, ".git"), { recursive: true });
  return tempDir;
}

describe("initCommand", () => {
  let tempDir: string;
  let mockLogger: Logger & { messages: string[] };

  beforeEach(async () => {
    mockLogger = createMockLogger();
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("creates .wreckit directory", async () => {
    tempDir = await setupTempGitRepo();

    await initCommand({ cwd: tempDir }, mockLogger);

    const wreckitDir = path.join(tempDir, ".wreckit");
    const stat = await fs.stat(wreckitDir);
    expect(stat.isDirectory()).toBe(true);
  });

  it("creates config.json with defaults", async () => {
    tempDir = await setupTempGitRepo();

    await initCommand({ cwd: tempDir }, mockLogger);

    const configPath = path.join(tempDir, ".wreckit", "config.json");
    const content = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(content);

    expect(config.schema_version).toBe(1);
    expect(config.base_branch).toBe("main");
    expect(config.branch_prefix).toBe("wreckit/");
    expect(config.agent.kind).toBe("claude_sdk");
    if (config.agent.kind === "claude_sdk") {
      expect(config.agent.model).toBe("claude-sonnet-4-20250514");
    }
    expect(config.max_iterations).toBe(100);
    expect(config.timeout_seconds).toBe(3600);
  });

  it("creates prompts directory with templates", async () => {
    tempDir = await setupTempGitRepo();

    await initCommand({ cwd: tempDir }, mockLogger);

    const promptsDir = path.join(tempDir, ".wreckit", "prompts");
    const entries = await fs.readdir(promptsDir);

    expect(entries).toContain("research.md");
    expect(entries).toContain("plan.md");
    expect(entries).toContain("implement.md");
  });

  it("creates research.md prompt template", async () => {
    tempDir = await setupTempGitRepo();

    await initCommand({ cwd: tempDir }, mockLogger);

    const researchPath = path.join(
      tempDir,
      ".wreckit",
      "prompts",
      "research.md",
    );
    const content = await fs.readFile(researchPath, "utf-8");

    expect(content).toContain("# Research Phase");
    expect(content).toContain("{{id}}");
    expect(content).toContain("{{completion_signal}}");
  });

  it("creates plan.md prompt template", async () => {
    tempDir = await setupTempGitRepo();

    await initCommand({ cwd: tempDir }, mockLogger);

    const planPath = path.join(tempDir, ".wreckit", "prompts", "plan.md");
    const content = await fs.readFile(planPath, "utf-8");

    expect(content).toContain("# Planning Phase");
    expect(content).toContain("{{research}}");
    expect(content).toContain("save_prd");
  });

  it("creates implement.md prompt template", async () => {
    tempDir = await setupTempGitRepo();

    await initCommand({ cwd: tempDir }, mockLogger);

    const implementPath = path.join(
      tempDir,
      ".wreckit",
      "prompts",
      "implement.md",
    );
    const content = await fs.readFile(implementPath, "utf-8");

    expect(content).toContain("# Implementation Phase");
    expect(content).toContain("{{prd}}");
    expect(content).toContain("{{progress}}");
  });

  it("fails if .wreckit exists (without --force)", async () => {
    tempDir = await setupTempGitRepo();
    await fs.mkdir(path.join(tempDir, ".wreckit"), { recursive: true });

    await expect(initCommand({ cwd: tempDir }, mockLogger)).rejects.toThrow(
      WreckitExistsError,
    );
    await expect(initCommand({ cwd: tempDir }, mockLogger)).rejects.toThrow(
      ".wreckit/ already exists",
    );
  });

  it("overwrites with --force", async () => {
    tempDir = await setupTempGitRepo();
    const wreckitDir = path.join(tempDir, ".wreckit");
    await fs.mkdir(wreckitDir, { recursive: true });
    await fs.writeFile(
      path.join(wreckitDir, "old-file.txt"),
      "old content",
      "utf-8",
    );

    await initCommand({ force: true, cwd: tempDir }, mockLogger);

    const entries = await fs.readdir(wreckitDir);
    expect(entries).not.toContain("old-file.txt");
    expect(entries).toContain("config.json");
    expect(entries).toContain("prompts");
    expect(mockLogger.messages.some((m) => m.includes("Overwriting"))).toBe(
      true,
    );
  });

  it("fails if not in git repo", async () => {
    tempDir = await setupTempDir();

    await expect(initCommand({ cwd: tempDir }, mockLogger)).rejects.toThrow(
      NotGitRepoError,
    );
    await expect(initCommand({ cwd: tempDir }, mockLogger)).rejects.toThrow(
      "Not a git repository",
    );
  });

  it("prints success messages", async () => {
    tempDir = await setupTempGitRepo();

    const consoleSpy = spyOn(console, "log");
    await initCommand({ cwd: tempDir }, mockLogger);

    const calls = consoleSpy.mock.calls.map((c) => String(c[0]));
    expect(
      calls.some((c) => c.includes("Initialized .wreckit/ directory")),
    ).toBe(true);
    expect(calls.some((c) => c.includes("Created config.json"))).toBe(true);
    expect(calls.some((c) => c.includes("Created prompts/research.md"))).toBe(
      true,
    );
    expect(calls.some((c) => c.includes("Created prompts/plan.md"))).toBe(true);
    expect(calls.some((c) => c.includes("Created prompts/implement.md"))).toBe(
      true,
    );
    consoleSpy.mockRestore();
  });
});
