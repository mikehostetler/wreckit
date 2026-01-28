import * as fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { Logger } from "../logging";
import type { Prd, IndexItem, BatchProgress } from "../schemas";
import {
  findRepoRoot,
  findRootFromOptions,
  getItemDir,
  getResearchPath,
  getPlanPath,
  getPrdPath,
} from "../fs/paths";
import { pathExists } from "../fs/util";
import { loadConfig } from "../config";
import {
  readItem,
  readPrd,
  writeItem,
  readBatchProgress,
  writeBatchProgress,
  clearBatchProgress,
} from "../fs/json";
import { scanItems } from "./status";
import { runCommand } from "./run";
import { writeHealingLog, type HealingLogEntry } from "../agent/healingRunner";
import type { DoctorConfig } from "../schemas";
import { TuiViewAdapter } from "../views";
import type { AgentEvent } from "../tui/agentEvents";
import { createSimpleProgress } from "../tui";
import {
  formatDryRunSummary,
  formatDryRunRun,
  type DryRunItemInfo,
} from "./dryRunFormatter";
import { terminateAllAgents } from "../agent/runner";

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Create a new batch progress record.
 */
function createBatchProgress(
  queuedItems: string[],
  skippedItems: string[],
  parallel: number,
): BatchProgress {
  const now = new Date().toISOString();
  return {
    schema_version: 1,
    session_id: randomUUID(),
    pid: process.pid,
    started_at: now,
    updated_at: now,
    parallel,
    queued_items: queuedItems,
    current_item: null,
    completed: [],
    failed: [],
    skipped: skippedItems,
  };
}

/**
 * Check if existing progress is stale (> 24 hours old or owning process not running).
 */
function isProgressStale(progress: BatchProgress): boolean {
  const updatedAt = new Date(progress.updated_at).getTime();
  if (Date.now() - updatedAt > STALE_THRESHOLD_MS) {
    return true;
  }

  // Check if owning process is still running
  try {
    process.kill(progress.pid, 0);
    return false; // Process still running
  } catch {
    return true; // Process not running
  }
}

/**
 * Check if all dependencies of an item are satisfied (all deps are "done").
 */
function areDependenciesSatisfied(
  item: IndexItem,
  doneItemIds: Set<string>,
): boolean {
  if (!item.depends_on || item.depends_on.length === 0) {
    return true;
  }
  return item.depends_on.every((depId) => doneItemIds.has(depId));
}

export interface OrchestratorOptions {
  force?: boolean;
  dryRun?: boolean;
  noTui?: boolean;
  tuiDebug?: boolean;
  cwd?: string;
  mockAgent?: boolean;
  /** Maximum number of items to process concurrently (default: 1 for sequential) */
  parallel?: number;
  /** If true, ignore any existing batch progress and start fresh */
  noResume?: boolean;
  /** If true, include previously failed items when resuming */
  retryFailed?: boolean;
  /** If true, disable automatic self-healing (Item 038) */
  noHealing?: boolean;
  /** Override agent kind (e.g., 'rlm', 'claude_sdk') */
  agentKind?: string;
  /** If true, run in sandbox mode with ephemeral Sprite VM */
  sandbox?: boolean;
}

export interface OrchestratorResult {
  completed: string[];
  failed: string[];
  skipped: string[];
  remaining: string[];
}

function shouldUseTui(noTui?: boolean): boolean {
  if (noTui) return false;
  if (!process.stdout.isTTY) return false;
  if (process.env.CI) return false;
  return true;
}

