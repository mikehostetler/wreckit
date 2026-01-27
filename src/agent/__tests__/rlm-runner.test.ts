import { describe, it, expect, mock, beforeEach } from "bun:test";
import { runRlmAgent } from "../rlm-runner";
import type { RlmSdkAgentConfig } from "../../schemas";
import { createLogger } from "../../logging";

// Mocks
const mockStreamingForward = mock(async function* () {
  yield "Thought: Thinking...\n";
  yield "Action: Read\n";
  yield "Result: Content\n";
});

mock.module("@ax-llm/ax", () => ({
  AxAgent: class {
    constructor() {}
    streamingForward = mockStreamingForward;
  },
  AxAIAnthropic: class {},
  AxAIOpenAI: class {},
  AxAIGoogleGemini: class {},
}));

const logger = createLogger({ verbose: false });

describe("runRlmAgent", () => {
  beforeEach(() => {
    mockStreamingForward.mockClear();
  });

  const config: RlmSdkAgentConfig = {
    kind: "rlm",
    model: "claude-sonnet-4-20250514",
    maxIterations: 10,
    aiProvider: "anthropic",
  };

  it("handles dry-run mode", async () => {
    const result = await runRlmAgent({
      config,
      cwd: "/tmp",
      prompt: "test",
      logger,
      dryRun: true,
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain("[dry-run]");
    expect(mockStreamingForward).not.toHaveBeenCalled();
  });

  it("handles zai provider configuration", async () => {
    // Mock environment for this test
    const originalEnv = process.env;
    process.env = { ...originalEnv, ZAI_API_KEY: "test-zai-key" };

    const zaiConfig: RlmSdkAgentConfig = {
      kind: "rlm",
      model: "claude-sonnet-4-20250514",
      maxIterations: 10,
      aiProvider: "zai",
    };

    const result = await runRlmAgent({
      config: zaiConfig,
      cwd: "/tmp",
      prompt: "test",
      logger,
      dryRun: true, // We only test config setup here, dry-run avoids actual execution
    });

    expect(result.success).toBe(true);
    // Verify environment setup in a real unit test would require mocking buildAxAIEnv
    // For now we just ensure it doesn't crash
    
    process.env = originalEnv;
  });

  // Note: Testing full execution requires mocking environment variables which is tricky in parallel tests
  // We'll rely on integration tests for full flow.
});
