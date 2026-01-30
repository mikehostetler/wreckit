import { describe, it, expect } from "bun:test";
import { ComputeConfigSchema, LimitsConfigSchema, ConfigSchema } from "../schemas";

describe("Config Schemas", () => {
  describe("ComputeConfigSchema", () => {
    it("should accept valid local config", () => {
      const config = { backend: "local" };
      const result = ComputeConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("should accept valid sprites config", () => {
      const config = {
        backend: "sprites",
        sprites: {
          wispPath: "sprite",
          kind: "sprite"
        }
      };
      const result = ComputeConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("should reject invalid backend", () => {
      const config = { backend: "invalid" };
      const result = ComputeConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });

  describe("LimitsConfigSchema", () => {
    it("should apply defaults", () => {
      const result = LimitsConfigSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.maxIterations).toBe(100);
        expect(result.data.maxDurationSeconds).toBe(3600);
      }
    });

    it("should accept valid overrides", () => {
      const config = {
        maxIterations: 50,
        maxBudgetDollars: 10
      };
      const result = LimitsConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.maxIterations).toBe(50);
        expect(result.data.maxBudgetDollars).toBe(10);
      }
    });
  });
});
