/**
 * Story Scope Enforcement (Item 084)
 *
 * Git diff utilities for tracking story scope boundaries.
 * Provides functions to calculate diff statistics and validate against scope limits.
 */

import type { Logger } from "../logging";
import { runGitCommand, type GitOptions } from "./index";
import type { StoryScopeConfig } from "../schemas";

/**
 * Types of scope violations
 */
export type ViolationType =
  | "too_many_files"
  | "too_many_lines"
  | "too_many_bytes"
  | "excluded_pattern";

/**
 * Individual scope violation
 */
export interface ScopeViolation {
  /** Type of violation */
  type: ViolationType;
  /** Human-readable message */
  message: string;
  /** Actual value */
  actual: number;
  /** Maximum allowed value */
  maximum: number;
  /** File path (if applicable) */
  path?: string;
}

/**
 * Statistics about a single file's diff
 */
export interface FileDiff {
  /** File path */
  path: string;
  /** Number of lines added/modified */
  lines: number;
  /** Approximate size in bytes */
  bytes: number;
}

/**
 * Aggregate diff statistics
 */
export interface DiffStats {
  /** Total number of lines changed */
  totalLines: number;
  /** Total number of files changed */
  totalFiles: number;
  /** Approximate total bytes changed */
  totalBytes: number;
  /** Individual file changes */
  fileDiffs: FileDiff[];
}

/**
 * Options for story scope validation
 */
export interface StoryScopeOptions {
  /** Maximum lines allowed */
  maxLines: number;
  /** Maximum files allowed */
  maxFiles: number;
  /** Maximum bytes allowed */
  maxBytes: number;
  /** Patterns to exclude from validation */
  excludePatterns: string[];
  /** Warning threshold percentage (default: 80) */
  warningThreshold?: number;
}

/**
 * Result of story scope validation
 */
export interface StoryScopeResult {
  /** Whether the scope is within limits */
  valid: boolean;
  /** Diff statistics */
  stats: DiffStats;
  /** List of violations (empty if valid) */
  violations: ScopeViolation[];
  /** List of warnings (e.g., approaching thresholds) */
  warnings: string[];
}

/**
 * Default scope options based on StoryScopeConfigSchema defaults
 */
export const DEFAULT_SCOPE_OPTIONS: StoryScopeOptions = {
  maxLines: 1000,
  maxFiles: 50,
  maxBytes: 100000, // 100KB
  excludePatterns: ["*.lock", "package-lock.json", "yarn.lock", "*.log"],
  warningThreshold: 80,
};

/**
 * Parse git diff --stat output to extract line counts
 *
 * Format: " path/to/file.ts | 123 +-
 *         path/to/other.ts | 45 +-"
 *
 * @param stdout - Output from git diff --stat
 * @returns Array of file diffs
 */
export function parseDiffStat(stdout: string): FileDiff[] {
  const fileDiffs: FileDiff[] = [];

  if (!stdout) {
    return fileDiffs;
  }

  const lines = stdout.trim().split("\n");

  for (const line of lines) {
    // Skip summary line (e.g., " 3 files changed, 50 insertions(+), 10 deletions(-)")
    if (line.match(/^\s*\d+\s+files?\s+changed/)) {
      continue;
    }

    // Parse line: "path/to/file.ts | 123 +-"
    const match = line.match(/^\s*(.+?)\s+\|\s+(\d+)(?:\s+[\+\-]+)?$/);
    if (!match) {
      continue;
    }

    const path = match[1].trim();
    const lines = parseInt(match[2], 10);

    if (path) {
      fileDiffs.push({
        path,
        lines,
        // Estimate bytes: average 40 bytes per line (rough estimate)
        bytes: lines * 40,
      });
    }
  }

  return fileDiffs;
}

/**
 * Parse git diff --shortstat output to extract totals
 *
 * Format: " 3 files changed, 50 insertions(+), 10 deletions(-)"
 *
 * @param stdout - Output from git diff --shortstat
 * @returns Object with total stats
 */
export function parseShortStat(stdout: string): {
  files: number;
  insertions: number;
  deletions: number;
  totalLines: number;
} {
  const result = {
    files: 0,
    insertions: 0,
    deletions: 0,
    totalLines: 0,
  };

  if (!stdout) {
    return result;
  }

  // Match: " 3 files changed, 50 insertions(+), 10 deletions(-)"
  const match = stdout.match(
    /(\d+)\s+files?\s+changed(?:,\s+(\d+)\s+insertions?\(\+\))?(?:,\s+(\d+)\s+deletions?\(\-\))?/
  );

  if (match) {
    result.files = parseInt(match[1], 10) || 0;
    result.insertions = parseInt(match[2], 10) || 0;
    result.deletions = parseInt(match[3], 10) || 0;
    result.totalLines = result.insertions + result.deletions;
  }

  return result;
}

