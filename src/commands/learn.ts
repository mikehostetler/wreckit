import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as readline from "node:readline";
import type { Logger } from "../logging";
import type { SkillConfig } from "../schemas";
import { SkillConfigSchema } from "../schemas";
import { findRootFromOptions, getSkillsPath } from "../fs/paths";
import { loadConfig, type ConfigResolved } from "../config";
import { loadPromptTemplate, renderPrompt, type PromptName } from "../prompts";
import { runAgentUnion, getAgentConfigUnion } from "../agent/runner";
import { getAllowedToolsForPhase, PHASE_TOOL_ALLOWLISTS } from "../agent/toolAllowlist";
import { pathExists } from "../fs/util";
import { scanItems } from "../domain/indexing";
import { resolveId } from "../domain/resolveId";
import { getItemDir, readItem } from "../fs";
import { safeWriteJson } from "../fs/atomic";
import type { ToolName } from "../agent/toolAllowlist";

export interface LearnOptions {
  patterns?: string[];
  item?: string;
  phase?: string;
  all?: boolean;
  output?: string;
  merge?: "append" | "replace" | "ask";
  review?: boolean;
  dryRun?: boolean;
  cwd?: string;
  verbose?: boolean;
}

/**
 * Determine which items to extract patterns from based on command options.
 */
async function determineSourceItems(
  root: string,
  options: LearnOptions,
  logger: Logger
): Promise<{ items: any[]; context: string }> {
  const allItems = await scanItems(root);

  // --item <id>: Extract from specific item
  if (options.item) {
    const resolvedId = await resolveId(root, options.item);
    const itemDir = getItemDir(root, resolvedId);
    const item = await readItem(itemDir);
    logger.info(`Extracting patterns from item: ${resolvedId}`);
    const context = `Source item: ${item.id} - ${item.title}\nState: ${item.state}`;
    return { items: [item], context };
  }

  // --phase <state>: Extract from items in specific state
  if (options.phase) {
    const filteredItems = allItems.filter(i => i.state === options.phase);
    logger.info(`Extracting patterns from ${filteredItems.length} items in state: ${options.phase}`);
    const context = `Source items: ${filteredItems.length} items in state '${options.phase}'`;
    return { items: filteredItems, context };
  }

  // --all: Extract from all completed items
  if (options.all) {
    const completedItems = allItems.filter(i => i.state === "done");
    logger.info(`Extracting patterns from ${completedItems.length} completed items`);
    const context = `Source items: ${completedItems.length} completed items`;
    return { items: completedItems, context };
  }

  // Default: extract from most recent 5 completed items
  const completedItems = allItems
    .filter(i => i.state === "done")
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  const recentItems = completedItems.slice(0, 5);
  logger.info(`Extracting patterns from ${recentItems.length} recent completed items (default)`);
  const context = `Source items: ${recentItems.length} recent completed items`;
  return { items: recentItems, context };
}

/**
 * Load existing skills configuration from .wreckit/skills.json.
 * Returns null if the file doesn't exist.
 */
async function loadExistingSkills(root: string): Promise<SkillConfig | null> {
  const skillsPath = getSkillsPath(root);
  try {
    const content = await fs.readFile(skillsPath, "utf-8");
    const result = SkillConfigSchema.safeParse(JSON.parse(content));
    if (result.success) {
      return result.data;
    } else {
      throw new Error(`Invalid skills.json: ${result.error.message}`);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;  // No existing skills.json
    }
    throw err;
  }
}

/**
 * Perform append merge of skill configs.
 * Extracted as a helper to reuse in both append and ask strategies.
 */
function performAppendMerge(
  existing: SkillConfig,
  extracted: SkillConfig
): SkillConfig {
  // Merge phase_skills: keep existing, add new
  const phaseSkills = { ...existing.phase_skills };
  for (const [phase, skillIds] of Object.entries(extracted.phase_skills)) {
    const existingIds = phaseSkills[phase] || [];
    const newIds = skillIds.filter(id => !existingIds.includes(id));
    phaseSkills[phase] = [...existingIds, ...newIds];
  }

  // Merge skills: keep existing, add new (by ID)
  const existingSkillsMap = new Map(
    existing.skills.map(s => [s.id, s])
  );
  for (const skill of extracted.skills) {
    if (!existingSkillsMap.has(skill.id)) {
      existingSkillsMap.set(skill.id, skill);
    }
  }

  return {
    phase_skills: phaseSkills,
    skills: Array.from(existingSkillsMap.values())
  };
}

/**
 * Merge skill configurations based on the specified strategy.
 */
