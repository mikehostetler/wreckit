/**
 * Integration tests for OpenCode SDK runner.
 *
 * These tests mock the @opencode-ai/sdk module to test:
 * - Basic execution flow
 * - Error handling
 * - Dry run mode
 *
 * No API credentials required - all SDK calls are mocked.
 */
import { describe, it, expect, mock, beforeEach, vi } from "bun:test";
import type { Logger } from "../../logging";
import type { OpenCodeSdkAgentConfig } from "../../schemas";
import type { AgentEvent } from "../../tui/agentEvents";

// Create mock session with prompt method
const mockPrompt = vi.fn();
const mockSession = { prompt: mockPrompt };
const mockSessionCreate = vi.fn();
const mockClient = {
  session: { create: mockSessionCreate },
};

// Mock the SDK module before importing the runner
const mockCreateOpencodeClient = vi.fn().mockReturnValue(mockClient);

mock.module("@opencode-ai/sdk", () => ({
  createOpencodeClient: mockCreateOpencodeClient,
}));

// Mock buildSdkEnv to avoid filesystem access
mock.module("../../agent/env.js", () => ({
  buildSdkEnv: vi.fn(() =>
    Promise.resolve({ OPENCODE_BASE_URL: "https://api.opencode.test" }),
  ),
}));

// Mock the controller registration functions
mock.module("../../agent/runner.js", () => ({
  registerSdkController: vi.fn(),
  unregisterSdkController: vi.fn(),
}));

// Import after mocking
const { runOpenCodeSdkAgent } = await import("../../agent/opencode-sdk-runner");

function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    json: vi.fn(),
  };
}

function createDefaultConfig(): OpenCodeSdkAgentConfig {
  return {
    kind: "opencode_sdk",
  };
}

describe("OpenCode SDK Integration", () => {
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = createMockLogger();
    vi.clearAllMocks();
    // Reset the mock implementations
    mockSessionCreate.mockResolvedValue({ data: mockSession, error: null });
    mockPrompt.mockResolvedValue({ content: "Task completed" });
  });

  describe("successful execution", () => {
    it("returns success with content result", async () => {
      mockPrompt.mockResolvedValue({ content: "Task completed successfully" });

      const result = await runOpenCodeSdkAgent({
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

    it("returns success with string result", async () => {
      mockPrompt.mockResolvedValue("String response");

      const result = await runOpenCodeSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
      });

      expect(result.success).toBe(true);
      expect(result.output).toBe("String response");
      expect(result.exitCode).toBe(0);
    });

    it("passes prompt to session.prompt", async () => {
      mockPrompt.mockResolvedValue({ content: "done" });

      await runOpenCodeSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "My specific test prompt",
        logger: mockLogger,
      });

      expect(mockPrompt).toHaveBeenCalledWith(
        expect.objectContaining({ text: "My specific test prompt" }),
      );
    });

    it("passes allowedTools to session.prompt", async () => {
      mockPrompt.mockResolvedValue({ content: "done" });

      await runOpenCodeSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
        allowedTools: ["Read", "Glob"],
      });

      expect(mockPrompt).toHaveBeenCalledWith(
        expect.objectContaining({ tools: ["Read", "Glob"] }),
      );
    });

    it("calls stdout callback with output", async () => {
      mockPrompt.mockResolvedValue({ content: "Agent output here" });

      const stdoutChunks: string[] = [];

      await runOpenCodeSdkAgent({
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
    it("handles session creation errors", async () => {
      mockSessionCreate.mockResolvedValue({
        data: null,
        error: "Session failed",
      });

      const result = await runOpenCodeSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
      });

      expect(result.success).toBe(false);
      expect(result.output).toContain("Failed to create OpenCode session");
      expect(result.exitCode).toBe(1);
    });

    it("handles null session data", async () => {
      mockSessionCreate.mockResolvedValue({ data: null, error: null });

      const result = await runOpenCodeSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
      });

      expect(result.success).toBe(false);
      expect(result.output).toContain("session creation returned no data");
      expect(result.exitCode).toBe(1);
    });

    it("handles prompt execution errors", async () => {
      mockPrompt.mockRejectedValue(new Error("Prompt execution failed"));

      const result = await runOpenCodeSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
      });

      expect(result.success).toBe(false);
      expect(result.output).toContain("Error:");
      expect(result.output).toContain("Prompt execution failed");
      expect(result.exitCode).toBe(1);
    });

    it("handles network errors", async () => {
      mockSessionCreate.mockRejectedValue(
        new Error("ECONNREFUSED: Connection refused"),
      );

      const result = await runOpenCodeSdkAgent({
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
      mockPrompt.mockRejectedValue("String error");

      const result = await runOpenCodeSdkAgent({
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
      const result = await runOpenCodeSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain("[dry-run]");
      expect(mockCreateOpencodeClient).not.toHaveBeenCalled();
    });

    it("logs tool restrictions in dry run", async () => {
      await runOpenCodeSdkAgent({
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
    it("creates OpenCode client with base URL from env", async () => {
      mockPrompt.mockResolvedValue({ content: "done" });

      await runOpenCodeSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test",
        logger: mockLogger,
      });

      expect(mockCreateOpencodeClient).toHaveBeenCalledWith(
        expect.objectContaining({ baseUrl: "https://api.opencode.test" }),
      );
    });

    it("creates a session before prompting", async () => {
      mockPrompt.mockResolvedValue({ content: "done" });

      await runOpenCodeSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test",
        logger: mockLogger,
      });

      expect(mockSessionCreate).toHaveBeenCalled();
    });
  });

  describe("logging", () => {
    it("logs execution start", async () => {
      mockPrompt.mockResolvedValue({ content: "done" });

      await runOpenCodeSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test",
        logger: mockLogger,
      });

      expect(mockLogger.info).toHaveBeenCalledWith("Executing OpenCode SDK...");
    });

    it("logs errors on failure", async () => {
      mockPrompt.mockRejectedValue(new Error("Test error"));

      await runOpenCodeSdkAgent({
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
