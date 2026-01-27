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

const ALLOWED_PREFIXES = ["ANTHROPIC_", "CLAUDE_CODE_", "API_TIMEOUT"];

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
