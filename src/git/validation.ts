import { spawn } from "node:child_process";
import * as path from "node:path";
import type { Logger } from "../logging";
import { runGitCommand } from "./index";

// Re-export GitOptions from index for type compatibility
export type { GitOptions } from "./index";

export type GitPreflightErrorCode =
  | "NOT_GIT_REPO"
  | "DETACHED_HEAD"
  | "UNCOMMITTED_CHANGES"
  | "BRANCH_DIVERGED"
  | "NO_REMOTE"
  | "INVALID_REMOTE_URL";

export interface GitPreflightError {
  code: GitPreflightErrorCode;
  message: string;
  recoverySteps: string[];
}

export interface GitPreflightResult {
  valid: boolean;
  errors: GitPreflightError[];
}

export interface CheckPreflightOptions {
  cwd: string;
  logger: Logger;
  dryRun?: boolean;
  checkRemoteSync?: boolean;
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
  options: { cwd: string; logger: Logger; dryRun?: boolean },
): Promise<string | null> {
  const { dryRun = false } = options;

  if (dryRun) {
    return null;
  }

  // Try to get the push URL first (what we use for pushing)
  const pushResult = await runGitCommand(
    ["remote", "get-url", "--push", remoteName],
    options,
  );

  if (pushResult.exitCode === 0 && pushResult.stdout) {
    return pushResult.stdout;
  }

  // Fall back to fetch URL
  const fetchResult = await runGitCommand(
    ["remote", "get-url", remoteName],
    options,
  );

  if (fetchResult.exitCode === 0 && fetchResult.stdout) {
    return fetchResult.stdout;
  }

  return null;
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
  options: { cwd: string; logger: Logger; dryRun?: boolean },
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
        `Expected one of: ${allowedPatterns.join(", ")}`,
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
      // Set GIT_CEILING_DIRECTORIES to prevent git from searching parent directories
      // This ensures that even when running inside a git repo (e.g., in CI),
      // checking a subdirectory correctly returns false if that subdirectory is not itself a git repo
      const ceilingDir = path.dirname(cwd);
      const env = { ...process.env, GIT_CEILING_DIRECTORIES: ceilingDir };

      // Debug logging
      if (process.env.DEBUG_IS_GIT_REPO === "true") {
        console.error(`[isGitRepo] cwd=${cwd}, ceiling=${ceilingDir}`);
      }

      proc = spawn("git", ["rev-parse", "--git-dir"], {
        cwd,
        stdio: ["pipe", "pipe", "pipe"],
        env,
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
      if (process.env.DEBUG_IS_GIT_REPO === "true") {
        console.error(`[isGitRepo] git exit code=${code}`);
      }
      resolve(code === 0);
    });

    proc.on("error", () => {
      resolve(false);
    });
  });
}

export async function hasUncommittedChanges(
  options: { cwd: string; logger: Logger; dryRun?: boolean },
): Promise<boolean> {
  const result = await runGitCommand(["status", "--porcelain"], options);
  return result.stdout.length > 0;
}

export async function isDetachedHead(
  options: { cwd: string; logger: Logger; dryRun?: boolean },
): Promise<boolean> {
  const result = await runGitCommand(
    ["symbolic-ref", "--quiet", "HEAD"],
    options,
  );
  return result.exitCode !== 0;
}

export async function hasRemote(
  options: { cwd: string; logger: Logger; dryRun?: boolean },
): Promise<boolean> {
  const result = await runGitCommand(["remote"], options);
  return result.exitCode === 0 && result.stdout.length > 0;
}

// Import branch functions for checkGitPreflight
let branchModule: typeof import("./branch");
async function getBranchModule() {
  if (!branchModule) {
    branchModule = await import("./branch");
  }
  return branchModule;
}

export async function checkGitPreflight(
  options: CheckPreflightOptions,
): Promise<GitPreflightResult> {
  const errors: GitPreflightError[] = [];

  const isRepo = await isGitRepo(options.cwd);
  if (!isRepo) {
    errors.push({
      code: "NOT_GIT_REPO",
      message: "Not a git repository",
      recoverySteps: [
        "Run `git init` to initialize a new repository",
        "Or navigate to an existing git repository",
      ],
    });
    return { valid: false, errors };
  }

  const detached = await isDetachedHead(options);
  if (detached) {
    errors.push({
      code: "DETACHED_HEAD",
      message: "Repository is in detached HEAD state",
      recoverySteps: [
        "Run `git checkout <branch-name>` to switch to a branch",
        "Or run `git checkout -b <new-branch>` to create a new branch from current state",
      ],
    });
  }

  const hasChanges = await hasUncommittedChanges(options);
  if (hasChanges) {
    errors.push({
      code: "UNCOMMITTED_CHANGES",
      message: "There are uncommitted changes in the working directory",
      recoverySteps: [
        "Run `git stash` to temporarily save changes",
        'Or run `git commit -am "message"` to commit changes',
        "Or run `git checkout -- .` to discard changes (destructive)",
      ],
    });
  }

  if (options.checkRemoteSync) {
    const hasRemoteConfigured = await hasRemote(options);
    if (!hasRemoteConfigured) {
      errors.push({
        code: "NO_REMOTE",
        message: "No remote repository configured",
        recoverySteps: ["Run `git remote add origin <url>` to add a remote"],
      });
    } else {
      const { getBranchSyncStatus } = await getBranchModule();
      const syncStatus = await getBranchSyncStatus(options);
      if (syncStatus === "diverged") {
        errors.push({
          code: "BRANCH_DIVERGED",
          message: "Local branch has diverged from remote",
          recoverySteps: [
            "Run `git pull --rebase` to rebase local changes on top of remote",
            "Or run `git pull` to merge remote changes",
            "Resolve any conflicts and commit",
          ],
        });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
