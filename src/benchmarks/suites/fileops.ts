import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { SuiteResult, Metric } from "../schema";
import { benchmark, calculateStats, makeTempDir, cleanup } from "../utils";
import { safeWriteJson } from "../../fs/atomic";
import { FileLock } from "../../fs/lock";

interface FileOpsOptions {
  iterations?: number;
}

/**
 * Runs the file operations benchmark suite.
 * Measures atomic write performance and lock acquisition latency.
 */
export async function runFileOpsSuite(
  options: FileOpsOptions = {}
): Promise<SuiteResult> {
  const { iterations = 10 } = options;
  const metrics: Metric[] = [];
  const suiteStart = performance.now();

  // Benchmark 1: Atomic write with small payload (~100 bytes)
  {
    const tempDir = makeTempDir();
    await fs.mkdir(tempDir, { recursive: true });
    const filePath = path.join(tempDir, "small.json");
    const payload = { id: 1, name: "test", value: 42 };

    const samples = await benchmark(
      async () => {
        await safeWriteJson(filePath, payload);
      },
      { iterations }
    );

    const stats = calculateStats(samples);
    metrics.push({
      name: "atomic_write_small_ms",
      unit: "ms",
      ...stats,
    });

    await cleanup(tempDir);
  }

  // Benchmark 2: Atomic write with medium payload (typical item.json ~1KB)
  {
    const tempDir = makeTempDir();
    await fs.mkdir(tempDir, { recursive: true });
    const filePath = path.join(tempDir, "medium.json");
    const payload = {
      schema_version: 1,
      id: "test/001-benchmark",
      title: "Benchmark Test Item",
      section: "benchmark",
      state: "implementing",
      overview:
        "A moderately sized overview that contains some description text ".repeat(
          10
        ),
      branch: "wreckit/test-001-benchmark",
      pr_url: null,
      pr_number: null,
      last_error: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const samples = await benchmark(
      async () => {
        await safeWriteJson(filePath, payload);
      },
      { iterations }
    );

    const stats = calculateStats(samples);
    metrics.push({
      name: "atomic_write_medium_ms",
      unit: "ms",
      ...stats,
    });

    await cleanup(tempDir);
  }

  // Benchmark 3: Atomic write with large payload (PRD with 50 stories ~10KB)
  {
    const tempDir = makeTempDir();
    await fs.mkdir(tempDir, { recursive: true });
    const filePath = path.join(tempDir, "large.json");
    const stories = Array.from({ length: 50 }, (_, i) => ({
      id: `US-${String(i + 1).padStart(3, "0")}`,
      title: `User Story ${i + 1}: Implement feature with detailed description`,
      acceptance_criteria: [
        "Criterion 1: The system shall...",
        "Criterion 2: When the user...",
        "Criterion 3: Given that...",
      ],
      priority: i + 1,
      status: i < 25 ? "done" : "pending",
      notes: "Implementation notes for the story".repeat(5),
    }));
    const payload = {
      schema_version: 1,
      id: "test/001-benchmark",
      branch_name: "wreckit/test-001-benchmark",
      user_stories: stories,
    };

    const samples = await benchmark(
      async () => {
        await safeWriteJson(filePath, payload);
      },
      { iterations }
    );

    const stats = calculateStats(samples);
    metrics.push({
      name: "atomic_write_large_ms",
      unit: "ms",
      ...stats,
    });

    await cleanup(tempDir);
  }

  // Benchmark 4: Lock acquisition (uncontested exclusive)
  {
    const tempDir = makeTempDir();
    await fs.mkdir(tempDir, { recursive: true });
    const filePath = path.join(tempDir, "locktest.json");

    const samples = await benchmark(
      async () => {
        const lock = await FileLock.acquireExclusive(filePath, {
          timeout: 5000,
        });
        await lock.release();
      },
      { iterations }
    );

    const stats = calculateStats(samples);
    metrics.push({
      name: "lock_acquire_exclusive_ms",
      unit: "ms",
      ...stats,
    });

    await cleanup(tempDir);
  }

  // Benchmark 5: Lock acquisition with callback pattern
  {
    const tempDir = makeTempDir();
    await fs.mkdir(tempDir, { recursive: true });
    const filePath = path.join(tempDir, "locktest2.json");

    const samples = await benchmark(
      async () => {
        await FileLock.withExclusiveLock(filePath, async () => {
          // Minimal work
          return;
        });
      },
      { iterations }
    );

    const stats = calculateStats(samples);
    metrics.push({
      name: "lock_with_exclusive_ms",
      unit: "ms",
      ...stats,
    });

    await cleanup(tempDir);
  }

  // Benchmark 6: Lock contention (2 concurrent acquires)
  {
    const tempDir = makeTempDir();
    await fs.mkdir(tempDir, { recursive: true });
    const filePath = path.join(tempDir, "contention.json");

    const contentionSamples: number[] = [];

    // Warmup
    for (let i = 0; i < 2; i++) {
      await Promise.all([
        FileLock.withExclusiveLock(filePath, async () => {
          await new Promise((r) => setTimeout(r, 5));
        }),
        FileLock.withExclusiveLock(filePath, async () => {
          await new Promise((r) => setTimeout(r, 5));
        }),
      ]);
    }

    // Measured runs
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();

      // Two concurrent lock attempts
      await Promise.all([
        FileLock.withExclusiveLock(filePath, async () => {
          await new Promise((r) => setTimeout(r, 5)); // Hold lock briefly
        }),
        FileLock.withExclusiveLock(filePath, async () => {
          await new Promise((r) => setTimeout(r, 5)); // Hold lock briefly
        }),
      ]);

      contentionSamples.push(performance.now() - start);
    }

    const stats = calculateStats(contentionSamples);
    metrics.push({
      name: "lock_contention_2_concurrent_ms",
      unit: "ms",
      ...stats,
    });

    await cleanup(tempDir);
  }

  return {
    name: "fileops",
    description:
      "Measures atomic write performance and lock acquisition latency",
    metrics,
    duration_ms: performance.now() - suiteStart,
  };
}
