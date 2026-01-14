import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import * as path from "node:path";
import {
  intro,
  outro,
  confirm,
  text,
  isCancel,
  cancel,
  note,
} from "@clack/prompts";
import type { Logger } from "./logging";
import { dirExists } from "./fs/util";
import { initCommand, NotGitRepoError } from "./commands/init";
import { ideasCommand } from "./commands/ideas";
import { scanItems } from "./domain/indexing";

export interface OnboardingResult {
  proceed: boolean;
  reason?: "user-aborted" | "not-git-repo" | "noninteractive";
}

export interface OnboardingOptions {
  cwd?: string;
  interactive?: boolean;
  noTui?: boolean;
}

function findGitRoot(startCwd: string): string | null {
  let current = path.resolve(startCwd);

  while (current !== path.dirname(current)) {
    const gitDir = path.join(current, ".git");
    try {
      const stat = fsSync.statSync(gitDir);
      if (stat.isDirectory()) {
        return current;
      }
    } catch {
      // Continue searching
    }
    current = path.dirname(current);
  }

  return null;
}

async function promptInit(wreckitDir: string): Promise<boolean> {
  intro("Welcome to wreckit");

  note(
    `This will create a .wreckit/ folder to track your ideas and their progress.\n\nLocation: ${wreckitDir}`,
    "First-time setup"
  );

  const ok = await confirm({
    message: "Initialize wreckit in this repository?",
    initialValue: true,
  });

  if (isCancel(ok) || ok === false) {
    cancel("Setup cancelled. Run `wreckit init` when you're ready.");
    return false;
  }

  return true;
}

async function promptFirstIdea(
  logger: Logger,
  root: string
): Promise<boolean> {
  note(
    "You don't have any ideas yet. Let's add your first one.",
    "Getting started"
  );

  const title = await text({
    message: "Give your idea a short title",
    placeholder: "e.g., Add dark mode support",
    validate: (v) => (!v?.trim() ? "Title is required" : undefined),
  });

  if (isCancel(title)) {
    cancel("No idea created. Add one later with `wreckit ideas`.");
    return false;
  }

  const description = await text({
    message: "Optional: describe what you want to accomplish",
    placeholder: "Press Enter to skip",
  });

  if (isCancel(description)) {
    cancel("No idea created. Add one later with `wreckit ideas`.");
    return false;
  }

  const titleStr = String(title).trim();
  const descStr = description ? String(description).trim() : "";

  const ideaText = descStr
    ? `# ${titleStr}\n\n${descStr}\n`
    : `# ${titleStr}\n`;

  await ideasCommand({ dryRun: false }, logger, root, ideaText);

  outro("First idea added! Now running wreckit…");
  return true;
}

export async function runOnboardingIfNeeded(
  logger: Logger,
  options: OnboardingOptions = {}
): Promise<OnboardingResult> {
  const {
    cwd = process.cwd(),
    interactive = process.stdout.isTTY ?? false,
    noTui = false,
  } = options;

  const gitRoot = findGitRoot(cwd);

  if (!gitRoot) {
    if (interactive && !noTui) {
      cancel("Not a git repository. Run `git init` first.");
    } else {
      logger.error("Not a git repository.");
      logger.info("Run `git init` first, then run wreckit.");
    }
    return { proceed: false, reason: "not-git-repo" };
  }

  const wreckitDir = path.join(gitRoot, ".wreckit");
  const wreckitExists = await dirExists(wreckitDir);

  if (!wreckitExists) {
    if (!interactive || noTui) {
      logger.error("wreckit is not initialized in this repo.");
      logger.info("");
      logger.info("Run:");
      logger.info("  wreckit init");
      logger.info("");
      logger.info("Then add ideas with:");
      logger.info("  wreckit ideas < ideas.md");
      return { proceed: false, reason: "noninteractive" };
    }

    const shouldInit = await promptInit(wreckitDir);
    if (!shouldInit) {
      return { proceed: false, reason: "user-aborted" };
    }

    try {
      await initCommand({ force: false }, logger, gitRoot);
    } catch (err) {
      if (err instanceof NotGitRepoError) {
        cancel("Not a git repository. Run `git init` first.");
        return { proceed: false, reason: "not-git-repo" };
      }
      throw err;
    }
  }

  const items = await scanItems(gitRoot);
  const hasIdeas = items.length > 0;

  if (!hasIdeas) {
    if (!interactive || noTui) {
      logger.info("No ideas found in .wreckit/");
      logger.info("");
      logger.info("Add an idea with:");
      logger.info("  wreckit ideas");
      logger.info("");
      logger.info("Then paste your ideas and press Ctrl+D when done.");
      return { proceed: false, reason: "noninteractive" };
    }

    const createdIdea = await promptFirstIdea(logger, gitRoot);
    if (!createdIdea) {
      return { proceed: false, reason: "user-aborted" };
    }
  }

  return { proceed: true };
}
