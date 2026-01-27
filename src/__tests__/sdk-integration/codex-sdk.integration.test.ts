/**
 * Integration tests for Codex SDK runner.
 *
 * These tests mock the @openai/codex-sdk module to test:
 * - Basic execution flow
 * - Error handling
 * - Dry run mode
 *
 * No API credentials required - all SDK calls are mocked.
 */
import { describe, it, expect, mock, beforeEach, vi } from "bun:test";
import type { Logger } from "../../logging";
import type { CodexSdkAgentConfig } from "../../schemas";
import type { AgentEvent } from "../../tui/agentEvents";

// Create mock thread with run method
const mockRun = vi.fn();
const mockThread = { run: mockRun };
const mockStartThread = vi.fn().mockResolvedValue(mockThread);

// Mock the SDK module before importing the runner
const MockCodex = vi.fn().mockImplementation(() => ({
  startThread: mockStartThread,
}));

mock.module("@openai/codex-sdk", () => ({
  Codex: MockCodex,
}));

// Mock buildSdkEnv to avoid filesystem access
mock.module("../../agent/env.js", () => ({
  buildSdkEnv: vi.fn(() => Promise.resolve({ CODEX_API_KEY: "test-key" })),
}));

// Mock the controller registration functions
mock.module("../../agent/runner.js", () => ({
  registerSdkController: vi.fn(),
  unregisterSdkController: vi.fn(),
}));

// Import after mocking
const { runCodexSdkAgent } = await import("../../agent/codex-sdk-runner");

function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    json: vi.fn(),
  };
}

function createDefaultConfig(): CodexSdkAgentConfig {
  return {
    kind: "codex_sdk",
    model: "codex-1",
  };
}

describe("Codex SDK Integration", () => {
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = createMockLogger();
    vi.clearAllMocks();
    // Reset the mock implementations
    mockStartThread.mockResolvedValue(mockThread);
  });

  describe("successful execution", () => {
    it("returns success with text result", async () => {
      mockRun.mockResolvedValue({ text: "Task completed successfully" });

      const result = await runCodexSdkAgent({
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

    it("returns success with content result", async () => {
      mockRun.mockResolvedValue({ content: "Content from agent" });

      const result = await runCodexSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
      });

      expect(result.success).toBe(true);
      expect(result.output).toBe("Content from agent");
      expect(result.exitCode).toBe(0);
    });

    it("passes prompt to thread.run", async () => {
      mockRun.mockResolvedValue({ text: "done" });

      await runCodexSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "My specific test prompt",
        logger: mockLogger,
      });

      expect(mockRun).toHaveBeenCalledWith("My specific test prompt");
    });

    it("calls stdout callback with output", async () => {
      mockRun.mockResolvedValue({ text: "Agent output here" });

      const stdoutChunks: string[] = [];

      await runCodexSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
        onStdoutChunk: (chunk) => stdoutChunks.push(chunk),
      });

      expect(stdoutChunks.length).toBe(1);
      expect(stdoutChunks[0]).toBe("Agent output here");
    });

    it("handles empty text response", async () => {
      mockRun.mockResolvedValue({ text: "" });

      const result = await runCodexSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
      });

      expect(result.success).toBe(true);
      expect(result.output).toBe("");
    });
  });

  describe("error handling", () => {
    it("handles SDK errors", async () => {
      mockRun.mockRejectedValue(new Error("SDK execution failed"));

      const result = await runCodexSdkAgent({
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

    it("handles thread creation errors", async () => {
      mockStartThread.mockRejectedValue(new Error("Failed to start thread"));

      const result = await runCodexSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
      });

      expect(result.success).toBe(false);
      expect(result.output).toContain("Failed to start thread");
      expect(result.exitCode).toBe(1);
    });

    it("handles network errors", async () => {
      mockRun.mockRejectedValue(new Error("ECONNREFUSED: Connection refused"));

      const result = await runCodexSdkAgent({
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
      mockRun.mockRejectedValue("String error");

      const result = await runCodexSdkAgent({
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
      const result = await runCodexSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain("[dry-run]");
      expect(MockCodex).not.toHaveBeenCalled();
    });

    it("logs tool restrictions in dry run", async () => {
      await runCodexSdkAgent({
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

  describe("client initialization", () => {
    it("creates Codex client with API key from env", async () => {
      mockRun.mockResolvedValue({ text: "done" });

      await runCodexSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test",
        logger: mockLogger,
      });

      expect(MockCodex).toHaveBeenCalled();
    });

    it("starts a thread before running", async () => {
      mockRun.mockResolvedValue({ text: "done" });

      await runCodexSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test",
        logger: mockLogger,
      });

      expect(mockStartThread).toHaveBeenCalled();
    });
  });

  describe("logging", () => {
    it("logs execution start", async () => {
      mockRun.mockResolvedValue({ text: "done" });

      await runCodexSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test",
        logger: mockLogger,
      });

      expect(mockLogger.info).toHaveBeenCalledWith("Executing Codex SDK...");
    });

    it("logs errors on failure", async () => {
      mockRun.mockRejectedValue(new Error("Test error"));

      await runCodexSdkAgent({
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
