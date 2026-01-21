import { describe, it, expect, beforeEach, mock } from "bun:test";
import {
  SpriteLoop,
  ProgressTracker,
  type LoopCallbacks,
} from "../../compute/sprites/SpriteLoop";
import type {
  ComputeBackend,
  IterationState,
  LogEvent,
} from "../../compute/ComputeBackend";
import type { LimitsConfigResolved } from "../../config";
import type { Logger } from "../../logging";

function createTestLogger(): Logger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    json: () => {},
  };
}

function createLimitsConfig(
  overrides?: Partial<LimitsConfigResolved>
): LimitsConfigResolved {
  return {
    max_iterations: 10,
    max_duration_hours: 1,
    max_budget_usd: 20,
    no_progress_threshold: 3,
    ...overrides,
  };
}

interface MockBackend extends ComputeBackend {
  runIterationMock: ReturnType<typeof mock>;
  syncMock: ReturnType<typeof mock>;
  readStateMock: ReturnType<typeof mock>;
  writeResponseMock: ReturnType<typeof mock>;
  cleanupMock: ReturnType<typeof mock>;
}

function createMockBackend(): MockBackend {
  const runIterationMock = mock(async function* (): AsyncIterable<LogEvent> {
    yield { type: "info", message: "test", timestamp: new Date().toISOString() };
  });
  const syncMock = mock(async () => {});
  const readStateMock = mock(async (): Promise<IterationState> => ({
    status: "CONTINUE",
  }));
  const writeResponseMock = mock(async () => {});
  const cleanupMock = mock(async () => {});

  return {
    name: "mock",
    runIteration: runIterationMock,
    sync: syncMock,
    readState: readStateMock,
    writeResponse: writeResponseMock,
    cleanup: cleanupMock,
    runIterationMock,
    syncMock,
    readStateMock,
    writeResponseMock,
    cleanupMock,
  };
}

