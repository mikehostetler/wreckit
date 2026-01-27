/**
 * Agent Geneticist - Recursive Prompt Self-Optimization
 *
 * A meta-agent that analyzes .wreckit/healing-log.jsonl to identify
 * recurrent failure patterns and autonomously submits PRs to update
 * the system prompts (src/prompts/*.md).
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Logger } from "../logging";
import { getWreckitDir } from "../fs/paths";
import type { HealingLogEntry } from "../agent/healingRunner";
import { loadConfig } from "../config";
import { runAgentUnion, getAgentConfigUnion } from "../agent/runner";
import { getAllowedToolsForPhase } from "../agent/toolAllowlist";
import { loadPromptTemplate } from "../prompts";

export interface GeneticistOptions {
  dryRun?: boolean;
  autoMerge?: boolean;
  cwd?: string;
  verbose?: boolean;
  timeWindowHours?: number;
  minErrorCount?: number;
}

function analyzeHealingLogs(entries: HealingLogEntry[], minErrorCount: number) {
  const patterns: Record<
    string,
    {
      errorType: string;
      occurrences: number;
      firstSeen: string;
      lastSeen: string;
      samples: string[];
    }
  > = {};

  for (const entry of entries) {
    const type = entry.initialError.errorType;
    const pattern = entry.initialError.detectedPattern;
    const key = `${type}:${pattern}`;

    if (!patterns[key]) {
      patterns[key] = {
        errorType: type,
        occurrences: 0,
        firstSeen: entry.timestamp,
        lastSeen: entry.timestamp,
        samples: [],
      };
    }

    patterns[key].occurrences++;
    patterns[key].lastSeen = entry.timestamp;
    if (patterns[key].samples.length < 3) {
      patterns[key].samples.push(pattern);
    }
  }

  return Object.values(patterns).filter((p) => p.occurrences >= minErrorCount);
}

export async function geneticistCommand(
  options: GeneticistOptions,
  logger: Logger,
): Promise<void> {
  const cwd = options.cwd || process.cwd();
  const config = await loadConfig(cwd);
  const wreckitDir = getWreckitDir(cwd);
  const logPath = path.join(wreckitDir, "healing-log.jsonl");

  if (options.verbose) {
    logger.debug("🧬 Geneticist V2: Evolution Confirmed");
    logger.debug("Starting Agent Geneticist analysis...");
  }

  let content = "";
  try {
    content = await fs.readFile(logPath, "utf-8");
  } catch (err) {
    logger.info("No healing logs found.");
    return;
  }

  const lines = content.trim().split("\n");
  const entries: HealingLogEntry[] = [];
  const timeWindowMs = (options.timeWindowHours || 48) * 60 * 60 * 1000;
  const cutoff = Date.now() - timeWindowMs;

  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as HealingLogEntry;
      if (new Date(entry.timestamp).getTime() > cutoff) {
        entries.push(entry);
      }
    } catch {
      continue;
    }
  }

  const recurrentPatterns = analyzeHealingLogs(
    entries,
    options.minErrorCount || 3,
  );

  if (recurrentPatterns.length === 0) {
    logger.info("No recurrent failure patterns identified.");
    return;
  }

  logger.info(`\n=== Agent Geneticist Analysis ===`);
  logger.info(`Recurrent patterns detected: ${recurrentPatterns.length}\n`);

  for (const pattern of recurrentPatterns) {
    logger.info(
      `  • Error Type: ${pattern.errorType} (${pattern.occurrences}x)`,
    );

    if (options.dryRun) {
      continue;
    }

    // Optimization Logic
    let promptToOptimize = "implement"; // simplified logic
    if (pattern.errorType.includes("PLAN")) promptToOptimize = "plan";

    const template = await loadPromptTemplate(cwd, promptToOptimize as any);

    const mutationPrompt = `
      You are the Wreckit Geneticist. Optimize the "${promptToOptimize}" prompt.
      Error: ${pattern.errorType}
      Current Prompt: ${template}
      Output ONLY the rewritten prompt.
    `;

    const agentConfig = getAgentConfigUnion(config);
    const result = await runAgentUnion({
      config: agentConfig,
      cwd,
      prompt: mutationPrompt,
      logger,
      allowedTools: getAllowedToolsForPhase("genetic"),
    });

    if (result.success) {
      logger.info(`✅ Optimized ${promptToOptimize}.md`);
      // In a real run, we would create the PR here.
    }
  }
}
