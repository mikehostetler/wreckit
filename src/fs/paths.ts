import * as fs from "node:fs";
import * as path from "node:path";
import { RepoNotFoundError } from "../errors";

export function findRepoRoot(startCwd: string): string {
  let current = path.resolve(startCwd);

  while (current !== path.dirname(current)) {
    const gitDir = path.join(current, ".git");
    const wreckitDir = path.join(current, ".wreckit");

    const hasGit = fs.existsSync(gitDir);
    const hasWreckit = fs.existsSync(wreckitDir);

    if (hasGit && hasWreckit) {
      return current;
    }

    if (hasWreckit && !hasGit) {
      throw new RepoNotFoundError(
        `Found .wreckit at ${current} but no .git directory`
      );
    }

    current = path.dirname(current);
  }

  throw new RepoNotFoundError(
    "Could not find repository root with .git and .wreckit directories"
  );
}

export function resolveCwd(cwdOption?: string): string {
  if (cwdOption) {
    return path.resolve(cwdOption);
  }
  return process.cwd();
}

export function findRootFromOptions(options: { cwd?: string }): string {
  return findRepoRoot(resolveCwd(options.cwd));
}

export function getWreckitDir(root: string): string {
  return path.join(root, ".wreckit");
}

export function getConfigPath(root: string): string {
  return path.join(getWreckitDir(root), "config.json");
}

export function getIndexPath(root: string): string {
  return path.join(getWreckitDir(root), "index.json");
}

export function getPromptsDir(root: string): string {
  return path.join(getWreckitDir(root), "prompts");
}

export function getSectionDir(root: string, section: string): string {
  return path.join(getWreckitDir(root), section);
}

export function getItemDir(root: string, id: string): string {
  const [section, slug] = id.split("/");
  return path.join(getWreckitDir(root), section, slug);
}

export function getItemJsonPath(root: string, id: string): string {
  return path.join(getItemDir(root, id), "item.json");
}

export function getPrdPath(root: string, id: string): string {
  return path.join(getItemDir(root, id), "prd.json");
}

export function getResearchPath(root: string, id: string): string {
  return path.join(getItemDir(root, id), "research.md");
}

export function getPlanPath(root: string, id: string): string {
  return path.join(getItemDir(root, id), "plan.md");
}

export function getProgressLogPath(root: string, id: string): string {
  return path.join(getItemDir(root, id), "progress.log");
}

export function getPromptPath(root: string, id: string): string {
  return path.join(getItemDir(root, id), "prompt.md");
}
