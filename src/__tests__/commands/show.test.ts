import { describe, expect, it, beforeEach, afterEach, mock, spyOn, vi } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { showCommand, loadItemDetails } from "../../commands/show";
import type { Logger } from "../../logging";
import type { Item, Prd } from "../../schemas";
import { FileNotFoundError } from "../../errors";

function createMockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    json: vi.fn(),
  } satisfies Logger;
}

async function createItem(
  root: string,
  section: string,
  slug: string,
  overrides: Partial<Item> = {}
): Promise<Item> {
  const itemDir = path.join(root, ".wreckit", section, slug);
  await fs.mkdir(itemDir, { recursive: true });

  const item: Item = {
    schema_version: 1,
    id: `${section}/${slug}`,
    title: slug.replace(/^\d+-/, "").replace(/-/g, " "),
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

  await fs.writeFile(path.join(itemDir, "item.json"), JSON.stringify(item, null, 2));
  return item;
}

async function createResearch(root: string, id: string): Promise<void> {
  const [section, slug] = id.split("/");
  const researchPath = path.join(root, ".wreckit", section, slug, "research.md");
  await fs.writeFile(researchPath, "# Research\n\nSome research content.");
}

async function createPlan(root: string, id: string): Promise<void> {
  const [section, slug] = id.split("/");
  const planPath = path.join(root, ".wreckit", section, slug, "plan.md");
  await fs.writeFile(planPath, "# Plan\n\nSome plan content.");
}

async function createPrd(root: string, id: string, stories: Array<{ status: "pending" | "done" }>): Promise<void> {
  const [section, slug] = id.split("/");
  const prdPath = path.join(root, ".wreckit", section, slug, "prd.json");

  const prd: Prd = {
    schema_version: 1,
    id,
    branch_name: `wreckit/${slug}`,
    user_stories: stories.map((s, i) => ({
      id: `US-${String(i + 1).padStart(3, "0")}`,
      title: `Story ${i + 1}`,
      acceptance_criteria: ["Criterion 1"],
      priority: i + 1,
      status: s.status,
      notes: "",
    })),
  };

  await fs.writeFile(prdPath, JSON.stringify(prd, null, 2));
}

describe("loadItemDetails", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-test-"));
    await fs.mkdir(path.join(tempDir, ".wreckit"), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("loads item without optional files", async () => {
    await createItem(tempDir, "features", "001-test");

    const details = await loadItemDetails(tempDir, "features/001-test");

    expect(details.item.id).toBe("features/001-test");
    expect(details.hasResearch).toBe(false);
    expect(details.hasPlan).toBe(false);
    expect(details.prd).toBeNull();
  });

  it("detects research.md when exists", async () => {
    await createItem(tempDir, "features", "001-test");
    await createResearch(tempDir, "features/001-test");

    const details = await loadItemDetails(tempDir, "features/001-test");

    expect(details.hasResearch).toBe(true);
  });

  it("detects plan.md when exists", async () => {
    await createItem(tempDir, "features", "001-test");
    await createPlan(tempDir, "features/001-test");

    const details = await loadItemDetails(tempDir, "features/001-test");

    expect(details.hasPlan).toBe(true);
  });

  it("loads prd.json when exists", async () => {
    await createItem(tempDir, "features", "001-test");
    await createPrd(tempDir, "features/001-test", [{ status: "pending" }, { status: "done" }]);

    const details = await loadItemDetails(tempDir, "features/001-test");

    expect(details.prd).not.toBeNull();
    expect(details.prd!.user_stories).toHaveLength(2);
  });
});

describe("showCommand", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-test-"));
    await fs.mkdir(path.join(tempDir, ".wreckit"), { recursive: true });
    await fs.mkdir(path.join(tempDir, ".git"), { recursive: true });
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("shows item details correctly", async () => {
    await createItem(tempDir, "features", "001-test", {
      title: "Test Feature",
      state: "raw",
      overview: "A test feature",
    });

    const logger = createMockLogger();
    const consoleSpy = spyOn(console, "log");
    await showCommand("features/001-test", {}, logger);

    const calls = consoleSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.includes("ID: features/001-test"))).toBe(true);
    expect(calls.some((c) => c.includes("Title: Test Feature"))).toBe(true);
    expect(calls.some((c) => c.includes("State: raw"))).toBe(true);
    expect(calls.some((c) => c.includes("Overview: A test feature"))).toBe(true);
    consoleSpy.mockRestore();
  });

  it("shows research.md indicator when exists", async () => {
    await createItem(tempDir, "features", "001-test");
    await createResearch(tempDir, "features/001-test");

    const logger = createMockLogger();
    const consoleSpy = spyOn(console, "log");
    await showCommand("features/001-test", {}, logger);

    const calls = consoleSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.includes("Research: ✓"))).toBe(true);
    consoleSpy.mockRestore();
  });

  it("shows research.md indicator when missing", async () => {
    await createItem(tempDir, "features", "001-test");

    const logger = createMockLogger();
    const consoleSpy = spyOn(console, "log");
    await showCommand("features/001-test", {}, logger);

    const calls = consoleSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.includes("Research: ✗"))).toBe(true);
    consoleSpy.mockRestore();
  });

  it("shows plan.md indicator when exists", async () => {
    await createItem(tempDir, "features", "001-test");
    await createPlan(tempDir, "features/001-test");

    const logger = createMockLogger();
    const consoleSpy = spyOn(console, "log");
    await showCommand("features/001-test", {}, logger);

    const calls = consoleSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.includes("Plan: ✓"))).toBe(true);
    consoleSpy.mockRestore();
  });

  it("shows prd.json story count when exists", async () => {
    await createItem(tempDir, "features", "001-test");
    await createPrd(tempDir, "features/001-test", [
      { status: "pending" },
      { status: "pending" },
      { status: "done" },
    ]);

    const logger = createMockLogger();
    const consoleSpy = spyOn(console, "log");
    await showCommand("features/001-test", {}, logger);

    const calls = consoleSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.includes("Stories: 2 pending, 1 done"))).toBe(true);
    consoleSpy.mockRestore();
  });

  it("handles missing optional files", async () => {
    await createItem(tempDir, "features", "001-test");

    const logger = createMockLogger();
    const consoleSpy = spyOn(console, "log");
    await showCommand("features/001-test", {}, logger);

    const calls = consoleSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.includes("Research: ✗"))).toBe(true);
    expect(calls.some((c) => c.includes("Plan: ✗"))).toBe(true);
    expect(calls.some((c) => c.includes("Stories: -"))).toBe(true);
    consoleSpy.mockRestore();
  });

  it("outputs full item data with --json", async () => {
    await createItem(tempDir, "features", "001-test");
    await createResearch(tempDir, "features/001-test");
    await createPrd(tempDir, "features/001-test", [{ status: "pending" }]);

    const logger = createMockLogger();
    await showCommand("features/001-test", { json: true }, logger);

    expect(logger.json).toHaveBeenCalledTimes(1);
    const output = logger.json.mock.calls[0][0];

    expect(output.id).toBe("features/001-test");
    expect(output.artifacts.research).toBe(true);
    expect(output.artifacts.plan).toBe(false);
    expect(output.artifacts.prd).toBeDefined();
    expect(output.artifacts.prd.user_stories).toHaveLength(1);
  });

  it("throws error for non-existent ID", async () => {
    const logger = createMockLogger();

    await expect(showCommand("features/999-nonexistent", {}, logger)).rejects.toThrow(FileNotFoundError);
  });

  it("shows branch info when available", async () => {
    await createItem(tempDir, "features", "001-test", {
      branch: "wreckit/001-test",
    });

    const logger = createMockLogger();
    const consoleSpy = spyOn(console, "log");
    await showCommand("features/001-test", {}, logger);

    const calls = consoleSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.includes("Branch: wreckit/001-test"))).toBe(true);
    consoleSpy.mockRestore();
  });

  it("shows PR info when available", async () => {
    await createItem(tempDir, "features", "001-test", {
      pr_url: "https://github.com/org/repo/pull/123",
    });

    const logger = createMockLogger();
    const consoleSpy = spyOn(console, "log");
    await showCommand("features/001-test", {}, logger);

    const calls = consoleSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.includes("PR: https://github.com/org/repo/pull/123"))).toBe(true);
    consoleSpy.mockRestore();
  });
});
