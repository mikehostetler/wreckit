import { describe, it, expect, beforeEach, afterEach, vi } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { runAgentUnion, type AgentConfigUnion, type UnionRunAgentOptions } from "../../agent";
import type { Logger } from "../../logging";

function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    json: vi.fn(),
  };
}

describe("--mock-agent edge cases (tests 19-22)", () => {
  let tempDir: string;
  let mockLogger: Logger;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "wreckit-mock-agent-test-"),
    );
    mockLogger = createMockLogger();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("Test 19: Basic mock-agent run", () => {
    it("logs simulation message, outputs emoji lines, and includes completion signal", async () => {
      const completionSignal = "<promise>COMPLETE</promise>";
      const config: AgentConfigUnion = {
        kind: "process",
        command: "some-agent",
        args: ["--flag"],
        completion_signal: completionSignal,
      };

      const stdoutChunks: string[] = [];
      const options: UnionRunAgentOptions = {
        config,
        cwd: tempDir,
        prompt: "test prompt",
        logger: mockLogger,
        mockAgent: true,
        onStdoutChunk: (chunk) => stdoutChunks.push(chunk),
      };

      const result = await runAgentUnion(options);

      // Should log the [mock-agent] simulation message
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("[mock-agent] Simulating"),
      );

      // Should succeed with completion detected
      expect(result.success).toBe(true);
      expect(result.completionDetected).toBe(true);
      expect(result.timedOut).toBe(false);
      expect(result.exitCode).toBe(0);

      // Output should contain emoji lines
      expect(result.output).toContain("🤖");
      expect(result.output).toContain("[mock-agent]");
      expect(result.output).toContain("✅");

      // Should include the completion signal in output
      expect(result.output).toContain(completionSignal);

      // Should have streamed output via onStdoutChunk
      expect(stdoutChunks.length).toBeGreaterThan(0);
      expect(stdoutChunks.join("")).toContain(completionSignal);
    });

    it("does NOT spawn a real process (invalid command succeeds with mock)", async () => {
      const config: AgentConfigUnion = {
        kind: "process",
        command: "nonexistent-binary-that-would-fail-xyz",
        args: [],
        completion_signal: "<promise>COMPLETE</promise>",
      };

      const options: UnionRunAgentOptions = {
        config,
        cwd: tempDir,
        prompt: "test prompt",
        logger: mockLogger,
        mockAgent: true,
      };

      const result = await runAgentUnion(options);

      // Should succeed because mock doesn't actually spawn the binary
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.completionDetected).toBe(true);
    });
  });

  describe("Test 20: --mock-agent with short timeout", () => {
    it("mock ignores timeout, completes normally", async () => {
      const config: AgentConfigUnion = {
        kind: "process",
        command: "any-agent",
        args: [],
        completion_signal: "<promise>COMPLETE</promise>",
      };

      const options: UnionRunAgentOptions = {
        config,
        cwd: tempDir,
        prompt: "test prompt",
        logger: mockLogger,
        mockAgent: true,
        timeoutSeconds: 1, // Very short timeout that would kill a real process
      };

      const result = await runAgentUnion(options);

      // Should complete normally despite short timeout
      expect(result.success).toBe(true);
      expect(result.timedOut).toBe(false);
      expect(result.completionDetected).toBe(true);
      expect(result.exitCode).toBe(0);

      // Should NOT have logged timeout warning
      expect(mockLogger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining("timed out"),
      );
    });

    it("mock completes with zero timeout setting", async () => {
      const config: AgentConfigUnion = {
        kind: "process",
        command: "any-agent",
        args: [],
        completion_signal: "<promise>COMPLETE</promise>",
      };

      const options: UnionRunAgentOptions = {
        config,
        cwd: tempDir,
        prompt: "test prompt",
        logger: mockLogger,
        mockAgent: true,
        timeoutSeconds: 0, // No timeout
      };

      const result = await runAgentUnion(options);

      expect(result.success).toBe(true);
      expect(result.timedOut).toBe(false);
    });
  });

  describe("Test 21: --mock-agent with --dry-run (precedence)", () => {
    it("dry-run takes precedence over mock-agent", async () => {
      const config: AgentConfigUnion = {
        kind: "process",
        command: "any-agent",
        args: ["--some-flag"],
        completion_signal: "<promise>COMPLETE</promise>",
      };

      const stdoutChunks: string[] = [];
      const options: UnionRunAgentOptions = {
        config,
        cwd: tempDir,
        prompt: "test prompt",
        logger: mockLogger,
        dryRun: true,
        mockAgent: true, // Both flags set
        onStdoutChunk: (chunk) => stdoutChunks.push(chunk),
      };

      const result = await runAgentUnion(options);

      // Should return dry-run output
      expect(result.success).toBe(true);
      expect(result.output).toBe("[dry-run] No output");

      // Should log dry-run messages
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("[dry-run]"),
      );

      // Should NOT log mock-agent messages (dry-run takes precedence)
      expect(mockLogger.info).not.toHaveBeenCalledWith(
        expect.stringContaining("[mock-agent]"),
      );

      // Should NOT stream any output (no mock simulation)
      expect(stdoutChunks.length).toBe(0);
    });

    it("dry-run output does not contain mock emoji lines", async () => {
      const config: AgentConfigUnion = {
        kind: "process",
        command: "any-agent",
        args: [],
        completion_signal: "<promise>COMPLETE</promise>",
      };

      const options: UnionRunAgentOptions = {
        config,
        cwd: tempDir,
        prompt: "test prompt",
        logger: mockLogger,
        dryRun: true,
        mockAgent: true,
      };

      const result = await runAgentUnion(options);

      // Output should NOT contain mock agent emoji lines
      expect(result.output).not.toContain("🤖");
      expect(result.output).not.toContain("📋");
      expect(result.output).not.toContain("✅");
    });
  });

  describe("Test 22: --mock-agent with invalid agent config", () => {
    it("uses mock, no attempt to spawn invalid binary", async () => {
      const config: AgentConfigUnion = {
        kind: "process",
        command: "/nonexistent/path/to/invalid/binary",
        args: ["--invalid-flag"],
        completion_signal: "<promise>COMPLETE</promise>",
      };

      const options: UnionRunAgentOptions = {
        config,
        cwd: tempDir,
        prompt: "test prompt",
        logger: mockLogger,
        mockAgent: true,
      };

      const result = await runAgentUnion(options);

      // Should succeed because mock bypasses real process spawn
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.completionDetected).toBe(true);

      // Should NOT have logged spawn failure
      expect(mockLogger.error).not.toHaveBeenCalledWith(
        expect.stringContaining("Failed to spawn"),
      );
      expect(mockLogger.error).not.toHaveBeenCalledWith(
        expect.stringContaining("process error"),
      );
    });

    it("handles config with empty command via mock", async () => {
      const config: AgentConfigUnion = {
        kind: "process",
        command: "",
        args: [],
        completion_signal: "<promise>COMPLETE</promise>",
      };

      const options: UnionRunAgentOptions = {
        config,
        cwd: tempDir,
        prompt: "test prompt",
        logger: mockLogger,
        mockAgent: true,
      };

      const result = await runAgentUnion(options);

      // Mock should still work regardless of empty command
      expect(result.success).toBe(true);
      expect(result.completionDetected).toBe(true);
    });

    it("handles config with special characters in command via mock", async () => {
      const config: AgentConfigUnion = {
        kind: "process",
        command: "agent with spaces & special chars!",
        args: ["--flag=value with spaces"],
        completion_signal: "<promise>COMPLETE</promise>",
      };

      const options: UnionRunAgentOptions = {
        config,
        cwd: tempDir,
        prompt: "test prompt",
        logger: mockLogger,
        mockAgent: true,
      };

      const result = await runAgentUnion(options);

      // Mock bypasses command validation issues
      expect(result.success).toBe(true);
    });
  });

  describe("Additional mock-agent behavior tests", () => {
    it("respects custom completion signal in mock output", async () => {
      const customSignal = "---CUSTOM_DONE_MARKER---";
      const config: AgentConfigUnion = {
        kind: "process",
        command: "agent",
        args: [],
        completion_signal: customSignal,
      };

      const options: UnionRunAgentOptions = {
        config,
        cwd: tempDir,
        prompt: "test prompt",
        logger: mockLogger,
        mockAgent: true,
        timeoutSeconds: 10,
      };

      const result = await runAgentUnion(options);

      expect(result.output).toContain(customSignal);
      expect(result.completionDetected).toBe(true);
    });

    it("calls onStdoutChunk for each simulated line", async () => {
      const config: AgentConfigUnion = {
        kind: "process",
        command: "agent",
        args: [],
        completion_signal: "<promise>COMPLETE</promise>",
      };

      const stdoutChunks: string[] = [];
      const options: UnionRunAgentOptions = {
        config,
        cwd: tempDir,
        prompt: "test prompt",
        logger: mockLogger,
        mockAgent: true,
        onStdoutChunk: (chunk) => stdoutChunks.push(chunk),
      };

      await runAgentUnion(options);

      // Should have multiple chunks (one per line)
      expect(stdoutChunks.length).toBeGreaterThanOrEqual(5);

      // Each chunk should end with newline
      stdoutChunks.forEach((chunk) => {
        expect(chunk.endsWith("\n")).toBe(true);
      });
    });

    it("does not call onStderrChunk in mock mode", async () => {
      const config: AgentConfigUnion = {
        kind: "process",
        command: "agent",
        args: [],
        completion_signal: "<promise>COMPLETE</promise>",
      };

      const stderrChunks: string[] = [];
      const options: UnionRunAgentOptions = {
        config,
        cwd: tempDir,
        prompt: "test prompt",
        logger: mockLogger,
        mockAgent: true,
        onStderrChunk: (chunk) => stderrChunks.push(chunk),
      };

      await runAgentUnion(options);

      // Mock agent should not produce stderr output
      expect(stderrChunks.length).toBe(0);
    });
  });
});
