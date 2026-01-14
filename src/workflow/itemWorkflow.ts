import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Item, Prd, WorkflowState } from "../schemas";
import { PrdSchema } from "../schemas";
import type { ConfigResolved } from "../config";
import type { Logger } from "../logging";
import type { AgentEvent } from "../tui/agentEvents";
import type { ValidationContext } from "../domain/validation";
import {
  validateTransition,
  allStoriesDone,
  hasPendingStories,
} from "../domain/validation";
import { getNextState } from "../domain/states";
import {
  getItemDir,
  getResearchPath,
  getPlanPath,
  getPrdPath,
  getProgressLogPath,
} from "../fs/paths";
import { pathExists } from "../fs/util";
import { readItem, writeItem, readPrd, writePrd } from "../fs/json";
import {
  loadPromptTemplate,
  renderPrompt,
  type PromptVariables,
} from "../prompts";
import { runAgent, getAgentConfig } from "../agent/runner";
import {
  ensureBranch,
  hasUncommittedChanges,
  commitAll,
  pushBranch,
  createOrUpdatePr,
  isPrMerged,
} from "../git";

export interface WorkflowOptions {
  root: string;
  config: ConfigResolved;
  logger: Logger;
  force?: boolean;
  dryRun?: boolean;
  mockAgent?: boolean;
  onAgentOutput?: (chunk: string) => void;
  onAgentEvent?: (event: AgentEvent) => void;
}

export interface PhaseResult {
  success: boolean;
  item: Item;
  error?: string;
}

async function readFileIfExists(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return undefined;
  }
}

async function loadPrdSafe(itemDir: string): Promise<Prd | null> {
  try {
    return await readPrd(itemDir);
  } catch {
    return null;
  }
}

export async function buildValidationContext(
  root: string,
  item: Item
): Promise<ValidationContext> {
  const itemDir = getItemDir(root, item.id);
  const researchPath = getResearchPath(root, item.id);
  const planPath = getPlanPath(root, item.id);

  const hasResearchMd = await pathExists(researchPath);
  const hasPlanMd = await pathExists(planPath);
  const prd = await loadPrdSafe(itemDir);
  const hasPr = item.pr_url !== null;
  const prMerged = item.state === "done";

  return {
    hasResearchMd,
    hasPlanMd,
    prd,
    hasPr,
    prMerged,
  };
}

async function loadItem(root: string, itemId: string): Promise<Item> {
  const itemDir = getItemDir(root, itemId);
  return readItem(itemDir);
}

async function saveItem(root: string, item: Item): Promise<void> {
  const itemDir = getItemDir(root, item.id);
  await writeItem(itemDir, {
    ...item,
    updated_at: new Date().toISOString(),
  });
}

async function buildPromptVariables(
  root: string,
  item: Item,
  config: ConfigResolved
): Promise<PromptVariables> {
  const itemDir = getItemDir(root, item.id);
  const branchName = `${config.branch_prefix}${item.id.replace("/", "-")}`;

  const research = await readFileIfExists(getResearchPath(root, item.id));
  const plan = await readFileIfExists(getPlanPath(root, item.id));
  const prdContent = await readFileIfExists(getPrdPath(root, item.id));
  const progress = await readFileIfExists(getProgressLogPath(root, item.id));

  return {
    id: item.id,
    title: item.title,
    section: item.section,
    overview: item.overview,
    item_path: itemDir,
    branch_name: branchName,
    base_branch: config.base_branch,
    completion_signal: config.agent.completion_signal,
    sdk_mode: config.agent.mode === "sdk",
    research,
    plan,
    prd: prdContent,
    progress,
  };
}

