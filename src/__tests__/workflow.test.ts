import { describe, it, expect, beforeEach, afterEach, mock, spyOn, vi } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { Item, Prd } from "../schemas";
import type { ConfigResolved } from "../config";
import type { Logger } from "../logging";
import type { AgentResult } from "../agent/runner";

const mockedRunAgent = vi.fn();
const mockedGetAgentConfig = vi.fn((config: ConfigResolved) => ({
  command: config.agent.command,
  args: config.agent.args,
  completion_signal: config.agent.completion_signal,
  timeout_seconds: config.timeout_seconds,
  max_iterations: config.max_iterations,
}));

mock.module("../agent/runner", () => ({
  runAgent: mockedRunAgent,
  getAgentConfig: mockedGetAgentConfig,
}));

const mockedEnsureBranch = vi.fn(() =>
  Promise.resolve({ branchName: "wreckit/test-item", created: true })
);
const mockedHasUncommittedChanges = vi.fn(() => Promise.resolve(false));
const mockedCommitAll = vi.fn(() => Promise.resolve());
const mockedPushBranch = vi.fn(() => Promise.resolve());
const mockedCreateOrUpdatePr = vi.fn(() =>
  Promise.resolve({
    url: "https://github.com/example/repo/pull/42",
    number: 42,
    created: true,
  })
);
const mockedIsPrMerged = vi.fn(() => Promise.resolve(true));

mock.module("../git", () => ({
  ensureBranch: mockedEnsureBranch,
  hasUncommittedChanges: mockedHasUncommittedChanges,
  commitAll: mockedCommitAll,
  pushBranch: mockedPushBranch,
  createOrUpdatePr: mockedCreateOrUpdatePr,
  isPrMerged: mockedIsPrMerged,
}));

const {
  buildValidationContext,
  runPhaseResearch,
  runPhasePlan,
  runPhaseImplement,
  runPhasePr,
  runPhaseComplete,
  getNextPhase,
} = await import("../workflow");

function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    json: vi.fn(),
  };
}

function createTestConfig(): ConfigResolved {
  return {
    schema_version: 1,
    base_branch: "main",
    branch_prefix: "wreckit/",
    agent: {
      command: "test-agent",
      args: [],
      completion_signal: "<promise>COMPLETE</promise>",
    },
    max_iterations: 10,
    timeout_seconds: 60,
  };
}

function createTestItem(overrides: Partial<Item> = {}): Item {
  return {
    schema_version: 1,
    id: "001-test-feature",
    title: "Test Feature",
    state: "raw",
    overview: "A test feature",
    branch: null,
    pr_url: null,
    pr_number: null,
    last_error: null,
    created_at: "2025-01-12T00:00:00Z",
    updated_at: "2025-01-12T00:00:00Z",
    ...overrides,
  };
}

function createTestPrd(overrides: Partial<Prd> = {}): Prd {
  return {
    schema_version: 1,
    id: "001-test-feature",
    branch_name: "wreckit/001-test-feature",
    user_stories: [
      {
        id: "US-001",
        title: "First story",
        acceptance_criteria: ["Criterion 1"],
        priority: 1,
        status: "pending",
        notes: "",
      },
    ],
    ...overrides,
  };
}

interface MockAgentBehavior {
  createFiles?: Record<string, string>;
  updatePrd?: (prd: Prd) => Prd;
  success?: boolean;
  timedOut?: boolean;
}