export async function mergeSkillConfigs(
  existing: SkillConfig | null,
  extracted: SkillConfig,
  strategy: "append" | "replace" | "ask"
): Promise<SkillConfig> {
  if (!existing) {
    return extracted;  // No existing skills, use extracted
  }

  switch (strategy) {
    case "replace":
      return extracted;  // Replace entirely

    case "append":
      return performAppendMerge(existing, extracted);

    case "ask": {
      // Check if running in TTY environment
      if (!process.stdout.isTTY) {
        console.warn("Not a TTY environment. Falling back to 'append' merge strategy.");
        return performAppendMerge(existing, extracted);
      }

      // Interactive merge
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      try {
        // ANSI formatting for better UX
        const fmt = {
          bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
          dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
          cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
          yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
          green: (s: string) => `\x1b[32m${s}\x1b[0m`,
        };

        const ask = (question: string): Promise<string> => {
          return new Promise((resolve) => {
            rl.question(question, (answer) => {
              resolve(answer.trim());
            });
          });
        };

        console.log("");
        console.log(fmt.bold("Interactive Skill Merge"));
        console.log(fmt.dim("─".repeat(60)));

        // Collect phase_skills conflicts
        const phaseConflicts: Array<{
          phase: string;
          skillId: string;
          existingPhases: string[];
          extractedPhases: string[];
        }> = [];

        const allPhases = new Set([
          ...Object.keys(existing.phase_skills),
          ...Object.keys(extracted.phase_skills),
        ]);

        for (const phase of allPhases) {
          const existingIds = existing.phase_skills[phase] || [];
          const extractedIds = extracted.phase_skills[phase] || [];

          // Skills in extracted but not in existing for this phase
          for (const skillId of extractedIds) {
            if (!existingIds.includes(skillId)) {
              // Check if skill exists in a different phase
              const existingPhase = Object.entries(existing.phase_skills).find(
                ([_, ids]) => ids.includes(skillId)
              )?.[0];

              if (existingPhase) {
                // Conflict: skill in different phase
                phaseConflicts.push({
                  phase,
                  skillId,
                  existingPhases: [existingPhase],
                  extractedPhases: [phase],
                });
              } else {
                // No conflict: new skill, add it
                // Will be handled by non-conflict merge
              }
            }
          }
        }

        // If no conflicts, just append
        if (phaseConflicts.length === 0) {
          console.log(fmt.green("✓") + " No conflicts found. Using append strategy.");
          return performAppendMerge(existing, extracted);
        }

        console.log(
          fmt.yellow(`Found ${phaseConflicts.length} conflict${phaseConflicts.length > 1 ? "s" : ""} to resolve:\n`)
        );

        // Initialize result with existing config
        const resultPhaseSkills = { ...existing.phase_skills };
        const resultSkillsMap = new Map(existing.skills.map(s => [s.id, s]));

        // Add all non-conflicting skills from extracted
        for (const skill of extracted.skills) {
          if (!resultSkillsMap.has(skill.id)) {
            resultSkillsMap.set(skill.id, skill);
          }
        }

        // Resolve each conflict
        for (let i = 0; i < phaseConflicts.length; i++) {
          const conflict = phaseConflicts[i];
          const existingPhase = conflict.existingPhases[0];
          const extractedPhase = conflict.extractedPhases[0];

          console.log(
            fmt.bold(`[${i + 1}/${phaseConflicts.length}]`) +
            ` Skill: ${fmt.cyan(conflict.skillId)}`
          );
          console.log(`  Existing: phase=${fmt.dim(existingPhase)}`);
          console.log(`  Extracted: phase=${fmt.dim(extractedPhase)}`);

          const answer = await ask(
            `  Choose: ${fmt.green("1")} keep ${fmt.dim(existingPhase)}, ` +
            `${fmt.green("2")} use ${fmt.dim(extractedPhase)}, ` +
            `${fmt.green("3")} add to ${fmt.dim("both")}, ` +
            `${fmt.dim("[default: 1]")} > `
          );

          const choice = answer || "1";

          switch (choice) {
            case "1":
              // Keep existing - do nothing
              console.log(`  → Keeping in ${fmt.dim(existingPhase)} phase\n`);
              break;
            case "2":
              // Use extracted: remove from existing, add to extracted
              resultPhaseSkills[existingPhase] = resultPhaseSkills[existingPhase].filter(
                id => id !== conflict.skillId
              );
              resultPhaseSkills[extractedPhase] = [
                ...(resultPhaseSkills[extractedPhase] || []),
                conflict.skillId,
              ];
              console.log(`  → Moved to ${fmt.dim(extractedPhase)} phase\n`);
              break;
            case "3":
              // Add to both phases
              resultPhaseSkills[extractedPhase] = [
                ...(resultPhaseSkills[extractedPhase] || []),
                conflict.skillId,
              ];
              console.log(`  → Added to both phases\n`);
              break;
            default:
              console.log(fmt.yellow("  → Invalid choice, keeping existing\n"));
          }
        }

        // Add any remaining non-conflicting phase_skills
        for (const [phase, skillIds] of Object.entries(extracted.phase_skills)) {
          const existingIds = resultPhaseSkills[phase] || [];
          const newIds = skillIds.filter(id => !existingIds.includes(id));
          resultPhaseSkills[phase] = [...existingIds, ...newIds];
        }

        console.log(fmt.green("✓") + " Merge complete.\n");

        return {
          phase_skills: resultPhaseSkills,
          skills: Array.from(resultSkillsMap.values()),
        };
      } finally {
        rl.close();
      }
    }
  }
}