export async function runPhaseResearch(
  itemId: string,
  options: WorkflowOptions
): Promise<PhaseResult> {
  const {
    root,
    config,
    logger,
    force = false,
    dryRun = false,
    mockAgent = false,
    onAgentOutput,
    onAgentEvent,
  } = options;

  let item = await loadItem(root, itemId);
  const researchPath = getResearchPath(root, item.id);

  if (!force && (await pathExists(researchPath))) {
    logger.info(`Research already exists for ${itemId}, skipping`);
    if (item.state === "raw") {
      item = { ...item, state: "researched" };
      await saveItem(root, item);
    }
    return { success: true, item };
  }

  const targetState: WorkflowState = "researched";

  if (item.state !== "raw" && !force) {
    return {
      success: false,
      item,
      error: `Item is in state ${item.state}, expected 'raw' for research phase`,
    };
  }

  const originalState = item.state;
  if (force && item.state !== "raw") {
    item = { ...item, state: "raw" };
  }

  const template = await loadPromptTemplate(root, "research");
  const variables = await buildPromptVariables(root, item, config);
  const prompt = renderPrompt(template, variables);

  const itemDir = getItemDir(root, item.id);
  const agentConfig = getAgentConfig(config);

  const result = await runAgent({
    config: agentConfig,
    cwd: itemDir,
    prompt,
    logger,
    dryRun,
    mockAgent,
    onStdoutChunk: onAgentOutput,
    onStderrChunk: onAgentOutput,
    onAgentEvent,
  });

  if (dryRun) {
    return { success: true, item };
  }

  if (mockAgent) {
    item = { ...item, state: "researched", last_error: null };
    await saveItem(root, item);
    return { success: true, item };
  }

  if (!result.success) {
    const error = result.timedOut
      ? "Agent timed out"
      : `Agent failed with exit code ${result.exitCode}`;
    item = { ...item, last_error: error };
    await saveItem(root, item);
    return { success: false, item, error };
  }

  if (!(await pathExists(researchPath))) {
    const error = "Agent did not create research.md";
    item = { ...item, last_error: error };
    await saveItem(root, item);
    return { success: false, item, error };
  }

  const newCtx = await buildValidationContext(root, item);
  const validation = validateTransition(item.state, targetState, newCtx);
  if (!validation.valid) {
    const error = validation.reason ?? "Validation failed";
    item = { ...item, last_error: error };
    await saveItem(root, item);
    return { success: false, item, error };
  }

  item = { ...item, state: targetState, last_error: null };
  await saveItem(root, item);

  return { success: true, item };
}

export async function runPhasePlan(
  itemId: string,
  options: WorkflowOptions
): Promise<PhaseResult> {
  const {
    root,
    config,
    logger,
    force = false,
    dryRun = false,
    mockAgent = false,
    onAgentOutput,
    onAgentEvent,
  } = options;

  let item = await loadItem(root, itemId);
  const planPath = getPlanPath(root, item.id);
  const prdPath = getPrdPath(root, item.id);

  if (!force && (await pathExists(planPath)) && (await pathExists(prdPath))) {
    logger.info(`Plan already exists for ${itemId}, skipping`);
    if (item.state === "researched") {
      const prd = await loadPrdSafe(getItemDir(root, item.id));
      if (prd) {
        item = { ...item, state: "planned" };
        await saveItem(root, item);
      }
    }
    return { success: true, item };
  }

  if (item.state !== "researched" && !force) {
    return {
      success: false,
      item,
      error: `Item is in state ${item.state}, expected 'researched' for plan phase`,
    };
  }

  const template = await loadPromptTemplate(root, "plan");
  const variables = await buildPromptVariables(root, item, config);
  const prompt = renderPrompt(template, variables);

  const itemDir = getItemDir(root, item.id);
  const agentConfig = getAgentConfig(config);

  const result = await runAgent({
    config: agentConfig,
    cwd: itemDir,
    prompt,
    logger,
    dryRun,
    mockAgent,
    onStdoutChunk: onAgentOutput,
    onStderrChunk: onAgentOutput,
    onAgentEvent,
  });

  if (dryRun) {
    return { success: true, item };
  }

  if (mockAgent) {
    item = { ...item, state: "planned", last_error: null };
    await saveItem(root, item);
    return { success: true, item };
  }

  if (!result.success) {
    const error = result.timedOut
      ? "Agent timed out"
      : `Agent failed with exit code ${result.exitCode}`;
    item = { ...item, last_error: error };
    await saveItem(root, item);
    return { success: false, item, error };
  }

  if (!(await pathExists(planPath))) {
    const error = "Agent did not create plan.md";
    item = { ...item, last_error: error };
    await saveItem(root, item);
    return { success: false, item, error };
  }

  if (!(await pathExists(prdPath))) {
    const error = "Agent did not create prd.json";
    item = { ...item, last_error: error };
    await saveItem(root, item);
    return { success: false, item, error };
  }

  const prd = await loadPrdSafe(itemDir);
  if (!prd) {
    const error = "prd.json is not valid JSON or fails schema validation";
    item = { ...item, last_error: error };
    await saveItem(root, item);
    return { success: false, item, error };
  }

  const targetState: WorkflowState = "planned";
  const newCtx = await buildValidationContext(root, item);
  const validation = validateTransition(item.state, targetState, newCtx);
  if (!validation.valid) {
    const error = validation.reason ?? "Validation failed";
    item = { ...item, last_error: error };
    await saveItem(root, item);
    return { success: false, item, error };
  }

  item = { ...item, state: targetState, last_error: null };
  await saveItem(root, item);

  return { success: true, item };
}

