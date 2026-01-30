import { describe, it, expect, beforeEach, afterEach, vi } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  loadConfig,
  mergeWithDefaults,
  applyOverrides,
  DEFAULT_CONFIG,
  type ConfigOverrides,
  type ConfigResolved,
} from "../../config";
import { InvalidJsonError, SchemaValidationError } from "../../errors";

/**
 * Edge Case Tests 42-46: Config Handling
 * From EDGE_CASE_TEST_PLAN.md Section 2.4
 */
describe("Edge Cases: Config Handling (Tests 42-46)", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "wreckit-config-edge-test-"),
    );
    await fs.mkdir(path.join(tempDir, ".wreckit"), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("Test 42: Missing config.json - uses defaults", () => {
    it("returns DEFAULT_CONFIG when .wreckit exists but config.json is missing", async () => {
      const result = await loadConfig(tempDir);
      expect(result).toEqual(DEFAULT_CONFIG);
    });

    it("returns correct default values for all fields", async () => {
      const result = await loadConfig(tempDir);

      expect(result.schema_version).toBe(1);
      expect(result.base_branch).toBe("main");
      expect(result.branch_prefix).toBe("wreckit/");
      expect(result.agent.kind).toBe("claude_sdk");
      if (result.agent.kind === "claude_sdk") {
        expect(result.agent.model).toBe("claude-sonnet-4-20250514");
      }
      expect(result.max_iterations).toBe(100);
      expect(result.timeout_seconds).toBe(3600);
    });

    it("does not throw when .wreckit directory is empty", async () => {
      const result = await loadConfig(tempDir);
      expect(result).toBeDefined();
    });
  });

  describe("Test 43: Invalid JSON in config - falls back to defaults", () => {
    // Note: loadConfig was changed to be lenient - it catches errors and
    // falls back to defaults with a console.warn instead of throwing

    it("falls back to defaults for malformed JSON with missing quotes", async () => {
      await fs.writeFile(
        path.join(tempDir, ".wreckit", "config.json"),
        '{ base_branch: "main" }',
      );

      const result = await loadConfig(tempDir);
      expect(result).toEqual(DEFAULT_CONFIG);
    });

    it("falls back to defaults for truncated JSON", async () => {
      await fs.writeFile(
        path.join(tempDir, ".wreckit", "config.json"),
        '{ "base_branch": "main"',
      );

      const result = await loadConfig(tempDir);
      expect(result).toEqual(DEFAULT_CONFIG);
    });

    it("falls back to defaults for completely invalid content", async () => {
      await fs.writeFile(
        path.join(tempDir, ".wreckit", "config.json"),
        "this is not json at all",
      );

      const result = await loadConfig(tempDir);
      expect(result).toEqual(DEFAULT_CONFIG);
    });

    it("falls back to defaults gracefully", async () => {
      const configPath = path.join(tempDir, ".wreckit", "config.json");
      await fs.writeFile(configPath, "{ invalid json }");

      // Should not throw, should return defaults
      const result = await loadConfig(tempDir);
      expect(result).toEqual(DEFAULT_CONFIG);
    });

    it("falls back to defaults for empty file", async () => {
      await fs.writeFile(path.join(tempDir, ".wreckit", "config.json"), "");

      const result = await loadConfig(tempDir);
      expect(result).toEqual(DEFAULT_CONFIG);
    });

    it("falls back to defaults for JSON with trailing commas", async () => {
      await fs.writeFile(
        path.join(tempDir, ".wreckit", "config.json"),
        '{ "base_branch": "main", }',
      );

      const result = await loadConfig(tempDir);
      expect(result).toEqual(DEFAULT_CONFIG);
    });
  });

  describe("Test 44: Schema validation failure - falls back to defaults", () => {
    // Note: loadConfig was changed to be lenient - it catches validation
    // errors and falls back to defaults with a console.warn instead of throwing

    it("falls back to defaults when base_branch is a number", async () => {
      await fs.writeFile(
        path.join(tempDir, ".wreckit", "config.json"),
        JSON.stringify({ base_branch: 123 }),
      );

      const result = await loadConfig(tempDir);
      expect(result.base_branch).toBe(DEFAULT_CONFIG.base_branch);
    });

    it("falls back to defaults when schema_version is a string", async () => {
      await fs.writeFile(
        path.join(tempDir, ".wreckit", "config.json"),
        JSON.stringify({ schema_version: "one" }),
      );

      const result = await loadConfig(tempDir);
      expect(result.schema_version).toBe(DEFAULT_CONFIG.schema_version);
    });

    it("falls back to defaults when agent is a string instead of object", async () => {
      await fs.writeFile(
        path.join(tempDir, ".wreckit", "config.json"),
        JSON.stringify({ agent: "invalid-agent" }),
      );

      const result = await loadConfig(tempDir);
      expect(result.agent).toEqual(DEFAULT_CONFIG.agent);
    });

    it("falls back to defaults when max_iterations is negative", async () => {
      await fs.writeFile(
        path.join(tempDir, ".wreckit", "config.json"),
        JSON.stringify({ max_iterations: -5 }),
      );

      const result = await loadConfig(tempDir);
      expect(result.max_iterations).toBe(DEFAULT_CONFIG.max_iterations);
    });

    it("falls back to defaults when timeout_seconds is a boolean", async () => {
      await fs.writeFile(
        path.join(tempDir, ".wreckit", "config.json"),
        JSON.stringify({ timeout_seconds: true }),
      );

      const result = await loadConfig(tempDir);
      expect(result.timeout_seconds).toBe(DEFAULT_CONFIG.timeout_seconds);
    });

    it("falls back to defaults when agent.args is a string instead of array", async () => {
      await fs.writeFile(
        path.join(tempDir, ".wreckit", "config.json"),
        JSON.stringify({
          agent: {
            kind: "process",
            command: "claude",
            args: "--flag",
            completion_signal: "DONE",
          },
        }),
      );

      const result = await loadConfig(tempDir);
      // Falls back to defaults when validation fails
      expect(result.agent).toEqual(DEFAULT_CONFIG.agent);
    });

    it("falls back gracefully for invalid config", async () => {
      const configPath = path.join(tempDir, ".wreckit", "config.json");
      await fs.writeFile(configPath, JSON.stringify({ base_branch: 123 }));

      // Should not throw, should return defaults
      const result = await loadConfig(tempDir);
      expect(result.base_branch).toBe(DEFAULT_CONFIG.base_branch);
    });
  });

  describe("Test 45: Partial config with defaults - mergeWithDefaults fills missing values", () => {
    it("fills missing base_branch with default", async () => {
      await fs.writeFile(
        path.join(tempDir, ".wreckit", "config.json"),
        JSON.stringify({
          branch_prefix: "feature/",
          agent: {
            kind: "claude_sdk",
            model: "claude-sonnet-4-20250514",
          },
        }),
      );

      const result = await loadConfig(tempDir);
      expect(result.base_branch).toBe(DEFAULT_CONFIG.base_branch);
      expect(result.branch_prefix).toBe("feature/");
    });

    it("uses provided agent when all agent fields are present", async () => {
      await fs.writeFile(
        path.join(tempDir, ".wreckit", "config.json"),
        JSON.stringify({
          agent: {
            kind: "process",
            command: "custom-agent",
            args: ["--custom"],
            completion_signal: "CUSTOM_DONE",
          },
        }),
      );

      const result = await loadConfig(tempDir);
      expect(result.agent.kind).toBe("process");
      if (result.agent.kind === "process") {
        expect(result.agent.command).toBe("custom-agent");
        expect(result.agent.args).toEqual(["--custom"]);
        expect(result.agent.completion_signal).toBe("CUSTOM_DONE");
      }
    });

    it("mergeWithDefaults returns full defaults for empty object", () => {
      const result = mergeWithDefaults({});
      expect(result).toEqual(DEFAULT_CONFIG);
    });

    it("mergeWithDefaults preserves provided values", () => {
      const result = mergeWithDefaults({
        base_branch: "develop",
        max_iterations: 50,
      });

      expect(result.base_branch).toBe("develop");
      expect(result.max_iterations).toBe(50);
      expect(result.schema_version).toBe(DEFAULT_CONFIG.schema_version);
      expect(result.branch_prefix).toBe(DEFAULT_CONFIG.branch_prefix);
      expect(result.timeout_seconds).toBe(DEFAULT_CONFIG.timeout_seconds);
    });

    it("mergeWithDefaults handles partial agent with all fields", () => {
      const result = mergeWithDefaults({
        agent: {
          kind: "process",
          command: "my-agent",
          args: ["--verbose"],
          completion_signal: "FINISHED",
        },
      });

      expect(result.agent.kind).toBe("process");
      if (result.agent.kind === "process") {
        expect(result.agent.command).toBe("my-agent");
        expect(result.agent.args).toEqual(["--verbose"]);
        expect(result.agent.completion_signal).toBe("FINISHED");
      }
    });

    it("config with schema_version and agent fills other defaults", async () => {
      await fs.writeFile(
        path.join(tempDir, ".wreckit", "config.json"),
        JSON.stringify({
          schema_version: 2,
          agent: {
            kind: "process",
            command: "my-agent",
            args: ["--flag"],
            completion_signal: "DONE",
          },
        }),
      );

      const result = await loadConfig(tempDir);
      expect(result.schema_version).toBe(2);
      expect(result.base_branch).toBe(DEFAULT_CONFIG.base_branch);
      expect(result.branch_prefix).toBe(DEFAULT_CONFIG.branch_prefix);
      expect(result.agent.kind).toBe("process");
      if (result.agent.kind === "process") {
        expect(result.agent.command).toBe("my-agent");
      }
      expect(result.max_iterations).toBe(DEFAULT_CONFIG.max_iterations);
      expect(result.timeout_seconds).toBe(DEFAULT_CONFIG.timeout_seconds);
    });
  });

  describe("Test 46: Config overrides (applyOverrides) - override values take precedence", () => {
    it("baseBranch override takes precedence over config", async () => {
      await fs.writeFile(
        path.join(tempDir, ".wreckit", "config.json"),
        JSON.stringify({
          base_branch: "main",
          agent: {
            kind: "claude_sdk",
            model: "claude-sonnet-4-20250514",
          },
        }),
      );

      const result = await loadConfig(tempDir, { baseBranch: "master" });
      expect(result.base_branch).toBe("master");
    });

    it("multiple overrides all take precedence", async () => {
      await fs.writeFile(
        path.join(tempDir, ".wreckit", "config.json"),
        JSON.stringify({
          base_branch: "main",
          branch_prefix: "wreckit/",
          max_iterations: 100,
          agent: {
            kind: "claude_sdk",
            model: "claude-sonnet-4-20250514",
          },
        }),
      );

      const overrides: ConfigOverrides = {
        baseBranch: "develop",
        branchPrefix: "custom/",
        maxIterations: 25,
      };

      const result = await loadConfig(tempDir, overrides);
      expect(result.base_branch).toBe("develop");
      expect(result.branch_prefix).toBe("custom/");
      expect(result.max_iterations).toBe(25);
    });

    it("applyOverrides with empty overrides returns original config", () => {
      const config = { ...DEFAULT_CONFIG };
      const result = applyOverrides(config, {});
      expect(result).toEqual(config);
    });

    it("applyOverrides applies agentCommand override for process mode", () => {
      const processConfig: ConfigResolved = {
        ...DEFAULT_CONFIG,
        agent: {
          kind: "process",
          command: "claude",
          args: ["--print"],
          completion_signal: "DONE",
        },
      };
      const result = applyOverrides(processConfig, {
        agentCommand: "custom-agent",
      });

      expect(result.agent.kind).toBe("process");
      if (result.agent.kind === "process") {
        expect(result.agent.command).toBe("custom-agent");
        expect(result.agent.args).toEqual(["--print"]);
        expect(result.agent.completion_signal).toBe("DONE");
      }
    });

    it("applyOverrides applies agentArgs override for process mode", () => {
      const processConfig: ConfigResolved = {
        ...DEFAULT_CONFIG,
        agent: {
          kind: "process",
          command: "claude",
          args: ["--print"],
          completion_signal: "DONE",
        },
      };
      const result = applyOverrides(processConfig, {
        agentArgs: ["--debug", "--verbose"],
      });

      expect(result.agent.kind).toBe("process");
      if (result.agent.kind === "process") {
        expect(result.agent.args).toEqual(["--debug", "--verbose"]);
        expect(result.agent.command).toBe("claude");
      }
    });

    it("applyOverrides applies completionSignal override for process mode", () => {
      const processConfig: ConfigResolved = {
        ...DEFAULT_CONFIG,
        agent: {
          kind: "process",
          command: "claude",
          args: ["--print"],
          completion_signal: "DONE",
        },
      };
      const result = applyOverrides(processConfig, {
        completionSignal: "TASK_DONE",
      });

      expect(result.agent.kind).toBe("process");
      if (result.agent.kind === "process") {
        expect(result.agent.completion_signal).toBe("TASK_DONE");
      }
    });

    it("applyOverrides applies timeoutSeconds override", () => {
      const result = applyOverrides(DEFAULT_CONFIG, { timeoutSeconds: 7200 });
      expect(result.timeout_seconds).toBe(7200);
    });

    it("overrides work with missing config.json (defaults + overrides)", async () => {
      const result = await loadConfig(tempDir, {
        baseBranch: "production",
        maxIterations: 10,
      });

      expect(result.base_branch).toBe("production");
      expect(result.max_iterations).toBe(10);
      expect(result.branch_prefix).toBe(DEFAULT_CONFIG.branch_prefix);
    });

    it("all overrides can be applied together for process mode", () => {
      const processConfig: ConfigResolved = {
        ...DEFAULT_CONFIG,
        agent: {
          kind: "process",
          command: "claude",
          args: ["--print"],
          completion_signal: "DONE",
        },
      };
      const overrides: ConfigOverrides = {
        baseBranch: "release",
        branchPrefix: "release/",
        agentCommand: "release-agent",
        agentArgs: ["--release"],
        completionSignal: "RELEASED",
        maxIterations: 5,
        timeoutSeconds: 300,
      };

      const result = applyOverrides(processConfig, overrides);

      expect(result.base_branch).toBe("release");
      expect(result.branch_prefix).toBe("release/");
      expect(result.agent.kind).toBe("process");
      if (result.agent.kind === "process") {
        expect(result.agent.command).toBe("release-agent");
        expect(result.agent.args).toEqual(["--release"]);
        expect(result.agent.completion_signal).toBe("RELEASED");
      }
      expect(result.max_iterations).toBe(5);
      expect(result.timeout_seconds).toBe(300);
      expect(result.schema_version).toBe(DEFAULT_CONFIG.schema_version);
    });

    it("schema_version is never overridden", () => {
      const config = { ...DEFAULT_CONFIG, schema_version: 5 };
      const result = applyOverrides(config, {
        baseBranch: "develop",
      });

      expect(result.schema_version).toBe(5);
    });
  });
});
