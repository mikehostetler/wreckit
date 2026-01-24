import * as fs from "node:fs/promises";
import type { Logger } from "../logging";
import { findRootFromOptions, getRoadmapPath } from "../fs/paths";
import { loadConfig } from "../config";
import {
  parseRoadmap,
  extractPendingObjectives,
  extractAllObjectives,
} from "../domain/roadmap";
import {
  persistItems,
  generateSlug,
  type ParsedIdea,
} from "../domain/ideas";
import { pathExists } from "../fs/util";

export interface ExecuteRoadmapOptions {
  dryRun?: boolean;
  cwd?: string;
  verbose?: boolean;
  includeDone?: boolean;
}

/**
 * Convert active ROADMAP milestones into wreckit Items.
 *
 * This command reads ROADMAP.md, extracts pending objectives from active milestones,
 * and creates wreckit items for each objective. This enables the hierarchical
 * control loop: Strategy -> Plan -> Implement.
 *
 * By default, only unchecked objectives are converted. Use --include-done to
 * include completed objectives as well.
 */
export async function executeRoadmapCommand(
  options: ExecuteRoadmapOptions,
  logger: Logger
): Promise<void> {
  const root = findRootFromOptions(options);
  const roadmapPath = getRoadmapPath(root);

  // Check if ROADMAP.md exists
  if (!(await pathExists(roadmapPath))) {
    throw new Error(
      "ROADMAP.md not found. Run 'wreckit strategy' first to create it."
    );
  }

  // Read and parse ROADMAP.md
  const content = await fs.readFile(roadmapPath, "utf-8");
  const roadmap = parseRoadmap(content);

  // Extract objectives from active milestones
  const objectives = options.includeDone
    ? extractAllObjectives(roadmap)
    : extractPendingObjectives(roadmap);

  if (objectives.length === 0) {
    logger.info(
      options.includeDone
        ? "No objectives found in active milestones"
        : "No pending objectives found in active milestones. All objectives may be completed."
    );
    return;
  }

  // Group objectives by milestone for dependency inference
  const objectivesByMilestone = new Map<string, typeof objectives>();
  for (const obj of objectives) {
    const list = objectivesByMilestone.get(obj.milestoneId) || [];
    list.push(obj);
    objectivesByMilestone.set(obj.milestoneId, list);
  }

  // Convert objectives to ParsedIdea format with campaign and inferred dependencies
  const ideas: ParsedIdea[] = [];

  for (const [milestoneId, milestoneObjectives] of objectivesByMilestone) {
    // Sort by original index to ensure proper ordering for linear dependencies
    const sorted = [...milestoneObjectives].sort((a, b) => (a as any).index - (b as any).index);

    let previousSlug: string | null = null;

    for (const obj of sorted) {
      const currentSlug = generateSlug(obj.objective);
      if (!currentSlug) continue;

      const idea: ParsedIdea = {
        title: obj.objective,
        description: `From milestone [${obj.milestoneId}] ${obj.milestoneTitle}`,
        motivation: `Strategic milestone: ${obj.milestoneTitle}`,
        suggestedSection: "roadmap",
        campaign: obj.milestoneId,
      };

      // Infer dependency on previous objective in same milestone
      if (previousSlug) {
        // Use a special slug-based dependency reference that persistItems will resolve
        idea.dependsOn = [`slug:${previousSlug}`];
      }

      ideas.push(idea);
      previousSlug = currentSlug;
    }
  }

  if (options.dryRun) {
    logger.info(`Would create ${ideas.length} items from ROADMAP.md:`);
    for (const idea of ideas) {
      const slug = generateSlug(idea.title);
      logger.info(`  ${slug} [Campaign: ${idea.campaign}]${idea.dependsOn ? ` (Depends on: ${idea.dependsOn.join(", ")})` : ""}`);
    }
    return;
  }

  // Persist items (handles deduplication via slug matching)
  const result = await persistItems(root, ideas);

  if (result.created.length === 0 && result.skipped.length === 0) {
    logger.info("No items created");
    return;
  }

  if (result.created.length > 0) {
    logger.info(`Created ${result.created.length} items from ROADMAP milestones:`);
    for (const item of result.created) {
      logger.info(`  ${item.id}`);
    }
  }

  if (result.skipped.length > 0) {
    logger.info(`Skipped ${result.skipped.length} existing items:`);
    for (const id of result.skipped) {
      logger.info(`  ${id}`);
    }
  }
}
