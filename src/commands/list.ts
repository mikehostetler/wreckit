import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Logger } from "../logging";
import type { IndexItem } from "../schemas";
import { findRepoRoot, getWreckitDir } from "../fs/paths";
import { readItem } from "../fs/json";
import { buildIdMap } from "../domain/resolveId";

export interface ListOptions {
  json?: boolean;
  state?: string;
  cwd?: string;
}

function extractTitle(rawTitle: string): string {
  // Try to parse JSON if it looks like JSON
  if (rawTitle.startsWith("{")) {
    try {
      const parsed = JSON.parse(rawTitle);
      if (typeof parsed.title === "string") {
        return parsed.title;
      }
    } catch {
      // Fall through to return raw title
    }
  }
  return rawTitle;
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

export async function listCommand(
  options: ListOptions,
  logger: Logger
): Promise<void> {
  const root = findRepoRoot(options.cwd ?? process.cwd());
  const allItems = await buildIdMap(root);

  const items = options.state
    ? allItems.filter((i) => i.state === options.state)
    : allItems;

  if (options.json) {
    const jsonItems = items.map((i) => ({
      id: i.shortId,
      fullId: i.fullId,
      state: i.state,
      title: i.title,
    }));
    console.log(JSON.stringify(jsonItems, null, 2));
    return;
  }

  if (items.length === 0) {
    console.log("No items found");
    return;
  }

  const stateWidth = Math.max(5, ...items.map((i) => i.state.length));
  
  const cleanItems = items.map((i) => ({
    ...i,
    cleanTitle: extractTitle(i.title),
  }));
  
  const header = `${"#".padStart(3)}  ${"STATE".padEnd(stateWidth)}  TITLE`;
  console.log(header);

  for (const item of cleanItems) {
    const displayTitle = item.cleanTitle.length > 60 
      ? item.cleanTitle.substring(0, 57) + "..."
      : item.cleanTitle;
    const line = `${String(item.shortId).padStart(3)}  ${item.state.padEnd(stateWidth)}  ${displayTitle}`;
    console.log(line);
  }

  console.log("");
  console.log(`Total: ${items.length} item(s)`);
}
