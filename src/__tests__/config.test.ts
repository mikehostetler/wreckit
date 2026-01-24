import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  loadConfig,
  mergeWithDefaults,
  applyOverrides,
  createDefaultConfig,
  DEFAULT_CONFIG,
  type ConfigResolved,
  type ConfigOverrides,
} from "../config";
import { ConfigSchema } from "../schemas";
import { SchemaValidationError, InvalidJsonError } from "../errors";

describe("loadConfig", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-config-test-"));
    await fs.mkdir(path.join(tempDir, ".wreckit"), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("returns defaults when config.json does not exist", async () => {
    const result = await loadConfig(tempDir);
    expect(result).toEqual(DEFAULT_CONFIG);
  });

  it("fills missing fields from defaults for partial config.json (legacy format)", async () => {
    // Legacy format with mode/command/args/completion_signal gets migrated
    const partialConfig = {
      base_branch: "develop",
      agent: {
        mode: "process",
        command: "custom-agent",
        args: ["--flag"],
        completion_signal: "DONE",
      },
    };
    await fs.writeFile(
      path.join(tempDir, ".wreckit", "config.json"),
      JSON.stringify(partialConfig)
    );

    const result = await loadConfig(tempDir);

    expect(result.base_branch).toBe("develop");
    // After migration, should be kind: "process" with command/args/completion_signal
    expect(result.agent.kind).toBe("process");
    if (result.agent.kind === "process") {
      expect(result.agent.command).toBe("custom-agent");
    }
    expect(result.schema_version).toBe(DEFAULT_CONFIG.schema_version);
    expect(result.branch_prefix).toBe(DEFAULT_CONFIG.branch_prefix);
    expect(result.max_iterations).toBe(DEFAULT_CONFIG.max_iterations);
    expect(result.timeout_seconds).toBe(DEFAULT_CONFIG.timeout_seconds);
  });

  it("uses full config.json as-is when all fields present (new format)", async () => {
    const fullConfig: ConfigResolved = {
      schema_version: 2,
      base_branch: "production",
      branch_prefix: "custom/",
      agent: {
        kind: "process",
        command: "my-agent",
        args: ["--verbose"],
        completion_signal: "FINISHED",
      },
      max_iterations: 50,
      timeout_seconds: 1800,
      merge_mode: "pr",
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
    };
    await fs.writeFile(
      path.join(tempDir, ".wreckit", "config.json"),
      JSON.stringify(fullConfig)
    );

    const result = await loadConfig(tempDir);
    expect(result.agent.kind).toBe("process");
    expect(result.schema_version).toBe(2);
    expect(result.base_branch).toBe("production");
    expect(result.branch_prefix).toBe("custom/");
  });

  it("throws SchemaValidationError for invalid config.json", async () => {
    const invalidConfig = {
      schema_version: "not a number",
      agent: "invalid",
    };
    await fs.writeFile(
      path.join(tempDir, ".wreckit", "config.json"),
      JSON.stringify(invalidConfig)
    );

    await expect(loadConfig(tempDir)).rejects.toThrow(SchemaValidationError);
  });

  it("throws InvalidJsonError for malformed JSON", async () => {
    await fs.writeFile(
      path.join(tempDir, ".wreckit", "config.json"),
      "{ invalid json }"
    );

    await expect(loadConfig(tempDir)).rejects.toThrow(InvalidJsonError);
  });
});

describe("mergeWithDefaults", () => {
  it("returns full defaults for empty object", () => {
    const result = mergeWithDefaults({});
    expect(result).toEqual(DEFAULT_CONFIG);
  });

  it("merges partial object correctly", () => {
    const partial = {
      base_branch: "develop",
      max_iterations: 200,
    };

    const result = mergeWithDefaults(partial);

    expect(result.base_branch).toBe("develop");
    expect(result.max_iterations).toBe(200);
    expect(result.schema_version).toBe(DEFAULT_CONFIG.schema_version);
    expect(result.branch_prefix).toBe(DEFAULT_CONFIG.branch_prefix);
    expect(result.agent).toEqual(DEFAULT_CONFIG.agent);
    expect(result.timeout_seconds).toBe(DEFAULT_CONFIG.timeout_seconds);
  });

  it("migrates legacy mode agent format to kind format", () => {
    const partial = {
      agent: {
        mode: "process",
        command: "custom-cmd",
        args: ["--custom"],
        completion_signal: "CUSTOM_DONE",
      },
    };

    const result = mergeWithDefaults(partial);

    // Should migrate to kind format
    expect(result.agent.kind).toBe("process");
    if (result.agent.kind === "process") {
      expect(result.agent.command).toBe("custom-cmd");
      expect(result.agent.args).toEqual(["--custom"]);
      expect(result.agent.completion_signal).toBe("CUSTOM_DONE");
    }
    expect(result.base_branch).toBe(DEFAULT_CONFIG.base_branch);
  });

  it("preserves new kind format when provided", () => {
    const partial = {
      agent: {
        kind: "claude_sdk",
        model: "custom-model",
        max_tokens: 8192,
      },
    };

    const result = mergeWithDefaults(partial as any);

    expect(result.agent.kind).toBe("claude_sdk");
    if (result.agent.kind === "claude_sdk") {
      expect(result.agent.model).toBe("custom-model");
      expect(result.agent.max_tokens).toBe(8192);
    }
  });
});

