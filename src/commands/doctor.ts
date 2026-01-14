import type { Logger } from "../logging";
import { findRepoRoot, findRootFromOptions } from "../fs/paths";
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
  const root = findRootFromOptions(options);
  const result = await runDoctor(root, { fix: options.fix }, logger);

  const { diagnostics, fixes } = result;

  if (diagnostics.length === 0) {
    console.log("✓ No issues found");
    return;
  }

  const grouped = {
    error: diagnostics.filter((d) => d.severity === "error"),
    warning: diagnostics.filter((d) => d.severity === "warning"),
    info: diagnostics.filter((d) => d.severity === "info"),
  };

  if (grouped.error.length > 0) {
    console.log(`Errors (${grouped.error.length}):`);
    for (const d of grouped.error) {
      console.log(`  ✗ ${formatDiagnostic(d)}`);
    }
  }

  if (grouped.warning.length > 0) {
    console.log(`Warnings (${grouped.warning.length}):`);
    for (const d of grouped.warning) {
      console.log(`  ⚠ ${formatDiagnostic(d)}`);
    }
  }

  if (grouped.info.length > 0) {
    console.log(`Info (${grouped.info.length}):`);
    for (const d of grouped.info) {
      console.log(`  ℹ ${formatDiagnostic(d)}`);
    }
  }

  if (fixes && fixes.length > 0) {
    console.log("");
    console.log("Fixes applied:");
    for (const fix of fixes) {
      const status = fix.fixed ? "✓" : "✗";
      const itemPrefix = fix.diagnostic.itemId
        ? `[${fix.diagnostic.itemId}] `
        : "";
      console.log(`  ${status} ${itemPrefix}${fix.message}`);
    }

    const fixedCount = fixes.filter((f) => f.fixed).length;
    const failedCount = fixes.length - fixedCount;
    console.log("");
    console.log(`Fixed ${fixedCount} issue(s), ${failedCount} failed`);
  } else if (
    diagnostics.some((d) => d.fixable) &&
    !options.fix
  ) {
    console.log("");
    console.log("Run with --fix to auto-fix recoverable issues");
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
