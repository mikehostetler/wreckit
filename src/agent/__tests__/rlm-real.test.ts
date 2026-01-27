
import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { runRlmAgent } from "../rlm-runner";
import { buildAxAIEnv } from "../env";
import { createLogger } from "../../logging";
import type { RlmSdkAgentConfig } from "../../schemas";

const logger = createLogger({ verbose: true });

describe("RLM Real Architecture Verification", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-rlm-real-"));
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should access offloaded context via RunJS tool (Real Execution)", async () => {
    // Detect environment using the real tool
    const env = await buildAxAIEnv({ cwd: process.cwd(), logger, provider: "zai" });
    
    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.log("Skipping: No API key found in env or settings.");
      return;
    }

    // 1. The "Hidden" Prompt
    const secretCode = `CODE_${Date.now()}`;
    const hiddenPrompt = `The secret code is "${secretCode}". Create a file named 'secret.txt' containing ONLY this code.`;
    
    // 2. Config
    const config: RlmSdkAgentConfig = {
      kind: "rlm",
      model: "claude-3-haiku-20240307", // Fast model
      maxIterations: 10,
      aiProvider: "zai",
    };

    console.log(`Running RLM test with Z.AI (Base: ${env.ANTHROPIC_BASE_URL})`);

    // 3. Run the Agent
    const result = await runRlmAgent({
      config,
      cwd: tempDir,
      prompt: hiddenPrompt,
      logger,
      allowedTools: ["RunJS", "Write"], 
    });

    // 4. Verification
    expect(result.success).toBe(true);

    const secretFile = path.join(tempDir, "secret.txt");
    const content = await fs.readFile(secretFile, "utf-8");
    expect(content.trim()).toBe(secretCode);
    
    console.log("Verification Success: Agent read offloaded context and performed task.");
  }, 60000);

  it("should read CONTEXT_DATA and output 'I SEE YOU' message", async () => {
    // Detect environment using the real tool
    const env = await buildAxAIEnv({ cwd: process.cwd(), logger, provider: "zai" });

    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.log("Skipping: No API key found in env or settings.");
      return;
    }

    // 1. Prompt stored in CONTEXT_DATA (not sent to model directly)
    const secretMessage = "I SEE YOU";
    const hiddenPrompt = `Read the global variable CONTEXT_DATA and output exactly "${secretMessage}" as your final answer.`;

    // 2. Config - use fast model for quick execution
    const config: RlmSdkAgentConfig = {
      kind: "rlm",
      model: "claude-3-haiku-20240307",
      maxIterations: 10,
      aiProvider: "zai",
    };

    console.log(`Running RLM context self-read verification with Z.AI (Base: ${env.ANTHROPIC_BASE_URL})`);

    // 3. Run the Agent with ONLY RunJS tool to force context reading
    const result = await runRlmAgent({
      config,
      cwd: tempDir,
      prompt: hiddenPrompt,
      logger,
      allowedTools: ["RunJS"], // Only tool available is RunJS
    });

    // 4. Verification - check agent's output contains the message
    expect(result.success).toBe(true);
    expect(result.output).toContain(secretMessage);

    console.log(`✓ Agent successfully read CONTEXT_DATA and confirmed with '${secretMessage}'`);
  }, 60000);
});