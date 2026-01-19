import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { McpToolNotCalledError } from "../errors";
import { parseIdeasWithAgent } from "../domain/ideas-agent";
import { createLogger, type Logger } from "../logging";

function createMockLogger(): Logger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    json: () => {},
  };
}

/**
 * Helper to set up a temporary wreckit directory with required files
 */
async function setupWreckitDir(baseDir: string): Promise<void> {
  await fs.mkdir(path.join(baseDir, ".wreckit"), { recursive: true });
  await fs.mkdir(path.join(baseDir, ".wreckit", "prompts"), { recursive: true });
  await fs.writeFile(
    path.join(baseDir, ".wreckit", "prompts", "ideas.md"),
    "Extract ideas from: {{input}}"
  );
  await fs.writeFile(
    path.join(baseDir, ".wreckit", "config.json"),
    JSON.stringify({
      schema_version: 1,
      base_branch: "main",
      branch_prefix: "wreckit/",
      agent: {
        mode: "sdk",
        command: "claude",
        args: [],
        completion_signal: "<promise>COMPLETE</promise>",
      },
      max_iterations: 100,
      timeout_seconds: 3600,
    })
  );
}

describe("parseIdeasWithAgent - MCP Tool Requirement Enforcement", () => {
  let tempDir: string;
  let mockLogger: Logger;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-ideas-agent-test-"));
    await setupWreckitDir(tempDir);
    mockLogger = createLogger({ verbose: false });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("throws McpToolNotCalledError when mock agent does not call MCP tool", async () => {
    // This test verifies that the JSON fallback path is removed.
    // Mock agent doesn't call MCP tools, so it should trigger the error.
    const input = "Add dark mode support";

    await expect(
      parseIdeasWithAgent(input, tempDir, {
        verbose: false,
        mockAgent: true,
      })
    ).rejects.toThrow(McpToolNotCalledError);
  });

  it("provides clear error message explaining MCP tool requirement", async () => {
    const input = "Any input";

    try {
      await parseIdeasWithAgent(input, tempDir, { mockAgent: true });
      throw new Error("Expected McpToolNotCalledError but got none");
    } catch (error) {
      expect(error).toBeInstanceOf(McpToolNotCalledError);
      expect((error as McpToolNotCalledError).message).toContain("MCP tool");
      expect((error as McpToolNotCalledError).message).toContain("save_parsed_ideas");
      expect((error as McpToolNotCalledError).message).toContain("JSON fallback");
    }
  });

  it("error message mentions security reason for removing fallback", async () => {
    const input = "Test input";

    try {
      await parseIdeasWithAgent(input, tempDir, { mockAgent: true });
      throw new Error("Expected McpToolNotCalledError but got none");
    } catch (error) {
      expect(error).toBeInstanceOf(McpToolNotCalledError);
      const message = (error as McpToolNotCalledError).message.toLowerCase();
      expect(message).toMatch(/security|removed|fallback/);
    }
  });
});

describe("parseIdeasWithAgent - Security: No JSON Fallback", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-security-test-"));
    await setupWreckitDir(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("does not parse JSON from agent text output (Gap 1 mitigation)", async () => {
    // This test enforces Gap 1 mitigation from spec 001-ideas-ingestion.md:
    // "Consider requiring MCP tool call (no fallback)"
    const input = "Agent output with JSON array";

    await expect(
      parseIdeasWithAgent(input, tempDir, { mockAgent: true })
    ).rejects.toThrow(McpToolNotCalledError);
  });

  it("enforces structured extraction channel only", async () => {
    // Verify that the only valid path for idea extraction is through
    // the structured MCP tool call
    const input = "# Add feature\nDescription here";

    await expect(
      parseIdeasWithAgent(input, tempDir, { mockAgent: true })
    ).rejects.toThrow(McpToolNotCalledError);
  });

  it("fails with specific error code MCP_TOOL_NOT_CALLED", async () => {
    const input = "Test input";

    try {
      await parseIdeasWithAgent(input, tempDir, { mockAgent: true });
      throw new Error("Expected McpToolNotCalledError");
    } catch (error) {
      expect(error).toBeInstanceOf(McpToolNotCalledError);
      expect((error as McpToolNotCalledError).code).toBe("MCP_TOOL_NOT_CALLED");
    }
  });
});

