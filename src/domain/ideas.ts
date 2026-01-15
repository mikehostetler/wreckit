import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Item } from "../schemas";
import { getItemsDir, getItemDir } from "../fs/paths";
import { writeJsonPretty } from "../fs/json";

export interface ParsedIdea {
  title: string;
  overview: string;
  suggestedSection?: string;
}

export function parseIdeasFromText(text: string): ParsedIdea[] {
  const ideas: ParsedIdea[] = [];
  const lines = text.split("\n");

  let currentTitle: string | null = null;
  let currentOverview: string[] = [];

  const flushCurrent = () => {
    if (currentTitle) {
      ideas.push({
        title: currentTitle,
        overview: currentOverview.join("\n").trim(),
      });
      currentTitle = null;
      currentOverview = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      flushCurrent();
      continue;
    }

    const headerMatch = trimmed.match(/^#{1,2}\s+(.+)$/);
    if (headerMatch) {
      flushCurrent();
      currentTitle = headerMatch[1].trim();
      continue;
    }

    const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      flushCurrent();
      ideas.push({
        title: bulletMatch[1].trim(),
        overview: "",
      });
      continue;
    }

    if (currentTitle) {
      currentOverview.push(trimmed);
    } else {
      ideas.push({
        title: trimmed,
        overview: "",
      });
    }
  }

  flushCurrent();

  return ideas;
}

export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

export async function allocateItemId(
  root: string,
  slug: string
): Promise<{ id: string; dir: string; number: string }> {
  const itemsDir = getItemsDir(root);

  let maxNumber = 0;
  try {
    const entries = await fs.readdir(itemsDir);
    for (const entry of entries) {
      const match = entry.match(/^(\d{3})-/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNumber) {
          maxNumber = num;
        }
      }
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
  }

  const nextNumber = (maxNumber + 1).toString().padStart(3, "0");
  const id = `${nextNumber}-${slug}`;
  const dir = getItemDir(root, id);

  return { id, dir, number: nextNumber };
}

export function createItemFromIdea(
  id: string,
  idea: ParsedIdea
): Item {
  const now = new Date().toISOString();

  return {
    schema_version: 1,
    id,
    title: idea.title,
    state: "raw",
    overview: idea.overview,
    branch: null,
    pr_url: null,
    pr_number: null,
    last_error: null,
    created_at: now,
    updated_at: now,
  };
}

async function findExistingItemBySlug(
  root: string,
  slug: string
): Promise<string | null> {
  const itemsDir = getItemsDir(root);
  try {
    const entries = await fs.readdir(itemsDir);
    for (const entry of entries) {
      if (entry.endsWith(`-${slug}`)) {
        return entry;
      }
    }
  } catch {
    // Items dir doesn't exist
  }
  return null;
}

export async function persistItems(
  root: string,
  ideas: ParsedIdea[]
): Promise<{ created: Item[]; skipped: string[] }> {
  const created: Item[] = [];
  const skipped: string[] = [];

  for (const idea of ideas) {
    const slug = generateSlug(idea.title);

    if (!slug) {
      skipped.push(idea.title || "(empty title)");
      continue;
    }

    const existingId = await findExistingItemBySlug(root, slug);
    if (existingId) {
      skipped.push(existingId);
      continue;
    }

    const { id, dir } = await allocateItemId(root, slug);

    const item = createItemFromIdea(id, idea);
    await fs.mkdir(dir, { recursive: true });
    await writeJsonPretty(path.join(dir, "item.json"), item);

    created.push(item);
  }

  return { created, skipped };
}

export async function ingestIdeas(
  root: string,
  text: string
): Promise<{ created: Item[]; skipped: string[] }> {
  const ideas = parseIdeasFromText(text);
  return persistItems(root, ideas);
}
