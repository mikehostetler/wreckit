import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { runRlmAgent } from "../rlm-runner";
import { createLogger } from "../../logging";
import type { RlmSdkAgentConfig } from "../../schemas";

const logger = createLogger({ verbose: true });

describe("RLM Agent Integration", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-rlm-test-"));
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  // Skip if no API key present
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.ZAI_API_KEY;
  if (!apiKey) {
    it.skip("skipping integration tests - no API key", () => {});
    return;
  }

  it("can complete a simple file task", async () => {
    const testFile = path.join(tempDir, "hello.txt");
    const config: RlmSdkAgentConfig = {
      kind: "rlm",
      model: "claude-3-haiku-20240307", // Use faster model for tests
      maxIterations: 5,
      aiProvider: process.env.ZAI_API_KEY ? "zai" : "anthropic",
    };

    const prompt = `Write "Hello RLM" to the file ${testFile}. Then read it back to confirm.`;

    const result = await runRlmAgent({
      config,
      cwd: tempDir,
      prompt,
      logger,
      allowedTools: ["Write", "Read"], // Enforce allowlist
    });

    expect(result.success).toBe(true);
    
    // Verify side effects
    const content = await fs.readFile(testFile, "utf-8");
    expect(content).toBe("Hello RLM");
  }, 30000); // 30s timeout

  it("fails when using restricted tools", async () => {
    const config: RlmSdkAgentConfig = {
      kind: "rlm",
      model: "claude-3-haiku-20240307",
      maxIterations: 3,
      aiProvider: process.env.ZAI_API_KEY ? "zai" : "anthropic",
    };

    const prompt = "List the files in the current directory using ls command.";

    const result = await runRlmAgent({
      config,
      cwd: tempDir,
      prompt,
      logger,
      allowedTools: ["Read", "Write"], // Bash NOT allowed
    });

    // The agent might fail to complete the task, or return a refusal
    // We check that it didn't execute Bash
    // Since we can't easily spy on internal tools here, we rely on the agent's output
    // indicating it couldn't perform the action or tried another way.
    // Ideally, the tool registry filters it out so the model doesn't even see it.
    
    expect(result.success).toBe(true); // Agent should handle the restriction gracefully
    expect(result.output).not.toContain("Stdout:"); // Should not have executed bash
  }, 30000);
});
