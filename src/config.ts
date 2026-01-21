import * as fs from "node:fs/promises";
import { ConfigSchema, PrChecksSchema, BranchCleanupSchema, ComputeConfigSchema, LimitsConfigSchema, SpritesConfigSchema, type Config } from "./schemas";
import { getConfigPath, getWreckitDir } from "./fs/paths";
import { safeWriteJson } from "./fs/atomic";
import {
  InvalidJsonError,
  SchemaValidationError,
} from "./errors";

export interface PrChecksResolved {
  commands: string[];
  secret_scan: boolean;
  require_all_stories_done: boolean;
  allow_unsafe_direct_merge: boolean;
  allowed_remote_patterns: string[];
}

export interface BranchCleanupResolved {
  enabled: boolean;
  delete_remote: boolean;
}

export interface SpritesGithubResolved {
  use_token_for_clone: boolean;
  git_user_name: string;
  git_user_email: string;
}

export interface SpritesSyncResolved {
  upload_paths: string[];
  download_paths: string[];
}

export interface SpritesConfigResolved {
  enabled: boolean;
  name_prefix: string;
  auto_delete: boolean;
  resume: boolean;
  workdir: string;
  env_file: string;
  copy_claude_credentials: boolean;
  github: SpritesGithubResolved;
  sync: SpritesSyncResolved;
}

export interface ComputeConfigResolved {
  backend: "local" | "sprites";
  sprites?: SpritesConfigResolved;
}

export interface LimitsConfigResolved {
  max_iterations: number;
  max_duration_hours: number;
  max_budget_usd: number;
  no_progress_threshold: number;
}

export interface ConfigResolved {
  schema_version: number;
  base_branch: string;
  branch_prefix: string;
  merge_mode: "pr" | "direct";
  agent: {
    mode: "process" | "sdk";
    command: string;
    args: string[];
    completion_signal: string;
  };
  max_iterations: number;
  timeout_seconds: number;
  pr_checks: PrChecksResolved;
  branch_cleanup: BranchCleanupResolved;
  compute: ComputeConfigResolved;
  limits: LimitsConfigResolved;
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
  merge_mode: "pr",
  agent: {
    mode: "sdk",
    command: "claude", // Kept for fallback
    args: ["--dangerously-skip-permissions", "--print"], // Kept for fallback
    completion_signal: "<promise>COMPLETE</promise>", // Kept for fallback
  },
  max_iterations: 100,
  timeout_seconds: 3600,
  pr_checks: {
    commands: [],
    secret_scan: false,
    require_all_stories_done: true,
    allow_unsafe_direct_merge: false,
    allowed_remote_patterns: [],
  },
  branch_cleanup: {
    enabled: true,
    delete_remote: true,
  },
  compute: {
    backend: "local",
  },
  limits: {
    max_iterations: 100,
    max_duration_hours: 4,
    max_budget_usd: 20,
    no_progress_threshold: 3,
  },
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
      }
    : { ...DEFAULT_CONFIG.agent };

  const prChecks = partial.pr_checks
    ? {
        commands: partial.pr_checks.commands ?? DEFAULT_CONFIG.pr_checks.commands,
        secret_scan: partial.pr_checks.secret_scan ?? DEFAULT_CONFIG.pr_checks.secret_scan,
        require_all_stories_done: partial.pr_checks.require_all_stories_done ?? DEFAULT_CONFIG.pr_checks.require_all_stories_done,
        allow_unsafe_direct_merge: partial.pr_checks.allow_unsafe_direct_merge ?? DEFAULT_CONFIG.pr_checks.allow_unsafe_direct_merge,
        allowed_remote_patterns: partial.pr_checks.allowed_remote_patterns ?? DEFAULT_CONFIG.pr_checks.allowed_remote_patterns,
      }
    : { ...DEFAULT_CONFIG.pr_checks };

  const branchCleanup = partial.branch_cleanup
    ? {
        enabled: partial.branch_cleanup.enabled ?? DEFAULT_CONFIG.branch_cleanup.enabled,
        delete_remote: partial.branch_cleanup.delete_remote ?? DEFAULT_CONFIG.branch_cleanup.delete_remote,
      }
    : { ...DEFAULT_CONFIG.branch_cleanup };

  const compute: ComputeConfigResolved = partial.compute
    ? {
        backend: partial.compute.backend ?? DEFAULT_CONFIG.compute.backend,
        sprites: partial.compute.sprites
          ? {
              enabled: partial.compute.sprites.enabled ?? false,
              name_prefix: partial.compute.sprites.name_prefix ?? "wreckit",
              auto_delete: partial.compute.sprites.auto_delete ?? true,
              resume: partial.compute.sprites.resume ?? true,
              workdir: partial.compute.sprites.workdir ?? "/var/local/wreckit",
              env_file: partial.compute.sprites.env_file ?? ".wreckit/.sprite.env",
              copy_claude_credentials: partial.compute.sprites.copy_claude_credentials ?? false,
              github: {
                use_token_for_clone: partial.compute.sprites.github?.use_token_for_clone ?? true,
                git_user_name: partial.compute.sprites.github?.git_user_name ?? "wreckit",
                git_user_email: partial.compute.sprites.github?.git_user_email ?? "wreckit@users.noreply.github.com",
              },
              sync: {
                upload_paths: partial.compute.sprites.sync?.upload_paths ?? [".wreckit/config.json", ".wreckit/items"],
                download_paths: partial.compute.sprites.sync?.download_paths ?? [".wreckit/items", ".wreckit/logs"],
              },
            }
          : undefined,
      }
    : { ...DEFAULT_CONFIG.compute };

  const limits: LimitsConfigResolved = {
    max_iterations: partial.limits?.max_iterations ?? partial.max_iterations ?? DEFAULT_CONFIG.limits.max_iterations,
    max_duration_hours: partial.limits?.max_duration_hours ?? DEFAULT_CONFIG.limits.max_duration_hours,
    max_budget_usd: partial.limits?.max_budget_usd ?? DEFAULT_CONFIG.limits.max_budget_usd,
    no_progress_threshold: partial.limits?.no_progress_threshold ?? DEFAULT_CONFIG.limits.no_progress_threshold,
  };

  return {
    schema_version: partial.schema_version ?? DEFAULT_CONFIG.schema_version,
    base_branch: partial.base_branch ?? DEFAULT_CONFIG.base_branch,
    branch_prefix: partial.branch_prefix ?? DEFAULT_CONFIG.branch_prefix,
    merge_mode: partial.merge_mode ?? DEFAULT_CONFIG.merge_mode,
    agent,
    max_iterations: partial.max_iterations ?? DEFAULT_CONFIG.max_iterations,
    timeout_seconds: partial.timeout_seconds ?? DEFAULT_CONFIG.timeout_seconds,
    pr_checks: prChecks,
    branch_cleanup: branchCleanup,
    compute,
    limits,
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
    merge_mode: config.merge_mode,
    agent: {
      mode: config.agent.mode,
      command: overrides.agentCommand ?? config.agent.command,
      args: overrides.agentArgs ?? config.agent.args,
      completion_signal:
        overrides.completionSignal ?? config.agent.completion_signal,
    },
    max_iterations: overrides.maxIterations ?? config.max_iterations,
    timeout_seconds: overrides.timeoutSeconds ?? config.timeout_seconds,
    pr_checks: config.pr_checks,
    branch_cleanup: config.branch_cleanup,
    compute: config.compute,
    limits: config.limits,
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
  await safeWriteJson(configPath, DEFAULT_CONFIG);
}
