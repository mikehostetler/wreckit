import type { Logger } from "../logging";
import { runGhCommand } from "./index";
import { PrCreationError } from "../errors";

// Re-export GitOptions from index for type compatibility
export type { GitOptions } from "./index";

export interface PrResult {
  url: string;
  number: number;
  created: boolean;
}

/**
 * Detailed PR information for merge validation
 */
export interface PrDetails {
  /** Whether the PR is merged */
  merged: boolean;
  /** Whether the query succeeded (vs gh command failing) */
  querySucceeded: boolean;
  /** The base branch the PR targets */
  baseRefName: string | null;
  /** The head branch of the PR */
  headRefName: string | null;
  /** The merge commit SHA */
  mergeCommitOid: string | null;
  /** When the PR was merged */
  mergedAt: string | null;
  /** Whether all CI checks passed */
  checksPassed: boolean | null;
  /** Error message if query failed */
  error?: string;
}

/**
 * Result of PR mergeability check
 */
export interface PrMergeabilityResult {
  /** Whether the PR can be merged (no conflicts) */
  mergeable: boolean;
  /** Whether the check was able to determine mergeability */
  determined: boolean;
}

/**
 * Result of merge conflict check
 */
export interface MergeConflictCheckResult {
  /** Whether the merge can be completed without conflicts */
  hasConflicts: boolean;
  /** Error message if conflicts detected */
  error?: string;
}

export async function getPrByBranch(
  branchName: string,
  options: { cwd: string; logger: Logger; dryRun?: boolean },
): Promise<{ url: string; number: number } | null> {
  const result = await runGhCommand(
    ["pr", "view", branchName, "--json", "url,number"],
    options,
  );

  if (result.exitCode !== 0) {
    return null;
  }

  try {
    const data = JSON.parse(result.stdout);
    return { url: data.url, number: data.number };
  } catch {
    return null;
  }
}

export async function createOrUpdatePr(
  baseBranch: string,
  headBranch: string,
  title: string,
  body: string,
  options: { cwd: string; logger: Logger; dryRun?: boolean },
): Promise<PrResult> {
  const { logger, dryRun = false } = options;

  if (dryRun) {
    logger.info(`[dry-run] Would create/update PR: ${title}`);
    return {
      url: "https://github.com/example/repo/pull/0",
      number: 0,
      created: true,
    };
  }

  const existing = await getPrByBranch(headBranch, options);

  if (existing) {
    logger.info(`Updating existing PR #${existing.number}`);
    await runGhCommand(
      ["pr", "edit", String(existing.number), "--title", title, "--body", body],
      options,
    );
    return { url: existing.url, number: existing.number, created: false };
  }

  logger.info(`Creating new PR: ${title}`);
  const result = await runGhCommand(
    [
      "pr",
      "create",
      "--base",
      baseBranch,
      "--head",
      headBranch,
      "--title",
      title,
      "--body",
      body,
    ],
    options,
  );

  if (result.exitCode !== 0) {
    throw new PrCreationError(
      headBranch,
      baseBranch,
      `Failed to create PR: ${result.stdout}`,
    );
  }

  const prInfo = await getPrByBranch(headBranch, options);
  if (!prInfo) {
    throw new PrCreationError(
      headBranch,
      baseBranch,
      "PR was created but could not retrieve its info",
    );
  }

  return { url: prInfo.url, number: prInfo.number, created: true };
}

// Import runGitCommand for checkMergeConflicts
// We need to import it from index.ts to avoid circular dependencies
let runGitCommandModule: typeof import("./index");
async function getRunGitCommand() {
  if (!runGitCommandModule) {
    runGitCommandModule = await import("./index");
  }
  return runGitCommandModule.runGitCommand;
}

