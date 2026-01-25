import * as fs from "node:fs/promises";
import type { Item, WorkflowState } from "../schemas";
import type { PhaseResult, WorkflowOptions } from "./itemWorkflow";
import { getAgentConfigUnion, runAgentUnion } from "../agent/runner";
import { loadPromptTemplate, renderPrompt } from "../prompts";
import { getItemDir, getProgressLogPath, getPlanPath, getPrdPath, getResearchPath } from "../fs/paths";
import { readItem, writeItem } from "../fs/json";
import { getGitStatus, type GitFileChange } from "../git";

interface CritiqueResult {
  status: "approved" | "rejected";
  reason: string;
  critique: string;
}

function parseCritiqueJson(output: string): CritiqueResult | null {
  try {
    // Find JSON object in the output
    const jsonMatch = output.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    
    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed.status === "approved" || parsed.status === "rejected") {
      return parsed as CritiqueResult;
    }
    return null;
  } catch {
    return null;
  }
}

export async function runPhaseCritique(
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

  let item = await readItem(getItemDir(root, itemId));
  
  if (item.state !== "implementing" && item.state !== "critique") {
    return {
      success: false,
      item,
      error: `Item is in state ${item.state}, expected 'implementing' for critique phase`,
    };
  }

  // If already in critique state, we assume it passed previously or was manually moved
  if (item.state === "critique" && !options.force) {
    return { success: true, item };
  }

  const itemDir = getItemDir(root, item.id);
  const template = await loadPromptTemplate(root, "critique");
  
  // Load context for variables
  const plan = await fs.readFile(getPlanPath(root, item.id), "utf-8").catch(() => "");
  const prd = await fs.readFile(getPrdPath(root, item.id), "utf-8").catch(() => "");
  
  const variables = {
    id: item.id,
    title: item.title,
    overview: item.overview,
    plan,
    prd,
    section: item.section || "items",
    item_path: itemDir,
    branch_name: item.branch || "unknown",
    base_branch: config.base_branch,
    completion_signal: "JSON_OUTPUT",
    sdk_mode: true
  };

  const prompt = renderPrompt(template, variables);
  const agentConfig = getAgentConfigUnion(config);

  const result = await runAgentUnion({
    config: agentConfig,
    cwd: root, // Critic runs at root to see everything
    prompt,
    logger,
    dryRun,
    mockAgent,
    timeoutSeconds: config.timeout_seconds,
    onStdoutChunk: onAgentOutput,
    onStderrChunk: onAgentOutput,
    onAgentEvent,
    allowedTools: ["read_file", "run_shell_command", "glob", "search_file_content", "list_directory"], // Read-only tools
  });

  if (dryRun) {
    return { success: true, item };
  }

  if (mockAgent) {
    item = { ...item, state: "critique" };
    await writeItem(itemDir, item);
    return { success: true, item };
  }

  if (!result.success) {
    const error = "Critic agent failed to run";
    item = { ...item, last_error: error };
    await writeItem(itemDir, item);
    return { success: false, item, error };
  }

  const critique = parseCritiqueJson(result.output);
  
  if (!critique) {
    const error = "Critic failed to output valid JSON decision";
    logger.error(error);
    item = { ...item, last_error: error };
    await writeItem(itemDir, item);
    return { success: false, item, error };
  }

  // Log critique
  const progressPath = getProgressLogPath(root, item.id);
  const timestamp = new Date().toISOString();
  const logEntry = `\n[${timestamp}] CRITIQUE (${critique.status.toUpperCase()}):\n${critique.critique}\nReason: ${critique.reason}\n`;
  await fs.appendFile(progressPath, logEntry, "utf-8");

  if (critique.status === "rejected") {
    logger.warn(`Critic REJECTED implementation: ${critique.reason}`);
    
    // REGRESSION LOOP: Move back to planned
    item = { 
      ...item, 
      state: "planned", 
      last_error: `Critique Failed: ${critique.reason}` 
    };
    await writeItem(itemDir, item);
    return { success: false, item, error: "Critique rejected implementation" };
  }

  logger.info("Critic APPROVED implementation");
  item = { ...item, state: "critique", last_error: null };
  await writeItem(itemDir, item);

  return { success: true, item };
}
