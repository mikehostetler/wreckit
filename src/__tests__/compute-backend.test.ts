import { describe, it, expect } from "bun:test";
import { createComputeBackend, LocalBackend, SpritesBackend } from "../agent/compute-backend";
import type { ComputeConfig } from "../schemas";

describe("ComputeBackend Factory", () => {
  it("should return LocalBackend by default", () => {
    const backend = createComputeBackend(undefined);
    expect(backend).toBeInstanceOf(LocalBackend);
    expect(backend.kind).toBe("local");
  });

  it("should return LocalBackend when configured", () => {
    const config: ComputeConfig = { backend: "local" };
    const backend = createComputeBackend(config);
    expect(backend).toBeInstanceOf(LocalBackend);
  });

  it("should return SpritesBackend when configured", () => {
    const config: ComputeConfig = {
      backend: "sprites",
      sprites: {
        wispPath: "sprite",
        syncEnabled: true,
        syncExcludePatterns: [],
        syncOnSuccess: true,
        maxVMs: 1,
        defaultMemory: "512MiB",
        defaultCPUs: "1",
        timeout: 300,
        kind: "sprite"
      },
    };
    const backend = createComputeBackend(config);
    expect(backend).toBeInstanceOf(SpritesBackend);
    expect(backend.kind).toBe("sprites");
  });

  it("should throw when sprites config is missing", () => {
    const config: ComputeConfig = { backend: "sprites" };
    expect(() => createComputeBackend(config)).toThrow("Sprites backend requires sprites configuration");
  });
});
