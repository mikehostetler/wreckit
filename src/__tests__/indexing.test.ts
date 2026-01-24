import { describe, it, expect, beforeEach, afterEach, mock, spyOn, vi } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { Item } from "../schemas";
import {
  scanItems,
  buildIndex,
  toIndexItem,
  refreshIndex,
  getItem,
  itemExists,
  parseItemId,
  formatItemId,
} from "../domain/indexing";

function createValidItem(overrides: Partial<Item> = {}): Item {
  return {
    schema_version: 1,
    id: "001-test",
    title: "Test Feature",
    state: "idea",
    overview: "Test overview",
    branch: null,
    pr_url: null,
    pr_number: null,
    last_error: null,
    created_at: "2025-01-12T00:00:00Z",
    updated_at: "2025-01-12T00:00:00Z",
    ...overrides,
  };
}

async function createTestFixture(
  root: string,
  items: Array<{ id: string; item: Partial<Item> }>
): Promise<void> {
  const itemsDir = path.join(root, ".wreckit", "items");
  await fs.mkdir(itemsDir, { recursive: true });

  for (const { id, item } of items) {
    const itemDir = path.join(itemsDir, id);
    await fs.mkdir(itemDir, { recursive: true });

    const fullItem = createValidItem({
      id,
      ...item,
    });

    await fs.writeFile(
      path.join(itemDir, "item.json"),
      JSON.stringify(fullItem, null, 2)
    );
  }
}

describe("parseItemId", () => {
  it("parses valid ID", () => {
    const result = parseItemId("001-dark-mode");
    expect(result).toEqual({
      number: "001",
      slug: "dark-mode",
    });
  });

  it("parses ID with multi-digit number", () => {
    const result = parseItemId("123-fix-issue");
    expect(result).toEqual({
      number: "123",
      slug: "fix-issue",
    });
  });

  it("returns null for invalid ID without number prefix", () => {
    expect(parseItemId("no-number")).toBeNull();
  });
});

describe("formatItemId", () => {
  it("formats components into ID", () => {
    const result = formatItemId("001", "dark-mode");
    expect(result).toBe("001-dark-mode");
  });

  it("round-trips with parseItemId", () => {
    const original = { number: "042", slug: "fix-login" };
    const id = formatItemId(original.number, original.slug);
    const parsed = parseItemId(id);
    expect(parsed).toEqual(original);
  });
});

describe("toIndexItem", () => {
  it("converts Item to IndexItem", () => {
    const item = createValidItem({
      id: "001-auth",
      title: "Auth Feature",
      state: "planned",
    });

    const result = toIndexItem(item);

    expect(result).toEqual({
      id: "001-auth",
      title: "Auth Feature",
      state: "planned",
      depends_on: undefined,
    });
  });

  it("includes depends_on when present", () => {
    const item = createValidItem({
      id: "002-tests",
      title: "Add Tests",
      state: "idea",
      depends_on: ["001-auth"],
    });

    const result = toIndexItem(item);

    expect(result).toEqual({
      id: "002-tests",
      title: "Add Tests",
      state: "idea",
      depends_on: ["001-auth"],
    });
  });
});

describe("buildIndex", () => {
  it("builds empty index from empty array", () => {
    const result = buildIndex([]);

    expect(result.schema_version).toBe(1);
    expect(result.items).toEqual([]);
    expect(result.generated_at).toBeDefined();
    expect(new Date(result.generated_at).toISOString()).toBe(result.generated_at);
  });

  it("builds index with items", () => {
    const items = [
      createValidItem({ id: "001-a", title: "A", state: "idea" }),
      createValidItem({ id: "002-b", title: "B", state: "done" }),
    ];

    const result = buildIndex(items);

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual({ id: "001-a", title: "A", state: "idea", depends_on: undefined });
    expect(result.items[1]).toEqual({ id: "002-b", title: "B", state: "done", depends_on: undefined });
  });

  it("sets generated_at to current ISO timestamp", () => {
    const before = new Date().toISOString();
    const result = buildIndex([]);
    const after = new Date().toISOString();

    expect(result.generated_at >= before).toBe(true);
    expect(result.generated_at <= after).toBe(true);
  });
});

