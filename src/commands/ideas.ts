import * as fs from "node:fs/promises";
import * as readline from "node:readline";
import { text, isCancel } from "@clack/prompts";
import type { Logger } from "../logging";
import { findRepoRoot, findRootFromOptions } from "../fs/paths";
import { ingestIdeas, parseIdeasFromText, determineSection, generateSlug } from "../domain/ideas";
import { FileNotFoundError } from "../errors";

export interface IdeasOptions {
  file?: string;
  interactive?: boolean;
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
  const root = findRootFromOptions(options);

  let input: string;
  if (inputOverride !== undefined) {
    input = inputOverride;
  } else if (options.file) {
    input = await readFile(options.file);
  } else if (options.interactive) {
    // Prompt for idea interactively
    const title = await text({
      message: "Give your idea a short title",
      placeholder: "e.g., Add dark mode support",
      validate: (v) => (!v?.trim() ? "Title is required" : undefined),
    });

    if (isCancel(title)) {
      logger.info("Cancelled.");
      return;
    }

    const description = await text({
      message: "Optional: describe what you want to accomplish",
      placeholder: "Press Enter to skip",
    });

    if (isCancel(description)) {
      logger.info("Cancelled.");
      return;
    }

    const titleStr = String(title).trim();
    const descStr = description ? String(description).trim() : "";

    input = descStr ? `# ${titleStr}\n\n${descStr}\n` : `# ${titleStr}\n`;
  } else {
    input = await readStdin();
  }

  if (options.dryRun) {
    const ideas = parseIdeasFromText(input);
    if (ideas.length === 0) {
      console.log("No items would be created");
      return;
    }

    console.log(`Would create ${ideas.length} items:`);
    for (const idea of ideas) {
      const section = determineSection(idea);
      const slug = generateSlug(idea.title);
      if (slug) {
        console.log(`  ${section}/XXX-${slug}`);
      }
    }
    return;
  }

  const result = await ingestIdeas(root, input);

  if (result.created.length === 0 && result.skipped.length === 0) {
    console.log("No items created");
    return;
  }

  if (result.created.length > 0) {
    console.log(`Created ${result.created.length} items:`);
    for (const item of result.created) {
      console.log(`  ${item.id}`);
    }
  }

  if (result.skipped.length > 0) {
    console.log(`Skipped ${result.skipped.length} existing items:`);
    for (const id of result.skipped) {
      console.log(`  ${id}`);
    }
  }
}
