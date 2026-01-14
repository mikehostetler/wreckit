import type { ViewAdapter, ItemSnapshot } from "./ViewAdapter";
import type { AgentEvent } from "../tui/agentEvents";
import type { WorkflowState } from "../schemas";
import { TuiRunner, type TuiOptions } from "../tui/runner";

export class TuiViewAdapter implements ViewAdapter {
  private runner: TuiRunner;

  constructor(items: ItemSnapshot[], options?: TuiOptions) {
    const tuiItems = items.map((it) => ({
      id: it.id,
      state: it.state,
      title: it.title,
    }));
    this.runner = new TuiRunner(tuiItems, options);
  }

  onItemsChanged(items: ItemSnapshot[]): void {
    this.runner.update({
      items: items.map((it) => ({
        id: it.id,
        state: it.state,
        title: it.title,
        currentStoryId: it.storyId,
      })),
      completedCount: items.filter((it) => it.state === "done").length,
      totalCount: items.length,
    });
  }

  onActiveItemChanged(itemId: string | null): void {
    this.runner.update({ currentItem: itemId });
  }

  onPhaseChanged(phase: WorkflowState | null): void {
    this.runner.update({ currentPhase: phase });
  }

  onIterationChanged(iteration: number, maxIterations: number): void {
    this.runner.update({ currentIteration: iteration, maxIterations });
  }

  onAgentEvent(itemId: string, event: AgentEvent): void {
    this.runner.appendAgentEvent(itemId, event);
  }

  onRunComplete(itemId: string, success: boolean, error?: string): void {
    if (error) {
      this.runner.appendAgentEvent(itemId, { type: "error", message: error });
    }
  }

  start(): void {
    this.runner.start();
  }

  stop(): void {
    this.runner.stop();
  }
}
