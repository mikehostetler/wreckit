import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Item, PriorityHint } from "../schemas";
import { getItemsDir, getItemDir } from "../fs/paths";
import { writeJsonPretty } from "../fs/json";

export interface ParsedIdea {
  /** Short, human-readable summary of the idea */
  title: string;

  /**
   * High-level description of what this idea is about.
   * 1–3 sentences combining what + why at a glance.
   */
  description: string;

  /** Clear articulation of the problem to solve or question to answer */
  problemStatement?: string;

  /** Why this matters / motivation / business or developer value */
  motivation?: string;

  /**
   * Concrete signals of "done" as expressed by the user.
   */
  successCriteria?: string[];

  /**
   * Any technical hints or constraints explicitly mentioned.
   */
  technicalConstraints?: string[];

  /**
   * Scope hints for what is explicitly in / out.
   */
  scope?: {
    inScope?: string[];
    outOfScope?: string[];
  };

  /**
   * Coarse priority/urgency signal extracted from wording.
   */
  priorityHint?: PriorityHint;

  /**
   * Free-form urgency notes (deadlines, "ASAP", "nice to have later", etc.)
   */
  urgencyHint?: string;

  /**
   * Optional hint for where this idea belongs (e.g. "frontend", "infra").
   */
  suggestedSection?: string;

  /**
   * @deprecated Use `description` instead. Kept for backwards compatibility.
   */
  overview?: string;

  /**
   * IDs of other items that this idea depends on.
   * The item will not be processed until all dependencies are complete.
   */
  dependsOn?: string[];

  /**
   * Campaign identifier for grouping related items (e.g., milestone ID like "M1").
   */
  campaign?: string;
}

/**
 * Build a rich overview string from structured ParsedIdea fields.
 * This becomes the item.overview used by research/planning phases.
 */
export function buildOverviewFromParsedIdea(idea: ParsedIdea): string {
  const lines: string[] = [];

  const base = idea.problemStatement || idea.description || idea.overview || "";
  if (base) lines.push(base.trim());

  if (idea.motivation) {
    lines.push("");
    lines.push(`**Motivation:** ${idea.motivation.trim()}`);
  }

  if (idea.successCriteria?.length) {
    lines.push("");
    lines.push("**Success criteria:**");
    for (const c of idea.successCriteria) lines.push(`- ${c}`);
  }

  if (idea.technicalConstraints?.length) {
    lines.push("");
    lines.push("**Technical constraints:**");
    for (const c of idea.technicalConstraints) lines.push(`- ${c}`);
  }

  if (idea.scope?.inScope?.length || idea.scope?.outOfScope?.length) {
    lines.push("");
    if (idea.scope.inScope?.length) {
      lines.push("**In scope:**");
      for (const s of idea.scope.inScope) lines.push(`- ${s}`);
    }
    if (idea.scope.outOfScope?.length) {
      lines.push("**Out of scope:**");
      for (const s of idea.scope.outOfScope) lines.push(`- ${s}`);
    }
  }

  if (idea.priorityHint || idea.urgencyHint) {
    lines.push("");
    const bits: string[] = [];
    if (idea.priorityHint) bits.push(`priority: ${idea.priorityHint}`);
    if (idea.urgencyHint) bits.push(`urgency: ${idea.urgencyHint}`);
    lines.push(`**Signals:** ${bits.join(", ")}`);
  }

  return lines.join("\n").trim();
}

