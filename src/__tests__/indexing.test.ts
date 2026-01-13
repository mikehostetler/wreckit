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
  listSections,
  parseItemId,
  formatItemId,
} from "../domain/indexing";

function createValidItem(overrides: Partial<Item> = {}): Item {
  return {
    schema_version: 1,
    id: "features/001-test",
    title: "Test Feature",
    section: "features",
    state: "raw",
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
  const wreckitDir = path.join(root, ".wreckit");
  await fs.mkdir(wreckitDir, { recursive: true });

  for (const { id, item } of items) {
    const [section, slug] = id.split("/");
    const itemDir = path.join(wreckitDir, section, slug);
    await fs.mkdir(itemDir, { recursive: true });

    const fullItem = createValidItem({
      id,
      section,
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
    const result = parseItemId("features/001-dark-mode");
    expect(result).toEqual({
      section: "features",
      number: "001",
      slug: "dark-mode",
    });
  });

  it("parses ID with multi-digit number", () => {
    const result = parseItemId("bugs/123-fix-issue");
    expect(result).toEqual({
      section: "bugs",
      number: "123",
      slug: "fix-issue",
    });
  });

  it("returns null for invalid ID without slash", () => {
    expect(parseItemId("invalid")).toBeNull();
  });

  it("returns null for ID without number prefix", () => {
    expect(parseItemId("features/no-number")).toBeNull();
  });

  it("returns null for ID with too many slashes", () => {
    expect(parseItemId("a/b/c")).toBeNull();
  });
});

describe("formatItemId", () => {
  it("formats components into ID", () => {
    const result = formatItemId("features", "001", "dark-mode");
    expect(result).toBe("features/001-dark-mode");
  });

  it("round-trips with parseItemId", () => {
    const original = { section: "bugs", number: "042", slug: "fix-login" };
    const id = formatItemId(original.section, original.number, original.slug);
    const parsed = parseItemId(id);
    expect(parsed).toEqual(original);
  });
});

describe("toIndexItem", () => {
  it("converts Item to IndexItem", () => {
    const item = createValidItem({
      id: "features/001-auth",
      title: "Auth Feature",
      state: "planned",
    });

    const result = toIndexItem(item);

    expect(result).toEqual({
      id: "features/001-auth",
      title: "Auth Feature",
      state: "planned",
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
      createValidItem({ id: "features/001-a", title: "A", state: "raw" }),
      createValidItem({ id: "bugs/002-b", title: "B", state: "done" }),
    ];

    const result = buildIndex(items);

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual({ id: "features/001-a", title: "A", state: "raw" });
    expect(result.items[1]).toEqual({ id: "bugs/002-b", title: "B", state: "done" });
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
    await fs.mkdir(path.join(tempDir, ".wreckit"));

    const result = await scanItems(tempDir);

    expect(result).toEqual([]);
  });

  it("returns empty array when .wreckit does not exist", async () => {
    const result = await scanItems(tempDir);

    expect(result).toEqual([]);
  });

  it("returns single item from single section", async () => {
    await createTestFixture(tempDir, [
      { id: "features/001-auth", item: { title: "Auth" } },
    ]);

    const result = await scanItems(tempDir);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("features/001-auth");
    expect(result[0].title).toBe("Auth");
  });

  it("returns multiple items from multiple sections sorted", async () => {
    await createTestFixture(tempDir, [
      { id: "bugs/002-fix", item: { title: "Fix" } },
      { id: "features/001-auth", item: { title: "Auth" } },
      { id: "features/002-profile", item: { title: "Profile" } },
      { id: "bugs/001-crash", item: { title: "Crash" } },
    ]);

    const result = await scanItems(tempDir);

    expect(result).toHaveLength(4);
    expect(result.map((i) => i.id)).toEqual([
      "bugs/001-crash",
      "bugs/002-fix",
      "features/001-auth",
      "features/002-profile",
    ]);
  });

  it("skips invalid item.json files with warning", async () => {
    await createTestFixture(tempDir, [
      { id: "features/001-valid", item: { title: "Valid" } },
    ]);

    const invalidDir = path.join(tempDir, ".wreckit", "features", "002-invalid");
    await fs.mkdir(invalidDir, { recursive: true });
    await fs.writeFile(
      path.join(invalidDir, "item.json"),
      JSON.stringify({ invalid: "data" })
    );

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await scanItems(tempDir);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("features/001-valid");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Skipping invalid item")
    );

    warnSpy.mockRestore();
  });

  it("ignores prompts directory", async () => {
    await createTestFixture(tempDir, [
      { id: "features/001-auth", item: { title: "Auth" } },
    ]);

    const promptsDir = path.join(tempDir, ".wreckit", "prompts");
    await fs.mkdir(promptsDir, { recursive: true });
    await fs.writeFile(path.join(promptsDir, "template.md"), "# Template");

    const result = await scanItems(tempDir);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("features/001-auth");
  });

  it("ignores JSON files in .wreckit root", async () => {
    await createTestFixture(tempDir, [
      { id: "features/001-auth", item: { title: "Auth" } },
    ]);

    await fs.writeFile(
      path.join(tempDir, ".wreckit", "config.json"),
      JSON.stringify({ some: "config" })
    );

    const result = await scanItems(tempDir);

    expect(result).toHaveLength(1);
  });

  it("ignores directories without number prefix", async () => {
    await createTestFixture(tempDir, [
      { id: "features/001-auth", item: { title: "Auth" } },
    ]);

    const invalidDir = path.join(tempDir, ".wreckit", "features", "no-number-prefix");
    await fs.mkdir(invalidDir, { recursive: true });
    await fs.writeFile(
      path.join(invalidDir, "item.json"),
      JSON.stringify(createValidItem())
    );

    const result = await scanItems(tempDir);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("features/001-auth");
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
      { id: "features/001-auth", item: { title: "Auth" } },
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
      { id: "features/001-new", item: { title: "New" } },
    ]);

    const result = await refreshIndex(tempDir);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe("features/001-new");
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
      { id: "features/001-auth", item: { title: "Auth Feature" } },
    ]);

    const result = await getItem(tempDir, "features/001-auth");

    expect(result).not.toBeNull();
    expect(result?.id).toBe("features/001-auth");
    expect(result?.title).toBe("Auth Feature");
  });

  it("returns null for non-existent ID", async () => {
    await fs.mkdir(path.join(tempDir, ".wreckit"));

    const result = await getItem(tempDir, "features/999-nonexistent");

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
      { id: "features/001-auth", item: {} },
    ]);

    const result = await itemExists(tempDir, "features/001-auth");

    expect(result).toBe(true);
  });

  it("returns false when item does not exist", async () => {
    await fs.mkdir(path.join(tempDir, ".wreckit"));

    const result = await itemExists(tempDir, "features/999-missing");

    expect(result).toBe(false);
  });
});

