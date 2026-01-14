import * as fs from "node:fs/promises";
import { ConfigSchema, type Config } from "./schemas";
import { getConfigPath, getWreckitDir } from "./fs/paths";
import {
  InvalidJsonError,
  SchemaValidationError,
} from "./errors";

export interface ConfigResolved {
  schema_version: number;
  base_branch: string;
  branch_prefix: string;
  agent: {
    mode: "process" | "sdk";
    command: string;
    args: string[];
    completion_signal: string;
    sdk_model?: string;
    sdk_max_tokens?: number;
    sdk_tools?: string[];
  };
  max_iterations: number;
  timeout_seconds: number;
}

export interface ConfigOverrides {
  baseBranch?: string;
  branchPrefix?: string;
  agentCommand?: string;
  agentArgs?: string[];
  completionSignal?: string;
  maxIterations?: number;
  timeoutSeconds?: number;
}

export const DEFAULT_CONFIG: ConfigResolved = {
  schema_version: 1,
  base_branch: "main",
  branch_prefix: "wreckit/",
  agent: {
    mode: "sdk",
    command: "claude", // Kept for fallback
    args: ["--dangerously-skip-permissions", "--print"], // Kept for fallback
    completion_signal: "<promise>COMPLETE</promise>", // Kept for fallback
    sdk_model: "claude-sonnet-4-20250514",
  },
  max_iterations: 100,
  timeout_seconds: 3600,
};

export function mergeWithDefaults(partial: Partial<Config>): ConfigResolved {
  const agent = partial.agent
    ? {
        mode: partial.agent.mode ?? DEFAULT_CONFIG.agent.mode,
        command: partial.agent.command ?? DEFAULT_CONFIG.agent.command,
        args: partial.agent.args ?? DEFAULT_CONFIG.agent.args,
        completion_signal:
          partial.agent.completion_signal ??
          DEFAULT_CONFIG.agent.completion_signal,
        sdk_model: partial.agent.sdk_model,
        sdk_max_tokens: partial.agent.sdk_max_tokens,
        sdk_tools: partial.agent.sdk_tools,
      }
    : { ...DEFAULT_CONFIG.agent };

  return {
    schema_version: partial.schema_version ?? DEFAULT_CONFIG.schema_version,
    base_branch: partial.base_branch ?? DEFAULT_CONFIG.base_branch,
    branch_prefix: partial.branch_prefix ?? DEFAULT_CONFIG.branch_prefix,
    agent,
    max_iterations: partial.max_iterations ?? DEFAULT_CONFIG.max_iterations,
    timeout_seconds: partial.timeout_seconds ?? DEFAULT_CONFIG.timeout_seconds,
  };
}

export function applyOverrides(
  config: ConfigResolved,
  overrides: ConfigOverrides
): ConfigResolved {
  return {
    schema_version: config.schema_version,
    base_branch: overrides.baseBranch ?? config.base_branch,
    branch_prefix: overrides.branchPrefix ?? config.branch_prefix,
    agent: {
      command: overrides.agentCommand ?? config.agent.command,
      args: overrides.agentArgs ?? config.agent.args,
      completion_signal:
        overrides.completionSignal ?? config.agent.completion_signal,
    },
    max_iterations: overrides.maxIterations ?? config.max_iterations,
    timeout_seconds: overrides.timeoutSeconds ?? config.timeout_seconds,
  };
}

export async function loadConfig(
  root: string,
  overrides?: ConfigOverrides
): Promise<ConfigResolved> {
  const configPath = getConfigPath(root);
  let partial: Partial<Config> = {};

  try {
    const content = await fs.readFile(configPath, "utf-8");
    let data: unknown;
    try {
      data = JSON.parse(content);
    } catch {
      throw new InvalidJsonError(`Invalid JSON in file: ${configPath}`);
    }

    const result = ConfigSchema.safeParse(data);
    if (!result.success) {
      throw new SchemaValidationError(
        `Schema validation failed for ${configPath}: ${result.error.message}`
      );
    }
    partial = result.data;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      partial = {};
    } else if (
      err instanceof InvalidJsonError ||
      err instanceof SchemaValidationError
    ) {
      throw err;
    } else {
      throw err;
    }
  }

  const resolved = mergeWithDefaults(partial);

  if (overrides) {
    return applyOverrides(resolved, overrides);
  }

  return resolved;
}

export async function createDefaultConfig(root: string): Promise<void> {
  const wreckitDir = getWreckitDir(root);
  await fs.mkdir(wreckitDir, { recursive: true });

  const configPath = getConfigPath(root);
  const content = JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n";
  await fs.writeFile(configPath, content, "utf-8");
}
