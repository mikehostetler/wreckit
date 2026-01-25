import * as fs from "node:fs/promises";
import * as path from "node:path";
import { z } from "zod";
import type { Logger } from "./logging";
import {
  ConfigSchema,
  ItemSchema,
  PrdSchema,
  IndexSchema,
  BatchProgressSchema,
  type Item,
  type Index,
} from "./schemas";
import {
  getWreckitDir,
  getConfigPath,
  getIndexPath,
  getPromptsDir,
  getItemsDir,
  getBatchProgressPath,
} from "./fs/paths";
import { pathExists, checkPathAccess } from "./fs/util";
import { scanItems } from "./commands/status";
import { initPromptTemplates } from "./prompts";
import { writeItem, writeIndex, readItem, clearBatchProgress } from "./fs/json";
import { validateStoryQuality } from "./domain/validation";
import {
  FileNotFoundError,
  InvalidJsonError,
  SchemaValidationError,
} from "./errors";

/**
 * Detect circular dependencies using DFS.
 * Returns array of cycles found (each cycle is an array of item IDs).
 */
function detectCycles(items: Item[]): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const itemMap = new Map(items.map((i) => [i.id, i]));

  function dfs(itemId: string, path: string[]): void {
    if (recursionStack.has(itemId)) {
      const cycleStart = path.indexOf(itemId);
      if (cycleStart !== -1) {
        cycles.push(path.slice(cycleStart).concat(itemId));
      }
      return;
    }

    if (visited.has(itemId)) return;

    visited.add(itemId);
    recursionStack.add(itemId);
    path.push(itemId);

    const item = itemMap.get(itemId);
    if (item?.depends_on) {
      for (const depId of item.depends_on) {
        dfs(depId, [...path]);
      }
    }

    recursionStack.delete(itemId);
  }

  for (const item of items) {
    if (!visited.has(item.id)) {
      dfs(item.id, []);
    }
  }

  return cycles;
}

/**
 * Find dependencies that reference non-existent items.
 */
function findMissingDependencies(
  items: Item[]
): Array<{ itemId: string; missingDep: string }> {
  const missing: Array<{ itemId: string; missingDep: string }> = [];
  const itemIds = new Set(items.map((i) => i.id));

  for (const item of items) {
    if (item.depends_on) {
      for (const depId of item.depends_on) {
        if (!itemIds.has(depId)) {
          missing.push({ itemId: item.id, missingDep: depId });
        }
      }
    }
  }

  return missing;
}

async function diagnoseDependencies(root: string): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  const itemsDir = getItemsDir(root);

  let itemDirs: string[];
  try {
    const entries = await fs.readdir(itemsDir, { withFileTypes: true });
    itemDirs = entries
      .filter((e) => e.isDirectory() && /^\d{3}-/.test(e.name))
      .map((e) => e.name);
  } catch (err) {
    // ENOENT is expected (no items yet), other errors should report
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      diagnostics.push({
        itemId: null,
        severity: "warning",
        code: "ITEMS_DIR_UNREADABLE",
        message: `Cannot read items directory: ${err instanceof Error ? err.message : String(err)}`,
        fixable: false,
      });
    }
    return diagnostics;
  }

  const items: Item[] = [];
  for (const dir of itemDirs) {
    try {
      const item = await readItem(path.join(itemsDir, dir));
      items.push(item);
    } catch (err) {
      // Expected errors: skip silently (consistent with scanItems pattern)
      if (err instanceof FileNotFoundError) continue;
      if (err instanceof InvalidJsonError) continue;
      if (err instanceof SchemaValidationError) continue;
      // Unexpected errors: warn
      console.warn(
        `Warning: Cannot read item ${dir}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Check for circular dependencies
  const cycles = detectCycles(items);
  for (const cycle of cycles) {
    diagnostics.push({
      itemId: cycle[0],
      severity: "error",
      code: "CIRCULAR_DEPENDENCY",
      message: `Circular dependency detected: ${cycle.join(" -> ")}`,
      fixable: false,
    });
  }

  // Check for missing dependency references
  const missing = findMissingDependencies(items);
  for (const { itemId, missingDep } of missing) {
    diagnostics.push({
      itemId,
      severity: "warning",
      code: "MISSING_DEPENDENCY",
      message: `Depends on non-existent item: ${missingDep}`,
      fixable: false,
    });
  }

  return diagnostics;
}

export type DiagnosticSeverity = "error" | "warning" | "info";

export interface Diagnostic {
  itemId: string | null;
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  fixable: boolean;
}

export interface FixResult {
  diagnostic: Diagnostic;
  fixed: boolean;
  message: string;
}

export interface DoctorResult {
  diagnostics: Diagnostic[];
  fixes?: FixResult[];
}

async function readJson(filePath: string): Promise<unknown> {
  const content = await fs.readFile(filePath, "utf-8");
  return JSON.parse(content);
}

async function diagnoseConfig(root: string): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  const configPath = getConfigPath(root);

  if (!(await pathExists(configPath))) {
    diagnostics.push({
      itemId: null,
      severity: "warning",
      code: "MISSING_CONFIG",
      message: "config.json is missing (using defaults)",
      fixable: false,
    });
    return diagnostics;
  }

  try {
    const data = await readJson(configPath);
    const result = ConfigSchema.safeParse(data);
    if (!result.success) {
      diagnostics.push({
        itemId: null,
        severity: "error",
        code: "INVALID_CONFIG",
        message: `config.json is invalid: ${result.error.message}`,
        fixable: false,
      });
    }
  } catch (err) {
    diagnostics.push({
      itemId: null,
      severity: "error",
      code: "INVALID_CONFIG",
      message: `config.json has invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
      fixable: false,
    });
  }

  return diagnostics;
}

