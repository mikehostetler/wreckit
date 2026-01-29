# Benchmarking suite for resumability and concurrency scaling Implementation Plan

## Overview

This plan implements a benchmarking suite that measures resumability and concurrency scaling performance for the wreckit CLI tool. The suite will generate paper-ready metrics in JSON, Markdown, and CSV formats, suitable for academic papers or performance reports.

The benchmarking suite will measure:
1. **Resumability performance** - How efficiently the system skips completed work and resumes from partial state
2. **Concurrency scaling** - How performance scales with the `--parallel` flag (1, 2, 4, 8 workers)
3. **File operations** - Atomic write overhead, lock acquisition latency, contention behavior

## Current State Analysis

### Existing Infrastructure

**Concurrency Support (verified in code):**
- `src/commands/orchestrator.ts:16-25` - `OrchestratorOptions` includes `parallel?: number`
- `src/commands/orchestrator.ts:210-283` - Worker pool pattern using queue-based processing
- Queue drains as workers pull items via `queue.shift()`

**Resumability Support (verified in code):**
- `src/workflow/itemWorkflow.ts:576-698` - Implementation loop resumes from pending stories via `hasPendingStories(prd)`
- Stories with `status: "done"` are skipped; iteration continues from first pending story
- State persisted in `.wreckit/items/<id>/item.json` and `prd.json`

**File Locking (verified in code):**
- `src/fs/lock.ts:16-263` - `FileLock` class with exclusive/shared locks
- `src/fs/lock.ts:229-240` - `withExclusiveLock` convenience method
- `src/fs/lock.ts:251-262` - `withSharedLock` convenience method
- Stale lock detection at 60 second threshold (`STALE_THRESHOLD_MS`)

**Atomic Writes (verified in code):**
- `src/fs/atomic.ts:14-39` - `safeWriteJson` uses write-to-temp-then-rename pattern
- Random suffix temp files prevent collision
- `src/fs/json.ts:90-103` - `writeItem` and `writePrd` use `useLock: true`

**Test Patterns (verified in code):**
- `src/__tests__/edge-cases/concurrent.test.ts:9-19` - `makeTempDir()` and `cleanup()` helpers
- `src/__tests__/edge-cases/concurrent.test.ts:21-37` - `makeItem()` factory function
- Uses Bun test runner with `describe`, `it`, `beforeEach`, `afterEach`

**Output Patterns (verified in code):**
- `src/logging.ts:104-106` - `logger.json(data)` outputs via `console.log(JSON.stringify(data))`
- `src/commands/dryRunFormatter.ts:85-115` - Table formatting with box-drawing characters
- No existing CSV formatter in codebase

### Key Discoveries:

- The orchestrator's worker pool (`src/commands/orchestrator.ts:268-279`) creates N workers that race to drain a shared queue - this is what we benchmark for concurrency
- File locking uses POSIX-style lockfiles with PID tracking, not kernel flock - this means we can measure acquisition time
- The `--mockAgent` flag exists and is wired through (`src/commands/orchestrator.ts:45`), allowing benchmarks without LLM calls
- `fast-check` is already a devDependency (`package.json:47`) for property-based testing

## Desired End State

A complete benchmarking suite accessible via `bun run benchmark` with the following capabilities:

1. **Three benchmark suites:**
   - Resumability (skip overhead, state recovery)
   - Concurrency scaling (throughput at parallel=1,2,4,8)
   - File operations (atomic write, lock acquisition)

2. **Three output formats:**
   - JSON: Machine-readable with full metadata
   - Markdown: Human-readable tables for documentation
   - CSV: Spreadsheet-compatible for analysis

3. **Statistical rigor:**
   - Multiple iterations per measurement (configurable, default 10)
   - Percentile reporting (p50, p95, p99)
   - Environment metadata (OS, Bun version, CPU count)

### Verification of End State:

```bash
# Run all benchmarks with JSON output
bun run benchmark --format json > results.json

# Run specific suite with markdown output
bun run benchmark --suite resumability --format md

# Run with custom iterations
bun run benchmark --iterations 20 --format csv
```

