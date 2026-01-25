import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Item, Prd, WorkflowState, StoryStatus } from "../schemas";
import { PrdSchema } from "../schemas";
import type { ConfigResolved } from "../config";
import type { Logger } from "../logging";
import type { AgentEvent } from "../tui/agentEvents";
import type { ValidationContext, StoryCompletionVerification } from "../domain/validation";
import {
  validateTransition,
  allStoriesDone,
  hasPendingStories,
  validateResearchQuality,
  validatePlanQuality,
  validateStoryQuality,
} from "../domain/validation";
import { WreckitError } from "../errors";
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
import { createWreckitMcpServer } from "../agent/mcp/wreckitMcpServer";
import {
  loadPromptTemplate,
  renderPrompt,
  type PromptVariables,
} from "../prompts";
import { runAgentUnion, getAgentConfigUnion } from "../agent/runner";
import { getAllowedToolsForPhase } from "../agent/toolAllowlist";
import {
  ensureBranch,
  hasUncommittedChanges,
  commitAll,
  pushBranch,
  createOrUpdatePr,
  isPrMerged,
  getPrDetails,
  checkGitPreflight,
  isGitRepo,
  getCurrentBranch,
  getBranchSha,
  mergeAndPushToBase,
  checkMergeConflicts,
  getGitStatus,
  compareGitStatus,
  formatViolations,
  runPrePushQualityGates,
  checkPrMergeability,
  validateRemoteUrl,
  runGitCommand,
  cleanupBranch,
  type PrMergeabilityResult,
  type GitPreflightError,
  type GitFileChange,
  type StatusCompareOptions,
  type QualityCheckResult,
  type RemoteValidationResult,
  type PrDetails,
} from "../git";
import { runPhaseCritique } from "./critique";

export { runPhaseCritique };

export interface WorkflowOptions {
  root: string;
  config: ConfigResolved;
  logger: Logger;
  force?: boolean;
  dryRun?: boolean;
  mockAgent?: boolean;
  onAgentOutput?: (chunk: string) => void;
  onAgentEvent?: (event: AgentEvent) => void;
  onIterationChanged?: (iteration: number, maxIterations: number) => void;
  onStoryChanged?: (story: { id: string; title: string } | null) => void;
  onPhaseChanged?: (phase: WorkflowState | null) => void;
}

export interface PhaseResult {
  success: boolean;
  item: Item;
  /**
   * Error message or typed error.
   * @deprecated String errors are deprecated. Use typed WreckitError for better programmatic handling.
   */
  error?: string | WreckitError;
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

  // Determine completion_signal and sdk_mode based on agent kind
  const agent = config.agent;
  const isProcessMode = agent.kind === "process";
  const completionSignal = isProcessMode ? agent.completion_signal : "<promise>COMPLETE</promise>";

  return {
    id: item.id,
    title: item.title,
    section: item.section ?? "items",
    overview: item.overview,
    item_path: itemDir,
    branch_name: branchName,
    base_branch: config.base_branch,
    completion_signal: completionSignal,
    sdk_mode: !isProcessMode, // All non-process kinds are SDK modes
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
    if (item.state === "idea") {
      item = { ...item, state: "researched" };
      await saveItem(root, item);
    }
    return { success: true, item };
  }

  const targetState: WorkflowState = "researched";

  if (item.state !== "idea" && !force) {
    return {
      success: false,
      item,
      error: `Item is in state ${item.state}, expected 'idea' for research phase`,
    };
  }

  const originalState = item.state;
  if (force && item.state !== "idea") {
    item = { ...item, state: "idea" };
  }

  const template = await loadPromptTemplate(root, "research");
  const baseVariables = await buildPromptVariables(root, item, config);
  
  const itemDir = getItemDir(root, item.id);
  const agentConfig = getAgentConfigUnion(config);

  // Capture git status before running agent for read-only enforcement
  const beforeStatus: GitFileChange[] = dryRun || mockAgent
    ? []
    : await getGitStatus({ cwd: root, logger });

  let attempt = 0;
  const maxAttempts = 3;
  let validationError: string | null = null;
  let lastError: string | null = null;

