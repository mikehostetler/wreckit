import type { Logger } from "pino";
import type { LimitsConfig } from "../schemas";

/**
 * Context for enforcing limits
 */
export interface LimitsContext {
  iterations: number;
  durationSeconds: number;
  progressSteps: number;
}

/**
 * Error thrown when a limit is exceeded
 */
export class LimitExceededError extends Error {
  constructor(
    public readonly limitType: "iterations" | "duration" | "progress" | "budget",
    public readonly limitValue: number,
    public readonly actualValue: number,
  ) {
    super(
      `Limit exceeded: ${limitType} (${actualValue} > ${limitValue}). ` +
        `Adjust limits.${
          limitType === "iterations"
            ? "maxIterations"
            : limitType === "duration"
            ? "maxDurationSeconds"
            : limitType === "progress"
            ? "maxProgressSteps"
            : "maxBudgetDollars"
        } to increase.`,
    );
    this.name = "LimitExceededError";
  }
}

/**
 * Enforce resource limits for agent execution
 *
 * @throws {LimitExceededError} When any limit is exceeded
 */
export function enforceLimits(
  limits: LimitsConfig,
  context: LimitsContext,
  logger: Logger,
): void {
  // Check iterations
  if (context.iterations >= limits.maxIterations) {
    logger.warn(
      {
        limit: limits.maxIterations,
        actual: context.iterations,
      },
      "Iterations limit exceeded",
    );
    throw new LimitExceededError(
      "iterations",
      limits.maxIterations,
      context.iterations,
    );
  }

  // Check duration
  if (context.durationSeconds >= limits.maxDurationSeconds) {
    logger.warn(
      {
        limit: limits.maxDurationSeconds,
        actual: context.durationSeconds,
      },
      "Duration limit exceeded",
    );
    throw new LimitExceededError(
      "duration",
      limits.maxDurationSeconds,
      context.durationSeconds,
    );
  }

  // Check budget (if set)
  if (limits.maxBudgetDollars !== undefined) {
    // Budget tracking is estimated based on VM uptime
    // This is a rough estimate - actual costs may vary
    const estimatedCost = estimateCost(context.durationSeconds);
    if (estimatedCost >= limits.maxBudgetDollars) {
      logger.warn(
        {
          limit: limits.maxBudgetDollars,
          actual: estimatedCost,
        },
        "Budget limit exceeded",
      );
      throw new LimitExceededError(
        "budget",
        limits.maxBudgetDollars,
        estimatedCost,
      );
    }
  }

  // Check progress steps
  if (context.progressSteps >= limits.maxProgressSteps) {
    logger.warn(
      {
        limit: limits.maxProgressSteps,
        actual: context.progressSteps,
      },
      "Progress steps limit exceeded",
    );
    throw new LimitExceededError(
      "progress",
      limits.maxProgressSteps,
      context.progressSteps,
    );
  }

  // Log current usage for debugging
  logger.debug(
    {
      iterations: { current: context.iterations, max: limits.maxIterations },
      duration: {
        current: context.durationSeconds,
        max: limits.maxDurationSeconds,
      },
      progress: {
        current: context.progressSteps,
        max: limits.maxProgressSteps,
      },
      ...(limits.maxBudgetDollars && {
        budget: {
          current: estimateCost(context.durationSeconds),
          max: limits.maxBudgetDollars,
        },
      }),
    },
    "Limits check passed",
  );
}

/**
 * Rough cost estimation based on Sprites.dev pricing
 * This is approximate - actual costs depend on region, VM size, etc.
 */
function estimateCost(durationSeconds: number): number {
  // Assume $0.00023 per second (based on 512MiB VM pricing)
  return durationSeconds * 0.00023;
}

/**
 * Tracker for agent execution limits
 */
export class LimitsTracker {
  private readonly startTime: number;
  private progressSteps: number = 0;

  constructor() {
    this.startTime = Date.now();
  }

  getDurationSeconds(): number {
    return (Date.now() - this.startTime) / 1000;
  }

  getIterations(iterations: number): number {
    return iterations;
  }

  getProgressSteps(): number {
    return this.progressSteps;
  }

  incrementProgress(count: number = 1): void {
    this.progressSteps += count;
  }

  resetProgress(): void {
    this.progressSteps = 0;
  }

  getContext(iterations: number): LimitsContext {
    return {
      iterations: this.getIterations(iterations),
      durationSeconds: this.getDurationSeconds(),
      progressSteps: this.getProgressSteps(),
    };
  }
}