## What We're NOT Doing

1. **NOT adding a CLI subcommand** - Keeping benchmark code out of the main bundle via separate script
2. **NOT using kernel flock** - Staying with existing lockfile-based locking
3. **NOT benchmarking actual LLM calls** - All benchmarks use `mockAgent=true`
4. **NOT memory profiling** - V8 heap tracking is out of scope for v1
5. **NOT CI integration** - No threshold checks or regression detection in this iteration
6. **NOT tmpfs** - Using real filesystem for representative I/O characteristics

## Implementation Approach

We'll build the benchmarking suite in four phases:

1. **Phase 1: Core Infrastructure** - Schema, types, utility functions for timing and stats
2. **Phase 2: Benchmark Suites** - Individual suite implementations
3. **Phase 3: Output Formatters** - JSON, Markdown, CSV reporters
4. **Phase 4: CLI Runner** - Entry point with argument parsing

---

## Phase 1: Core Infrastructure

### Overview
Set up the foundational types, schemas, and utility functions for the benchmarking suite.

### Changes Required:

#### 1. Create benchmark schema and types
**File**: `src/benchmarks/schema.ts`
**Purpose**: Define Zod schemas for benchmark results, ensuring type safety and validation

```typescript
import { z } from "zod";

export const MetricSchema = z.object({
  name: z.string(),
  value: z.number(),
  unit: z.string(),
  // Optional statistical details
  min: z.number().optional(),
  max: z.number().optional(),
  p50: z.number().optional(),
  p95: z.number().optional(),
  p99: z.number().optional(),
  samples: z.number().optional(),
});

export const SuiteResultSchema = z.object({
  name: z.string(),
  description: z.string(),
  metrics: z.array(MetricSchema),
  duration_ms: z.number(),
});

export const EnvironmentSchema = z.object({
  os: z.string(),
  arch: z.string(),
  bun_version: z.string(),
  cpu_count: z.number(),
  timestamp: z.string(),
});

export const BenchmarkResultSchema = z.object({
  schema_version: z.literal(1),
  environment: EnvironmentSchema,
  suites: z.array(SuiteResultSchema),
  total_duration_ms: z.number(),
});

export type Metric = z.infer<typeof MetricSchema>;
export type SuiteResult = z.infer<typeof SuiteResultSchema>;
export type Environment = z.infer<typeof EnvironmentSchema>;
export type BenchmarkResult = z.infer<typeof BenchmarkResultSchema>;
```

#### 2. Create benchmark utilities
**File**: `src/benchmarks/utils.ts`
**Purpose**: Timing helpers, statistical functions, temp directory management

```typescript
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { randomBytes } from "node:crypto";
import type { Environment, Metric } from "./schema";

/**
 * High-resolution timing wrapper
 */
export async function measure<T>(fn: () => Promise<T>): Promise<{ result: T; durationMs: number }> {
  const start = performance.now();
  const result = await fn();
  const durationMs = performance.now() - start;
  return { result, durationMs };
}

/**
 * Run a function multiple times and collect timing samples
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
 * Calculate statistics from samples
 */
export function calculateStats(samples: number[]): Omit<Metric, "name" | "unit"> {
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;

  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / n;

  const p50 = sorted[Math.floor(n * 0.5)];
  const p95 = sorted[Math.floor(n * 0.95)];
  const p99 = sorted[Math.floor(n * 0.99)];

  return {
    value: mean,
    min: sorted[0],
    max: sorted[n - 1],
    p50,
    p95,
    p99,
    samples: n,
  };
}

/**
 * Create a unique temp directory for benchmark isolation
 */
export function makeTempDir(prefix = "wreckit-bench"): string {
  return path.join(os.tmpdir(), `${prefix}-${randomBytes(8).toString("hex")}`);
}

/**
 * Clean up a temp directory
 */
export async function cleanup(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Get environment information for benchmark metadata
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
```

#### 3. Create types barrel export
**File**: `src/benchmarks/index.ts`
**Purpose**: Clean exports for the benchmarks module

```typescript
export * from "./schema";
export * from "./utils";
```