async function diagnoseItem(
  root: string,
  itemsDir: string,
  itemDirName: string
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  const itemDir = path.join(itemsDir, itemDirName);
  const itemJsonPath = path.join(itemDir, "item.json");

  if (!(await pathExists(itemJsonPath))) {
    diagnostics.push({
      itemId: itemDirName,
      severity: "error",
      code: "MISSING_ITEM_JSON",
      message: `item.json missing in ${itemDir}`,
      fixable: false,
    });
    return diagnostics;
  }

  let item: Item;
  try {
    const data = await readJson(itemJsonPath);
    const result = ItemSchema.safeParse(data);
    if (!result.success) {
      diagnostics.push({
        itemId: null,
        severity: "error",
        code: "INVALID_ITEM_JSON",
        message: `item.json invalid in ${itemDir}: ${result.error.message}`,
        fixable: false,
      });
      return diagnostics;
    }
    item = result.data;
  } catch (err) {
    diagnostics.push({
      itemId: null,
      severity: "error",
      code: "INVALID_ITEM_JSON",
      message: `item.json has invalid JSON in ${itemDir}: ${err instanceof Error ? err.message : String(err)}`,
      fixable: false,
    });
    return diagnostics;
  }

  const itemId = item.id;
  const researchPath = path.join(itemDir, "research.md");
  const planPath = path.join(itemDir, "plan.md");
  const prdPath = path.join(itemDir, "prd.json");

  // Check artifact accessibility with proper error handling (Spec 010 Gap 4)
  const researchCheck = await checkPathAccess(researchPath);
  const planCheck = await checkPathAccess(planPath);
  const prdCheck = await checkPathAccess(prdPath);

  // Report unreadable artifacts as ARTIFACT_UNREADABLE diagnostics
  if (researchCheck.error) {
    diagnostics.push({
      itemId,
      severity: "error",
      code: "ARTIFACT_UNREADABLE",
      message: `Cannot read research.md: ${researchCheck.error.cause.message}`,
      fixable: false,
    });
  }
  if (planCheck.error) {
    diagnostics.push({
      itemId,
      severity: "error",
      code: "ARTIFACT_UNREADABLE",
      message: `Cannot read plan.md: ${planCheck.error.cause.message}`,
      fixable: false,
    });
  }
  if (prdCheck.error) {
    diagnostics.push({
      itemId,
      severity: "error",
      code: "ARTIFACT_UNREADABLE",
      message: `Cannot read prd.json: ${prdCheck.error.cause.message}`,
      fixable: false,
    });
  }

  // Use exists flag - false if error or not found
  const hasResearch = researchCheck.exists && !researchCheck.error;
  const hasPlan = planCheck.exists && !planCheck.error;
  const hasPrd = prdCheck.exists && !prdCheck.error;

  if (item.state === "researched" && !hasResearch) {
    diagnostics.push({
      itemId,
      severity: "warning",
      code: "STATE_FILE_MISMATCH",
      message: `State is 'researched' but research.md is missing`,
      fixable: true,
    });
  }

  if (item.state === "planned") {
    if (!hasPlan && !hasPrd) {
      diagnostics.push({
        itemId,
        severity: "warning",
        code: "STATE_FILE_MISMATCH",
        message: `State is 'planned' but plan.md and prd.json are missing`,
        fixable: true,
      });
    } else if (!hasPlan) {
      diagnostics.push({
        itemId,
        severity: "warning",
        code: "STATE_FILE_MISMATCH",
        message: `State is 'planned' but plan.md is missing`,
        fixable: false,
      });
    } else if (!hasPrd) {
      diagnostics.push({
        itemId,
        severity: "warning",
        code: "STATE_FILE_MISMATCH",
        message: `State is 'planned' but prd.json is missing`,
        fixable: false,
      });
    }
  }

  if (hasPrd) {
    try {
      const prdData = await readJson(prdPath);
      const prdResult = PrdSchema.safeParse(prdData);
      if (!prdResult.success) {
        diagnostics.push({
          itemId,
          severity: "error",
          code: "INVALID_PRD",
          message: `prd.json is invalid: ${prdResult.error.message}`,
          fixable: false,
        });
      } else {
        // Deep PRD validation (Spec 010 Gap 1: Deep PRD Validation)
        const storyQuality = validateStoryQuality(prdResult.data);
        if (!storyQuality.valid) {
          diagnostics.push({
            itemId,
            severity: "warning",
            code: "POOR_STORY_QUALITY",
            message: `prd.json story quality issues: ${storyQuality.errors.join("; ")}`,
            fixable: false,
          });
        }

        if (item.state === "implementing") {
          const pendingStories = prdResult.data.user_stories.filter(
            (s) => s.status === "pending"
          );
          if (pendingStories.length === 0) {
            diagnostics.push({
              itemId,
              severity: "warning",
              code: "STATE_FILE_MISMATCH",
              message: `State is 'implementing' but no pending stories in prd.json`,
              fixable: false,
            });
          }
        }
      }
    } catch (err) {
      diagnostics.push({
        itemId,
        severity: "error",
        code: "INVALID_PRD",
        message: `prd.json has invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
        fixable: false,
      });
    }
  }

  if (item.state === "in_pr" && !item.pr_url) {
    diagnostics.push({
      itemId,
      severity: "warning",
      code: "STATE_FILE_MISMATCH",
      message: `State is 'in_pr' but pr_url is not set`,
      fixable: false,
    });
  }

  if (item.state === "in_pr" && !item.branch) {
    diagnostics.push({
      itemId,
      severity: "warning",
      code: "STATE_FILE_MISMATCH",
      message: `State is 'in_pr' but branch is not set`,
      fixable: false,
    });
  }

  return diagnostics;
}

async function diagnoseIndex(root: string): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  const indexPath = getIndexPath(root);

  if (!(await pathExists(indexPath))) {
    return diagnostics;
  }

  try {
    const data = await readJson(indexPath);
    const result = IndexSchema.safeParse(data);
    if (!result.success) {
      diagnostics.push({
        itemId: null,
        severity: "warning",
        code: "INDEX_STALE",
        message: `index.json is invalid: ${result.error.message}`,
        fixable: true,
      });
      return diagnostics;
    }

    const indexedItems = result.data.items;
    const actualItems = await scanItems(root);

    const indexedIds = new Set(indexedItems.map((i) => i.id));
    const actualIds = new Set(actualItems.map((i) => i.id));

    const missingInIndex = actualItems.filter((i) => !indexedIds.has(i.id));
    const extraInIndex = indexedItems.filter((i) => !actualIds.has(i.id));
    const stateMismatches = actualItems.filter((actual) => {
      const indexed = indexedItems.find((i) => i.id === actual.id);
      return indexed && indexed.state !== actual.state;
    });

    if (
      missingInIndex.length > 0 ||
      extraInIndex.length > 0 ||
      stateMismatches.length > 0
    ) {
      const issues: string[] = [];
      if (missingInIndex.length > 0) {
        issues.push(`${missingInIndex.length} items missing from index`);
      }
      if (extraInIndex.length > 0) {
        issues.push(`${extraInIndex.length} extra items in index`);
      }
      if (stateMismatches.length > 0) {
        issues.push(`${stateMismatches.length} state mismatches`);
      }
      diagnostics.push({
        itemId: null,
        severity: "warning",
        code: "INDEX_STALE",
        message: `index.json is out of sync: ${issues.join(", ")}`,
        fixable: true,
      });
    }
  } catch (err) {
    diagnostics.push({
      itemId: null,
      severity: "warning",
      code: "INDEX_STALE",
      message: `index.json has invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
      fixable: true,
    });
  }

  return diagnostics;
}

async function diagnosePrompts(root: string): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  const promptsDir = getPromptsDir(root);

  if (!(await pathExists(promptsDir))) {
    diagnostics.push({
      itemId: null,
      severity: "info",
      code: "MISSING_PROMPTS",
      message: "prompts directory is missing (defaults will be used)",
      fixable: true,
    });
  }

  return diagnostics;
}