function createMockAgentResult(
  behavior: MockAgentBehavior,
  itemDir: string
): () => Promise<AgentResult> {
  return async () => {
    if (behavior.createFiles) {
      for (const [filename, content] of Object.entries(behavior.createFiles)) {
        const filePath = path.join(itemDir, filename);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, content, "utf-8");
      }
    }

    if (behavior.updatePrd) {
      const prdPath = path.join(itemDir, "prd.json");
      try {
        const prdContent = await fs.readFile(prdPath, "utf-8");
        const prd = JSON.parse(prdContent) as Prd;
        const updatedPrd = behavior.updatePrd(prd);
        await fs.writeFile(
          prdPath,
          JSON.stringify(updatedPrd, null, 2),
          "utf-8"
        );
      } catch {
        // prd doesn't exist yet, ignore
      }
    }

    return {
      success: behavior.success ?? true,
      output: "test output",
      timedOut: behavior.timedOut ?? false,
      exitCode: behavior.success === false ? 1 : 0,
      completionDetected: behavior.success ?? true,
    };
  };
}

describe("workflow", () => {
  let tempDir: string;
  let mockLogger: Logger;
  let config: ConfigResolved;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-workflow-test-"));
    mockLogger = createMockLogger();
    config = createTestConfig();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function setupItem(item: Item): Promise<string> {
    const itemsDir = path.join(tempDir, ".wreckit", "items");
    const itemDir = path.join(itemsDir, item.id);
    await fs.mkdir(itemDir, { recursive: true });
    await fs.writeFile(
      path.join(itemDir, "item.json"),
      JSON.stringify(item, null, 2),
      "utf-8"
    );
    return itemDir;
  }

  async function readItemState(itemId: string): Promise<Item> {
    const itemsDir = path.join(tempDir, ".wreckit", "items");
    const itemPath = path.join(itemsDir, itemId, "item.json");
    const content = await fs.readFile(itemPath, "utf-8");
    return JSON.parse(content) as Item;
  }

  describe("buildValidationContext", () => {
    it("returns correct flags based on file existence", async () => {
      const item = createTestItem({ state: "raw" });
      const itemDir = await setupItem(item);

      const ctx = await buildValidationContext(tempDir, item);

      expect(ctx.hasResearchMd).toBe(false);
      expect(ctx.hasPlanMd).toBe(false);
      expect(ctx.prd).toBeNull();
      expect(ctx.hasPr).toBe(false);
      expect(ctx.prMerged).toBe(false);
    });

    it("detects research.md when present", async () => {
      const item = createTestItem({ state: "raw" });
      const itemDir = await setupItem(item);
      await fs.writeFile(
        path.join(itemDir, "research.md"),
        "# Research",
        "utf-8"
      );

      const ctx = await buildValidationContext(tempDir, item);

      expect(ctx.hasResearchMd).toBe(true);
    });

    it("detects plan.md and prd.json when present", async () => {
      const item = createTestItem({ state: "researched" });
      const itemDir = await setupItem(item);
      await fs.writeFile(path.join(itemDir, "plan.md"), "# Plan", "utf-8");
      await fs.writeFile(
        path.join(itemDir, "prd.json"),
        JSON.stringify(createTestPrd(), null, 2),
        "utf-8"
      );

      const ctx = await buildValidationContext(tempDir, item);

      expect(ctx.hasPlanMd).toBe(true);
      expect(ctx.prd).not.toBeNull();
    });

    it("handles missing files gracefully", async () => {
      const item = createTestItem({ state: "raw" });
      await setupItem(item);

      const ctx = await buildValidationContext(tempDir, item);

      expect(ctx.hasResearchMd).toBe(false);
      expect(ctx.hasPlanMd).toBe(false);
      expect(ctx.prd).toBeNull();
    });
  });

  describe("runPhaseResearch", () => {
    it("transitions from raw to researched on success", async () => {
      const item = createTestItem({ state: "raw" });
      const itemDir = await setupItem(item);

      mockedRunAgent.mockImplementation(
        createMockAgentResult(
          { createFiles: { "research.md": "# Research Results" } },
          itemDir
        )
      );

      const result = await runPhaseResearch(item.id, {
        root: tempDir,
        config,
        logger: mockLogger,
      });

      expect(result.success).toBe(true);
      expect(result.item.state).toBe("researched");
    });

    it("fails when not in raw state", async () => {
      const item = createTestItem({ state: "researched" });
      await setupItem(item);

      const result = await runPhaseResearch(item.id, {
        root: tempDir,
        config,
        logger: mockLogger,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("raw");
    });

    it("fails when research.md not created by agent", async () => {
      const item = createTestItem({ state: "raw" });
      const itemDir = await setupItem(item);

      mockedRunAgent.mockImplementation(
        createMockAgentResult({ createFiles: {} }, itemDir)
      );

      const result = await runPhaseResearch(item.id, {
        root: tempDir,
        config,
        logger: mockLogger,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("research.md");
    });
  });

  describe("runPhasePlan", () => {
    it("transitions from researched to planned on success", async () => {
      const item = createTestItem({ state: "researched" });
      const itemDir = await setupItem(item);
      await fs.writeFile(
        path.join(itemDir, "research.md"),
        "# Research",
        "utf-8"
      );

      const prd = createTestPrd();
      mockedRunAgent.mockImplementation(
        createMockAgentResult(
          {
            createFiles: {
              "plan.md": "# Plan",
              "prd.json": JSON.stringify(prd, null, 2),
            },
          },
          itemDir
        )
      );

      const result = await runPhasePlan(item.id, {
        root: tempDir,
        config,
        logger: mockLogger,
      });

      expect(result.success).toBe(true);
      expect(result.item.state).toBe("planned");
    });

    it("fails when not in researched state", async () => {
      const item = createTestItem({ state: "raw" });
      await setupItem(item);

      const result = await runPhasePlan(item.id, {
        root: tempDir,
        config,
        logger: mockLogger,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("researched");
    });

    it("fails when plan.md not created", async () => {
      const item = createTestItem({ state: "researched" });
      const itemDir = await setupItem(item);
      await fs.writeFile(
        path.join(itemDir, "research.md"),
        "# Research",
        "utf-8"
      );

      mockedRunAgent.mockImplementation(
        createMockAgentResult({ createFiles: {} }, itemDir)
      );

      const result = await runPhasePlan(item.id, {
        root: tempDir,
        config,
        logger: mockLogger,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("plan.md");
    });

    it("fails when prd.json not created", async () => {
      const item = createTestItem({ state: "researched" });
      const itemDir = await setupItem(item);
      await fs.writeFile(
        path.join(itemDir, "research.md"),
        "# Research",
        "utf-8"
      );

      mockedRunAgent.mockImplementation(
        createMockAgentResult({ createFiles: { "plan.md": "# Plan" } }, itemDir)
      );

      const result = await runPhasePlan(item.id, {
        root: tempDir,
        config,
        logger: mockLogger,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("prd.json");
    });
  });

  describe("runPhaseImplement", () => {
    it("transitions from planned to implementing", async () => {
      const prd = createTestPrd();
      const item = createTestItem({ state: "planned" });
      const itemDir = await setupItem(item);
      await fs.writeFile(
        path.join(itemDir, "prd.json"),
        JSON.stringify(prd, null, 2),
        "utf-8"
      );

      mockedRunAgent.mockImplementation(async () => {
        const prdPath = path.join(itemDir, "prd.json");
        const currentPrd = JSON.parse(
          await fs.readFile(prdPath, "utf-8")
        ) as Prd;
        currentPrd.user_stories[0].status = "done";
        await fs.writeFile(
          prdPath,
          JSON.stringify(currentPrd, null, 2),
          "utf-8"
        );
        return {
          success: true,
          output: "test output",
          timedOut: false,
          exitCode: 0,
          completionDetected: true,
        };
      });

      const result = await runPhaseImplement(item.id, {
        root: tempDir,
        config,
        logger: mockLogger,
      });

      expect(result.success).toBe(true);
      expect(result.item.state).toBe("implementing");
    });

    it("fails when not in planned or implementing state", async () => {
      const item = createTestItem({ state: "raw" });
      await setupItem(item);

      const result = await runPhaseImplement(item.id, {
        root: tempDir,
        config,
        logger: mockLogger,
      });

      expect(result.success).toBe(false);
      expect(result.error?.toLowerCase()).toContain("planned");
    });

    it("fails when prd.json missing", async () => {
      const item = createTestItem({ state: "planned" });
      await setupItem(item);

      const result = await runPhaseImplement(item.id, {
        root: tempDir,
        config,
        logger: mockLogger,
      });

      expect(result.success).toBe(false);
      expect(result.error?.toLowerCase()).toContain("prd");
    });

    it("updates story status after agent run", async () => {
      const prd = createTestPrd();
      const item = createTestItem({ state: "planned" });
      const itemDir = await setupItem(item);
      await fs.writeFile(
        path.join(itemDir, "prd.json"),
        JSON.stringify(prd, null, 2),
        "utf-8"
      );

      mockedRunAgent.mockImplementation(async () => {
        const prdPath = path.join(itemDir, "prd.json");
        const currentPrd = JSON.parse(
          await fs.readFile(prdPath, "utf-8")
        ) as Prd;
        currentPrd.user_stories[0].status = "done";
        await fs.writeFile(
          prdPath,
          JSON.stringify(currentPrd, null, 2),
          "utf-8"
        );
        return {
          success: true,
          output: "test output",
          timedOut: false,
          exitCode: 0,
          completionDetected: true,
        };
      });

      await runPhaseImplement(item.id, {
        root: tempDir,
        config,
        logger: mockLogger,
      });

      const prdPath = path.join(itemDir, "prd.json");
      const updatedPrd = JSON.parse(
        await fs.readFile(prdPath, "utf-8")
      ) as Prd;
      expect(updatedPrd.user_stories[0].status).toBe("done");
    });

    it("appends to progress.log", async () => {
      const prd = createTestPrd();
      const item = createTestItem({ state: "planned" });
      const itemDir = await setupItem(item);
      await fs.writeFile(
        path.join(itemDir, "prd.json"),
        JSON.stringify(prd, null, 2),
        "utf-8"
      );

      mockedRunAgent.mockImplementation(async () => {
        const prdPath = path.join(itemDir, "prd.json");
        const currentPrd = JSON.parse(
          await fs.readFile(prdPath, "utf-8")
        ) as Prd;
        currentPrd.user_stories[0].status = "done";
        await fs.writeFile(
          prdPath,
          JSON.stringify(currentPrd, null, 2),
          "utf-8"
        );
        return {
          success: true,
          output: "test output",
          timedOut: false,
          exitCode: 0,
          completionDetected: true,
        };
      });

      await runPhaseImplement(item.id, {
        root: tempDir,
        config,
        logger: mockLogger,
      });

      const progressPath = path.join(itemDir, "progress.log");
      const progressContent = await fs.readFile(progressPath, "utf-8");
      expect(progressContent).toContain("US-001");
    });

    it("respects max_iterations", async () => {
      const prd = createTestPrd({
        user_stories: Array.from({ length: 20 }, (_, i) => ({
          id: `US-${i + 1}`,
          title: `Story ${i + 1}`,
          acceptance_criteria: [],
          priority: i + 1,
          status: "pending" as const,
          notes: "",
        })),
      });
      const item = createTestItem({ state: "planned" });
      const itemDir = await setupItem(item);
      await fs.writeFile(
        path.join(itemDir, "prd.json"),
        JSON.stringify(prd, null, 2),
        "utf-8"
      );

      const limitedConfig = { ...config, max_iterations: 3 };
      let callCount = 0;

      mockedRunAgent.mockImplementation(async () => {
        callCount++;
        return {
          success: true,
          output: "test output",
          timedOut: false,
          exitCode: 0,
          completionDetected: true,
        };
      });

      const result = await runPhaseImplement(item.id, {
        root: tempDir,
        config: limitedConfig,
        logger: mockLogger,
      });

      expect(callCount).toBe(3);
      expect(result.success).toBe(false);
      expect(result.error).toContain("max iterations");
    });

    it("handles timeout", async () => {
      const prd = createTestPrd();
      const item = createTestItem({ state: "planned" });
      const itemDir = await setupItem(item);
      await fs.writeFile(
        path.join(itemDir, "prd.json"),
        JSON.stringify(prd, null, 2),
        "utf-8"
      );

      mockedRunAgent.mockResolvedValue({
        success: false,
        output: "",
        timedOut: true,
        exitCode: null,
        completionDetected: false,
      });

      const result = await runPhaseImplement(item.id, {
        root: tempDir,
        config,
        logger: mockLogger,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("timed out");
    });
  });

  describe("runPhasePr", () => {
    it("fails when not all stories done", async () => {
      const prd = createTestPrd();
      const item = createTestItem({ state: "implementing" });
      const itemDir = await setupItem(item);
      await fs.writeFile(
        path.join(itemDir, "prd.json"),
        JSON.stringify(prd, null, 2),
        "utf-8"
      );

      const result = await runPhasePr(item.id, {
        root: tempDir,
        config,
        logger: mockLogger,
      });

      expect(result.success).toBe(false);
      expect(result.error?.toLowerCase()).toContain("not all stories");
    });

    it("succeeds when all stories done (stubbed)", async () => {
      const prd = createTestPrd({
        user_stories: [
          {
            id: "US-001",
            title: "Done Story",
            acceptance_criteria: [],
            priority: 1,
            status: "done",
            notes: "",
          },
        ],
      });
      const item = createTestItem({ state: "implementing" });
      const itemDir = await setupItem(item);
      await fs.writeFile(
        path.join(itemDir, "prd.json"),
        JSON.stringify(prd, null, 2),
        "utf-8"
      );

      const result = await runPhasePr(item.id, {
        root: tempDir,
        config,
        logger: mockLogger,
      });

      expect(result.success).toBe(true);
      expect(result.item.state).toBe("in_pr");
      expect(result.item.pr_url).not.toBeNull();
    });
  });

  describe("runPhaseComplete", () => {
    it("transitions from in_pr to done (stubbed)", async () => {
      const item = createTestItem({
        state: "in_pr",
        pr_url: "https://github.com/example/repo/pull/1",
        pr_number: 1,
      });
      await setupItem(item);

      const result = await runPhaseComplete(item.id, {
        root: tempDir,
        config,
        logger: mockLogger,
      });

      expect(result.success).toBe(true);
      expect(result.item.state).toBe("done");
    });

    it("fails when not in in_pr state", async () => {
      const item = createTestItem({ state: "implementing" });
      await setupItem(item);

      const result = await runPhaseComplete(item.id, {
        root: tempDir,
        config,
        logger: mockLogger,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("in_pr");
    });
  });

  describe("getNextPhase", () => {
    it("raw -> 'research'", () => {
      const item = createTestItem({ state: "raw" });
      expect(getNextPhase(item)).toBe("research");
    });

    it("researched -> 'plan'", () => {
      const item = createTestItem({ state: "researched" });
      expect(getNextPhase(item)).toBe("plan");
    });

    it("planned -> 'implement'", () => {
      const item = createTestItem({ state: "planned" });
      expect(getNextPhase(item)).toBe("implement");
    });

    it("implementing -> 'pr'", () => {
      const item = createTestItem({ state: "implementing" });
      expect(getNextPhase(item)).toBe("pr");
    });

    it("in_pr -> 'complete'", () => {
      const item = createTestItem({ state: "in_pr" });
      expect(getNextPhase(item)).toBe("complete");
    });

    it("done -> null", () => {
      const item = createTestItem({ state: "done" });
      expect(getNextPhase(item)).toBeNull();
    });
  });
});