### Success Criteria:

#### Automated Verification:
- [ ] Type checking passes: `bun run --bun tsc --noEmit`
- [ ] New files have no unused exports
- [ ] Schema validates sample data correctly

#### Manual Verification:
- [ ] `import { BenchmarkResultSchema, measure, makeTempDir } from "./benchmarks"` works
- [ ] `calculateStats([1, 2, 3, 4, 5])` returns expected percentiles

---

## Phase 2: Benchmark Suites

### Overview
Implement the three benchmark suites: resumability, concurrency, and file operations.

### Changes Required:

#### 1. Resumability benchmark suite
**File**: `src/benchmarks/suites/resumability.ts`
**Purpose**: Measure skip-existing overhead and state recovery performance

```typescript
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { SuiteResult, Metric } from "../schema";
import { benchmark, calculateStats, makeTempDir, cleanup } from "../utils";
import { writeItem, readItem, writePrd, readPrd } from "../../fs/json";
import type { Item, Prd, Story } from "../../schemas";
import { safeWriteJson } from "../../fs/atomic";

interface ResumabilityOptions {
  iterations?: number;
}

function createTestItem(id: string, state: Item["state"]): Item {
  return {
    schema_version: 1,
    id,
    title: "Benchmark Test Item",
    section: "benchmark",
    state,
    overview: "Test item for benchmarking",
    branch: null,
    pr_url: null,
    pr_number: null,
    last_error: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function createTestPrd(id: string, pendingCount: number, doneCount: number): Prd {
  const stories: Story[] = [];

  for (let i = 0; i < doneCount; i++) {
    stories.push({
      id: `US-${String(i + 1).padStart(3, "0")}`,
      title: `Done Story ${i + 1}`,
      acceptance_criteria: ["Criterion 1", "Criterion 2"],
      priority: i + 1,
      status: "done",
      notes: "",
    });
  }

  for (let i = 0; i < pendingCount; i++) {
    stories.push({
      id: `US-${String(doneCount + i + 1).padStart(3, "0")}`,
      title: `Pending Story ${i + 1}`,
      acceptance_criteria: ["Criterion 1", "Criterion 2"],
      priority: doneCount + i + 1,
      status: "pending",
      notes: "",
    });
  }

  return {
    schema_version: 1,
    id,
    branch_name: `wreckit/${id}`,
    user_stories: stories,
  };
}

export async function runResumabilitySuite(options: ResumabilityOptions = {}): Promise<SuiteResult> {
  const { iterations = 10 } = options;
  const metrics: Metric[] = [];
  const suiteStart = performance.now();

  // Benchmark 1: Skip existing item read
  {
    const tempDir = makeTempDir();
    const itemDir = path.join(tempDir, ".wreckit", "items", "bench", "001-test");
    await fs.mkdir(itemDir, { recursive: true });

    const item = createTestItem("bench/001-test", "planned");
    await writeItem(itemDir, item);

    const samples = await benchmark(async () => {
      await readItem(itemDir);
    }, { iterations });

    const stats = calculateStats(samples);
    metrics.push({
      name: "item_read_ms",
      unit: "ms",
      ...stats,
    });

    await cleanup(tempDir);
  }

  // Benchmark 2: PRD read with stories
  {
    const tempDir = makeTempDir();
    const itemDir = path.join(tempDir, ".wreckit", "items", "bench", "002-test");
    await fs.mkdir(itemDir, { recursive: true });

    const prd = createTestPrd("bench/002-test", 5, 5); // 5 pending, 5 done
    await writePrd(itemDir, prd);

    const samples = await benchmark(async () => {
      await readPrd(itemDir);
    }, { iterations });

    const stats = calculateStats(samples);
    metrics.push({
      name: "prd_read_10_stories_ms",
      unit: "ms",
      ...stats,
    });

    await cleanup(tempDir);
  }

  // Benchmark 3: Story skip detection (finding first pending)
  {
    const tempDir = makeTempDir();
    const itemDir = path.join(tempDir, ".wreckit", "items", "bench", "003-test");
    await fs.mkdir(itemDir, { recursive: true });

    // 50 done, 1 pending at the end
    const prd = createTestPrd("bench/003-test", 1, 50);
    await writePrd(itemDir, prd);

    const samples = await benchmark(async () => {
      const loaded = await readPrd(itemDir);
      const pending = loaded.user_stories
        .filter(s => s.status === "pending")
        .sort((a, b) => a.priority - b.priority);
      // Simulate the check that happens in itemWorkflow.ts
      if (pending.length === 0) throw new Error("Unexpected");
    }, { iterations });

    const stats = calculateStats(samples);
    metrics.push({
      name: "story_skip_detection_50done_ms",
      unit: "ms",
      ...stats,
    });

    await cleanup(tempDir);
  }

  // Benchmark 4: State recovery (read item + prd together)
  {
    const tempDir = makeTempDir();
    const itemDir = path.join(tempDir, ".wreckit", "items", "bench", "004-test");
    await fs.mkdir(itemDir, { recursive: true });

    const item = createTestItem("bench/004-test", "implementing");
    const prd = createTestPrd("bench/004-test", 3, 7);
    await writeItem(itemDir, item);
    await writePrd(itemDir, prd);

    const samples = await benchmark(async () => {
      const [loadedItem, loadedPrd] = await Promise.all([
        readItem(itemDir),
        readPrd(itemDir),
      ]);
      // Simulate state recovery check
      if (loadedItem.state !== "implementing") throw new Error("Unexpected");
      const pending = loadedPrd.user_stories.filter(s => s.status === "pending");
      if (pending.length === 0) throw new Error("Unexpected");
    }, { iterations });

    const stats = calculateStats(samples);
    metrics.push({
      name: "state_recovery_ms",
      unit: "ms",
      ...stats,
    });

    await cleanup(tempDir);
  }

  return {
    name: "resumability",
    description: "Measures overhead of resumability features (skip detection, state recovery)",
    metrics,
    duration_ms: performance.now() - suiteStart,
  };
}
```

