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
import { getWreckitDir, getPromptsDir } from "../fs/paths";
import type { HealingLogEntry } from "../agent/healingRunner";
import type { ErrorType } from "../agent/errorDetector";
import { loadConfig } from "../config";
import { runAgentUnion, getAgentConfigUnion } from "../agent/runner";
import { getAllowedToolsForPhase } from "../agent/toolAllowlist";
import { loadPromptTemplate, type PromptName } from "../prompts";
import { ensureBranch, commitAll, pushBranch } from "../git/branch";
import { createOrUpdatePr } from "../git/pr";

export interface GeneticistOptions {
  dryRun?: boolean;
  autoMerge?: boolean;
  cwd?: string;
  verbose?: boolean;
  timeWindowHours?: number;
  minErrorCount?: number;
}

/**
 * Enhanced error pattern with clustering and prompt mapping
 */
interface EnhancedErrorPattern {
  errorType: ErrorType;
  detectedPattern: string;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  samples: string[];
  /** Mapped prompt names that should be optimized for this pattern */
  targetPrompts: PromptName[];
  /** Clustered category for grouping similar patterns */
  category: string;
}

/**
 * Result of a prompt optimization
 */
interface OptimizationResult {
  promptName: PromptName;
  originalPrompt: string;
  optimizedPrompt: string;
  validationPassed: boolean;
  validationErrors: string[];
}

/**
 * Analyze healing logs and cluster error patterns
 */