export async function runPhaseImplement(
  itemId: string,
  options: WorkflowOptions
): Promise<PhaseResult> {
  const {
    root,
    config,
    logger,
    force = false,
    dryRun = false,
    mockAgent = false,
    onAgentOutput,
    onAgentEvent,
  } = options;

  let item = await loadItem(root, itemId);
  const itemDir = getItemDir(root, item.id);

  if (item.state !== "planned" && item.state !== "implementing" && !force) {
    return {
      success: false,
      item,
      error: `Item is in state ${item.state}, expected 'planned' or 'implementing' for implement phase`,
    };
  }

  if (mockAgent) {
    item = { ...item, state: "implementing", last_error: null };
    await saveItem(root, item);

    const template = await loadPromptTemplate(root, "implement");
    const variables = await buildPromptVariables(root, item, config);
    const prompt = renderPrompt(template, variables);
    const agentConfig = getAgentConfig(config);
    await runAgent({
      config: agentConfig,
      cwd: itemDir,
      prompt,
      logger,
      dryRun,
      mockAgent,
      onStdoutChunk: onAgentOutput,
      onStderrChunk: onAgentOutput,
      onAgentEvent,
    });
    return { success: true, item };
  }

  let prd = await loadPrdSafe(itemDir);
  if (!prd) {
    const error = "prd.json not found or invalid";
    item = { ...item, last_error: error };
    await saveItem(root, item);
    return { success: false, item, error };
  }

  if (allStoriesDone(prd)) {
    logger.info(`All stories already done for ${itemId}`);
    return { success: true, item };
  }

  if (item.state === "planned") {
    item = { ...item, state: "implementing" };
    await saveItem(root, item);
  }

  let iteration = 0;
  const maxIterations = config.max_iterations;

  while (hasPendingStories(prd) && iteration < maxIterations) {
    iteration++;

    const pendingStories = prd.user_stories
      .filter((s) => s.status === "pending")
      .sort((a, b) => a.priority - b.priority);

    if (pendingStories.length === 0) break;

    const currentStory = pendingStories[0];
    logger.info(
      `Implementing story ${currentStory.id} (iteration ${iteration}/${maxIterations})`
    );

    const template = await loadPromptTemplate(root, "implement");
    const variables = await buildPromptVariables(root, item, config);
    const prompt = renderPrompt(template, variables);

    const agentConfig = getAgentConfig(config);
    const result = await runAgent({
      config: agentConfig,
      cwd: itemDir,
      prompt,
      logger,
      dryRun,
      mockAgent,
      onStdoutChunk: onAgentOutput,
      onStderrChunk: onAgentOutput,
      onAgentEvent,
    });

    if (dryRun) {
      return { success: true, item };
    }

    if (!result.success) {
      const error = result.timedOut
        ? "Agent timed out"
        : `Agent failed with exit code ${result.exitCode}`;
      item = { ...item, last_error: error };
      await saveItem(root, item);
      return { success: false, item, error };
    }

    prd = await loadPrdSafe(itemDir);
    if (!prd) {
      const error = "prd.json became invalid during implementation";
      item = { ...item, last_error: error };
      await saveItem(root, item);
      return { success: false, item, error };
    }

    const progressPath = getProgressLogPath(root, item.id);
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] Completed iteration ${iteration} for story ${currentStory.id}\n`;
    await fs.appendFile(progressPath, logEntry, "utf-8");
  }

  if (iteration >= maxIterations && hasPendingStories(prd)) {
    const error = `Reached max iterations (${maxIterations}) with stories still pending`;
    item = { ...item, last_error: error };
    await saveItem(root, item);
    return { success: false, item, error };
  }

  item = await loadItem(root, itemId);
  item = { ...item, last_error: null };
  await saveItem(root, item);

  return { success: true, item };
}

export async function runPhasePr(
  itemId: string,
  options: WorkflowOptions
): Promise<PhaseResult> {
  const { root, config, logger, dryRun = false } = options;

  let item = await loadItem(root, itemId);
  const itemDir = getItemDir(root, item.id);

  if (item.state !== "implementing") {
    return {
      success: false,
      item,
      error: `Item is in state ${item.state}, expected 'implementing' for PR phase`,
    };
  }

  const prd = await loadPrdSafe(itemDir);
  if (!allStoriesDone(prd)) {
    const error = "Not all stories are done";
    item = { ...item, last_error: error };
    await saveItem(root, item);
    return { success: false, item, error };
  }

  const gitOptions = { cwd: root, logger, dryRun };
  const itemSlug = item.id.replace("/", "-");

  const branchResult = await ensureBranch(
    config.base_branch,
    config.branch_prefix,
    itemSlug,
    gitOptions
  );

  if (await hasUncommittedChanges(gitOptions)) {
    const commitMessage = `feat(${itemSlug}): implement ${item.title}`;
    await commitAll(commitMessage, gitOptions);
  }

  await pushBranch(branchResult.branchName, gitOptions);

  const prTitle = `[${item.section}] ${item.title}`;
  const prBody = `## Overview\n\n${item.overview}\n\n---\n\n*Automated PR created by wreckit*`;

  const prResult = await createOrUpdatePr(
    config.base_branch,
    branchResult.branchName,
    prTitle,
    prBody,
    gitOptions
  );

  item = {
    ...item,
    state: "in_pr",
    branch: branchResult.branchName,
    pr_url: prResult.url,
    pr_number: prResult.number,
    last_error: null,
  };
  await saveItem(root, item);

  logger.info(
    `${prResult.created ? "Created" : "Updated"} PR for ${itemId}: ${
      prResult.url
    }`
  );

  return { success: true, item };
}

