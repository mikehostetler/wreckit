import type { Logger } from "../logging";
import { runGitCommand } from "./index";
import {
  BranchError,
  PushError,
  MergeConflictError,
  GitError,
} from "../errors";

// Re-export GitOptions from index for type compatibility
export type { GitOptions } from "./index";

export interface BranchResult {
  branchName: string;
  created: boolean;
}

export interface BranchCleanupResult {
  localDeleted: boolean;
  remoteDeleted: boolean;
  error?: string;
}

export async function getCurrentBranch(options: {
  cwd: string;
  logger: Logger;
  dryRun?: boolean;
}): Promise<string> {
  const result = await runGitCommand(
    ["rev-parse", "--abbrev-ref", "HEAD"],
    options,
  );
  if (result.exitCode !== 0) {
    throw new GitError("Failed to get current branch");
  }
  return result.stdout;
}

/**
 * Get the current SHA of a branch or HEAD
 *
 * @param branch - Branch name or "HEAD" for current commit
 * @param options - Git options
 * @returns The commit SHA
 */
export async function getBranchSha(
  branch: string,
  options: { cwd: string; logger: Logger; dryRun?: boolean },
): Promise<string> {
  const result = await runGitCommand(["rev-parse", branch], options);
  if (result.exitCode !== 0) {
    throw new GitError(`Failed to get SHA for ${branch}`);
  }
  return result.stdout;
}