#### 2. Concurrency scaling benchmark suite
**File**: `src/benchmarks/suites/concurrency.ts`
**Purpose**: Measure throughput scaling with different parallelism levels

```typescript
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { SuiteResult, Metric } from "../schema";
import { benchmark, calculateStats, makeTempDir, cleanup, measure } from "../utils";
import { safeWriteJson } from "../../fs/atomic";
import { FileLock } from "../../fs/lock";

interface ConcurrencyOptions {
  iterations?: number;
}

/**
 * Simulates a minimal work unit (file read + write)
 */
async function simulateWorkUnit(dir: string, id: number): Promise<void> {
  const filePath = path.join(dir, `work-${id}.json`);
  await safeWriteJson(filePath, { id, timestamp: Date.now() });
  const content = await fs.readFile(filePath, "utf-8");
  JSON.parse(content); // Parse to simulate real work
}

/**
 * Worker pool implementation matching orchestrator.ts pattern
 */
async function runWorkerPool(
  workItems: number[],
  parallelism: number,
  workFn: (id: number) => Promise<void>
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

export async function runConcurrencySuite(options: ConcurrencyOptions = {}): Promise<SuiteResult> {
  const { iterations = 5 } = options;
  const metrics: Metric[] = [];
  const suiteStart = performance.now();
  const workItemCount = 20; // Fixed number of work items

  // Benchmark parallel scaling at different levels
  for (const parallelism of [1, 2, 4, 8]) {
    const tempDir = makeTempDir();
    await fs.mkdir(tempDir, { recursive: true });

    const samples: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const workDir = path.join(tempDir, `run-${i}`);
      await fs.mkdir(workDir, { recursive: true });

      const workItems = Array.from({ length: workItemCount }, (_, idx) => idx);
      const durationMs = await runWorkerPool(
        workItems,
        parallelism,
        (id) => simulateWorkUnit(workDir, id)
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
  const baseline = metrics.find(m => m.name === "parallel_1_duration_ms")?.value || 1;
  for (const parallelism of [2, 4, 8]) {
    const duration = metrics.find(m => m.name === `parallel_${parallelism}_duration_ms`)?.value || baseline;
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
```

