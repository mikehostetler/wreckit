import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { Item } from "../../schemas";
import type { Logger } from "../../logging";
import type { PhaseResult } from "../../workflow";

vi.mock("../../workflow", () => ({
  runPhaseResearch: vi.fn(),
  runPhasePlan: vi.fn(),
  runPhaseImplement: vi.fn(),
  runPhasePr: vi.fn(),
  runPhaseComplete: vi.fn(),
}));

import {
  runPhaseResearch,
  runPhasePlan,
  runPhaseImplement,
  runPhasePr,
  runPhaseComplete,
} from "../../workflow";
import { runPhaseCommand } from "../../commands/phase";

const mockedRunPhaseResearch = vi.mocked(runPhaseResearch);
const mockedRunPhasePlan = vi.mocked(runPhasePlan);
const mockedRunPhaseImplement = vi.mocked(runPhaseImplement);
const mockedRunPhasePr = vi.mocked(runPhasePr);
const mockedRunPhaseComplete = vi.mocked(runPhaseComplete);

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

describe("runPhaseCommand", () => {
  let tempDir: string;
  let mockLogger: Logger;
  let originalCwd: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-phase-test-"));
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

  describe("item lookup", () => {
    it("throws error for non-existent item", async () => {
      await expect(
        runPhaseCommand("research", "nonexistent/001-missing", {}, mockLogger)
      ).rejects.toThrow("Item not found");
    });

    it("finds existing item", async () => {
      const item = createTestItem({ state: "raw" });
      await setupItem(item);

      mockedRunPhaseResearch.mockResolvedValue(
        createSuccessResult({ ...item, state: "researched" })
      );

      await runPhaseCommand("research", item.id, {}, mockLogger);
      expect(mockedRunPhaseResearch).toHaveBeenCalled();
    });
  });

  describe("phase routing", () => {
    it("calls runPhaseResearch for research phase", async () => {
      const item = createTestItem({ state: "raw" });
      await setupItem(item);

      mockedRunPhaseResearch.mockResolvedValue(
        createSuccessResult({ ...item, state: "researched" })
      );

      await runPhaseCommand("research", item.id, {}, mockLogger);
      expect(mockedRunPhaseResearch).toHaveBeenCalled();
      expect(mockedRunPhaseResearch.mock.calls[0][0]).toBe(item.id);
    });

    it("calls runPhasePlan for plan phase", async () => {
      const item = createTestItem({ state: "researched" });
      await setupItem(item);

      mockedRunPhasePlan.mockResolvedValue(
        createSuccessResult({ ...item, state: "planned" })
      );

      await runPhaseCommand("plan", item.id, {}, mockLogger);
      expect(mockedRunPhasePlan).toHaveBeenCalled();
      expect(mockedRunPhasePlan.mock.calls[0][0]).toBe(item.id);
    });

    it("calls runPhaseImplement for implement phase", async () => {
      const item = createTestItem({ state: "planned" });
      await setupItem(item);

      mockedRunPhaseImplement.mockResolvedValue(
        createSuccessResult({ ...item, state: "implementing" })
      );

      await runPhaseCommand("implement", item.id, {}, mockLogger);
      expect(mockedRunPhaseImplement).toHaveBeenCalled();
      expect(mockedRunPhaseImplement.mock.calls[0][0]).toBe(item.id);
    });

    it("calls runPhasePr for pr phase", async () => {
      const item = createTestItem({ state: "implementing" });
      await setupItem(item);

      mockedRunPhasePr.mockResolvedValue(
        createSuccessResult({ ...item, state: "in_pr" })
      );

      await runPhaseCommand("pr", item.id, {}, mockLogger);
      expect(mockedRunPhasePr).toHaveBeenCalled();
      expect(mockedRunPhasePr.mock.calls[0][0]).toBe(item.id);
    });

    it("calls runPhaseComplete for complete phase", async () => {
      const item = createTestItem({ state: "in_pr", pr_number: 42 });
      await setupItem(item);

      mockedRunPhaseComplete.mockResolvedValue(
        createSuccessResult({ ...item, state: "done" })
      );

      await runPhaseCommand("complete", item.id, {}, mockLogger);
      expect(mockedRunPhaseComplete).toHaveBeenCalled();
      expect(mockedRunPhaseComplete.mock.calls[0][0]).toBe(item.id);
    });
  });

  describe("idempotency - skips if already in target state", () => {
    it("research on 'researched' item skips without --force", async () => {
      const item = createTestItem({ state: "researched" });
      await setupItem(item);

      await runPhaseCommand("research", item.id, {}, mockLogger);

      expect(mockedRunPhaseResearch).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("skipping")
      );
    });

    it("research on 'researched' item runs with --force", async () => {
      const item = createTestItem({ state: "researched" });
      await setupItem(item);

      mockedRunPhaseResearch.mockResolvedValue(
        createSuccessResult({ ...item, state: "researched" })
      );

      await runPhaseCommand("research", item.id, { force: true }, mockLogger);
      expect(mockedRunPhaseResearch).toHaveBeenCalled();
    });

    it("plan on 'planned' item skips without --force", async () => {
      const item = createTestItem({ state: "planned" });
      await setupItem(item);

      await runPhaseCommand("plan", item.id, {}, mockLogger);

      expect(mockedRunPhasePlan).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("skipping")
      );
    });

    it("plan on 'planned' item runs with --force", async () => {
      const item = createTestItem({ state: "planned" });
      await setupItem(item);

      mockedRunPhasePlan.mockResolvedValue(
        createSuccessResult({ ...item, state: "planned" })
      );

      await runPhaseCommand("plan", item.id, { force: true }, mockLogger);
      expect(mockedRunPhasePlan).toHaveBeenCalled();
    });
  });

  describe("invalid transitions", () => {
    it("implement on 'done' item throws error", async () => {
      const item = createTestItem({ state: "done" });
      await setupItem(item);

      await expect(
        runPhaseCommand("implement", item.id, {}, mockLogger)
      ).rejects.toThrow("invalid transition");
    });

    it("research on 'done' item throws error", async () => {
      const item = createTestItem({ state: "done" });
      await setupItem(item);

      await expect(
        runPhaseCommand("research", item.id, {}, mockLogger)
      ).rejects.toThrow("invalid transition");
    });

    it("plan on 'raw' item throws error (wrong state)", async () => {
      const item = createTestItem({ state: "raw" });
      await setupItem(item);

      await expect(
        runPhaseCommand("plan", item.id, {}, mockLogger)
      ).rejects.toThrow("expected 'researched'");
    });
  });

  describe("--dry-run option", () => {
    it("shows what would be done without running", async () => {
      const item = createTestItem({ state: "raw" });
      await setupItem(item);

      await runPhaseCommand("research", item.id, { dryRun: true }, mockLogger);

      expect(mockedRunPhaseResearch).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("DRY RUN")
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("Current:")
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("Target:")
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("No changes made")
      );
    });
  });

  describe("--force option", () => {
    it("passes force to workflow options", async () => {
      const item = createTestItem({ state: "raw" });
      await setupItem(item);

      mockedRunPhaseResearch.mockResolvedValue(
        createSuccessResult({ ...item, state: "researched" })
      );

      await runPhaseCommand("research", item.id, { force: true }, mockLogger);

      expect(mockedRunPhaseResearch).toHaveBeenCalledWith(
        item.id,
        expect.objectContaining({ force: true })
      );
    });
  });

  describe("error handling", () => {
    it("throws when workflow function fails", async () => {
      const item = createTestItem({ state: "raw" });
      await setupItem(item);

      mockedRunPhaseResearch.mockResolvedValue(
        createFailureResult(item, "Agent failed")
      );

      await expect(
        runPhaseCommand("research", item.id, {}, mockLogger)
      ).rejects.toThrow("Agent failed");
    });

    it("includes phase name in error message when no error provided", async () => {
      const item = createTestItem({ state: "raw" });
      await setupItem(item);

      mockedRunPhaseResearch.mockResolvedValue({
        success: false,
        item,
      });

      await expect(
        runPhaseCommand("research", item.id, {}, mockLogger)
      ).rejects.toThrow("research");
    });
  });

  describe("implement phase special cases", () => {
    it("allows implement on 'planned' state", async () => {
      const item = createTestItem({ state: "planned" });
      await setupItem(item);

      mockedRunPhaseImplement.mockResolvedValue(
        createSuccessResult({ ...item, state: "implementing" })
      );

      await runPhaseCommand("implement", item.id, {}, mockLogger);
      expect(mockedRunPhaseImplement).toHaveBeenCalled();
    });

    it("allows implement on 'implementing' state (for resuming)", async () => {
      const item = createTestItem({ state: "implementing" });
      await setupItem(item);

      mockedRunPhaseImplement.mockResolvedValue(
        createSuccessResult({ ...item, state: "implementing" })
      );

      await runPhaseCommand("implement", item.id, {}, mockLogger);
      expect(mockedRunPhaseImplement).toHaveBeenCalled();
    });
  });
});