async function diagnoseBatchProgress(root: string): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  const progressPath = getBatchProgressPath(root);

  if (!(await pathExists(progressPath))) {
    return diagnostics;
  }

  try {
    const content = await fs.readFile(progressPath, "utf-8");
    let data: unknown;
    try {
      data = JSON.parse(content);
    } catch {
      diagnostics.push({
        itemId: null,
        severity: "warning",
        code: "BATCH_PROGRESS_CORRUPT",
        message: "batch-progress.json has invalid JSON",
        fixable: true,
      });
      return diagnostics;
    }

    const result = BatchProgressSchema.safeParse(data);
    if (!result.success) {
      diagnostics.push({
        itemId: null,
        severity: "warning",
        code: "BATCH_PROGRESS_CORRUPT",
        message: `batch-progress.json is invalid: ${result.error.message}`,
        fixable: true,
      });
      return diagnostics;
    }

    const progress = result.data;
    const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;
    const updatedAt = new Date(progress.updated_at).getTime();
    const isStale = Date.now() - updatedAt > STALE_THRESHOLD_MS;

    let pidRunning = false;
    try {
      process.kill(progress.pid, 0);
      pidRunning = true;
    } catch {
      // PID not running
    }

    if (isStale || !pidRunning) {
      const reason = isStale
        ? "older than 24 hours"
        : "owning process not running";
      diagnostics.push({
        itemId: null,
        severity: "warning",
        code: "STALE_BATCH_PROGRESS",
        message: `batch-progress.json is stale (${reason})`,
        fixable: true,
      });
    }
  } catch (err) {
    diagnostics.push({
      itemId: null,
      severity: "error",
      code: "BATCH_PROGRESS_CORRUPT",
      message: `Failed to read batch-progress.json: ${err instanceof Error ? err.message : String(err)}`,
      fixable: true,
    });
  }

  return diagnostics;
}