#### 3. File operations benchmark suite
**File**: `src/benchmarks/suites/fileops.ts`
**Purpose**: Measure atomic write and lock acquisition performance

```typescript
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { SuiteResult, Metric } from "../schema";
import { benchmark, calculateStats, makeTempDir, cleanup, measure } from "../utils";
import { safeWriteJson } from "../../fs/atomic";
import { FileLock } from "../../fs/lock";

interface FileOpsOptions {
  iterations?: number;
}

export async function runFileOpsSuite(options: FileOpsOptions = {}): Promise<SuiteResult> {
  const { iterations = 10 } = options;
  const metrics: Metric[] = [];
  const suiteStart = performance.now();

  // Benchmark 1: Atomic write with small payload
  {
    const tempDir = makeTempDir();
    await fs.mkdir(tempDir, { recursive: true });
    const filePath = path.join(tempDir, "small.json");
    const payload = { id: 1, name: "test", value: 42 };

    const samples = await benchmark(async () => {
      await safeWriteJson(filePath, payload);
    }, { iterations });

    const stats = calculateStats(samples);
    metrics.push({
      name: "atomic_write_small_ms",
      unit: "ms",
      ...stats,
    });

    await cleanup(tempDir);
  }

  // Benchmark 2: Atomic write with medium payload (typical item.json)
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
      overview: "A moderately sized overview that contains some description text ".repeat(10),
      branch: "wreckit/test-001-benchmark",
      pr_url: null,
      pr_number: null,
      last_error: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const samples = await benchmark(async () => {
      await safeWriteJson(filePath, payload);
    }, { iterations });

    const stats = calculateStats(samples);
    metrics.push({
      name: "atomic_write_medium_ms",
      unit: "ms",
      ...stats,
    });

    await cleanup(tempDir);
  }

  // Benchmark 3: Atomic write with large payload (prd.json with many stories)
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

    const samples = await benchmark(async () => {
      await safeWriteJson(filePath, payload);
    }, { iterations });

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

    const samples = await benchmark(async () => {
      const lock = await FileLock.acquireExclusive(filePath, { timeout: 5000 });
      await lock.release();
    }, { iterations });

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

    const samples = await benchmark(async () => {
      await FileLock.withExclusiveLock(filePath, async () => {
        // Minimal work
        return;
      });
    }, { iterations });

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

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();

      // Two concurrent lock attempts
      await Promise.all([
        FileLock.withExclusiveLock(filePath, async () => {
          await new Promise(r => setTimeout(r, 5)); // Hold lock briefly
        }),
        FileLock.withExclusiveLock(filePath, async () => {
          await new Promise(r => setTimeout(r, 5)); // Hold lock briefly
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
    description: "Measures atomic write performance and lock acquisition latency",
    metrics,
    duration_ms: performance.now() - suiteStart,
  };
}
```

#### 4. Suite index file
**File**: `src/benchmarks/suites/index.ts`
**Purpose**: Export all suites

```typescript
export { runResumabilitySuite } from "./resumability";
export { runConcurrencySuite } from "./concurrency";
export { runFileOpsSuite } from "./fileops";
```

### Success Criteria:

#### Automated Verification:
- [ ] Type checking passes: `bun run --bun tsc --noEmit`
- [ ] Each suite can be imported and run independently
- [ ] No test failures from existing test suite

#### Manual Verification:
- [ ] `runResumabilitySuite()` completes and returns valid SuiteResult
- [ ] `runConcurrencySuite()` shows scaling (parallel_4 faster than parallel_1)
- [ ] `runFileOpsSuite()` shows atomic_write_large_ms > atomic_write_small_ms

---

## Phase 3: Output Formatters

### Overview
Implement the JSON, Markdown, and CSV output formatters for benchmark results.

### Changes Required:

#### 1. JSON reporter
**File**: `src/benchmarks/reporters/json.ts`
**Purpose**: Output benchmark results as formatted JSON