  while (attempt < maxAttempts) {
    attempt++;
    if (attempt > 1) {
      logger.warn(`Research validation failed (attempt ${attempt - 1}/${maxAttempts}). Retrying...`);
    }

    // Append validation feedback to prompt if this is a retry
    let prompt = renderPrompt(template, baseVariables);
    if (validationError) {
      prompt += `\n\nCRITICAL: Your previous attempt failed validation with the following errors:\n${validationError}\n\nYou MUST fix these issues in this attempt. Ensure you strictly follow all format requirements and section headers.`;
    }

    const result = await runAgentUnion({
      config: agentConfig,
      cwd: itemDir,
      prompt,
      logger,
      dryRun,
      mockAgent,
      timeoutSeconds: config.timeout_seconds,
      onStdoutChunk: onAgentOutput,
      onStderrChunk: onAgentOutput,
      onAgentEvent,
      // Restrict to read-only tools for research phase
      allowedTools: getAllowedToolsForPhase("research"),
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
      lastError = result.timedOut
        ? "Agent timed out"
        : `Agent failed with exit code ${result.exitCode}`;
      validationError = null; // System error, not validation error
      // Don't retry on system errors (unless we want to?) - for now, break
      break; 
    }

    if (!(await pathExists(researchPath))) {
      validationError = "Agent did not create research.md";
      lastError = validationError;
      continue; // Retry
    }

    // Validate research document quality (Gap 2: Research Quality Validation)
    const researchContent = await fs.readFile(researchPath, "utf-8");
    const qualityResult = validateResearchQuality(researchContent);

    if (!qualityResult.valid) {
      validationError = `Research quality validation failed:\n${qualityResult.errors.join("\n")}`;
      lastError = validationError;
      continue; // Retry
    }

    logger.info(
      `Research quality validation passed: ${qualityResult.citations} citations, ` +
      `${qualityResult.summaryLength} char summary, ${qualityResult.analysisLength} char analysis`
    );

    // Enforce read-only behavior: check for unauthorized file modifications
    const allowedResearchPath = `.wreckit/items/${item.id}/research.md`;
    const compareOptions: StatusCompareOptions = {
      cwd: root,
      logger,
      allowedPaths: [allowedResearchPath],
    };

    const comparison = await compareGitStatus(beforeStatus, compareOptions);
    if (!comparison.valid) {
      const error = formatViolations(comparison);
      logger.error(error);
      item = { ...item, last_error: error };
      await saveItem(root, item);
      return { success: false, item, error };
    }

    // Validation passed!
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

  // If we exhausted attempts or hit a hard error
  const finalError = lastError ?? "Research phase failed after max attempts";
  item = { ...item, last_error: finalError };
  await saveItem(root, item);
  return { success: false, item, error: finalError };
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
  const baseVariables = await buildPromptVariables(root, item, config);
  
  const itemDir = getItemDir(root, item.id);
  const agentConfig = getAgentConfigUnion(config);

  // Capture git status before running agent for design-only enforcement
  const beforeStatus: GitFileChange[] = dryRun || mockAgent
    ? []
    : await getGitStatus({ cwd: root, logger });

  let attempt = 0;
  const maxAttempts = 3;
  let validationError: string | null = null;
  let lastError: string | null = null;

  while (attempt < maxAttempts) {
    attempt++;
    if (attempt > 1) {
      logger.warn(`Plan validation failed (attempt ${attempt - 1}/${maxAttempts}). Retrying...`);
    }

    // Append validation feedback to prompt if this is a retry
    let prompt = renderPrompt(template, baseVariables);
    if (validationError) {
      prompt += `\n\nCRITICAL: Your previous attempt failed validation with the following errors:\n${validationError}\n\nYou MUST fix these issues in this attempt. Ensure you strictly follow all format requirements, section headers, and JSON schemas.`;
    }

    // Create MCP server to capture PRD via tool call
    let capturedPrd: Prd | null = null;
    const wreckitServer = createWreckitMcpServer({
      onSavePrd: (prd) => {
        capturedPrd = prd;
      },
    });

    const result = await runAgentUnion({
      config: agentConfig,
      cwd: itemDir,
      prompt,
      logger,
      dryRun,
      mockAgent,
      timeoutSeconds: config.timeout_seconds,
      onStdoutChunk: onAgentOutput,
      onStderrChunk: onAgentOutput,
      onAgentEvent,
      mcpServers: { wreckit: wreckitServer },
      // Restrict to read+write tools for plan phase
      allowedTools: getAllowedToolsForPhase("plan"),
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
      lastError = result.timedOut
        ? "Agent timed out"
        : `Agent failed with exit code ${result.exitCode}`;
      validationError = null; // System error
      break; 
    }

    if (!(await pathExists(planPath))) {
      validationError = "Agent did not create plan.md";
      lastError = validationError;
      continue;
    }

    // Validate plan document quality (Gap 2: Plan Content Quality Validation)
    const planContent = await fs.readFile(planPath, "utf-8");
    const planQualityResult = validatePlanQuality(planContent);

    if (!planQualityResult.valid) {
      validationError = `Plan quality validation failed:\n${planQualityResult.errors.join("\n")}`;
      lastError = validationError;
      continue;
    }

    logger.info(
      `Plan quality validation passed: ${planQualityResult.phases} implementation phase(s)`
    );

    // If PRD was captured via MCP tool, write it to disk
    if (capturedPrd !== null) {
      const prd = capturedPrd as Prd;
      await writePrd(itemDir, prd);
      logger.info(`PRD saved via MCP tool with ${prd.user_stories.length} stories`);
    }

    // Check if prd.json exists (from MCP or direct file write)
    if (!(await pathExists(prdPath))) {
      validationError = "Agent did not create prd.json";
      lastError = validationError;
      continue;
    }

    const prd = await loadPrdSafe(itemDir);
    if (!prd) {
      validationError = "prd.json is not valid JSON or fails schema validation";
      lastError = validationError;
      continue;
    }

    // Validate story quality (Gap 3: Story Quality Validation)
    const storyQualityResult = validateStoryQuality(prd);
    if (!storyQualityResult.valid) {
      validationError = `Story quality validation failed:\n${storyQualityResult.errors.join("\n")}`;
      lastError = validationError;
      continue;
    }

    logger.info(
      `Story quality validation passed: ${storyQualityResult.storyCount} story/stories, ` +
      `${storyQualityResult.failedStoryCount} failed`
    );

    // Enforce design-only behavior: check for unauthorized file modifications (Gap 1)
    const allowedPlanPaths = [
      `.wreckit/items/${item.id}/plan.md`,
      `.wreckit/items/${item.id}/prd.json`,
    ];
    const compareOptions: StatusCompareOptions = {
      cwd: root,
      logger,
      allowedPaths: allowedPlanPaths,
    };

    const comparison = await compareGitStatus(beforeStatus, compareOptions);
    if (!comparison.valid) {
      const error = formatViolations(comparison, 'plan');
      logger.error(error);
      item = { ...item, last_error: error };
      await saveItem(root, item);
      return { success: false, item, error };
    }

    // Validation passed!
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

  // If we exhausted attempts or hit a hard error
  const finalError = lastError ?? "Plan phase failed after max attempts";
  item = { ...item, last_error: finalError };
  await saveItem(root, item);
  return { success: false, item, error: finalError };
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
    onIterationChanged,
    onStoryChanged,
    onPhaseChanged,
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
    const agentConfig = getAgentConfigUnion(config);
    await runAgentUnion({
      config: agentConfig,
      cwd: itemDir,
      prompt,
      logger,
      dryRun,
      mockAgent,
      timeoutSeconds: config.timeout_seconds,
      onStdoutChunk: onAgentOutput,
      onStderrChunk: onAgentOutput,
      onAgentEvent,
      // Allow full tool access for implement phase
      allowedTools: getAllowedToolsForPhase("implement"),
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
    if (item.state === "planned") {
      item = { ...item, state: "implementing" };
      await saveItem(root, item);
      onPhaseChanged?.("implementing");
    }
    return { success: true, item };
  }

  if (item.state === "planned") {
    item = { ...item, state: "implementing" };
    await saveItem(root, item);
    onPhaseChanged?.("implementing");
  }

  let iteration = 0;
  const maxIterations = config.max_iterations;

  while (hasPendingStories(prd) && iteration < maxIterations) {
    iteration++;
    onIterationChanged?.(iteration, maxIterations);

    const pendingStories = prd.user_stories
      .filter((s) => s.status === "pending")
      .sort((a, b) => a.priority - b.priority);

    if (pendingStories.length === 0) break;

    const currentStory = pendingStories[0];
    onStoryChanged?.({ id: currentStory.id, title: currentStory.title });
    logger.info(
      `Implementing story ${currentStory.id} (iteration ${iteration}/${maxIterations})`
    );

    // Capture git status before running agent for scope enforcement (Gap 2)
    const beforeStatus: GitFileChange[] = dryRun || mockAgent
      ? []
      : await getGitStatus({ cwd: root, logger });

    const template = await loadPromptTemplate(root, "implement");
    const variables = await buildPromptVariables(root, item, config);
    const prompt = renderPrompt(template, variables);

    // Create MCP server to capture story status updates with verification
    const storyUpdates: Array<{ storyId: string; status: StoryStatus; verification: StoryCompletionVerification | null }> = [];
    const wreckitServer = createWreckitMcpServer({
      getPrd: () => prd,
      onUpdateStoryStatus: (storyId, status, verification) => {
        storyUpdates.push({ storyId, status, verification });
      },
    });

    const agentConfig = getAgentConfigUnion(config);
    const result = await runAgentUnion({
      config: agentConfig,
      cwd: itemDir,
      prompt,
      logger,
      dryRun,
      mockAgent,
      timeoutSeconds: config.timeout_seconds,
      onStdoutChunk: onAgentOutput,
      onStderrChunk: onAgentOutput,
      onAgentEvent,
      mcpServers: { wreckit: wreckitServer },
      // Allow full tool access for implement phase
      allowedTools: getAllowedToolsForPhase("implement"),
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

    // Enforce story scope: check for scope creep via git status comparison (Gap 2)
    // Allow all paths during implementation (no strict containment), but log warnings
    // This is a softer check than research/plan phases - we're detecting scope creep, not enforcing strict containment
    const compareOptions: StatusCompareOptions = {
      cwd: root,
      logger,
      // For implement phase, we allow all paths but track changes for scope awareness
      // This is different from research/plan where we enforce strict read-only/design-only
      allowedPaths: undefined,
    };

    const comparison = await compareGitStatus(beforeStatus, compareOptions);
    if (comparison.allChanges.length > 0) {
      const changedFiles = comparison.allChanges.map(c => `${c.statusCode} ${c.path}`).join(", ");
      logger.info(`Story ${currentStory.id} changed ${comparison.allChanges.length} file(s): ${changedFiles}`);

      // If there are any changes to the wreckit metadata or config files outside the item directory, warn about scope creep
      const wreckitSystemPaths = comparison.allChanges.filter(c =>
        c.path.startsWith(".wreckit/") && !c.path.startsWith(`.wreckit/items/${item.id}/`)
      );
      if (wreckitSystemPaths.length > 0) {
        logger.warn(`Story ${currentStory.id} modified wreckit system files: ${wreckitSystemPaths.map(c => c.path).join(", ")}`);
      }
    }

    // Apply story status updates captured via MCP (with verification warnings)
    if (storyUpdates.length > 0 && prd) {
      for (const update of storyUpdates) {
        const story = prd.user_stories.find((s) => s.id === update.storyId);
        if (story) {
          story.status = update.status;
          logger.info(`Story ${update.storyId} marked as '${update.status}' via MCP`);

          // Log verification warnings (Gap 1: Acceptance Criteria Verification)
          if (update.verification) {
            for (const warning of update.verification.warnings) {
              logger.warn(warning);
            }
            for (const error of update.verification.errors) {
              logger.error(`Verification error: ${error}`);
            }
          }
        }
      }
      await writePrd(itemDir, prd);
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

  // Clear story when implementation completes
  onStoryChanged?.(null);

  item = await loadItem(root, itemId);
  item = { ...item, last_error: null };
  await saveItem(root, item);

  return { success: true, item };
}

function formatPreflightErrors(errors: GitPreflightError[]): string {
  const lines: string[] = ["Git pre-flight check failed:"];
  for (const err of errors) {
    lines.push(`\n• ${err.message}`);
    for (const step of err.recoverySteps) {
      lines.push(`    ${step}`);
    }
  }
  return lines.join("\n");
}

function parsePrJson(output: string): { title: string; body: string } | null {
  const startMarker = "PR_JSON_START";
  const endMarker = "PR_JSON_END";
  
  const startIdx = output.indexOf(startMarker);
  const endIdx = output.indexOf(endMarker);
  
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    return null;
  }
  
  const jsonStr = output.slice(startIdx + startMarker.length, endIdx).trim();
  
  try {
    const parsed = JSON.parse(jsonStr);
    if (typeof parsed.title === "string" && typeof parsed.body === "string") {
      return { title: parsed.title, body: parsed.body };
    }
    return null;
  } catch {
    return null;
  }
}

export async function runPhasePr(
  itemId: string,
  options: WorkflowOptions
): Promise<PhaseResult> {
  const {
    root,
    config,
    logger,
    dryRun = false,
    mockAgent = false,
    onAgentOutput,
    onAgentEvent,
  } = options;

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

  // Ensure we're on the correct branch first
  const branchResult = await ensureBranch(
    config.base_branch,
    config.branch_prefix,
    itemSlug,
    gitOptions
  );

  // Verify we're actually on the expected branch
  if (!dryRun) {
    try {
      const currentBranch = await getCurrentBranch(gitOptions);
      if (currentBranch !== branchResult.branchName) {
        const error = `Expected to be on branch ${branchResult.branchName}, but currently on ${currentBranch}`;
        item = { ...item, last_error: error };
        await saveItem(root, item);
        return { success: false, item, error };
      }
    } catch (err) {
      const error = `Failed to verify current branch: ${err instanceof Error ? err.message : String(err)}`;
      item = { ...item, last_error: error };
      await saveItem(root, item);
      return { success: false, item, error };
    }
  }

  // Auto-commit any uncommitted changes before preflight check
  // This fixes Gap 1: preflight/commit ordering bug
  // Previously preflight ran first and rejected uncommitted changes,
  // but auto-commit ran after preflight, so it never executed
  if (await hasUncommittedChanges(gitOptions)) {
    const commitMessage = `feat(${itemSlug}): implement ${item.title}`;
    await commitAll(commitMessage, gitOptions);
  }

  // Pre-flight git state checks (now that changes are committed)
  // Only check for issues that would prevent push/PR operations
  if (!dryRun) {
    const preflight = await checkGitPreflight({ ...gitOptions, checkRemoteSync: false });
    if (!preflight.valid) {
      const error = formatPreflightErrors(preflight.errors);
      item = { ...item, last_error: error };
      await saveItem(root, item);
      return { success: false, item, error };
    }
  }

  // Run quality gates before push/merge (Gap 2: Quality Gate Before Push)
  // This ensures tests/lint/typecheck pass before code is pushed or merged
  if (!dryRun) {
    const qualityResult = await runPrePushQualityGates({
      cwd: root,
      logger,
      dryRun,
      checks: config.pr_checks,
    });

    if (!qualityResult.success) {
      const errorLines = [
        "Quality gate failed. The following checks must pass before pushing:",
        ...qualityResult.errors.map((e) => `  • ${e}`),
      ];
      if (qualityResult.skipped.length > 0) {
        errorLines.push("");
        errorLines.push("Skipped checks:");
        errorLines.push(...qualityResult.skipped.map((s) => `  • ${s}`));
      }
      const error = errorLines.join("\n");
      item = { ...item, last_error: error };
      await saveItem(root, item);
      return { success: false, item, error };
    }

    if (qualityResult.skipped.length > 0) {
      for (const skipped of qualityResult.skipped) {
        logger.info(`Skipped: ${skipped}`);
      }
    }
  }

  // Validate remote URL (Gap 6: Remote Validation)
  // This prevents pushing code to the wrong repository
  if (!dryRun) {
    const remoteValidation: RemoteValidationResult = await validateRemoteUrl(
      "origin",
      config.pr_checks.allowed_remote_patterns,
      gitOptions
    );

    if (!remoteValidation.valid) {
      const errorLines = [
        "Remote URL validation failed.",
        "This check prevents pushing code to an unintended repository.",
        "",
        ...remoteValidation.errors.map((e) => `  • ${e}`),
        "",
        "To fix this:",
        "  1. Verify the correct remote is configured: git remote -v",
        "  2. Update the remote if needed: git remote set-url origin <correct-url>",
        "  3. Or add the remote pattern to pr_checks.allowed_remote_patterns in config",
      ];
      const error = errorLines.join("\n");
      item = { ...item, last_error: error };
      await saveItem(root, item);
      return { success: false, item, error };
    }

    if (remoteValidation.actualUrl) {
      logger.info(`Remote URL validated: ${remoteValidation.actualUrl}`);
    }
  }

  // Handle direct merge mode (Gap 4: Direct Mode Safeguards)
  if (config.merge_mode === "direct") {
    // Check for explicit opt-in to unsafe direct merge
    if (!config.pr_checks.allow_unsafe_direct_merge) {
      const error = [
        "Direct merge mode is enabled but requires explicit opt-in.",
        "Direct mode bypasses PR review, CI checks, and branch protections.",
        "",
        "To enable direct merge mode, add to your .wreckit/config.json:",
        '  {',
        '    "pr_checks": {',
        '      "allow_unsafe_direct_merge": true',
        '    }',
        '  }',
        "",
        "Direct mode should only be used for:",
        "  - Greenfield projects with no production risk",
        "  - Personal projects with no collaborators",
        "  - Temporary development environments",
      ].join("\n");
      item = { ...item, last_error: error };
      await saveItem(root, item);
      return { success: false, item, error };
    }

    // Warn about direct mode risks
    logger.warn(
      "DIRECT MERGE MODE ENABLED: This bypasses PR review, CI checks, " +
      "and branch protections. Only use for greenfield projects with no production risk."
    );

    // Check for merge conflicts before attempting merge (Gap 5: Conflict Pre-Check)
    // This prevents leaving the repo in an inconsistent state if merge fails
    if (!dryRun) {
      const conflictCheck = await checkMergeConflicts(
        config.base_branch,
        branchResult.branchName,
        gitOptions
      );

      if (conflictCheck.hasConflicts) {
        const error = conflictCheck.error ?? "Merge conflict detected";
        item = { ...item, last_error: error };
        await saveItem(root, item);
        return { success: false, item, error };
      }

      logger.info("No merge conflicts detected, proceeding with direct merge");
    }

    // Create rollback anchor before merge (Gap 4: Rollback Anchors)
    let rollbackSha: string | null = null;
    if (!dryRun) {
      try {
        rollbackSha = await getBranchSha(config.base_branch, gitOptions);
        logger.info(`Rollback anchor: ${config.base_branch} is at ${rollbackSha}`);
        logger.info(`To rollback: git reset --hard ${rollbackSha} && git push --force origin ${config.base_branch}`);
      } catch (err) {
        const error = `Failed to capture rollback SHA: ${err instanceof Error ? err.message : String(err)}`;
        item = { ...item, last_error: error };
        await saveItem(root, item);
        return { success: false, item, error };
      }
    }

    const commitMessage = `feat(${itemSlug}): ${item.title}`;
    try {
      await mergeAndPushToBase(
        config.base_branch,
        branchResult.branchName,
        commitMessage,
        gitOptions
      );

      // Verify merge landed on remote (Spec 006 Gap 2: Direct Mode Verification)
      // Fetch the remote state to confirm the merge is visible on the remote
      if (!dryRun) {
        try {
          // Fetch the remote base branch to verify our merge is there
          await runGitCommand(["fetch", "origin", config.base_branch], gitOptions);

          // Get the local HEAD SHA
          const localHeadResult = await runGitCommand(
            ["rev-parse", config.base_branch],
            gitOptions
          );
          if (localHeadResult.exitCode !== 0) {
            throw new Error("Failed to get local HEAD SHA");
          }
          const localHeadSha = localHeadResult.stdout.trim();

          // Get the remote HEAD SHA
          const remoteHeadResult = await runGitCommand(
            ["rev-parse", `origin/${config.base_branch}`],
            gitOptions
          );
          if (remoteHeadResult.exitCode !== 0) {
            throw new Error("Failed to get remote HEAD SHA");
          }
          const remoteHeadSha = remoteHeadResult.stdout.trim();

          // Verify they match
          if (localHeadSha !== remoteHeadSha) {
            logger.warn(
              `Merge verification warning: local HEAD (${localHeadSha}) does not match remote HEAD (${remoteHeadSha}). ` +
              `This is expected if the push to origin failed or was skipped.`
            );
          } else {
            logger.info(
              `Direct merge verified: local and remote ${config.base_branch} both at ${localHeadSha}`
            );
          }
        } catch (verifyErr) {
          const verifyError = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
          logger.warn(`Direct merge verification skipped or failed: ${verifyError}`);
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      item = { ...item, last_error: error };
      await saveItem(root, item);
      return { success: false, item, error };
    }

    // Record completion metadata (Spec 006 Gap 5: Audit Trail)
    const completedAt = new Date().toISOString();
    item = {
      ...item,
      state: "done",
      branch: branchResult.branchName,
      pr_url: null,
      pr_number: null,
      last_error: null,
      rollback_sha: rollbackSha,
      completed_at: completedAt,
    };
    await saveItem(root, item);

    // Log completion to progress.log (Spec 006 Gap 5: Audit Trail)
    const progressPath = getProgressLogPath(root, item.id);
    const logEntry = `[${completedAt}] Completed: Direct merge to ${config.base_branch}\n`;
    if (rollbackSha) {
      await fs.appendFile(progressPath, `${logEntry}Rollback SHA: ${rollbackSha}\n`, "utf-8");
    } else {
      await fs.appendFile(progressPath, logEntry, "utf-8");
    }

    logger.info(
      `Merged ${itemId} directly to ${config.base_branch} (direct mode)` +
      (rollbackSha ? ` - Rollback SHA: ${rollbackSha}` : "")
    );

    // Branch cleanup for direct mode (Gap 4: Branch Cleanup)
    if (config.branch_cleanup.enabled && branchResult.branchName) {
      const cleanupResult = await cleanupBranch(
        branchResult.branchName,
        config.base_branch,
        {
          ...gitOptions,
          deleteRemote: config.branch_cleanup.delete_remote,
        }
      );
      if (cleanupResult.error) {
        logger.warn(`Branch cleanup warning: ${cleanupResult.error}`);
      }
    } else if (!dryRun) {
      // Switch back to base branch even if cleanup is disabled
      const checkoutResult = await runGitCommand(["checkout", config.base_branch], gitOptions);
      if (checkoutResult.exitCode !== 0) {
        logger.warn(`Failed to switch back to ${config.base_branch}: ${checkoutResult.stdout}`);
      }
    }

    return { success: true, item };
  }

  // PR mode: Push branch with error handling
  try {
    await pushBranch(branchResult.branchName, gitOptions);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    item = { ...item, last_error: error };
    await saveItem(root, item);
    return { success: false, item, error };
  }

  // Generate PR description using Claude
  let prTitle = item.title;
  let prBody = `## Overview\n\n${item.overview}\n\n---\n\n*Automated PR created by wreckit*`;

  if (!dryRun) {
    try {
      const template = await loadPromptTemplate(root, "pr");
      const variables = await buildPromptVariables(root, item, config);
      const prompt = renderPrompt(template, variables);

      const agentConfig = getAgentConfigUnion(config);
      const result = await runAgentUnion({
        config: agentConfig,
        cwd: itemDir,
        prompt,
        logger,
        dryRun: false,
        mockAgent,
        timeoutSeconds: config.timeout_seconds,
        onStdoutChunk: onAgentOutput,
        onStderrChunk: onAgentOutput,
        onAgentEvent,
        // Restrict to read + bash tools for PR phase
        allowedTools: getAllowedToolsForPhase("pr"),
      });

      if (result.success) {
        const parsed = parsePrJson(result.output);
        if (parsed) {
          prTitle = parsed.title;
          prBody = parsed.body;
          logger.info("Generated PR description using Claude");
        } else {
          logger.warn("Could not parse PR JSON from agent output, using default description");
        }
      } else {
        logger.warn("Agent failed to generate PR description, using default");
      }
    } catch (err) {
      logger.warn(`Failed to generate PR description: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Create or update PR
  let prResult;
  try {
    prResult = await createOrUpdatePr(
      config.base_branch,
      branchResult.branchName,
      prTitle,
      prBody,
      gitOptions
    );
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    item = { ...item, last_error: error };
    await saveItem(root, item);
    return { success: false, item, error };
  }

  // Check PR mergeability after creation (Gap 7: Mergeability Check After PR Creation)
  // This helps detect merge conflicts early so users can resolve them before review
  if (!dryRun && prResult.created) {
    const mergeability: PrMergeabilityResult = await checkPrMergeability(
      prResult.number,
      gitOptions
    );

    if (mergeability.determined) {
      if (mergeability.mergeable) {
        logger.info(`PR #${prResult.number} is mergeable (no conflicts)`);
      } else {
        // PR has merge conflicts - warn but don't fail
        // The user can resolve conflicts in the PR
        logger.warn(
          `PR #${prResult.number} has merge conflicts and may not be mergeable. ` +
          `Please resolve conflicts in the PR or rebase.`
        );
      }
    } else {
      // GitHub hasn't calculated mergeability yet
      logger.info(
        `PR #${prResult.number} created. Mergeability status not yet available ` +
        `from GitHub (may take a moment).`
      );
    }
  }

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

  // Switch back to base branch after PR creation
  if (!dryRun) {
    const checkoutResult = await runGitCommand(["checkout", config.base_branch], gitOptions);
    if (checkoutResult.exitCode !== 0) {
      logger.warn(`Failed to switch back to ${config.base_branch}: ${checkoutResult.stdout}`);
    }
  }

  return { success: true, item };
}

export async function runPhaseComplete(
  itemId: string,
  options: WorkflowOptions
): Promise<PhaseResult> {
  const { root, config, logger, dryRun = false } = options;

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

  // Enhanced PR merge validation (Spec 006 Gap 1: Minimal Merge Validation)
  const prDetails: PrDetails = await getPrDetails(item.pr_number, gitOptions);

  // Check if gh command succeeded (Gap 3: Silent gh Failures)
  if (!prDetails.querySucceeded) {
    const errorMsg = prDetails.error ?? "gh command failed";
    return {
      success: false,
      item,
      error: `Failed to query PR status: ${errorMsg}. Check that gh is installed and authenticated.`,
    };
  }

  // Check if PR is merged
  if (!prDetails.merged) {
    return {
      success: false,
      item,
      error: "PR not merged yet",
    };
  }

  // Validate PR merged to correct branch
  if (prDetails.baseRefName !== config.base_branch) {
    return {
      success: false,
      item,
      error: `PR merged to ${prDetails.baseRefName}, expected ${config.base_branch}. This may indicate incorrect merge target.`,
    };
  }

  // Validate head branch matches expected item branch
  const expectedBranch = `${config.branch_prefix}${item.id.replace("/", "-")}`;
  if (prDetails.headRefName !== expectedBranch) {
    logger.warn(
      `PR head branch ${prDetails.headRefName} differs from expected ${expectedBranch}. ` +
      `This may indicate the wrong PR was merged.`
    );
  }

  // Log completion metadata for audit trail (Spec 006 Gap 5: Audit Trail)
  logger.info(
    `PR #${item.pr_number} merged at ${prDetails.mergedAt}` +
    (prDetails.mergeCommitOid ? ` (commit: ${prDetails.mergeCommitOid})` : "") +
    (prDetails.checksPassed !== null ? ` - CI checks: ${prDetails.checksPassed ? "PASSED" : "FAILED/UNKNOWN"}` : "")
  );

  // Warn if CI checks didn't pass
  if (prDetails.checksPassed === false) {
    logger.warn(
      `PR #${item.pr_number} was merged but CI checks did not pass. ` +
      `This may indicate force-merge or bypassed review.`
    );
  }

  // Record completion metadata in item (Spec 006 Gap 5: Audit Trail)
  const completedAt = new Date().toISOString();
  item = {
    ...item,
    state: "done",
    last_error: null,
    completed_at: completedAt,
    merged_at: prDetails.mergedAt,
    merge_commit_sha: prDetails.mergeCommitOid,
    checks_passed: prDetails.checksPassed,
  };
  await saveItem(root, item);

  // Log completion to progress.log (Spec 006 Gap 5: Audit Trail)
  const progressPath = getProgressLogPath(root, item.id);
  const logEntry = `[${completedAt}] Completed: PR #${item.pr_number} merged to ${prDetails.baseRefName} at ${prDetails.mergedAt}\n`;
  if (prDetails.mergeCommitOid) {
    await fs.appendFile(progressPath, `${logEntry}Merge commit: ${prDetails.mergeCommitOid}\n`, "utf-8");
  } else {
    await fs.appendFile(progressPath, logEntry, "utf-8");
  }

  logger.info(`Completed ${itemId}`);

  // Branch cleanup for PR mode (Gap 4: Branch Cleanup)
  if (config.branch_cleanup.enabled && item.branch) {
    const cleanupResult = await cleanupBranch(
      item.branch,
      config.base_branch,
      {
        ...gitOptions,
        deleteRemote: config.branch_cleanup.delete_remote,
      }
    );
    if (cleanupResult.error) {
      logger.warn(`Branch cleanup warning: ${cleanupResult.error}`);
    }
  } else if (!dryRun) {
    // Switch back to base branch even if cleanup is disabled
    const checkoutResult = await runGitCommand(["checkout", config.base_branch], gitOptions);
    if (checkoutResult.exitCode !== 0) {
      logger.warn(`Failed to switch back to ${config.base_branch}: ${checkoutResult.stdout}`);
    }
  }

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
    case "idea":
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