/**
 * Validate that skill tools are allowed in their assigned phases.
 * Issues warnings but does not throw errors.
 */
function validateSkillTools(
  skillConfig: SkillConfig,
  logger: Logger
): void {
  for (const skill of skillConfig.skills) {
    for (const [phase, skillIds] of Object.entries(skillConfig.phase_skills)) {
      if (skillIds.includes(skill.id)) {
        const phaseTools = PHASE_TOOL_ALLOWLISTS[phase];
        if (phaseTools) {
          const invalidTools = skill.tools.filter(
            t => !phaseTools.includes(t as ToolName)
          );
          if (invalidTools.length > 0) {
            logger.warn(
              `Skill '${skill.id}' requests tools not allowed in '${phase}' phase: ` +
              invalidTools.join(", ")
            );
          }
        }
      }
    }
  }
}

/**
 * Run the learn phase to extract and compile codebase patterns into reusable Skill artifacts.
 *
 * The learn phase analyzes completed work to identify reusable patterns and compiles
 * them into Skill artifacts (stored in .wreckit/skills.json). This enables the system
 * to learn from its own implementations and improve over time.
 */
export async function learnCommand(
  options: LearnOptions,
  logger: Logger
): Promise<void> {
  const root = findRootFromOptions(options);
  const config = await loadConfig(root);

  // Determine source items
  const { items: sourceItems, context: sourceContext } = await determineSourceItems(root, options, logger);

  if (sourceItems.length === 0) {
    logger.warn("No source items found for pattern extraction");
    return;
  }

  // Load existing skills
  const existingSkills = await loadExistingSkills(root);
  const existingSkillsContext = existingSkills
    ? `\nExisting skills: ${existingSkills.skills.length} skills defined\n` +
      `Existing phases: ${Object.keys(existingSkills.phase_skills).join(", ")}`
    : "\nNo existing skills.json (will create new file)";

  // Determine output path
  const outputPath = options.output
    ? path.resolve(root, options.output)
    : getSkillsPath(root);

  if (options.dryRun) {
    logger.info("[dry-run] Would extract patterns and write to skills.json");
    logger.info(`  Root: ${root}`);
    logger.info(`  Source items: ${sourceItems.length}`);
    logger.info(`  ${sourceContext}`);
    logger.info(`  ${existingSkillsContext.trim()}`);
    logger.info(`  Output: ${outputPath}`);
    logger.info(`  Merge strategy: ${options.merge || "append"}`);
    return;
  }

  // Build prompt variables for learn phase
  const completionSignal =
    config.agent.kind === "process"
      ? config.agent.completion_signal
      : "<promise>COMPLETE</promise>";

  const variables = {
    id: "learn",
    title: "Pattern Extraction",
    section: "skills",
    overview: "Extract and compile codebase patterns into reusable Skill artifacts",
    item_path: root,
    branch_name: "",
    base_branch: config.base_branch,
    completion_signal: completionSignal,
    output_path: outputPath,
    merge_strategy: options.merge || "append",
    source_items_context: sourceContext + existingSkillsContext,
  };

  // Load learn prompt template
  const template = await loadPromptTemplate(root, "learn" as PromptName);
  const prompt = renderPrompt(template, variables);

  const agentConfig = getAgentConfigUnion(config);

  logger.info("Running pattern extraction...");

  // Run agent with learn phase tools
  const result = await runAgentUnion({
    config: agentConfig,
    cwd: root,
    prompt,
    logger,
    dryRun: options.dryRun,
    mockAgent: false,
    timeoutSeconds: config.timeout_seconds,
    allowedTools: getAllowedToolsForPhase("learn"),
  });

  if (!result.success) {
    const error = result.timedOut
      ? "Agent timed out during pattern extraction"
      : `Agent failed with exit code ${result.exitCode}`;
    throw new Error(error);
  }

  // Verify skills.json was created
  if (!(await pathExists(outputPath))) {
    throw new Error("Agent did not create skills.json");
  }

  // Validate skills.json format
  const skillsContent = await fs.readFile(outputPath, "utf-8");
  const extractedValidation = SkillConfigSchema.safeParse(JSON.parse(skillsContent));

  if (!extractedValidation.success) {
    const errorMsg = `Extracted skills.json format validation failed:\n${extractedValidation.error.message}`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  // Merge with existing skills based on strategy
  const finalSkills = await mergeSkillConfigs(
    existingSkills,
    extractedValidation.data,
    options.merge || "append"
  );

  // Validate tool permissions
  validateSkillTools(finalSkills, logger);

  // Write final skills.json
  await safeWriteJson(outputPath, finalSkills);

  logger.info(`Pattern extraction complete.`);
  logger.info(`  Extracted: ${extractedValidation.data.skills.length} skills`);
  logger.info(`  Final total: ${finalSkills.skills.length} skills`);
  logger.info(`  Written to: ${outputPath}`);
}