```typescript
import type { BenchmarkResult } from "../schema";

export function formatJson(result: BenchmarkResult): string {
  return JSON.stringify(result, null, 2);
}
```

#### 2. Markdown reporter
**File**: `src/benchmarks/reporters/markdown.ts`
**Purpose**: Generate paper-ready markdown tables

```typescript
import type { BenchmarkResult, Metric, SuiteResult } from "../schema";

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

function formatMetricRow(metric: Metric): string {
  const value = formatValue(metric.value, metric.unit);
  const p50 = metric.p50 !== undefined ? formatValue(metric.p50, metric.unit) : "-";
  const p95 = metric.p95 !== undefined ? formatValue(metric.p95, metric.unit) : "-";
  const p99 = metric.p99 !== undefined ? formatValue(metric.p99, metric.unit) : "-";
  const samples = metric.samples !== undefined ? metric.samples.toString() : "-";

  return `| ${metric.name} | ${value} | ${metric.unit} | ${p50} | ${p95} | ${p99} | ${samples} |`;
}

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
```

#### 3. CSV reporter
**File**: `src/benchmarks/reporters/csv.ts`
**Purpose**: Generate spreadsheet-compatible CSV output

```typescript
import type { BenchmarkResult, Metric } from "../schema";

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatValue(value: number): string {
  return value.toFixed(6);
}

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
```

#### 4. Reporter index file
**File**: `src/benchmarks/reporters/index.ts`
**Purpose**: Export all reporters

```typescript
export { formatJson } from "./json";
export { formatMarkdown } from "./markdown";
export { formatCsv } from "./csv";
```

### Success Criteria:

#### Automated Verification:
- [ ] Type checking passes: `bun run --bun tsc --noEmit`
- [ ] JSON output is valid JSON (parseable)
- [ ] CSV output has correct column count per row

#### Manual Verification:
- [ ] Markdown output renders correctly in a markdown viewer
- [ ] CSV opens correctly in a spreadsheet application
- [ ] All three formats contain the same metric values

---

## Phase 4: CLI Runner

### Overview
Create the benchmark entry point with argument parsing and execution orchestration.

### Changes Required:

#### 1. Update benchmark index with runner
**File**: `src/benchmarks/index.ts`
**Purpose**: Update to include runner functionality

```typescript
export * from "./schema";
export * from "./utils";
export * from "./suites";
export * from "./reporters";
export { runBenchmarks } from "./runner";
```

#### 2. Create benchmark runner
**File**: `src/benchmarks/runner.ts`
**Purpose**: Orchestrate suite execution and output formatting

```typescript
import type { BenchmarkResult, SuiteResult } from "./schema";
import { getEnvironment } from "./utils";
import { runResumabilitySuite, runConcurrencySuite, runFileOpsSuite } from "./suites";
import { formatJson, formatMarkdown, formatCsv } from "./reporters";

export type SuiteName = "resumability" | "concurrency" | "fileops" | "all";
export type OutputFormat = "json" | "md" | "csv";

export interface BenchmarkOptions {
  suites?: SuiteName[];
  format?: OutputFormat;
  iterations?: number;
  output?: string; // File path or "-" for stdout
}

const SUITE_RUNNERS: Record<Exclude<SuiteName, "all">, (options: { iterations?: number }) => Promise<SuiteResult>> = {
  resumability: runResumabilitySuite,
  concurrency: runConcurrencySuite,
  fileops: runFileOpsSuite,
};

export async function runBenchmarks(options: BenchmarkOptions = {}): Promise<BenchmarkResult> {
  const {
    suites = ["all"],
    iterations = 10,
  } = options;

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

export function formatOutput(result: BenchmarkResult, format: OutputFormat): string {
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
```

#### 3. Create CLI entry point
**File**: `src/benchmarks/cli.ts`
**Purpose**: Parse arguments and run benchmarks

