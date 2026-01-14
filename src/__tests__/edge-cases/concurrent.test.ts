import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import type { Item } from "../../schemas";
import { writeItem, readItem, safeWriteJson } from "../../fs";

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

describe("concurrent modification handling", () => {
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

  describe("concurrent writes", () => {
    it("last write wins for simultaneous writes", async () => {
      const item1 = makeItem({ state: "raw", title: "Version 1" });
      const item2 = makeItem({ state: "researched", title: "Version 2" });

      // Simulate concurrent writes
      await Promise.all([
        writeItem(itemDir, item1),
        writeItem(itemDir, item2),
      ]);

      // One of them should win (last-write-wins)
      const finalItem = await readItem(itemDir);

      // We don't know which one wins, but it should be consistent
      expect(["Version 1", "Version 2"]).toContain(finalItem.title);
      expect(["raw", "researched"]).toContain(finalItem.state);
    });

    it("atomic writes prevent partial corruption", async () => {
      const item = makeItem({ state: "raw", title: "Test Item" });
      const itemPath = path.join(itemDir, "item.json");

      // Write initial item
      await writeItem(itemDir, item);

      // Perform many concurrent writes
      const updates = Array.from({ length: 10 }, (_, i) => ({
        ...item,
        title: `Update ${i}`,
        updated_at: new Date().toISOString(),
      }));

      await Promise.all(updates.map((u) => safeWriteJson(itemPath, u)));

      // Final read should return valid JSON, not corrupted
      const finalItem = await readItem(itemDir);

      expect(finalItem.schema_version).toBe(1);
      expect(finalItem.id).toBe("test/001-test");
      expect(finalItem.title).toMatch(/^Update \d$/);
    });
  });

  describe("read during write", () => {
    it("reads complete data even during concurrent writes", async () => {
      const item = makeItem({ state: "raw" });
      await writeItem(itemDir, item);

      // Start multiple read/write cycles
      const operations: Promise<void>[] = [];

      for (let i = 0; i < 5; i++) {
        // Writer
        operations.push(
          writeItem(itemDir, { ...item, title: `Write ${i}` })
        );
        // Reader
        operations.push(
          readItem(itemDir).then((readItem) => {
            // Each read should return a complete, valid item
            expect(readItem.schema_version).toBe(1);
            expect(readItem.id).toBe("test/001-test");
          })
        );
      }

      await Promise.all(operations);

      // Final state should be valid
      const finalItem = await readItem(itemDir);
      expect(finalItem.schema_version).toBe(1);
    });
  });

  describe("external modification detection", () => {
    it("detects when item.json was modified externally", async () => {
      const item = makeItem({ state: "raw", title: "Original" });
      await writeItem(itemDir, item);

      // Read the item
      const readItem1 = await readItem(itemDir);
      expect(readItem1.title).toBe("Original");

      // Simulate external modification (like another process)
      const modifiedItem = { ...item, title: "Externally Modified" };
      await writeItem(itemDir, modifiedItem);

      // Read again - should see the modified version
      const readItem2 = await readItem(itemDir);
      expect(readItem2.title).toBe("Externally Modified");
    });
  });
});

describe("file locking scenarios", () => {
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

  it("handles rapid sequential updates", async () => {
    const item = makeItem();
    await writeItem(itemDir, item);

    // Rapid sequential updates
    for (let i = 0; i < 20; i++) {
      const updated = { ...item, title: `Rapid Update ${i}`, updated_at: new Date().toISOString() };
      await writeItem(itemDir, updated);
    }

    const finalItem = await readItem(itemDir);
    expect(finalItem.title).toBe("Rapid Update 19");
  });
});
