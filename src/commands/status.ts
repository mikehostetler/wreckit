import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Logger } from "../logging";
import type { Index, IndexItem, Item } from "../schemas";
import { findRepoRoot, findRootFromOptions, getWreckitDir } from "../fs/paths";
import { readItem } from "../fs/json";
import { buildIdMap } from "../domain/resolveId";

export interface StatusOptions {
  json?: boolean;
  cwd?: string;
}

export async function scanItems(root: string): Promise<IndexItem[]> {
  const wreckitDir = getWreckitDir(root);
  const items: IndexItem[] = [];

  let sections: string[];
  try {
    const entries = await fs.readdir(wreckitDir, { withFileTypes: true });
    sections = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith(".") && e.name !== "prompts")
      .map((e) => e.name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }

  for (const section of sections) {
    const sectionDir = path.join(wreckitDir, section);
    let itemDirs: string[];
    try {
      const entries = await fs.readdir(sectionDir, { withFileTypes: true });
      itemDirs = entries
        .filter((e) => e.isDirectory() && /^\d{3}-/.test(e.name))
        .map((e) => e.name);
    } catch {
      continue;
    }

    for (const itemDir of itemDirs) {
      const itemPath = path.join(sectionDir, itemDir);
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
