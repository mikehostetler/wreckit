import * as fs from "node:fs/promises";
import type { Logger } from "../logging";
import type { Prd } from "../schemas";
import { findRepoRoot, findRootFromOptions, getItemDir, getResearchPath, getPlanPath, getPrdPath } from "../fs/paths";
import { pathExists } from "../fs/util";
import { loadConfig } from "../config";
import { readItem, readPrd, writeItem } from "../fs/json";
import { scanItems } from "./status";
import { runCommand } from "./run";
import { TuiViewAdapter } from "../views";
import type { AgentEvent } from "../tui/agentEvents";
import { createSimpleProgress } from "../tui";
import { formatDryRunSummary, formatDryRunRun, type DryRunItemInfo } from "./dryRunFormatter";
import { terminateAllAgents } from "../agent/runner";

export interface OrchestratorOptions {
  force?: boolean;
  dryRun?: boolean;
  noTui?: boolean;
  tuiDebug?: boolean;
  cwd?: string;
  mockAgent?: boolean;
  /** Maximum number of items to process concurrently (default: 1 for sequential) */
  parallel?: number;
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
  logger: Logger
): Promise<OrchestratorResult> {
  const { force = false, dryRun = false, noTui = false, tuiDebug = false, cwd, mockAgent = false, parallel = 1 } = options;

  const root = findRootFromOptions(options);
  const config = await loadConfig(root);

  const items = await scanItems(root);

  const result: OrchestratorResult = {
    completed: [],
    failed: [],
    skipped: [],
    remaining: [],
  };

  const nonDoneItems = items.filter((item) => item.state !== "done");
  const doneItems = items.filter((item) => item.state === "done");

  result.skipped = doneItems.map((item) => item.id);

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
    // Sequential processing (original behavior)
    for (let i = 0; i < nonDoneItems.length; i++) {
      const item = nonDoneItems[i];

      if (useTui && view) {
        view.onActiveItemChanged(item.id);
        view.onPhaseChanged(item.state);
        view.onItemsChanged(items.map((it) => ({
          id: it.id,
          state: it.id === item.id ? "implementing" : it.state,
          title: it.title,
        })));
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
            onAgentOutput: view ? (chunk) => view.onAgentEvent(item.id, { type: "assistant_text", text: chunk }) : undefined,
            onAgentEvent: view ? (event: AgentEvent) => view.onAgentEvent(item.id, event) : undefined,
            onIterationChanged: view ? (iteration, maxIterations) => view.onIterationChanged(iteration, maxIterations) : undefined,
            onStoryChanged: view ? (story) => view.onStoryChanged(story) : undefined,
            onPhaseChanged: view ? (phase) => view.onPhaseChanged(phase as any) : undefined,
          },
          logger
        );
        result.completed.push(item.id);

        if (useTui && view) {
          view.onItemsChanged(items.map((it) => ({
            id: it.id,
            state: it.id === item.id ? "done" : result.completed.includes(it.id) ? "done" : it.state,
            title: it.title,
          })));
        } else {
          simpleProgress?.complete(item.id);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        result.failed.push(item.id);

        // Persist error to item.json
        try {
          const itemDir = getItemDir(root, item.id);
          const currentItem = await readItem(itemDir);
          await writeItem(itemDir, { ...currentItem, last_error: errorMessage });
        } catch {
          // Best effort - don't fail if we can't persist the error
        }

        if (useTui && view) {
          view.onAgentEvent(item.id, { type: "error", message: `Failed ${item.id}: ${errorMessage}` });
        } else {
          simpleProgress?.fail(item.id, errorMessage);
        }
      }
    }
  } else {
    // Parallel processing using worker pool
    const effectiveParallel = Math.max(1, Math.min(parallel, nonDoneItems.length));
    logger.info(`Processing ${nonDoneItems.length} items with ${effectiveParallel} parallel workers`);
    await processItemsParallel(
      nonDoneItems,
      { force, mockAgent, logger, root, simpleProgress, parallel: effectiveParallel },
      result
    );
  }

  if (view) {
    view.stop();
  }
  terminateAllAgents(logger);

  return result;
}

/**
 * Process multiple items in parallel using a worker pool pattern.
 *
 * @param items - Items to process
 * @param context - Processing context
 * @param result - Result object to update
 */
async function processItemsParallel(
  items: Array<{ id: string; state: string; title: string }>,
  context: {
    force: boolean;
    mockAgent: boolean;
    logger: Logger;
    root: string;
    simpleProgress: ReturnType<typeof createSimpleProgress> | null;
    parallel: number;
  },
  result: OrchestratorResult
): Promise<void> {
  const { force, mockAgent, logger, root, simpleProgress, parallel } = context;

  // Create a queue of items to process
  const queue = [...items];

  // Process items with concurrency control
  const processNextItem = async (): Promise<void> => {
    if (queue.length === 0) return;

    const item = queue.shift();
    if (!item) return;

    simpleProgress?.update(item.id, "starting");

    try {
      await runCommand(
        item.id,
        {
          force,
          dryRun: false,
          mockAgent,
          cwd: root,
        },
        logger
      );
      result.completed.push(item.id);
      simpleProgress?.complete(item.id);
      logger.info(`✓ Completed ${item.id}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.failed.push(item.id);

      // Persist error to item.json
      try {
        const itemDir = getItemDir(root, item.id);
        const currentItem = await readItem(itemDir);
        await writeItem(itemDir, { ...currentItem, last_error: errorMessage });
      } catch {
        // Best effort - don't fail if we can't persist the error
      }

      simpleProgress?.fail(item.id, errorMessage);
      logger.error(`✗ Failed ${item.id}: ${errorMessage}`);
    }
  };

  // Worker function that keeps processing until queue is empty
  const worker = async (): Promise<void> => {
    while (queue.length > 0) {
      await processNextItem();
    }
  };

  // Create workers
  const workers: Promise<void>[] = [];
  for (let i = 0; i < parallel; i++) {
    workers.push(worker());
  }

  // Wait for all workers to complete
  await Promise.all(workers);
}

export async function orchestrateNext(
  options: OrchestratorOptions,
  logger: Logger
): Promise<{ itemId: string | null; success: boolean }> {
  const { force = false, dryRun = false, cwd, mockAgent = false } = options;

  const root = findRootFromOptions(options);
  const config = await loadConfig(root);

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

    // Persist error to item.json
    try {
      const itemDir = getItemDir(root, nextItemId);
      const currentItem = await readItem(itemDir);
      await writeItem(itemDir, { ...currentItem, last_error: errorMessage });
    } catch {
      // Best effort - don't fail if we can't persist the error
    }

    return { itemId: nextItemId, success: false };
  }
}

export async function getNextIncompleteItem(root: string): Promise<string | null> {
  const items = await scanItems(root);

  const nextItem = items.find((item) => item.state !== "done");
  return nextItem?.id ?? null;
}
