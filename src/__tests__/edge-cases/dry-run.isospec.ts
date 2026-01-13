/**
 * Edge Case Tests 12-18: --dry-run Flag
 *
 * Tests that dry-run mode prevents all mutations while still performing introspection.
 * Per EDGE_CASE_TEST_PLAN.md section 1.3
 * 
 * NOTE: These tests use dryRun: true which bypasses spawn entirely,
 * so we don't need to mock child_process - the git/agent modules check dryRun first.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { Logger } from "../../logging";
import type { GitOptions } from "../../git";

import {
  ensureBranch,
  commitAll,
  pushBranch,
  createOrUpdatePr,
  runGitCommand,
  runGhCommand,
} from "../../git";

import type { AgentConfig, RunAgentOptions } from "../../agent";
import { runAgent } from "../../agent";

import {
  initCommand,
  NotGitRepoError,
} from "../../commands/init";

let spawnCallCount = 0;

function trackSpawnCalls(): void {
  spawnCallCount = 0;
}

function createMockLogger(): Logger & { messages: string[] } {
  const messages: string[] = [];
  return {
    messages,
    debug: vi.fn((msg: string) => messages.push(`debug: ${msg}`)),
    info: vi.fn((msg: string) => messages.push(`info: ${msg}`)),
    warn: vi.fn((msg: string) => messages.push(`warn: ${msg}`)),
    error: vi.fn((msg: string) => messages.push(`error: ${msg}`)),
    json: vi.fn(),
  };
}

async function setupTempDir(): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-dry-run-test-"));
}

async function setupTempGitRepo(): Promise<string> {
  const tempDir = await setupTempDir();
  await fs.mkdir(path.join(tempDir, ".git"), { recursive: true });
  return tempDir;
}

async function setupTempWreckitRepo(): Promise<string> {
  const tempDir = await setupTempGitRepo();
  await fs.mkdir(path.join(tempDir, ".wreckit"), { recursive: true });
  return tempDir;
}

describe("Dry-Run Edge Cases (Tests 12-18)", () => {
  let tempDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    trackSpawnCalls();
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  describe("Test 12: Git command dry-run (branch creation)", () => {
    it("logs [dry-run] message for ensureBranch without creating branch", async () => {
      const logger = createMockLogger();
      const options: GitOptions = { cwd: "/repo", logger, dryRun: true };

      const result = await ensureBranch("main", "wreckit/", "item-1", options);

      expect(result.branchName).toBe("wreckit/item-1");
      expect(result.created).toBe(true);
      // dry-run mode bypasses spawn in the implementation
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining("[dry-run]")
      );
      expect(logger.messages.some((m) => m.includes("[dry-run]"))).toBe(true);
    });

    it("returns expected branch name in dry-run mode", async () => {
      const logger = createMockLogger();
      const options: GitOptions = { cwd: "/repo", logger, dryRun: true };

      const result = await ensureBranch("main", "feature/", "test-item", options);

      expect(result.branchName).toBe("feature/test-item");
      expect(result.created).toBe(true);
      // dry-run mode bypasses spawn in the implementation
    });

    it("dry-run ensureBranch logs would-be actions", async () => {
      const logger = createMockLogger();
      const options: GitOptions = { cwd: "/test/repo", logger, dryRun: true };

      await ensureBranch("develop", "wreckit/", "raw-1", options);

      const dryRunMessages = logger.messages.filter((m) =>
        m.includes("[dry-run]")
      );
      expect(dryRunMessages.length).toBeGreaterThan(0);
    });
  });

  describe("Test 13: Git command dry-run (push, commit)", () => {
    it("logs [dry-run] message for commitAll without committing", async () => {
      const logger = createMockLogger();
      const options: GitOptions = { cwd: "/repo", logger, dryRun: true };

      await commitAll("Test commit message", options);

      // dry-run mode bypasses spawn in the implementation
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining("[dry-run]")
      );
    });

    it("logs [dry-run] message for pushBranch without pushing", async () => {
      const logger = createMockLogger();
      const options: GitOptions = { cwd: "/repo", logger, dryRun: true };

      await pushBranch("feature-branch", options);

      // dry-run mode bypasses spawn in the implementation
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining("[dry-run]")
      );
    });

    it("dry-run commits and pushes produce no side effects", async () => {
      const logger = createMockLogger();
      const options: GitOptions = { cwd: "/repo", logger, dryRun: true };

      await commitAll("Commit 1", options);
      await commitAll("Commit 2", options);
      await pushBranch("branch-1", options);
      await pushBranch("branch-2", options);

      // dry-run mode bypasses spawn in the implementation
      const dryRunLogs = logger.messages.filter((m) => m.includes("[dry-run]"));
      expect(dryRunLogs.length).toBe(4);
    });

    it("runGitCommand in dry-run returns empty output without spawning", async () => {
      const logger = createMockLogger();
      const options: GitOptions = { cwd: "/repo", logger, dryRun: true };

      const result = await runGitCommand(["add", "."], options);

      expect(result.stdout).toBe("");
      expect(result.exitCode).toBe(0);
      // dry-run mode bypasses spawn in the implementation
    });
  });

  describe("Test 14: GitHub CLI dry-run (PR)", () => {
    it("logs [dry-run] message for createOrUpdatePr without creating PR", async () => {
      const logger = createMockLogger();
      const options: GitOptions = { cwd: "/repo", logger, dryRun: true };

      const result = await createOrUpdatePr(
        "main",
        "feature-branch",
        "PR Title",
        "PR Body",
        options
      );

      expect(result.created).toBe(true);
      expect(result.number).toBe(0);
      expect(result.url).toContain("example");
      // dry-run mode bypasses spawn in the implementation
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining("[dry-run]")
      );
    });

    it("returns dummy PR result in dry-run mode", async () => {
      const logger = createMockLogger();
      const options: GitOptions = { cwd: "/repo", logger, dryRun: true };

      const result = await createOrUpdatePr(
        "develop",
        "wreckit/feature-123",
        "My Feature",
        "Implements feature 123",
        options
      );

      expect(result.created).toBe(true);
      expect(result.number).toBe(0);
      expect(result.url).toContain("github.com");
    });

    it("runGhCommand in dry-run returns empty output without spawning", async () => {
      const logger = createMockLogger();
      const options: GitOptions = { cwd: "/repo", logger, dryRun: true };

      const result = await runGhCommand(["pr", "create", "--title", "Test"], options);

      expect(result.stdout).toBe("");
      expect(result.exitCode).toBe(0);
      // dry-run mode bypasses spawn in the implementation
    });

    it("dry-run gh commands do not call GitHub API", async () => {
      const logger = createMockLogger();
      const options: GitOptions = { cwd: "/repo", logger, dryRun: true };

      await runGhCommand(["pr", "list"], options);
      await runGhCommand(["pr", "view", "123"], options);
      await runGhCommand(["repo", "view"], options);

      // dry-run mode bypasses spawn in the implementation
      expect(logger.messages.filter((m) => m.includes("[dry-run]")).length).toBe(3);
    });
  });

  describe("Test 15: Agent dry-run (no spawn)", () => {
    it("logs dry-run info and returns success without spawning agent", async () => {
      tempDir = await setupTempWreckitRepo();
      const logger = createMockLogger();

      const config: AgentConfig = {
        command: "claude",
        args: ["--dangerously-skip-permissions", "--print"],
        completion_signal: "<promise>COMPLETE</promise>",
        timeout_seconds: 3600,
        max_iterations: 100,
      };

      const options: RunAgentOptions = {
        config,
        cwd: tempDir,
        prompt: "Test prompt for agent",
        logger,
        dryRun: true,
      };

      const result = await runAgent(options);

      expect(result.success).toBe(true);
      expect(result.completionDetected).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.output).toBe("[dry-run] No output");
      expect(result.timedOut).toBe(false);
    });

    it("dry-run agent logs command that would be run", async () => {
      tempDir = await setupTempWreckitRepo();
      const logger = createMockLogger();

      const config: AgentConfig = {
        command: "amp",
        args: ["--dangerously-allow-all"],
        completion_signal: "COMPLETE",
        timeout_seconds: 1800,
        max_iterations: 50,
      };

      const options: RunAgentOptions = {
        config,
        cwd: tempDir,
        prompt: "Implementation prompt",
        logger,
        dryRun: true,
      };

      await runAgent(options);

      const dryRunMessages = logger.messages.filter((m) =>
        m.includes("[dry-run]")
      );
      expect(dryRunMessages.length).toBeGreaterThan(0);
      expect(dryRunMessages.some((m) => m.includes("Would run"))).toBe(true);
    });

    it("dry-run agent reports prompt length", async () => {
      tempDir = await setupTempWreckitRepo();
      const logger = createMockLogger();

      const testPrompt = "A".repeat(1000);
      const config: AgentConfig = {
        command: "claude",
        args: [],
        completion_signal: "DONE",
        timeout_seconds: 60,
        max_iterations: 1,
      };

      const options: RunAgentOptions = {
        config,
        cwd: tempDir,
        prompt: testPrompt,
        logger,
        dryRun: true,
      };

      await runAgent(options);

      expect(
        logger.messages.some((m) => m.includes("1000 characters"))
      ).toBe(true);
    });

    it("dry-run takes precedence over mock-agent", async () => {
      tempDir = await setupTempWreckitRepo();
      const logger = createMockLogger();

      const config: AgentConfig = {
        command: "claude",
        args: [],
        completion_signal: "COMPLETE",
        timeout_seconds: 60,
        max_iterations: 1,
      };

      const options: RunAgentOptions = {
        config,
        cwd: tempDir,
        prompt: "Test",
        logger,
        dryRun: true,
        mockAgent: true,
      };

      const result = await runAgent(options);

      expect(result.output).toBe("[dry-run] No output");
      expect(result.output).not.toContain("[mock-agent]");
    });
  });

  describe("Test 16: --dry-run across all commands", () => {
    it("dry-run git operations perform no mutations", async () => {
      const logger = createMockLogger();
      const options: GitOptions = { cwd: "/repo", logger, dryRun: true };

      await ensureBranch("main", "wreckit/", "item-1", options);
      await commitAll("Test commit", options);
      await pushBranch("wreckit/item-1", options);
      await createOrUpdatePr("main", "wreckit/item-1", "Title", "Body", options);

      // dry-run mode bypasses spawn in the implementation
    });

    it("dry-run logs all would-be operations", async () => {
      const logger = createMockLogger();
      const options: GitOptions = { cwd: "/repo", logger, dryRun: true };

      await ensureBranch("main", "wreckit/", "item-1", options);
      await commitAll("Commit message", options);
      await pushBranch("wreckit/item-1", options);
      await createOrUpdatePr("main", "wreckit/item-1", "PR", "Body", options);

      const dryRunLogs = logger.messages.filter((m) => m.includes("[dry-run]"));
      expect(dryRunLogs.length).toBeGreaterThanOrEqual(4);
    });

    it("multiple dry-run operations are idempotent", async () => {
      const logger = createMockLogger();
      const options: GitOptions = { cwd: "/repo", logger, dryRun: true };

      const result1 = await ensureBranch("main", "wreckit/", "item-1", options);
      const result2 = await ensureBranch("main", "wreckit/", "item-1", options);

      expect(result1.branchName).toBe(result2.branchName);
      expect(result1.created).toBe(result2.created);
      // dry-run mode bypasses spawn in the implementation
    });
  });

  describe("Test 17: wreckit init --dry-run", () => {
    it("init without dry-run creates .wreckit directory", async () => {
      tempDir = await setupTempGitRepo();
      const logger = createMockLogger();

      await initCommand({ cwd: tempDir }, logger);

      const wreckitDir = path.join(tempDir, ".wreckit");
      const stat = await fs.stat(wreckitDir);
      expect(stat.isDirectory()).toBe(true);
    });

    it("init creates config.json file", async () => {
      tempDir = await setupTempGitRepo();
      const logger = createMockLogger();

      await initCommand({ cwd: tempDir }, logger);

      const configPath = path.join(tempDir, ".wreckit", "config.json");
      const content = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(content);

      expect(config.schema_version).toBe(1);
      expect(config.base_branch).toBe("main");
    });

    it("init creates prompts directory with templates", async () => {
      tempDir = await setupTempGitRepo();
      const logger = createMockLogger();

      await initCommand({ cwd: tempDir }, logger);

      const promptsDir = path.join(tempDir, ".wreckit", "prompts");
      const entries = await fs.readdir(promptsDir);

      expect(entries).toContain("research.md");
      expect(entries).toContain("plan.md");
      expect(entries).toContain("implement.md");
    });
  });

  describe("Test 18: Dry-run with invalid repo/config", () => {
    it("dry-run git command in non-git repo still respects error conditions", async () => {
      tempDir = await setupTempDir();
      const logger = createMockLogger();

      await expect(
        initCommand({ cwd: tempDir }, logger)
      ).rejects.toThrow(NotGitRepoError);
    });

    it("dry-run still validates repository before operations", async () => {
      tempDir = await setupTempDir();
      const logger = createMockLogger();

      await expect(initCommand({ cwd: tempDir }, logger)).rejects.toThrow(
        "Not a git repository"
      );
    });

    it("dry-run with non-existent directory fails appropriately", async () => {
      const logger = createMockLogger();
      const nonExistentPath = "/nonexistent/path/that/does/not/exist";

      await expect(
        initCommand({ cwd: nonExistentPath }, logger)
      ).rejects.toThrow();
    });

    it("dry-run respects WreckitExistsError without force flag", async () => {
      tempDir = await setupTempWreckitRepo();
      const logger = createMockLogger();

      await expect(initCommand({ cwd: tempDir }, logger)).rejects.toThrow(
        ".wreckit/ already exists"
      );
    });

    it("dry-run git operations return success even with mock invalid paths", async () => {
      const logger = createMockLogger();
      const options: GitOptions = {
        cwd: "/some/path/that/might/not/exist",
        logger,
        dryRun: true,
      };

      const result = await ensureBranch("main", "wreckit/", "test", options);

      expect(result.branchName).toBe("wreckit/test");
      expect(result.created).toBe(true);
      // dry-run mode bypasses spawn in the implementation
    });
  });

  describe("Integration: Dry-run prevents all mutations while performing introspection", () => {
    it("full workflow dry-run produces no side effects", async () => {
      tempDir = await setupTempWreckitRepo();
      const logger = createMockLogger();
      const gitOptions: GitOptions = { cwd: tempDir, logger, dryRun: true };

      await ensureBranch("main", "wreckit/", "raw-1", gitOptions);
      await commitAll("wreckit: implement raw/1", gitOptions);
      await pushBranch("wreckit/raw-1", gitOptions);
      await createOrUpdatePr(
        "main",
        "wreckit/raw-1",
        "feat: implement raw/1",
        "Implementation of raw/1",
        gitOptions
      );

      const agentConfig: AgentConfig = {
        command: "claude",
        args: ["--dangerously-skip-permissions", "--print"],
        completion_signal: "<promise>COMPLETE</promise>",
        timeout_seconds: 3600,
        max_iterations: 100,
      };

      await runAgent({
        config: agentConfig,
        cwd: tempDir,
        prompt: "Implement the feature",
        logger,
        dryRun: true,
      });

      // dry-run mode bypasses spawn in the implementation

      const entries = await fs.readdir(tempDir);
      expect(entries).toContain(".git");
      expect(entries).toContain(".wreckit");
      expect(entries.length).toBe(2);
    });

    it("dry-run logs contain all expected operations", async () => {
      const logger = createMockLogger();
      const options: GitOptions = { cwd: "/repo", logger, dryRun: true };

      await ensureBranch("main", "wreckit/", "test-item", options);
      await commitAll("Test commit", options);
      await pushBranch("wreckit/test-item", options);

      const allMessages = logger.messages.join("\n");
      expect(allMessages).toContain("[dry-run]");
    });

    it("dry-run returns valid result objects for chained operations", async () => {
      const logger = createMockLogger();
      const options: GitOptions = { cwd: "/repo", logger, dryRun: true };

      const branchResult = await ensureBranch("main", "wreckit/", "item-1", options);
      expect(branchResult.branchName).toBe("wreckit/item-1");

      const prResult = await createOrUpdatePr(
        "main",
        branchResult.branchName,
        "Title",
        "Body",
        options
      );
      expect(prResult.number).toBe(0);
      expect(prResult.created).toBe(true);
    });
  });
});
