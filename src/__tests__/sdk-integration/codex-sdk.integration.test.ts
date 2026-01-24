/**
 * Integration tests for Codex SDK runner.
 *
 * These tests mock the @anthropic-ai/claude-agent-sdk module to test:
 * - Message formatting (formatSdkMessage)
 * - Event emission (emitAgentEventsFromSdkMessage)
 * - Error handling (handleSdkError)
 * - Timeout/abort handling
 * - stdout/stderr callback routing
 *
 * No API credentials required - all SDK calls are mocked.
 */
import { describe, it, expect, mock, beforeEach, vi } from "bun:test";
import type { Logger } from "../../logging";
import type { CodexSdkAgentConfig } from "../../schemas";
import type { AgentEvent } from "../../tui/agentEvents";

// Mock SDK message types for testing
interface MockSdkMessage {
  type: "assistant" | "tool_result" | "result" | "error";
  message?: { content: any[] };
  content?: any[];
  result?: string;
  tool_use_id?: string;
  subtype?: string;
}

// Create async generator for mock SDK query
function createMockQuery(messages: MockSdkMessage[]) {
  return async function* mockQuery(_opts: any): AsyncGenerator<MockSdkMessage> {
    for (const msg of messages) {
      yield msg;
    }
  };
}

// Mock the SDK module before importing the runner
const mockedQuery = vi.fn();

mock.module("@anthropic-ai/claude-agent-sdk", () => ({
  query: mockedQuery,
}));

