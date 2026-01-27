/**
 * Environment variable resolution for agent SDK calls.
 *
 * Precedence (highest → lowest):
 * 1. .wreckit/config.local.json agent.env (project-specific, gitignored)
 * 2. .wreckit/config.json agent.env (project defaults)
 * 3. process.env (shell environment)
 * 4. ~/.claude/settings.json env (Claude user settings)
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { Logger } from "../logging";

const ALLOWED_PREFIXES = [
  "ANTHROPIC_",
  "CLAUDE_CODE_",
  "API_TIMEOUT",
  "OPENAI_",
  "GOOGLE_",
  "ZAI_",
  "SPRITES_"
];

/**
 * Read env from ~/.claude/settings.json
 */
async function readClaudeUserEnv(
  logger: Logger,
): Promise<Record<string, string>> {
  const settingsPath = path.join(os.homedir(), ".claude", "settings.json");
  try {
    const raw = await fs.readFile(settingsPath, "utf8");
    const parsed = JSON.parse(raw);
    const env = parsed?.env;
    if (!env || typeof env !== "object") return {};

    // Only import allowed prefixes for safety
    return Object.fromEntries(
      Object.entries(env)
        .filter(
          ([k, v]) =>
            (typeof v === "string" || typeof v === "number") &&
            ALLOWED_PREFIXES.some((p) => k.startsWith(p)),
        )
        .map(([k, v]) => [k, String(v)]),
    );
  } catch (e: any) {
    if (e?.code !== "ENOENT") {
      logger.warn(`Failed to read ${settingsPath}: ${e?.message ?? e}`);
    }
    return {};
  }
}

/**
 * Read env from a wreckit config file
 */
async function readWreckitEnv(
  configPath: string,
  logger: Logger,
): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(configPath, "utf8");
    const parsed = JSON.parse(raw);
    const env = parsed?.agent?.env;
    if (!env || typeof env !== "object") return {};

    return Object.fromEntries(
      Object.entries(env)
        .filter(([_, v]) => typeof v === "string" || typeof v === "number")
        .map(([k, v]) => [k, String(v)]),
    );
  } catch (e: any) {
    if (e?.code !== "ENOENT") {
      logger.debug(`Failed to read ${configPath}: ${e?.message ?? e}`);
    }
    return {};
  }
}

export interface BuildSdkEnvOptions {
  cwd: string;
  logger: Logger;
}

/**
 * Build the environment to pass to the Claude SDK.
 *
 * Merges from multiple sources with clear precedence.
 */
export async function buildSdkEnv(
  options: BuildSdkEnvOptions,
): Promise<Record<string, string>> {
  const { cwd, logger } = options;

  // Load from all sources
  const claudeSettingsEnv = await readClaudeUserEnv(logger);
  const wreckitConfigEnv = await readWreckitEnv(
    path.join(cwd, ".wreckit", "config.json"),
    logger,
  );
  const wreckitLocalEnv = await readWreckitEnv(
    path.join(cwd, ".wreckit", "config.local.json"),
    logger,
  );

  // Process env (filter undefined)
  const processEnv = Object.fromEntries(
    Object.entries(process.env).filter(
      (e): e is [string, string] => e[1] !== undefined,
    ),
  );

  // Merge with precedence: local > config > process > claude settings
  const sdkEnv: Record<string, string> = {
    ...claudeSettingsEnv,
    ...processEnv,
    ...wreckitConfigEnv,
    ...wreckitLocalEnv,
  };

  // If using a custom base URL with auth token, blank out API_KEY to prevent fallback
  if (sdkEnv.ANTHROPIC_BASE_URL && sdkEnv.ANTHROPIC_AUTH_TOKEN) {
    sdkEnv.ANTHROPIC_API_KEY = "";
    logger.debug(`Using custom endpoint: ${sdkEnv.ANTHROPIC_BASE_URL}`);
    logger.debug(
      `Auth token present: ${sdkEnv.ANTHROPIC_AUTH_TOKEN ? "yes" : "no"}`,
    );
  }

  return sdkEnv;
}

export interface BuildAxAIEnvOptions extends BuildSdkEnvOptions {
  provider: "anthropic" | "openai" | "google" | "zai";
}

/**
 * Build environment specifically for AxAI providers.
 */
export async function buildAxAIEnv(options: BuildAxAIEnvOptions): Promise<Record<string, string>> {
  const { provider, logger } = options;
  const baseEnv = await buildSdkEnv(options);
  const axaiEnv: Record<string, string> = { ...baseEnv };

  if (provider === "anthropic") {
    // Map ANTHROPIC_AUTH_TOKEN to ANTHROPIC_API_KEY if present (for custom endpoints like Zai)
    if (axaiEnv.ANTHROPIC_AUTH_TOKEN && !axaiEnv.ANTHROPIC_API_KEY) {
      axaiEnv.ANTHROPIC_API_KEY = axaiEnv.ANTHROPIC_AUTH_TOKEN;
      logger.debug("Mapped ANTHROPIC_AUTH_TOKEN to ANTHROPIC_API_KEY for AxAI");
    }
  } else if (provider === "zai") {
    // Z.AI support
    // 1. Check for ZAI_API_KEY, fallback to ANTHROPIC_AUTH_TOKEN
    if (axaiEnv.ZAI_API_KEY) {
      axaiEnv.ANTHROPIC_API_KEY = axaiEnv.ZAI_API_KEY;
    } else if (axaiEnv.ANTHROPIC_AUTH_TOKEN) {
      axaiEnv.ANTHROPIC_API_KEY = axaiEnv.ANTHROPIC_AUTH_TOKEN;
    }
    
    // 2. Set default base URL for Z.AI if not already set (via ANTHROPIC_BASE_URL)
    if (!axaiEnv.ANTHROPIC_BASE_URL) {
      axaiEnv.ANTHROPIC_BASE_URL = "https://api.z.ai/api/anthropic";
      logger.debug("Set default ANTHROPIC_BASE_URL for Z.AI provider");
    }
  } else if (provider === "openai") {
    // Ensure OPENAI_API_KEY is present
    if (!axaiEnv.OPENAI_API_KEY) {
      logger.warn("OPENAI_API_KEY not found in environment");
    }
  } else if (provider === "google") {
    // Ensure GOOGLE_API_KEY is present
    if (!axaiEnv.GOOGLE_API_KEY) {
      logger.warn("GOOGLE_API_KEY not found in environment");
    }
  }

  return axaiEnv;
}

export interface BuildSpriteEnvOptions extends BuildSdkEnvOptions {
  token?: string;
}

/**
 * Build environment specifically for Sprite CLI operations.
 * Handles Sprites.dev authentication token.
 */
export async function buildSpriteEnv(options: BuildSpriteEnvOptions): Promise<Record<string, string>> {
  const { token, logger } = options;
  const baseEnv = await buildSdkEnv(options);
  const spriteEnv: Record<string, string> = { ...baseEnv };

  // Add token if provided (from config or explicit parameter)
  if (token) {
    spriteEnv.SPRITES_TOKEN = token;
    logger.debug("Sprites token loaded from config");
  } else if (baseEnv.SPRITES_TOKEN) {
    logger.debug("Sprites token loaded from environment");
  }

  // Redact token from logs for security
  if (spriteEnv.SPRITES_TOKEN) {
    logger.debug("SPRITES_TOKEN: present (redacted)");
  }

  return spriteEnv;
}