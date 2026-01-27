/**
 * Integration tests for Amp SDK runner.
 *
 * These tests mock the @sourcegraph/amp-sdk module to test:
 * - Basic execution flow
 * - Error handling
 * - Dry run mode
 *
 * No API credentials required - all SDK calls are mocked.
 */
import { describe, it, expect, mock, beforeEach, vi } from "bun:test";
import type { Logger } from "../../logging";
import type { AmpSdkAgentConfig } from "../../schemas";
import type { AgentEvent } from "../../tui/agentEvents";

// Mock the SDK module before importing the runner
const mockedExecute = vi.fn();

mock.module("@sourcegraph/amp-sdk", () => ({
  execute: mockedExecute,
}));

// Mock buildSdkEnv to avoid filesystem access
mock.module("../../agent/env.js", () => ({
  buildSdkEnv: vi.fn(() => Promise.resolve({})),
}));

// Mock the controller registration functions
mock.module("../../agent/runner.js", () => ({
  registerSdkController: vi.fn(),
  unregisterSdkController: vi.fn(),
}));

// Import after mocking
const { runAmpSdkAgent } = await import("../../agent/amp-sdk-runner");

function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    json: vi.fn(),
  };
}

function createDefaultConfig(): AmpSdkAgentConfig {
  return {
    kind: "amp_sdk",
  };
}

describe("Amp SDK Integration", () => {
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = createMockLogger();
    vi.clearAllMocks();
  });

  describe("successful execution", () => {
    it("returns success with string result", async () => {
      mockedExecute.mockResolvedValue("Task completed successfully");

      const result = await runAmpSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
      });

      expect(result.success).toBe(true);
      expect(result.output).toBe("Task completed successfully");
      expect(result.exitCode).toBe(0);
      expect(result.completionDetected).toBe(true);
    });

    it("returns success with object result (stringified)", async () => {
      mockedExecute.mockResolvedValue({
        status: "done",
        files: ["a.ts", "b.ts"],
      });

      const result = await runAmpSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain("done");
      expect(result.output).toContain("a.ts");
      expect(result.exitCode).toBe(0);
    });

    it("passes prompt to SDK execute", async () => {
      mockedExecute.mockResolvedValue("done");

      await runAmpSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "My specific test prompt",
        logger: mockLogger,
      });

      expect(mockedExecute).toHaveBeenCalled();
      const callArgs = mockedExecute.mock.calls[0][0];
      expect(callArgs.prompt).toBe("My specific test prompt");
    });

    it("calls stdout callback with output", async () => {
      mockedExecute.mockResolvedValue("Agent output here");

      const stdoutChunks: string[] = [];

      await runAmpSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
        onStdoutChunk: (chunk) => stdoutChunks.push(chunk),
      });

      expect(stdoutChunks.length).toBe(1);
      expect(stdoutChunks[0]).toBe("Agent output here");
    });
  });

  describe("error handling", () => {
    it("handles SDK errors", async () => {
      mockedExecute.mockRejectedValue(new Error("SDK execution failed"));

      const result = await runAmpSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
      });

      expect(result.success).toBe(false);
      expect(result.output).toContain("Error:");
      expect(result.output).toContain("SDK execution failed");
      expect(result.exitCode).toBe(1);
    });

    it("handles network errors", async () => {
      mockedExecute.mockRejectedValue(
        new Error("ECONNREFUSED: Connection refused"),
      );

      const result = await runAmpSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
      });

      expect(result.success).toBe(false);
      expect(result.output).toContain("ECONNREFUSED");
      expect(result.exitCode).toBe(1);
    });

    it("handles non-Error exceptions", async () => {
      mockedExecute.mockRejectedValue("String error");

      const result = await runAmpSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
      });

      expect(result.success).toBe(false);
      expect(result.output).toContain("String error");
      expect(result.exitCode).toBe(1);
    });
  });

  describe("dry run mode", () => {
    it("returns success without calling SDK in dry run", async () => {
      const result = await runAmpSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain("[dry-run]");
      expect(mockedExecute).not.toHaveBeenCalled();
    });

    it("logs tool restrictions in dry run", async () => {
      await runAmpSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
        dryRun: true,
        allowedTools: ["Read", "Glob"],
      });

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining("Read"),
      );
    });
  });

  describe("configuration options", () => {
    it("passes signal to SDK for abort handling", async () => {
      mockedExecute.mockResolvedValue("done");

      await runAmpSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test",
        logger: mockLogger,
      });

      expect(mockedExecute).toHaveBeenCalled();
      const callArgs = mockedExecute.mock.calls[0][0];
      expect(callArgs.signal).toBeDefined();
      expect(callArgs.signal instanceof AbortSignal).toBe(true);
    });
  });

  describe("logging", () => {
    it("logs execution start", async () => {
      mockedExecute.mockResolvedValue("done");

      await runAmpSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test",
        logger: mockLogger,
      });

      expect(mockLogger.info).toHaveBeenCalledWith("Executing Amp SDK...");
    });

    it("logs errors on failure", async () => {
      mockedExecute.mockRejectedValue(new Error("Test error"));

      await runAmpSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test",
        logger: mockLogger,
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Test error"),
      );
    });
  });
});