export async function branchExists(
  branchName: string,
  options: { cwd: string; logger: Logger; dryRun?: boolean },
): Promise<boolean> {
  const result = await runGitCommand(
    ["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`],
    options,
  );
  return result.exitCode === 0;
}

export async function cleanupBranch(
  branchName: string,
  baseBranch: string,
  options: {
    cwd: string;
    logger: Logger;
    dryRun?: boolean;
    deleteRemote?: boolean;
  },
): Promise<BranchCleanupResult> {
  const { logger, dryRun = false, deleteRemote = true } = options;
  const result: BranchCleanupResult = {
    localDeleted: false,
    remoteDeleted: false,
  };

  if (dryRun) {
    logger.info(`[dry-run] Would delete branch: ${branchName}`);
    if (deleteRemote) {
      logger.info(`[dry-run] Would delete remote branch: origin/${branchName}`);
    }
    return { localDeleted: true, remoteDeleted: deleteRemote };
  }

  const currentBranch = await getCurrentBranch(options);
  if (currentBranch === branchName) {
    logger.info(`Currently on ${branchName}, checking out ${baseBranch} first`);
    const checkoutResult = await runGitCommand(
      ["checkout", baseBranch],
      options,
    );
    if (checkoutResult.exitCode !== 0) {
      result.error = `Failed to checkout ${baseBranch} before deleting branch`;
      return result;
    }
  }

  const exists = await branchExists(branchName, options);
  if (exists) {
    const deleteResult = await runGitCommand(
      ["branch", "-D", branchName],
      options,
    );
    if (deleteResult.exitCode === 0) {
      result.localDeleted = true;
      logger.info(`Deleted local branch: ${branchName}`);
    } else {
      logger.warn(`Failed to delete local branch ${branchName}`);
    }
  } else {
    logger.debug(
      `Local branch ${branchName} does not exist, skipping local delete`,
    );
    result.localDeleted = true;
  }

  if (deleteRemote) {
    const remoteDeleteResult = await runGitCommand(
      ["push", "origin", "--delete", branchName],
      options,
    );
    if (remoteDeleteResult.exitCode === 0) {
      result.remoteDeleted = true;
      logger.info(`Deleted remote branch: origin/${branchName}`);
    } else {
      logger.debug(
        `Remote branch origin/${branchName} may not exist or already deleted`,
      );
      result.remoteDeleted = true;
    }
  }

  return result;
}

export async function ensureBranch(
  baseBranch: string,
  branchPrefix: string,
  itemSlug: string,
  options: { cwd: string; logger: Logger; dryRun?: boolean },
): Promise<BranchResult> {
  const { logger, dryRun = false } = options;
  const branchName = `${branchPrefix}${itemSlug}`;

  if (dryRun) {
    logger.info(`[dry-run] Would ensure branch: ${branchName}`);
    return { branchName, created: true };
  }

  const exists = await branchExists(branchName, options);

  if (exists) {
    logger.info(`Branch ${branchName} exists, switching to it`);
    const checkoutResult = await runGitCommand(
      ["checkout", branchName],
      options,
    );
    if (checkoutResult.exitCode !== 0) {
      throw new BranchError(
        branchName,
        "checkout",
        `Failed to checkout existing branch ${branchName}`,
      );
    }
    return { branchName, created: false };
  }

  logger.info(`Creating branch ${branchName} from ${baseBranch}`);
  const checkoutBase = await runGitCommand(["checkout", baseBranch], options);
  if (checkoutBase.exitCode !== 0) {
    throw new BranchError(
      baseBranch,
      "checkout",
      `Failed to checkout base branch ${baseBranch}`,
    );
  }
  const createBranch = await runGitCommand(
    ["checkout", "-b", branchName],
    options,
  );
  if (createBranch.exitCode !== 0) {
    throw new BranchError(
      branchName,
      "create",
      `Failed to create branch ${branchName}`,
    );
  }

  return { branchName, created: true };
}

export async function commitAll(
  message: string,
  options: { cwd: string; logger: Logger; dryRun?: boolean },
): Promise<void> {
  const { logger, dryRun = false } = options;

  if (dryRun) {
    logger.info(`[dry-run] Would commit: ${message}`);
    return;
  }

  await runGitCommand(["add", "-A"], options);
  await runGitCommand(["commit", "-m", message], options);
}

export async function pushBranch(
  branchName: string,
  options: { cwd: string; logger: Logger; dryRun?: boolean },
): Promise<void> {
  const { logger, dryRun = false } = options;

  if (dryRun) {
    logger.info(`[dry-run] Would push branch: ${branchName}`);
    return;
  }

  const result = await runGitCommand(
    ["push", "-u", "origin", branchName],
    options,
  );
  if (result.exitCode !== 0) {
    throw new PushError(
      branchName,
      "origin",
      `Failed to push branch ${branchName} to origin. ` +
        `Check that you have push access and the remote is configured correctly.`,
    );
  }
}

export async function mergeAndPushToBase(
  baseBranch: string,
  featureBranch: string,
  commitMessage: string,
  options: { cwd: string; logger: Logger; dryRun?: boolean },
): Promise<void> {
  const { logger, dryRun = false } = options;

  if (dryRun) {
    logger.info(
      `[dry-run] Would merge ${featureBranch} into ${baseBranch} and push`,
    );
    return;
  }

  // Switch to base branch
  const checkoutResult = await runGitCommand(["checkout", baseBranch], options);
  if (checkoutResult.exitCode !== 0) {
    throw new BranchError(
      baseBranch,
      "checkout",
      `Failed to checkout base branch ${baseBranch}`,
    );
  }

  // Pull latest changes from remote
  const pullResult = await runGitCommand(["pull", "--ff-only"], options);
  if (pullResult.exitCode !== 0) {
    throw new GitError(
      `Failed to pull latest ${baseBranch}. Resolve conflicts manually or try again.`,
    );
  }

  // Merge feature branch with a merge commit
  const mergeResult = await runGitCommand(
    ["merge", featureBranch, "--no-ff", "-m", commitMessage],
    options,
  );
  if (mergeResult.exitCode !== 0) {
    throw new MergeConflictError(featureBranch, baseBranch);
  }

  // Push to remote
  const pushResult = await runGitCommand(
    ["push", "origin", baseBranch],
    options,
  );
  if (pushResult.exitCode !== 0) {
    logger.warn(
      `Failed to push ${baseBranch} to origin. This may be expected in local-only environments.`,
    );
  } else {
    logger.info(
      `Merged ${featureBranch} into ${baseBranch} and pushed to origin`,
    );
  }
}

export async function getBranchSyncStatus(options: {
  cwd: string;
  logger: Logger;
  dryRun?: boolean;
}): Promise<"synced" | "ahead" | "behind" | "diverged" | "no-upstream"> {
  const branch = await runGitCommand(
    ["rev-parse", "--abbrev-ref", "HEAD"],
    options,
  );
  if (branch.exitCode !== 0) {
    return "no-upstream";
  }

  await runGitCommand(["fetch", "--quiet"], options);

  const upstream = await runGitCommand(
    ["rev-parse", "--abbrev-ref", `${branch.stdout}@{upstream}`],
    options,
  );
  if (upstream.exitCode !== 0) {
    return "no-upstream";
  }

  const aheadBehind = await runGitCommand(
    [
      "rev-list",
      "--left-right",
      "--count",
      `${branch.stdout}...${upstream.stdout}`,
    ],
    options,
  );
  if (aheadBehind.exitCode !== 0) {
    return "no-upstream";
  }

  const [ahead, behind] = aheadBehind.stdout.split(/\s+/).map(Number);
  if (ahead > 0 && behind > 0) return "diverged";
  if (behind > 0) return "behind";
  if (ahead > 0) return "ahead";
  return "synced";
}
