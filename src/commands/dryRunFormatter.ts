import type { Logger } from "../logging";
import type { Item, Prd } from "../schemas";
import type { ConfigResolved } from "../config";
import { getNextPhase } from "../workflow";

export interface DryRunItemInfo {
  item: Item;
  prd: Prd | null;
  hasResearch: boolean;
  hasPlan: boolean;
  config: ConfigResolved;
}

const PHASE_DESCRIPTIONS: Record<string, string> = {
  research: "Gather context and requirements from codebase",
  plan: "Create implementation plan and user stories (prd.json)",
  implement: "Execute user stories with AI agent",
  pr: "Create/update pull request with changes",
  complete: "Mark item as done after PR merge",
};

function getPhaseSequence(currentState: string): string[] {
  const allPhases = ["research", "plan", "implement", "pr", "complete"];
  const stateToPhaseIndex: Record<string, number> = {
    raw: 0,
    researched: 1,
    planned: 2,
    implementing: 3,
    in_pr: 4,
    done: 5,
  };
  const startIndex = stateToPhaseIndex[currentState] ?? 0;
  return allPhases.slice(startIndex);
}

function formatBranchName(config: ConfigResolved, itemId: string): string {
  return `${config.branch_prefix}${itemId.replace("/", "-")}`;
}

export function formatDryRunItem(info: DryRunItemInfo, logger: Logger): void {
  const { item, prd, hasResearch, hasPlan, config } = info;
  const nextPhase = getNextPhase(item);
  const branchName = formatBranchName(config, item.id);

  logger.info("");
  logger.info(`━━━ ${item.id}: ${item.title} ━━━`);
  logger.info("");

  logger.info(`  Current State: ${item.state}`);
  if (item.last_error) {
    logger.info(`  Last Error:    ${item.last_error}`);
  }

  logger.info("");
  logger.info("  Artifacts:");
  logger.info(`    research.md: ${hasResearch ? "✓ exists" : "✗ missing"}`);
  logger.info(`    plan.md:     ${hasPlan ? "✓ exists" : "✗ missing"}`);
  logger.info(`    prd.json:    ${prd ? "✓ exists" : "✗ missing"}`);
  if (prd) {
    const pending = prd.user_stories.filter((s) => s.status === "pending").length;
    const done = prd.user_stories.filter((s) => s.status === "done").length;
    logger.info(`    Stories:     ${done}/${prd.user_stories.length} done, ${pending} pending`);
  }

  logger.info("");
  logger.info("  Would Execute:");
  const phases = getPhaseSequence(item.state);
  for (const phase of phases) {
    const desc = PHASE_DESCRIPTIONS[phase] || phase;
    const marker = phase === nextPhase ? "→" : " ";
    logger.info(`    ${marker} ${phase}: ${desc}`);
  }

  logger.info("");
  logger.info("  Git Operations:");
  logger.info(`    Branch:    ${item.branch || branchName}`);
  logger.info(`    Base:      ${config.base_branch}`);
  if (item.pr_url) {
    logger.info(`    PR:        ${item.pr_url} (exists)`);
  } else {
    logger.info(`    PR:        Would create new PR`);
  }
}

export function formatDryRunSummary(
  items: DryRunItemInfo[],
  logger: Logger
): void {
  logger.info("");
  logger.info("═══════════════════════════════════════════════════════════");
  logger.info("                    DRY RUN SUMMARY");
  logger.info("═══════════════════════════════════════════════════════════");

  const byState: Record<string, number> = {};
  for (const info of items) {
    byState[info.item.state] = (byState[info.item.state] || 0) + 1;
  }

  logger.info("");
  logger.info(`  Total items to process: ${items.length}`);
  logger.info("");
  logger.info("  By current state:");
  for (const [state, count] of Object.entries(byState)) {
    logger.info(`    ${state}: ${count}`);
  }

  for (const info of items) {
    formatDryRunItem(info, logger);
  }

  logger.info("");
  logger.info("═══════════════════════════════════════════════════════════");
  logger.info("  No changes made. Run without --dry-run to execute.");
  logger.info("═══════════════════════════════════════════════════════════");
}

export function formatDryRunPhase(
  phase: string,
  item: Item,
  targetState: string,
  config: ConfigResolved,
  logger: Logger
): void {
  const branchName = formatBranchName(config, item.id);
  const desc = PHASE_DESCRIPTIONS[phase] || phase;

  logger.info("");
  logger.info(`━━━ DRY RUN: ${phase} phase on ${item.id} ━━━`);
  logger.info("");
  logger.info(`  Item:        ${item.title}`);
  logger.info(`  Current:     ${item.state}`);
  logger.info(`  Target:      ${targetState}`);
  logger.info(`  Action:      ${desc}`);
  logger.info("");
  logger.info("  Git Operations:");
  logger.info(`    Branch:    ${item.branch || branchName}`);
  logger.info(`    Base:      ${config.base_branch}`);
  if (phase === "pr") {
    if (item.pr_url) {
      logger.info(`    PR:        Would update ${item.pr_url}`);
    } else {
      logger.info(`    PR:        Would create new PR`);
    }
  }
  logger.info("");
  logger.info("  No changes made. Run without --dry-run to execute.");
}

export function formatDryRunRun(
  item: Item,
  nextPhase: string,
  config: ConfigResolved,
  logger: Logger
): void {
  const branchName = formatBranchName(config, item.id);
  const phases = getPhaseSequence(item.state);

  logger.info("");
  logger.info(`━━━ DRY RUN: run ${item.id} ━━━`);
  logger.info("");
  logger.info(`  Item:        ${item.title}`);
  logger.info(`  Current:     ${item.state}`);
  logger.info(`  Next Phase:  ${nextPhase}`);
  logger.info("");
  logger.info("  Would Execute Phases:");
  for (const phase of phases) {
    const desc = PHASE_DESCRIPTIONS[phase] || phase;
    const marker = phase === nextPhase ? "→" : " ";
    logger.info(`    ${marker} ${phase}: ${desc}`);
  }
  logger.info("");
  logger.info("  Git Operations:");
  logger.info(`    Branch:    ${item.branch || branchName}`);
  logger.info(`    Base:      ${config.base_branch}`);
  if (item.pr_url) {
    logger.info(`    PR:        ${item.pr_url} (exists)`);
  } else {
    logger.info(`    PR:        Would create new PR`);
  }
  logger.info("");
  logger.info("  No changes made. Run without --dry-run to execute.");
}