export async function orchestrateAll(
  options: OrchestratorOptions,
  logger: Logger,
): Promise<OrchestratorResult> {
  const {
    force = false,
    dryRun = false,
    noTui = false,
    tuiDebug = false,
    cwd,
    mockAgent = false,
    parallel = 1,
    noHealing = false,
    agentKind,
    sandbox,
  } = options;

  const root = findRootFromOptions(options);
  const config = await loadConfig(
    root,
    {
      ...(agentKind ? { agentKind } : undefined),
      ...(sandbox ? { sandbox } : undefined),
    },
    logger,
  );

  const items = await scanItems(root);

  const result: OrchestratorResult = {
    completed: [],
    failed: [],
    skipped: [],
    remaining: [],
  };

  const nonDoneItems = items.filter((item) => item.state !== "done");
  const doneItems = items.filter((item) => item.state === "done");
  const allDoneIds = new Set(doneItems.map((item) => item.id));

  result.skipped = doneItems.map((item) => item.id);

  // Check for existing batch progress (resume support)
  const { noResume = false, retryFailed = false } = options;
  let batchProgress: BatchProgress | null = null;
  let workingNonDoneItems = [...nonDoneItems];

  if (!dryRun) {
    if (!noResume) {
      const existingProgress = await readBatchProgress(root);

      if (existingProgress) {
        if (isProgressStale(existingProgress)) {
          logger.warn("Found stale batch progress, starting fresh");
          await clearBatchProgress(root);
        } else {
          logger.info(
            `Resuming batch run (session ${existingProgress.session_id})`,
          );
          logger.info(
            `  Progress: ${existingProgress.completed.length} completed, ${existingProgress.failed.length} failed`,
          );
          batchProgress = existingProgress;

          // Merge existing progress into result
          result.completed = [...batchProgress.completed];
          result.failed = [...batchProgress.failed];

          // Add completed items to done set for dependency checking
          for (const id of batchProgress.completed) {
            allDoneIds.add(id);
          }

          // Filter out already-completed items
          const completedSet = new Set(batchProgress.completed);
          workingNonDoneItems = workingNonDoneItems.filter(
            (item) => !completedSet.has(item.id),
          );

          // Handle retry-failed: re-add failed items to queue
          if (retryFailed && batchProgress.failed.length > 0) {
            logger.info(
              `  Re-queuing ${batchProgress.failed.length} failed item(s)`,
            );
            const failedSet = new Set(batchProgress.failed);
            const failedItems = items.filter((item) => failedSet.has(item.id));
            workingNonDoneItems.push(...failedItems);
            result.failed = [];
            batchProgress.failed = [];
          } else {
            // Filter out failed items (don't re-process unless --retry-failed)
            const failedSet = new Set(batchProgress.failed);
            workingNonDoneItems = workingNonDoneItems.filter(
              (item) => !failedSet.has(item.id),
            );
          }

          // Clear current_item (will be re-set when processing starts)
          if (batchProgress.current_item) {
            logger.info(
              `  Re-queuing interrupted item: ${batchProgress.current_item}`,
            );
            batchProgress.current_item = null;
          }
        }
      }
    }

    // Create new session if not resuming
    if (!batchProgress) {
      batchProgress = createBatchProgress(
        workingNonDoneItems.map((i) => i.id),
        doneItems.map((i) => i.id),
        parallel,
      );
      await writeBatchProgress(root, batchProgress);
      logger.info(`Starting batch run (session ${batchProgress.session_id})`);
    }
  }

  if (dryRun) {
    const dryRunInfos: DryRunItemInfo[] = [];
    for (const item of nonDoneItems) {
      const itemDir = getItemDir(root, item.id);
      const fullItem = await readItem(itemDir);
      let prd: Prd | null = null;
      try {
        prd = await readPrd(itemDir);
      } catch {
        // prd doesn't exist
      }
      const hasResearch = await pathExists(getResearchPath(root, item.id));
      const hasPlan = await pathExists(getPlanPath(root, item.id));

      // Check for blocked dependencies in dry-run
      const deps = fullItem.depends_on || [];
      const blockedBy = deps.filter((id) => !allDoneIds.has(id));

      if (blockedBy.length > 0) {
        logger.info(`Item ${item.id} is blocked by: ${blockedBy.join(", ")}`);
      }

      dryRunInfos.push({ item: fullItem, prd, hasResearch, hasPlan, config });
    }
    formatDryRunSummary(dryRunInfos, logger);
    result.remaining = nonDoneItems.map((item) => item.id);
    return result;
  }

  // Parallel execution is not compatible with TUI
  // Fall back to simple progress when parallel > 1
  const useTui = shouldUseTui(noTui) && parallel <= 1;
  let view: TuiViewAdapter | null = null;
  const simpleProgress = useTui ? null : createSimpleProgress(logger);

  if (useTui) {
    let cleanupCalled = false;
    const cleanup = () => {
      if (cleanupCalled) return;
      cleanupCalled = true;
      view?.stop();
      terminateAllAgents(logger);
    };

    view = new TuiViewAdapter(items, {
      onQuit: () => {
        cleanup();
        process.exit(0);
      },
      debug: tuiDebug,
      debugLogger: tuiDebug ? logger : undefined,
    });
    view.start();

    process.on("exit", cleanup);
    process.on("SIGINT", () => {
      cleanup();
      process.exit(0);
    });
    process.on("SIGTERM", () => {
      cleanup();
      process.exit(0);
    });
  }

  // Process items either sequentially or in parallel
  if (parallel <= 1) {
    // Sequential processing with dependency checking
    let remainingItems = [...workingNonDoneItems];

    while (remainingItems.length > 0) {
      // Find next runnable item (dependencies satisfied)
      const runnableItems = remainingItems.filter((item) =>
        areDependenciesSatisfied(item, allDoneIds),
      );

      if (runnableItems.length === 0) {
        // No runnable items but items remain - likely circular dependency or missing deps
        logger.warn(
          `${remainingItems.length} items blocked by unsatisfied dependencies`,
        );
        result.remaining = remainingItems.map((item) => item.id);
        break;
      }

      const item = runnableItems[0];

      // Update batch progress: mark item as current
      if (batchProgress) {
        batchProgress.current_item = item.id;
        batchProgress.updated_at = new Date().toISOString();
        await writeBatchProgress(root, batchProgress);
      }

      if (useTui && view) {
        view.onActiveItemChanged(item.id);
        view.onPhaseChanged(item.state);
        view.onItemsChanged(
          items.map((it) => ({
            id: it.id,
            state: it.id === item.id ? "implementing" : it.state,
            title: it.title,
          })),
        );
      } else {
        simpleProgress?.update(item.id, "starting");
      }

      try {
        await runCommand(
          item.id,
          {
            force,
            dryRun: false,
            mockAgent,
            noHealing, // Pass through healing flag (Item 038)
            onAgentOutput: view
              ? (chunk) =>
                  view.onAgentEvent(item.id, {
                    type: "assistant_text",
                    text: chunk,
                  })
              : undefined,
            onAgentEvent: view
              ? (event: AgentEvent) => view.onAgentEvent(item.id, event)
              : undefined,
            onIterationChanged: view
              ? (iteration, maxIterations) =>
                  view.onIterationChanged(iteration, maxIterations)
              : undefined,
            onStoryChanged: view
              ? (story) => view.onStoryChanged(story)
              : undefined,
            onPhaseChanged: view
              ? (phase) => view.onPhaseChanged(phase as any)
              : undefined,
          },
          logger,
        );
        result.completed.push(item.id);
        allDoneIds.add(item.id);
        remainingItems = remainingItems.filter((i) => i.id !== item.id);

        // Checkpoint: item completed
        if (batchProgress) {
          batchProgress.completed.push(item.id);
          batchProgress.current_item = null;
          batchProgress.updated_at = new Date().toISOString();
          await writeBatchProgress(root, batchProgress);
        }

        if (useTui && view) {
          view.onItemsChanged(
            items.map((it) => ({
              id: it.id,
              state:
                it.id === item.id
                  ? "done"
                  : result.completed.includes(it.id)
                    ? "done"
                    : it.state,
              title: it.title,
            })),
          );
        } else {
          simpleProgress?.complete(item.id);
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        result.failed.push(item.id);
        remainingItems = remainingItems.filter((i) => i.id !== item.id);

        // Checkpoint: item failed
        if (batchProgress) {
          batchProgress.failed.push(item.id);
          batchProgress.current_item = null;
          batchProgress.updated_at = new Date().toISOString();
          await writeBatchProgress(root, batchProgress);
        }

        // Persist error to item.json
        try {
          const itemDir = getItemDir(root, item.id);
          const currentItem = await readItem(itemDir);
          await writeItem(itemDir, {
            ...currentItem,
            last_error: errorMessage,
          });
        } catch {
          // Best effort
        }

        if (useTui && view) {
          view.onAgentEvent(item.id, {
            type: "error",
            message: `Failed ${item.id}: ${errorMessage}`,
          });
        } else {
          simpleProgress?.fail(item.id, errorMessage);
        }
      }
    }
  } else {
    // Parallel processing using worker pool
    const effectiveParallel = Math.max(
      1,
      Math.min(parallel, workingNonDoneItems.length),
    );
    logger.info(
      `Processing ${workingNonDoneItems.length} items with ${effectiveParallel} parallel workers`,
    );
    await processItemsParallel(
      workingNonDoneItems,
      {
        force,
        mockAgent,
        logger,
        root,
        simpleProgress,
        parallel: effectiveParallel,
        allDoneIds,
        batchProgress,
      },
      result,
    );
  }

  if (view) {
    view.stop();
  }
  terminateAllAgents(logger);

  // Clean up batch progress on successful completion (all items processed)
  if (!dryRun && batchProgress && result.remaining.length === 0) {
    await clearBatchProgress(root);
  }

  return result;
}

/**
 * Process multiple items in parallel using a worker pool pattern.
 */
async function processItemsParallel(
  items: IndexItem[],
  context: {
    force: boolean;
    mockAgent: boolean;
    logger: Logger;
    root: string;
    simpleProgress: ReturnType<typeof createSimpleProgress> | null;
    parallel: number;
    allDoneIds: Set<string>;
    batchProgress: BatchProgress | null;
  },
  result: OrchestratorResult,
): Promise<void> {
  const {
    force,
    mockAgent,
    logger,
    root,
    simpleProgress,
    parallel,
    allDoneIds,
    batchProgress,
  } = context;

  // Use a local copy of items still to process
  let queue = [...items];

  // Process items with concurrency control and dependency checking
  const processNextItem = async (): Promise<void> => {
    while (true) {
      try {
        let item: IndexItem | undefined;
        let itemIndex = -1;

        // Find next runnable item (thread-safe queue management via single worker)
        for (let i = 0; i < queue.length; i++) {
          if (areDependenciesSatisfied(queue[i], allDoneIds)) {
            item = queue[i];
            itemIndex = i;
            break;
          }
        }

        if (!item) {
          // No runnable items available right now
          if (queue.length === 0) return;

          // Wait a bit and try again
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }

        // Remove from queue
        queue.splice(itemIndex, 1);

        simpleProgress?.update(item.id, "starting");

        try {
          await runCommand(
            item.id,
            { force, dryRun: false, mockAgent, cwd: root },
            logger,
          );
          result.completed.push(item.id);
          allDoneIds.add(item.id);
          simpleProgress?.complete(item.id);
          logger.info(`✓ Completed ${item.id}`);

          // Checkpoint: item completed (parallel mode)
          if (batchProgress) {
            batchProgress.completed.push(item.id);
            batchProgress.updated_at = new Date().toISOString();
            await writeBatchProgress(root, batchProgress);
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          result.failed.push(item.id);

          // Checkpoint: item failed (parallel mode)
          if (batchProgress) {
            batchProgress.failed.push(item.id);
            batchProgress.updated_at = new Date().toISOString();
            await writeBatchProgress(root, batchProgress);
          }

          // Persist error to item.json
          try {
            const itemDir = getItemDir(root, item.id);
            const currentItem = await readItem(itemDir);
            await writeItem(itemDir, {
              ...currentItem,
              last_error: errorMessage,
            });
          } catch {
            /* ignore */
          }

          simpleProgress?.fail(item.id, errorMessage);
          logger.error(`✗ Failed ${item.id}: ${errorMessage}`);
        }
      } catch (fatalError) {
        const msg =
          fatalError instanceof Error ? fatalError.message : String(fatalError);
        logger.error(`FATAL Worker Error: ${msg}`);
        // If we hit a truly fatal error in the worker logic, we should probably stop this worker
        return;
      }
    }
  };

  // Create workers
  const workers: Promise<void>[] = [];
  for (let i = 0; i < parallel; i++) {
    workers.push(processNextItem());
  }

  await Promise.all(workers);
}

export async function orchestrateNext(
  options: OrchestratorOptions,
  logger: Logger,
): Promise<{ itemId: string | null; success: boolean }> {
  const {
    force = false,
    dryRun = false,
    cwd,
    mockAgent = false,
    agentKind,
    sandbox,
  } = options;

  const root = findRootFromOptions(options);
  const config = await loadConfig(
    root,
    {
      ...(agentKind ? { agentKind } : undefined),
      ...(sandbox ? { sandbox } : undefined),
    },
    logger,
  );

  const nextItemId = await getNextIncompleteItem(root);

  if (nextItemId === null) {
    return { itemId: null, success: true };
  }

  if (dryRun) {
    const itemDir = getItemDir(root, nextItemId);
    const item = await readItem(itemDir);
    const { getNextPhase } = await import("../workflow");
    const nextPhase = getNextPhase(item);
    formatDryRunRun(item, nextPhase || "unknown", config, logger);
    return { itemId: nextItemId, success: true };
  }

  try {
    logger.info(`Running: ${nextItemId}`);
    await runCommand(nextItemId, { force, dryRun: false, mockAgent }, logger);
    return { itemId: nextItemId, success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed ${nextItemId}: ${errorMessage}`);

    // Persist error
    try {
      const itemDir = getItemDir(root, nextItemId);
      const currentItem = await readItem(itemDir);
      await writeItem(itemDir, { ...currentItem, last_error: errorMessage });
    } catch {
      /* ignore */
    }

    return { itemId: nextItemId, success: false };
  }
}

export async function getNextIncompleteItem(
  root: string,
): Promise<string | null> {
  const items = await scanItems(root);
  const doneIds = new Set(
    items.filter((i) => i.state === "done").map((i) => i.id),
  );

  // Find first non-done item with satisfied dependencies
  const nextItem = items.find((item) => {
    if (item.state === "done") return false;
    return areDependenciesSatisfied(item, doneIds);
  });

  return nextItem?.id ?? null;
}
