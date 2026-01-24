import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { SuiteResult, Metric } from "../schema";
import { benchmark, calculateStats, makeTempDir, cleanup } from "../utils";
import { writeItem, readItem, writePrd, readPrd } from "../../fs/json";
import type { Item, Prd, Story } from "../../schemas";

interface ResumabilityOptions {
  iterations?: number;
}

/**
 * Creates a test item with the specified state.
 */
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

/**
 * Creates a test PRD with the specified number of pending and done stories.
 */
function createTestPrd(
  id: string,
  pendingCount: number,
  doneCount: number
): Prd {
  const stories: Story[] = [];

  // Add done stories first (lower priority numbers)
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

  // Add pending stories (higher priority numbers)
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

/**
 * Runs the resumability benchmark suite.
 * Measures the overhead of resumability features including:
 * - Item read time
 * - PRD read with stories
 * - Story skip detection
 * - State recovery (combined item + PRD read)
 */
export async function runResumabilitySuite(
  options: ResumabilityOptions = {}
): Promise<SuiteResult> {
  const { iterations = 10 } = options;
  const metrics: Metric[] = [];
  const suiteStart = performance.now();

  // Benchmark 1: Item read time
  {
    const tempDir = makeTempDir();
    const itemDir = path.join(tempDir, ".wreckit", "items", "bench", "001-test");
    await fs.mkdir(itemDir, { recursive: true });

    const item = createTestItem("bench/001-test", "planned");
    await writeItem(itemDir, item);

    const samples = await benchmark(
      async () => {
        await readItem(itemDir);
      },
      { iterations }
    );

    const stats = calculateStats(samples);
    metrics.push({
      name: "item_read_ms",
      unit: "ms",
      ...stats,
    });

    await cleanup(tempDir);
  }

  // Benchmark 2: PRD read with 10 stories
  {
    const tempDir = makeTempDir();
    const itemDir = path.join(tempDir, ".wreckit", "items", "bench", "002-test");
    await fs.mkdir(itemDir, { recursive: true });

    const prd = createTestPrd("bench/002-test", 5, 5); // 5 pending, 5 done = 10 total
    await writePrd(itemDir, prd);

    const samples = await benchmark(
      async () => {
        await readPrd(itemDir);
      },
      { iterations }
    );

    const stats = calculateStats(samples);
    metrics.push({
      name: "prd_read_10_stories_ms",
      unit: "ms",
      ...stats,
    });

    await cleanup(tempDir);
  }

  // Benchmark 3: Story skip detection (finding first pending among 50 done)
  {
    const tempDir = makeTempDir();
    const itemDir = path.join(tempDir, ".wreckit", "items", "bench", "003-test");
    await fs.mkdir(itemDir, { recursive: true });

    // 50 done, 1 pending at the end
    const prd = createTestPrd("bench/003-test", 1, 50);
    await writePrd(itemDir, prd);

    const samples = await benchmark(
      async () => {
        const loaded = await readPrd(itemDir);
        const pending = loaded.user_stories
          .filter((s) => s.status === "pending")
          .sort((a, b) => a.priority - b.priority);
        // Simulate the check that happens in itemWorkflow.ts
        if (pending.length === 0) throw new Error("Unexpected: no pending stories");
      },
      { iterations }
    );

    const stats = calculateStats(samples);
    metrics.push({
      name: "story_skip_detection_50done_ms",
      unit: "ms",
      ...stats,
    });

    await cleanup(tempDir);
  }

  // Benchmark 4: State recovery (read item + PRD together)
  {
    const tempDir = makeTempDir();
    const itemDir = path.join(tempDir, ".wreckit", "items", "bench", "004-test");
    await fs.mkdir(itemDir, { recursive: true });

    const item = createTestItem("bench/004-test", "implementing");
    const prd = createTestPrd("bench/004-test", 3, 7); // 3 pending, 7 done
    await writeItem(itemDir, item);
    await writePrd(itemDir, prd);

    const samples = await benchmark(
      async () => {
        const [loadedItem, loadedPrd] = await Promise.all([
          readItem(itemDir),
          readPrd(itemDir),
        ]);
        // Simulate state recovery check
        if (loadedItem.state !== "implementing")
          throw new Error("Unexpected state");
        const pending = loadedPrd.user_stories.filter(
          (s) => s.status === "pending"
        );
        if (pending.length === 0)
          throw new Error("Unexpected: no pending stories");
      },
      { iterations }
    );

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
    description:
      "Measures overhead of resumability features (skip detection, state recovery)",
    metrics,
    duration_ms: performance.now() - suiteStart,
  };
}