describe("SpriteLoop", () => {
  let backend: MockBackend;
  let limits: LimitsConfigResolved;
  let logger: Logger;

  beforeEach(() => {
    backend = createMockBackend();
    limits = createLimitsConfig();
    logger = createTestLogger();
  });

  describe("run()", () => {
    it("stops at max_iterations", async () => {
      limits = createLimitsConfig({ max_iterations: 3 });
      let callCount = 0;
      backend.readStateMock.mockImplementation(async (): Promise<IterationState> => {
        callCount++;
        return { status: "CONTINUE", summary: `sha-${callCount}` };
      });
      const loop = new SpriteLoop(backend, limits, logger);

      const result = await loop.run("001-test", "test prompt", "/tmp", {});

      expect(result.reason).toBe("max_iterations");
      expect(result.iterations).toBe(3);
    });

    it("stops on timeout", async () => {
      limits = createLimitsConfig({
        max_iterations: 100,
        max_duration_hours: 0,
      });
      const loop = new SpriteLoop(backend, limits, logger);

      const result = await loop.run("001-test", "test prompt", "/tmp", {});

      expect(result.reason).toBe("timeout");
      expect(result.iterations).toBe(0);
    });

    it("returns done when work is complete", async () => {
      let callCount = 0;
      backend.readStateMock.mockImplementation(async (): Promise<IterationState> => {
        callCount++;
        if (callCount >= 2) {
          return { status: "DONE", summary: "Complete" };
        }
        return { status: "CONTINUE" };
      });

      const callbacks: LoopCallbacks = {
        isWorkComplete: mock(async () => true),
      };

      const loop = new SpriteLoop(backend, limits, logger);
      const result = await loop.run("001-test", "test prompt", "/tmp", callbacks);

      expect(result.reason).toBe("done");
      expect(result.iterations).toBe(2);
      expect(result.lastState?.status).toBe("DONE");
    });

    it("continues when DONE but work not complete", async () => {
      let callCount = 0;
      backend.readStateMock.mockImplementation(async (): Promise<IterationState> => {
        callCount++;
        if (callCount === 2) {
          return { status: "DONE", summary: "First pass done" };
        }
        if (callCount >= 4) {
          return { status: "DONE", summary: "All done" };
        }
        return { status: "CONTINUE" };
      });

      let completeCallCount = 0;
      const callbacks: LoopCallbacks = {
        isWorkComplete: mock(async () => {
          completeCallCount++;
          return completeCallCount >= 2;
        }),
      };

      const loop = new SpriteLoop(backend, limits, logger);
      const result = await loop.run("001-test", "test prompt", "/tmp", callbacks);

      expect(result.reason).toBe("done");
      expect(result.iterations).toBe(4);
    });

    it("handles NEEDS_INPUT correctly", async () => {
      let callCount = 0;
      backend.readStateMock.mockImplementation(async (): Promise<IterationState> => {
        callCount++;
        if (callCount === 1) {
          return { status: "NEEDS_INPUT", question: "What is your name?" };
        }
        return { status: "DONE", summary: "Complete" };
      });

      const onNeedsInput = mock(async (question: string) => {
        expect(question).toBe("What is your name?");
        return "Claude";
      });

      const callbacks: LoopCallbacks = {
        onNeedsInput,
        isWorkComplete: async () => true,
      };

      const loop = new SpriteLoop(backend, limits, logger);
      const result = await loop.run("001-test", "test prompt", "/tmp", callbacks);

      expect(result.reason).toBe("done");
      expect(onNeedsInput).toHaveBeenCalled();
      expect(backend.writeResponseMock).toHaveBeenCalledWith("001-test", "Claude");
    });

    it("returns blocked when NEEDS_INPUT with no handler", async () => {
      backend.readStateMock.mockImplementation(async (): Promise<IterationState> => ({
        status: "NEEDS_INPUT",
        question: "What is your name?",
      }));

      const loop = new SpriteLoop(backend, limits, logger);
      const result = await loop.run("001-test", "test prompt", "/tmp", {});

      expect(result.reason).toBe("blocked");
      expect(result.error).toBe("No input handler");
      expect(result.iterations).toBe(1);
    });

    it("handles BLOCKED state", async () => {
      backend.readStateMock.mockImplementation(async (): Promise<IterationState> => ({
        status: "BLOCKED",
        error: "Resource unavailable",
      }));

      const loop = new SpriteLoop(backend, limits, logger);
      const result = await loop.run("001-test", "test prompt", "/tmp", {});

      expect(result.reason).toBe("blocked");
      expect(result.error).toBe("Resource unavailable");
      expect(result.lastState?.status).toBe("BLOCKED");
    });

    it("detects no_progress condition", async () => {
      limits = createLimitsConfig({ no_progress_threshold: 2 });
      backend.readStateMock.mockImplementation(async (): Promise<IterationState> => ({
        status: "CONTINUE",
      }));

      const loop = new SpriteLoop(backend, limits, logger);
      const result = await loop.run("001-test", "test prompt", "/tmp", {});

      expect(result.reason).toBe("no_progress");
      expect(result.iterations).toBe(2);
    });

    it("resets progress on state change", async () => {
      limits = createLimitsConfig({ no_progress_threshold: 3, max_iterations: 10 });
      let callCount = 0;
      backend.readStateMock.mockImplementation(async (): Promise<IterationState> => {
        callCount++;
        if (callCount === 2) {
          return { status: "CONTINUE", summary: "commit-sha-1" };
        }
        if (callCount === 4) {
          return { status: "CONTINUE", summary: "commit-sha-2" };
        }
        if (callCount === 6) {
          return { status: "DONE", summary: "done" };
        }
        return { status: "CONTINUE" };
      });

      const callbacks: LoopCallbacks = {
        isWorkComplete: async () => true,
      };

      const loop = new SpriteLoop(backend, limits, logger);
      const result = await loop.run("001-test", "test prompt", "/tmp", callbacks);

      expect(result.reason).toBe("done");
      expect(result.iterations).toBe(6);
    });

    it("invokes callbacks correctly", async () => {
      limits = createLimitsConfig({ max_iterations: 2 });
      backend.readStateMock.mockImplementation(async (): Promise<IterationState> => ({
        status: "CONTINUE",
        summary: `sha-${Date.now()}`,
      }));

      const onIterationStart = mock((_iteration: number) => {});
      const onIterationEnd = mock((_iteration: number, _state: IterationState) => {});
      const onLogEvent = mock((_event: LogEvent) => {});

      const callbacks: LoopCallbacks = {
        onIterationStart,
        onIterationEnd,
        onLogEvent,
      };

      const loop = new SpriteLoop(backend, limits, logger);
      await loop.run("001-test", "test prompt", "/tmp", callbacks);

      expect(onIterationStart).toHaveBeenCalledTimes(2);
      expect(onIterationEnd).toHaveBeenCalledTimes(2);
      expect(onLogEvent).toHaveBeenCalled();
    });

    it("syncs upload before iteration and download after", async () => {
      limits = createLimitsConfig({ max_iterations: 1 });

      const loop = new SpriteLoop(backend, limits, logger);
      await loop.run("001-test", "test prompt", "/tmp", {});

      const syncCalls = backend.syncMock.mock.calls;
      expect(syncCalls.length).toBe(2);
      expect(syncCalls[0][0]).toBe("upload");
      expect(syncCalls[1][0]).toBe("download");
    });
  });
});

describe("ProgressTracker", () => {
  it("detects progress when commit sha changes", () => {
    const tracker = new ProgressTracker();

    const hasProgress1 = tracker.checkProgress({ status: "CONTINUE", summary: "sha-1" });
    expect(hasProgress1).toBe(true);

    const hasProgress2 = tracker.checkProgress({ status: "CONTINUE", summary: "sha-2" });
    expect(hasProgress2).toBe(true);
  });

  it("detects no progress when sha stays same", () => {
    const tracker = new ProgressTracker();

    tracker.checkProgress({ status: "CONTINUE", summary: "sha-1" });

    const hasProgress = tracker.checkProgress({ status: "CONTINUE", summary: "sha-1" });
    expect(hasProgress).toBe(false);
  });

  it("isStuck returns true after threshold", () => {
    const tracker = new ProgressTracker();

    tracker.checkProgress({ status: "CONTINUE" });
    expect(tracker.isStuck(3)).toBe(false);

    tracker.checkProgress({ status: "CONTINUE" });
    expect(tracker.isStuck(3)).toBe(false);

    tracker.checkProgress({ status: "CONTINUE" });
    expect(tracker.isStuck(3)).toBe(true);
  });

  it("reset clears no progress count", () => {
    const tracker = new ProgressTracker();

    tracker.checkProgress({ status: "CONTINUE" });
    tracker.checkProgress({ status: "CONTINUE" });
    expect(tracker.isStuck(3)).toBe(false);

    tracker.reset();
    expect(tracker.isStuck(1)).toBe(false);
  });
});
