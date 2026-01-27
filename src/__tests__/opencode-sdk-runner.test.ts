import { describe, it, expect, mock, beforeEach } from "bun:test";
import type { Logger } from "../logging";
import type { OpenCodeSdkAgentConfig } from "../schemas";

// Test helper to create mock logger
function createMockLogger(): Logger {
  return {
    debug: mock(() => {}),
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
    json: mock(() => {}),
  };
}

function createDefaultConfig(): OpenCodeSdkAgentConfig {
  return {
    kind: "opencode_sdk",
  };
}

describe("runOpenCodeSdkAgent", () => {
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = createMockLogger();
  });

  describe("dry-run mode", () => {
    it("returns success without calling SDK", async () => {
      const { runOpenCodeSdkAgent } =
        await import("../agent/opencode-sdk-runner");
      const result = await runOpenCodeSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain("[dry-run]");
      expect(result.completionDetected).toBe(true);
    });

    it("logs tool restrictions when allowedTools provided", async () => {
      const { runOpenCodeSdkAgent } =
        await import("../agent/opencode-sdk-runner");
      const result = await runOpenCodeSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
        dryRun: true,
        allowedTools: ["Read", "Glob"],
      });

      expect(result.success).toBe(true);
      const debugCalls = (mockLogger.debug as any).mock.calls;
      const hasToolRestrictions = debugCalls.some((call: any[]) =>
        call[0]?.includes?.("Tool restrictions"),
      );
      expect(hasToolRestrictions).toBe(true);
    });
  });

  describe("getEffectiveToolAllowlist resolution", () => {
    it("prefers explicit allowedTools over phase", async () => {
      const { runOpenCodeSdkAgent } =
        await import("../agent/opencode-sdk-runner");
      const result = await runOpenCodeSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
        dryRun: true,
        allowedTools: ["Read"],
        phase: "implement", // Would give more tools, but explicit wins
      });

      expect(result.success).toBe(true);
      const debugCalls = (mockLogger.debug as any).mock.calls;
      const toolRestrictionCall = debugCalls.find((call: any[]) =>
        call[0]?.includes?.("Tool restrictions"),
      );
      expect(toolRestrictionCall).toBeDefined();
      expect(toolRestrictionCall[0]).toContain("Read");
      expect(toolRestrictionCall[0]).not.toContain("Bash");
    });

    it("falls back to phase-based allowlist when no explicit tools", async () => {
      const { runOpenCodeSdkAgent } =
        await import("../agent/opencode-sdk-runner");
      const result = await runOpenCodeSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
        dryRun: true,
        phase: "research",
      });

      expect(result.success).toBe(true);
      const debugCalls = (mockLogger.debug as any).mock.calls;
      const toolRestrictionCall = debugCalls.find((call: any[]) =>
        call[0]?.includes?.("Tool restrictions"),
      );
      expect(toolRestrictionCall).toBeDefined();
      expect(toolRestrictionCall[0]).toContain("Glob");
      expect(toolRestrictionCall[0]).toContain("Read");
    });

    it("has no restrictions when neither allowedTools nor phase specified", async () => {
      const { runOpenCodeSdkAgent } =
        await import("../agent/opencode-sdk-runner");
      const result = await runOpenCodeSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
        dryRun: true,
      });

      expect(result.success).toBe(true);
      const debugCalls = (mockLogger.debug as any).mock.calls;
      const hasToolRestrictions = debugCalls.some((call: any[]) =>
        call[0]?.includes?.("Tool restrictions"),
      );
      expect(hasToolRestrictions).toBe(false);
    });
  });
});
