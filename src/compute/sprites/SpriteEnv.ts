import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface SpriteEnvResolved {
  SPRITE_TOKEN: string;
  GITHUB_TOKEN: string;
  [key: string]: string | undefined;
}

export interface SpriteEnvValidationResult {
  valid: boolean;
  missing: string[];
}

const REQUIRED_TOKENS = ["SPRITE_TOKEN", "GITHUB_TOKEN"] as const;

export function parseSpriteEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key) {
      result[key] = value;
    }
  }

  return result;
}

async function loadSpriteEnvFile(root: string): Promise<Record<string, string>> {
  const envPath = path.join(root, ".wreckit", ".sprite.env");
  try {
    const content = await fs.readFile(envPath, "utf-8");
    return parseSpriteEnvFile(content);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw err;
  }
}

async function loadConfigLocalEnv(root: string): Promise<Record<string, string>> {
  const configPath = path.join(root, ".wreckit", "config.local.json");
  try {
    const content = await fs.readFile(configPath, "utf-8");
    const data = JSON.parse(content);
    if (data?.agent?.env && typeof data.agent.env === "object") {
      const result: Record<string, string> = {};
      for (const [key, value] of Object.entries(data.agent.env)) {
        if (typeof value === "string") {
          result[key] = value;
        }
      }
      return result;
    }
    return {};
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw err;
  }
}

export async function loadSpriteEnv(root: string): Promise<SpriteEnvResolved> {
  const [spriteEnv, configLocalEnv] = await Promise.all([
    loadSpriteEnvFile(root),
    loadConfigLocalEnv(root),
  ]);

  const merged: Record<string, string | undefined> = {};

  for (const [key, value] of Object.entries(configLocalEnv)) {
    merged[key] = value;
  }

  for (const key of Object.keys(process.env)) {
    const value = process.env[key];
    if (value !== undefined) {
      merged[key] = value;
    }
  }

  for (const [key, value] of Object.entries(spriteEnv)) {
    merged[key] = value;
  }

  return merged as SpriteEnvResolved;
}

export function validateSpriteEnv(env: SpriteEnvResolved): SpriteEnvValidationResult {
  const missing: string[] = [];

  for (const token of REQUIRED_TOKENS) {
    if (!env[token]) {
      missing.push(token);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}
