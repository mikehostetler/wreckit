import { spawn } from "node:child_process";
import type { Logger } from "../logging";
export type { PrChecksResolved } from "../config";
export type { QualityCheckOptions, QualityCheckResult, SecretScanResult } from "./quality";
export { runPrePushQualityGates, runQualityChecks, runSecretScan, scanForSecrets } from "./quality";

export interface GitOptions {
  cwd: string;
  logger: Logger;
  dryRun?: boolean;
}

export interface BranchResult {
  branchName: string;
  created: boolean;
}

export interface PrResult {
  url: string;
  number: number;
  created: boolean;
}

export type GitPreflightErrorCode =
  | 'NOT_GIT_REPO'
  | 'DETACHED_HEAD'
  | 'UNCOMMITTED_CHANGES'
  | 'BRANCH_DIVERGED'
  | 'NO_REMOTE'
  | 'INVALID_REMOTE_URL';

export interface GitPreflightError {
  code: GitPreflightErrorCode;
  message: string;
  recoverySteps: string[];
}

export interface GitPreflightResult {
  valid: boolean;
  errors: GitPreflightError[];
}

export interface CheckPreflightOptions extends GitOptions {
  checkRemoteSync?: boolean;
}

export interface CommandResult {
  stdout: string;
  exitCode: number;
}

export async function runGitCommand(
  args: string[],
  options: GitOptions
): Promise<CommandResult> {
  return runCommand("git", args, options);
}

export async function runGhCommand(
  args: string[],
  options: GitOptions
): Promise<CommandResult> {
  return runCommand("gh", args, options);
}

async function runCommand(
  command: string,
  args: string[],
  options: GitOptions
): Promise<CommandResult> {
  const { cwd, logger, dryRun = false } = options;

  if (dryRun) {
    logger.info(`[dry-run] Would run: ${command} ${args.join(" ")}`);
    return { stdout: "", exitCode: 0 };
  }

  logger.debug(`Running: ${command} ${args.join(" ")}`);

  return new Promise((resolve) => {
    let proc: ReturnType<typeof spawn> | undefined;

    try {
      proc = spawn(command, args, {
        cwd,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {
      resolve({ stdout: "", exitCode: 1 });
      return;
    }

    if (!proc || typeof proc.on !== "function") {
      resolve({ stdout: "", exitCode: 1 });
      return;
    }

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0 && stderr) {
        logger.debug(`Command stderr: ${stderr}`);
      }
      resolve({ stdout: stdout.trim(), exitCode: code ?? 0 });
    });

    proc.on("error", (err) => {
      logger.debug(`Command error: ${err.message}`);
      resolve({ stdout: "", exitCode: 1 });
    });
  });
}

/**
 * Result of remote URL validation
 */
export interface RemoteValidationResult {
  /** Whether the remote URL is valid */
  valid: boolean;
  /** The actual remote URL (null if remote doesn't exist) */
  actualUrl: string | null;
  /** Error messages if validation failed */
  errors: string[];
}

/**
 * Get the URL of a git remote
 *
 * Returns the push URL if configured, otherwise the fetch URL.
 *
 * @param remoteName - Name of the remote (default: "origin")
 * @param options - Git options
 * @returns The remote URL, or null if the remote doesn't exist
 */
export async function getRemoteUrl(
  remoteName: string,
  options: GitOptions
): Promise<string | null> {
  const { dryRun = false } = options;

  if (dryRun) {
    return null;
  }

  // Try to get the push URL first (what we use for pushing)
  const pushResult = await runGitCommand(
    ["remote", "get-url", "--push", remoteName],
    options
  );

  if (pushResult.exitCode === 0 && pushResult.stdout) {
    return pushResult.stdout;
  }

  // Fall back to fetch URL
  const fetchResult = await runGitCommand(
    ["remote", "get-url", remoteName],
    options
  );

  if (fetchResult.exitCode === 0 && fetchResult.stdout) {
    return fetchResult.stdout;
  }

  return null;
}

/**
 * Normalize a URL for pattern matching
 *
 * Removes protocol variations and .git suffix for consistent matching.
 * Handles HTTPS, SSH, and git:// protocols.
 *
 * @param url - The URL to normalize
 * @returns Normalized URL path in format "host/org/repo"
 */
