import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Logger } from "../logging";
import { findRootFromOptions } from "../fs/paths";
import { loadConfig, type ConfigResolved } from "../config";
import { loadPromptTemplate, renderPrompt, type PromptName } from "../prompts";
import { runAgentUnion, getAgentConfigUnion } from "../agent/runner";
import { getAllowedToolsForPhase } from "../agent/toolAllowlist";
import { scanItems } from "../domain/indexing";
import { persistItems, type ParsedIdea, generateSlug } from "../domain/ideas";
import { createDreamMcpServer } from "../agent/mcp/dreamMcpServer";
import { McpToolNotCalledError } from "../errors";

export interface DreamOptions {
  maxItems?: number;
  source?: string;
  dryRun?: boolean;
  cwd?: string;
  verbose?: boolean;
}

/**
 * Calculate string similarity using Jaro-Winkler distance.
 * Returns 0-1 score where 1.0 is identical.
 */
export function calculateSimilarity(s1: string, s2: string): number {
  const normalize = (s: string) =>
    s
      .replace(/^\[DREAMER\]\s*/i, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  const n1 = normalize(s1);
  const n2 = normalize(s2);

  if (n1 === n2) return 1.0;

  // Simple Jaro distance
  const matchDistance = Math.floor(Math.max(n1.length, n2.length) / 2) - 1;
  if (matchDistance < 0) return 0;

  const n1Matches = new Array(n1.length).fill(false);
  const n2Matches = new Array(n2.length).fill(false);

  let matches = 0;
  for (let i = 0; i < n1.length; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, n2.length);

    for (let j = start; j < end; j++) {
      if (n2Matches[j] || n1[i] !== n2[j]) continue;
      n1Matches[i] = true;
      n2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < n1.length; i++) {
    if (!n1Matches[i]) continue;
    while (!n2Matches[k]) k++;
    if (n1[i] !== n2[k]) transpositions++;
    k++;
  }

  const jaro =
    (matches / n1.length +
      matches / n2.length +
      (matches - transpositions / 2) / matches) /
    3;

  // Jaro-Winkler adjustment for common prefix
  let prefix = 0;
  for (let i = 0; i < Math.min(n1.length, n2.length, 4); i++) {
    if (n1[i] === n2[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

/**
 * Check if an idea is too similar to an existing item.
 * Returns true if similarity threshold is exceeded (0.85 = 85% similar).
 */
function isTooSimilarToExisting(
  idea: ParsedIdea,
  existingItems: any[],
  dreamerSlugs: Set<string>,
  logger: Logger,
): boolean {
  const ideaSlug = generateSlug(idea.title);

  // Exact match check
  if (dreamerSlugs.has(ideaSlug)) {
    logger.debug(`Skipping exact duplicate: ${idea.title}`);
    return true;
  }

  // Similarity check (excluding [DREAMER] prefix for comparison)
  const ideaTitleWithoutPrefix = idea.title
    .replace(/^\\\[DREAMER\\\\]\\s*/, "")
    .toLowerCase();

  for (const item of existingItems) {
    const itemTitleWithoutPrefix = item.title
      .replace(/^\\\[DREAMER\\\\]\\s*/, "")
      .toLowerCase();
    const similarity = calculateSimilarity(
      ideaTitleWithoutPrefix,
      itemTitleWithoutPrefix,
    );

    if (similarity >= 0.85) {
      logger.info(
        `Skipping similar item: "${idea.title}" is ${Math.round(similarity * 100)}% similar to existing "${item.title}"`,
      );
      return true;
    }
  }

  return false;
}

/**
 * Validate that an idea includes sufficient evidence.
 * Ideas must reference specific files and ideally line numbers.
 */
function hasSufficientEvidence(idea: ParsedIdea, logger: Logger): boolean {
  const text = JSON.stringify(idea);

  // Check for file path patterns (e.g., src/file.ts or src\file.ts)
  const hasFilePath =
    /src\/[\/\\]?[\w.]+\.[:\w]+/.test(text) ||
    /\w+\.(ts|js|tsx|jsx|md|json):?\d*/.test(text);

  if (!hasFilePath) {
    logger.warn(`Idea lacks evidence (file:line reference): "${idea.title}"`);
    return false;
  }

  return true;
}

/**
 * Filter out items that were likely created by the Dreamer to prevent infinite loops.
 *
 * We use three strategies:
 * 1. Title contains "[DREAMER]" prefix
 * 2. Created timestamp is very recent (last hour)
 * 3. Item ID number is >= current run's starting point
 */
async function filterDreamerItems(
  root: string,
  allItems: any[],
  logger: Logger,
): Promise<Set<string>> {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const dreamerSlugs = new Set<string>();

  // Get max current item number
  let maxNumber = 0;
  for (const item of allItems) {
    const match = item.id.match(/^(\d+)-/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNumber) maxNumber = num;
    }
  }

  for (const item of allItems) {
    // Strategy 1: Check for [DREAMER] prefix in title
    if (item.title.includes("[DREAMER]")) {
      dreamerSlugs.add(generateSlug(item.title));
      logger.debug(`Filtered dreamer item by title: ${item.id}`);
      continue;
    }

    // Strategy 2: Check for recent creation timestamp
    const createdAt = new Date(item.created_at);
    if (createdAt > oneHourAgo) {
      dreamerSlugs.add(generateSlug(item.title));
      logger.debug(`Filtered recent item: ${item.id} (${item.created_at})`);
      continue;
    }

    // Strategy 3: Check if item number is >= current max
    // This catches items created in the current run before filtering
    const match = item.id.match(/^(\d+)-/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num >= maxNumber) {
        dreamerSlugs.add(generateSlug(item.title));
        logger.debug(`Filtered high-number item: ${item.id}`);
      }
    }
  }

  if (dreamerSlugs.size > 0) {
    logger.info(
      `Filtered out ${dreamerSlugs.size} dreamer-generated items to prevent loops`,
    );
  }

  return dreamerSlugs;
}

/**
 * Run the Dreamer agent to autonomously identify opportunities in the codebase.
 *
 * The Dreamer scans for TODOs, FIXMEs, technical debt, and architectural gaps,
 * then generates new roadmap items to address them.
 */
export async function dreamCommand(
  options: DreamOptions,
  logger: Logger,
): Promise<void> {
  const root = findRootFromOptions(options);
  const config = await loadConfig(root);

  const maxItems = options.maxItems || 5;

  // Scan existing items for deduplication and loop prevention
  const allItems = await scanItems(root);
  const dreamerSlugs = await filterDreamerItems(root, allItems, logger);

  // Build summary of existing items for context
  const existingItemsSummary = allItems
    .filter((item) => !dreamerSlugs.has(generateSlug(item.title)))
    .map((item) => `- ${item.id}: ${item.title}`)
    .join("\n");

  if (options.dryRun) {
    logger.info("[dry-run] Would run autonomous ideation");
    logger.info(`  Root: ${root}`);
    logger.info(`  Max items: ${maxItems}`);
    logger.info(`  Source filter: ${options.source || "all"}`);
    logger.info(
      `  Existing items: ${allItems.length - dreamerSlugs.size} (filtered ${dreamerSlugs.size} dreamer items)`,
    );
    return;
  }

  // Build prompt variables for dream phase
  const completionSignal =
    config.agent.kind === "process"
      ? config.agent.completion_signal
      : "<promise>COMPLETE</promise>";

  const variables = {
    id: "dream",
    title: "Autonomous Ideation",
    section: "items",
    overview:
      "Scan codebase for TODOs, FIXMEs, and gaps to generate new roadmap items",
    item_path: root,
    branch_name: "",
    base_branch: config.base_branch,
    completion_signal: completionSignal,
    max_items: maxItems.toString(),
    source_filter: options.source || "all",
    existing_items: existingItemsSummary || "No existing items",
  };

  // Load dream prompt template
  const template = await loadPromptTemplate(root, "dream" as PromptName);
  const prompt = renderPrompt(template, variables);

  const agentConfig = getAgentConfigUnion(config);

  // Capture dream ideas via MCP tool call
  let capturedIdeas: ParsedIdea[] = [];
  const dreamServer = createDreamMcpServer({
    onDreamIdeas: (ideas) => {
      capturedIdeas = ideas;
    },
  });

  logger.info("Running autonomous ideation...");
  if (options.verbose) {
    logger.info(`Scanning for: ${options.source || "all signals"}`);
    logger.info(`Max items to create: ${maxItems}`);
  }

  // Run agent with dream phase tools (read-only + dream MCP tool)
  const result = await runAgentUnion({
    config: agentConfig,
    cwd: root,
    prompt,
    logger,
    dryRun: options.dryRun,
    mockAgent: false,
    timeoutSeconds: config.timeout_seconds,
    mcpServers: { wreckit: dreamServer },
    allowedTools: getAllowedToolsForPhase("dream"),
  });

  if (!result.success) {
    const error = result.timedOut
      ? "Agent timed out during autonomous ideation"
      : `Agent failed with exit code ${result.exitCode}`;
    throw new Error(error);
  }

  // CRITICAL: MCP tool call is REQUIRED - no JSON fallback
  if (capturedIdeas.length === 0) {
    throw new McpToolNotCalledError(
      "Dreamer agent did not call the required MCP tool (save_dream_ideas). " +
        "The agent must use the structured tool call to save ideas. " +
        "This prevents unstructured output that bypasses validation.",
    );
  }

  // Enforce [DREAMER] prefix on all generated ideas
  for (const idea of capturedIdeas) {
    if (!idea.title.startsWith("[DREAMER]")) {
      idea.title = `[DREAMER] ${idea.title}`;
    }
  }

  // Persist items using existing pipeline (includes deduplication)
  const { created, skipped } = await persistItems(root, capturedIdeas);

  logger.info("Autonomous ideation complete.");
  logger.info(`  Generated: ${capturedIdeas.length} ideas`);
  logger.info(`  Created: ${created.length} items`);
  logger.info(`  Skipped: ${skipped.length} duplicates`);

  if (created.length > 0) {
    logger.info(`  New items:`);
    for (const item of created) {
      logger.info(`    - ${item.id}: ${item.title}`);
    }
  }
}
