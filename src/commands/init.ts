import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Logger } from "../logging";
import { WreckitError } from "../errors";
import { DEFAULT_CONFIG } from "../config";
import { safeWriteJson } from "../fs/atomic";
import { getDefaultTemplate, type PromptName } from "../prompts";

export interface InitOptions {
  force?: boolean;
  cwd?: string;
}

export class NotGitRepoError extends WreckitError {
  constructor(message: string) {
    super(message, "NOT_GIT_REPO");
    this.name = "NotGitRepoError";
  }
}

export class WreckitExistsError extends WreckitError {
  constructor(message: string) {
    super(message, "WRECKIT_EXISTS");
    this.name = "WreckitExistsError";
  }
}

async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    const gitDir = path.join(cwd, ".git");
    const stat = await fs.stat(gitDir);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function wreckitExists(cwd: string): Promise<boolean> {
  try {
    const wreckitDir = path.join(cwd, ".wreckit");
    const stat = await fs.stat(wreckitDir);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

export async function initCommand(
  options: InitOptions,
  logger: Logger
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  if (!(await isGitRepo(cwd))) {
    throw new NotGitRepoError(
      "Not a git repository. Run 'git init' first or navigate to a git repository."
    );
  }

  if (await wreckitExists(cwd)) {
    if (!options.force) {
      throw new WreckitExistsError(
        ".wreckit/ already exists. Use --force to overwrite."
      );
    }
    logger.warn("Overwriting existing .wreckit/ directory");
    await fs.rm(path.join(cwd, ".wreckit"), { recursive: true, force: true });
  }

  const wreckitDir = path.join(cwd, ".wreckit");
  const promptsDir = path.join(wreckitDir, "prompts");

  await fs.mkdir(promptsDir, { recursive: true });

  const configPath = path.join(wreckitDir, "config.json");
  await safeWriteJson(configPath, DEFAULT_CONFIG);

  const promptNames: PromptName[] = ["research", "plan", "implement"];

  for (const name of promptNames) {
    const content = await getDefaultTemplate(name);
    const promptPath = path.join(promptsDir, `${name}.md`);
    await fs.writeFile(promptPath, content, "utf-8");
  }

  // Append config.local.json to .gitignore if not already present
  const gitignorePath = path.join(cwd, ".gitignore");
  const localConfigPattern = ".wreckit/config.local.json";
  try {
    let gitignoreContent = "";
    try {
      gitignoreContent = await fs.readFile(gitignorePath, "utf-8");
    } catch {
      // .gitignore doesn't exist yet
    }
    if (!gitignoreContent.includes(localConfigPattern)) {
      const addition = gitignoreContent.endsWith("\n") || gitignoreContent === ""
        ? `\n# Wreckit local config (may contain secrets)\n${localConfigPattern}\n`
        : `\n\n# Wreckit local config (may contain secrets)\n${localConfigPattern}\n`;
      await fs.appendFile(gitignorePath, addition);
      logger.info("Added .wreckit/config.local.json to .gitignore");
    }
  } catch (e) {
    logger.debug(`Could not update .gitignore: ${e}`);
  }

  logger.info("Initialized .wreckit/ directory");
  logger.info("  Created config.json");
  logger.info("  Created prompts/research.md");
  logger.info("  Created prompts/plan.md");
  logger.info("  Created prompts/implement.md");
  logger.info("");
  logger.info("Tip: Create .wreckit/config.local.json for project-specific env overrides (gitignored)");
}
