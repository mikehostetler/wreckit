import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Logger } from "../logging";
import type { Item, Prd } from "../schemas";
import { PrdSchema } from "../schemas";
import { findRepoRoot, findRootFromOptions, getItemDir, getResearchPath, getPlanPath, getPrdPath } from "../fs/paths";
import { checkPathAccess } from "../fs/util";
import { readItem, readJsonWithSchema } from "../fs/json";
import { FileNotFoundError } from "../errors";

export interface ShowOptions {
  json?: boolean;
  cwd?: string;
}

export interface ItemDetails {
  item: Item;
  hasResearch: boolean;
  hasPlan: boolean;
  prd: Prd | null;
}

export async function loadItemDetails(root: string, id: string): Promise<ItemDetails> {
  const itemDir = getItemDir(root, id);
  const item = await readItem(itemDir);

  // Use error-aware checks for artifact presence (Spec 002 Gap 3)
  const researchCheck = await checkPathAccess(getResearchPath(root, id));
  const planCheck = await checkPathAccess(getPlanPath(root, id));

  if (researchCheck.error) {
    throw researchCheck.error;
  }
  if (planCheck.error) {
    throw planCheck.error;
  }

  const hasResearch = researchCheck.exists;
  const hasPlan = planCheck.exists;

  let prd: Prd | null = null;
  try {
    prd = await readJsonWithSchema(getPrdPath(root, id), PrdSchema);
  } catch {
    // prd.json doesn't exist or is invalid
  }

  return { item, hasResearch, hasPlan, prd };
}

export async function showCommand(
  id: string,
  options: ShowOptions,
  logger: Logger
): Promise<void> {
  const root = findRootFromOptions(options);

  let details: ItemDetails;
  try {
    details = await loadItemDetails(root, id);
  } catch (err) {
    if (err instanceof FileNotFoundError) {
      throw new FileNotFoundError(`Item not found: ${id}`);
    }
    throw err;
  }

  const { item, hasResearch, hasPlan, prd } = details;

  if (options.json) {
    const output = {
      ...item,
      artifacts: {
        research: hasResearch,
        plan: hasPlan,
        prd: prd ?? undefined,
      },
    };
    logger.json(output);
    return;
  }

  logger.info(`ID: ${item.id}`);
  logger.info(`Title: ${item.title}`);
  logger.info(`State: ${item.state}`);

  if (item.overview) {
    logger.info(`Overview: ${item.overview}`);
  }

  logger.info("");
  logger.info(`Research: ${hasResearch ? "✓" : "✗"}`);
  logger.info(`Plan: ${hasPlan ? "✓" : "✗"}`);

  if (prd) {
    const pending = prd.user_stories.filter((s) => s.status === "pending").length;
    const done = prd.user_stories.filter((s) => s.status === "done").length;
    logger.info(`Stories: ${pending} pending, ${done} done`);
  } else {
    logger.info("Stories: -");
  }

  if (item.branch) {
    logger.info(`Branch: ${item.branch}`);
  }

  if (item.pr_url) {
    logger.info(`PR: ${item.pr_url}`);
  }

  if (item.rollback_sha) {
    logger.info(`Rollback SHA: ${item.rollback_sha}`);
  }

  if (item.completed_at) {
    logger.info(`Completed: ${item.completed_at}`);
  }

  if (item.last_error) {
    logger.info(`Last Error: ${item.last_error}`);
  }
}
