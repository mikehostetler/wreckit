import {
  describe,
  it,
  expect,
  mock,
  spyOn,
  beforeEach,
  afterEach,
  vi,
} from "bun:test";
import type { IndexItem } from "../schemas";
import type { Logger } from "../logging";
import {
  createTuiState,
  updateTuiState,
  renderDashboard,
  formatRuntime,
  getStateIcon,
  padToWidth,
  TuiRunner,
  createSimpleProgress,
} from "../tui";

function createTestItem(overrides: Partial<IndexItem> = {}): IndexItem {
  return {
    id: "foundation/001-core-types",
    title: "Core Types",
    state: "idea",
    ...overrides,
  };
}

function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    json: vi.fn(),
  };
}

describe("TUI", () => {
  describe("createTuiState", () => {
    it("creates state from items", () => {
      const items = [
        createTestItem({ id: "foundation/001-core-types", state: "done" }),
        createTestItem({
          id: "foundation/002-api-layer",
          state: "implementing",
        }),
        createTestItem({ id: "features/001-auth", state: "idea" }),
      ];

      const state = createTuiState(items);

      expect(state.items).toHaveLength(3);
      expect(state.items[0].id).toBe("foundation/001-core-types");
      expect(state.items[0].state).toBe("done");
    });

    it("sets correct counts", () => {
      const items = [
        createTestItem({ state: "done" }),
        createTestItem({ id: "item2", state: "done" }),
        createTestItem({ id: "item3", state: "implementing" }),
        createTestItem({ id: "item4", state: "idea" }),
      ];

      const state = createTuiState(items);

      expect(state.completedCount).toBe(2);
      expect(state.totalCount).toBe(4);
    });

    it("initializes with null current values", () => {
      const items = [createTestItem()];

      const state = createTuiState(items);

      expect(state.currentItem).toBeNull();
      expect(state.currentPhase).toBeNull();
      expect(state.currentStory).toBeNull();
      expect(state.currentIteration).toBe(0);
    });
  });

  describe("updateTuiState", () => {
    it("updates state with partial", () => {
      const items = [createTestItem()];
      const state = createTuiState(items);

      const updated = updateTuiState(state, {
        currentItem: "foundation/001-core-types",
        currentPhase: "implementing",
      });

      expect(updated.currentItem).toBe("foundation/001-core-types");
      expect(updated.currentPhase).toBe("implementing");
      expect(updated.items).toBe(state.items);
    });
  });

  describe("renderDashboard", () => {
    it("renders header with current item", () => {
      const items = [createTestItem()];
      const state = createTuiState(items);
      state.currentItem = "foundation/001-core-types";

      const output = renderDashboard(state);

      expect(output).toContain("Wreckit");
      expect(output).toContain("Running: foundation/001-core-types");
    });

    it("renders item list with icons", () => {
      const items = [
        createTestItem({ id: "item1", state: "done" }),
        createTestItem({ id: "item2", state: "implementing" }),
        createTestItem({ id: "item3", state: "idea" }),
      ];
      const state = createTuiState(items);

      const output = renderDashboard(state);

      expect(output).toContain("✓");
      expect(output).toContain("→");
      expect(output).toContain("○");
    });

    it("renders progress bar/count", () => {
      const items = [
        createTestItem({ id: "item1", state: "done" }),
        createTestItem({ id: "item2", state: "idea" }),
        createTestItem({ id: "item3", state: "idea" }),
      ];
      const state = createTuiState(items);

      const output = renderDashboard(state);

      expect(output).toContain("Progress: 1/3 complete");
    });

    it("handles empty items", () => {
      const state = createTuiState([]);

      const output = renderDashboard(state);

      expect(output).toContain("No items");
    });

    it("truncates long names", () => {
      const longId = "a".repeat(50);
      const items = [createTestItem({ id: longId })];
      const state = createTuiState(items);

      const output = renderDashboard(state, 60);

      expect(output).toContain("…");
    });

    it("renders phase and story info", () => {
      const items = [createTestItem()];
      const state = createTuiState(items);
      state.currentPhase = "implementing";
      state.currentIteration = 3;
      state.maxIterations = 100;
      state.currentStory = { id: "US-002", title: "Add validation logic" };

      const output = renderDashboard(state);

      expect(output).toContain("Phase: implementing (iteration 3/100)");
      expect(output).toContain("Story: US-002 - Add validation logic");
    });

    it("renders keyboard shortcuts", () => {
      const state = createTuiState([]);

      const output = renderDashboard(state);

      expect(output).toContain("[q] quit");
      expect(output).toContain("[l] logs");
    });
  });

  describe("formatRuntime", () => {
    it("formats seconds correctly", () => {
      const startTime = new Date();
      startTime.setSeconds(startTime.getSeconds() - 45);

      const result = formatRuntime(startTime);

      expect(result).toBe("00:00:45");
    });

    it("formats minutes correctly", () => {
      const startTime = new Date();
      startTime.setMinutes(startTime.getMinutes() - 12);
      startTime.setSeconds(startTime.getSeconds() - 34);

      const result = formatRuntime(startTime);

      expect(result).toBe("00:12:34");
    });

    it("formats hours correctly", () => {
      const startTime = new Date();
      startTime.setHours(startTime.getHours() - 2);
      startTime.setMinutes(startTime.getMinutes() - 30);
      startTime.setSeconds(startTime.getSeconds() - 15);

      const result = formatRuntime(startTime);

      expect(result).toBe("02:30:15");
    });

    it("pads single digits with zeros", () => {
      const startTime = new Date();
      startTime.setSeconds(startTime.getSeconds() - 5);

      const result = formatRuntime(startTime);

      expect(result).toBe("00:00:05");
    });
  });

  describe("getStateIcon", () => {
    it("returns ✓ for done", () => {
      expect(getStateIcon("done")).toBe("✓");
    });

    it("returns → for implementing", () => {
      expect(getStateIcon("implementing")).toBe("→");
    });

    it("returns → for in_pr", () => {
      expect(getStateIcon("in_pr")).toBe("→");
    });

    it("returns ○ for raw", () => {
      expect(getStateIcon("idea")).toBe("○");
    });

    it("returns ○ for researched", () => {
      expect(getStateIcon("researched")).toBe("○");
    });

    it("returns ○ for planned", () => {
      expect(getStateIcon("planned")).toBe("○");
    });

    it("returns ○ for unknown state", () => {
      expect(getStateIcon("unknown")).toBe("○");
    });
  });

  describe("padToWidth", () => {
    it("pads short strings", () => {
      const result = padToWidth("hello", 10);
      expect(result).toBe("hello     ");
      expect(result.length).toBe(10);
    });

    it("truncates long strings with ellipsis", () => {
      const result = padToWidth("hello world", 8);
      expect(result).toBe("hello w…");
      expect(result.length).toBe(8);
    });

    it("leaves exact-length strings unchanged", () => {
      const result = padToWidth("hello", 5);
      expect(result).toBe("hello");
    });
  });

  describe("TuiRunner", () => {
    let originalIsTTY: boolean | undefined;
    let originalClear: typeof console.clear;
    let originalLog: typeof console.log;

    beforeEach(() => {
      originalIsTTY = process.stdin.isTTY;
      originalClear = console.clear;
      originalLog = console.log;
      console.clear = vi.fn();
      console.log = vi.fn();
      Object.defineProperty(process.stdin, "isTTY", {
        value: false,
        configurable: true,
      });
    });

    afterEach(() => {
      console.clear = originalClear;
      console.log = originalLog;
      Object.defineProperty(process.stdin, "isTTY", {
        value: originalIsTTY,
        configurable: true,
      });
    });

    it("creates runner without error", () => {
      const items = [createTestItem()];

      const runner = new TuiRunner(items);

      expect(runner).toBeInstanceOf(TuiRunner);
    });

    it("updates state correctly", () => {
      const items = [createTestItem()];
      const runner = new TuiRunner(items);

      runner.update({ currentItem: "foundation/001-core-types" });

      const state = runner.getState();
      expect(state.currentItem).toBe("foundation/001-core-types");
    });

    it("appendLog adds log entries", () => {
      const items = [createTestItem()];
      const runner = new TuiRunner(items);

      runner.appendLog("Log line 1\nLog line 2");

      const state = runner.getState();
      expect(state.logs).toContain("Log line 1");
      expect(state.logs).toContain("Log line 2");
    });

    it("subscribe notifies on state changes", () => {
      const items = [createTestItem()];
      const runner = new TuiRunner(items);
      const callback = vi.fn();

      runner.subscribe(callback);
      runner.update({ currentItem: "test" });

      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenLastCalledWith(
        expect.objectContaining({ currentItem: "test" }),
      );
    });

    it("unsubscribe stops notifications", () => {
      const items = [createTestItem()];
      const runner = new TuiRunner(items);
      const callback = vi.fn();

      const unsubscribe = runner.subscribe(callback);
      unsubscribe();
      runner.update({ currentItem: "test" });

      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe("createSimpleProgress", () => {
    it("logs update messages", () => {
      const logger = createMockLogger();
      const progress = createSimpleProgress(logger);

      progress.update("item1", "researching", "started");

      expect(logger.info).toHaveBeenCalledWith("[item1] researching: started");
    });

    it("logs update without message", () => {
      const logger = createMockLogger();
      const progress = createSimpleProgress(logger);

      progress.update("item1", "researching");

      expect(logger.info).toHaveBeenCalledWith("[item1] researching");
    });

    it("logs complete messages", () => {
      const logger = createMockLogger();
      const progress = createSimpleProgress(logger);

      progress.complete("item1");

      expect(logger.info).toHaveBeenCalledWith("[item1] ✓ complete");
    });

    it("logs fail messages", () => {
      const logger = createMockLogger();
      const progress = createSimpleProgress(logger);

      progress.fail("item1", "something went wrong");

      expect(logger.error).toHaveBeenCalledWith(
        "[item1] ✗ failed: something went wrong",
      );
    });
  });
});
