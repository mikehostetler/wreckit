import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { resolveId, buildIdMap } from "../../domain/resolveId";
import type { Item } from "../../schemas";

async function createItem(
  root: string,
  section: string,
  slug: string,
  state: string = "raw"
): Promise<Item> {
  const itemDir = path.join(root, ".wreckit", section, slug);
  await fs.mkdir(itemDir, { recursive: true });

  const item: Item = {
    schema_version: 1,
    id: `${section}/${slug}`,
    title: slug.replace(/^\d+-/, "").replace(/-/g, " "),
    section,
    state: state as Item["state"],
    overview: "",
    branch: null,
    pr_url: null,
    pr_number: null,
    last_error: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await fs.writeFile(path.join(itemDir, "item.json"), JSON.stringify(item, null, 2));
  return item;
}

describe("resolveId", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-resolve-test-"));
    await fs.mkdir(path.join(tempDir, ".wreckit"), { recursive: true });
    await fs.mkdir(path.join(tempDir, ".git"), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("passes through full IDs unchanged", async () => {
    await createItem(tempDir, "features", "001-auth");
    const result = await resolveId(tempDir, "features/001-auth");
    expect(result).toBe("features/001-auth");
  });

  it("resolves numeric ID to full ID", async () => {
    await createItem(tempDir, "bugs", "001-crash");
    await createItem(tempDir, "features", "001-auth");

    const result = await resolveId(tempDir, "1");
    expect(result).toBe("bugs/001-crash");

    const result2 = await resolveId(tempDir, "2");
    expect(result2).toBe("features/001-auth");
  });

  it("throws for invalid numeric ID", async () => {
    await createItem(tempDir, "features", "001-auth");

    await expect(resolveId(tempDir, "99")).rejects.toThrow("Item #99 not found");
  });

  it("throws for non-numeric, non-full ID", async () => {
    await expect(resolveId(tempDir, "abc")).rejects.toThrow("Invalid item ID");
  });
});

describe("buildIdMap", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-idmap-test-"));
    await fs.mkdir(path.join(tempDir, ".wreckit"), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("builds map with sequential short IDs", async () => {
    await createItem(tempDir, "bugs", "001-crash", "planned");
    await createItem(tempDir, "features", "001-auth", "raw");
    await createItem(tempDir, "features", "002-api", "researched");

    const map = await buildIdMap(tempDir);

    expect(map).toHaveLength(3);
    expect(map[0]).toEqual({
      shortId: 1,
      fullId: "bugs/001-crash",
      title: "crash",
      state: "planned",
    });
    expect(map[1]).toEqual({
      shortId: 2,
      fullId: "features/001-auth",
      title: "auth",
      state: "raw",
    });
    expect(map[2]).toEqual({
      shortId: 3,
      fullId: "features/002-api",
      title: "api",
      state: "researched",
    });
  });
});
