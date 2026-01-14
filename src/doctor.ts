import * as fs from "node:fs/promises";
import * as path from "node:path";
import { z } from "zod";
import type { Logger } from "./logging";
import {
  ConfigSchema,
  ItemSchema,
  PrdSchema,
  IndexSchema,
  type Item,
  type Index,
} from "./schemas";
import {
  getWreckitDir,
  getConfigPath,
  getIndexPath,
  getPromptsDir,
} from "./fs/paths";
import { pathExists } from "./fs/util";
import { scanItems } from "./commands/status";
import { initPromptTemplates } from "./prompts";

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
  sectionDir: string,
  itemDirName: string
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  const itemDir = path.join(sectionDir, itemDirName);
  const itemJsonPath = path.join(itemDir, "item.json");

  if (!(await pathExists(itemJsonPath))) {
    const section = path.basename(sectionDir);
    diagnostics.push({
      itemId: `${section}/${itemDirName}`,
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

  const hasResearch = await pathExists(researchPath);
  const hasPlan = await pathExists(planPath);
  const hasPrd = await pathExists(prdPath);

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

export async function diagnose(root: string): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  const wreckitDir = getWreckitDir(root);

  if (!(await pathExists(wreckitDir))) {
    return diagnostics;
  }

  diagnostics.push(...(await diagnoseConfig(root)));
  diagnostics.push(...(await diagnosePrompts(root)));

  let sections: string[];
  try {
    const entries = await fs.readdir(wreckitDir, { withFileTypes: true });
    sections = entries
      .filter(
        (e) =>
          e.isDirectory() && !e.name.startsWith(".") && e.name !== "prompts"
      )
      .map((e) => e.name);
  } catch {
    return diagnostics;
  }

  for (const section of sections) {
    const sectionDir = path.join(wreckitDir, section);
    let itemDirs: string[];
    try {
      const entries = await fs.readdir(sectionDir, { withFileTypes: true });
      itemDirs = entries
        .filter((e) => e.isDirectory() && /^\d{3}-/.test(e.name))
        .map((e) => e.name);
    } catch {
      continue;
    }

    for (const itemDir of itemDirs) {
      diagnostics.push(...(await diagnoseItem(root, sectionDir, itemDir)));
    }
  }

  diagnostics.push(...(await diagnoseIndex(root)));

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
          const indexPath = getIndexPath(root);
          await fs.writeFile(indexPath, JSON.stringify(index, null, 2) + "\n");
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
            const [section, slug] = diagnostic.itemId.split("/");
            const itemDir = path.join(getWreckitDir(root), section, slug);
            const itemJsonPath = path.join(itemDir, "item.json");
            const data = await readJson(itemJsonPath);
            const item = ItemSchema.parse(data);

            const hasResearch = await pathExists(
              path.join(itemDir, "research.md")
            );
            const hasPlan = await pathExists(path.join(itemDir, "plan.md"));
            const hasPrd = await pathExists(path.join(itemDir, "prd.json"));

            let newState = item.state;
            if (item.state === "researched" && !hasResearch) {
              newState = "raw";
            } else if (
              item.state === "planned" &&
              (!hasPlan || !hasPrd) &&
              hasResearch
            ) {
              newState = "researched";
            } else if (item.state === "planned" && !hasPlan && !hasPrd) {
              newState = hasResearch ? "researched" : "raw";
            }

            if (newState !== item.state) {
              const updatedItem = {
                ...item,
                state: newState,
                updated_at: new Date().toISOString(),
              };
              await fs.writeFile(
                itemJsonPath,
                JSON.stringify(updatedItem, null, 2) + "\n"
              );
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
