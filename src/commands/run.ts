import * as fs from "node:fs/promises";
import type { Logger } from "../logging";
import type { Item } from "../schemas";
import { findRepoRoot, getItemDir, getResearchPath, getPlanPath, getPrdPath } from "../fs/paths";
import { readItem } from "../fs/json";
import { loadConfig } from "../config";
import { FileNotFoundError, WreckitError } from "../errors";
import {
  runPhaseResearch,
  runPhasePlan,
  runPhaseImplement,
  runPhasePr,
  runPhaseComplete,
  getNextPhase,
  type WorkflowOptions,
} from "../workflow";
import { formatDryRunRun } from "./dryRunFormatter";

export interface RunOptions {
  force?: boolean;
  dryRun?: boolean;
  mockAgent?: boolean;
  onAgentOutput?: (chunk: string) => void;
  cwd?: string;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function phaseArtifactsExist(
  phase: string,
  root: string,
  itemId: string
): Promise<boolean> {
  switch (phase) {
    case "research":
      return fileExists(getResearchPath(root, itemId));
    case "plan": {
      const planExists = await fileExists(getPlanPath(root, itemId));
      const prdExists = await fileExists(getPrdPath(root, itemId));
      return planExists && prdExists;
    }
    case "implement":
    case "pr":
    case "complete":
      return false;
    default:
      return false;
  }
}

export async function runCommand(
  itemId: string,
  options: RunOptions,
  logger: Logger
): Promise<void> {
  const { force = false, dryRun = false, mockAgent = false, onAgentOutput, cwd } = options;

  const root = findRepoRoot(cwd ?? process.cwd());
  const config = await loadConfig(root);

  const itemDir = getItemDir(root, itemId);
  let item: Item;
  try {
    item = await readItem(itemDir);
  } catch (err) {
    if (err instanceof FileNotFoundError) {
      throw new WreckitError(`Item not found: ${itemId}`, "ITEM_NOT_FOUND");
    }
    throw err;
  }

  if (item.state === "done") {
    logger.info(`Item ${itemId} is already done`);
    return;
  }

  const workflowOptions: WorkflowOptions = {
    root,
    config,
    logger,
    force,
    dryRun,
    mockAgent,
    onAgentOutput,
  };

  const phaseRunners = {
    research: runPhaseResearch,
    plan: runPhasePlan,
    implement: runPhaseImplement,
    pr: runPhasePr,
    complete: runPhaseComplete,
  };

  while (true) {
    item = await readItem(itemDir);

    if (item.state === "done") {
      logger.info(`Item ${itemId} completed successfully`);
      return;
    }

    const nextPhase = getNextPhase(item);
    if (!nextPhase) {
      logger.info(`Item ${itemId} is in state '${item.state}' with no next phase`);
      return;
    }

    if (!force && (await phaseArtifactsExist(nextPhase, root, itemId))) {
      logger.info(`Skipping ${nextPhase} phase (artifacts exist, use --force to regenerate)`);
      const runner = phaseRunners[nextPhase];
      const result = await runner(itemId, { ...workflowOptions, force: false });
      if (!result.success) {
        throw new WreckitError(
          result.error ?? `Phase ${nextPhase} failed for ${itemId}`,
          "PHASE_FAILED"
        );
      }
      continue;
    }

    if (dryRun) {
      formatDryRunRun(item, nextPhase, config, logger);
      return;
    }

    logger.info(`Running ${nextPhase} phase on ${itemId}`);
    const runner = phaseRunners[nextPhase];
    const result = await runner(itemId, workflowOptions);

    if (!result.success) {
      throw new WreckitError(
        result.error ?? `Phase ${nextPhase} failed for ${itemId}`,
        "PHASE_FAILED"
      );
    }

    logger.info(`Completed ${nextPhase} phase: ${item.state} → ${result.item.state}`);
  }
}
