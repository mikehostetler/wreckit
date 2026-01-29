import { describe, it, expect } from "bun:test";
import { enforceLimits, LimitsTracker, LimitExceededError, type LimitsContext } from "../agent/limits";
import type { LimitsConfig } from "../schemas";
import { type Logger } from "../logging";

const mockLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
} as unknown as Logger;

describe("Limits Enforcement", () => {
  const defaults: LimitsConfig = {
    maxIterations: 10,
    maxDurationSeconds: 60,
    maxProgressSteps: 100,
  };

  it("should pass when within limits", () => {
    const context: LimitsContext = {
      iterations: 5,
      durationSeconds: 30,
      progressSteps: 50,
    };
    expect(() => enforceLimits(defaults, context, mockLogger)).not.toThrow();
  });

  it("should throw when maxIterations exceeded", () => {
    const context: LimitsContext = {
      iterations: 10, // Equal to max is exceeded (or allowed? Implementation uses >=)
      // Implementation: if (context.iterations >= limits.maxIterations)
      // So 10 >= 10 is true -> throws
      durationSeconds: 30,
      progressSteps: 50,
    };
    expect(() => enforceLimits(defaults, context, mockLogger)).toThrow(LimitExceededError);
  });

  it("should throw when maxDurationSeconds exceeded", () => {
    const context: LimitsContext = {
      iterations: 5,
      durationSeconds: 60,
      progressSteps: 50,
    };
    expect(() => enforceLimits(defaults, context, mockLogger)).toThrow(LimitExceededError);
  });

  it("should throw when maxProgressSteps exceeded", () => {
    const context: LimitsContext = {
      iterations: 5,
      durationSeconds: 30,
      progressSteps: 100,
    };
    expect(() => enforceLimits(defaults, context, mockLogger)).toThrow(LimitExceededError);
  });

  describe("LimitsTracker", () => {
    it("should track progress", () => {
      const tracker = new LimitsTracker();
      expect(tracker.getProgressSteps()).toBe(0);
      
      tracker.incrementProgress();
      expect(tracker.getProgressSteps()).toBe(1);
      
      tracker.incrementProgress(5);
      expect(tracker.getProgressSteps()).toBe(6);
      
      tracker.resetProgress();
      expect(tracker.getProgressSteps()).toBe(0);
    });

    it("should calculate duration", async () => {
      const tracker = new LimitsTracker();
      await new Promise(resolve => setTimeout(resolve, 10));
      const context = tracker.getContext(1);
      expect(context.durationSeconds).toBeGreaterThan(0);
      expect(context.iterations).toBe(1);
    });
  });
});