/**
 * Get diff statistics between two git refs
 *
 * @param baseRef - Base git ref (e.g., "HEAD~1", branch name)
 * @param options - Git options
 * @returns Diff statistics
 */
export async function getDiffStats(
  baseRef: string,
  options: GitOptions
): Promise<DiffStats> {
  const { cwd, logger } = options;

  try {
    // Get per-file stats using --stat
    const statResult = await runGitCommand(
      ["diff", "--stat", baseRef, "HEAD"],
      { cwd, logger }
    );

    const fileDiffs = parseDiffStat(statResult.stdout);

    // Get total stats using --shortstat
    const shortStatResult = await runGitCommand(
      ["diff", "--shortstat", baseRef, "HEAD"],
      { cwd, logger }
    );

    const totals = parseShortStat(shortStatResult.stdout);

    return {
      totalLines: totals.totalLines || fileDiffs.reduce((sum, f) => sum + f.lines, 0),
      totalFiles: totals.files || fileDiffs.length,
      totalBytes: fileDiffs.reduce((sum, f) => sum + f.bytes, 0),
      fileDiffs,
    };
  } catch (error: any) {
    logger.warn(`Failed to get diff stats: ${error.message}`);
    return {
      totalLines: 0,
      totalFiles: 0,
      totalBytes: 0,
      fileDiffs: [],
    };
  }
}

/**
 * Get diff statistics comparing current working tree to a base state
 *
 * @param options - Git options
 * @returns Diff statistics
 */
export async function getWorkingTreeDiffStats(
  options: GitOptions
): Promise<DiffStats> {
  try {
    // Get per-file stats using --stat
    const statResult = await runGitCommand(["diff", "--stat"], options);

    const fileDiffs = parseDiffStat(statResult.stdout);

    // Get total stats using --shortstat
    const shortStatResult = await runGitCommand(
      ["diff", "--shortstat"],
      options
    );

    const totals = parseShortStat(shortStatResult.stdout);

    return {
      totalLines: totals.totalLines || fileDiffs.reduce((sum, f) => sum + f.lines, 0),
      totalFiles: totals.files || fileDiffs.length,
      totalBytes: fileDiffs.reduce((sum, f) => sum + f.bytes, 0),
      fileDiffs,
    };
  } catch (error: any) {
    const { logger } = options;
    logger.warn(`Failed to get working tree diff stats: ${error.message}`);
    return {
      totalLines: 0,
      totalFiles: 0,
      totalBytes: 0,
      fileDiffs: [],
    };
  }
}

/**
 * Check if a value is approaching a threshold
 *
 * @param value - Current value
 * @param maximum - Maximum allowed value
 * @param thresholdPercent - Warning threshold percentage (default: 80)
 * @returns true if value is at or above threshold
 */
export function isApproachingThreshold(
  value: number,
  maximum: number,
  thresholdPercent: number = 80
): boolean {
  if (maximum === 0) return false;
  return (value / maximum) * 100 >= thresholdPercent;
}

/**
 * Validate diff stats against scope limits
 *
 * @param stats - Diff statistics to validate
 * @param options - Scope validation options
 * @param storyId - Story ID for error messages
 * @returns Validation result
 */
