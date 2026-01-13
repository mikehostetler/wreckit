import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Logger } from "../logging";
import type { Item, Prd } from "../schemas";
import { PrdSchema } from "../schemas";
import { findRepoRoot, getItemDir, getResearchPath, getPlanPath, getPrdPath } from "../fs/paths";
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

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function loadItemDetails(root: string, id: string): Promise<ItemDetails> {
  const itemDir = getItemDir(root, id);
  const item = await readItem(itemDir);

  const hasResearch = await fileExists(getResearchPath(root, id));
  const hasPlan = await fileExists(getPlanPath(root, id));

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
  const root = findRepoRoot(options.cwd ?? process.cwd());

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

  if (item.last_error) {
    logger.info(`Last Error: ${item.last_error}`);
  }
}