export async function runPhaseComplete(
  itemId: string,
  options: WorkflowOptions
): Promise<PhaseResult> {
  const { root, logger, dryRun = false } = options;

  let item = await loadItem(root, itemId);

  if (item.state !== "in_pr") {
    return {
      success: false,
      item,
      error: `Item is in state ${item.state}, expected 'in_pr' for complete phase`,
    };
  }

  if (dryRun) {
    logger.info(`[dry-run] Would complete ${itemId}`);
    return { success: true, item };
  }

  if (item.pr_number === null) {
    return {
      success: false,
      item,
      error: "Item has no PR number",
    };
  }

  const gitOptions = { cwd: root, logger, dryRun };
  const prMerged = await isPrMerged(item.pr_number, gitOptions);

  if (!prMerged) {
    return {
      success: false,
      item,
      error: "PR not merged yet",
    };
  }

  item = { ...item, state: "done", last_error: null };
  await saveItem(root, item);

  logger.info(`Completed ${itemId}`);

  return { success: true, item };
}

/**
 * Determines the next phase to execute based on an item's current state.
 *
 * This function encodes the workflow progression from states to phases. The mapping is:
 * - raw → research
 * - researched → plan
 * - planned → implement
 * - implementing → pr
 * - in_pr → complete
 * - done → null (terminal)
 *
 * IMPORTANT: This logic must stay synchronized with:
 * - src/domain/states.ts:3-10 (WORKFLOW_STATES array - defines state ordering)
 * - src/commands/phase.ts:26-65 (PHASE_CONFIG - defines phases and their target states)
 *
 * @param item - The item to evaluate
 * @returns The next phase name, or null if the workflow is complete
 */
export function getNextPhase(
  item: Item
): "research" | "plan" | "implement" | "pr" | "complete" | null {
  switch (item.state) {
    case "raw":
      return "research";
    case "researched":
      return "plan";
    case "planned":
      return "implement";
    case "implementing":
      return "pr";
    case "in_pr":
      return "complete";
    case "done":
      return null;
    default:
      return null;
  }
}
