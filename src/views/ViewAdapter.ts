import type { AgentEvent } from "../tui/agentEvents";
import type { WorkflowState } from "../schemas";

export interface ViewAdapter {
  onItemsChanged(items: ItemSnapshot[]): void;
  onActiveItemChanged(itemId: string | null): void;
  onPhaseChanged(phase: WorkflowState | null): void;
  onIterationChanged(iteration: number, maxIterations: number): void;
  onAgentEvent(itemId: string, event: AgentEvent): void;
  onRunComplete(itemId: string, success: boolean, error?: string): void;
  start(): void;
  stop(): void;
}

export interface ItemSnapshot {
  id: string;
  title: string;
  state: WorkflowState;
  storyId?: string;
}