```typescript
#!/usr/bin/env bun

import * as fs from "node:fs/promises";
import { runBenchmarks, formatOutput, type SuiteName, type OutputFormat } from "./runner";

function parseArgs(args: string[]): {
  suites: SuiteName[];
  format: OutputFormat;
  iterations: number;
  output: string;
} {
  const result = {
    suites: ["all"] as SuiteName[],
    format: "json" as OutputFormat,
    iterations: 10,
    output: "-",
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--suite" || arg === "-s") {
      const value = args[++i];
      if (value) {
        result.suites = value.split(",") as SuiteName[];
      }
    } else if (arg === "--format" || arg === "-f") {
      const value = args[++i];
      if (value === "json" || value === "md" || value === "csv") {
        result.format = value;
      }
    } else if (arg === "--iterations" || arg === "-i") {
      const value = parseInt(args[++i], 10);
      if (!isNaN(value) && value > 0) {
        result.iterations = value;
      }
    } else if (arg === "--output" || arg === "-o") {
      const value = args[++i];
      if (value) {
        result.output = value;
      }
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Usage: bun run benchmark [options]

Options:
  -s, --suite <names>      Comma-separated suite names (resumability,concurrency,fileops,all)
  -f, --format <format>    Output format: json, md, csv (default: json)
  -i, --iterations <n>     Number of iterations per benchmark (default: 10)
  -o, --output <path>      Output file path, or "-" for stdout (default: -)
  -h, --help               Show this help message

Examples:
  bun run benchmark                           # Run all suites, JSON output
  bun run benchmark -f md                     # Markdown output
  bun run benchmark -s resumability -i 20     # Single suite with 20 iterations
  bun run benchmark -o results.json           # Write to file
`);
      process.exit(0);
    }
  }

  return result;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  console.error("Wreckit Benchmark Suite");
  console.error("=======================");
  console.error("");

  const result = await runBenchmarks({
    suites: args.suites,
    format: args.format,
    iterations: args.iterations,
  });

  const output = formatOutput(result, args.format);

  if (args.output === "-") {
    console.log(output);
  } else {
    await fs.writeFile(args.output, output, "utf-8");
    console.error(`\nResults written to ${args.output}`);
  }

  console.error("");
  console.error(`Total duration: ${result.total_duration_ms.toFixed(0)}ms`);
}

