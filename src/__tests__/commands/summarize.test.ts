import { describe, expect, it, beforeEach, afterEach, mock } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { summarizeCommand } from "../../commands/summarize";
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

  // Create skills.json with media phase
  const skills = {
    schema_version: 1,
    phases: {
      media: ["manim-generation", "remotion-generation"],
    },
    skills: [
      {
        id: "manim-generation",
        name: "Manim Video Generation",
        description: "Generate mathematical animations using Manim",
        tools: ["Read", "Write", "Bash", "Glob"],
        context_requirements: ["git_status"],
      },
      {
        id: "remotion-generation",
        name: "Remotion Video Generation",
        description: "Generate React-based videos using Remotion",
        tools: ["Read", "Write", "Bash", "Glob"],
        context_requirements: ["git_status"],
      },
    ],
  };
  await fs.writeFile(
    path.join(wreckitDir, "skills.json"),
    JSON.stringify(skills, null, 2)
  );
}

async function createTestItem(
  itemsDir: string,
  id: string,
  state: string,
  title: string = "Test Item"
): Promise<void> {
  const itemDir = path.join(itemsDir, id);
  await fs.mkdir(itemDir, { recursive: true });

  const item = {
    schema_version: 1,
    id,
    title,
    section: "roadmap",
    state,
    overview: "Test overview",
    branch: `wreckit/${id}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    pr_url: "",  // Required field
    pr_number: 0,  // Required field
    last_error: "",  // Required field
  };

  await fs.writeFile(
    path.join(itemDir, "item.json"),
    JSON.stringify(item, null, 2)
  );
}

describe("summarizeCommand - Item Selection", () => {
  let tempDir: string;
  let logger: Logger;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-summarize-test-"));
    await setupTestRepo(tempDir);
    logger = createMockLogger();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("with --item flag", () => {
    it("loads specific item", async () => {
      const itemsDir = path.join(tempDir, ".wreckit", "items");
      await createTestItem(itemsDir, "001-test", "done", "Test Item 1");

      await summarizeCommand(
        {
          item: "001-test",
          dryRun: true,
          cwd: tempDir,
        },
        logger
      );

      // Should have logged processing the specific item
      const infoCalls = (logger.info as any).mock.calls;
      const hasItemMessage = infoCalls.some((call: string[]) =>
        call[0].includes("001-test")
      );
      expect(hasItemMessage).toBe(true);
    });
  });

  describe("with --phase flag", () => {
    it("filters items by state", async () => {
      const itemsDir = path.join(tempDir, ".wreckit", "items");
      await createTestItem(itemsDir, "001-test", "done", "Test Item 1");
      await createTestItem(itemsDir, "002-test", "done", "Test Item 2");
      await createTestItem(itemsDir, "003-test", "idea", "Test Item 3");

      await summarizeCommand(
        {
          phase: "done",
          dryRun: true,
          cwd: tempDir,
        },
        logger
      );

      // Should have processed 2 done items
      const infoCalls = (logger.info as any).mock.calls;
      const doneItemsCount = infoCalls.filter((call: string[]) =>
        call[0].includes("001-test") || call[0].includes("002-test")
      ).length;
      expect(doneItemsCount).toBeGreaterThan(0);
    });
  });

  describe("with --all flag", () => {
    it("loads all done items", async () => {
      const itemsDir = path.join(tempDir, ".wreckit", "items");
      await createTestItem(itemsDir, "001-test", "done", "Test Item 1");
      await createTestItem(itemsDir, "002-test", "done", "Test Item 2");
      await createTestItem(itemsDir, "003-test", "idea", "Test Item 3");

      await summarizeCommand(
        {
          all: true,
          dryRun: true,
          cwd: tempDir,
        },
        logger
      );

      // Should have logged all done items
      const infoCalls = (logger.info as any).mock.calls;
      const hasAllMessage = infoCalls.some((call: string[]) =>
        call[0].includes("completed items")
      );
      expect(hasAllMessage).toBe(true);
    });
  });

  describe("with no flags (default behavior)", () => {
    it("defaults to recent 5 done items", async () => {
      const itemsDir = path.join(tempDir, ".wreckit", "items");
      // Create 7 done items
      for (let i = 1; i <= 7; i++) {
        const id = `00${i}-test`;
        await createTestItem(itemsDir, id, "done", `Test Item ${i}`);
      }

      await summarizeCommand(
        {
          dryRun: true,
          cwd: tempDir,
        },
        logger
      );

      // Should have logged "recent 5 completed items"
      const infoCalls = (logger.info as any).mock.calls;
      const hasDefaultMessage = infoCalls.some((call: string[]) =>
        call[0].includes("recent completed items")
      );
      expect(hasDefaultMessage).toBe(true);
    });
  });

  describe("with no done items available", () => {
    it("handles gracefully with warning", async () => {
      const itemsDir = path.join(tempDir, ".wreckit", "items");
      await createTestItem(itemsDir, "001-test", "idea", "Test Item 1");

      await summarizeCommand(
        {
          dryRun: true,
          cwd: tempDir,
        },
        logger
      );

      // Should have warned about no source items
      expect(logger.warn).toHaveBeenCalled();
      const warnCalls = (logger.warn as any).mock.calls;
      const hasWarning = warnCalls.some((call: string[]) =>
        call[0].includes("No source items found")
      );
      expect(hasWarning).toBe(true);
    });
  });

  describe("with empty items directory", () => {
    it("handles gracefully with warning", async () => {
      await summarizeCommand(
        {
          dryRun: true,
          cwd: tempDir,
        },
        logger
      );

      // Should have warned about no source items
      expect(logger.warn).toHaveBeenCalled();
      const warnCalls = (logger.warn as any).mock.calls;
      const hasWarning = warnCalls.some((call: string[]) =>
        call[0].includes("No source items found")
      );
      expect(hasWarning).toBe(true);
    });
  });
});

describe("summarizeCommand - Dry Run Mode", () => {
  let tempDir: string;
  let logger: Logger;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-summarize-test-"));
    await setupTestRepo(tempDir);
    logger = createMockLogger();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("logs item details without generating video", async () => {
    const itemsDir = path.join(tempDir, ".wreckit", "items");
    await createTestItem(itemsDir, "001-test", "done", "Test Item 1");

    await summarizeCommand(
      {
        dryRun: true,
        cwd: tempDir,
      },
      logger
    );

    // Should have logged dry-run message
    const infoCalls = (logger.info as any).mock.calls;
    const hasDryRunMessage = infoCalls.some((call: string[]) =>
      call[0].includes("[dry-run]")
    );
    expect(hasDryRunMessage).toBe(true);

    // Should have logged expected output path
    const hasOutputPath = infoCalls.some((call: string[]) =>
      call[0].includes("Expected output:")
    );
    expect(hasOutputPath).toBe(true);
  });

  it("creates media directory in dry-run mode", async () => {
    const itemsDir = path.join(tempDir, ".wreckit", "items");
    await createTestItem(itemsDir, "001-test", "done", "Test Item 1");

    await summarizeCommand(
      {
        dryRun: true,
        cwd: tempDir,
      },
      logger
    );

    // Media directory should be created
    const mediaPath = path.join(tempDir, ".wreckit", "media");
    const exists = await fs.access(mediaPath).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });
});
