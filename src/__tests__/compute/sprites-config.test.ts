import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { loadConfig, mergeWithDefaults, DEFAULT_CONFIG } from "../../config";
import { ComputeBackendSchema, SpritesConfigSchema, LimitsConfigSchema, ComputeConfigSchema, type Config } from "../../schemas";

describe("ComputeBackendSchema", () => {
  it("parses 'local' backend", () => {
    const result = ComputeBackendSchema.safeParse("local");
    expect(result.success).toBe(true);
    expect(result.data).toBe("local");
  });

  it("parses 'sprites' backend", () => {
    const result = ComputeBackendSchema.safeParse("sprites");
    expect(result.success).toBe(true);
    expect(result.data).toBe("sprites");
  });

  it("rejects invalid backend", () => {
    const result = ComputeBackendSchema.safeParse("invalid");
    expect(result.success).toBe(false);
  });
});

describe("SpritesConfigSchema defaults", () => {
  it("applies all defaults for empty object", () => {
    const result = SpritesConfigSchema.parse({});
    expect(result.enabled).toBe(false);
    expect(result.name_prefix).toBe("wreckit");
    expect(result.auto_delete).toBe(true);
    expect(result.resume).toBe(true);
    expect(result.workdir).toBe("/var/local/wreckit");
    expect(result.env_file).toBe(".wreckit/.sprite.env");
    expect(result.copy_claude_credentials).toBe(false);
  });

  it("applies github defaults when github is provided", () => {
    const result = SpritesConfigSchema.parse({ github: {} });
    expect(result.github.use_token_for_clone).toBe(true);
    expect(result.github.git_user_name).toBe("wreckit");
    expect(result.github.git_user_email).toBe("wreckit@users.noreply.github.com");
  });

  it("applies sync defaults when sync is provided", () => {
    const result = SpritesConfigSchema.parse({ sync: {} });
    expect(result.sync.upload_paths).toEqual([".wreckit/config.json", ".wreckit/items"]);
    expect(result.sync.download_paths).toEqual([".wreckit/items", ".wreckit/logs"]);
  });

  it("allows overriding specific fields", () => {
    const result = SpritesConfigSchema.parse({
      enabled: true,
      name_prefix: "custom",
      github: { git_user_name: "custom-user" },
    });
    expect(result.enabled).toBe(true);
    expect(result.name_prefix).toBe("custom");
    expect(result.github.git_user_name).toBe("custom-user");
    expect(result.github.use_token_for_clone).toBe(true);
  });
});

describe("LimitsConfigSchema defaults", () => {
  it("applies all defaults for empty object", () => {
    const result = LimitsConfigSchema.parse({});
    expect(result.max_iterations).toBe(100);
    expect(result.max_duration_hours).toBe(4);
    expect(result.max_budget_usd).toBe(20);
    expect(result.no_progress_threshold).toBe(3);
  });

  it("allows overriding specific fields", () => {
    const result = LimitsConfigSchema.parse({
      max_iterations: 50,
      max_budget_usd: 10,
    });
    expect(result.max_iterations).toBe(50);
    expect(result.max_budget_usd).toBe(10);
    expect(result.max_duration_hours).toBe(4);
    expect(result.no_progress_threshold).toBe(3);
  });
});

describe("ComputeConfigSchema", () => {
  it("defaults backend to local", () => {
    const result = ComputeConfigSchema.parse({});
    expect(result.backend).toBe("local");
    expect(result.sprites).toBeUndefined();
  });

  it("parses sprites backend with config", () => {
    const result = ComputeConfigSchema.parse({
      backend: "sprites",
      sprites: { enabled: true },
    });
    expect(result.backend).toBe("sprites");
    expect(result.sprites?.enabled).toBe(true);
  });
});