export function validateStoryScope(
  stats: DiffStats,
  options: StoryScopeOptions,
  storyId?: string
): StoryScopeResult {
  const violations: ScopeViolation[] = [];
  const warnings: string[] = [];

  const {
    maxLines,
    maxFiles,
    maxBytes,
    excludePatterns,
    warningThreshold = 80,
  } = options;

  // Filter out excluded patterns
  const filteredFileDiffs = stats.fileDiffs.filter(
    (fileDiff) =>
      !excludePatterns.some((pattern) => {
        const regex = new RegExp(
          "^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$"
        );
        return regex.test(fileDiff.path);
      })
  );

  // Recalculate totals after filtering
  const filteredTotalLines = filteredFileDiffs.reduce(
    (sum, f) => sum + f.lines,
    0
  );
  const filteredTotalFiles = filteredFileDiffs.length;
  const filteredTotalBytes = filteredFileDiffs.reduce(
    (sum, f) => sum + f.bytes,
    0
  );

  // Check file count
  if (filteredTotalFiles > maxFiles) {
    violations.push({
      type: "too_many_files",
      message: `Too many files changed: ${filteredTotalFiles} files (max: ${maxFiles})`,
      actual: filteredTotalFiles,
      maximum: maxFiles,
    });
  } else if (
    isApproachingThreshold(filteredTotalFiles, maxFiles, warningThreshold)
  ) {
    warnings.push(
      `Approaching file limit: ${filteredTotalFiles} files changed (max: ${maxFiles})`
    );
  }

  // Check line count
  if (filteredTotalLines > maxLines) {
    violations.push({
      type: "too_many_lines",
      message: `Too many lines changed: ${filteredTotalLines} lines (max: ${maxLines})`,
      actual: filteredTotalLines,
      maximum: maxLines,
    });
  } else if (
    isApproachingThreshold(filteredTotalLines, maxLines, warningThreshold)
  ) {
    warnings.push(
      `Approaching line limit: ${filteredTotalLines} lines changed (max: ${maxLines})`
    );
  }

  // Check byte count
  if (filteredTotalBytes > maxBytes) {
    const sizeKb = (filteredTotalBytes / 1024).toFixed(2);
    const maxKb = (maxBytes / 1024).toFixed(2);
    violations.push({
      type: "too_many_bytes",
      message: `Diff too large: ${sizeKb} KB (max: ${maxKb} KB)`,
      actual: filteredTotalBytes,
      maximum: maxBytes,
    });
  } else if (
    isApproachingThreshold(filteredTotalBytes, maxBytes, warningThreshold)
  ) {
    const sizeKb = (filteredTotalBytes / 1024).toFixed(2);
    const maxKb = (maxBytes / 1024).toFixed(2);
    warnings.push(
      `Approaching size limit: ${sizeKb} KB changed (max: ${maxKb} KB)`
    );
  }

  return {
    valid: violations.length === 0,
    stats: {
      totalLines: filteredTotalLines,
      totalFiles: filteredTotalFiles,
      totalBytes: filteredTotalBytes,
      fileDiffs: filteredFileDiffs,
    },
    violations,
    warnings,
  };
}

/**
 * Format scope violations into a human-readable message
 *
 * @param result - Validation result
 * @param storyId - Story ID for context
 * @returns Formatted error message
 */
export function formatScopeViolations(
  result: StoryScopeResult,
  storyId: string
): string {
  if (result.valid) {
    return "";
  }

  const lines: string[] = [];

  if (storyId) {
    lines.push(`Story ${storyId} exceeded scope limits:`);
  } else {
    lines.push("Scope validation failed:");
  }
  lines.push("");

  for (const violation of result.violations) {
    lines.push(`  ❌ ${violation.message}`);
  }

  if (result.warnings.length > 0) {
    lines.push("");
    lines.push("Warnings:");
    for (const warning of result.warnings) {
      lines.push(`  ⚠️  ${warning}`);
    }
  }

  lines.push("");
  lines.push("Suggestions:");
  lines.push("  - Consider splitting this work into multiple stories");
  lines.push("  - Check if generated files should be excluded from scope checks");
  lines.push("  - Review the changes and ensure they align with story acceptance criteria");
  lines.push("  - Update scope limits in config if this is expected behavior");

  return lines.join("\n");
}

/**
 * Log scope warnings to logger
 *
 * @param result - Validation result
 * @param logger - Logger instance
 * @param storyId - Story ID for context
 */
export function logScopeWarnings(
  result: StoryScopeResult,
  logger: Logger,
  storyId?: string
): void {
  if (result.warnings.length === 0) {
    return;
  }

  const prefix = storyId ? `Story ${storyId}:` : "Scope validation:";

  for (const warning of result.warnings) {
    logger.warn(`${prefix} ${warning}`);
  }
}

/**
 * Convert StoryScopeConfig to StoryScopeOptions
 *
 * @param config - Story scope config from schemas
 * @returns Validation options
 */
export function configToOptions(config: StoryScopeConfig): StoryScopeOptions {
  return {
    maxLines: config.max_diff_lines,
    maxFiles: config.max_diff_files,
    maxBytes: config.max_diff_bytes,
    excludePatterns: config.exclude_patterns || [],
    warningThreshold: 80, // Default warning threshold
  };
}
