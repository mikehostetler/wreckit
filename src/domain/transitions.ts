import type { Item } from "../schemas";
import type { ValidationContext } from "./validation";
import { validateTransition } from "./validation";
import { getNextState } from "./states";

export interface TransitionResult {
  nextItem: Item;
  error?: never;
}

export interface TransitionError {
  nextItem?: never;
  error: string;
}

/**
 * Pure function that applies a state transition to an item.
 * - Never mutates the input item
 * - Validates the transition before applying
 * - Returns new Item with updated state and updated_at
 * - Returns error if transition is invalid
 */
export function applyStateTransition(
  item: Readonly<Item>,
  ctx: ValidationContext
): TransitionResult | TransitionError {
  const nextState = getNextState(item.state);

  if (nextState === null) {
    return { error: `Cannot transition from terminal state: ${item.state}` };
  }

  const validation = validateTransition(item.state, nextState, ctx);
  if (!validation.valid) {
    return { error: validation.reason ?? "Transition validation failed" };
  }

  const nextItem: Item = {
    ...item,
    state: nextState,
    updated_at: new Date().toISOString(),
  };

  return { nextItem };
}
