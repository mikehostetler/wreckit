import { spawn } from "node:child_process";
import type { Logger } from "../logging";

// Re-export config types
export type { PrChecksResolved } from "../config";

// Re-export quality module
export type {
  QualityCheckOptions,
  QualityCheckResult,
  SecretScanResult,
} from "./quality";
export {
  runPrePushQualityGates,
  runQualityChecks,
  runSecretScan,
  scanForSecrets,
} from "./quality";

// Core types
export interface GitOptions {
  cwd: string;
  logger: Logger;
  dryRun?: boolean;
}

export interface CommandResult {
  stdout: string;
  stderr?: string;
  exitCode: number;
}

// Mutex for serializing git operations to prevent index.lock contention
class Mutex {
  private mutex = Promise.resolve();

  lock(): Promise<() => void> {
    let unlockFn: () => void = () => {};

    this.mutex = this.mutex.then(() => {
      return new Promise<void>((resolve) => {
        unlockFn = resolve;
      });
    });

    return new Promise<() => void>((resolve) => {
      resolve(() => unlockFn());
    });
  }

  async dispatch<T>(fn: (() => T) | (() => PromiseLike<T>)): Promise<T> {
    const unlock = await this.lock();
    try {
      return await Promise.resolve(fn());
    } finally {
      unlock();
    }
  }
}

const gitMutex = new Mutex();

export async function runGitCommand(
  args: string[],
  options: GitOptions,
): Promise<CommandResult> {
  return gitMutex.dispatch(() => runCommand("git", args, options));
}

export async function runGhCommand(
  args: string[],
  options: GitOptions,
): Promise<CommandResult> {
  return runCommand("gh", args, options);
}

async function runCommand(
  command: string,
  args: string[],
  options: GitOptions,
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

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0 && stderr) {
        logger.debug(`Command stderr: ${stderr}`);
      }
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code ?? 0,
      });
    });

    proc.on("error", (err) => {
      logger.debug(`Command error: ${err.message}`);
      resolve({ stdout: "", stderr: err.message, exitCode: 1 });
    });
  });
}

// Re-export validation module
export type {
  GitPreflightErrorCode,
  GitPreflightError,
  GitPreflightResult,
  CheckPreflightOptions,
  RemoteValidationResult,
} from "./validation";
export {
  getRemoteUrl,
  validateRemoteUrl,
  isGitRepo,
  hasUncommittedChanges,
  isDetachedHead,
  hasRemote,
  checkGitPreflight,
} from "./validation";

// Re-export branch module
export type { BranchResult, BranchCleanupResult } from "./branch";
export {
  getCurrentBranch,
  getBranchSha,
  branchExists,
  cleanupBranch,
  ensureBranch,
  commitAll,
  pushBranch,
  mergeAndPushToBase,
  getBranchSyncStatus,
} from "./branch";

// Re-export PR module
export type {
  PrResult,
  PrDetails,
  PrMergeabilityResult,
  MergeConflictCheckResult,
} from "./pr";
export {
  getPrByBranch,
  createOrUpdatePr,
  checkMergeConflicts,
  getPrDetails,
  isPrMerged,
  checkPrMergeability,
} from "./pr";

// Re-export status module
export type {
  GitFileChange,
  GitStatusComparisonResult,
  StatusCompareOptions,
} from "./status";
export {
  parseGitStatusPorcelain,
  getGitStatus,
  compareGitStatus,
  formatViolations,
} from "./status";

// Re-export scope module (Item 084)
export type {
  DiffStats,
  FileDiff,
  StoryScopeOptions,
  StoryScopeResult,
  ScopeViolation,
  ViolationType,
} from "./scope";
export {
  DEFAULT_SCOPE_OPTIONS,
  getDiffStats,
  getWorkingTreeDiffStats,
  validateStoryScope,
  formatScopeViolations,
  isApproachingThreshold,
  logScopeWarnings,
  configToOptions,
} from "./scope";
