import { logger } from "../logging";
import type { BenchmarkResult, SuiteResult } from "./schema";
// ...
// ...
  for (const suiteName of suitesToRun) {
    const runner = SUITE_RUNNERS[suiteName];
    if (runner) {
      logger.info(`Running ${suiteName} suite...`);
      const result = await runner({ iterations });
      results.push(result);
      logger.info(`  Completed in ${result.duration_ms.toFixed(0)}ms`);
    }
  }

  const totalDuration = performance.now() - totalStart;

  return {
    schema_version: 1,
    environment,
    suites: results,
    total_duration_ms: totalDuration,
  };
}

/**
 * Formats benchmark results using the specified output format.
 *
 * @param result - The benchmark results to format
 * @param format - The output format (json, md, csv)
 * @returns Formatted string in the requested format
 */
export function formatOutput(
  result: BenchmarkResult,
  format: OutputFormat
): string {
  switch (format) {
    case "json":
      return formatJson(result);
    case "md":
      return formatMarkdown(result);
    case "csv":
      return formatCsv(result);
    default:
      throw new Error(`Unknown format: ${format}`);
  }
}
