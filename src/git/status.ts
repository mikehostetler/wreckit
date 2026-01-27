import type { Logger } from "../logging";
import { runGitCommand } from "./index";

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
export interface StatusCompareOptions {
  cwd: string;
  logger: Logger;
  dryRun?: boolean;
  /** Paths that are allowed to change (relative to git root) */
  allowedPaths?: string[];
}

/**
 * Get human-readable description of git status code
 *
 * @param statusCode - Git status code (e.g., "M", "A", "D", "??")
 * @returns Human-readable description
 */
function getStatusDescription(statusCode: string): string {
  const descriptions: Record<string, string> = {
    M: "Modified",
    A: "Added",
    D: "Deleted",
    R: "Renamed",
    C: "Copied",
    "??": "Untracked",
    "!!": "Ignored",
  };

  return descriptions[statusCode] || `Unknown (${statusCode})`;
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
  gitRoot: string,
): GitFileChange[] {
  const changes: GitFileChange[] = [];

  if (!stdout) {
    return changes;
  }

  const lines = stdout.trim().split("\n");
  for (const line of lines) {
    if (line.length < 4) continue;

    // git status --porcelain format: XY filename
    // X = staging area status (1 char), Y = working tree status (1 char)
    // Then a space, then the filename
    const statusCodeRaw = line.substring(0, 2);
    // Trim to handle cases like "M " (modified in work tree only)
    const statusCode = statusCodeRaw.trim();
    
    // The path always starts at index 3 (after "XY ")
    // We don't use indexOf(" ") because it might match the leading space
    // in " M file.txt" or spaces inside the filename
    const path = line.substring(3);

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
  options: { cwd: string; logger: Logger; dryRun?: boolean },
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
  afterOptions: StatusCompareOptions,
): Promise<GitStatusComparisonResult> {
  const afterStatus = await getGitStatus(afterOptions);

  // Find new changes (files that are in after but not in before)
  const beforePaths = new Set(beforeStatus.map((c) => c.path));
  const newChanges = afterStatus.filter(
    (change) => !beforePaths.has(change.path),
  );

  // Check for violations (changes outside allowed paths)
  const allowedPaths = afterOptions.allowedPaths ?? [];
  const violations: GitFileChange[] = [];

  // Separate directory entries from file entries
  // Git reports directories with trailing slashes when they contain untracked files
  const directoryEntries = newChanges.filter((c) => c.path.endsWith("/"));
  const fileEntries = newChanges.filter((c) => !c.path.endsWith("/"));

  // First, check file entries against allowed paths
  for (const change of fileEntries) {
    const isAllowed = allowedPaths.some((allowedPath) => {
      // Normalize paths for comparison
      const normalizedAllowed = allowedPath
        .replace(/^\/+/, "")
        .replace(/\/+$/, "");
      const normalizedChange = change.path.replace(/^\/+/, "");

      // Check if change is within allowed path
      // Case 1: Exact match (e.g., "file.md" matches "file.md")
      // Case 2: Change is within allowed directory path (e.g., "dir/file.md" matches "dir/")
      // Case 3: Change is a subdirectory of allowed path (e.g., "dir/subdir/file.md" matches "dir/")
      if (normalizedChange === normalizedAllowed) {
        return true;
      }

      // Check if change is within allowed path (with or without trailing slash)
      return normalizedChange.startsWith(normalizedAllowed + "/");
    });

    if (!isAllowed) {
      violations.push(change);
    }
  }

  // Then, check directory entries
  // A directory entry is allowed if it's a parent of at least one allowed path
  // This handles git's behavior of showing "dir/" when there are untracked files inside
  for (const change of directoryEntries) {
    const isAllowed = allowedPaths.some((allowedPath) => {
      const normalizedAllowed = allowedPath
        .replace(/^\/+/, "")
        .replace(/\/+$/, "");
      const normalizedChange = change.path
        .replace(/^\/+/, "")
        .replace(/\/+$/, "");

      // Directory is allowed if it's a parent of an allowed path
      return (
        normalizedAllowed.startsWith(normalizedChange + "/") ||
        normalizedAllowed === normalizedChange
      );
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
export function formatViolations(
  result: GitStatusComparisonResult,
  phase: "research" | "plan" | "implement" | "strategy" = "research",
): string {
  if (result.valid) {
    return "";
  }

  const lines: string[] = [];

  if (phase === "research") {
    lines.push("Research phase detected unauthorized file modifications:");
    lines.push("");
  } else if (phase === "strategy") {
    lines.push("Strategy phase detected unauthorized file modifications:");
    lines.push("");
  } else if (phase === "plan") {
    lines.push("Plan phase detected unauthorized file modifications:");
    lines.push("");
  } else {
    lines.push("Implement phase detected scope creep:");
    lines.push("");
  }

  for (const violation of result.violations) {
    const statusDesc = getStatusDescription(violation.statusCode);
    lines.push(`  ${statusDesc} ${violation.path}`);
  }

  lines.push("");

  if (phase === "research") {
    lines.push(
      "The research phase must be read-only. Only research.md may be created.",
    );
    lines.push(
      "Any code changes should be made during the implementation phase.",
    );
  } else if (phase === "plan") {
    lines.push(
      "The plan phase must be design-only. Only plan.md and prd.json may be created.",
    );
    lines.push(
      "Any code changes should be made during the implementation phase.",
    );
  } else {
    lines.push("The implementation phase is scoped to the current story.");
    lines.push(
      "Changes outside of story-related files may indicate scope creep.",
    );
    lines.push(
      "Please review the changes and ensure they align with the story acceptance criteria.",
    );
  }

  return lines.join("\n");
}
