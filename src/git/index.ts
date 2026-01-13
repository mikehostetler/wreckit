import { spawn } from "node:child_process";
import type { Logger } from "../logging";

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
    await runGitCommand(["checkout", branchName], options);
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

  await runGitCommand(["push", "-u", "origin", branchName], options);
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
