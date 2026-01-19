import { spawn } from "node:child_process";
import type { Logger } from "../logging";
import type { PrChecksResolved } from "../config";
import { runGitCommand } from "./index";

export interface QualityCheckOptions {
  cwd: string;
  logger: Logger;
  dryRun?: boolean;
  checks: PrChecksResolved;
}

export interface QualityCheckResult {
  success: boolean;
  errors: string[];
  skipped: string[];
}

export interface RunCommandOptions {
  cwd: string;
  logger: Logger;
  dryRun?: boolean;
}

async function runCommand(
  command: string,
  args: string[],
  options: RunCommandOptions
): Promise<{ stdout: string; exitCode: number }> {
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
 * Run the configured quality check commands (tests, lint, typecheck, etc.)
 *
 * @param options - Quality check options including commands to run
 * @returns Result indicating success/failure and any errors
 */
export async function runQualityChecks(
  options: QualityCheckOptions
): Promise<QualityCheckResult> {
  const { cwd, logger, dryRun, checks } = options;
  const errors: string[] = [];
  const skipped: string[] = [];

  if (checks.commands.length === 0) {
    logger.info("No quality checks configured, skipping");
    return { success: true, errors, skipped: ["No commands configured"] };
  }

  logger.info(`Running ${checks.commands.length} quality check(s)`);

  for (const command of checks.commands) {
    // Parse command into executable and args
    const parts = command.split(/\s+/);
    const exe = parts[0];
    const args = parts.slice(1);

    logger.info(`Running: ${command}`);

    const result = await runCommand(exe, args, { cwd, logger, dryRun });

    if (result.exitCode !== 0) {
      const error = `Quality check failed: ${command}`;
      logger.error(error);
      if (result.stdout) {
        logger.error(`Output: ${result.stdout}`);
      }
      errors.push(error);
    } else {
      logger.info(`Quality check passed: ${command}`);
    }
  }

  return {
    success: errors.length === 0,
    errors,
    skipped,
  };
}

/**
 * Common secret patterns that should not be committed
 */
const SECRET_PATTERNS = [
  { name: "Private key", pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/i },
  { name: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "GitHub personal access token", pattern: /\b(ghp_|github_pat_|gho_)[a-zA-Z0-9_]{36,}\b/ },
  { name: "GitHub OAuth token", pattern: /\bghu_[a-zA-Z0-9_]{36,}\b/ },
  { name: "Slack token", pattern: /\bxox[bpr]-[a-zA-Z0-9-]+\b/ },
  { name: "Password in assignment", pattern: /\b(password|passwd|pwd)\s*=\s*['"][^'"]{4,}['"]/i },
  { name: "API key in assignment", pattern: /\b(api_key|apikey|secret)\s*=\s*['"][^'"]{4,}['"]/i },
  { name: "Bearer token", pattern: /\b[Aa]uthorization:\s*[Bb]earer\s+[a-zA-Z0-9_\-\.]+\b/ },
];

export interface SecretScanResult {
  found: boolean;
  secrets: Array<{
    pattern: string;
    line: string;
    lineNumber?: number;
  }>;
}

/**
 * Scan diff output for potential secrets or credentials
 *
 * @param diff - Git diff output to scan
 * @returns Result indicating if secrets were found and where
 */
export function scanForSecrets(diff: string): SecretScanResult {
  const secrets: SecretScanResult["secrets"] = [];

  const lines = diff.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Only check added lines (starting with +)
    if (!line.startsWith("+")) {
      continue;
    }

    // Skip the line that marks the start of a new file (diff metadata)
    if (line.startsWith("+++ ")) {
      continue;
    }

    for (const { name, pattern } of SECRET_PATTERNS) {
      const match = line.substring(1).match(pattern); // Check after the + sign
      if (match) {
        secrets.push({
          pattern: name,
          line: line.substring(0, 100), // Truncate long lines
          lineNumber: i + 1,
        });
      }
    }
  }

  return {
    found: secrets.length > 0,
    secrets,
  };
}

/**
 * Get the diff of staged or unstaged changes for scanning
 *
 * @param options - Git options
 * @param staged - Whether to get staged changes (true) or unstaged (false)
 * @returns Git diff output
 */
async function getDiff(
  options: { cwd: string; logger: Logger; dryRun?: boolean },
  staged: boolean
): Promise<string> {
  const args = staged ? ["diff", "--staged"] : ["diff"];
  const result = await runGitCommand(args, options);
  return result.stdout;
}

/**
 * Run secret scanning on staged changes
 *
 * @param options - Quality check options
 * @returns Result indicating if secrets were found
 */
export async function runSecretScan(
  options: QualityCheckOptions
): Promise<{ found: boolean; errors: string[] }> {
  const { cwd, logger, dryRun, checks } = options;

  if (!checks.secret_scan) {
    logger.debug("Secret scan disabled, skipping");
    return { found: false, errors: [] };
  }

  if (dryRun) {
    logger.info("[dry-run] Would scan for secrets");
    return { found: false, errors: [] };
  }

  logger.info("Scanning for secrets in changes");

  // Check staged changes first
  const diff = await getDiff({ cwd, logger, dryRun }, true);

  // If no staged changes, check unstaged
  const diffToScan = diff || await getDiff({ cwd, logger, dryRun }, false);

  const result = scanForSecrets(diffToScan);

  if (result.found) {
    const errors: string[] = [];
    for (const secret of result.secrets) {
      errors.push(`Potential ${secret.pattern} found at line ${secret.lineNumber}: ${secret.line}`);
    }
    return { found: true, errors };
  }

  logger.info("No secrets detected");
  return { found: false, errors: [] };
}

/**
 * Run all PR quality gates before push
 *
 * This is the main entry point for quality checks in the PR phase.
 * It runs configured commands and optional secret scanning.
 *
 * @param options - Quality check options
 * @returns Result indicating if all checks passed
 */
export async function runPrePushQualityGates(
  options: QualityCheckOptions
): Promise<QualityCheckResult> {
  const { cwd, logger, dryRun, checks } = options;

  if (dryRun) {
    logger.info("[dry-run] Would run pre-push quality gates");
    return { success: true, errors: [], skipped: [] };
  }

  logger.info("Running pre-push quality gates");

  const errors: string[] = [];
  const skipped: string[] = [];

  // Run configured commands (tests, lint, typecheck, etc.)
  const qualityResult = await runQualityChecks(options);
  if (!qualityResult.success) {
    errors.push(...qualityResult.errors);
  }
  skipped.push(...qualityResult.skipped);

  // Run secret scan if enabled
  if (checks.secret_scan) {
    const secretResult = await runSecretScan(options);
    if (secretResult.found) {
      errors.push(...secretResult.errors);
    }
  }

  return {
    success: errors.length === 0,
    errors,
    skipped,
  };
}
