import type { BenchmarkResult, SuiteResult } from "./schema";
import { getEnvironment } from "./utils";
import {
  runResumabilitySuite,
  runConcurrencySuite,
  runFileOpsSuite,
} from "./suites";
import { formatJson, formatMarkdown, formatCsv } from "./reporters";

export type SuiteName = "resumability" | "concurrency" | "fileops" | "all";
export type OutputFormat = "json" | "md" | "csv";

export interface BenchmarkOptions {
  suites?: SuiteName[];
  format?: OutputFormat;
  iterations?: number;
  output?: string; // File path or "-" for stdout
}

const SUITE_RUNNERS: Record<
  Exclude<SuiteName, "all">,
  (options: { iterations?: number }) => Promise<SuiteResult>
> = {
  resumability: runResumabilitySuite,
  concurrency: runConcurrencySuite,
  fileops: runFileOpsSuite,
};

/**
 * Runs the specified benchmark suites and returns the results.
 * Logs progress to stderr so output can be piped.
 *
 * @param options - Configuration for which suites to run and how many iterations
 * @returns Complete benchmark results including environment metadata
 */
export async function runBenchmarks(
  options: BenchmarkOptions = {}
): Promise<BenchmarkResult> {
  const { suites = ["all"], iterations = 10 } = options;

  const suitesToRun: Exclude<SuiteName, "all">[] = suites.includes("all")
    ? ["resumability", "concurrency", "fileops"]
    : (suites as Exclude<SuiteName, "all">[]);

  const totalStart = performance.now();
  const environment = getEnvironment();
  const results: SuiteResult[] = [];

  for (const suiteName of suitesToRun) {
    const runner = SUITE_RUNNERS[suiteName];
    if (runner) {
      console.error(`Running ${suiteName} suite...`);
      const result = await runner({ iterations });
      results.push(result);
      console.error(`  Completed in ${result.duration_ms.toFixed(0)}ms`);
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