export function parseIdeasFromText(text: string): ParsedIdea[] {
  const ideas: ParsedIdea[] = [];
  const lines = text.split("\n");

  let currentTitle: string | null = null;
  let currentDescription: string[] = [];

  const flushCurrent = () => {
    if (currentTitle) {
      const desc = currentDescription.join("\n").trim();
      ideas.push({
        title: currentTitle,
        description: desc,
        overview: desc, // backwards compat
      });
      currentTitle = null;
      currentDescription = [];
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
        description: "",
        overview: "",
      });
      continue;
    }

    if (currentTitle) {
      currentDescription.push(trimmed);
    } else {
      ideas.push({
        title: trimmed,
        description: "",
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
  slug: string,
  allocatedIds: Set<string> = new Set(),
): Promise<{ id: string; dir: string; number: string }> {
  const itemsDir = getItemsDir(root);

  let maxNumber = 0;

  // 1. Check disk for existing numbers
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

  // 2. Check allocatedIds for higher numbers
  for (const id of allocatedIds) {
    const match = id.match(/^(\d{3})-/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNumber) {
        maxNumber = num;
      }
    }
  }

  const nextNumber = (maxNumber + 1).toString().padStart(3, "0");
  const id = `${nextNumber}-${slug}`;
  const dir = getItemDir(root, id);

  return { id, dir, number: nextNumber };
}

export function createItemFromIdea(id: string, idea: ParsedIdea): Item {
  const now = new Date().toISOString();
  const overview = buildOverviewFromParsedIdea(idea);

  return {
    schema_version: 1,
    id,
    title: idea.title,
    section: idea.suggestedSection,
    state: "idea",
    overview,
    branch: null,
    pr_url: null,
    pr_number: null,
    last_error: null,
    created_at: now,
    updated_at: now,

    // Structured context fields
    problem_statement: idea.problemStatement,
    motivation: idea.motivation,
    success_criteria: idea.successCriteria,
    technical_constraints: idea.technicalConstraints,
    scope_in_scope: idea.scope?.inScope,
    scope_out_of_scope: idea.scope?.outOfScope,
    priority_hint: idea.priorityHint,
    urgency_hint: idea.urgencyHint,

    // Dependency management and campaign grouping
    depends_on: idea.dependsOn,
    campaign: idea.campaign,
  };
}

/**
 * Get a map of all known item slugs to their IDs.
 */
async function getAllKnownItems(root: string): Promise<Map<string, string>> {
  const itemsDir = getItemsDir(root);
  const slugToId = new Map<string, string>();
  try {
    const entries = await fs.readdir(itemsDir);
    for (const entry of entries) {
      // Matches pattern: NUMBER-slug
      const match = entry.match(/^(\d+)-(.+)$/);
      if (match) {
        slugToId.set(match[2], entry);
      }
    }
  } catch {
    // Items dir might not exist
  }
  return slugToId;
}

export async function persistItems(
  root: string,
  ideas: ParsedIdea[],
): Promise<{ created: Item[]; skipped: string[] }> {
  const created: Item[] = [];
  const skipped: string[] = [];

  // 1. Build a map of all known slugs to IDs (existing + new)
  const slugToIdMap = await getAllKnownItems(root);
  const allAllocatedIds = new Set<string>(slugToIdMap.values());

  // Track allocations for second pass
  const allocations: Array<{
    idea: ParsedIdea;
    id: string;
    dir: string;
    slug: string;
  }> = [];

  for (const idea of ideas) {
    const slug = generateSlug(idea.title);

    if (!slug) {
      skipped.push(idea.title || "(empty title)");
      continue;
    }

    // Check if slug is already known
    const existingId = slugToIdMap.get(slug);
    if (existingId) {
      skipped.push(existingId);
      continue;
    }

    // Allocate new ID
    const { id, dir } = await allocateItemId(root, slug, allAllocatedIds);
    allocations.push({ idea, id, dir, slug });

    // Add to map and set so subsequent ideas can depend on this one
    slugToIdMap.set(slug, id);
    allAllocatedIds.add(id);
  }

  // 2. Resolve dependencies and create items
  for (const { idea, id, dir } of allocations) {
    // Resolve slug-based dependencies
    if (idea.dependsOn) {
      idea.dependsOn = idea.dependsOn.map((dep) => {
        if (dep.startsWith("slug:")) {
          const depSlug = dep.slice(5);
          return slugToIdMap.get(depSlug) || dep;
        }
        return dep;
      });
    }

    const item = createItemFromIdea(id, idea);
    await fs.mkdir(dir, { recursive: true });
    await writeJsonPretty(path.join(dir, "item.json"), item);

    created.push(item);
  }

  return { created, skipped };
}

export async function ingestIdeas(
  root: string,
  text: string,
): Promise<{ created: Item[]; skipped: string[] }> {
  const ideas = parseIdeasFromText(text);
  return persistItems(root, ideas);
}
