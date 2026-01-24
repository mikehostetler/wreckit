import type { BenchmarkResult } from "../schema";

/**
 * Formats benchmark results as JSON.
 * Uses 2-space indentation for readability.
 *
 * @param result - The benchmark result to format
 * @returns Formatted JSON string
 */
export function formatJson(result: BenchmarkResult): string {
  return JSON.stringify(result, null, 2);
}
