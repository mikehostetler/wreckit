/**
 * JIT Context Orchestration (Item 033)
 *
 * This module implements Just-In-Time context building based on skill requirements.
 * It collects files, git state, item metadata, and phase artifacts as needed.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { SkillContextRequirement } from "../schemas";
import type { Item } from "../schemas";
import type { ConfigResolved } from "../config";
import { getGitStatus, type GitFileChange } from "../git";

/**
 * Built context from skill requirements.
 * Maps requirement types to their collected content.
 */
export interface BuiltContext {
  /** Collected file contents by path */
  files: Record<string, string>;

  /** Git status summary */
  gitStatus?: string;

  /** Item metadata as JSON string */
  itemMetadata?: string;

  /** Phase artifact contents by artifact name */
  artifacts: Record<string, string>;

  /** Errors encountered during context collection */
  errors: string[];
}

/**
 * Build JIT context from skill requirements.
 *
 * This function collects context based on skill requirements:
 * - type="file": reads file at path
 * - type="git_status": runs git status
 * - type="item_metadata": serializes item metadata
 * - type="phase_artifact": loads specific phase artifact (research.md, plan.md, etc.)
 *
 * @param contextRequirements - Context requirements from loaded skills
 * @param item - Item metadata for serialization
 * @param config - Resolved config for paths
 * @param root - Repository root directory
 * @returns Built context with collected content
 */
export async function buildJitContext(
  contextRequirements: SkillContextRequirement[],
  item: Item,
  config: ConfigResolved,
  root: string
): Promise<BuiltContext> {
  const context: BuiltContext = {
    files: {},
    artifacts: {},
    errors: [],
  };

  if (contextRequirements.length === 0) {
    return context;
  }

  const itemDir = path.join(root, ".wreckit", "items", item.id);

  for (const req of contextRequirements) {
    if (!req) {
      continue;
    }

    try {
      switch (req.type) {
        case "file": {
          if (!req.path) {
            context.errors.push(`File requirement missing path`);
            continue;
          }
          const filePath = path.isAbsolute(req.path)
            ? req.path
            : path.join(root, req.path);
          const content = await fs.readFile(filePath, "utf-8");
          context.files[req.path] = content;
          break;
        }

        case "git_status": {
          const status: GitFileChange[] = await getGitStatus({ cwd: root, logger: console });
          context.gitStatus = formatGitStatus(status);
          break;
        }

        case "item_metadata": {
          const metadata = {
            id: item.id,
            title: item.title,
            section: item.section,
            state: item.state,
            overview: item.overview,
            branch: item.branch,
            pr_url: item.pr_url,
            created_at: item.created_at,
            updated_at: item.updated_at,
          };
          context.itemMetadata = JSON.stringify(metadata, null, 2);
          break;
        }

        case "phase_artifact": {
          if (!req.path) {
            context.errors.push(`Phase artifact requirement missing artifact name`);
            continue;
          }
          const artifactPath = path.join(itemDir, req.path);
          const content = await fs.readFile(artifactPath, "utf-8");
          context.artifacts[req.path] = content;
          break;
        }

        default:
          context.errors.push(`Unknown context requirement type: ${(req as any).type}`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      context.errors.push(`Failed to load context for ${req.type}${req.path ? ` (${req.path})` : ""}: ${errorMsg}`);
    }
  }

  return context;
}

/**
 * Format git status for context injection.
 */
function formatGitStatus(status: GitFileChange[]): string {
  if (status.length === 0) {
    return "No changes";
  }

  const lines = status.map((s) => {
    const statusChar = s.status === "A" ? "A" // Added
      : s.status === "D" ? "D" // Deleted
      : s.status === "M" ? "M" // Modified
      : s.status === "R" ? "R" // Renamed
      : "?"; // Untracked
    return `${statusChar} ${s.path}`;
  });

  return lines.join("\n");
}

/**
 * Format built context as markdown for prompt injection.
 * This creates a human-readable summary of collected context.
 */
export function formatContextForPrompt(context: BuiltContext): string {
  const sections: string[] = [];

  if (Object.keys(context.files).length > 0) {
    sections.push("## Files\n");
    for (const [filePath, content] of Object.entries(context.files)) {
      sections.push(`### ${filePath}\n`);
      sections.push(content.trim());
      sections.push("\n");
    }
  }

  if (context.gitStatus) {
    sections.push("## Git Status\n");
    sections.push(context.gitStatus);
    sections.push("\n");
  }

  if (context.itemMetadata) {
    sections.push("## Item Metadata\n");
    sections.push("```json");
    sections.push(context.itemMetadata);
    sections.push("```\n");
  }

  if (Object.keys(context.artifacts).length > 0) {
    sections.push("## Phase Artifacts\n");
    for (const [artifactName, content] of Object.entries(context.artifacts)) {
      sections.push(`### ${artifactName}\n`);
      sections.push(content.trim());
      sections.push("\n");
    }
  }

  if (context.errors.length > 0) {
    sections.push("## Context Loading Errors\n");
    sections.push("Some context could not be loaded:\n");
    for (const error of context.errors) {
      sections.push(`- ${error}\n`);
    }
  }

  return sections.join("\n");
}
