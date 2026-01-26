import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Logger } from "../logging";
import type { Item } from "../schemas";
import {
  findRootFromOptions,
  getMediaDir,
  getMediaOutputPath,
} from "../fs/paths";
import { loadConfig } from "../config";
import { loadPromptTemplate, renderPrompt } from "../prompts";
import { runAgentUnion, getAgentConfigUnion } from "../agent/runner";
import { getAllowedToolsForPhase } from "../agent/toolAllowlist";
import { loadSkillsForPhase } from "../agent/skillLoader";
import {
  buildJitContext,
  formatContextForPrompt,
} from "../agent/contextBuilder";
import { pathExists } from "../fs/util";
import { scanItems } from "../domain/indexing";
import { resolveId } from "../domain/resolveId";
import { getItemDir, readItem } from "../fs";

export interface SummarizeOptions {
  item?: string;
  phase?: string;
  all?: boolean;
  dryRun?: boolean;
  cwd?: string;
  verbose?: boolean;
}

/**
 * Determine which items to generate videos for based on command options.
 * Pattern from learn.ts:34-76
 */
async function determineSourceItems(
  root: string,
  options: SummarizeOptions,
  logger: Logger,
): Promise<{ items: Item[]; context: string }> {
  const allItems = await scanItems(root);

  // --item <id>: Generate video for specific item
  if (options.item) {
    const resolvedId = await resolveId(root, options.item);
    const itemDir = getItemDir(root, resolvedId);
    const item = await readItem(itemDir);
    logger.info(`Generating video for item: ${resolvedId}`);
    const context = `Source item: ${item.id} - ${item.title}\nState: ${item.state}`;
    return { items: [item], context };
  }

  // --phase <state>: Generate videos for items in specific state
  if (options.phase) {
    const filteredItems = allItems.filter((i) => i.state === options.phase);
    logger.info(
      `Generating videos for ${filteredItems.length} items in state: ${options.phase}`,
    );
    const context = `Source items: ${filteredItems.length} items in state '${options.phase}'`;
    return { items: filteredItems, context };
  }

  // --all: Generate videos for all completed items
  if (options.all) {
    const completedItems = allItems.filter((i) => i.state === "done");
    logger.info(
      `Generating videos for ${completedItems.length} completed items`,
    );
    const context = `Source items: ${completedItems.length} completed items`;
    return { items: completedItems, context };
  }

  // Default: generate videos for most recent 5 completed items
  const completedItems = allItems
    .filter((i) => i.state === "done")
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  const recentItems = completedItems.slice(0, 5);
  logger.info(
    `Generating videos for ${recentItems.length} recent completed items (default)`,
  );
  const context = `Source items: ${recentItems.length} recent completed items`;
  return { items: recentItems, context };
}

/**
 * Run the summarize command to generate 30-second feature visualization videos.
 *
 * The summarize command loads completed items, uses media generation skills
 * (manim-generation, remotion-generation) with JIT context building, and
 * autonomously creates concise visual summaries.
 */
export async function summarizeCommand(
  options: SummarizeOptions,
  logger: Logger,
): Promise<void> {
  const root = findRootFromOptions(options);
  const config = await loadConfig(root);

  // Determine source items
  const { items: sourceItems, context: sourceContext } =
    await determineSourceItems(root, options, logger);

  if (sourceItems.length === 0) {
    logger.warn("No source items found for video generation");
    return;
  }

  // Load media phase skills
  const skillResult = loadSkillsForPhase("media", config.skills);

  if (skillResult.loadedSkillIds.length > 0) {
    logger.info(
      `Loaded media skills: ${skillResult.loadedSkillIds.join(", ")}`,
    );
  } else {
    logger.warn(
      "No media skills loaded - agent will have basic media capabilities",
    );
  }

  // Build prompt variables (will be updated per item)
  const completionSignal =
    config.agent.kind === "process"
      ? config.agent.completion_signal
      : "<promise>COMPLETE</promise>";

  // Create media directory if it doesn't exist
  const mediaDir = getMediaDir(root);
  if (!(await pathExists(mediaDir))) {
    logger.info(`Creating media directory: ${mediaDir}`);
    await fs.mkdir(mediaDir, { recursive: true });
  }

  // Process each item
  for (const item of sourceItems) {
    logger.info(`\n${"=".repeat(60)}`);
    logger.info(`Processing item: ${item.id} - ${item.title}`);
    logger.info(`${"=".repeat(60)}`);

    // Build JIT context for this item
    const context = await buildJitContext(
      skillResult.contextRequirements,
      item,
      config,
      root,
    );
    const skillContext = formatContextForPrompt(context);

    // Build prompt variables for this item
    const variables = {
      id: item.id,
      title: item.title,
      section: item.section ?? "items",
      overview: item.overview || "No overview provided",
      item_path: getItemDir(root, item.id),
      branch_name: item.branch || "",
      base_branch: config.base_branch,
      completion_signal: completionSignal,
      skill_context: skillContext,
    };

    // Load media prompt template
    const template = await loadPromptTemplate(root, "media");
    const prompt = renderPrompt(template, variables);

    // Expected output path for validation
    const expectedOutputPath = getMediaOutputPath(root, item.id);

    if (options.dryRun) {
      logger.info("[dry-run] Would generate video for item");
      logger.info(`  ID: ${item.id}`);
      logger.info(`  Title: ${item.title}`);
      logger.info(`  Expected output: ${expectedOutputPath}`);
      logger.info(
        `  Skills: ${skillResult.loadedSkillIds.join(", ") || "none"}`,
      );
      continue;
    }

    // Run agent with media phase tools (3x timeout for video rendering)
    const result = await runAgentUnion({
      config: getAgentConfigUnion(config),
      cwd: root,
      prompt,
      logger,
      dryRun: options.dryRun,
      mockAgent: false,
      timeoutSeconds: config.timeout_seconds * 3, // 3x timeout for video rendering
      allowedTools: getAllowedToolsForPhase("media"),
    });

    if (!result.success) {
      const error = result.timedOut
        ? "Agent timed out during video generation"
        : `Agent failed with exit code ${result.exitCode}`;
      logger.error(`  Failed to generate video for ${item.id}: ${error}`);
      continue;
    }

    // Validate output video exists
    if (!(await pathExists(expectedOutputPath))) {
      logger.warn(
        `  Agent completed but no video found at ${expectedOutputPath}`,
      );
      logger.warn(`  Agent may have created video at different location`);
      continue;
    }

    // Check file is non-empty
    const stats = await fs.stat(expectedOutputPath);
    if (stats.size === 0) {
      logger.error(`  Video file is empty: ${expectedOutputPath}`);
      continue;
    }

    // Validate file size is reasonable (< 50MB for 30s video)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (stats.size > maxSize) {
      logger.warn(
        `  Video file is very large: ${(stats.size / 1024 / 1024).toFixed(2)}MB`,
      );
    }

    logger.info(`  ✓ Video generated: ${expectedOutputPath}`);
    logger.info(`    Size: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
  }

  logger.info(`\n${"=".repeat(60)}`);
  logger.info("Video generation complete");
  logger.info(`${"=".repeat(60)}`);
}