/**
 * Check if merging featureBranch into baseBranch would cause conflicts
 *
 * This performs a dry-run merge to detect conflicts before actually merging.
 * If conflicts are detected, the merge state is aborted and the original branch is restored.
 *
 * @param baseBranch - The target branch to merge into
 * @param featureBranch - The source branch to merge from
 * @param options - Git options
 * @returns Result indicating if conflicts were detected
 */
export async function checkMergeConflicts(
  baseBranch: string,
  featureBranch: string,
  options: { cwd: string; logger: Logger; dryRun?: boolean },
): Promise<MergeConflictCheckResult> {
  const { logger, dryRun = false } = options;
  const runGitCommand = await getRunGitCommand();

  if (dryRun) {
    logger.info(`[dry-run] Would check for merge conflicts`);
    return { hasConflicts: false };
  }

  // Get current branch to restore later
  const currentBranchResult = await runGitCommand(
    ["rev-parse", "--abbrev-ref", "HEAD"],
    options,
  );
  const originalBranch = currentBranchResult.stdout;

  try {
    // Switch to base branch
    const checkoutResult = await runGitCommand(
      ["checkout", baseBranch],
      options,
    );
    if (checkoutResult.exitCode !== 0) {
      return {
        hasConflicts: true,
        error: `Failed to checkout base branch ${baseBranch} for conflict check`,
      };
    }

    // Pull latest changes from remote
    const pullResult = await runGitCommand(["pull", "--ff-only"], options);
    if (pullResult.exitCode !== 0) {
      return {
        hasConflicts: true,
        error: `Failed to pull latest ${baseBranch}. Branch may be out of sync with remote.`,
      };
    }

    // Try a no-commit merge to detect conflicts
    // --no-ff ensures a merge commit even if fast-forward is possible
    // --no-commit performs the merge but doesn't commit, allowing us to check for conflicts
    const testMergeResult = await runGitCommand(
      ["merge", "--no-commit", "--no-ff", featureBranch],
      options,
    );

    // Check for conflict markers in the working directory
    const statusResult = await runGitCommand(
      ["status", "--porcelain"],
      options,
    );
    const hasConflictMarkers =
      statusResult.stdout.includes("U") ||
      statusResult.stdout.includes("AA") ||
      statusResult.stdout.includes("UU");

    // Abort the test merge regardless of result
    await runGitCommand(["merge", "--abort"], options);

    if (testMergeResult.exitCode !== 0 || hasConflictMarkers) {
      return {
        hasConflicts: true,
        error:
          `Merge conflict detected: ${featureBranch} cannot be cleanly merged into ${baseBranch}. ` +
          `Please resolve conflicts manually or rebase the feature branch.`,
      };
    }

    return { hasConflicts: false };
  } finally {
    // Always restore original branch
    if (originalBranch && originalBranch !== "HEAD") {
      await runGitCommand(["checkout", originalBranch], options);
    }
  }
}

/**
 * Get detailed PR information for merge validation
 *
 * This fetches comprehensive PR data including branch, commit, and check status
 * to support verified delivery in the complete phase (Spec 006 Gap 1).
 *
 * @param prNumber - The PR number to query
 * @param options - Git options
 * @returns Detailed PR information
 */