function analyzeHealingLogs(
  entries: HealingLogEntry[],
  minErrorCount: number,
): EnhancedErrorPattern[] {
  const patterns: Record<string, EnhancedErrorPattern> = {};

  for (const entry of entries) {
    const type = entry.initialError.errorType as ErrorType;
    const pattern = entry.initialError.detectedPattern;
    const key = `${type}:${pattern}`;

    if (!patterns[key]) {
      patterns[key] = {
        errorType: type,
        detectedPattern: pattern,
        occurrences: 0,
        firstSeen: entry.timestamp,
        lastSeen: entry.timestamp,
        samples: [],
        targetPrompts: mapErrorTypeToPrompts(type, pattern),
        category: categorizeErrorPattern(type, pattern),
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

/**
 * Map error types to the prompts that likely need optimization
 */
function mapErrorTypeToPrompts(
  errorType: ErrorType,
  pattern: string,
): PromptName[] {
  const targets: PromptName[] = [];

  // Git lock errors often indicate unclear git instructions in implement phase
  if (errorType === "git_lock") {
    targets.push("implement");
    // Also consider plan if it mentions git operations
    if (pattern.toLowerCase().includes("plan")) {
      targets.push("plan");
    }
  }

  // NPM failures often indicate missing environment setup in plan
  if (errorType === "npm_failure") {
    targets.push("plan");
    targets.push("implement");
  }

  // JSON corruption may indicate insufficient validation in implement
  if (errorType === "json_corruption") {
    targets.push("implement");
  }

  // If pattern explicitly mentions a phase, prioritize that
  const patternLower = pattern.toLowerCase();
  if (patternLower.includes("plan") || patternLower.includes("planning")) {
    if (!targets.includes("plan")) {
      targets.push("plan");
    }
  }
  if (
    patternLower.includes("implement") ||
    patternLower.includes("implementation")
  ) {
    if (!targets.includes("implement")) {
      targets.push("implement");
    }
  }
  if (patternLower.includes("research")) {
    targets.push("research");
  }

  // Default to implement if no specific mapping found
  if (targets.length === 0) {
    targets.push("implement");
  }

  return targets;
}

/**
 * Categorize error patterns for grouping
 */
function categorizeErrorPattern(errorType: ErrorType, pattern: string): string {
  const patternLower = pattern.toLowerCase();

  if (errorType === "git_lock") return "git";
  if (errorType === "npm_failure") return "npm";
  if (errorType === "json_corruption") return "json";

  // Try to categorize by pattern content
  if (patternLower.includes("git")) return "git";
  if (patternLower.includes("npm") || patternLower.includes("install")) {
    return "npm";
  }
  if (patternLower.includes("json")) return "json";

  return "other";
}

/**
 * Group patterns by target prompt to optimize each prompt once
 */
function groupPatternsByPrompt(
  patterns: EnhancedErrorPattern[],
): Map<PromptName, EnhancedErrorPattern[]> {
  const grouped = new Map<PromptName, EnhancedErrorPattern[]>();

  for (const pattern of patterns) {
    for (const promptName of pattern.targetPrompts) {
      if (!grouped.has(promptName)) {
        grouped.set(promptName, []);
      }
      grouped.get(promptName)!.push(pattern);
    }
  }

  return grouped;
}

/**
 * Validate that an optimized prompt preserves required structure
 */
function validateOptimizedPrompt(
  originalPrompt: string,
  optimizedPrompt: string,
  promptName: PromptName,
): { passed: boolean; errors: string[] } {
  const errors: string[] = [];

  // Extract variables from both prompts - use capture group to extract variable name
  const variablePattern = /\{\{(\w+)\}\}/g;
  const originalVars = new Set<string>();
  let match;

  while ((match = variablePattern.exec(originalPrompt)) !== null) {
    originalVars.add(match[1]);
  }

  // Reset lastIndex for reuse
  variablePattern.lastIndex = 0;
  const optimizedVars = new Set<string>();
  while ((match = variablePattern.exec(optimizedPrompt)) !== null) {
    optimizedVars.add(match[1]);
  }

  // Check that all required variables are preserved
  for (const v of originalVars) {
    if (!optimizedVars.has(v)) {
      errors.push(`Missing required variable: {{${v}}}`);
    }
  }

  // For plan.md, validate required section headers
  if (promptName === "plan") {
    const requiredHeaders = [
      "Implementation Plan Title",
      "Overview",
      "Current State",
      "Implementation Plan",
      "Definition of Done",
    ];

    for (const header of requiredHeaders) {
      if (!optimizedPrompt.includes(`## ${header}`)) {
        errors.push(`Missing required section: ## ${header}`);
      }
    }
  }

  // Check that optimized prompt is not empty
  if (optimizedPrompt.trim().length === 0) {
    errors.push("Optimized prompt is empty");
  }

  // Check that optimized prompt is significantly different
  if (optimizedPrompt.trim() === originalPrompt.trim()) {
    errors.push("Optimized prompt is identical to original");
  }

  return {
    passed: errors.length === 0,
    errors,
  };
}

/**
 * Generate a specialized optimization prompt for the agent
 */
function generateOptimizationPrompt(
  promptName: PromptName,
  currentPrompt: string,
  errorPatterns: EnhancedErrorPattern[],
): string {
  const patternsSummary = errorPatterns
    .map(
      (p) =>
        `- ${p.errorType} (${p.occurrences}x): ${p.detectedPattern.slice(0, 100)}...`,
    )
    .join("\n");

  return `You are the Wreckit Geneticist, an expert at optimizing system prompts to prevent recurrent errors.

TASK: Optimize the "${promptName}" prompt template to address the following recurrent error patterns:

ERROR PATTERNS:
${patternsSummary}

CURRENT PROMPT TEMPLATE:
\
${currentPrompt}
\

OPTIMIZATION REQUIREMENTS:
1. Make targeted, minimal changes to address the specific error patterns
2. Preserve ALL {{variable}} placeholders exactly as they are
3. Maintain the markdown structure and required section headers
4. Focus on clarity and precision in instructions
5. Add guidance or validation steps where appropriate to prevent the errors

OUTPUT FORMAT:
- Output ONLY the optimized prompt template
- Do NOT include any explanation, commentary, or markdown code blocks
- Output the raw prompt template text only

Begin optimization now:`;
}

/**
 * Optimize a single prompt using an AI agent
 */
async function optimizePrompt(
  cwd: string,
  promptName: PromptName,
  currentPrompt: string,
  errorPatterns: EnhancedErrorPattern[],
  logger: Logger,
  dryRun: boolean,
): Promise<OptimizationResult> {
  const optimizationPrompt = generateOptimizationPrompt(
    promptName,
    currentPrompt,
    errorPatterns,
  );

  const config = await loadConfig(cwd);
  const agentConfig = getAgentConfigUnion(config);

  logger.info(
    `Running optimization agent for ${promptName}.md (${errorPatterns.length} error patterns)`,
  );

  let optimizedPrompt: string;

  if (dryRun) {
    logger.info(`[dry-run] Would run optimization agent for ${promptName}.md`);
    optimizedPrompt = currentPrompt; // No change in dry-run
  } else {
    const result = await runAgentUnion({
      config: agentConfig,
      cwd,
      prompt: optimizationPrompt,
      logger,
      allowedTools: getAllowedToolsForPhase("genetic"),
    });

    if (!result.success) {
      return {
        promptName,
        originalPrompt: currentPrompt,
        optimizedPrompt: currentPrompt,
        validationPassed: false,
        validationErrors: [
          `Optimization agent failed: ${result.output.slice(0, 200)}`,
        ],
      };
    }

    optimizedPrompt = result.output.trim();
  }

  // Validate the optimized prompt
  const validation = validateOptimizedPrompt(
    currentPrompt,
    optimizedPrompt,
    promptName,
  );

  if (!validation.passed) {
    logger.warn(
      `Optimization validation failed for ${promptName}.md: ${validation.errors.join(", ")}`,
    );
  }

  return {
    promptName,
    originalPrompt: currentPrompt,
    optimizedPrompt,
    validationPassed: validation.passed,
    validationErrors: validation.errors,
  };
}

/**
 * Create an optimization branch and submit PR
 */
async function createOptimizationPr(
  cwd: string,
  promptName: PromptName,
  optimization: OptimizationResult,
  errorPatterns: EnhancedErrorPattern[],
  logger: Logger,
  dryRun: boolean,
): Promise<void> {
  const config = await loadConfig(cwd);
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const itemSlug = `geneticist-optimize-${promptName}-${timestamp}`;

  logger.info(`Creating optimization branch: ${itemSlug}`);

  const branchResult = await ensureBranch(
    config.base_branch,
    config.branch_prefix,
    itemSlug,
    { cwd, logger, dryRun },
  );

  logger.info(
    `Branch ${branchResult.branchName} ${branchResult.created ? "created" : "checked out"}`,
  );

  // Write the optimized prompt to .wreckit/prompts/
  const promptsDir = getPromptsDir(cwd);
  const promptPath = path.join(promptsDir, `${promptName}.md`);

  if (!dryRun) {
    await fs.mkdir(promptsDir, { recursive: true });
    await fs.writeFile(promptPath, optimization.optimizedPrompt, "utf-8");
    logger.info(`Wrote optimized ${promptName}.md to ${promptPath}`);
  } else {
    logger.info(`[dry-run] Would write optimized ${promptName}.md`);
  }

  // Commit the changes
  const patternSummary = errorPatterns
    .map((p) => `${p.errorType}(${p.occurrences})`)
    .join(", ");
  const commitMessage = `geneticist: optimize ${promptName}.md to address ${patternSummary}`;

  await commitAll(commitMessage, { cwd, logger, dryRun });

  // Push the branch
  await pushBranch(branchResult.branchName, { cwd, logger, dryRun });

  // Generate PR body
  const totalOccurrences = errorPatterns.reduce(
    (sum, p) => sum + p.occurrences,
    0,
  );
  const timeWindow = "48h"; // Could be made configurable

  const patternsList = errorPatterns
    .map(
      (p) =>
        `**${p.errorType}** (${p.occurrences}x)\n\
\
\
${p.detectedPattern.slice(0, 150)}...`,
    )
    .join("\n\n");

  const prBody = `## Geneticist Prompt Optimization

This PR optimizes 
${promptName}.md to address recurrent error patterns detected in the healing logs.

### Error Patterns Found

Total occurrences: ${totalOccurrences} in the last ${timeWindow}

${patternsList}

### Changes Made

${optimization.validationPassed ? "✅ All validations passed" : "⚠️ Validation warnings:\n" + optimization.validationErrors.map(e => `- ${e}`).join("\n")}

### Review Checklist

- [ ] Verify that all {{variables}} are preserved
- [ ] Check that markdown structure is intact
- [ ] Confirm that changes address the error patterns
- [ ] Test the optimized prompt in a real scenario

### Testing

1. Review the optimized prompt in 
.wreckit/prompts/${promptName}.md
2. Compare with the original in 
src/prompts/${promptName}.md
3. Run a test item to verify the improvements

---

🧬 *Generated by Agent Geneticist - Recursive Evolution*`;

  const prTitle = `geneticist: Optimize ${promptName}.md - ${errorPatterns[0].category} error patterns (${totalOccurrences} occurrences)`;

  const prResult = await createOrUpdatePr(
    config.base_branch,
    branchResult.branchName,
    prTitle,
    prBody,
    { cwd, logger, dryRun },
  );

  logger.info(
    `PR ${prResult.created ? "created" : "updated"}: ${prResult.url} (#${prResult.number})`,
  );
}

/**
 * Main geneticist command implementation
 */
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

  // Load healing logs
  let content = "";
  try {
    content = await fs.readFile(logPath, "utf-8");
  } catch (err) {
    logger.info("No healing logs found. Nothing to optimize.");
    return;
  }

  // Parse and filter logs by time window
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

  // Analyze patterns
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

  // Group patterns by target prompt
  const groupedPatterns = groupPatternsByPrompt(recurrentPatterns);

  logger.info(`Target prompts to optimize: ${groupedPatterns.size}\n`);

  // Process each prompt that needs optimization
  for (const [promptName, patterns] of groupedPatterns.entries()) {
    const totalOccurrences = patterns.reduce((sum, p) => sum + p.occurrences, 0);
    logger.info(
      `\n📝 Optimizing ${promptName}.md (${patterns.length} patterns, ${totalOccurrences} total occurrences)`,
    );

    for (const pattern of patterns) {
      logger.info(
        `  • ${pattern.errorType}: ${pattern.detectedPattern.slice(0, 80)}...`,
      );
    }

    if (options.dryRun) {
      logger.info(`\n[dry-run] Would optimize ${promptName}.md and create PR`);
      continue;
    }

    // Load current prompt
    const currentPrompt = await loadPromptTemplate(cwd, promptName);

    // Optimize the prompt
    const optimization = await optimizePrompt(
      cwd,
      promptName,
      currentPrompt,
      patterns,
      logger,
      options.dryRun || false,
    );

    if (!optimization.validationPassed) {
      logger.warn(
        `Skipping ${promptName}.md due to validation failures: ${optimization.validationErrors.join(", ")}`,
      );
      continue;
    }

    // Create PR with the optimization
    await createOptimizationPr(
      cwd,
      promptName,
      optimization,
      patterns,
      logger,
      options.dryRun || false,
    );

    logger.info(`✅ Successfully created optimization PR for ${promptName}.md`);
  }

  logger.info("\n🧬 Geneticist analysis complete.");
}