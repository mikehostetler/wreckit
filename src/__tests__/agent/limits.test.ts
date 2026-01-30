import { describe, test, expect } from "bun:test";
import { enforceLimits, LimitsTracker, LimitExceededError } from "../../agent/limits";
import type { LimitsConfig } from "../../schemas";
import { initLogger } from "../../logging";

describe("Limits Enforcement", () => {
  let logger: ReturnType<typeof initLogger>;

  beforeEach(() => {
    logger = initLogger();
  });

  const createLimits = (overrides?: Partial<LimitsConfig>): LimitsConfig => ({
    maxIterations: 100,
    maxDurationSeconds: 3600,
    maxProgressSteps: 1000,
    ...overrides,
  });

  describe("enforceLimits()", () => {
    test("throws LimitExceededError when iterations >= maxIterations", () => {
      const limits = createLimits({ maxIterations: 10 });
      const context = {
        iterations: 10,
        durationSeconds: 100,
        progressSteps: 50,
      };

      expect(() => enforceLimits(limits, context, logger)).toThrow(LimitExceededError);
      expect(() => enforceLimits(limits, context, logger)).toThrow("Iterations limit exceeded");
    });

    test("throws LimitExceededError when durationSeconds >= maxDurationSeconds", () => {
      const limits = createLimits({ maxDurationSeconds: 300 });
      const context = {
        iterations: 5,
        durationSeconds: 300,
        progressSteps: 50,
      };

      expect(() => enforceLimits(limits, context, logger)).toThrow(LimitExceededError);
      expect(() => enforceLimits(limits, context, logger)).toThrow("Duration limit exceeded");
    });

    test("throws LimitExceededError when progressSteps >= maxProgressSteps", () => {
      const limits = createLimits({ maxProgressSteps: 100 });
      const context = {
        iterations: 5,
        durationSeconds: 100,
        progressSteps: 100,
      };

      expect(() => enforceLimits(limits, context, logger)).toThrow(LimitExceededError);
      expect(() => enforceLimits(limits, context, logger)).toThrow("Progress steps limit exceeded");
    });

    test("throws LimitExceededError when budget exceeded (if set)", () => {
      const limits = createLimits({ maxBudgetDollars: 0.01 }); // $0.01 = ~43 seconds
      const context = {
        iterations: 5,
        durationSeconds: 50, // Cost: $0.0115 > $0.01
        progressSteps: 50,
      };

      expect(() => enforceLimits(limits, context, logger)).toThrow(LimitExceededError);
      expect(() => enforceLimits(limits, context, logger)).toThrow("Budget limit exceeded");
    });

    test("passes when all limits within bounds", () => {
      const limits = createLimits();
      const context = {
        iterations: 50,
        durationSeconds: 1000,
        progressSteps: 500,
      };

      expect(() => enforceLimits(limits, context, logger)).not.toThrow();
    });

    test("passes when exactly at limit (but not over)", () => {
      const limits = createLimits();
      const context = {
        iterations: 99, // < 100
        durationSeconds: 3599, // < 3600
        progressSteps: 999, // < 1000
      };

      expect(() => enforceLimits(limits, context, logger)).not.toThrow();
    });
  });

  describe("LimitExceededError", () => {
    test("has correct properties (limitType, limitValue, actualValue)", () => {
      const error = new LimitExceededError("iterations", 100, 150);

      expect(error.limitType).toBe("iterations");
      expect(error.limitValue).toBe(100);
      expect(error.actualValue).toBe(150);
      expect(error.name).toBe("LimitExceededError");
    });

    test("generates descriptive error message", () => {
      const error = new LimitExceededError("duration", 3600, 4000);

      expect(error.message).toContain("duration");
      expect(error.message).toContain("4000");
      expect(error.message).toContain("3600");
    });
  });

  describe("LimitsTracker", () => {
    test("calculates duration correctly", async () => {
      const tracker = new LimitsTracker();

      // Wait 100ms
      await new Promise(resolve => setTimeout(resolve, 100));

      const duration = tracker.getDurationSeconds();
      expect(duration).toBeGreaterThanOrEqual(0.1);
      expect(duration).toBeLessThan(0.2); // Should be close to 0.1s
    });

    test("increments progress steps", () => {
      const tracker = new LimitsTracker();

      expect(tracker.getProgressSteps()).toBe(0);

      tracker.incrementProgress();
      expect(tracker.getProgressSteps()).toBe(1);

      tracker.incrementProgress(5);
      expect(tracker.getProgressSteps()).toBe(6);
    });

    test("resetProgress() resets counter to 0", () => {
      const tracker = new LimitsTracker();

      tracker.incrementProgress(10);
      expect(tracker.getProgressSteps()).toBe(10);

      tracker.resetProgress();
      expect(tracker.getProgressSteps()).toBe(0);
    });

    test("getContext() returns current LimitsContext", () => {
      const tracker = new LimitsTracker();

      tracker.incrementProgress(5);
      const context = tracker.getContext(10);

      expect(context.iterations).toBe(10);
      expect(context.progressSteps).toBe(5);
      expect(context.durationSeconds).toBeGreaterThanOrEqual(0);
    });
  });
});
