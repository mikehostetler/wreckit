import type {
  ComputeBackend,
  IterationState,
  LogEvent,
} from "../ComputeBackend";
import type { LimitsConfigResolved } from "../../config";
import type { Logger } from "../../logging";

export interface LoopResult {
  reason:
    | "done"
    | "max_iterations"
    | "timeout"
    | "blocked"
    | "budget_exceeded"
    | "no_progress";
  iterations: number;
  error?: string;
  lastState?: IterationState;
}

export interface LoopCallbacks {
  onLogEvent?: (event: LogEvent) => void;
  onNeedsInput?: (question: string) => Promise<string>;
  onIterationStart?: (iteration: number) => void;
  onIterationEnd?: (iteration: number, state: IterationState) => void;
  isWorkComplete?: (itemId: string) => Promise<boolean>;
}

export class ProgressTracker {
  private lastCommitSha: string | null = null;
  private noProgressCount: number = 0;

  checkProgress(state: IterationState): boolean {
    const currentSha = state.summary || null;

    if (currentSha && currentSha !== this.lastCommitSha) {
      this.lastCommitSha = currentSha;
      this.reset();
      return true;
    }

    this.noProgressCount++;
    return false;
  }

  reset(): void {
    this.noProgressCount = 0;
  }

  isStuck(threshold: number): boolean {
    return this.noProgressCount >= threshold;
  }
}

export class SpriteLoop {
  private progressTracker: ProgressTracker;

  constructor(
    private backend: ComputeBackend,
    private limits: LimitsConfigResolved,
    private logger: Logger
  ) {
    this.progressTracker = new ProgressTracker();
  }

  async run(
    itemId: string,
    prompt: string,
    cwd: string,
    callbacks: LoopCallbacks
  ): Promise<LoopResult> {
    const startTime = Date.now();
    let iterations = 0;
    let lastState: IterationState | undefined;

    for (
      iterations = 0;
      iterations < this.limits.max_iterations;
      iterations++
    ) {
      if (this.hasTimeoutExpired(startTime)) {
        return { reason: "timeout", iterations, lastState };
      }

      callbacks.onIterationStart?.(iterations);

      await this.backend.sync("upload", this.getUploadPaths(itemId));

      for await (const event of this.backend.runIteration(itemId, {
        prompt,
        cwd,
        timeoutSeconds: this.calculateRemainingTimeout(startTime),
      })) {
        callbacks.onLogEvent?.(event);
      }

      const state = await this.backend.readState(itemId);
      lastState = state;

      await this.backend.sync("download", this.getDownloadPaths(itemId));

      callbacks.onIterationEnd?.(iterations, state);

      switch (state.status) {
        case "DONE":
          if (await callbacks.isWorkComplete?.(itemId)) {
            return { reason: "done", iterations: iterations + 1, lastState };
          }
          break;

        case "NEEDS_INPUT":
          if (!callbacks.onNeedsInput) {
            return {
              reason: "blocked",
              iterations: iterations + 1,
              error: "No input handler",
              lastState,
            };
          }
          const response = await callbacks.onNeedsInput(
            state.question || "Please provide input"
          );
          await this.backend.writeResponse(itemId, response);
          break;

        case "BLOCKED":
          return {
            reason: "blocked",
            iterations: iterations + 1,
            error: state.error,
            lastState,
          };

        case "CONTINUE":
          if (!this.progressTracker.checkProgress(state)) {
            if (
              this.progressTracker.isStuck(this.limits.no_progress_threshold)
            ) {
              return {
                reason: "no_progress",
                iterations: iterations + 1,
                lastState,
              };
            }
          }
          break;
      }
    }

    return { reason: "max_iterations", iterations, lastState };
  }

  private hasTimeoutExpired(startTime: number): boolean {
    const elapsed = Date.now() - startTime;
    const maxDurationMs = this.limits.max_duration_hours * 60 * 60 * 1000;
    return elapsed >= maxDurationMs;
  }

  private calculateRemainingTimeout(startTime: number): number {
    const elapsed = Date.now() - startTime;
    const maxDurationMs = this.limits.max_duration_hours * 60 * 60 * 1000;
    const remainingMs = Math.max(0, maxDurationMs - elapsed);
    return Math.floor(remainingMs / 1000);
  }

  private getUploadPaths(_itemId: string): string[] {
    return [".wreckit/config.json", ".wreckit/items"];
  }

  private getDownloadPaths(_itemId: string): string[] {
    return [".wreckit/items", ".wreckit/logs"];
  }
}
