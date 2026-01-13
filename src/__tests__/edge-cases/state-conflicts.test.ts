import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { diagnose } from "../../doctor";
import type { Item, Prd, Story } from "../../schemas";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

import { spawn } from "node:child_process";

function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    json: vi.fn(),
    setConfig: vi.fn(),
  };
}

interface MockProcess {
  stdout: { on: ReturnType<typeof vi.fn> };
  stderr: { on: ReturnType<typeof vi.fn> };
  on: ReturnType<typeof vi.fn>;
}

function createMockProcess(stdout: string, exitCode: number): MockProcess {
  const stdoutOn = vi.fn((event: string, cb: (data: Buffer) => void) => {
    if (event === "data") {
      setTimeout(() => cb(Buffer.from(stdout)), 0);
    }
  });
  const stderrOn = vi.fn();
  const onFn = vi.fn((event: string, cb: (code: number | null) => void) => {
    if (event === "close") {
      setTimeout(() => cb(exitCode), 10);
    }
  });

  return {
    stdout: { on: stdoutOn },
    stderr: { on: stderrOn },
    on: onFn,
  };
}

function mockSpawnOnce(stdout: string, exitCode: number): void {
  const mockProc = createMockProcess(stdout, exitCode);
  vi.mocked(spawn).mockReturnValueOnce(mockProc as never);
}

function mockSpawnSequence(
  responses: Array<{ stdout: string; exitCode: number }>
): void {
  for (const r of responses) {
    mockSpawnOnce(r.stdout, r.exitCode);
  }
}

async function createWreckitDir(root: string): Promise<void> {
  await fs.mkdir(path.join(root, ".wreckit"), { recursive: true });
  await fs.mkdir(path.join(root, ".git"), { recursive: true });
  await fs.mkdir(path.join(root, ".wreckit", "prompts"), { recursive: true });
  await fs.writeFile(
    path.join(root, ".wreckit", "config.json"),
    JSON.stringify({
      schema_version: 1,
      base_branch: "main",
      branch_prefix: "wreckit/",
      agent: { command: "amp", args: [], completion_signal: "DONE" },
      max_iterations: 100,
      timeout_seconds: 3600,
    })
  );
}

async function createItem(
  root: string,
  id: string,
  overrides: Partial<Item> = {}
): Promise<string> {
  const [section, slug] = id.split("/");
  const itemDir = path.join(root, ".wreckit", section, slug);
  await fs.mkdir(itemDir, { recursive: true });

  const item: Item = {
    schema_version: 1,
    id,
    title: `Test item ${id}`,
    section,
    state: "raw",
    overview: "Test overview",
    branch: null,
    pr_url: null,
    pr_number: null,
    last_error: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };

  await fs.writeFile(
    path.join(itemDir, "item.json"),
    JSON.stringify(item, null, 2)
  );

  return itemDir;
}

async function createResearch(itemDir: string): Promise<void> {
  await fs.writeFile(path.join(itemDir, "research.md"), "# Research\n\nResearch content here.");
}

async function createPlan(itemDir: string): Promise<void> {
  await fs.writeFile(path.join(itemDir, "plan.md"), "# Plan\n\nPlan content here.");
}

async function createPrd(
  itemDir: string,
  stories: Story[] = [
    {
      id: "US-001",
      title: "Test story",
      acceptance_criteria: ["Test"],
      priority: 1,
      status: "pending",
      notes: "",
    },
  ]
): Promise<void> {
  const prd: Prd = {
    schema_version: 1,
    id: "test-prd",
    branch_name: "wreckit/test-item",
    user_stories: stories,
  };

  await fs.writeFile(
    path.join(itemDir, "prd.json"),
    JSON.stringify(prd, null, 2)
  );
}