export async function getPrDetails(
  prNumber: number,
  options: { cwd: string; logger: Logger; dryRun?: boolean },
): Promise<PrDetails> {
  const { logger, dryRun = false } = options;

  if (dryRun) {
    logger.info(`[dry-run] Would get PR details for #${prNumber}`);
    return {
      merged: true,
      querySucceeded: true,
      baseRefName: "main",
      headRefName: "feature-branch",
      mergeCommitOid: "abc123",
      mergedAt: new Date().toISOString(),
      checksPassed: true,
    };
  }

  // Query all relevant PR fields in a single gh call
  const result = await runGhCommand(
    [
      "pr",
      "view",
      String(prNumber),
      "--json",
      "state,baseRefName,headRefName,mergeCommit,mergedAt,statusCheckRollup",
    ],
    options,
  );

  if (result.exitCode !== 0) {
    // Distinguish between "PR not found" and "gh command failed"
    const stderr = result.stderr || result.stdout;
    if (stderr.includes("not found") || stderr.includes("Could not resolve")) {
      return {
        merged: false,
        querySucceeded: true,
        baseRefName: null,
        headRefName: null,
        mergeCommitOid: null,
        mergedAt: null,
        checksPassed: null,
        error: "PR not found",
      };
    }
    // gh command failed (auth, network, etc.)
    return {
      merged: false,
      querySucceeded: false,
      baseRefName: null,
      headRefName: null,
      mergeCommitOid: null,
      mergedAt: null,
      checksPassed: null,
      error: `gh command failed: ${stderr}`,
    };
  }

  try {
    const data = JSON.parse(result.stdout);

    // Determine if CI checks passed
    // statusCheckRollup is an array of check statuses
    let checksPassed: boolean | null = null;
    if (
      Array.isArray(data.statusCheckRollup) &&
      data.statusCheckRollup.length > 0
    ) {
      // Checks passed if all are SUCCESS or completed successfully
      checksPassed = data.statusCheckRollup.every(
        (check: any) =>
          check.status === "COMPLETED" && check.conclusion === "SUCCESS",
      );
    }

    return {
      merged: data.state === "MERGED",
      querySucceeded: true,
      baseRefName: data.baseRefName ?? null,
      headRefName: data.headRefName ?? null,
      mergeCommitOid: data.mergeCommit?.oid ?? null,
      mergedAt: data.mergedAt ?? null,
      checksPassed,
    };
  } catch (err) {
    return {
      merged: false,
      querySucceeded: false,
      baseRefName: null,
      headRefName: null,
      mergeCommitOid: null,
      mergedAt: null,
      checksPassed: null,
      error: `Failed to parse PR details: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Legacy function - use getPrDetails for full validation
 * @deprecated Use getPrDetails instead for comprehensive merge validation
 */
export async function isPrMerged(
  prNumber: number,
  options: { cwd: string; logger: Logger; dryRun?: boolean },
): Promise<boolean> {
  const result = await runGhCommand(
    ["pr", "view", String(prNumber), "--json", "state"],
    options,
  );

  if (result.exitCode !== 0) {
    return false;
  }

  try {
    const data = JSON.parse(result.stdout);
    return data.state === "MERGED";
  } catch {
    return false;
  }
}

/**
 * Check if a PR is mergeable (has no merge conflicts)
 *
 * This is called after PR creation to detect if the PR has conflicts.
 * GitHub may take a moment to calculate mergeability, so this may return
 * undetermined immediately after PR creation.
 *
 * @param prNumber - The PR number to check
 * @param options - Git options
 * @returns Mergeability result
 */
export async function checkPrMergeability(
  prNumber: number,
  options: { cwd: string; logger: Logger; dryRun?: boolean },
): Promise<PrMergeabilityResult> {
  const { logger, dryRun = false } = options;

  if (dryRun) {
    logger.info(`[dry-run] Would check mergeability for PR #${prNumber}`);
    return { mergeable: true, determined: true };
  }

  const result = await runGhCommand(
    ["pr", "view", String(prNumber), "--json", "mergeable"],
    options,
  );

  if (result.exitCode !== 0) {
    logger.warn(`Failed to check mergeability for PR #${prNumber}`);
    return { mergeable: false, determined: false };
  }

  try {
    const data = JSON.parse(result.stdout);
    const mergeable = data.mergeable;

    // GitHub returns null for mergeable when it's still calculating
    if (mergeable === null) {
      logger.debug(`PR #${prNumber} mergeability not yet determined by GitHub`);
      return { mergeable: false, determined: false };
    }

    return { mergeable: Boolean(mergeable), determined: true };
  } catch (err) {
    logger.warn(`Failed to parse mergeability response for PR #${prNumber}`);
    return { mergeable: false, determined: false };
  }
}
