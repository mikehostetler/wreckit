import {
  describe,
  expect,
  it,
  beforeEach,
  afterEach,
  vi,
  mock,
} from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { rollbackCommand } from "../../commands/rollback";
import type { Logger } from "../../logging";
import type { Item } from "../../schemas";

const mockRunGitCommand = vi.fn();

mock.module("../../git", () => ({
  runGitCommand: mockRunGitCommand,
}));

function createMockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    json: vi.fn(),
  } satisfies Logger;
}

async function createItem(
  root: string,
  id: string,
  overrides: Partial<Item> = {},
): Promise<Item> {
  const itemDir = path.join(root, ".wreckit", "items", id);
  await fs.mkdir(itemDir, { recursive: true });

  const item: Item = {
    schema_version: 1,
    id,
    title: id.replace(/^\d+-/, "").replace(/-/g, " "),
    state: "done",
    overview: "Test overview",
    branch: `wreckit/${id}`,
    pr_url: null,
    pr_number: null,
    last_error: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    rollback_sha: "abc123def456",
    completed_at: new Date().toISOString(),
    ...overrides,
  };

  await fs.writeFile(
    path.join(itemDir, "item.json"),
    JSON.stringify(item, null, 2),
  );
  return item;
}

async function createConfig(root: string): Promise<void> {
  const configDir = path.join(root, ".wreckit");
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(
    path.join(configDir, "config.json"),
    JSON.stringify(
      {
        schema_version: 1,
        base_branch: "main",
        branch_prefix: "wreckit/",
        merge_mode: "direct",
        agent: {
          mode: "process",
          command: "claude",
          args: ["--dangerously-skip-permissions", "--print"],
          completion_signal: "<promise>COMPLETE</promise>",
        },
        max_iterations: 100,
        timeout_seconds: 3600,
        pr_checks: {
          commands: [],
          secret_scan: false,
          require_all_stories_done: true,
          allow_unsafe_direct_merge: true,
          allowed_remote_patterns: [],
        },
      },
      null,
      2,
    ),
  );
}

async function readItemState(root: string, id: string): Promise<Item> {
  const itemPath = path.join(root, ".wreckit", "items", id, "item.json");
  const content = await fs.readFile(itemPath, "utf-8");
  return JSON.parse(content);
}

describe("rollbackCommand", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "wreckit-rollback-test-"),
    );
    await fs.mkdir(path.join(tempDir, ".git"), { recursive: true });
    await createConfig(tempDir);
    originalCwd = process.cwd();
    process.chdir(tempDir);
    mockRunGitCommand.mockReset();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("returns error when no rollback_sha exists", async () => {
    await createItem(tempDir, "001-test", { rollback_sha: null });

    const logger = createMockLogger();
    const result = await rollbackCommand("001-test", { cwd: tempDir }, logger);

    expect(result.success).toBe(false);
    expect(result.error).toContain("No rollback anchor found");
  });

  it("returns error when item is not in 'done' state without --force", async () => {
    await createItem(tempDir, "001-test", { state: "implementing" });

    const logger = createMockLogger();
    const result = await rollbackCommand("001-test", { cwd: tempDir }, logger);

    expect(result.success).toBe(false);
    expect(result.error).toContain("expected 'done'");
  });

  it("allows rollback with --force when item is not in 'done' state", async () => {
    await createItem(tempDir, "001-test", { state: "implementing" });

    mockRunGitCommand.mockResolvedValue({ stdout: "", exitCode: 0 });

    const logger = createMockLogger();
    const result = await rollbackCommand(
      "001-test",
      { cwd: tempDir, force: true },
      logger,
    );

    expect(result.success).toBe(true);
  });

  it("performs dry-run without making changes", async () => {
    await createItem(tempDir, "001-test");

    const logger = createMockLogger();
    const result = await rollbackCommand(
      "001-test",
      { cwd: tempDir, dryRun: true },
      logger,
    );

    expect(result.success).toBe(true);
    expect(result.rollbackSha).toBe("abc123def456");
    expect(mockRunGitCommand).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("[dry-run]"),
    );

    const item = await readItemState(tempDir, "001-test");
    expect(item.state).toBe("done");
  });

  it("executes git commands during rollback", async () => {
    await createItem(tempDir, "001-test");

    mockRunGitCommand.mockResolvedValue({ stdout: "", exitCode: 0 });

    const logger = createMockLogger();
    const result = await rollbackCommand("001-test", { cwd: tempDir }, logger);

    expect(result.success).toBe(true);
    expect(mockRunGitCommand).toHaveBeenCalledWith(
      ["checkout", "main"],
      expect.any(Object),
    );
    expect(mockRunGitCommand).toHaveBeenCalledWith(
      ["reset", "--hard", "abc123def456"],
      expect.any(Object),
    );
    expect(mockRunGitCommand).toHaveBeenCalledWith(
      ["push", "--force", "origin", "main"],
      expect.any(Object),
    );
  });

  it("updates item state after successful rollback", async () => {
    await createItem(tempDir, "001-test");

    mockRunGitCommand.mockResolvedValue({ stdout: "", exitCode: 0 });

    const logger = createMockLogger();
    await rollbackCommand("001-test", { cwd: tempDir }, logger);

    const item = await readItemState(tempDir, "001-test");
    expect(item.state).toBe("implementing");
    expect(item.rollback_sha).toBeNull();
    expect(item.completed_at).toBeNull();
  });

  it("returns error if checkout fails", async () => {
    await createItem(tempDir, "001-test");

    mockRunGitCommand.mockResolvedValue({
      stdout: "checkout error",
      exitCode: 1,
    });

    const logger = createMockLogger();
    const result = await rollbackCommand("001-test", { cwd: tempDir }, logger);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Failed to checkout");
  });

  it("returns error if reset fails", async () => {
    await createItem(tempDir, "001-test");

    mockRunGitCommand
      .mockResolvedValueOnce({ stdout: "", exitCode: 0 })
      .mockResolvedValueOnce({ stdout: "reset error", exitCode: 1 });

    const logger = createMockLogger();
    const result = await rollbackCommand("001-test", { cwd: tempDir }, logger);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Failed to reset");
  });

  it("returns error if force push fails", async () => {
    await createItem(tempDir, "001-test");

    mockRunGitCommand
      .mockResolvedValueOnce({ stdout: "", exitCode: 0 })
      .mockResolvedValueOnce({ stdout: "", exitCode: 0 })
      .mockResolvedValueOnce({ stdout: "push rejected", exitCode: 1 });

    const logger = createMockLogger();
    const result = await rollbackCommand("001-test", { cwd: tempDir }, logger);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Failed to force push");
  });
});
