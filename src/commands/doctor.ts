import type { Logger } from "../logging";
import { findRepoRoot } from "../fs/paths";
import {
  runDoctor,
  type Diagnostic,
  type DiagnosticSeverity,
  type FixResult,
} from "../doctor";

export interface DoctorOptions {
  fix?: boolean;
  cwd?: string;
}

function severityOrder(severity: DiagnosticSeverity): number {
  switch (severity) {
    case "error":
      return 0;
    case "warning":
      return 1;
    case "info":
      return 2;
  }
}

function formatDiagnostic(d: Diagnostic): string {
  const prefix = d.itemId ? `[${d.itemId}] ` : "";
  const fixable = d.fixable ? " (fixable)" : "";
  return `${prefix}${d.message}${fixable}`;
}

export async function doctorCommand(
  options: DoctorOptions,
  logger: Logger
): Promise<void> {
  const root = findRepoRoot(options.cwd ?? process.cwd());
  const result = await runDoctor(root, { fix: options.fix }, logger);

  const { diagnostics, fixes } = result;

  if (diagnostics.length === 0) {
    logger.info("✓ No issues found");
    return;
  }

  const grouped = {
    error: diagnostics.filter((d) => d.severity === "error"),
    warning: diagnostics.filter((d) => d.severity === "warning"),
    info: diagnostics.filter((d) => d.severity === "info"),
  };

  if (grouped.error.length > 0) {
    logger.error(`Errors (${grouped.error.length}):`);
    for (const d of grouped.error) {
      logger.error(`  ✗ ${formatDiagnostic(d)}`);
    }
  }

  if (grouped.warning.length > 0) {
    logger.warn(`Warnings (${grouped.warning.length}):`);
    for (const d of grouped.warning) {
      logger.warn(`  ⚠ ${formatDiagnostic(d)}`);
    }
  }

  if (grouped.info.length > 0) {
    logger.info(`Info (${grouped.info.length}):`);
    for (const d of grouped.info) {
      logger.info(`  ℹ ${formatDiagnostic(d)}`);
    }
  }

  if (fixes && fixes.length > 0) {
    logger.info("");
    logger.info("Fixes applied:");
    for (const fix of fixes) {
      const status = fix.fixed ? "✓" : "✗";
      const itemPrefix = fix.diagnostic.itemId
        ? `[${fix.diagnostic.itemId}] `
        : "";
      logger.info(`  ${status} ${itemPrefix}${fix.message}`);
    }

    const fixedCount = fixes.filter((f) => f.fixed).length;
    const failedCount = fixes.length - fixedCount;
    logger.info("");
    logger.info(`Fixed ${fixedCount} issue(s), ${failedCount} failed`);
  } else if (
    diagnostics.some((d) => d.fixable) &&
    !options.fix
  ) {
    logger.info("");
    logger.info("Run with --fix to auto-fix recoverable issues");
  }

  const remainingErrors = options.fix
    ? diagnostics.filter(
        (d) =>
          d.severity === "error" &&
          !fixes?.some((f) => f.diagnostic === d && f.fixed)
      )
    : grouped.error;

  if (remainingErrors.length > 0) {
    process.exit(1);
  }
}
