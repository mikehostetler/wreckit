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

  // Convert objectives to ParsedIdea format
  const ideas: ParsedIdea[] = objectives.map((obj) => ({
    title: obj.objective,
    description: `From milestone [${obj.milestoneId}] ${obj.milestoneTitle}`,
    motivation: `Strategic milestone: ${obj.milestoneTitle}`,
    suggestedSection: "roadmap",
  }));

  if (options.dryRun) {
    logger.info(`Would create ${ideas.length} items from ROADMAP.md:`);
    for (const idea of ideas) {
      const slug = generateSlug(idea.title);
      if (slug) {
        logger.info(`  XXX-${slug}`);
      }
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
