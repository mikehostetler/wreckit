import { describe, expect, it, beforeEach, afterEach, mock } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { executeRoadmapCommand } from "../../commands/execute-roadmap";
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

const SAMPLE_ROADMAP = `# Roadmap

## Active Milestones

### [M1] Improve Performance
**Status:** in-progress
**Target:** Q1 2026
**Strategic Goal:** Reduce API response times by 50%

#### Objectives
- [ ] Optimize database queries
- [x] Add caching layer
- [ ] Implement connection pooling

### [M2] Add Authentication
**Status:** planned
**Target:** Q2 2026
**Strategic Goal:** Enable secure user access

#### Objectives
- [ ] Implement OAuth2 flow
- [ ] Add JWT token validation

## Backlog

### [B1] Mobile Support
**Status:** planned

#### Objectives
- [ ] Create React Native app
`;

describe("executeRoadmapCommand", () => {
  let tempDir: string;
  let logger: Logger;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "wreckit-execute-roadmap-test-")
    );
    await setupTestRepo(tempDir);
    logger = createMockLogger();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("throws error when ROADMAP.md doesn't exist", async () => {
    await expect(
      executeRoadmapCommand({ cwd: tempDir }, logger)
    ).rejects.toThrow("ROADMAP.md not found");
  });

  it("creates items from pending objectives", async () => {
    // Create ROADMAP.md
    await fs.writeFile(path.join(tempDir, "ROADMAP.md"), SAMPLE_ROADMAP);

    await executeRoadmapCommand({ cwd: tempDir }, logger);

    // Check items were created
    const itemsDir = path.join(tempDir, ".wreckit", "items");
    const items = await fs.readdir(itemsDir);

    // Should create 4 items (2 pending from M1, 2 from M2)
    expect(items.length).toBe(4);
  });

  it("in dry-run mode shows what would be created without creating", async () => {
    await fs.writeFile(path.join(tempDir, "ROADMAP.md"), SAMPLE_ROADMAP);

    await executeRoadmapCommand({ cwd: tempDir, dryRun: true }, logger);

    // Check no items were created
    const itemsDir = path.join(tempDir, ".wreckit", "items");
    const items = await fs.readdir(itemsDir);
    expect(items.length).toBe(0);

    // Should have logged what would be created
    const infoCalls = (logger.info as any).mock.calls;
    const hasWouldCreate = infoCalls.some((call: string[]) =>
      call[0].includes("Would create")
    );
    expect(hasWouldCreate).toBe(true);
  });

  it("skips completed objectives without --include-done", async () => {
    await fs.writeFile(path.join(tempDir, "ROADMAP.md"), SAMPLE_ROADMAP);

    await executeRoadmapCommand({ cwd: tempDir }, logger);

    // Should not create item for "Add caching layer" which is completed
    const itemsDir = path.join(tempDir, ".wreckit", "items");
    const items = await fs.readdir(itemsDir);

    const hasCaching = items.some((item) => item.includes("add-caching-layer"));
    expect(hasCaching).toBe(false);
  });

  it("includes completed objectives with --include-done", async () => {
    await fs.writeFile(path.join(tempDir, "ROADMAP.md"), SAMPLE_ROADMAP);

    await executeRoadmapCommand({ cwd: tempDir, includeDone: true }, logger);

    // Should create 5 items (3 from M1 including completed, 2 from M2)
    const itemsDir = path.join(tempDir, ".wreckit", "items");
    const items = await fs.readdir(itemsDir);

    expect(items.length).toBe(5);

    // Should include "Add caching layer"
    const hasCaching = items.some((item) => item.includes("add-caching-layer"));
    expect(hasCaching).toBe(true);
  });

  it("skips existing items with matching slugs (idempotent)", async () => {
    await fs.writeFile(path.join(tempDir, "ROADMAP.md"), SAMPLE_ROADMAP);

    // Run first time
    await executeRoadmapCommand({ cwd: tempDir }, logger);

    const itemsDir = path.join(tempDir, ".wreckit", "items");
    const itemsAfterFirst = await fs.readdir(itemsDir);

    // Reset logger mocks
    (logger.info as any).mockClear();

    // Run second time
    await executeRoadmapCommand({ cwd: tempDir }, logger);

    const itemsAfterSecond = await fs.readdir(itemsDir);

    // Should have same number of items
    expect(itemsAfterSecond.length).toBe(itemsAfterFirst.length);

    // Should have logged skipped items
    const infoCalls = (logger.info as any).mock.calls;
    const hasSkipped = infoCalls.some((call: string[]) =>
      call[0].includes("Skipped")
    );
    expect(hasSkipped).toBe(true);
  });

  it("handles ROADMAP.md with no pending objectives", async () => {
    const allDoneRoadmap = `# Roadmap

## Active Milestones

### [M1] All Done
**Status:** done

#### Objectives
- [x] Task 1
- [x] Task 2
`;
    await fs.writeFile(path.join(tempDir, "ROADMAP.md"), allDoneRoadmap);

    await executeRoadmapCommand({ cwd: tempDir }, logger);

    // Should log no pending objectives message
    const infoCalls = (logger.info as any).mock.calls;
    const hasNoPending = infoCalls.some(
      (call: string[]) =>
        call[0].includes("No pending objectives") ||
        call[0].includes("All objectives may be completed")
    );
    expect(hasNoPending).toBe(true);
  });
});
