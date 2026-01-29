import { describe, test, expect } from "bun:test";
import {
  ComputeConfigSchema,
  LimitsConfigSchema,
  ConfigSchema,
} from "../../schemas";

describe("Config Schema Validation (Item 001)", () => {
  describe("ComputeConfigSchema", () => {
    test("accepts backend='local'", () => {
      const result = ComputeConfigSchema.safeParse({
        backend: "local",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.backend).toBe("local");
      }
    });

    test("applies default backend='local'", () => {
      const result = ComputeConfigSchema.safeParse({});

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.backend).toBe("local");
      }
    });

    test("accepts backend='sprites' with sprites config", () => {
      const result = ComputeConfigSchema.safeParse({
        backend: "sprites",
        sprites: {
          kind: "sprite",
          wispPath: "sprite",
          syncEnabled: true,
          syncExcludePatterns: [".git", "node_modules"],
          syncOnSuccess: false,
          maxVMs: 5,
          defaultMemory: "512MiB",
          defaultCPUs: "1",
          timeout: 300,
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.backend).toBe("sprites");
        expect(result.data.sprites).toBeDefined();
      }
    });

    test("rejects backend='invalid'", () => {
      const result = ComputeConfigSchema.safeParse({
        backend: "invalid",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("Invalid literal value");
      }
    });

    test("makes sprites optional", () => {
      const result = ComputeConfigSchema.safeParse({
        backend: "local",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sprites).toBeUndefined();
      }
    });
  });

  describe("LimitsConfigSchema", () => {
    test("accepts all limit fields", () => {
      const result = LimitsConfigSchema.safeParse({
        maxIterations: 200,
        maxDurationSeconds: 7200,
        maxBudgetDollars: 10.0,
        maxProgressSteps: 2000,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.maxIterations).toBe(200);
        expect(result.data.maxDurationSeconds).toBe(7200);
        expect(result.data.maxBudgetDollars).toBe(10.0);
        expect(result.data.maxProgressSteps).toBe(2000);
      }
    });

    test("applies all default values", () => {
      const result = LimitsConfigSchema.safeParse({});

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.maxIterations).toBe(100);
        expect(result.data.maxDurationSeconds).toBe(3600);
        expect(result.data.maxProgressSteps).toBe(1000);
      }
    });

    test("makes maxBudgetDollars optional", () => {
      const result = LimitsConfigSchema.safeParse({
        maxIterations: 100,
        maxDurationSeconds: 3600,
        maxProgressSteps: 1000,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.maxBudgetDollars).toBeUndefined();
      }
    });

    test("allows overriding specific defaults", () => {
      const result = LimitsConfigSchema.safeParse({
        maxIterations: 50,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.maxIterations).toBe(50);
        expect(result.data.maxDurationSeconds).toBe(3600); // Default
        expect(result.data.maxProgressSteps).toBe(1000); // Default
      }
    });
  });

  describe("ConfigSchema Integration", () => {
    test("accepts compute section", () => {
      const result = ConfigSchema.safeParse({
        schema_version: 1,
        base_branch: "main",
        branch_prefix: "wreckit/",
        merge_mode: "pr",
        agent: {
          kind: "claude_sdk",
          model: "claude-sonnet-4-20250514",
          max_tokens: 4096,
        },
        max_iterations: 100,
        timeout_seconds: 3600,
        compute: {
          backend: "sprites",
          sprites: {
            kind: "sprite",
            wispPath: "sprite",
            syncEnabled: true,
            syncExcludePatterns: [],
            syncOnSuccess: false,
            maxVMs: 5,
            defaultMemory: "512MiB",
            defaultCPUs: "1",
            timeout: 300,
          },
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.compute).toBeDefined();
        expect(result.data.compute?.backend).toBe("sprites");
      }
    });

    test("accepts limits section", () => {
      const result = ConfigSchema.safeParse({
        schema_version: 1,
        base_branch: "main",
        branch_prefix: "wreckit/",
        merge_mode: "pr",
        agent: {
          kind: "claude_sdk",
          model: "claude-sonnet-4-20250514",
          max_tokens: 4096,
        },
        max_iterations: 100,
        timeout_seconds: 3600,
        limits: {
          maxIterations: 200,
          maxDurationSeconds: 7200,
          maxBudgetDollars: 10.0,
          maxProgressSteps: 2000,
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limits).toBeDefined();
        expect(result.data.limits?.maxIterations).toBe(200);
      }
    });

    test("makes compute and limits optional", () => {
      const result = ConfigSchema.safeParse({
        schema_version: 1,
        base_branch: "main",
        branch_prefix: "wreckit/",
        merge_mode: "pr",
        agent: {
          kind: "claude_sdk",
          model: "claude-sonnet-4-20250514",
          max_tokens: 4096,
        },
        max_iterations: 100,
        timeout_seconds: 3600,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.compute).toBeUndefined();
        expect(result.data.limits).toBeUndefined();
      }
    });

    test("accepts both compute and limits sections", () => {
      const result = ConfigSchema.safeParse({
        schema_version: 1,
        base_branch: "main",
        branch_prefix: "wreckit/",
        merge_mode: "pr",
        agent: {
          kind: "claude_sdk",
          model: "claude-sonnet-4-20250514",
          max_tokens: 4096,
        },
        max_iterations: 100,
        timeout_seconds: 3600,
        compute: {
          backend: "local",
        },
        limits: {
          maxIterations: 150,
          maxDurationSeconds: 5400,
          maxProgressSteps: 1500,
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.compute).toBeDefined();
        expect(result.data.limits).toBeDefined();
      }
    });

    test("applies defaults to compute section", () => {
      const result = ConfigSchema.safeParse({
        schema_version: 1,
        base_branch: "main",
        branch_prefix: "wreckit/",
        merge_mode: "pr",
        agent: {
          kind: "claude_sdk",
          model: "claude-sonnet-4-20250514",
          max_tokens: 4096,
        },
        max_iterations: 100,
        timeout_seconds: 3600,
        compute: {}, // Empty compute section
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.compute?.backend).toBe("local"); // Default
      }
    });

    test("applies defaults to limits section", () => {
      const result = ConfigSchema.safeParse({
        schema_version: 1,
        base_branch: "main",
        branch_prefix: "wreckit/",
        merge_mode: "pr",
        agent: {
          kind: "claude_sdk",
          model: "claude-sonnet-4-20250514",
          max_tokens: 4096,
        },
        max_iterations: 100,
        timeout_seconds: 3600,
        limits: {}, // Empty limits section
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limits?.maxIterations).toBe(100); // Default
        expect(result.data.limits?.maxDurationSeconds).toBe(3600); // Default
        expect(result.data.limits?.maxProgressSteps).toBe(1000); // Default
      }
    });
  });
});
