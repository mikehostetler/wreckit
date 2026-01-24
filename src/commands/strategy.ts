import * as fs from "node:fs/promises";
import type { Logger } from "../logging";
import { findRootFromOptions, getRoadmapPath } from "../fs/paths";
import { loadConfig } from "../config";
import { loadPromptTemplate, renderPrompt } from "../prompts";
import { runAgentUnion, getAgentConfigUnion } from "../agent/runner";
import { getAllowedToolsForPhase } from "../agent/toolAllowlist";
import { validateRoadmap } from "../domain/roadmap";
import {
  getGitStatus,
  compareGitStatus,
  formatViolations,
  type GitFileChange,
  type StatusCompareOptions,
} from "../git";
import { pathExists } from "../fs/util";

export interface StrategyOptions {
  force?: boolean;
  dryRun?: boolean;
  cwd?: string;
  verbose?: boolean;
  analyzeDirs?: string[];
}

/**
 * Run the strategy phase to analyze the codebase and generate/update ROADMAP.md.
 *
 * The strategy phase introduces a hierarchical control layer:
 * Strategy -> Plan -> Implement
 *
 * This helps prevent the "Feature Factory" trap by ensuring development work
 * aligns with high-value strategic milestones.
 */
export async function strategyCommand(
  options: StrategyOptions,
  logger: Logger
): Promise<void> {
  const root = findRootFromOptions(options);
  const config = await loadConfig(root);
  const roadmapPath = getRoadmapPath(root);

  // Check if ROADMAP.md exists (skip unless --force)
  if (!options.force && (await pathExists(roadmapPath))) {
    logger.info(
      "ROADMAP.md already exists. Use --force to regenerate."
    );
    return;
  }

  // Build prompt variables for strategy phase
  const analyzeDirs = options.analyzeDirs ?? ["src"];
  const completionSignal =
    config.agent.kind === "process"
      ? config.agent.completion_signal
      : "<promise>COMPLETE</promise>";

  const variables = {
    id: "strategy",
    title: "Strategic Analysis",
    section: "strategy",
    overview: `Analyze the project codebase and produce a strategic ROADMAP.md. Focus on: ${analyzeDirs.join(", ")}`,
    item_path: root,
    branch_name: "",
    base_branch: config.base_branch,
    completion_signal: completionSignal,
  };

  if (options.dryRun) {
    logger.info("[dry-run] Would run strategy analysis");
    logger.info(`  Root: ${root}`);
    logger.info(`  Analyze dirs: ${analyzeDirs.join(", ")}`);
    logger.info(`  Output: ${roadmapPath}`);
    return;
  }

  // Load strategy prompt template
  const template = await loadPromptTemplate(root, "strategy");
  const prompt = renderPrompt(template, variables);

  // Capture git status before running agent
  const beforeStatus: GitFileChange[] = await getGitStatus({
    cwd: root,
    logger,
  });

  const agentConfig = getAgentConfigUnion(config);

  logger.info("Running strategic analysis...");

  const result = await runAgentUnion({
    config: agentConfig,
    cwd: root,
    prompt,
    logger,
    dryRun: options.dryRun,
    mockAgent: false,
    timeoutSeconds: config.timeout_seconds,
    // Strategy phase: read + write (for ROADMAP.md only)
    allowedTools: getAllowedToolsForPhase("strategy"),
  });

  if (!result.success) {
    const error = result.timedOut
      ? "Agent timed out during strategy analysis"
      : `Agent failed with exit code ${result.exitCode}`;
    throw new Error(error);
  }

  // Verify ROADMAP.md was created
  if (!(await pathExists(roadmapPath))) {
    throw new Error("Agent did not create ROADMAP.md");
  }

  // Enforce that only ROADMAP.md was modified
  const allowedPaths = ["ROADMAP.md"];
  const compareOptions: StatusCompareOptions = {
    cwd: root,
    logger,
    allowedPaths,
  };

  const comparison = await compareGitStatus(beforeStatus, compareOptions);
  if (!comparison.valid) {
    const error = formatViolations(comparison, "strategy");
    logger.error(error);
    throw new Error(
      "Strategy phase modified files other than ROADMAP.md. This violates the strategy phase constraints."
    );
  }

  // Validate ROADMAP.md format
  const roadmapContent = await fs.readFile(roadmapPath, "utf-8");
  const validation = validateRoadmap(roadmapContent);

  if (!validation.valid) {
    const errorMsg = `ROADMAP.md format validation failed:\n${validation.errors.join("\n")}`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  logger.info(`Strategy analysis complete. ROADMAP.md created at ${roadmapPath}`);
}
