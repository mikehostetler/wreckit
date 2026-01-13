import * as fs from "node:fs/promises";
import * as readline from "node:readline";
import type { Logger } from "../logging";
import { findRepoRoot } from "../fs/paths";
import { ingestIdeas, parseIdeasFromText, determineSection, generateSlug } from "../domain/ideas";
import { FileNotFoundError } from "../errors";

export interface IdeasOptions {
  file?: string;
  dryRun?: boolean;
  cwd?: string;
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

export async function ideasCommand(
  options: IdeasOptions,
  logger: Logger,
  inputOverride?: string
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const root = findRepoRoot(cwd);

  let input: string;
  if (inputOverride !== undefined) {
    input = inputOverride;
  } else if (options.file) {
    input = await readFile(options.file);
  } else {
    input = await readStdin();
  }

  if (options.dryRun) {
    const ideas = parseIdeasFromText(input);
    if (ideas.length === 0) {
      logger.info("No items would be created");
      return;
    }

    logger.info(`Would create ${ideas.length} items:`);
    for (const idea of ideas) {
      const section = determineSection(idea);
      const slug = generateSlug(idea.title);
      if (slug) {
        logger.info(`  ${section}/XXX-${slug}`);
      }
    }
    return;
  }

  const result = await ingestIdeas(root, input);

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
