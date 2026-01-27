import type { Logger } from "../logging";
import { findRootFromOptions, getItemDir } from "../fs/paths";
import { readItem, writeItem } from "../fs/json";
import { loadConfig } from "../config";
import { FileNotFoundError, WreckitError } from "../errors";
import { runGitCommand, type GitOptions } from "../git";

export interface RollbackOptions {
  force?: boolean;
  dryRun?: boolean;
  cwd?: string;
}

export interface RollbackResult {
  success: boolean;
  rollbackSha: string | null;
  error?: string;
}

export async function rollbackCommand(
  itemId: string,
  options: RollbackOptions,
  logger: Logger,
): Promise<RollbackResult> {
  const { force = false, dryRun = false, cwd } = options;
  const root = findRootFromOptions(options);
  const config = await loadConfig(root);

  const itemDir = getItemDir(root, itemId);
  let item;
  try {
    item = await readItem(itemDir);
  } catch (err) {
    if (err instanceof FileNotFoundError) {
      throw new WreckitError(`Item not found: ${itemId}`, "ITEM_NOT_FOUND");
    }
    throw err;
  }

  if (!item.rollback_sha) {
    return {
      success: false,
      rollbackSha: null,
      error:
        "No rollback anchor found. Rollback is only available for items completed via direct merge mode.",
    };
  }

  if (item.state !== "done" && !force) {
    return {
      success: false,
      rollbackSha: item.rollback_sha,
      error: `Item is in state '${item.state}', expected 'done'. Use --force to rollback anyway.`,
    };
  }

  const gitOptions: GitOptions = { cwd: root, logger, dryRun };

  if (dryRun) {
    logger.info(
      `[dry-run] Would rollback ${config.base_branch} to ${item.rollback_sha}`,
    );
    logger.info(`[dry-run] Would reset item ${itemId} to state 'implementing'`);
    return { success: true, rollbackSha: item.rollback_sha };
  }

  logger.warn(
    `Rolling back ${config.base_branch} to ${item.rollback_sha}. ` +
      `This will FORCE PUSH to the remote and may disrupt other collaborators.`,
  );

  const checkoutResult = await runGitCommand(
    ["checkout", config.base_branch],
    gitOptions,
  );
  if (checkoutResult.exitCode !== 0) {
    return {
      success: false,
      rollbackSha: item.rollback_sha,
      error: `Failed to checkout ${config.base_branch}: ${checkoutResult.stdout}`,
    };
  }

  const resetResult = await runGitCommand(
    ["reset", "--hard", item.rollback_sha],
    gitOptions,
  );
  if (resetResult.exitCode !== 0) {
    return {
      success: false,
      rollbackSha: item.rollback_sha,
      error: `Failed to reset to ${item.rollback_sha}: ${resetResult.stdout}`,
    };
  }

  const pushResult = await runGitCommand(
    ["push", "--force", "origin", config.base_branch],
    gitOptions,
  );
  if (pushResult.exitCode !== 0) {
    return {
      success: false,
      rollbackSha: item.rollback_sha,
      error: `Failed to force push: ${pushResult.stdout}. Local reset succeeded - run 'git push --force origin ${config.base_branch}' manually.`,
    };
  }

  const updatedItem = {
    ...item,
    state: "implementing" as const,
    rollback_sha: null,
    completed_at: null,
    last_error: null,
    updated_at: new Date().toISOString(),
  };
  await writeItem(itemDir, updatedItem);

  logger.info(`Rolled back ${config.base_branch} to ${item.rollback_sha}`);
  logger.info(`Item ${itemId} reset to 'implementing' state`);

  return { success: true, rollbackSha: item.rollback_sha };
}
