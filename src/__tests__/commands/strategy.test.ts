import { describe, expect, it, beforeEach, afterEach, mock } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { strategyCommand } from "../../commands/strategy";
import type { Logger } from "../../logging";

// Mock logger
const createMockLogger = (): Logger => ({
  info: mock(() => {}),
  warn: mock(() => {}),
  error: mock(() => {}),
  debug: mock(() => {}),
});

async function setupTestRepo(tempDir: string): Promise<void> {
  // Create .git directory
  await fs.mkdir(path.join(tempDir, ".git"), { recursive: true });

  // Create .wreckit directory with config
  const wreckitDir = path.join(tempDir, ".wreckit");
  await fs.mkdir(wreckitDir, { recursive: true });
  await fs.mkdir(path.join(wreckitDir, "items"), { recursive: true });

  // Write minimal config
  const config = {
    schema_version: 1,
    base_branch: "main",
    branch_prefix: "wreckit/",
    merge_mode: "pr",
    agent: {
      kind: "claude_sdk",
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
    },
    max_iterations: 100,
    timeout_seconds: 3600,
  };
  await fs.writeFile(
    path.join(wreckitDir, "config.json"),
    JSON.stringify(config, null, 2)
  );
}

describe("strategyCommand", () => {
  let tempDir: string;
  let logger: Logger;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-strategy-test-"));
    await setupTestRepo(tempDir);
    logger = createMockLogger();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("in dry-run mode, doesn't create ROADMAP.md", async () => {
    await strategyCommand(
      {
        dryRun: true,
        cwd: tempDir,
      },
      logger
    );

    const roadmapPath = path.join(tempDir, "ROADMAP.md");
    const exists = await fs.access(roadmapPath).then(() => true).catch(() => false);
    expect(exists).toBe(false);

    // Should have logged dry-run info
    expect(logger.info).toHaveBeenCalled();
  });

  it("skips when ROADMAP.md exists without --force", async () => {
    // Create existing ROADMAP.md
    const roadmapPath = path.join(tempDir, "ROADMAP.md");
    await fs.writeFile(roadmapPath, "# Existing Roadmap\n");

    await strategyCommand(
      {
        cwd: tempDir,
      },
      logger
    );

    // Should have logged skip message
    const infoCalls = (logger.info as any).mock.calls;
    const hasSkipMessage = infoCalls.some((call: string[]) =>
      call[0].includes("ROADMAP.md already exists")
    );
    expect(hasSkipMessage).toBe(true);
  });

  it("accepts --analyze-dirs option", async () => {
    await strategyCommand(
      {
        dryRun: true,
        cwd: tempDir,
        analyzeDirs: ["src", "lib", "tests"],
      },
      logger
    );

    // Should have logged the analyze dirs
    const infoCalls = (logger.info as any).mock.calls;
    const hasAnalyzeDirs = infoCalls.some(
      (call: string[]) =>
        call[0].includes("src") &&
        call[0].includes("lib") &&
        call[0].includes("tests")
    );
    expect(hasAnalyzeDirs).toBe(true);
  });

  // Note: Full agent integration test would require mocking the agent runner
  // which is complex. The dry-run and skip tests cover the command logic.
});
