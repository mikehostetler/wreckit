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

  it("fills missing fields from defaults for partial config.json", async () => {
    const partialConfig = {
      base_branch: "develop",
      agent: {
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
    expect(result.agent.command).toBe("custom-agent");
    expect(result.schema_version).toBe(DEFAULT_CONFIG.schema_version);
    expect(result.branch_prefix).toBe(DEFAULT_CONFIG.branch_prefix);
    expect(result.max_iterations).toBe(DEFAULT_CONFIG.max_iterations);
    expect(result.timeout_seconds).toBe(DEFAULT_CONFIG.timeout_seconds);
  });

  it("uses full config.json as-is when all fields present", async () => {
    const fullConfig: ConfigResolved = {
      schema_version: 2,
      base_branch: "production",
      branch_prefix: "custom/",
      agent: {
        mode: "process",
        command: "my-agent",
        args: ["--verbose"],
        completion_signal: "FINISHED",
      },
      max_iterations: 50,
      timeout_seconds: 1800,
    };
    await fs.writeFile(
      path.join(tempDir, ".wreckit", "config.json"),
      JSON.stringify(fullConfig)
    );

    const result = await loadConfig(tempDir);
    expect(result).toMatchObject(fullConfig);
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

  it("merges nested agent object correctly with partial agent config", () => {
    const partial = {
      agent: {
        command: "custom-cmd",
        args: ["--custom"],
        completion_signal: "CUSTOM_DONE",
      },
    };

    const result = mergeWithDefaults(partial);

    expect(result.agent.command).toBe("custom-cmd");
    expect(result.agent.args).toEqual(["--custom"]);
    expect(result.agent.completion_signal).toBe("CUSTOM_DONE");
    expect(result.base_branch).toBe(DEFAULT_CONFIG.base_branch);
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

  it("applies agentCommand override", () => {
    const overrides: ConfigOverrides = { agentCommand: "custom-agent" };
    const result = applyOverrides(DEFAULT_CONFIG, overrides);

    expect(result.agent.command).toBe("custom-agent");
    expect(result.agent.args).toEqual(DEFAULT_CONFIG.agent.args);
  });

  it("applies maxIterations override", () => {
    const overrides: ConfigOverrides = { maxIterations: 50 };
    const result = applyOverrides(DEFAULT_CONFIG, overrides);

    expect(result.max_iterations).toBe(50);
    expect(result.timeout_seconds).toBe(DEFAULT_CONFIG.timeout_seconds);
  });

  it("applies multiple overrides together", () => {
    const overrides: ConfigOverrides = {
      baseBranch: "develop",
      branchPrefix: "feature/",
      agentCommand: "my-agent",
      agentArgs: ["--verbose", "--debug"],
      completionSignal: "DONE",
      maxIterations: 25,
      timeoutSeconds: 600,
    };

    const result = applyOverrides(DEFAULT_CONFIG, overrides);

    expect(result.base_branch).toBe("develop");
    expect(result.branch_prefix).toBe("feature/");
    expect(result.agent.command).toBe("my-agent");
    expect(result.agent.args).toEqual(["--verbose", "--debug"]);
    expect(result.agent.completion_signal).toBe("DONE");
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
