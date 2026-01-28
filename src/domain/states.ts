import type { WorkflowState } from "../schemas";

/**
 * The canonical ordering of workflow states.
 *
 * IMPORTANT: This is the source of truth for state ordering. Any changes must be synchronized with:
 * - src/commands/phase.ts:89-96 (stateOrder array in isInvalidTransition)
 * - src/workflow/itemWorkflow.ts:607-626 (getNextPhase switch statement)
 *
 * The state machine follows a linear progression: idea → researched → planned → implementing → critique → in_pr → done
 */
export const WORKFLOW_STATES: WorkflowState[] = [
  "idea",
  "researched",
  "planned",
  "implementing",
  "critique",
  "in_pr",
  "done",
];

export function getStateIndex(state: WorkflowState): number {
  return WORKFLOW_STATES.indexOf(state);
}

/**
 * Returns the next state in the workflow progression.
 *
 * Uses WORKFLOW_STATES to determine the linear state sequence.
 * Returns null for the terminal "done" state.
 *
 * @param current - The current workflow state
 * @returns The next state, or null if at the end of the workflow
 */
export function getNextState(current: WorkflowState): WorkflowState | null {
  const index = getStateIndex(current);
  if (index === -1 || index >= WORKFLOW_STATES.length - 1) {
    return null;
  }
  return WORKFLOW_STATES[index + 1];
}

/**
 * Returns the allowed next states for a given current state.
 *
 * This workflow enforces linear progression - only the immediate next state is allowed.
 * Wrapper around getNextState() that returns an array for API convenience.
 *
 * @param current - The current workflow state
 * @returns Array of allowed next states (will contain 0 or 1 states)
 */
export function getAllowedNextStates(current: WorkflowState): WorkflowState[] {
  const next = getNextState(current);
  return next ? [next] : [];
}

export function isTerminalState(state: WorkflowState): boolean {
  return state === "done";
}
