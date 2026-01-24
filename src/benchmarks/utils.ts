import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { randomBytes } from "node:crypto";
import type { Environment, Metric } from "./schema";

/**
 * High-resolution timing wrapper.
 * Executes a function and returns both its result and the execution duration.
 *
 * @param fn - The async function to measure
 * @returns Object containing the result and duration in milliseconds
 */
export async function measure<T>(
  fn: () => Promise<T>
): Promise<{ result: T; durationMs: number }> {
  const start = performance.now();
  const result = await fn();
  const durationMs = performance.now() - start;
  return { result, durationMs };
}

/**
 * Run a function multiple times and collect timing samples.
 * Includes warmup iterations that are discarded.
 *
 * @param fn - The async function to benchmark
 * @param options - Configuration for iterations and warmup
 * @returns Array of timing samples in milliseconds
 */
export async function benchmark(
  fn: () => Promise<void>,
  options: { iterations?: number; warmup?: number } = {}
): Promise<number[]> {
  const { iterations = 10, warmup = 2 } = options;

  // Warmup runs (discarded)
  for (let i = 0; i < warmup; i++) {
    await fn();
  }

  // Measured runs
  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const { durationMs } = await measure(fn);
    samples.push(durationMs);
  }

  return samples;
}

/**
 * Calculate statistics from timing samples.
 * Computes mean, min, max, and percentiles (p50, p95, p99).
 *
 * @param samples - Array of timing measurements
 * @returns Object with computed statistics (excluding name and unit)
 */
export function calculateStats(
  samples: number[]
): Omit<Metric, "name" | "unit"> {
  if (samples.length === 0) {
    return {
      value: 0,
      min: 0,
      max: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      samples: 0,
    };
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;

  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / n;

  // Calculate percentile indices
  const p50Index = Math.floor(n * 0.5);
  const p95Index = Math.min(Math.floor(n * 0.95), n - 1);
  const p99Index = Math.min(Math.floor(n * 0.99), n - 1);

  return {
    value: mean,
    min: sorted[0],
    max: sorted[n - 1],
    p50: sorted[p50Index],
    p95: sorted[p95Index],
    p99: sorted[p99Index],
    samples: n,
  };
}

/**
 * Create a unique temp directory for benchmark isolation.
 * Uses random suffix to prevent collisions.
 *
 * @param prefix - Optional prefix for the directory name
 * @returns Absolute path to the temp directory
 */
export function makeTempDir(prefix = "wreckit-bench"): string {
  return path.join(
    os.tmpdir(),
    `${prefix}-${randomBytes(8).toString("hex")}`
  );
}

/**
 * Clean up a temp directory safely.
 * Ignores errors if the directory doesn't exist or can't be removed.
 *
 * @param dir - The directory path to clean up
 */
export async function cleanup(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Get environment information for benchmark metadata.
 * Captures OS, architecture, Bun version, CPU count, and timestamp.
 *
 * @returns Environment metadata object
 */
export function getEnvironment(): Environment {
  return {
    os: `${os.platform()}-${os.release()}`,
    arch: os.arch(),
    bun_version: process.versions.bun || "unknown",
    cpu_count: os.cpus().length,
    timestamp: new Date().toISOString(),
  };
}
