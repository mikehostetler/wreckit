import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import type { Item, Prd, Story } from "../../schemas";
import { writeItem, writeJsonPretty, readItem } from "../../fs";

function makeTempDir(): string {
  return path.join(tmpdir(), `wreckit-test-${randomBytes(8).toString("hex")}`);
}

async function cleanup(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // Ignore
  }
}

function makeStory(overrides: Partial<Story> = {}): Story {
  return {
    id: "story-1",
    title: "Test Story",
    acceptance_criteria: ["AC1"],
    priority: 1,
    status: "pending",
    notes: "",
    ...overrides,
  };
}

function makePrd(stories: Story[]): Prd {
  return {
    schema_version: 1,
    id: "prd-1",
    branch_name: "wreckit/test",
    user_stories: stories,
  };
}

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    schema_version: 1,
    id: "test/001-test",
    title: "Test",
    section: "test",
    state: "raw",
    overview: "Test overview",
    branch: null,
    pr_url: null,
    pr_number: null,
    last_error: null,
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("idempotent phase operations", () => {
  let tempDir: string;
  let itemDir: string;

  beforeEach(async () => {
    tempDir = makeTempDir();
    itemDir = path.join(tempDir, ".wreckit", "items", "test", "001-test");
    await fs.mkdir(itemDir, { recursive: true });
  });

  afterEach(async () => {
    await cleanup(tempDir);
  });

  describe("already-researched item", () => {
    it("reading researched item preserves state", async () => {
      const item = makeItem({ state: "researched" });
      await writeItem(itemDir, item);
      await fs.writeFile(path.join(itemDir, "research.md"), "# Research", "utf-8");

      const readBackItem = await readItem(itemDir);

      expect(readBackItem.state).toBe("researched");
      expect(readBackItem.updated_at).toBe(item.updated_at);
    });
  });

  describe("already-planned item", () => {
    it("reading planned item preserves state and artifacts", async () => {
      const item = makeItem({ state: "planned" });
      const prd = makePrd([makeStory({ status: "pending" })]);

      await writeItem(itemDir, item);
      await fs.writeFile(path.join(itemDir, "research.md"), "# Research", "utf-8");
      await fs.writeFile(path.join(itemDir, "plan.md"), "# Plan", "utf-8");
      await writeJsonPretty(path.join(itemDir, "prd.json"), prd);

      const readBackItem = await readItem(itemDir);

      expect(readBackItem.state).toBe("planned");
      expect(readBackItem.updated_at).toBe(item.updated_at);

      // Verify artifacts exist
      const researchExists = await fs.stat(path.join(itemDir, "research.md")).then(() => true).catch(() => false);
      const planExists = await fs.stat(path.join(itemDir, "plan.md")).then(() => true).catch(() => false);
      const prdExists = await fs.stat(path.join(itemDir, "prd.json")).then(() => true).catch(() => false);

      expect(researchExists).toBe(true);
      expect(planExists).toBe(true);
      expect(prdExists).toBe(true);
    });
  });

  describe("item state persistence", () => {
    it("writing then reading item preserves all fields", async () => {
      const originalItem = makeItem({
        state: "implementing",
        branch: "wreckit/test-branch",
        last_error: "Previous error",
      });

      await writeItem(itemDir, originalItem);
      const readBackItem = await readItem(itemDir);

      expect(readBackItem).toEqual(originalItem);
    });

    it("multiple writes preserve consistency", async () => {
      const item1 = makeItem({ state: "raw" });
      await writeItem(itemDir, item1);

      const item2 = { ...item1, state: "researched" as const, updated_at: "2024-01-02T00:00:00.000Z" };
      await writeItem(itemDir, item2);

      const item3 = { ...item2, state: "planned" as const, updated_at: "2024-01-03T00:00:00.000Z" };
      await writeItem(itemDir, item3);

      const finalItem = await readItem(itemDir);

      expect(finalItem.state).toBe("planned");
      expect(finalItem.updated_at).toBe("2024-01-03T00:00:00.000Z");
    });
  });
});

describe("state artifact consistency", () => {
  let tempDir: string;
  let itemDir: string;

  beforeEach(async () => {
    tempDir = makeTempDir();
    itemDir = path.join(tempDir, ".wreckit", "items", "test", "001-test");
    await fs.mkdir(itemDir, { recursive: true });
  });

  afterEach(async () => {
    await cleanup(tempDir);
  });

  describe("state requires artifacts", () => {
    it("planned state requires plan.md and prd.json files", async () => {
      // A properly planned item should have these files
      const item = makeItem({ state: "planned" });
      const prd = makePrd([makeStory()]);

      await writeItem(itemDir, item);
      await fs.writeFile(path.join(itemDir, "research.md"), "# Research", "utf-8");
      await fs.writeFile(path.join(itemDir, "plan.md"), "# Plan", "utf-8");
      await writeJsonPretty(path.join(itemDir, "prd.json"), prd);

      // Verify all required artifacts exist
      const files = await fs.readdir(itemDir);
      expect(files).toContain("item.json");
      expect(files).toContain("research.md");
      expect(files).toContain("plan.md");
      expect(files).toContain("prd.json");
    });

    it("researched state requires research.md", async () => {
      const item = makeItem({ state: "researched" });
      await writeItem(itemDir, item);
      await fs.writeFile(path.join(itemDir, "research.md"), "# Research Notes", "utf-8");

      const files = await fs.readdir(itemDir);
      expect(files).toContain("item.json");
      expect(files).toContain("research.md");
    });
  });
});
