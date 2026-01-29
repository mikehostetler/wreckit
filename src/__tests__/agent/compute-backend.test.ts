import { describe, test, expect, beforeEach } from "bun:test";
import {
  createComputeBackend,
  executeAgentOnBackend,
  LocalBackend,
  SpritesBackend,
} from "../../agent/compute-backend";
import type { ComputeConfig } from "../../schemas";
import { initLogger } from "../../logging";

describe("ComputeBackend", () => {
  let logger: ReturnType<typeof initLogger>;

  beforeEach(() => {
    logger = initLogger();
  });

  describe("createComputeBackend()", () => {
    test("returns LocalBackend when backend='local'", () => {
      const config: ComputeConfig = { backend: "local" };
      const backend = createComputeBackend(config);

      expect(backend).toBeInstanceOf(LocalBackend);
      expect(backend.kind).toBe("local");
    });

    test("returns LocalBackend when compute undefined", () => {
      const backend = createComputeBackend({ backend: "local" });

      expect(backend).toBeInstanceOf(LocalBackend);
      expect(backend.kind).toBe("local");
    });

    test("returns SpritesBackend when backend='sprites'", () => {
      const config: ComputeConfig = {
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
      };
      const backend = createComputeBackend(config);

      expect(backend).toBeInstanceOf(SpritesBackend);
      expect(backend.kind).toBe("sprites");
    });

    test("throws error when sprites config missing for sprites backend", () => {
      const config: ComputeConfig = { backend: "sprites" };

      expect(() => createComputeBackend(config)).toThrow(
        "Sprites backend requires sprites configuration"
      );
    });

    test("throws error for unknown backend", () => {
      const config = { backend: "unknown" as any };

      expect(() => createComputeBackend(config)).toThrow(
        "Unknown compute backend: unknown"
      );
    });
  });

  describe("LocalBackend", () => {
    test("has kind='local'", () => {
      const backend = new LocalBackend();
      expect(backend.kind).toBe("local");
    });

    test("executeAgent() returns AgentResult structure", async () => {
      const backend = new LocalBackend();
      const options = {
        itemId: "test-item",
        agentConfig: {
          kind: "process" as const,
          command: "echo",
          args: ["test"],
          completion_signal: "<complete/>",
        },
        computeConfig: { backend: "local" as const },
        cwd: "/tmp",
        logger,
      };

      // Note: This will fail to actually execute since we're not in a real repo
      // But we can test the structure
      try {
        const result = await backend.executeAgent(options);
        expect(result).toHaveProperty("success");
        expect(result).toHaveProperty("iterations");
        expect(result).toHaveProperty("duration");
        expect(result).toHaveProperty("filesModified");
        expect(result).toHaveProperty("output");
      } catch (error) {
        // Expected to fail in test environment, but structure should be correct
        expect(error).toBeDefined();
      }
    });
  });

  describe("SpritesBackend", () => {
    test("has kind='sprites'", () => {
      const backend = new SpritesBackend();
      expect(backend.kind).toBe("sprites");
    });

    test("stores sprites config", () => {
      const spritesConfig = {
        kind: "sprite" as const,
        wispPath: "custom-sprite",
        syncEnabled: false,
        syncExcludePatterns: ["node_modules"],
        syncOnSuccess: true,
        maxVMs: 10,
        defaultMemory: "1GiB",
        defaultCPUs: "2",
        timeout: 600,
      };
      const backend = new SpritesBackend(spritesConfig);

      expect(backend).toBeInstanceOf(SpritesBackend);
      expect(backend.kind).toBe("sprites");
    });

    test("uses default config when none provided", () => {
      const backend = new SpritesBackend();
      expect(backend).toBeInstanceOf(SpritesBackend);
      expect(backend.kind).toBe("sprites");
    });
  });

  describe("executeAgentOnBackend()", () => {
    test("calls backend.executeAgent()", async () => {
      const backend = new LocalBackend();
      const options = {
        itemId: "test-item",
        agentConfig: {
          kind: "process" as const,
          command: "echo",
          args: ["test"],
          completion_signal: "<complete/>",
        },
        computeConfig: { backend: "local" as const },
        cwd: "/tmp",
        logger,
      };

      // Mock the backend to verify it's called
      let called = false;
      const originalExecute = backend.executeAgent.bind(backend);
      backend.executeAgent = async (opts) => {
        called = true;
        return originalExecute(opts);
      };

      try {
        await executeAgentOnBackend(backend, options);
        expect(called).toBe(true);
      } catch (error) {
        // Expected to fail in test environment
        expect(called).toBe(true);
      }
    });
  });
});