function normalizeUrlForMatching(url: string): string {
  let normalized = url;

  // Remove protocol prefixes
  normalized = normalized.replace(/^https?:\/\//, "");
  normalized = normalized.replace(/^git@([^:]+):/, "$1/");

  // Remove .git suffix
  normalized = normalized.replace(/\.git$/, "");

  return normalized;
}

/**
 * Validate remote URL against allowed patterns
 *
 * This is a security check to prevent pushing code to the wrong repository.
 * For example, you might want to ensure all pushes go to your organization's repos.
 *
 * @param remoteName - Name of the remote to validate (default: "origin")
 * @param allowedPatterns - Array of allowed URL patterns (e.g., ["github.com/myorg/"])
 * @param options - Git options
 * @returns Validation result with actual URL and any errors
 */
export async function validateRemoteUrl(
  remoteName: string,
  allowedPatterns: string[],
  options: GitOptions
): Promise<RemoteValidationResult> {
  const actualUrl = await getRemoteUrl(remoteName, options);

  // If no remote exists, pass validation (will fail later during push)
  if (actualUrl === null) {
    return { valid: true, actualUrl: null, errors: [] };
  }

  // If no patterns configured, pass validation
  if (allowedPatterns.length === 0) {
    return { valid: true, actualUrl, errors: [] };
  }

  const normalizedActual = normalizeUrlForMatching(actualUrl);
  const errors: string[] = [];

  // Check if actual URL matches any allowed pattern
  let matched = false;
  for (const pattern of allowedPatterns) {
    const normalizedPattern = normalizeUrlForMatching(pattern);

    // Check if the normalized actual URL starts with the normalized pattern
    // This allows both exact matches and prefix matches (e.g., "org/" matches "org/repo")
    if (normalizedActual === normalizedPattern) {
      matched = true;
      break;
    }

    // For prefix matching, ensure we don't double-match on slashes
    // If pattern ends with /, check if actual starts with pattern
    // If pattern doesn't end with /, add / before checking
    const prefixToCheck = normalizedPattern.endsWith("/")
      ? normalizedPattern
      : normalizedPattern + "/";

    if (normalizedActual.startsWith(prefixToCheck)) {
      matched = true;
      break;
    }
  }

  if (!matched) {
    errors.push(
      `Remote URL '${actualUrl}' does not match any allowed pattern. ` +
      `Expected one of: ${allowedPatterns.join(", ")}`
    );
  }

  return {
    valid: matched,
    actualUrl,
    errors,
  };
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  return new Promise((resolve) => {
    let proc: ReturnType<typeof spawn> | undefined;

    try {
      proc = spawn("git", ["rev-parse", "--git-dir"], {
        cwd,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {
      resolve(false);
      return;
    }

    if (!proc || typeof proc.on !== "function") {
      resolve(false);
      return;
    }

    proc.on("close", (code) => {
      resolve(code === 0);
    });

    proc.on("error", () => {
      resolve(false);
    });
  });
}

export async function getCurrentBranch(options: GitOptions): Promise<string> {
  const result = await runGitCommand(
    ["rev-parse", "--abbrev-ref", "HEAD"],
    options
  );
  if (result.exitCode !== 0) {
    throw new Error("Failed to get current branch");
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
  options: GitOptions
): Promise<string> {
  const result = await runGitCommand(["rev-parse", branch], options);
  if (result.exitCode !== 0) {
    throw new Error(`Failed to get SHA for ${branch}`);
  }
  return result.stdout;
}

export async function branchExists(
  branchName: string,
  options: GitOptions
): Promise<boolean> {
  const result = await runGitCommand(
    ["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`],
    options
  );
  return result.exitCode === 0;
}

export async function ensureBranch(
  baseBranch: string,
  branchPrefix: string,
  itemSlug: string,
  options: GitOptions
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
    const checkoutResult = await runGitCommand(["checkout", branchName], options);
    if (checkoutResult.exitCode !== 0) {
      throw new Error(`Failed to checkout existing branch ${branchName}`);
    }
    return { branchName, created: false };
  }

  logger.info(`Creating branch ${branchName} from ${baseBranch}`);
  const checkoutBase = await runGitCommand(["checkout", baseBranch], options);
  if (checkoutBase.exitCode !== 0) {
    throw new Error(`Failed to checkout base branch ${baseBranch}`);
  }
  const createBranch = await runGitCommand(["checkout", "-b", branchName], options);
  if (createBranch.exitCode !== 0) {
    throw new Error(`Failed to create branch ${branchName}`);
  }

  return { branchName, created: true };
}

export async function hasUncommittedChanges(
  options: GitOptions
): Promise<boolean> {
  const result = await runGitCommand(["status", "--porcelain"], options);
  return result.stdout.length > 0;
}

export async function isDetachedHead(options: GitOptions): Promise<boolean> {
  const result = await runGitCommand(
    ["symbolic-ref", "--quiet", "HEAD"],
    options
  );
  return result.exitCode !== 0;
}

export async function hasRemote(options: GitOptions): Promise<boolean> {
  const result = await runGitCommand(["remote"], options);
  return result.exitCode === 0 && result.stdout.length > 0;
}

export async function getBranchSyncStatus(
  options: GitOptions
): Promise<'synced' | 'ahead' | 'behind' | 'diverged' | 'no-upstream'> {
  const branch = await runGitCommand(
    ["rev-parse", "--abbrev-ref", "HEAD"],
    options
  );
  if (branch.exitCode !== 0) {
    return 'no-upstream';
  }

  await runGitCommand(["fetch", "--quiet"], options);

  const upstream = await runGitCommand(
    ["rev-parse", "--abbrev-ref", `${branch.stdout}@{upstream}`],
    options
  );
  if (upstream.exitCode !== 0) {
    return 'no-upstream';
  }

  const aheadBehind = await runGitCommand(
    ["rev-list", "--left-right", "--count", `${branch.stdout}...${upstream.stdout}`],
    options
  );
  if (aheadBehind.exitCode !== 0) {
    return 'no-upstream';
  }

  const [ahead, behind] = aheadBehind.stdout.split(/\s+/).map(Number);
  if (ahead > 0 && behind > 0) return 'diverged';
  if (behind > 0) return 'behind';
  if (ahead > 0) return 'ahead';
  return 'synced';
}

export async function checkGitPreflight(
  options: CheckPreflightOptions
): Promise<GitPreflightResult> {
  const errors: GitPreflightError[] = [];

  const isRepo = await isGitRepo(options.cwd);
  if (!isRepo) {
    errors.push({
      code: 'NOT_GIT_REPO',
      message: 'Not a git repository',
      recoverySteps: [
        'Run `git init` to initialize a new repository',
        'Or navigate to an existing git repository',
      ],
    });
    return { valid: false, errors };
  }

  const detached = await isDetachedHead(options);
  if (detached) {
    errors.push({
      code: 'DETACHED_HEAD',
      message: 'Repository is in detached HEAD state',
      recoverySteps: [
        'Run `git checkout <branch-name>` to switch to a branch',
        'Or run `git checkout -b <new-branch>` to create a new branch from current state',
      ],
    });
  }

  const hasChanges = await hasUncommittedChanges(options);
  if (hasChanges) {
    errors.push({
      code: 'UNCOMMITTED_CHANGES',
      message: 'There are uncommitted changes in the working directory',
      recoverySteps: [
        'Run `git stash` to temporarily save changes',
        'Or run `git commit -am "message"` to commit changes',
        'Or run `git checkout -- .` to discard changes (destructive)',
      ],
    });
  }

  if (options.checkRemoteSync) {
    const hasRemoteConfigured = await hasRemote(options);
    if (!hasRemoteConfigured) {
      errors.push({
        code: 'NO_REMOTE',
        message: 'No remote repository configured',
        recoverySteps: [
          'Run `git remote add origin <url>` to add a remote',
        ],
      });
    } else {
      const syncStatus = await getBranchSyncStatus(options);
      if (syncStatus === 'diverged') {
        errors.push({
          code: 'BRANCH_DIVERGED',
          message: 'Local branch has diverged from remote',
          recoverySteps: [
            'Run `git pull --rebase` to rebase local changes on top of remote',
            'Or run `git pull` to merge remote changes',
            'Resolve any conflicts and commit',
          ],
        });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export async function commitAll(
  message: string,
  options: GitOptions
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
  options: GitOptions
): Promise<void> {
  const { logger, dryRun = false } = options;

  if (dryRun) {
    logger.info(`[dry-run] Would push branch: ${branchName}`);
    return;
  }

  const result = await runGitCommand(["push", "-u", "origin", branchName], options);
  if (result.exitCode !== 0) {
    throw new Error(
      `Failed to push branch ${branchName} to origin. ` +
      `Check that you have push access and the remote is configured correctly.`
    );
  }
}

export async function getPrByBranch(
  branchName: string,
  options: GitOptions
): Promise<{ url: string; number: number } | null> {
  const result = await runGhCommand(
    ["pr", "view", branchName, "--json", "url,number"],
    options
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
  options: GitOptions
): Promise<PrResult> {
  const { logger, dryRun = false } = options;

  if (dryRun) {
    logger.info(`[dry-run] Would create/update PR: ${title}`);
    return { url: "https://github.com/example/repo/pull/0", number: 0, created: true };
  }

  const existing = await getPrByBranch(headBranch, options);

  if (existing) {
    logger.info(`Updating existing PR #${existing.number}`);
    await runGhCommand(
      ["pr", "edit", String(existing.number), "--title", title, "--body", body],
      options
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
    options
  );

  if (result.exitCode !== 0) {
    throw new Error(`Failed to create PR: ${result.stdout}`);
  }

  const prInfo = await getPrByBranch(headBranch, options);
  if (!prInfo) {
    throw new Error("PR was created but could not retrieve its info");
  }

  return { url: prInfo.url, number: prInfo.number, created: true };
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
  options: GitOptions
): Promise<MergeConflictCheckResult> {
  const { logger, dryRun = false } = options;

  if (dryRun) {
    logger.info(`[dry-run] Would check for merge conflicts`);
    return { hasConflicts: false };
  }

  // Get current branch to restore later
  const currentBranchResult = await runGitCommand(
    ["rev-parse", "--abbrev-ref", "HEAD"],
    options
  );
  const originalBranch = currentBranchResult.stdout;

  try {
    // Switch to base branch
    const checkoutResult = await runGitCommand(["checkout", baseBranch], options);
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
      options
    );

    // Check for conflict markers in the working directory
    const statusResult = await runGitCommand(["status", "--porcelain"], options);
    const hasConflictMarkers = statusResult.stdout.includes("U") ||
                               statusResult.stdout.includes("AA") ||
                               statusResult.stdout.includes("UU");

    // Abort the test merge regardless of result
    await runGitCommand(["merge", "--abort"], options);

    if (testMergeResult.exitCode !== 0 || hasConflictMarkers) {
      return {
        hasConflicts: true,
        error: `Merge conflict detected: ${featureBranch} cannot be cleanly merged into ${baseBranch}. ` +
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

export async function mergeAndPushToBase(
  baseBranch: string,
  featureBranch: string,
  commitMessage: string,
  options: GitOptions
): Promise<void> {
  const { logger, dryRun = false } = options;

  if (dryRun) {
    logger.info(`[dry-run] Would merge ${featureBranch} into ${baseBranch} and push`);
    return;
  }

  // Switch to base branch
  const checkoutResult = await runGitCommand(["checkout", baseBranch], options);
  if (checkoutResult.exitCode !== 0) {
    throw new Error(`Failed to checkout base branch ${baseBranch}`);
  }

  // Pull latest changes from remote
  const pullResult = await runGitCommand(["pull", "--ff-only"], options);
  if (pullResult.exitCode !== 0) {
    throw new Error(
      `Failed to pull latest ${baseBranch}. Resolve conflicts manually or try again.`
    );
  }

  // Merge feature branch with a merge commit
  const mergeResult = await runGitCommand(
    ["merge", featureBranch, "--no-ff", "-m", commitMessage],
    options
  );
  if (mergeResult.exitCode !== 0) {
    throw new Error(
      `Failed to merge ${featureBranch} into ${baseBranch}. ` +
      `There may be merge conflicts that need manual resolution.`
    );
  }

  // Push to remote
  const pushResult = await runGitCommand(["push", "origin", baseBranch], options);
  if (pushResult.exitCode !== 0) {
    throw new Error(
      `Failed to push ${baseBranch} to origin. Check that you have push access.`
    );
  }

  logger.info(`Merged ${featureBranch} into ${baseBranch} and pushed to origin`);
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
  options: GitOptions
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
      "state,baseRefName,headRefName,mergeCommit,mergedAt,statusCheckRollup"
    ],
    options
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
    if (Array.isArray(data.statusCheckRollup) && data.statusCheckRollup.length > 0) {
      // Checks passed if all are SUCCESS or completed successfully
      checksPassed = data.statusCheckRollup.every(
        (check: any) => check.status === "COMPLETED" && check.conclusion === "SUCCESS"
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
  options: GitOptions
): Promise<boolean> {
  const result = await runGhCommand(
    ["pr", "view", String(prNumber), "--json", "state"],
    options
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
 * Result of PR mergeability check
 */
export interface PrMergeabilityResult {
  /** Whether the PR can be merged (no conflicts) */
  mergeable: boolean;
  /** Whether the check was able to determine mergeability */
  determined: boolean;
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
  options: GitOptions
): Promise<PrMergeabilityResult> {
  const { logger, dryRun = false } = options;

  if (dryRun) {
    logger.info(`[dry-run] Would check mergeability for PR #${prNumber}`);
    return { mergeable: true, determined: true };
  }

  const result = await runGhCommand(
    ["pr", "view", String(prNumber), "--json", "mergeable"],
    options
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

/**
 * Represents a single file change in git status
 */
export interface GitFileChange {
  /** Path relative to git root */
  path: string;
  /** Git status code (e.g., "M", "A", "D", "??") */
  statusCode: string;
}

/**
 * Result of git status comparison
 */
export interface GitStatusComparisonResult {
  /** Whether the comparison passed (no unexpected changes) */
  valid: boolean;
  /** Files that were changed outside allowed paths */
  violations: GitFileChange[];
  /** All files that changed (including allowed ones) */
  allChanges: GitFileChange[];
}

/**
 * Options for status comparison validation
 */
export interface StatusCompareOptions extends GitOptions {
  /** Paths that are allowed to change (relative to git root) */
  allowedPaths?: string[];
}

/**
 * Parse git status --porcelain output into structured changes
 *
 * @param stdout - Output from git status --porcelain
 * @param gitRoot - Root directory of the git repository
 * @returns Array of file changes
 */
export function parseGitStatusPorcelain(
  stdout: string,
  gitRoot: string
): GitFileChange[] {
  const changes: GitFileChange[] = [];

  if (!stdout) {
    return changes;
  }

  const lines = stdout.trim().split('\n');
  for (const line of lines) {
    if (line.length < 4) continue;

    // git status --porcelain format: XY filename
    // X = staging area status (1 char), Y = working tree status (1 char)
    // Then a space, then the filename
    const statusCodeRaw = line.substring(0, 2);
    // Trim to handle cases like "M " (modified in work tree only)
    const statusCode = statusCodeRaw.trim();
    // Find the first space after the status codes
    const spaceIndex = line.indexOf(' ');
    if (spaceIndex === -1) continue;
    const path = line.substring(spaceIndex + 1).trimStart();

    changes.push({
      path,
      statusCode,
    });
  }

  return changes;
}

/**
 * Get current git status as structured data
 *
 * @param options - Git options
 * @returns Array of file changes
 */
export async function getGitStatus(
  options: GitOptions
): Promise<GitFileChange[]> {
  const result = await runGitCommand(["status", "--porcelain"], options);
  return parseGitStatusPorcelain(result.stdout, options.cwd);
}

/**
 * Compare git status before and after an operation to detect unauthorized changes
 *
 * This is used to enforce read-only operations like the research phase, where the agent
 * should only write to specific allowed paths (e.g., research.md in the item directory).
 *
 * @param beforeStatus - Git status before the operation
 * @param afterOptions - Options for checking after status
 * @param compareOptions - Options including allowed paths
 * @returns Comparison result with any violations
 */
export async function compareGitStatus(
  beforeStatus: GitFileChange[],
  afterOptions: StatusCompareOptions
): Promise<GitStatusComparisonResult> {
  const afterStatus = await getGitStatus(afterOptions);

  // Find new changes (files that are in after but not in before)
  const beforePaths = new Set(beforeStatus.map(c => c.path));
  const newChanges = afterStatus.filter(change => !beforePaths.has(change.path));

  // Check for violations (changes outside allowed paths)
  const allowedPaths = afterOptions.allowedPaths ?? [];
  const violations: GitFileChange[] = [];

  // Separate directory entries from file entries
  // Git reports directories with trailing slashes when they contain untracked files
  const directoryEntries = newChanges.filter(c => c.path.endsWith('/'));
  const fileEntries = newChanges.filter(c => !c.path.endsWith('/'));

  // First, check file entries against allowed paths
  for (const change of fileEntries) {
    const isAllowed = allowedPaths.some(allowedPath => {
      // Normalize paths for comparison
      const normalizedAllowed = allowedPath.replace(/^\/+/, '').replace(/\/+$/, '');
      const normalizedChange = change.path.replace(/^\/+/, '');

      // Check if change is within allowed path
      // Case 1: Exact match (e.g., "file.md" matches "file.md")
      // Case 2: Change is within allowed directory path (e.g., "dir/file.md" matches "dir/")
      // Case 3: Change is a subdirectory of allowed path (e.g., "dir/subdir/file.md" matches "dir/")
      if (normalizedChange === normalizedAllowed) {
        return true;
      }

      // Check if change is within allowed path (with or without trailing slash)
      return normalizedChange.startsWith(normalizedAllowed + '/');
    });

    if (!isAllowed) {
      violations.push(change);
    }
  }

  // Then, check directory entries
  // A directory entry is allowed if it's a parent of at least one allowed path
  // This handles git's behavior of showing "dir/" when there are untracked files inside
  for (const change of directoryEntries) {
    const isAllowed = allowedPaths.some(allowedPath => {
      const normalizedAllowed = allowedPath.replace(/^\/+/, '').replace(/\/+$/, '');
      const normalizedChange = change.path.replace(/^\/+/, '').replace(/\/+$/, '');

      // Directory is allowed if it's a parent of an allowed path
      return normalizedAllowed.startsWith(normalizedChange + '/') ||
             normalizedAllowed === normalizedChange;
    });

    if (!isAllowed) {
      violations.push(change);
    }
  }

  return {
    valid: violations.length === 0,
    violations,
    allChanges: newChanges,
  };
}

/**
 * Format violations into a human-readable error message
 *
 * @param result - Comparison result with violations
 * @param phase - Phase name for error message (default: "research")
 * @returns Formatted error message
 */
export function formatViolations(result: GitStatusComparisonResult, phase: 'research' | 'plan' | 'implement' = 'research'): string {
  if (result.valid) {
    return '';
  }

  const lines: string[] = [];

  if (phase === 'research') {
    lines.push('Research phase detected unauthorized file modifications:');
    lines.push('');
  } else if (phase === 'plan') {
    lines.push('Plan phase detected unauthorized file modifications:');
    lines.push('');
  } else {
    lines.push('Implement phase detected scope creep:');
    lines.push('');
  }

  for (const violation of result.violations) {
    const statusDesc = getStatusDescription(violation.statusCode);
    lines.push(`  ${statusDesc} ${violation.path}`);
  }

  lines.push('');

  if (phase === 'research') {
    lines.push('The research phase must be read-only. Only research.md may be created.');
    lines.push('Any code changes should be made during the implementation phase.');
  } else if (phase === 'plan') {
    lines.push('The plan phase must be design-only. Only plan.md and prd.json may be created.');
    lines.push('Any code changes should be made during the implementation phase.');
  } else {
    lines.push('The implementation phase is scoped to the current story.');
    lines.push('Changes outside of story-related files may indicate scope creep.');
    lines.push('Please review the changes and ensure they align with the story acceptance criteria.');
  }

  return lines.join('\n');
}

/**
 * Get human-readable description of git status code
 *
 * @param statusCode - Git status code (e.g., "M", "A", "D", "??")
 * @returns Human-readable description
 */
function getStatusDescription(statusCode: string): string {
  const descriptions: Record<string, string> = {
    'M': 'Modified',
    'A': 'Added',
    'D': 'Deleted',
    'R': 'Renamed',
    'C': 'Copied',
    '??': 'Untracked',
    '!!': 'Ignored',
  };

  return descriptions[statusCode] || `Unknown (${statusCode})`;
}
