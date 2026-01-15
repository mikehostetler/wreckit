import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Logger } from "../logging";
import type { Index, IndexItem, Item } from "../schemas";
import { findRepoRoot, findRootFromOptions, getItemsDir } from "../fs/paths";
import { readItem } from "../fs/json";
import { buildIdMap } from "../domain/resolveId";

export interface StatusOptions {
  json?: boolean;
  cwd?: string;
}

const ITEM_DIR_PATTERN = /^\d{3}-/;

export async function scanItems(root: string): Promise<IndexItem[]> {
  const itemsDir = getItemsDir(root);
  const items: IndexItem[] = [];

  let itemDirs: string[];
  try {
    const entries = await fs.readdir(itemsDir, { withFileTypes: true });
    itemDirs = entries
      .filter((e) => e.isDirectory() && ITEM_DIR_PATTERN.test(e.name))
      .map((e) => e.name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }

  for (const itemDir of itemDirs) {
    const itemPath = path.join(itemsDir, itemDir);
    try {
      const item = await readItem(itemPath);
      items.push({
        id: item.id,
        state: item.state,
        title: item.title,
      });
    } catch {
      // Skip invalid items
    }
  }

  items.sort((a, b) => a.id.localeCompare(b.id));
  return items;
}

export async function statusCommand(
  options: StatusOptions,
  logger: Logger
): Promise<void> {
  const root = findRootFromOptions(options);
  const items = await buildIdMap(root);

  if (options.json) {
    const jsonItems = items.map((i) => ({
      id: i.shortId,
      fullId: i.fullId,
      state: i.state,
      title: i.title,
    }));
    logger.json({ schema_version: 1, items: jsonItems, generated_at: new Date().toISOString() });
    return;
  }

  if (items.length === 0) {
    console.log("No items found");
    return;
  }

  const header = `${"#".padStart(3)}  STATE`;
  console.log(header);

  for (const item of items) {
    const line = `${String(item.shortId).padStart(3)}  ${item.state}`;
    console.log(line);
  }
}
