import type { BenchmarkResult } from "../schema";

/**
 * Escapes a value for CSV output.
 * Wraps values containing commas, quotes, or newlines in double quotes.
 */
function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Formats a numeric value with 6 decimal places for CSV output.
 */
function formatValue(value: number): string {
  return value.toFixed(6);
}

/**
 * Formats benchmark results as CSV.
 * One row per metric with columns: suite, metric, value, unit, min, max, p50, p95, p99, samples, timestamp
 *
 * @param result - The benchmark result to format
 * @returns Formatted CSV string
 */
export function formatCsv(result: BenchmarkResult): string {
  const lines: string[] = [];

  // Header row
  lines.push("suite,metric,value,unit,min,max,p50,p95,p99,samples,timestamp");

  // Data rows
  for (const suite of result.suites) {
    for (const metric of suite.metrics) {
      const row = [
        escapeCSV(suite.name),
        escapeCSV(metric.name),
        formatValue(metric.value),
        escapeCSV(metric.unit),
        metric.min !== undefined ? formatValue(metric.min) : "",
        metric.max !== undefined ? formatValue(metric.max) : "",
        metric.p50 !== undefined ? formatValue(metric.p50) : "",
        metric.p95 !== undefined ? formatValue(metric.p95) : "",
        metric.p99 !== undefined ? formatValue(metric.p99) : "",
        metric.samples !== undefined ? metric.samples.toString() : "",
        escapeCSV(result.environment.timestamp),
      ];
      lines.push(row.join(","));
    }
  }

  return lines.join("\n");
}
