import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { Item, ItemState } from "../../schemas";
import type { Logger } from "../../logging";

vi.mock("../../commands/run", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../commands/run")>();
  return {
    ...actual,
    runCommand: vi.fn(),
  };
});

import { runCommand } from "../../commands/run";
import {
  orchestrateAll,
  orchestrateNext,
  getNextIncompleteItem,
} from "../../commands/orchestrator";

const mockedRunCommand = vi.mocked(runCommand);

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
    id: "features/001-test-feature",
    title: "Test Feature",
    section: "features",
    state: "raw",
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
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-orchestrator-test-"));
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
    const [section, slug] = item.id.split("/");
    const itemDir = path.join(tempDir, ".wreckit", section, slug);
    await fs.mkdir(itemDir, { recursive: true });
    await fs.writeFile(
      path.join(itemDir, "item.json"),
      JSON.stringify(item, null, 2),
      "utf-8"
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
      await setupItem(createTestItem({ id: "features/001-done", state: "done" }));
      await setupItem(createTestItem({ id: "features/002-done", state: "done" }));

      const result = await orchestrateAll({}, mockLogger);

      expect(result.skipped).toEqual(["features/001-done", "features/002-done"]);
      expect(result.completed).toEqual([]);
      expect(result.failed).toEqual([]);
      expect(mockedRunCommand).not.toHaveBeenCalled();
    });

    it("runs items in section/number order", async () => {
      await setupItem(createTestItem({ id: "features/002-second", state: "raw" }));
      await setupItem(createTestItem({ id: "bugs/001-first", state: "raw" }));
      await setupItem(createTestItem({ id: "features/001-first", state: "raw" }));

      mockedRunCommand.mockResolvedValue(undefined);

      const result = await orchestrateAll({}, mockLogger);

      expect(mockedRunCommand).toHaveBeenCalledTimes(3);
      const callOrder = mockedRunCommand.mock.calls.map((call) => call[0]);
      expect(callOrder).toEqual([
        "bugs/001-first",
        "features/001-first",
        "features/002-second",
      ]);
      expect(result.completed).toEqual([
        "bugs/001-first",
        "features/001-first",
        "features/002-second",
      ]);
    });

    it("tracks completed and failed separately", async () => {
      await setupItem(createTestItem({ id: "features/001-success", state: "raw" }));
      await setupItem(createTestItem({ id: "features/002-fail", state: "raw" }));
      await setupItem(createTestItem({ id: "features/003-success", state: "raw" }));

      mockedRunCommand.mockImplementation(async (itemId) => {
        if (itemId === "features/002-fail") {
          throw new Error("Phase failed");
        }
      });

      const result = await orchestrateAll({}, mockLogger);

      expect(result.completed).toEqual(["features/001-success", "features/003-success"]);
      expect(result.failed).toEqual(["features/002-fail"]);
    });

    it("continues after failure (doesn't stop)", async () => {
      await setupItem(createTestItem({ id: "features/001-fail", state: "raw" }));
      await setupItem(createTestItem({ id: "features/002-success", state: "raw" }));

      mockedRunCommand.mockImplementation(async (itemId) => {
        if (itemId === "features/001-fail") {
          throw new Error("Phase failed");
        }
      });

      const result = await orchestrateAll({}, mockLogger);

      expect(mockedRunCommand).toHaveBeenCalledTimes(2);
      expect(result.completed).toEqual(["features/002-success"]);
      expect(result.failed).toEqual(["features/001-fail"]);
    });

    it("--dry-run doesn't run items", async () => {
      await setupItem(createTestItem({ id: "features/001-test", state: "raw" }));

      const result = await orchestrateAll({ dryRun: true }, mockLogger);

      expect(mockedRunCommand).not.toHaveBeenCalled();
      expect(result.remaining).toEqual(["features/001-test"]);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("DRY RUN SUMMARY")
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("Total items to process")
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("No changes made")
      );
    });
  });

  describe("orchestrateNext", () => {
    it("returns null if all items done", async () => {
      await setupItem(createTestItem({ id: "features/001-done", state: "done" }));

      const result = await orchestrateNext({}, mockLogger);

      expect(result.itemId).toBeNull();
      expect(result.success).toBe(true);
      expect(mockedRunCommand).not.toHaveBeenCalled();
    });

    it("returns first non-done item", async () => {
      await setupItem(createTestItem({ id: "features/001-done", state: "done" }));
      await setupItem(createTestItem({ id: "features/002-raw", state: "raw" }));
      await setupItem(createTestItem({ id: "features/003-raw", state: "raw" }));

      mockedRunCommand.mockResolvedValue(undefined);

      const result = await orchestrateNext({}, mockLogger);

      expect(result.itemId).toBe("features/002-raw");
      expect(result.success).toBe(true);
      expect(mockedRunCommand).toHaveBeenCalledTimes(1);
      expect(mockedRunCommand).toHaveBeenCalledWith(
        "features/002-raw",
        expect.objectContaining({ force: false, dryRun: false }),
        mockLogger
      );
    });

    it("runs only that one item", async () => {
      await setupItem(createTestItem({ id: "features/001-raw", state: "raw" }));
      await setupItem(createTestItem({ id: "features/002-raw", state: "raw" }));

      mockedRunCommand.mockResolvedValue(undefined);

      await orchestrateNext({}, mockLogger);

      expect(mockedRunCommand).toHaveBeenCalledTimes(1);
    });

    it("returns success/failure status", async () => {
      await setupItem(createTestItem({ id: "features/001-fail", state: "raw" }));

      mockedRunCommand.mockRejectedValue(new Error("Phase failed"));

      const result = await orchestrateNext({}, mockLogger);

      expect(result.itemId).toBe("features/001-fail");
      expect(result.success).toBe(false);
    });
  });

  describe("getNextIncompleteItem", () => {
    it("returns null for empty .wreckit", async () => {
      const result = await getNextIncompleteItem(tempDir);

      expect(result).toBeNull();
    });

    it("returns null if all 'done'", async () => {
      await setupItem(createTestItem({ id: "features/001-done", state: "done" }));
      await setupItem(createTestItem({ id: "features/002-done", state: "done" }));

      const result = await getNextIncompleteItem(tempDir);

      expect(result).toBeNull();
    });

    it("returns first non-done item (sorted)", async () => {
      await setupItem(createTestItem({ id: "features/002-second", state: "raw" }));
      await setupItem(createTestItem({ id: "features/001-first", state: "done" }));
      await setupItem(createTestItem({ id: "bugs/001-first", state: "planned" }));

      const result = await getNextIncompleteItem(tempDir);

      expect(result).toBe("bugs/001-first");
    });

    it("respects section ordering", async () => {
      await setupItem(createTestItem({ id: "zzz/001-last", state: "raw" }));
      await setupItem(createTestItem({ id: "aaa/001-first", state: "raw" }));

      const result = await getNextIncompleteItem(tempDir);

      expect(result).toBe("aaa/001-first");
    });
  });
});
