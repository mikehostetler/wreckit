import type { Logger } from "../logging";
import type { WorkflowState } from "../schemas";
import { findRepoRoot, findRootFromOptions, getItemDir } from "../fs/paths";
import { readItem } from "../fs/json";
import { loadConfig } from "../config";
import { FileNotFoundError, WreckitError } from "../errors";
import {
  runPhaseResearch,
  runPhasePlan,
  runPhaseImplement,
  runPhasePr,
  runPhaseComplete,
  type PhaseResult,
  type WorkflowOptions,
} from "../workflow";
import { formatDryRunPhase } from "./dryRunFormatter";

export type Phase = "research" | "plan" | "implement" | "pr" | "complete";

export interface PhaseOptions {
  force?: boolean;
  dryRun?: boolean;
  cwd?: string;
}

/**
 * Configuration mapping phases to their required and target states.
 *
 * Each phase specifies:
 * - requiredState: The state(s) an item must be in to run this phase
 * - targetState: The state the item will be in after successful phase completion
 * - skipIfInTarget: Whether to skip execution if already in target state
 * - runFn: The workflow function that implements the phase
 *
 * NOTE: Phase names and state mappings have a bidirectional relationship with getNextPhase() in
 * src/workflow/itemWorkflow.ts:607-626. Changes here may require updates there.
 */
const PHASE_CONFIG: Record<
  Phase,
  {
    requiredState: WorkflowState | WorkflowState[];
    targetState: WorkflowState;
    skipIfInTarget: boolean;
    runFn: (itemId: string, options: WorkflowOptions) => Promise<PhaseResult>;
  }
> = {
  research: {
    requiredState: "raw",
    targetState: "researched",
    skipIfInTarget: true,
    runFn: runPhaseResearch,
  },
  plan: {
    requiredState: "researched",
    targetState: "planned",
    skipIfInTarget: true,
    runFn: runPhasePlan,
  },
  implement: {
    requiredState: ["planned", "implementing"],
    targetState: "implementing",
    skipIfInTarget: false,
    runFn: runPhaseImplement,
  },
  pr: {
    requiredState: "implementing",
    targetState: "in_pr",
    skipIfInTarget: true,
    runFn: runPhasePr,
  },
  complete: {
    requiredState: "in_pr",
    targetState: "done",
    skipIfInTarget: true,
    runFn: runPhaseComplete,
  },
};

function isInRequiredState(
  currentState: WorkflowState,
  required: WorkflowState | WorkflowState[]
): boolean {
  if (Array.isArray(required)) {
    return required.includes(currentState);
  }
  return currentState === required;
}

function isInTargetState(
  currentState: WorkflowState,
  targetState: WorkflowState
): boolean {
  return currentState === targetState;
}

/**
 * Validates whether a phase transition would be invalid.
 *
 * A transition is invalid if:
 * 1. The current state is "done" (terminal) and phase is not "complete"
 * 2. The current state index is greater than the target state index (backward transition)
 *
 * Uses a local stateOrder array - must stay synchronized with WORKFLOW_STATES in src/domain/states.ts:3-10
 *
 * @param phase - The phase being executed
 * @param currentState - The item's current workflow state
 * @returns true if the transition should be blocked
 */
function isInvalidTransition(
  phase: Phase,
  currentState: WorkflowState
): boolean {
  const config = PHASE_CONFIG[phase];
  // IMPORTANT: This array MUST match WORKFLOW_STATES in src/domain/states.ts:3-10
  // This is a local duplicate for encapsulation - update both locations if state ordering changes
  const stateOrder: WorkflowState[] = [
    "raw",
    "researched",
    "planned",
    "implementing",
    "in_pr",
    "done",
  ];

  const currentIndex = stateOrder.indexOf(currentState);
  const targetIndex = stateOrder.indexOf(config.targetState);

  if (currentState === "done" && phase !== "complete") {
    return true;
  }

  if (currentIndex > targetIndex) {
    return true;
  }

  return false;
}

export async function runPhaseCommand(
  phase: Phase,
  itemId: string,
  options: PhaseOptions,
  logger: Logger
): Promise<void> {
  const { force = false, dryRun = false, cwd } = options;

  const root = findRootFromOptions(options);
  const config = await loadConfig(root);

  const itemDir = getItemDir(root, itemId);
  let item;
  try {
    item = await readItem(itemDir);
  } catch (err) {
    if (err instanceof FileNotFoundError) {
      throw new WreckitError(`Item not found: ${itemId}`, "ITEM_NOT_FOUND");
    }
    throw err;
  }

  const phaseConfig = PHASE_CONFIG[phase];

  if (isInvalidTransition(phase, item.state)) {
    throw new WreckitError(
      `Cannot run ${phase} on item in state '${item.state}' - invalid transition`,
      "INVALID_TRANSITION"
    );
  }

  if (!force && phaseConfig.skipIfInTarget && isInTargetState(item.state, phaseConfig.targetState)) {
    logger.info(
      `Item ${itemId} is already in state '${item.state}', skipping (use --force to override)`
    );
    return;
  }

  if (
    !force &&
    !isInRequiredState(item.state, phaseConfig.requiredState) &&
    !isInTargetState(item.state, phaseConfig.targetState)
  ) {
    const requiredStr = Array.isArray(phaseConfig.requiredState)
      ? phaseConfig.requiredState.join("' or '")
      : phaseConfig.requiredState;
    throw new WreckitError(
      `Item is in state '${item.state}', expected '${requiredStr}' for ${phase} phase`,
      "INVALID_STATE"
    );
  }

  if (dryRun) {
    formatDryRunPhase(phase, item, phaseConfig.targetState, config, logger);
    return;
  }

  const workflowOptions: WorkflowOptions = {
    root,
    config,
    logger,
    force,
    dryRun,
  };

  const result = await phaseConfig.runFn(itemId, workflowOptions);

  if (result.success) {
    console.log(
      `Successfully ran ${phase} phase on ${itemId}: ${item.state} → ${result.item.state}`
    );
  } else {
    throw new WreckitError(
      result.error ?? `Phase ${phase} failed for ${itemId}`,
      "PHASE_FAILED"
    );
  }
}
