import { describe, it, expect, mock, beforeEach } from "bun:test";
import type { Logger } from "../logging";
import type { AmpSdkAgentConfig } from "../schemas";

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

function createDefaultConfig(): AmpSdkAgentConfig {
  return {
    kind: "amp_sdk",
  };
}

describe("runAmpSdkAgent", () => {
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = createMockLogger();
  });

  describe("dry-run mode", () => {
    it("returns success without calling SDK", async () => {
      const { runAmpSdkAgent } = await import("../agent/amp-sdk-runner");
      const result = await runAmpSdkAgent({
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
      const { runAmpSdkAgent } = await import("../agent/amp-sdk-runner");
      const result = await runAmpSdkAgent({
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
      const { runAmpSdkAgent } = await import("../agent/amp-sdk-runner");
      const result = await runAmpSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
        dryRun: true,
        allowedTools: ["Read"],
        phase: "implement", // Would give more tools, but explicit wins
      });

      expect(result.success).toBe(true);
      // Debug should show only "Read", not the implement phase tools
      const debugCalls = (mockLogger.debug as any).mock.calls;
      const toolRestrictionCall = debugCalls.find((call: any[]) =>
        call[0]?.includes?.("Tool restrictions"),
      );
      expect(toolRestrictionCall).toBeDefined();
      expect(toolRestrictionCall[0]).toContain("Read");
      // Should NOT contain tools from implement phase like "Bash"
      expect(toolRestrictionCall[0]).not.toContain("Bash");
    });

    it("falls back to phase-based allowlist when no explicit tools", async () => {
      const { runAmpSdkAgent } = await import("../agent/amp-sdk-runner");
      const result = await runAmpSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
        dryRun: true,
        phase: "research",
      });

      expect(result.success).toBe(true);
      // Research phase allows Read, Write, Glob, Grep
      const debugCalls = (mockLogger.debug as any).mock.calls;
      const toolRestrictionCall = debugCalls.find((call: any[]) =>
        call[0]?.includes?.("Tool restrictions"),
      );
      expect(toolRestrictionCall).toBeDefined();
      expect(toolRestrictionCall[0]).toContain("Glob");
      expect(toolRestrictionCall[0]).toContain("Read");
    });

    it("has no restrictions when neither allowedTools nor phase specified", async () => {
      const { runAmpSdkAgent } = await import("../agent/amp-sdk-runner");
      const result = await runAmpSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
        dryRun: true,
      });

      expect(result.success).toBe(true);
      // Should not log tool restrictions
      const debugCalls = (mockLogger.debug as any).mock.calls;
      const hasToolRestrictions = debugCalls.some((call: any[]) =>
        call[0]?.includes?.("Tool restrictions"),
      );
      expect(hasToolRestrictions).toBe(false);
    });
  });
});