describe("scanItems", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-scan-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("returns empty array for empty .wreckit", async () => {
    await fs.mkdir(path.join(tempDir, ".wreckit", "items"), { recursive: true });

    const result = await scanItems(tempDir);

    expect(result).toEqual([]);
  });

  it("returns empty array when .wreckit does not exist", async () => {
    const result = await scanItems(tempDir);

    expect(result).toEqual([]);
  });

  it("returns single item", async () => {
    await createTestFixture(tempDir, [
      { id: "001-auth", item: { title: "Auth" } },
    ]);

    const result = await scanItems(tempDir);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("001-auth");
    expect(result[0].title).toBe("Auth");
  });

  it("returns multiple items sorted by number", async () => {
    await createTestFixture(tempDir, [
      { id: "002-fix", item: { title: "Fix" } },
      { id: "001-auth", item: { title: "Auth" } },
      { id: "003-profile", item: { title: "Profile" } },
    ]);

    const result = await scanItems(tempDir);

    expect(result).toHaveLength(3);
    expect(result.map((i) => i.id)).toEqual([
      "001-auth",
      "002-fix",
      "003-profile",
    ]);
  });

  it("skips invalid item.json files with warning", async () => {
    await createTestFixture(tempDir, [
      { id: "001-valid", item: { title: "Valid" } },
    ]);

    const invalidDir = path.join(tempDir, ".wreckit", "items", "002-invalid");
    await fs.mkdir(invalidDir, { recursive: true });
    await fs.writeFile(
      path.join(invalidDir, "item.json"),
      JSON.stringify({ invalid: "data" })
    );

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await scanItems(tempDir);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("001-valid");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Skipping invalid item")
    );

    warnSpy.mockRestore();
  });

  it("ignores directories without number prefix", async () => {
    await createTestFixture(tempDir, [
      { id: "001-auth", item: { title: "Auth" } },
    ]);

    const invalidDir = path.join(tempDir, ".wreckit", "items", "no-number-prefix");
    await fs.mkdir(invalidDir, { recursive: true });
    await fs.writeFile(
      path.join(invalidDir, "item.json"),
      JSON.stringify(createValidItem())
    );

    const result = await scanItems(tempDir);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("001-auth");
  });
});

describe("refreshIndex", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-refresh-test-"));
    await fs.mkdir(path.join(tempDir, ".wreckit"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("creates index.json if it does not exist", async () => {
    await createTestFixture(tempDir, [
      { id: "001-auth", item: { title: "Auth" } },
    ]);

    const result = await refreshIndex(tempDir);

    expect(result.items).toHaveLength(1);

    const indexPath = path.join(tempDir, ".wreckit", "index.json");
    const content = await fs.readFile(indexPath, "utf-8");
    const saved = JSON.parse(content);
    expect(saved.items).toHaveLength(1);
  });

  it("updates existing index.json with current state", async () => {
    await fs.writeFile(
      path.join(tempDir, ".wreckit", "index.json"),
      JSON.stringify({ schema_version: 1, items: [], generated_at: "old" })
    );

    await createTestFixture(tempDir, [
      { id: "001-new", item: { title: "New" } },
    ]);

    const result = await refreshIndex(tempDir);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe("001-new");
  });

  it("returns valid Index object", async () => {
    const result = await refreshIndex(tempDir);

    expect(result.schema_version).toBe(1);
    expect(Array.isArray(result.items)).toBe(true);
    expect(typeof result.generated_at).toBe("string");
  });
});

describe("getItem", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-getitem-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("returns Item for valid ID", async () => {
    await createTestFixture(tempDir, [
      { id: "001-auth", item: { title: "Auth Feature" } },
    ]);

    const result = await getItem(tempDir, "001-auth");

    expect(result).not.toBeNull();
    expect(result?.id).toBe("001-auth");
    expect(result?.title).toBe("Auth Feature");
  });

  it("returns null for non-existent ID", async () => {
    await fs.mkdir(path.join(tempDir, ".wreckit", "items"), { recursive: true });

    const result = await getItem(tempDir, "999-nonexistent");

    expect(result).toBeNull();
  });
});

describe("itemExists", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-exists-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("returns true when item exists", async () => {
    await createTestFixture(tempDir, [
      { id: "001-auth", item: {} },
    ]);

    const result = await itemExists(tempDir, "001-auth");

    expect(result).toBe(true);
  });

  it("returns false when item does not exist", async () => {
    await fs.mkdir(path.join(tempDir, ".wreckit", "items"), { recursive: true });

    const result = await itemExists(tempDir, "999-missing");

    expect(result).toBe(false);
  });
});