describe("listSections", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-sections-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("returns empty array when .wreckit does not exist", async () => {
    const result = await listSections(tempDir);

    expect(result).toEqual([]);
  });

  it("returns empty array for empty .wreckit", async () => {
    await fs.mkdir(path.join(tempDir, ".wreckit"));

    const result = await listSections(tempDir);

    expect(result).toEqual([]);
  });

  it("returns section names for directories with items", async () => {
    await createTestFixture(tempDir, [
      { id: "features/001-auth", item: {} },
      { id: "bugs/001-crash", item: {} },
    ]);

    const result = await listSections(tempDir);

    expect(result).toEqual(["bugs", "features"]);
  });

  it("excludes prompts directory", async () => {
    await createTestFixture(tempDir, [
      { id: "features/001-auth", item: {} },
    ]);

    const promptsDir = path.join(tempDir, ".wreckit", "prompts");
    await fs.mkdir(promptsDir, { recursive: true });

    const result = await listSections(tempDir);

    expect(result).toEqual(["features"]);
    expect(result).not.toContain("prompts");
  });

  it("excludes JSON files", async () => {
    await createTestFixture(tempDir, [
      { id: "features/001-auth", item: {} },
    ]);

    await fs.writeFile(
      path.join(tempDir, ".wreckit", "config.json"),
      "{}"
    );

    const result = await listSections(tempDir);

    expect(result).toEqual(["features"]);
  });

  it("excludes directories without item subdirectories", async () => {
    await createTestFixture(tempDir, [
      { id: "features/001-auth", item: {} },
    ]);

    const emptySection = path.join(tempDir, ".wreckit", "empty-section");
    await fs.mkdir(emptySection, { recursive: true });
    await fs.writeFile(path.join(emptySection, "readme.md"), "# Empty");

    const result = await listSections(tempDir);

    expect(result).toEqual(["features"]);
  });
});
