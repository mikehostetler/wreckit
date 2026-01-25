/**
 * Error Detection Engine
 * Analyzes agent execution results to detect recoverable errors.
 *
 * Part of Agent Doctor (Item 038) - Self-Healing Runtime
 */

import type { AgentResult } from "./runner";

/**
 * Error types that can be automatically healed
 */
export type ErrorType = "git_lock" | "npm_failure" | "json_corruption" | "unknown";

/**
 * Error diagnosis with confidence score and repair suggestions
 */
export interface ErrorDiagnosis {
  recoverable: boolean;
  errorType: ErrorType;
  confidence: number; // 0-1
  suggestedRepair: string[];
  detectedPattern: string;
}

/**
 * Detects recoverable errors in agent execution results.
 * Returns null if error is not recoverable.
 */
export function detectRecoverableError(result: AgentResult): ErrorDiagnosis | null {
  // Successful execution - no error to detect
  if (result.success) {
    return null;
  }

  const output = result.output.toLowerCase();
  const stderr = extractStderr(result.output).toLowerCase();

  // Check for git lock errors
  const gitLockDiagnosis = detectGitLockError(output, stderr);
  if (gitLockDiagnosis) {
    return gitLockDiagnosis;
  }

  // Check for npm failure errors
  const npmFailureDiagnosis = detectNpmFailure(output, stderr);
  if (npmFailureDiagnosis) {
    return npmFailureDiagnosis;
  }

  // Check for JSON corruption errors
  const jsonCorruptionDiagnosis = detectJsonCorruption(output, stderr);
  if (jsonCorruptionDiagnosis) {
    return jsonCorruptionDiagnosis;
  }

  // No recoverable error pattern detected
  return null;
}

/**
 * Extract stderr from combined output (if separable)
 */
function extractStderr(output: string): string {
  // Try to extract stderr-like lines (many tools prefix stderr with program name)
  const lines = output.split("\n");
  const stderrLines: string[] = [];

  for (const line of lines) {
    // Common patterns for stderr output
    if (
      line.toLowerCase().includes("error:") ||
      line.toLowerCase().includes("npm err!") ||
      line.toLowerCase().includes("failed") ||
      line.toLowerCase().includes("fatal:")
    ) {
      stderrLines.push(line);
    }
  }

  return stderrLines.length > 0 ? stderrLines.join("\n") : output;
}

/**
 * Detect git lock errors (.git/index.lock)
 */
function detectGitLockError(output: string, stderr: string): ErrorDiagnosis | null {
  const combined = `${output}\n${stderr}`;

  // Git lock error patterns (from real git error messages)
  const patterns = [
    "unable to create",
    ".git/index.lock",
    "another git process",
    "file exists",
    "unable to open",
    "lock file",
    "index.lock",
  ];

  const matchedPatterns: string[] = [];
  for (const pattern of patterns) {
    if (combined.includes(pattern)) {
      matchedPatterns.push(pattern);
    }
  }

  // Require at least 2 strong indicators or 1 very specific one
  const hasSpecificLock = combined.includes(".git/index.lock") || combined.includes("another git process");
  const hasMultipleIndicators = matchedPatterns.length >= 2;

  if (hasSpecificLock || hasMultipleIndicators) {
    return {
      recoverable: true,
      errorType: "git_lock",
      confidence: hasSpecificLock ? 0.95 : 0.8,
      suggestedRepair: ["remove_git_lock"],
      detectedPattern: matchedPatterns.join(", "),
    };
  }

  return null;
}

/**
 * Detect npm failure errors
 */
function detectNpmFailure(output: string, stderr: string): ErrorDiagnosis | null {
  const combined = `${output}\n${stderr}`;

  // npm error patterns
  const patterns = [
    "npm err!",
    "missing module",
    "cannot find module",
    "enotent",
    "module not found",
    "code emodulenotfound",
  ];

  const matchedPatterns: string[] = [];
  for (const pattern of patterns) {
    if (combined.includes(pattern)) {
      matchedPatterns.push(pattern);
    }
  }

  // Require at least 1 npm-specific indicator
  if (matchedPatterns.length >= 1) {
    return {
      recoverable: true,
      errorType: "npm_failure",
      confidence: combined.includes("npm err!") ? 0.85 : 0.75,
      suggestedRepair: ["npm_install"],
      detectedPattern: matchedPatterns.join(", "),
    };
  }

  return null;
}

/**
 * Detect JSON corruption errors
 */
function detectJsonCorruption(output: string, stderr: string): ErrorDiagnosis | null {
  const combined = `${output}\n${stderr}`;

  // JSON error patterns
  const patterns = [
    "unexpected token",
    "json.parse",
    "syntaxerror",
    "invalid json",
    "json.parseerror",
    "unexpected end",
    "expected ',' or '}'",
  ];

  const matchedPatterns: string[] = [];
  for (const pattern of patterns) {
    if (combined.includes(pattern)) {
      matchedPatterns.push(pattern);
    }
  }

  // Also check for .json file references in error
  const hasJsonFileReference = combined.includes(".json") || combined.includes("config.json") ||
                               combined.includes("index.json") || combined.includes("batch-progress.json");

  // Require at least 1 JSON-specific indicator and file reference
  if (matchedPatterns.length >= 1 && hasJsonFileReference) {
    return {
      recoverable: true,
      errorType: "json_corruption",
      confidence: 0.75,
      suggestedRepair: ["restore_from_backup"],
      detectedPattern: matchedPatterns.join(", "),
    };
  }

  return null;
}