describe("applyOverrides", () => {
  it("returns same config when no overrides", () => {
    const config = { ...DEFAULT_CONFIG };
    const result = applyOverrides(config, {});
    expect(result).toEqual(config);
  });

  it("applies baseBranch override", () => {
    const overrides: ConfigOverrides = { baseBranch: "develop" };
    const result = applyOverrides(DEFAULT_CONFIG, overrides);

    expect(result.base_branch).toBe("develop");
    expect(result.branch_prefix).toBe(DEFAULT_CONFIG.branch_prefix);
  });

  it("applies agentCommand override for process mode", () => {
    // Create a config with process mode
    const processConfig: ConfigResolved = {
      ...DEFAULT_CONFIG,
      agent: {
        kind: "process",
        command: "original-agent",
        args: [],
        completion_signal: "<promise>COMPLETE</promise>",
      },
    };

    const overrides: ConfigOverrides = { agentCommand: "custom-agent" };
    const result = applyOverrides(processConfig, overrides);

    expect(result.agent.kind).toBe("process");
    if (result.agent.kind === "process") {
      expect(result.agent.command).toBe("custom-agent");
    }
  });

  it("ignores agent overrides for SDK mode", () => {
    // SDK modes don't support command/args overrides
    const overrides: ConfigOverrides = { agentCommand: "custom-agent" };
    const result = applyOverrides(DEFAULT_CONFIG, overrides);

    // Should remain claude_sdk, command override is ignored
    expect(result.agent.kind).toBe("claude_sdk");
  });

  it("applies maxIterations override", () => {
    const overrides: ConfigOverrides = { maxIterations: 50 };
    const result = applyOverrides(DEFAULT_CONFIG, overrides);

    expect(result.max_iterations).toBe(50);
    expect(result.timeout_seconds).toBe(DEFAULT_CONFIG.timeout_seconds);
  });

  it("applies multiple overrides together", () => {
    // Create a config with process mode to test all agent overrides
    const processConfig: ConfigResolved = {
      ...DEFAULT_CONFIG,
      agent: {
        kind: "process",
        command: "original",
        args: [],
        completion_signal: "<promise>COMPLETE</promise>",
      },
    };

    const overrides: ConfigOverrides = {
      baseBranch: "develop",
      branchPrefix: "feature/",
      agentCommand: "my-agent",
      agentArgs: ["--verbose", "--debug"],
      completionSignal: "DONE",
      maxIterations: 25,
      timeoutSeconds: 600,
    };

    const result = applyOverrides(processConfig, overrides);

    expect(result.base_branch).toBe("develop");
    expect(result.branch_prefix).toBe("feature/");
    expect(result.agent.kind).toBe("process");
    if (result.agent.kind === "process") {
      expect(result.agent.command).toBe("my-agent");
      expect(result.agent.args).toEqual(["--verbose", "--debug"]);
      expect(result.agent.completion_signal).toBe("DONE");
    }
    expect(result.max_iterations).toBe(25);
    expect(result.timeout_seconds).toBe(600);
    expect(result.schema_version).toBe(DEFAULT_CONFIG.schema_version);
  });
});

describe("createDefaultConfig", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "wreckit-createconfig-test-")
    );
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("creates .wreckit/config.json if it does not exist", async () => {
    await createDefaultConfig(tempDir);

    const configPath = path.join(tempDir, ".wreckit", "config.json");
    const stat = await fs.stat(configPath);
    expect(stat.isFile()).toBe(true);

    const content = await fs.readFile(configPath, "utf-8");
    const parsed = JSON.parse(content);
    expect(parsed).toEqual(DEFAULT_CONFIG);
  });

  it("created file validates against ConfigSchema", async () => {
    await createDefaultConfig(tempDir);

    const configPath = path.join(tempDir, ".wreckit", "config.json");
    const content = await fs.readFile(configPath, "utf-8");
    const parsed = JSON.parse(content);

    const result = ConfigSchema.safeParse(parsed);
    expect(result.success).toBe(true);
  });
});