main().catch((error) => {
  console.error("Benchmark failed:", error);
  process.exit(1);
});
```

#### 4. Add benchmark script to package.json
**File**: `package.json`
**Changes**: Add benchmark script

```json
{
  "scripts": {
    "benchmark": "bun run ./src/benchmarks/cli.ts"
  }
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Type checking passes: `bun run --bun tsc --noEmit`
- [ ] `bun run benchmark --help` shows usage
- [ ] Build still succeeds: `bun run build`

#### Manual Verification:
- [ ] `bun run benchmark` completes without errors
- [ ] `bun run benchmark -f md` produces valid markdown
- [ ] `bun run benchmark -f csv` produces valid CSV
- [ ] `bun run benchmark -o results.json` creates file
- [ ] `bun run benchmark -s resumability` runs only resumability suite

---

## Testing Strategy

### Unit Tests

Create `src/__tests__/benchmarks.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import { calculateStats, makeTempDir, cleanup, getEnvironment } from "../benchmarks/utils";
import { formatJson, formatMarkdown, formatCsv } from "../benchmarks/reporters";
import type { BenchmarkResult, SuiteResult, Metric } from "../benchmarks/schema";

describe("benchmark utils", () => {
  it("calculateStats computes correct percentiles", () => {
    const samples = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const stats = calculateStats(samples);

    expect(stats.value).toBe(5.5); // mean
    expect(stats.min).toBe(1);
    expect(stats.max).toBe(10);
    expect(stats.p50).toBe(6); // floor(10 * 0.5) = 5, sorted[5] = 6
    expect(stats.samples).toBe(10);
  });

  it("makeTempDir creates unique directories", () => {
    const dir1 = makeTempDir();
    const dir2 = makeTempDir();
    expect(dir1).not.toBe(dir2);
  });

  it("getEnvironment returns valid environment", () => {
    const env = getEnvironment();
    expect(env.os).toBeTruthy();
    expect(env.arch).toBeTruthy();
    expect(env.cpu_count).toBeGreaterThan(0);
    expect(env.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });
});

describe("benchmark reporters", () => {
  const mockResult: BenchmarkResult = {
    schema_version: 1,
    environment: {
      os: "darwin-23.0.0",
      arch: "arm64",
      bun_version: "1.0.0",
      cpu_count: 8,
      timestamp: "2025-01-24T12:00:00.000Z",
    },
    suites: [
      {
        name: "test",
        description: "Test suite",
        metrics: [
          { name: "metric1", value: 10.5, unit: "ms", p50: 10, p95: 12, p99: 15, samples: 10 },
        ],
        duration_ms: 100,
      },
    ],
    total_duration_ms: 100,
  };

  it("formatJson produces valid JSON", () => {
    const output = formatJson(mockResult);
    const parsed = JSON.parse(output);
    expect(parsed.schema_version).toBe(1);
    expect(parsed.suites.length).toBe(1);
  });

  it("formatMarkdown produces valid markdown", () => {
    const output = formatMarkdown(mockResult);
    expect(output).toContain("# Benchmark Results");
    expect(output).toContain("| Metric | Mean |");
    expect(output).toContain("| metric1 |");
  });

  it("formatCsv produces valid CSV", () => {
    const output = formatCsv(mockResult);
    const lines = output.split("\n");
    expect(lines[0]).toBe("suite,metric,value,unit,min,max,p50,p95,p99,samples,timestamp");
    expect(lines.length).toBe(2); // header + 1 metric
    expect(lines[1]).toContain("test,metric1");
  });
});
```

### Integration Tests

The benchmark suites themselves serve as integration tests. Running `bun run benchmark` exercises:
- File system operations (atomic writes, locking)
- Concurrent worker pools
- State serialization/deserialization

### Manual Testing Steps

1. **Run full benchmark suite**:
   ```bash
   bun run benchmark
   ```
   Verify: Output is valid JSON with all three suites

2. **Test markdown output**:
   ```bash
   bun run benchmark -f md > BENCHMARKS.md
   ```
   Verify: Open BENCHMARKS.md in markdown preview, tables render correctly

3. **Test CSV output**:
   ```bash
   bun run benchmark -f csv > results.csv
   ```
   Verify: Open in spreadsheet application, columns align

4. **Test single suite**:
   ```bash
   bun run benchmark -s resumability -i 5
   ```
   Verify: Only resumability suite runs, fewer iterations

5. **Verify concurrency scaling**:
   ```bash
   bun run benchmark -s concurrency -f md
   ```
   Verify: parallel_4_efficiency > 50% (shows scaling benefit)

---

## File Summary

### New Files to Create:
```
src/benchmarks/
├── index.ts              # Barrel exports
├── schema.ts             # Zod schemas and types
├── utils.ts              # Timing and stats utilities
├── runner.ts             # Benchmark orchestration
├── cli.ts                # CLI entry point
├── suites/
│   ├── index.ts          # Suite exports
│   ├── resumability.ts   # Resumability benchmarks
│   ├── concurrency.ts    # Concurrency scaling benchmarks
│   └── fileops.ts        # File operation benchmarks
└── reporters/
    ├── index.ts          # Reporter exports
    ├── json.ts           # JSON formatter
    ├── markdown.ts       # Markdown formatter
    └── csv.ts            # CSV formatter

src/__tests__/
└── benchmarks.test.ts    # Unit tests for benchmark utilities
```

### Modified Files:
```
package.json              # Add "benchmark" script
```

---

## References

- Research: `/Users/speed/wreckit/.wreckit/items/005-benchmarking-suite-for-resumability-and-concurrenc/research.md`
- Orchestrator worker pool: `src/commands/orchestrator.ts:210-283`
- FileLock implementation: `src/fs/lock.ts:16-263`
- Atomic write: `src/fs/atomic.ts:14-39`
- Test patterns: `src/__tests__/edge-cases/concurrent.test.ts:1-176`
- Logging/output patterns: `src/logging.ts:104-106`, `src/commands/dryRunFormatter.ts:85-115`
