import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Item, Index, IndexItem } from "../schemas";
import { ItemSchema } from "../schemas";
import {
  getWreckitDir,
  getItemDir,
  readItem,
  writeIndex,
} from "../fs";
import { dirExists } from "../fs/util";

const RESERVED_DIRS = new Set(["prompts"]);
const ITEM_DIR_PATTERN = /^(\d+)-(.+)$/;

export function parseItemId(
  id: string
): { section: string; slug: string; number: string } | null {
  const parts = id.split("/");
  if (parts.length !== 2) return null;

  const [section, dirName] = parts;
  const match = dirName.match(ITEM_DIR_PATTERN);
  if (!match) return null;

  return {
    section,
    number: match[1],
    slug: match[2],
  };
}

export function formatItemId(
  section: string,
  number: string,
  slug: string
): string {
  return `${section}/${number}-${slug}`;
}

export function toIndexItem(item: Item): IndexItem {
  return {
    id: item.id,
    state: item.state,
    title: item.title,
  };
}

export function buildIndex(items: Item[]): Index {
  return {
    schema_version: 1,
    items: items.map(toIndexItem),
    generated_at: new Date().toISOString(),
  };
}

export async function listSections(root: string): Promise<string[]> {
  const wreckitDir = getWreckitDir(root);
  let entries: string[];

  try {
    entries = await fs.readdir(wreckitDir);
  } catch {
    return [];
  }

  const sections: string[] = [];

  for (const entry of entries) {
    if (RESERVED_DIRS.has(entry)) continue;
    if (entry.endsWith(".json")) continue;

    const entryPath = path.join(wreckitDir, entry);
    if (!(await dirExists(entryPath))) continue;

    const subEntries = await fs.readdir(entryPath);
    const hasItemDirs = subEntries.some((sub) => ITEM_DIR_PATTERN.test(sub));
    if (hasItemDirs) {
      sections.push(entry);
    }
  }

  return sections.sort();
}

export async function scanItems(root: string): Promise<Item[]> {
  const wreckitDir = getWreckitDir(root);
  let entries: string[];

  try {
    entries = await fs.readdir(wreckitDir);
  } catch {
    return [];
  }

  const items: Item[] = [];

  for (const sectionName of entries) {
    if (RESERVED_DIRS.has(sectionName)) continue;
    if (sectionName.endsWith(".json")) continue;

    const sectionPath = path.join(wreckitDir, sectionName);
    if (!(await dirExists(sectionPath))) continue;

    const itemDirs = await fs.readdir(sectionPath);

    for (const itemDirName of itemDirs) {
      if (!ITEM_DIR_PATTERN.test(itemDirName)) continue;

      const itemDirPath = path.join(sectionPath, itemDirName);
      if (!(await dirExists(itemDirPath))) continue;

      const itemJsonPath = path.join(itemDirPath, "item.json");

      try {
        const item = await readItem(itemDirPath);
        items.push(item);
      } catch (err) {
        console.warn(
          `Warning: Skipping invalid item at ${itemJsonPath}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  return items.sort((a, b) => {
    if (a.section !== b.section) {
      return a.section.localeCompare(b.section);
    }
    const aMatch = a.id.match(/\/(\d+)-/);
    const bMatch = b.id.match(/\/(\d+)-/);
    const aNum = aMatch ? parseInt(aMatch[1], 10) : 0;
    const bNum = bMatch ? parseInt(bMatch[1], 10) : 0;
    return aNum - bNum;
  });
}

export async function refreshIndex(root: string): Promise<Index> {
  const items = await scanItems(root);
  const index = buildIndex(items);
  await writeIndex(root, index);
  return index;
}

export async function getItem(
  root: string,
  id: string
): Promise<Item | null> {
  const itemDir = getItemDir(root, id);

  try {
    return await readItem(itemDir);
  } catch {
    return null;
  }
}

export async function itemExists(root: string, id: string): Promise<boolean> {
  const itemDir = getItemDir(root, id);
  const itemJsonPath = path.join(itemDir, "item.json");

  try {
    await fs.access(itemJsonPath);
    return true;
  } catch {
    return false;
  }
}
