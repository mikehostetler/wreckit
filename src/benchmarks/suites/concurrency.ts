import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { SuiteResult, Metric } from "../schema";
import { calculateStats, makeTempDir, cleanup } from "../utils";
import { safeWriteJson } from "../../fs/atomic";

interface ConcurrencyOptions {
  iterations?: number;
}

/**
 * Simulates a minimal work unit (file write + read + parse).
 * This represents the type of I/O work done during item processing.
 */
async function simulateWorkUnit(dir: string, id: number): Promise<void> {
  const filePath = path.join(dir, `work-${id}.json`);
  await safeWriteJson(filePath, { id, timestamp: Date.now() });
  const content = await fs.readFile(filePath, "utf-8");
  JSON.parse(content); // Parse to simulate real work
}

/**
 * Worker pool implementation matching orchestrator.ts pattern.
 * Uses a shared queue that workers drain by shifting items.
 *
 * @param workItems - Array of work item IDs
 * @param parallelism - Number of concurrent workers
 * @param workFn - Function to execute for each work item
 * @returns Total duration in milliseconds
 */
async function runWorkerPool(
  workItems: number[],
  parallelism: number,
  workFn: (id: number) => Promise<void>,
): Promise<number> {
  const queue = [...workItems];
  const start = performance.now();

  const worker = async (): Promise<void> => {
    while (queue.length > 0) {
      const id = queue.shift();
      if (id !== undefined) {
        await workFn(id);
      }
    }
  };

  const workers: Promise<void>[] = [];
  for (let i = 0; i < parallelism; i++) {
    workers.push(worker());
  }

  await Promise.all(workers);
  return performance.now() - start;
}

/**
 * Runs the concurrency scaling benchmark suite.
 * Measures throughput scaling with parallel worker pools at 1, 2, 4, and 8 workers.
 * Calculates duration, throughput, and scaling efficiency for each parallelism level.
 */
export async function runConcurrencySuite(
  options: ConcurrencyOptions = {},
): Promise<SuiteResult> {
  const { iterations = 5 } = options;
  const metrics: Metric[] = [];
  const suiteStart = performance.now();
  const workItemCount = 20; // Fixed number of work items for consistent comparison

  // Benchmark parallel scaling at different levels
  for (const parallelism of [1, 2, 4, 8]) {
    const tempDir = makeTempDir();
    await fs.mkdir(tempDir, { recursive: true });

    const samples: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const workDir = path.join(tempDir, `run-${i}`);
      await fs.mkdir(workDir, { recursive: true });

      const workItems = Array.from({ length: workItemCount }, (_, idx) => idx);
      const durationMs = await runWorkerPool(workItems, parallelism, (id) =>
        simulateWorkUnit(workDir, id),
      );
      samples.push(durationMs);
    }

    const stats = calculateStats(samples);

    // Calculate throughput (items per second)
    const throughput = (workItemCount / stats.value) * 1000;

    metrics.push({
      name: `parallel_${parallelism}_duration_ms`,
      unit: "ms",
      ...stats,
    });

    metrics.push({
      name: `parallel_${parallelism}_throughput`,
      unit: "items/sec",
      value: throughput,
      samples: iterations,
    });

    await cleanup(tempDir);
  }

  // Calculate scaling efficiency (speedup vs linear)
  const baseline =
    metrics.find((m) => m.name === "parallel_1_duration_ms")?.value || 1;

  for (const parallelism of [2, 4, 8]) {
    const duration =
      metrics.find((m) => m.name === `parallel_${parallelism}_duration_ms`)
        ?.value || baseline;
    const idealSpeedup = parallelism;
    const actualSpeedup = baseline / duration;
    const efficiency = (actualSpeedup / idealSpeedup) * 100;

    metrics.push({
      name: `parallel_${parallelism}_efficiency`,
      unit: "%",
      value: efficiency,
    });
  }

  return {
    name: "concurrency",
    description: "Measures throughput scaling with parallel worker pools",
    metrics,
    duration_ms: performance.now() - suiteStart,
  };
}
