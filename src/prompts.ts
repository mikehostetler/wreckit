import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { getPromptsDir, getWreckitDir } from "./fs/paths";

export type PromptName = "research" | "plan" | "implement";

export interface PromptVariables {
  id: string;
  title: string;
  section: string;
  overview: string;
  item_path: string;
  branch_name: string;
  base_branch: string;
  completion_signal: string;
  sdk_mode?: boolean;
  research?: string;
  plan?: string;
  prd?: string;
  progress?: string;
}

function getPromptTemplatePath(root: string, name: PromptName): string {
  return path.join(getPromptsDir(root), `${name}.md`);
}

function getBundledPromptPath(name: PromptName): string {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  return path.join(__dirname, "prompts", `${name}.md`);
}

export async function getDefaultTemplate(name: PromptName): Promise<string> {
  const bundledPath = getBundledPromptPath(name);
  return fs.readFile(bundledPath, "utf-8");
}

export async function loadPromptTemplate(
  root: string,
  name: PromptName
): Promise<string> {
  const promptPath = getPromptTemplatePath(root, name);

  try {
    const content = await fs.readFile(promptPath, "utf-8");
    return content;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return getDefaultTemplate(name);
    }
    throw err;
  }
}

export function renderPrompt(
  template: string,
  variables: PromptVariables
): string {
  let result = template;

  // Handle simple {{#if}} conditionals
  result = result.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, varName, content) => {
    const value = (variables as any)[varName];
    return value ? content : "";
  });

  // Handle simple {{#ifnot}} conditionals (inverse)
  result = result.replace(/\{\{#ifnot (\w+)\}\}([\s\S]*?)\{\{\/ifnot\}\}/g, (_, varName, content) => {
    const value = (variables as any)[varName];
    return !value ? content : "";
  });

  const varMap: Record<string, string | undefined> = {
    id: variables.id,
    title: variables.title,
    section: variables.section,
    overview: variables.overview,
    item_path: variables.item_path,
    branch_name: variables.branch_name,
    base_branch: variables.base_branch,
    completion_signal: variables.completion_signal,
    sdk_mode: variables.sdk_mode ? "true" : "",
    research: variables.research,
    plan: variables.plan,
    prd: variables.prd,
    progress: variables.progress,
  };

  for (const [key, value] of Object.entries(varMap)) {
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    result = result.replace(pattern, value ?? "");
  }

  return result;
}

export async function initPromptTemplates(root: string): Promise<void> {
  const promptsDir = getPromptsDir(root);
  await fs.mkdir(promptsDir, { recursive: true });

  const promptNames: PromptName[] = ["research", "plan", "implement"];

  for (const name of promptNames) {
    const filePath = getPromptTemplatePath(root, name);
    try {
      await fs.access(filePath);
    } catch {
      const content = await getDefaultTemplate(name);
      await fs.writeFile(filePath, content, "utf-8");
    }
  }
}
