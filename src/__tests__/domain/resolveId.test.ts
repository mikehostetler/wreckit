import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { resolveId, buildIdMap } from "../../domain/resolveId";
import { AmbiguousIdError, ItemNotFoundError } from "../../errors";
import type { Item } from "../../schemas";

async function createItem(
  root: string,
  slug: string,
  state: string = "idea",
): Promise<Item> {
  const itemDir = path.join(root, ".wreckit", "items", slug);
  await fs.mkdir(itemDir, { recursive: true });

  const item: Item = {
    schema_version: 1,
    id: slug,
    title: slug.replace(/^\d+-/, "").replace(/-/g, " "),
    state: state as Item["state"],
    overview: "",
    branch: null,
    pr_url: null,
    pr_number: null,
    last_error: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await fs.writeFile(
    path.join(itemDir, "item.json"),
    JSON.stringify(item, null, 2),
  );
  return item;
}

describe("resolveId", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-resolve-test-"));
    await fs.mkdir(path.join(tempDir, ".wreckit", "items"), {
      recursive: true,
    });
    await fs.mkdir(path.join(tempDir, ".git"), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("Exact match (Tier 1)", () => {
    it("resolves exact full ID match", async () => {
      await createItem(tempDir, "001-crash");
      await createItem(tempDir, "002-auth");

      const result = await resolveId(tempDir, "001-crash");
      expect(result).toBe("001-crash");

      const result2 = await resolveId(tempDir, "002-auth");
      expect(result2).toBe("002-auth");
    });
  });

  describe("Numeric prefix match (Tier 2)", () => {
    it("resolves numeric ID to full ID", async () => {
      await createItem(tempDir, "001-crash");
      await createItem(tempDir, "002-auth");

      const result = await resolveId(tempDir, "1");
      expect(result).toBe("001-crash");

      const result2 = await resolveId(tempDir, "2");
      expect(result2).toBe("002-auth");
    });

    it("resolves zero-padded numeric ID to full ID", async () => {
      await createItem(tempDir, "001-crash");
      await createItem(tempDir, "010-auth");

      const result = await resolveId(tempDir, "001");
      expect(result).toBe("001-crash");

      const result2 = await resolveId(tempDir, "010");
      expect(result2).toBe("010-auth");
    });

    it("throws ItemNotFoundError for non-existent numeric ID", async () => {
      await createItem(tempDir, "001-auth");

      await expect(resolveId(tempDir, "99")).rejects.toThrow(ItemNotFoundError);
      await expect(resolveId(tempDir, "99")).rejects.toThrow("Item not found");
    });
  });

  describe("Slug suffix match (Tier 3)", () => {
    it("resolves slug suffix to full ID", async () => {
      await createItem(tempDir, "001-crash");
      await createItem(tempDir, "002-auth");

      const result = await resolveId(tempDir, "crash");
      expect(result).toBe("001-crash");

      const result2 = await resolveId(tempDir, "auth");
      expect(result2).toBe("002-auth");
    });

    it("resolves slug suffix case-insensitively", async () => {
      await createItem(tempDir, "001-dark-mode");

      const result = await resolveId(tempDir, "DARK-MODE");
      expect(result).toBe("001-dark-mode");

      const result2 = await resolveId(tempDir, "Dark-Mode");
      expect(result2).toBe("001-dark-mode");
    });

    it("throws ItemNotFoundError for non-existent slug", async () => {
      await createItem(tempDir, "001-auth");

      await expect(resolveId(tempDir, "nonexistent")).rejects.toThrow(
        ItemNotFoundError,
      );
      await expect(resolveId(tempDir, "nonexistent")).rejects.toThrow(
        "Item not found",
      );
    });
  });

  describe("Ambiguity detection", () => {
    it("throws AmbiguousIdError when numeric prefix matches multiple items", async () => {
      // This is an edge case - normally numeric prefixes should be unique
      // But testing the detection mechanism
      await createItem(tempDir, "001-feature-a");
      await createItem(tempDir, "001-feature-b");

      try {
        await resolveId(tempDir, "1");
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(AmbiguousIdError);
        const ambigError = error as AmbiguousIdError;
        expect(ambigError.input).toBe("1");
        expect(ambigError.matches).toContain("001-feature-a");
        expect(ambigError.matches).toContain("001-feature-b");
        expect(ambigError.message).toContain("Ambiguous ID");
        expect(ambigError.message).toContain("001-feature-a");
        expect(ambigError.message).toContain("001-feature-b");
      }
    });

    it("throws AmbiguousIdError when slug suffix matches multiple items", async () => {
      await createItem(tempDir, "001-dark-mode");
      await createItem(tempDir, "002-dark-mode");

      try {
        await resolveId(tempDir, "dark-mode");
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(AmbiguousIdError);
        const ambigError = error as AmbiguousIdError;
        expect(ambigError.input).toBe("dark-mode");
        expect(ambigError.matches).toContain("001-dark-mode");
        expect(ambigError.matches).toContain("002-dark-mode");
        expect(ambigError.code).toBe("AMBIGUOUS_ID");
      }
    });
  });

  describe("Resolution priority order", () => {
    it("prefers exact match over numeric prefix", async () => {
      // Create an item where the full ID could also be interpreted as numeric
      await createItem(tempDir, "001-feature");
      await createItem(tempDir, "001-feature-extended");

      // Exact match should win
      const result = await resolveId(tempDir, "001-feature");
      expect(result).toBe("001-feature");
    });

    it("prefers numeric prefix over slug suffix when both could match", async () => {
      await createItem(tempDir, "001-auth");
      await createItem(tempDir, "002-1"); // slug is "1"

      // "1" should match numeric prefix (001-auth), not slug suffix (002-1)
      const result = await resolveId(tempDir, "1");
      expect(result).toBe("001-auth");
    });
  });
});

describe("buildIdMap", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-idmap-test-"));
    await fs.mkdir(path.join(tempDir, ".wreckit", "items"), {
      recursive: true,
    });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("builds map with sequential short IDs", async () => {
    await createItem(tempDir, "001-crash", "planned");
    await createItem(tempDir, "002-auth", "idea");
    await createItem(tempDir, "003-api", "researched");

    const map = await buildIdMap(tempDir);

    expect(map).toHaveLength(3);
    expect(map[0]).toEqual({
      shortId: 1,
      fullId: "001-crash",
      title: "crash",
      state: "planned",
    });
    expect(map[1]).toEqual({
      shortId: 2,
      fullId: "002-auth",
      title: "auth",
      state: "idea",
    });
    expect(map[2]).toEqual({
      shortId: 3,
      fullId: "003-api",
      title: "api",
      state: "researched",
    });
  });
});
