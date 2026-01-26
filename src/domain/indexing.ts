import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Item, Index, IndexItem } from "../schemas";
import {
  getWreckitDir,
  getItemsDir,
  getItemDir,
  readItem,
  writeIndex,
} from "../fs";
import { dirExists, checkPathAccess } from "../fs/util";
import {
  FileNotFoundError,
  InvalidJsonError,
  SchemaValidationError,
} from "../errors";

const ITEM_DIR_PATTERN = /^(\d+)-(.+)$/;

export function parseItemId(
  id: string,
): { number: string; slug: string } | null {
  const match = id.match(ITEM_DIR_PATTERN);
  if (!match) return null;

  return {
    number: match[1],
    slug: match[2],
  };
}

export function formatItemId(number: string, slug: string): string {
  return `${number}-${slug}`;
}

export function toIndexItem(item: Item): IndexItem {
  return {
    id: item.id,
    state: item.state,
    title: item.title,
    depends_on: item.depends_on,
  };
}

export function buildIndex(items: Item[]): Index {
  return {
    schema_version: 1,
    items: items.map(toIndexItem),
    generated_at: new Date().toISOString(),
  };
}

export async function scanItems(root: string): Promise<Item[]> {
  const itemsDir = getItemsDir(root);

  let entries: string[];
  try {
    entries = await fs.readdir(itemsDir);
  } catch (err) {
    // ENOENT means items directory doesn't exist yet - expected case
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    // Permission or I/O errors should warn, not silently return empty
    console.warn(
      `Warning: Cannot read items directory ${itemsDir}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }

  const items: Item[] = [];

  for (const itemDirName of entries) {
    if (!ITEM_DIR_PATTERN.test(itemDirName)) continue;

    const itemDirPath = path.join(itemsDir, itemDirName);
    if (!(await dirExists(itemDirPath))) continue;

    try {
      const item = await readItem(itemDirPath);
      items.push(item);
    } catch (err) {
      const itemJsonPath = path.join(itemDirPath, "item.json");
      console.warn(
        `Warning: Skipping invalid item at ${itemJsonPath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return items.sort((a, b) => {
    const aMatch = a.id.match(/^(\d+)-/);
    const bMatch = b.id.match(/^(\d+)-/);
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

export async function getItem(root: string, id: string): Promise<Item | null> {
  const itemDir = getItemDir(root, id);

  try {
    return await readItem(itemDir);
  } catch (err) {
    // Expected "not found" conditions (Spec 002 Gap 3)
    if (err instanceof FileNotFoundError) return null;
    if (err instanceof InvalidJsonError) return null;
    if (err instanceof SchemaValidationError) return null;
    // Unexpected errors - re-throw
    throw err;
  }
}

export async function itemExists(root: string, id: string): Promise<boolean> {
  const itemDir = getItemDir(root, id);
  const itemJsonPath = path.join(itemDir, "item.json");

  // Use error-aware check (Spec 002 Gap 3)
  const check = await checkPathAccess(itemJsonPath);
  if (check.error) {
    // Permission error - throw instead of returning false
    throw check.error;
  }
  return check.exists;
}
