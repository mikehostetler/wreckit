import * as fs from "node:fs/promises";
import * as readline from "node:readline";
import type { Logger } from "../logging";
import { findRootFromOptions } from "../fs/paths";
import { persistItems, generateSlug } from "../domain/ideas";
import { parseIdeasWithAgent } from "../domain/ideas-agent";
import { runIdeaInterview, runSimpleInterview } from "../domain/ideas-interview";
import { FileNotFoundError } from "../errors";
import { hasUncommittedChanges, isGitRepo } from "../git";

export interface IdeasOptions {
  file?: string;
  dryRun?: boolean;
  cwd?: string;
  verbose?: boolean;
}

export async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    const rl = readline.createInterface({
      input: process.stdin,
      crlfDelay: Infinity,
    });

    rl.on("line", (line) => {
      chunks.push(line);
    });

    rl.on("close", () => {
      resolve(chunks.join("\n"));
    });

    rl.on("error", (err) => {
      reject(err);
    });
  });
}

export async function readFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new FileNotFoundError(`File not found: ${filePath}`);
    }
    throw err;
  }
}

/**
 * Check if stdin has data available (piped input).
 */
function hasStdinInput(): boolean {
  return !process.stdin.isTTY;
}

/**
 * Check for uncommitted git changes and warn user if found.
 * Non-blocking - allows execution to continue.
 */
async function warnIfUncommittedChanges(
  root: string,
  logger: Logger,
  dryRun?: boolean
): Promise<void> {
  // Skip check in dryRun mode or if not in a git repo
  if (dryRun) {
    return;
  }

  const inGitRepo = await isGitRepo(root);
  if (!inGitRepo) {
    return;
  }

  const hasChanges = await hasUncommittedChanges({ cwd: root, logger });
  if (hasChanges) {
    logger.warn(
      "⚠️  You have uncommitted changes. " +
        "The idea phase is for planning and exploration only. " +
        "The agent is configured to read-only and cannot make code changes, " +
        "but you may want to commit your work first."
    );
  }
}

export async function ideasCommand(
  options: IdeasOptions,
  logger: Logger,
  inputOverride?: string
): Promise<void> {
  const root = findRootFromOptions(options);

  // Warn if user has uncommitted changes before ideation
  await warnIfUncommittedChanges(root, logger, options.dryRun);

  let ideas: Awaited<ReturnType<typeof parseIdeasWithAgent>> = [];
  
  // Determine input mode
  if (inputOverride !== undefined) {
    // Direct input override (for testing)
    logger.info("Parsing ideas with agent...");
    ideas = await parseIdeasWithAgent(inputOverride, root, {
      verbose: options.verbose,
      logger
    });
  } else if (options.file) {
    // File input
    const input = await readFile(options.file);
    logger.info("Parsing ideas with agent...");
    ideas = await parseIdeasWithAgent(input, root, {
      verbose: options.verbose,
      logger
    });
  } else if (hasStdinInput()) {
    // Piped stdin input
    const input = await readStdin();
    if (!input.trim()) {
      logger.info("No input provided");
      return;
    }
    logger.info("Parsing ideas with agent...");
    ideas = await parseIdeasWithAgent(input, root, {
      verbose: options.verbose,
      logger
    });
  } else {
    // No input and TTY - start interview mode
    try {
      ideas = await runIdeaInterview(root, {
        verbose: options.verbose,
        logger
      });
    } catch (error) {
      // Fall back to simple interview if SDK fails
      if (options.verbose) {
        logger.warn(`SDK interview failed: ${error}`);
        logger.info("Falling back to simple interview mode...");
      }
      ideas = await runSimpleInterview();
    }
  }

  // Handle dry run
  if (options.dryRun) {
    if (ideas.length === 0) {
      logger.info("No items would be created");
      return;
    }

    logger.info(`Would create ${ideas.length} items:`);
    for (const idea of ideas) {
      const slug = generateSlug(idea.title);
      if (slug) {
        logger.info(`  XXX-${slug}`);
      }
    }
    return;
  }

  // Persist the ideas
  if (ideas.length === 0) {
    logger.info("No items created");
    return;
  }

  const result = await persistItems(root, ideas);

  if (result.created.length === 0 && result.skipped.length === 0) {
    logger.info("No items created");
    return;
  }

  if (result.created.length > 0) {
    logger.info(`Created ${result.created.length} items:`);
    for (const item of result.created) {
      logger.info(`  ${item.id}`);
    }
  }

  if (result.skipped.length > 0) {
    logger.info(`Skipped ${result.skipped.length} existing items:`);
    for (const id of result.skipped) {
      logger.info(`  ${id}`);
    }
  }
}