// Mock buildSdkEnv to avoid filesystem access
mock.module("../../agent/env.js", () => ({
  buildSdkEnv: vi.fn(() => Promise.resolve({})),
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
  };
}

describe("Codex SDK Integration", () => {
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = createMockLogger();
    vi.clearAllMocks();
  });

  describe("message formatting", () => {
    it("formats assistant text messages correctly", async () => {
      const messages: MockSdkMessage[] = [
        {
          type: "assistant",
          message: {
            content: [{ type: "text", text: "Hello, I am Codex." }],
          },
        },
        { type: "result", result: "Task completed" },
      ];

      mockedQuery.mockImplementation(createMockQuery(messages));

      const result = await runCodexSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain("Hello, I am Codex.");
    });

    it("formats assistant tool_use messages correctly", async () => {
      const messages: MockSdkMessage[] = [
        {
          type: "assistant",
          message: {
            content: [
              {
                type: "tool_use",
                id: "tool-123",
                name: "Read",
                input: { file_path: "/test.txt" },
              },
            ],
          },
        },
        { type: "result", result: "Done" },
      ];

      mockedQuery.mockImplementation(createMockQuery(messages));

      const result = await runCodexSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain("```tool");
      expect(result.output).toContain("Read");
      expect(result.output).toContain("/test.txt");
    });

    it("formats tool_result messages correctly", async () => {
      const messages: MockSdkMessage[] = [
        {
          type: "tool_result",
          result: "File contents here",
          tool_use_id: "tool-123",
        },
        { type: "result", result: "Done" },
      ];

      mockedQuery.mockImplementation(createMockQuery(messages));

      const result = await runCodexSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain("```result");
      expect(result.output).toContain("File contents here");
    });

    it("formats result messages correctly", async () => {
      const messages: MockSdkMessage[] = [
        { type: "result", result: "Final output text" },
      ];

      mockedQuery.mockImplementation(createMockQuery(messages));

      const result = await runCodexSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain("Final output text");
    });

    it("formats error messages correctly", async () => {
      const messages: MockSdkMessage[] = [
        { type: "error", message: "Something went wrong" } as any,
        { type: "result", result: "" },
      ];

      mockedQuery.mockImplementation(createMockQuery(messages));

      const result = await runCodexSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain("Error:");
      expect(result.output).toContain("Something went wrong");
    });
  });

  describe("event emission", () => {
    it("emits assistant_text events for text blocks", async () => {
      const messages: MockSdkMessage[] = [
        {
          type: "assistant",
          message: {
            content: [{ type: "text", text: "Hello world" }],
          },
        },
        { type: "result", result: "" },
      ];

      mockedQuery.mockImplementation(createMockQuery(messages));

      const emittedEvents: AgentEvent[] = [];

      await runCodexSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
        onAgentEvent: (event) => emittedEvents.push(event),
      });

      const textEvents = emittedEvents.filter((e) => e.type === "assistant_text");
      expect(textEvents.length).toBe(1);
      expect(textEvents[0]).toEqual({ type: "assistant_text", text: "Hello world" });
    });

    it("emits tool_started events for tool_use blocks", async () => {
      const messages: MockSdkMessage[] = [
        {
          type: "assistant",
          message: {
            content: [
              {
                type: "tool_use",
                id: "tool-456",
                name: "Bash",
                input: { command: "ls -la" },
              },
            ],
          },
        },
        { type: "result", result: "" },
      ];

      mockedQuery.mockImplementation(createMockQuery(messages));

      const emittedEvents: AgentEvent[] = [];

      await runCodexSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
        onAgentEvent: (event) => emittedEvents.push(event),
      });

      const toolStartedEvents = emittedEvents.filter((e) => e.type === "tool_started");
      expect(toolStartedEvents.length).toBe(1);
      expect(toolStartedEvents[0]).toEqual({
        type: "tool_started",
        toolUseId: "tool-456",
        toolName: "Bash",
        input: { command: "ls -la" },
      });
    });

    it("emits tool_result events", async () => {
      const messages: MockSdkMessage[] = [
        {
          type: "tool_result",
          result: "command output",
          tool_use_id: "tool-789",
        },
        { type: "result", result: "" },
      ];

      mockedQuery.mockImplementation(createMockQuery(messages));

      const emittedEvents: AgentEvent[] = [];

      await runCodexSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
        onAgentEvent: (event) => emittedEvents.push(event),
      });

      const resultEvents = emittedEvents.filter((e) => e.type === "tool_result");
      expect(resultEvents.length).toBe(1);
      expect(resultEvents[0]).toEqual({
        type: "tool_result",
        toolUseId: "tool-789",
        result: "command output",
      });
    });

    it("emits run_result events", async () => {
      const messages: MockSdkMessage[] = [
        { type: "result", result: "completed", subtype: "success" },
      ];

      mockedQuery.mockImplementation(createMockQuery(messages));

      const emittedEvents: AgentEvent[] = [];

      await runCodexSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
        onAgentEvent: (event) => emittedEvents.push(event),
      });

      const runResultEvents = emittedEvents.filter((e) => e.type === "run_result");
      expect(runResultEvents.length).toBe(1);
      expect(runResultEvents[0]).toEqual({ type: "run_result", subtype: "success" });
    });

    it("emits error events", async () => {
      const messages: MockSdkMessage[] = [
        { type: "error", message: "Test error message" } as any,
        { type: "result", result: "" },
      ];

      mockedQuery.mockImplementation(createMockQuery(messages));

      const emittedEvents: AgentEvent[] = [];

      await runCodexSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
        onAgentEvent: (event) => emittedEvents.push(event),
      });

      const errorEvents = emittedEvents.filter((e) => e.type === "error");
      expect(errorEvents.length).toBe(1);
      expect(errorEvents[0]).toEqual({ type: "error", message: "Test error message" });
    });
  });

  describe("error handling", () => {
    it("handles authentication errors with helpful message", async () => {
      mockedQuery.mockImplementation(() => {
        throw new Error("Invalid API key provided");
      });

      const result = await runCodexSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
      });

      expect(result.success).toBe(false);
      expect(result.output).toContain("Authentication Error");
      expect(result.output).toContain("Codex SDK");
      expect(result.output).toContain("wreckit sdk-info");
    });

    it("handles 401 errors as authentication errors", async () => {
      mockedQuery.mockImplementation(() => {
        throw new Error("Request failed with status 401");
      });

      const result = await runCodexSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
      });

      expect(result.success).toBe(false);
      expect(result.output).toContain("Authentication Error");
    });

    it("handles rate limit errors", async () => {
      mockedQuery.mockImplementation(() => {
        throw new Error("rate limit exceeded");
      });

      const result = await runCodexSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
      });

      expect(result.success).toBe(false);
      expect(result.output).toContain("Rate limit exceeded");
      expect(result.output).toContain("try again later");
    });

    it("handles 429 errors as rate limit errors", async () => {
      mockedQuery.mockImplementation(() => {
        throw new Error("Request failed with status 429");
      });

      const result = await runCodexSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
      });

      expect(result.success).toBe(false);
      expect(result.output).toContain("Rate limit exceeded");
    });

    it("handles context window errors", async () => {
      mockedQuery.mockImplementation(() => {
        throw new Error("context length exceeded maximum");
      });

      const result = await runCodexSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
      });

      expect(result.success).toBe(false);
      expect(result.output).toContain("Context error");
      expect(result.output).toContain("smaller pieces");
    });

    it("handles token limit errors as context errors", async () => {
      mockedQuery.mockImplementation(() => {
        throw new Error("Request too large: too many tokens");
      });

      const result = await runCodexSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
      });

      expect(result.success).toBe(false);
      expect(result.output).toContain("Context error");
    });

    it("handles network errors", async () => {
      mockedQuery.mockImplementation(() => {
        throw new Error("ECONNREFUSED: Connection refused");
      });

      const result = await runCodexSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
      });

      expect(result.success).toBe(false);
      expect(result.output).toContain("Network error");
      expect(result.output).toContain("internet connection");
    });

    it("handles DNS errors as network errors", async () => {
      mockedQuery.mockImplementation(() => {
        throw new Error("ENOTFOUND: getaddrinfo failed");
      });

      const result = await runCodexSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
      });

      expect(result.success).toBe(false);
      expect(result.output).toContain("Network error");
    });

    it("handles generic errors with error message", async () => {
      mockedQuery.mockImplementation(() => {
        throw new Error("Unexpected server error");
      });

      const result = await runCodexSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
      });

      expect(result.success).toBe(false);
      expect(result.output).toContain("Error:");
      expect(result.output).toContain("Unexpected server error");
      expect(result.exitCode).toBe(1);
    });
  });

  describe("stdout/stderr callback routing", () => {
    it("calls stdout callback for non-error messages", async () => {
      const messages: MockSdkMessage[] = [
        {
          type: "assistant",
          message: {
            content: [{ type: "text", text: "Normal message" }],
          },
        },
        { type: "result", result: "" },
      ];

      mockedQuery.mockImplementation(createMockQuery(messages));

      const stdoutChunks: string[] = [];
      const stderrChunks: string[] = [];

      await runCodexSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
        onStdoutChunk: (chunk) => stdoutChunks.push(chunk),
        onStderrChunk: (chunk) => stderrChunks.push(chunk),
      });

      expect(stdoutChunks.length).toBeGreaterThan(0);
      expect(stdoutChunks.join("")).toContain("Normal message");
      // Error messages not present, so stderr should be empty
      const stderrContent = stderrChunks.join("");
      expect(stderrContent).not.toContain("Normal message");
    });

    it("calls stderr callback for error messages", async () => {
      const messages: MockSdkMessage[] = [
        { type: "error", message: "Error occurred" } as any,
        { type: "result", result: "" },
      ];

      mockedQuery.mockImplementation(createMockQuery(messages));

      const stdoutChunks: string[] = [];
      const stderrChunks: string[] = [];

      await runCodexSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
        onStdoutChunk: (chunk) => stdoutChunks.push(chunk),
        onStderrChunk: (chunk) => stderrChunks.push(chunk),
      });

      expect(stderrChunks.length).toBeGreaterThan(0);
      expect(stderrChunks.join("")).toContain("Error occurred");
    });
  });

  describe("successful completion", () => {
    it("returns success with accumulated output", async () => {
      const messages: MockSdkMessage[] = [
        {
          type: "assistant",
          message: {
            content: [{ type: "text", text: "Step 1 complete. " }],
          },
        },
        {
          type: "assistant",
          message: {
            content: [{ type: "text", text: "Step 2 complete." }],
          },
        },
        { type: "result", result: "All done!" },
      ];

      mockedQuery.mockImplementation(createMockQuery(messages));

      const result = await runCodexSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
      });

      expect(result.success).toBe(true);
      expect(result.timedOut).toBe(false);
      expect(result.exitCode).toBe(0);
      expect(result.completionDetected).toBe(true);
      expect(result.output).toContain("Step 1 complete");
      expect(result.output).toContain("Step 2 complete");
      expect(result.output).toContain("All done!");
    });

    it("passes prompt to SDK query", async () => {
      const messages: MockSdkMessage[] = [{ type: "result", result: "done" }];

      mockedQuery.mockImplementation(createMockQuery(messages));

      await runCodexSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "My specific test prompt",
        logger: mockLogger,
      });

      expect(mockedQuery).toHaveBeenCalled();
      const callArgs = mockedQuery.mock.calls[0][0];
      expect(callArgs.prompt).toBe("My specific test prompt");
    });

    it("passes cwd to SDK options", async () => {
      const messages: MockSdkMessage[] = [{ type: "result", result: "done" }];

      mockedQuery.mockImplementation(createMockQuery(messages));

      await runCodexSdkAgent({
        config: createDefaultConfig(),
        cwd: "/custom/working/dir",
        prompt: "test",
        logger: mockLogger,
      });

      expect(mockedQuery).toHaveBeenCalled();
      const callArgs = mockedQuery.mock.calls[0][0];
      expect(callArgs.options.cwd).toBe("/custom/working/dir");
    });
  });

  describe("SDK options", () => {
    it("passes mcpServers option to SDK", async () => {
      const messages: MockSdkMessage[] = [{ type: "result", result: "done" }];

      mockedQuery.mockImplementation(createMockQuery(messages));

      const mcpServers = {
        wreckit: { command: "node", args: ["server.js"] },
      };

      await runCodexSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test",
        logger: mockLogger,
        mcpServers,
      });

      const callArgs = mockedQuery.mock.calls[0][0];
      expect(callArgs.options.mcpServers).toEqual(mcpServers);
    });

    it("passes tools option when allowedTools specified", async () => {
      const messages: MockSdkMessage[] = [{ type: "result", result: "done" }];

      mockedQuery.mockImplementation(createMockQuery(messages));

      await runCodexSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test",
        logger: mockLogger,
        allowedTools: ["Read", "Glob"],
      });

      const callArgs = mockedQuery.mock.calls[0][0];
      expect(callArgs.options.tools).toEqual(["Read", "Glob"]);
    });

    it("sets bypassPermissions mode", async () => {
      const messages: MockSdkMessage[] = [{ type: "result", result: "done" }];

      mockedQuery.mockImplementation(createMockQuery(messages));

      await runCodexSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test",
        logger: mockLogger,
      });

      const callArgs = mockedQuery.mock.calls[0][0];
      expect(callArgs.options.permissionMode).toBe("bypassPermissions");
      expect(callArgs.options.allowDangerouslySkipPermissions).toBe(true);
    });
  });
});
