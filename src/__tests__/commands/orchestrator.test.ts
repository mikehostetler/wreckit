import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  mock,
} from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { Item } from "../../schemas";
import type { Logger } from "../../logging";

const mockedRunCommand = vi.fn();

mock.module("../../commands/run", () => ({
  runCommand: mockedRunCommand,
}));

const { orchestrateAll, orchestrateNext, getNextIncompleteItem } = await import(
  "../../commands/orchestrator"
);

function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    json: vi.fn(),
  };
}

function createTestItem(overrides: Partial<Item> = {}): Item {
  return {
    schema_version: 1,
    id: "001-test-feature",
    title: "Test Feature",
    state: "idea",
    overview: "A test feature",
    branch: null,
    pr_url: null,
    pr_number: null,
    last_error: null,
    created_at: "2025-01-12T00:00:00Z",
    updated_at: "2025-01-12T00:00:00Z",
    ...overrides,
  };
}

describe("orchestrator", () => {
  let tempDir: string;
  let mockLogger: Logger;
  let originalCwd: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "wreckit-orchestrator-test-"),
    );
    await fs.mkdir(path.join(tempDir, ".wreckit"), { recursive: true });
    await fs.mkdir(path.join(tempDir, ".git"), { recursive: true });
    mockLogger = createMockLogger();
    originalCwd = process.cwd();
    process.chdir(tempDir);
    vi.clearAllMocks();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function setupItem(item: Item): Promise<string> {
    const itemDir = path.join(tempDir, ".wreckit", "items", item.id);
    await fs.mkdir(itemDir, { recursive: true });
    await fs.writeFile(
      path.join(itemDir, "item.json"),
      JSON.stringify(item, null, 2),
      "utf-8",
    );
    return itemDir;
  }

  describe("orchestrateAll", () => {
    it("empty items returns empty result", async () => {
      const result = await orchestrateAll({}, mockLogger);

      expect(result.completed).toEqual([]);
      expect(result.failed).toEqual([]);
      expect(result.skipped).toEqual([]);
      expect(result.remaining).toEqual([]);
    });

    it("all items 'done' returns all in skipped", async () => {
      await setupItem(createTestItem({ id: "001-done", state: "done" }));
      await setupItem(createTestItem({ id: "002-done", state: "done" }));

      const result = await orchestrateAll({}, mockLogger);

      expect(result.skipped).toEqual(["001-done", "002-done"]);
      expect(result.completed).toEqual([]);
      expect(result.failed).toEqual([]);
      expect(mockedRunCommand).not.toHaveBeenCalled();
    });

    it("runs items in number order", async () => {
      await setupItem(createTestItem({ id: "003-third", state: "idea" }));
      await setupItem(createTestItem({ id: "001-first", state: "idea" }));
      await setupItem(createTestItem({ id: "002-second", state: "idea" }));

      mockedRunCommand.mockResolvedValue(undefined);

      const result = await orchestrateAll({}, mockLogger);

      expect(mockedRunCommand).toHaveBeenCalledTimes(3);
      const callOrder = mockedRunCommand.mock.calls.map(
        (call: any[]) => call[0],
      );
      expect(callOrder).toEqual(["001-first", "002-second", "003-third"]);
      expect(result.completed).toEqual([
        "001-first",
        "002-second",
        "003-third",
      ]);
    });

    it("tracks completed and failed separately", async () => {
      await setupItem(createTestItem({ id: "001-success", state: "idea" }));
      await setupItem(createTestItem({ id: "002-fail", state: "idea" }));
      await setupItem(createTestItem({ id: "003-success", state: "idea" }));

      mockedRunCommand.mockImplementation(async (itemId: string) => {
        if (itemId === "002-fail") {
          throw new Error("Phase failed");
        }
      });

      const result = await orchestrateAll({}, mockLogger);

      expect(result.completed).toEqual(["001-success", "003-success"]);
      expect(result.failed).toEqual(["002-fail"]);
    });

    it("continues after failure (doesn't stop)", async () => {
      await setupItem(createTestItem({ id: "001-fail", state: "idea" }));
      await setupItem(createTestItem({ id: "002-success", state: "idea" }));

      mockedRunCommand.mockImplementation(async (itemId: string) => {
        if (itemId === "001-fail") {
          throw new Error("Phase failed");
        }
      });

      const result = await orchestrateAll({}, mockLogger);

      expect(mockedRunCommand).toHaveBeenCalledTimes(2);
      expect(result.completed).toEqual(["002-success"]);
      expect(result.failed).toEqual(["001-fail"]);
    });

    it("--dry-run doesn't run items", async () => {
      await setupItem(createTestItem({ id: "001-test", state: "idea" }));

      const result = await orchestrateAll({ dryRun: true }, mockLogger);

      expect(mockedRunCommand).not.toHaveBeenCalled();
      expect(result.remaining).toEqual(["001-test"]);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("DRY RUN SUMMARY"),
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("Total items to process"),
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("No changes made"),
      );
    });
  });

  describe("orchestrateNext", () => {
    it("returns null if all items done", async () => {
      await setupItem(createTestItem({ id: "001-done", state: "done" }));

      const result = await orchestrateNext({}, mockLogger);

      expect(result.itemId).toBeNull();
      expect(result.success).toBe(true);
      expect(mockedRunCommand).not.toHaveBeenCalled();
    });

    it("returns first non-done item", async () => {
      await setupItem(createTestItem({ id: "001-done", state: "done" }));
      await setupItem(createTestItem({ id: "002-raw", state: "idea" }));
      await setupItem(createTestItem({ id: "003-raw", state: "idea" }));

      mockedRunCommand.mockResolvedValue(undefined);

      const result = await orchestrateNext({}, mockLogger);

      expect(result.itemId).toBe("002-raw");
      expect(result.success).toBe(true);
      expect(mockedRunCommand).toHaveBeenCalledTimes(1);
      expect(mockedRunCommand).toHaveBeenCalledWith(
        "002-raw",
        expect.objectContaining({ force: false, dryRun: false }),
        mockLogger,
      );
    });

    it("runs only that one item", async () => {
      await setupItem(createTestItem({ id: "001-raw", state: "idea" }));
      await setupItem(createTestItem({ id: "002-raw", state: "idea" }));

      mockedRunCommand.mockResolvedValue(undefined);

      await orchestrateNext({}, mockLogger);

      expect(mockedRunCommand).toHaveBeenCalledTimes(1);
    });

    it("returns success/failure status", async () => {
      await setupItem(createTestItem({ id: "001-fail", state: "idea" }));

      mockedRunCommand.mockRejectedValue(new Error("Phase failed"));

      const result = await orchestrateNext({}, mockLogger);

      expect(result.itemId).toBe("001-fail");
      expect(result.success).toBe(false);
    });
  });

  describe("getNextIncompleteItem", () => {
    it("returns null for empty .wreckit", async () => {
      const result = await getNextIncompleteItem(tempDir);

      expect(result).toBeNull();
    });

    it("returns null if all 'done'", async () => {
      await setupItem(createTestItem({ id: "001-done", state: "done" }));
      await setupItem(createTestItem({ id: "002-done", state: "done" }));

      const result = await getNextIncompleteItem(tempDir);

      expect(result).toBeNull();
    });

    it("returns first non-done item (sorted)", async () => {
      await setupItem(createTestItem({ id: "002-second", state: "idea" }));
      await setupItem(createTestItem({ id: "001-first", state: "done" }));
      await setupItem(createTestItem({ id: "001-first", state: "planned" }));

      const result = await getNextIncompleteItem(tempDir);

      expect(result).toBe("001-first");
    });

    it("respects numeric ordering", async () => {
      await setupItem(createTestItem({ id: "002-second", state: "idea" }));
      await setupItem(createTestItem({ id: "001-first", state: "idea" }));

      const result = await getNextIncompleteItem(tempDir);

      expect(result).toBe("001-first");
    });
  });

  describe("batch progress persistence", () => {
    it("creates batch-progress.json on start", async () => {
      await setupItem(createTestItem({ id: "001-test", state: "idea" }));
      mockedRunCommand.mockResolvedValue(undefined);

      await orchestrateAll({}, mockLogger);

      // Progress file should be deleted on clean completion
      const progressPath = path.join(
        tempDir,
        ".wreckit",
        "batch-progress.json",
      );
      const exists = await fs
        .access(progressPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(false);
    });

    it("preserves progress file when items remain (dependency blocked)", async () => {
      await setupItem(
        createTestItem({
          id: "001-dep",
          state: "idea",
        }),
      );
      await setupItem(
        createTestItem({
          id: "002-blocked",
          state: "idea",
          depends_on: ["999-nonexistent"],
        }),
      );

      mockedRunCommand.mockResolvedValue(undefined);

      const result = await orchestrateAll({}, mockLogger);

      expect(result.remaining).toContain("002-blocked");

      const progressPath = path.join(
        tempDir,
        ".wreckit",
        "batch-progress.json",
      );
      const exists = await fs
        .access(progressPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });

    it("resumes from existing progress", async () => {
      await setupItem(createTestItem({ id: "001-done", state: "idea" }));
      await setupItem(createTestItem({ id: "002-pending", state: "idea" }));

      const progressPath = path.join(
        tempDir,
        ".wreckit",
        "batch-progress.json",
      );
      const existingProgress = {
        schema_version: 1,
        session_id: "test123",
        pid: process.pid,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        parallel: 1,
        queued_items: ["001-done", "002-pending"],
        current_item: null,
        completed: ["001-done"],
        failed: [],
        skipped: [],
        healing_attempts: 0,
        last_healing_at: null,
      };
      await fs.writeFile(
        progressPath,
        JSON.stringify(existingProgress, null, 2),
      );

      mockedRunCommand.mockResolvedValue(undefined);

      const result = await orchestrateAll({}, mockLogger);

      expect(mockedRunCommand).toHaveBeenCalledTimes(1);
      expect(mockedRunCommand).toHaveBeenCalledWith(
        "002-pending",
        expect.anything(),
        mockLogger,
      );
      expect(result.completed).toContain("001-done");
      expect(result.completed).toContain("002-pending");
    });

    it("--no-resume ignores existing progress", async () => {
      await setupItem(createTestItem({ id: "001-test", state: "idea" }));
      await setupItem(createTestItem({ id: "002-test", state: "idea" }));

      const progressPath = path.join(
        tempDir,
        ".wreckit",
        "batch-progress.json",
      );
      const existingProgress = {
        schema_version: 1,
        session_id: "test123",
        pid: process.pid,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        parallel: 1,
        queued_items: ["001-test", "002-test"],
        current_item: null,
        completed: ["001-test"],
        failed: [],
        skipped: [],
        healing_attempts: 0,
        last_healing_at: null,
      };
      await fs.writeFile(
        progressPath,
        JSON.stringify(existingProgress, null, 2),
      );

      mockedRunCommand.mockResolvedValue(undefined);

      const result = await orchestrateAll({ noResume: true }, mockLogger);

      expect(mockedRunCommand).toHaveBeenCalledTimes(2);
    });

    it("--retry-failed re-queues failed items", async () => {
      await setupItem(createTestItem({ id: "001-failed", state: "idea" }));
      await setupItem(createTestItem({ id: "002-pending", state: "idea" }));

      const progressPath = path.join(
        tempDir,
        ".wreckit",
        "batch-progress.json",
      );
      const existingProgress = {
        schema_version: 1,
        session_id: "test123",
        pid: process.pid,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        parallel: 1,
        queued_items: ["001-failed", "002-pending"],
        current_item: null,
        completed: [],
        failed: ["001-failed"],
        skipped: [],
        healing_attempts: 0,
        last_healing_at: null,
      };
      await fs.writeFile(
        progressPath,
        JSON.stringify(existingProgress, null, 2),
      );

      mockedRunCommand.mockResolvedValue(undefined);

      const result = await orchestrateAll({ retryFailed: true }, mockLogger);

      // Should run both items (failed item re-queued)
      expect(mockedRunCommand).toHaveBeenCalledTimes(2);
      expect(result.completed).toContain("001-failed");
      expect(result.completed).toContain("002-pending");
    });

    it("ignores stale progress file (old PID)", async () => {
      await setupItem(createTestItem({ id: "001-test", state: "idea" }));

      const progressPath = path.join(
        tempDir,
        ".wreckit",
        "batch-progress.json",
      );
      const existingProgress = {
        schema_version: 1,
        session_id: "stale",
        pid: 99999999, // Non-existent PID
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        parallel: 1,
        queued_items: ["001-test"],
        current_item: null,
        completed: [],
        failed: [],
        skipped: [],
        healing_attempts: 0,
        last_healing_at: null,
      };
      await fs.writeFile(
        progressPath,
        JSON.stringify(existingProgress, null, 2),
      );

      mockedRunCommand.mockResolvedValue(undefined);

      const result = await orchestrateAll({}, mockLogger);

      expect(mockedRunCommand).toHaveBeenCalledTimes(1);
      expect(result.completed).toContain("001-test");
    });

    it("ignores expired progress file (> 24 hours)", async () => {
      await setupItem(createTestItem({ id: "001-test", state: "idea" }));

      const progressPath = path.join(
        tempDir,
        ".wreckit",
        "batch-progress.json",
      );
      const expiredTime = new Date(
        Date.now() - 25 * 60 * 60 * 1000,
      ).toISOString();
      const existingProgress = {
        schema_version: 1,
        session_id: "expired",
        pid: process.pid,
        started_at: expiredTime,
        updated_at: expiredTime,
        parallel: 1,
        queued_items: ["001-test"],
        current_item: null,
        completed: [],
        failed: [],
        skipped: [],
        healing_attempts: 0,
        last_healing_at: null,
      };
      await fs.writeFile(
        progressPath,
        JSON.stringify(existingProgress, null, 2),
      );

      mockedRunCommand.mockResolvedValue(undefined);

      const result = await orchestrateAll({}, mockLogger);

      expect(mockedRunCommand).toHaveBeenCalledTimes(1);
      expect(result.completed).toContain("001-test");
    });

    it("dry-run does not create progress file", async () => {
      await setupItem(createTestItem({ id: "001-test", state: "idea" }));

      const progressPath = path.join(
        tempDir,
        ".wreckit",
        "batch-progress.json",
      );

      const result = await orchestrateAll({ dryRun: true }, mockLogger);

      expect(mockedRunCommand).not.toHaveBeenCalled();

      const exists = await fs
        .access(progressPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(false);
    });
  });
});
