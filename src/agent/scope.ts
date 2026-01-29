/**
 * Story Scope Enforcement (Item 084)
 *
 * This module provides interfaces and utilities for enforcing story scope boundaries
 * during the implementation phase. It tracks file changes and validates them against
 * configured scope limits to prevent runaway token costs and scope creep.
 */

import type { Logger } from "../logging";
import type { GitFileChange } from "../git/status";
import type { StoryScopeConfig } from "../schemas";
import { getWorkingTreeDiffStats, configToOptions, formatScopeViolations } from "../git/scope";

// Re-export types from git/scope for convenience
export type {
  DiffStats,
  FileDiff,
  StoryScopeOptions,
  StoryScopeResult,
  ScopeViolation,
  ViolationType,
} from "../git/scope";

// Re-export utility functions from git/scope
export {
  getDiffStats,
  getWorkingTreeDiffStats,
  validateStoryScope as validateGitDiffScope,
  formatScopeViolations,
  isApproachingThreshold,
  logScopeWarnings,
  configToOptions,
  DEFAULT_SCOPE_OPTIONS,
} from "../git/scope";

/**
 * Statistics about file changes during story execution
 */
export interface ScopeStats {
  /** Total number of lines changed across all files */
  totalLines: number;
  /** Total number of files changed */
  totalFiles: number;
  /** Approximate size of diff in bytes */
  totalBytes: number;
  /** List of files that were changed */
  changedFiles: string[];
}

/**
 * Result of scope validation
 */
export interface ScopeValidationResult {
  /** Whether the changes are within scope limits */
  valid: boolean;
  /** Statistics about the changes */
  stats: ScopeStats;
  /** List of validation errors (empty if valid) */
  errors: string[];
  /** List of warnings (e.g., approaching thresholds) */
  warnings: string[];
}

/**
 * Options for scope validation
 */
export interface ScopeValidationOptions {
  /** Story ID for error reporting */
  storyId: string;
  /** Git changes to validate */
  changes: GitFileChange[];
  /** Scope configuration limits */
  config: StoryScopeConfig;
  /** Diff statistics from git diff --stat */
  diffStats?: ScopeStats;
}

/**
 * Calculate the percentage of a value relative to a maximum
 */
function calculatePercentage(value: number, max: number): number {
  if (max === 0) return 0;
  return (value / max) * 100;
}

/**
 * Format a scope validation error message
 */
export function formatScopeErrors(result: ScopeValidationResult, storyId: string): string {
  if (result.valid) {
    return "";
  }

  const lines: string[] = [];
  lines.push(`Story ${storyId} exceeded scope limits:`);
  lines.push("");

  for (const error of result.errors) {
    lines.push(`  ❌ ${error}`);
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
  lines.push("  - Review the changes and ensure they align with the story acceptance criteria");

  return lines.join("\n");
}

/**
 * Validate story scope based on git changes and diff statistics
 *
 * This function checks:
 * 1. Number of files changed (excluding patterns)
 * 2. Total lines changed
 * 3. Total bytes changed
 *
 * @param options - Validation options
 * @returns Validation result with details
 */
export function validateStoryScope(options: ScopeValidationOptions): ScopeValidationResult {
  const { storyId, changes, config, diffStats } = options;
  const errors: string[] = [];
  const warnings: string[] = [];

  // Filter out excluded patterns
  const filteredChanges = changes.filter((change) => {
    return !config.exclude_patterns.some((pattern) => {
      // Simple glob pattern matching (supports * wildcards)
      const regex = new RegExp(
        "^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$"
      );
      return regex.test(change.path);
    });
  });

  // Use provided diff stats or calculate from changes
  const stats: ScopeStats = diffStats || {
    totalLines: 0, // Would need git diff output to calculate accurately
    totalFiles: filteredChanges.length,
    totalBytes: 0, // Would need git diff output to calculate accurately
    changedFiles: filteredChanges.map((c) => c.path),
  };

  // Validate file count
  if (stats.totalFiles > config.max_diff_files) {
    errors.push(
      `Too many files changed: ${stats.totalFiles} files (max: ${config.max_diff_files})`
    );
  } else if (stats.totalFiles > config.max_diff_files * 0.8) {
    warnings.push(
      `Approaching file limit: ${stats.totalFiles} files changed (max: ${config.max_diff_files})`
    );
  }

  // Validate line count
  if (stats.totalLines > config.max_diff_lines) {
    errors.push(
      `Too many lines changed: ${stats.totalLines} lines (max: ${config.max_diff_lines})`
    );
  } else if (stats.totalLines > config.max_diff_lines * 0.8) {
    warnings.push(
      `Approaching line limit: ${stats.totalLines} lines changed (max: ${config.max_diff_lines})`
    );
  }

  // Validate byte count
  if (stats.totalBytes > config.max_diff_bytes) {
    const sizeKb = (stats.totalBytes / 1024).toFixed(2);
    const maxKb = (config.max_diff_bytes / 1024).toFixed(2);
    errors.push(
      `Diff too large: ${sizeKb} KB (max: ${maxKb} KB)`
    );
  } else if (stats.totalBytes > config.max_diff_bytes * 0.8) {
    const sizeKb = (stats.totalBytes / 1024).toFixed(2);
    const maxKb = (config.max_diff_bytes / 1024).toFixed(2);
    warnings.push(
      `Approaching size limit: ${sizeKb} KB changed (max: ${maxKb} KB)`
    );
  }

  return {
    valid: errors.length === 0,
    stats,
    errors,
    warnings,
  };
}

/**
 * Scope enforcer class that tracks changes during story execution
 */
export class ScopeEnforcer {
  private config: StoryScopeConfig;
  private logger: Logger;
  private beforeStatus: GitFileChange[];
  private enabled: boolean;

  constructor(config: StoryScopeConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.beforeStatus = [];
    this.enabled = config.enabled !== false; // Default to true
  }

  /**
   * Capture the initial state before story execution
   */
  async captureBeforeState(beforeStatus: GitFileChange[]): Promise<void> {
    this.beforeStatus = beforeStatus;
    if (this.enabled) {
      this.logger.debug("Captured pre-story git state for scope enforcement");
    }
  }

  /**
   * Validate changes after story execution
   */
  async validateAfterStory(
    storyId: string,
    afterStatus: GitFileChange[],
    diffStats?: ScopeStats
  ): Promise<ScopeValidationResult> {
    if (!this.enabled) {
      this.logger.debug("Scope enforcement disabled, skipping validation");
      return {
        valid: true,
        stats: {
          totalLines: 0,
          totalFiles: 0,
          totalBytes: 0,
          changedFiles: [],
        },
        errors: [],
        warnings: [],
      };
    }

    // Find new changes (files that are in after but not in before)
    const beforePaths = new Set(this.beforeStatus.map((c) => c.path));
    const newChanges = afterStatus.filter(
      (change) => !beforePaths.has(change.path)
    );

    const result = validateStoryScope({
      storyId,
      changes: newChanges,
      config: this.config,
      diffStats,
    });

    if (result.valid) {
      if (result.warnings.length > 0) {
        this.logger.warn(
          `Story ${storyId} scope warnings:\n${result.warnings.join("\n")}`
        );
      } else {
        this.logger.debug(
          `Story ${storyId} scope validation passed: ${result.stats.totalFiles} files, ` +
            `${result.stats.totalLines} lines`
        );
      }
    } else {
      this.logger.error(
        `Story ${storyId} scope validation failed:\n${formatScopeErrors(result, storyId)}`
      );
    }

    return result;
  }

  /**
   * Check if scope enforcement is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}