describe("State Conflict Resolution", () => {
  let tempDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-state-conflicts-"));
    await createWreckitDir(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("7.3 Item vs Artifacts Conflicts (69-74)", () => {
    it("69: Researched but research.md missing - should emit STATE_FILE_MISMATCH", async () => {
      await createItem(tempDir, "test/001-item", { state: "researched" });

      const diagnostics = await diagnose(tempDir);
      const mismatch = diagnostics.find((d) => d.code === "STATE_FILE_MISMATCH");

      expect(mismatch).toBeDefined();
      expect(mismatch?.severity).toBe("warning");
      expect(mismatch?.message).toContain("researched");
      expect(mismatch?.message).toContain("research.md");
      expect(mismatch?.fixable).toBe(true);
    });

    it("70: Raw but research.md exists - should detect upgrade opportunity", async () => {
      const itemDir = await createItem(tempDir, "test/001-item", { state: "raw" });
      await createResearch(itemDir);

      const diagnostics = await diagnose(tempDir);

      expect(diagnostics.every((d) => d.code !== "STATE_FILE_MISMATCH")).toBe(true);
    });

    it("71: Planned but plan.md missing - should emit STATE_FILE_MISMATCH", async () => {
      const itemDir = await createItem(tempDir, "test/001-item", { state: "planned" });
      await createResearch(itemDir);
      await createPrd(itemDir);

      const diagnostics = await diagnose(tempDir);
      const mismatch = diagnostics.find((d) => d.code === "STATE_FILE_MISMATCH");

      expect(mismatch).toBeDefined();
      expect(mismatch?.message).toContain("plan.md is missing");
    });

    it("72: Planned but prd.json missing - should emit STATE_FILE_MISMATCH", async () => {
      const itemDir = await createItem(tempDir, "test/001-item", { state: "planned" });
      await createResearch(itemDir);
      await createPlan(itemDir);

      const diagnostics = await diagnose(tempDir);
      const mismatch = diagnostics.find((d) => d.code === "STATE_FILE_MISMATCH");

      expect(mismatch).toBeDefined();
      expect(mismatch?.message).toContain("prd.json is missing");
    });

    it("73: Implementing but no pending stories - should flag as ready for PR", async () => {
      const itemDir = await createItem(tempDir, "test/001-item", { state: "implementing" });
      await createResearch(itemDir);
      await createPlan(itemDir);
      await createPrd(itemDir, [
        {
          id: "US-001",
          title: "Story 1",
          acceptance_criteria: ["Done"],
          priority: 1,
          status: "done",
          notes: "",
        },
      ]);

      const diagnostics = await diagnose(tempDir);
      const mismatch = diagnostics.find((d) => d.code === "STATE_FILE_MISMATCH");

      expect(mismatch).toBeDefined();
      expect(mismatch?.message).toContain("no pending stories");
    });

    it("74: Planned but prd has pending stories - should detect upgrade to implementing", async () => {
      const itemDir = await createItem(tempDir, "test/001-item", { state: "planned" });
      await createResearch(itemDir);
      await createPlan(itemDir);
      await createPrd(itemDir, [
        {
          id: "US-001",
          title: "Story 1",
          acceptance_criteria: ["Test"],
          priority: 1,
          status: "pending",
          notes: "",
        },
      ]);

      const diagnostics = await diagnose(tempDir);

      expect(diagnostics.every((d) => d.code !== "STATE_FILE_MISMATCH")).toBe(true);
    });

    it("72b: Planned but prd.json invalid - should emit INVALID_PRD", async () => {
      const itemDir = await createItem(tempDir, "test/001-item", { state: "planned" });
      await createResearch(itemDir);
      await createPlan(itemDir);
      await fs.writeFile(path.join(itemDir, "prd.json"), JSON.stringify({ invalid: true }));

      const diagnostics = await diagnose(tempDir);
      const invalidPrd = diagnostics.find((d) => d.code === "INVALID_PRD");

      expect(invalidPrd).toBeDefined();
      expect(invalidPrd?.severity).toBe("error");
    });
  });

  describe("7.4 Item vs GitHub PR Conflicts (75-80)", () => {
    it("75: in_pr but PR missing in GitHub - requires GitHub integration (diagnostic about missing PR)", async () => {
      const itemDir = await createItem(tempDir, "test/001-item", {
        state: "in_pr",
        pr_number: 123,
        pr_url: "https://github.com/org/repo/pull/123",
        branch: "wreckit/001-item",
      });
      await createResearch(itemDir);
      await createPlan(itemDir);
      await createPrd(itemDir, [
        { id: "US-001", title: "Story", acceptance_criteria: [], priority: 1, status: "done", notes: "" },
      ]);

      const diagnostics = await diagnose(tempDir);

      expect(diagnostics.filter((d) => d.code === "STATE_FILE_MISMATCH")).toHaveLength(0);
    });

    it("76: in_pr but PR is MERGED - should detect upgrade to done", async () => {
      const itemDir = await createItem(tempDir, "test/001-item", {
        state: "in_pr",
        pr_number: 123,
        pr_url: "https://github.com/org/repo/pull/123",
        branch: "wreckit/001-item",
      });
      await createResearch(itemDir);
      await createPlan(itemDir);
      await createPrd(itemDir, [
        { id: "US-001", title: "Story", acceptance_criteria: [], priority: 1, status: "done", notes: "" },
      ]);

      const diagnostics = await diagnose(tempDir);

      expect(diagnostics.filter((d) => d.code === "STATE_FILE_MISMATCH")).toHaveLength(0);
    });

    it("77: done but PR not merged - should detect state conflict", async () => {
      const itemDir = await createItem(tempDir, "test/001-item", {
        state: "done",
        pr_number: 123,
        pr_url: "https://github.com/org/repo/pull/123",
        branch: "wreckit/001-item",
      });
      await createResearch(itemDir);
      await createPlan(itemDir);
      await createPrd(itemDir, [
        { id: "US-001", title: "Story", acceptance_criteria: [], priority: 1, status: "done", notes: "" },
      ]);

      const diagnostics = await diagnose(tempDir);

      expect(diagnostics.every((d) => d.code !== "STATE_FILE_MISMATCH")).toBe(true);
    });

    it("78: done but PR missing entirely - should have valid state with artifacts", async () => {
      const itemDir = await createItem(tempDir, "test/001-item", {
        state: "done",
        pr_number: null,
        pr_url: null,
        branch: "wreckit/001-item",
      });
      await createResearch(itemDir);
      await createPlan(itemDir);
      await createPrd(itemDir, [
        { id: "US-001", title: "Story", acceptance_criteria: [], priority: 1, status: "done", notes: "" },
      ]);

      const diagnostics = await diagnose(tempDir);

      expect(diagnostics.filter((d) => d.code === "STATE_FILE_MISMATCH")).toHaveLength(0);
    });

    it("79: implementing but all stories done and has PR URL - should detect in_pr state", async () => {
      const itemDir = await createItem(tempDir, "test/001-item", {
        state: "implementing",
        pr_number: 123,
        pr_url: "https://github.com/org/repo/pull/123",
        branch: "wreckit/001-item",
      });
      await createResearch(itemDir);
      await createPlan(itemDir);
      await createPrd(itemDir, [
        { id: "US-001", title: "Story", acceptance_criteria: [], priority: 1, status: "done", notes: "" },
      ]);

      const diagnostics = await diagnose(tempDir);
      const mismatch = diagnostics.find((d) => d.code === "STATE_FILE_MISMATCH");

      expect(mismatch).toBeDefined();
      expect(mismatch?.message).toContain("no pending stories");
    });

    it("80: implementing but PR exists with pending stories - state unchanged", async () => {
      const itemDir = await createItem(tempDir, "test/001-item", {
        state: "implementing",
        pr_number: 123,
        pr_url: "https://github.com/org/repo/pull/123",
        branch: "wreckit/001-item",
      });
      await createResearch(itemDir);
      await createPlan(itemDir);
      await createPrd(itemDir, [
        { id: "US-001", title: "Story", acceptance_criteria: [], priority: 1, status: "pending", notes: "" },
      ]);

      const diagnostics = await diagnose(tempDir);
      const mismatch = diagnostics.filter((d) => d.code === "STATE_FILE_MISMATCH");

      expect(mismatch).toHaveLength(0);
    });
  });

  describe("7.5 Item vs Git Branch Conflicts (81-85)", () => {
    it("81: in_pr but on different branch - should have valid state", async () => {
      const itemDir = await createItem(tempDir, "test/001-item", {
        state: "in_pr",
        branch: "wreckit/001-item",
        pr_number: 123,
        pr_url: "https://github.com/org/repo/pull/123",
      });
      await createResearch(itemDir);
      await createPlan(itemDir);
      await createPrd(itemDir, [
        { id: "US-001", title: "Story", acceptance_criteria: [], priority: 1, status: "done", notes: "" },
      ]);

      const diagnostics = await diagnose(tempDir);

      expect(diagnostics.filter((d) => d.code === "STATE_FILE_MISMATCH")).toHaveLength(0);
    });

    it("82: Branch exists but item is raw - state remains raw", async () => {
      await createItem(tempDir, "test/001-item", {
        state: "raw",
        branch: "wreckit/001-item",
      });

      const diagnostics = await diagnose(tempDir);
      const mismatch = diagnostics.filter((d) => d.code === "STATE_FILE_MISMATCH");

      expect(mismatch).toHaveLength(0);
    });

    it("83: Implementing but branch missing - should have valid state with artifacts", async () => {
      const itemDir = await createItem(tempDir, "test/001-item", {
        state: "implementing",
        branch: null,
      });
      await createResearch(itemDir);
      await createPlan(itemDir);
      await createPrd(itemDir);

      const diagnostics = await diagnose(tempDir);

      expect(diagnostics.filter((d) => d.code === "STATE_FILE_MISMATCH")).toHaveLength(0);
    });

    it("84: in_pr with all artifacts present - valid state", async () => {
      const itemDir = await createItem(tempDir, "test/001-item", {
        state: "in_pr",
        branch: "wreckit/001-item",
        pr_number: 123,
        pr_url: "https://github.com/org/repo/pull/123",
      });
      await createResearch(itemDir);
      await createPlan(itemDir);
      await createPrd(itemDir, [
        { id: "US-001", title: "Story", acceptance_criteria: [], priority: 1, status: "done", notes: "" },
      ]);

      const diagnostics = await diagnose(tempDir);

      expect(diagnostics.filter((d) => d.code === "STATE_FILE_MISMATCH")).toHaveLength(0);
    });

    it("85: done with all artifacts - valid state", async () => {
      const itemDir = await createItem(tempDir, "test/001-item", {
        state: "done",
        branch: "wreckit/001-item",
        pr_number: 123,
        pr_url: "https://github.com/org/repo/pull/123",
      });
      await createResearch(itemDir);
      await createPlan(itemDir);
      await createPrd(itemDir, [
        { id: "US-001", title: "Story", acceptance_criteria: [], priority: 1, status: "done", notes: "" },
      ]);

      const diagnostics = await diagnose(tempDir);

      expect(diagnostics.filter((d) => d.code === "STATE_FILE_MISMATCH")).toHaveLength(0);
    });
  });

  describe("7.6 Metadata Sync Conflicts (86-89)", () => {
    it("86: PR exists but item.pr_url missing - should emit STATE_FILE_MISMATCH for in_pr", async () => {
      const itemDir = await createItem(tempDir, "test/001-item", {
        state: "in_pr",
        pr_url: null,
        pr_number: null,
        branch: "wreckit/001-item",
      });
      await createResearch(itemDir);
      await createPlan(itemDir);
      await createPrd(itemDir, [
        { id: "US-001", title: "Story", acceptance_criteria: [], priority: 1, status: "done", notes: "" },
      ]);

      const diagnostics = await diagnose(tempDir);
      const mismatch = diagnostics.find((d) => d.code === "STATE_FILE_MISMATCH");

      expect(mismatch).toBeDefined();
      expect(mismatch?.message).toContain("pr_url is not set");
    });

    it("87: Branch inferred when missing - implementing state with null branch", async () => {
      const itemDir = await createItem(tempDir, "test/001-item", {
        state: "implementing",
        branch: null,
      });
      await createResearch(itemDir);
      await createPlan(itemDir);
      await createPrd(itemDir);

      const diagnostics = await diagnose(tempDir);

      expect(diagnostics.filter((d) => d.code === "STATE_FILE_MISMATCH")).toHaveLength(0);
    });

    it("88: item.branch set but different from expected - valid state", async () => {
      const itemDir = await createItem(tempDir, "test/001-item", {
        state: "implementing",
        branch: "wreckit/old-branch",
      });
      await createResearch(itemDir);
      await createPlan(itemDir);
      await createPrd(itemDir);

      const diagnostics = await diagnose(tempDir);

      expect(diagnostics.filter((d) => d.code === "STATE_FILE_MISMATCH")).toHaveLength(0);
    });

    it("89: All stories done, implementing, no PR - should emit diagnostic about ready for PR", async () => {
      const itemDir = await createItem(tempDir, "test/001-item", {
        state: "implementing",
        branch: "wreckit/001-item",
        pr_url: null,
        pr_number: null,
      });
      await createResearch(itemDir);
      await createPlan(itemDir);
      await createPrd(itemDir, [
        { id: "US-001", title: "Story", acceptance_criteria: [], priority: 1, status: "done", notes: "" },
      ]);

      const diagnostics = await diagnose(tempDir);
      const mismatch = diagnostics.find((d) => d.code === "STATE_FILE_MISMATCH");

      expect(mismatch).toBeDefined();
      expect(mismatch?.message).toContain("no pending stories");
    });
  });

  describe("Edge Cases - Invalid Artifact Combinations", () => {
    it("planned state with only plan.md (no prd.json) - should emit diagnostic", async () => {
      const itemDir = await createItem(tempDir, "test/001-item", { state: "planned" });
      await createPlan(itemDir);

      const diagnostics = await diagnose(tempDir);
      const mismatch = diagnostics.find((d) => d.code === "STATE_FILE_MISMATCH");

      expect(mismatch).toBeDefined();
      expect(mismatch?.message).toContain("prd.json is missing");
    });

    it("planned state with only prd.json (no plan.md) - should emit diagnostic", async () => {
      const itemDir = await createItem(tempDir, "test/001-item", { state: "planned" });
      await createPrd(itemDir);

      const diagnostics = await diagnose(tempDir);
      const mismatch = diagnostics.find((d) => d.code === "STATE_FILE_MISMATCH");

      expect(mismatch).toBeDefined();
      expect(mismatch?.message).toContain("plan.md is missing");
    });

    it("implementing state with invalid prd.json - should emit INVALID_PRD", async () => {
      const itemDir = await createItem(tempDir, "test/001-item", { state: "implementing" });
      await createResearch(itemDir);
      await createPlan(itemDir);
      await fs.writeFile(path.join(itemDir, "prd.json"), "{ invalid json }");

      const diagnostics = await diagnose(tempDir);
      const invalidPrd = diagnostics.find((d) => d.code === "INVALID_PRD");

      expect(invalidPrd).toBeDefined();
      expect(invalidPrd?.severity).toBe("error");
    });

    it("researched state with valid research.md - no diagnostic", async () => {
      const itemDir = await createItem(tempDir, "test/001-item", { state: "researched" });
      await createResearch(itemDir);

      const diagnostics = await diagnose(tempDir);

      expect(diagnostics.filter((d) => d.code === "STATE_FILE_MISMATCH")).toHaveLength(0);
    });

    it("raw state with no artifacts - no diagnostic", async () => {
      await createItem(tempDir, "test/001-item", { state: "raw" });

      const diagnostics = await diagnose(tempDir);

      expect(diagnostics.filter((d) => d.code === "STATE_FILE_MISMATCH")).toHaveLength(0);
    });
  });

  describe("Multiple Items with Different States", () => {
    it("handles multiple items with varying artifact completeness", async () => {
      const item1Dir = await createItem(tempDir, "test/001-raw", { state: "raw" });

      const item2Dir = await createItem(tempDir, "test/002-researched", { state: "researched" });
      await createResearch(item2Dir);

      const item3Dir = await createItem(tempDir, "test/003-planned", { state: "planned" });
      await createResearch(item3Dir);
      await createPlan(item3Dir);
      await createPrd(item3Dir);

      const item4Dir = await createItem(tempDir, "test/004-broken", { state: "researched" });

      const diagnostics = await diagnose(tempDir);
      const mismatches = diagnostics.filter((d) => d.code === "STATE_FILE_MISMATCH");

      expect(mismatches).toHaveLength(1);
      expect(mismatches[0].itemId).toBe("test/004-broken");
    });

    it("validates all items in multiple sections", async () => {
      await createItem(tempDir, "section-a/001-item", { state: "researched" });

      const item2Dir = await createItem(tempDir, "section-b/001-item", { state: "researched" });
      await createResearch(item2Dir);

      const diagnostics = await diagnose(tempDir);
      const mismatches = diagnostics.filter((d) => d.code === "STATE_FILE_MISMATCH");

      expect(mismatches).toHaveLength(1);
      expect(mismatches[0].itemId).toBe("section-a/001-item");
    });
  });

  describe("PRD Story Status Validation", () => {
    it("implementing with mixed story statuses - no diagnostic", async () => {
      const itemDir = await createItem(tempDir, "test/001-item", { state: "implementing" });
      await createResearch(itemDir);
      await createPlan(itemDir);
      await createPrd(itemDir, [
        { id: "US-001", title: "Done Story", acceptance_criteria: [], priority: 1, status: "done", notes: "" },
        { id: "US-002", title: "Pending Story", acceptance_criteria: [], priority: 2, status: "pending", notes: "" },
      ]);

      const diagnostics = await diagnose(tempDir);

      expect(diagnostics.filter((d) => d.code === "STATE_FILE_MISMATCH")).toHaveLength(0);
    });

    it("implementing with empty stories array - should emit diagnostic", async () => {
      const itemDir = await createItem(tempDir, "test/001-item", { state: "implementing" });
      await createResearch(itemDir);
      await createPlan(itemDir);
      await createPrd(itemDir, []);

      const diagnostics = await diagnose(tempDir);
      const mismatch = diagnostics.find((d) => d.code === "STATE_FILE_MISMATCH");

      expect(mismatch).toBeDefined();
      expect(mismatch?.message).toContain("no pending stories");
    });
  });
});