export async function diagnose(root: string): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  const wreckitDir = getWreckitDir(root);

  if (!(await pathExists(wreckitDir))) {
    return diagnostics;
  }

  diagnostics.push(...(await diagnoseConfig(root)));
  diagnostics.push(...(await diagnosePrompts(root)));

  const itemsDir = getItemsDir(root);
  let itemDirs: string[];
  try {
    const entries = await fs.readdir(itemsDir, { withFileTypes: true });
    itemDirs = entries
      .filter((e) => e.isDirectory() && /^\d{3}-/.test(e.name))
      .map((e) => e.name);
  } catch (err) {
    // ENOENT is expected (no items yet), other errors should report
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      diagnostics.push({
        itemId: null,
        severity: "warning",
        code: "ITEMS_DIR_UNREADABLE",
        message: `Cannot read items directory: ${err instanceof Error ? err.message : String(err)}`,
        fixable: false,
      });
    }
    diagnostics.push(...(await diagnoseIndex(root)));
    diagnostics.push(...(await diagnoseBatchProgress(root)));
    return diagnostics;
  }

  for (const itemDir of itemDirs) {
    diagnostics.push(...(await diagnoseItem(root, itemsDir, itemDir)));
  }

  diagnostics.push(...(await diagnoseDependencies(root)));
  diagnostics.push(...(await diagnoseIndex(root)));
  diagnostics.push(...(await diagnoseBatchProgress(root)));

  return diagnostics;
}

