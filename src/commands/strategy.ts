import type { Logger } from "../logging";
import { loadConfig } from "../config";
import { findRootFromOptions } from "../fs/paths";
import { runAgentUnion } from "../agent/runner";
import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface StrategyOptions {
  cwd?: string;
  force?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
  analyzeDirs?: string[];
}

export async function strategyCommand(
  options: StrategyOptions,
  logger: Logger,
): Promise<void> {
  const root = findRootFromOptions(options);
  const config = await loadConfig(root);

  // Check if ROADMAP.md exists and handle skip/force logic
  const roadmapPath = path.join(root, "ROADMAP.md");
  let roadmapExists = false;
  try {
    await fs.access(roadmapPath);
    roadmapExists = true;
  } catch {
    // ROADMAP.md doesn't exist
  }

  if (roadmapExists && !options.force) {
    logger.info("ROADMAP.md already exists (use --force to overwrite). Skipping.");
    return;
  }

  // Log analyze dirs if specified
  if (options.analyzeDirs && options.analyzeDirs.length > 0) {
    logger.info(`Analyzing dirs: ${options.analyzeDirs.join(", ")}`);
  }

  // Handle dry-run mode
  if (options.dryRun) {
    logger.info("[dry-run] Would generate/update ROADMAP.md");
    return;
  }

  logger.info("Analysing project strategy...");

  // 1. Read Roadmap
  let roadmap = "";
  try {
    roadmap = await fs.readFile(roadmapPath, "utf-8");
  } catch (e) {
    logger.warn("ROADMAP.md not found.");
  }

  // 2. Read Active Items
  let items = "";
  try {
    const itemsDir = path.join(root, ".wreckit", "items");
    const itemDirs = await fs.readdir(itemsDir);
    for (const id of itemDirs) {
        if (id.startsWith(".")) continue;
        try {
            const itemPath = path.join(itemsDir, id, "item.json");
            const itemContent = await fs.readFile(itemPath, "utf-8");
            const item = JSON.parse(itemContent);
            if (item.state !== "done") {
                items += `Item ${item.id} (${item.state}): ${item.title}\n`;
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            logger.debug(`Skipping item ${id}: ${errorMsg}`);
        }
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn(`Failed to read items directory: ${errorMsg}`);
  }

  // 3. Construct Prompt
  const prompt = `You are the CTO of this project.
Your goal is to analyze the current state and recommend the single most important strategic move.

## Context
- The project is a CLI tool called 'wreckit'.
- We follow a strict "Reflexion" pattern (Plan -> Act -> Critique).

## Roadmap
${roadmap.slice(0, 5000)}

## Active Items
${items}

## Task
1. Analyze the roadmap and active items.
2. Evaluate trade-offs for at least 3 potential next steps.
3. Recommend the BEST next step.
4. Output your recommendation in a concise markdown format.
`;

  // 4. Run Agent (Consultant Mode)
  // We use the configured agent (likely 'sprite' or 'claude_sdk').
  // Since this is a read-only analysis, we don't strictly need the sandbox,
  // but we'll use whatever is configured to be consistent.
  const result = await runAgentUnion({
    config: config.agent,
    cwd: root,
    prompt,
    logger,
    onStdoutChunk: (chunk) => process.stdout.write(chunk),
  });

  if (!result.success) {
    logger.error("Strategy analysis failed.");
  }
}