describe("mergeWithDefaults compute and limits", () => {
  it("includes compute defaults", () => {
    const result = mergeWithDefaults({});
    expect(result.compute.backend).toBe("local");
    expect(result.compute.sprites).toBeUndefined();
  });

  it("includes limits defaults", () => {
    const result = mergeWithDefaults({});
    expect(result.limits.max_iterations).toBe(100);
    expect(result.limits.max_duration_hours).toBe(4);
    expect(result.limits.max_budget_usd).toBe(20);
    expect(result.limits.no_progress_threshold).toBe(3);
  });

  it("merges sprites config when provided", () => {
    const result = mergeWithDefaults({
      compute: {
        backend: "sprites",
        sprites: {
          enabled: true,
          name_prefix: "custom",
        },
      },
    } as Partial<Config>);
    expect(result.compute.backend).toBe("sprites");
    expect(result.compute.sprites?.enabled).toBe(true);
    expect(result.compute.sprites?.name_prefix).toBe("custom");
    expect(result.compute.sprites?.auto_delete).toBe(true);
    expect(result.compute.sprites?.github.git_user_name).toBe("wreckit");
  });

  it("merges limits when provided", () => {
    const result = mergeWithDefaults({
      limits: {
        max_iterations: 50,
        max_budget_usd: 10,
      },
    } as Partial<Config>);
    expect(result.limits.max_iterations).toBe(50);
    expect(result.limits.max_budget_usd).toBe(10);
    expect(result.limits.max_duration_hours).toBe(4);
  });
});

describe("backward compatibility", () => {
  it("root-level max_iterations still works", () => {
    const result = mergeWithDefaults({
      max_iterations: 75,
    });
    expect(result.max_iterations).toBe(75);
    expect(result.limits.max_iterations).toBe(75);
  });

  it("limits.max_iterations takes precedence over root-level", () => {
    const result = mergeWithDefaults({
      max_iterations: 75,
      limits: {
        max_iterations: 50,
      },
    } as Partial<Config>);
    expect(result.max_iterations).toBe(75);
    expect(result.limits.max_iterations).toBe(50);
  });
});

describe("loadConfig with compute and limits", () => {
  let tempDir: string;

  const baseAgentConfig = {
    agent: {
      command: "claude",
      args: ["--dangerously-skip-permissions"],
      completion_signal: "DONE",
    },
  };

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-sprites-test-"));
    await fs.mkdir(path.join(tempDir, ".wreckit"), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("loads compute config from file", async () => {
    const config = {
      ...baseAgentConfig,
      compute: {
        backend: "sprites",
        sprites: {
          enabled: true,
          name_prefix: "test-prefix",
        },
      },
    };
    await fs.writeFile(
      path.join(tempDir, ".wreckit", "config.json"),
      JSON.stringify(config)
    );

    const result = await loadConfig(tempDir);

    expect(result.compute.backend).toBe("sprites");
    expect(result.compute.sprites?.enabled).toBe(true);
    expect(result.compute.sprites?.name_prefix).toBe("test-prefix");
    expect(result.compute.sprites?.auto_delete).toBe(true);
  });

  it("loads limits config from file", async () => {
    const config = {
      ...baseAgentConfig,
      limits: {
        max_iterations: 200,
        max_budget_usd: 50,
      },
    };
    await fs.writeFile(
      path.join(tempDir, ".wreckit", "config.json"),
      JSON.stringify(config)
    );

    const result = await loadConfig(tempDir);

    expect(result.limits.max_iterations).toBe(200);
    expect(result.limits.max_budget_usd).toBe(50);
    expect(result.limits.max_duration_hours).toBe(4);
  });

  it("backward compat: root max_iterations populates limits", async () => {
    const config = {
      ...baseAgentConfig,
      max_iterations: 150,
    };
    await fs.writeFile(
      path.join(tempDir, ".wreckit", "config.json"),
      JSON.stringify(config)
    );

    const result = await loadConfig(tempDir);

    expect(result.max_iterations).toBe(150);
    expect(result.limits.max_iterations).toBe(150);
  });
});