export async function applyFixes(
  root: string,
  diagnostics: Diagnostic[],
  logger: Logger
): Promise<FixResult[]> {
  const results: FixResult[] = [];
  const fixableDiagnostics = diagnostics.filter((d) => d.fixable);

  for (const diagnostic of fixableDiagnostics) {
    let fixed = false;
    let message = "";

    switch (diagnostic.code) {
      case "INDEX_STALE": {
        try {
          const items = await scanItems(root);
          const index: Index = {
            schema_version: 1,
            items,
            generated_at: new Date().toISOString(),
          };
          // Use writeIndex for proper locking
          await writeIndex(root, index);
          fixed = true;
          message = "Rebuilt index.json";
        } catch (err) {
          message = `Failed to rebuild index: ${err instanceof Error ? err.message : String(err)}`;
        }
        break;
      }

      case "MISSING_PROMPTS": {
        try {
          await initPromptTemplates(root);
          fixed = true;
          message = "Created default prompt templates";
        } catch (err) {
          message = `Failed to create prompts: ${err instanceof Error ? err.message : String(err)}`;
        }
        break;
      }

      case "STATE_FILE_MISMATCH": {
        if (diagnostic.itemId) {
          try {
            const itemDir = path.join(getItemsDir(root), diagnostic.itemId);
            const itemJsonPath = path.join(itemDir, "item.json");
            const data = await readJson(itemJsonPath);
            const item = ItemSchema.parse(data);

            // Use error-aware checks for artifact presence (Spec 010 Gap 4)
            const researchCheck = await checkPathAccess(
              path.join(itemDir, "research.md")
            );
            const planCheck = await checkPathAccess(path.join(itemDir, "plan.md"));
            const prdCheck = await checkPathAccess(path.join(itemDir, "prd.json"));

            // If any artifact is unreadable, skip the fix
            if (researchCheck.error || planCheck.error || prdCheck.error) {
              message = "Cannot fix: artifact files are unreadable (check permissions)";
              break;
            }

            const hasResearch = researchCheck.exists;
            const hasPlan = planCheck.exists;
            const hasPrd = prdCheck.exists;

            let newState = item.state;
            if (item.state === "researched" && !hasResearch) {
              newState = "idea";
            } else if (
              item.state === "planned" &&
              (!hasPlan || !hasPrd) &&
              hasResearch
            ) {
              newState = "researched";
            } else if (item.state === "planned" && !hasPlan && !hasPrd) {
              newState = hasResearch ? "researched" : "idea";
            }

            if (newState !== item.state) {
              const updatedItem = {
                ...item,
                state: newState,
                updated_at: new Date().toISOString(),
              };
              // Use writeItem for proper locking
              await writeItem(itemDir, updatedItem);
              fixed = true;
              message = `Reset state from '${item.state}' to '${newState}'`;
            } else {
              message = "Unable to determine correct state";
            }
          } catch (err) {
            message = `Failed to fix state: ${err instanceof Error ? err.message : String(err)}`;
          }
        }
        break;
      }

      case "STALE_BATCH_PROGRESS":
      case "BATCH_PROGRESS_CORRUPT": {
        try {
          await clearBatchProgress(root);
          fixed = true;
          message = "Removed stale/corrupt batch-progress.json";
        } catch (err) {
          message = `Failed to remove: ${err instanceof Error ? err.message : String(err)}`;
        }
        break;
      }

      default:
        message = "No fix available";
    }

    results.push({ diagnostic, fixed, message });
  }

  return results;
}

export async function runDoctor(
  root: string,
  options: { fix?: boolean },
  logger: Logger
): Promise<DoctorResult> {
  const diagnostics = await diagnose(root);

  if (!options.fix) {
    return { diagnostics };
  }

  const fixes = await applyFixes(root, diagnostics, logger);
  return { diagnostics, fixes };
}
