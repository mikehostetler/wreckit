import type { BenchmarkResult, Metric, SuiteResult } from "../schema";

/**
 * Formats a numeric value with appropriate precision based on unit.
 */
function formatValue(value: number, unit: string): string {
  if (unit === "ms") {
    return value.toFixed(2);
  }
  if (unit === "%") {
    return value.toFixed(1);
  }
  if (unit === "items/sec") {
    return value.toFixed(1);
  }
  return value.toString();
}

/**
 * Formats a single metric as a markdown table row.
 */
function formatMetricRow(metric: Metric): string {
  const value = formatValue(metric.value, metric.unit);
  const p50 =
    metric.p50 !== undefined ? formatValue(metric.p50, metric.unit) : "-";
  const p95 =
    metric.p95 !== undefined ? formatValue(metric.p95, metric.unit) : "-";
  const p99 =
    metric.p99 !== undefined ? formatValue(metric.p99, metric.unit) : "-";
  const samples =
    metric.samples !== undefined ? metric.samples.toString() : "-";

  return `| ${metric.name} | ${value} | ${metric.unit} | ${p50} | ${p95} | ${p99} | ${samples} |`;
}

/**
 * Formats a single suite as markdown.
 */
function formatSuite(suite: SuiteResult): string {
  const lines: string[] = [];

  lines.push(`## ${suite.name}`);
  lines.push("");
  lines.push(`_${suite.description}_`);
  lines.push("");
  lines.push(`Duration: ${suite.duration_ms.toFixed(0)}ms`);
  lines.push("");
  lines.push("| Metric | Mean | Unit | P50 | P95 | P99 | Samples |");
  lines.push("|--------|------|------|-----|-----|-----|---------|");

  for (const metric of suite.metrics) {
    lines.push(formatMetricRow(metric));
  }

  lines.push("");

  return lines.join("\n");
}

/**
 * Formats benchmark results as Markdown.
 * Includes environment section and tables for each suite.
 *
 * @param result - The benchmark result to format
 * @returns Formatted markdown string
 */
export function formatMarkdown(result: BenchmarkResult): string {
  const lines: string[] = [];

  lines.push("# Benchmark Results");
  lines.push("");
  lines.push(`Generated: ${result.environment.timestamp}`);
  lines.push("");
  lines.push("## Environment");
  lines.push("");
  lines.push(`- **OS**: ${result.environment.os}`);
  lines.push(`- **Architecture**: ${result.environment.arch}`);
  lines.push(`- **Bun Version**: ${result.environment.bun_version}`);
  lines.push(`- **CPU Count**: ${result.environment.cpu_count}`);
  lines.push("");
  lines.push(`**Total Duration**: ${result.total_duration_ms.toFixed(0)}ms`);
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const suite of result.suites) {
    lines.push(formatSuite(suite));
  }

  return lines.join("\n");
}
