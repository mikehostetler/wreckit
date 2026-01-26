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
import type { PhaseResult } from "../../workflow";

const mockedRunPhaseResearch = vi.fn();
const mockedRunPhasePlan = vi.fn();
const mockedRunPhaseImplement = vi.fn();
const mockedRunPhasePr = vi.fn();
const mockedRunPhaseComplete = vi.fn();

const originalGetNextPhase = (await import("../../workflow")).getNextPhase;

mock.module("../../workflow", () => ({
  runPhaseResearch: mockedRunPhaseResearch,
  runPhasePlan: mockedRunPhasePlan,
  runPhaseImplement: mockedRunPhaseImplement,
  runPhasePr: mockedRunPhasePr,
  runPhaseComplete: mockedRunPhaseComplete,
  getNextPhase: originalGetNextPhase,
}));

const { runCommand } = await import("../../commands/run");

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

function createSuccessResult(item: Item): PhaseResult {
  return {
    success: true,
    item,
  };
}

function createFailureResult(item: Item, error: string): PhaseResult {
  return {
    success: false,
    item,
    error,
  };
}

describe("runCommand", () => {
  let tempDir: string;
  let mockLogger: Logger;
  let originalCwd: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-run-test-"));
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
      "utf-8",
    );
    return itemDir;
  }

  async function updateItem(item: Item): Promise<void> {
    const [section, slug] = item.id.split("/");
    const itemDir = path.join(tempDir, ".wreckit", section, slug);
    await fs.writeFile(
      path.join(itemDir, "item.json"),
      JSON.stringify(item, null, 2),
      "utf-8",
    );
  }

  describe("full workflow tests", () => {
    it("runs all phases from raw to done", async () => {
      const item = createTestItem({ state: "idea" });
      await setupItem(item);

      let currentItem = { ...item };

      mockedRunPhaseResearch.mockImplementation(async () => {
        currentItem = { ...currentItem, state: "researched" };
        await updateItem(currentItem);
        return createSuccessResult(currentItem);
      });

      mockedRunPhasePlan.mockImplementation(async () => {
        currentItem = { ...currentItem, state: "planned" };
        await updateItem(currentItem);
        return createSuccessResult(currentItem);
      });

      mockedRunPhaseImplement.mockImplementation(async () => {
        currentItem = { ...currentItem, state: "implementing" };
        await updateItem(currentItem);
        return createSuccessResult(currentItem);
      });

      mockedRunPhasePr.mockImplementation(async () => {
        currentItem = { ...currentItem, state: "in_pr" };
        await updateItem(currentItem);
        return createSuccessResult(currentItem);
      });

      mockedRunPhaseComplete.mockImplementation(async () => {
        currentItem = { ...currentItem, state: "done" };
        await updateItem(currentItem);
        return createSuccessResult(currentItem);
      });

      await runCommand(item.id, {}, mockLogger);

      expect(mockedRunPhaseResearch).toHaveBeenCalledTimes(1);
      expect(mockedRunPhasePlan).toHaveBeenCalledTimes(1);
      expect(mockedRunPhaseImplement).toHaveBeenCalledTimes(1);
      expect(mockedRunPhasePr).toHaveBeenCalledTimes(1);
      expect(mockedRunPhaseComplete).toHaveBeenCalledTimes(1);
    });

    it("calls phases in correct order", async () => {
      const item = createTestItem({ state: "idea" });
      await setupItem(item);

      const callOrder: string[] = [];
      let currentItem = { ...item };

      mockedRunPhaseResearch.mockImplementation(async () => {
        callOrder.push("research");
        currentItem = { ...currentItem, state: "researched" };
        await updateItem(currentItem);
        return createSuccessResult(currentItem);
      });

      mockedRunPhasePlan.mockImplementation(async () => {
        callOrder.push("plan");
        currentItem = { ...currentItem, state: "planned" };
        await updateItem(currentItem);
        return createSuccessResult(currentItem);
      });

      mockedRunPhaseImplement.mockImplementation(async () => {
        callOrder.push("implement");
        currentItem = { ...currentItem, state: "done" };
        await updateItem(currentItem);
        return createSuccessResult(currentItem);
      });

      await runCommand(item.id, {}, mockLogger);

      expect(callOrder).toEqual(["research", "plan", "implement"]);
    });

    it("stops when state is done", async () => {
      const item = createTestItem({ state: "in_pr" });
      await setupItem(item);

      let currentItem = { ...item };

      mockedRunPhaseComplete.mockImplementation(async () => {
        currentItem = { ...currentItem, state: "done" };
        await updateItem(currentItem);
        return createSuccessResult(currentItem);
      });

      await runCommand(item.id, {}, mockLogger);

      expect(mockedRunPhaseComplete).toHaveBeenCalledTimes(1);
      expect(mockedRunPhaseResearch).not.toHaveBeenCalled();
      expect(mockedRunPhasePlan).not.toHaveBeenCalled();
    });
  });

  describe("resume tests", () => {
    it("starts from current state (not raw)", async () => {
      const item = createTestItem({ state: "planned" });
      await setupItem(item);

      let currentItem = { ...item };

      mockedRunPhaseImplement.mockImplementation(async () => {
        currentItem = { ...currentItem, state: "done" };
        await updateItem(currentItem);
        return createSuccessResult(currentItem);
      });

      await runCommand(item.id, {}, mockLogger);

      expect(mockedRunPhaseResearch).not.toHaveBeenCalled();
      expect(mockedRunPhasePlan).not.toHaveBeenCalled();
      expect(mockedRunPhaseImplement).toHaveBeenCalledTimes(1);
    });

    it("researched item starts at plan phase", async () => {
      const item = createTestItem({ state: "researched" });
      await setupItem(item);

      let currentItem = { ...item };

      mockedRunPhasePlan.mockImplementation(async () => {
        currentItem = { ...currentItem, state: "done" };
        await updateItem(currentItem);
        return createSuccessResult(currentItem);
      });

      await runCommand(item.id, {}, mockLogger);

      expect(mockedRunPhaseResearch).not.toHaveBeenCalled();
      expect(mockedRunPhasePlan).toHaveBeenCalledTimes(1);
    });

    it("planned item starts at implement phase", async () => {
      const item = createTestItem({ state: "planned" });
      await setupItem(item);

      let currentItem = { ...item };

      mockedRunPhaseImplement.mockImplementation(async () => {
        currentItem = { ...currentItem, state: "done" };
        await updateItem(currentItem);
        return createSuccessResult(currentItem);
      });

      await runCommand(item.id, {}, mockLogger);

      expect(mockedRunPhaseResearch).not.toHaveBeenCalled();
      expect(mockedRunPhasePlan).not.toHaveBeenCalled();
      expect(mockedRunPhaseImplement).toHaveBeenCalledTimes(1);
    });
  });

  describe("artifact skip tests", () => {
    it("skips research phase if research.md exists (without --force)", async () => {
      const item = createTestItem({ state: "idea" });
      const itemDir = await setupItem(item);

      await fs.writeFile(
        path.join(itemDir, "research.md"),
        "# Research",
        "utf-8",
      );

      let currentItem = { ...item };

      mockedRunPhaseResearch.mockImplementation(async () => {
        currentItem = { ...currentItem, state: "researched" };
        await updateItem(currentItem);
        return createSuccessResult(currentItem);
      });

      mockedRunPhasePlan.mockImplementation(async () => {
        currentItem = { ...currentItem, state: "done" };
        await updateItem(currentItem);
        return createSuccessResult(currentItem);
      });

      await runCommand(item.id, {}, mockLogger);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("Skipping research phase"),
      );
      expect(mockedRunPhaseResearch).toHaveBeenCalledWith(
        item.id,
        expect.objectContaining({ force: false }),
      );
    });

    it("skips plan phase if plan.md + prd.json exist", async () => {
      const item = createTestItem({ state: "researched" });
      const itemDir = await setupItem(item);

      await fs.writeFile(path.join(itemDir, "plan.md"), "# Plan", "utf-8");
      await fs.writeFile(
        path.join(itemDir, "prd.json"),
        JSON.stringify({
          schema_version: 1,
          id: item.id,
          branch_name: "test",
          user_stories: [],
        }),
        "utf-8",
      );

      let currentItem = { ...item };

      mockedRunPhasePlan.mockImplementation(async () => {
        currentItem = { ...currentItem, state: "planned" };
        await updateItem(currentItem);
        return createSuccessResult(currentItem);
      });

      mockedRunPhaseImplement.mockImplementation(async () => {
        currentItem = { ...currentItem, state: "done" };
        await updateItem(currentItem);
        return createSuccessResult(currentItem);
      });

      await runCommand(item.id, {}, mockLogger);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("Skipping plan phase"),
      );
      expect(mockedRunPhasePlan).toHaveBeenCalledWith(
        item.id,
        expect.objectContaining({ force: false }),
      );
    });

    it("with --force, runs even with existing artifacts", async () => {
      const item = createTestItem({ state: "idea" });
      const itemDir = await setupItem(item);

      await fs.writeFile(
        path.join(itemDir, "research.md"),
        "# Research",
        "utf-8",
      );

      let currentItem = { ...item };

      mockedRunPhaseResearch.mockImplementation(async () => {
        currentItem = { ...currentItem, state: "researched" };
        await updateItem(currentItem);
        return createSuccessResult(currentItem);
      });

      mockedRunPhasePlan.mockImplementation(async () => {
        currentItem = { ...currentItem, state: "done" };
        await updateItem(currentItem);
        return createSuccessResult(currentItem);
      });

      await runCommand(item.id, { force: true }, mockLogger);

      expect(mockLogger.info).not.toHaveBeenCalledWith(
        expect.stringContaining("Skipping"),
      );
      expect(mockedRunPhaseResearch).toHaveBeenCalledWith(
        item.id,
        expect.objectContaining({ force: true }),
      );
    });
  });

  describe("error handling tests", () => {
    it("phase failure stops execution", async () => {
      const item = createTestItem({ state: "idea" });
      await setupItem(item);

      mockedRunPhaseResearch.mockResolvedValue(
        createFailureResult(item, "Agent failed"),
      );

      await expect(runCommand(item.id, {}, mockLogger)).rejects.toThrow(
        "Agent failed",
      );

      expect(mockedRunPhasePlan).not.toHaveBeenCalled();
    });

    it("error logged with item ID", async () => {
      const item = createTestItem({ state: "idea" });
      await setupItem(item);

      mockedRunPhaseResearch.mockResolvedValue(
        createFailureResult(item, "Agent failed"),
      );

      await expect(runCommand(item.id, {}, mockLogger)).rejects.toThrow();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining(item.id),
      );
    });
  });

  describe("edge cases", () => {
    it("item already done -> immediate success", async () => {
      const item = createTestItem({ state: "done" });
      await setupItem(item);

      await runCommand(item.id, {}, mockLogger);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("already done"),
      );
      expect(mockedRunPhaseResearch).not.toHaveBeenCalled();
      expect(mockedRunPhasePlan).not.toHaveBeenCalled();
      expect(mockedRunPhaseImplement).not.toHaveBeenCalled();
      expect(mockedRunPhasePr).not.toHaveBeenCalled();
      expect(mockedRunPhaseComplete).not.toHaveBeenCalled();
    });

    it("non-existent item -> error", async () => {
      await expect(
        runCommand("nonexistent/001-missing", {}, mockLogger),
      ).rejects.toThrow("Item not found");
    });
  });

  describe("dry-run option", () => {
    it("shows what would be done without running phases", async () => {
      const item = createTestItem({ state: "idea" });
      await setupItem(item);

      await runCommand(item.id, { dryRun: true }, mockLogger);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("DRY RUN"),
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("Next Phase:"),
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("No changes made"),
      );
      expect(mockedRunPhaseResearch).not.toHaveBeenCalled();
    });
  });
});
