import { describe, expect, it, beforeEach, afterEach, spyOn } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { listCommand } from "../../commands/list";
import type { Logger } from "../../logging";
import type { Item } from "../../schemas";

function createMockLogger() {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    json: () => {},
  } satisfies Logger;
}

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

describe("listCommand", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-list-test-"));
    await fs.mkdir(path.join(tempDir, ".wreckit"), { recursive: true });
    await fs.mkdir(path.join(tempDir, ".git"), { recursive: true });
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("shows 'No items found' for empty .wreckit", async () => {
    const logger = createMockLogger();
    const consoleSpy = spyOn(console, "log");

    await listCommand({}, logger);

    expect(consoleSpy).toHaveBeenCalledWith("No items found");
    consoleSpy.mockRestore();
  });

  it("lists all items with state and title", async () => {
    await createItem(tempDir, "features", "001-auth", "raw");
    await createItem(tempDir, "features", "002-api", "researched");
    await createItem(tempDir, "bugs", "001-crash", "planned");

    const logger = createMockLogger();
    const consoleSpy = spyOn(console, "log");

    await listCommand({}, logger);

    const calls = consoleSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.includes("crash"))).toBe(true);
    expect(calls.some((c) => c.includes("auth"))).toBe(true);
    expect(calls.some((c) => c.includes("planned"))).toBe(true);
    expect(calls.some((c) => c.includes("Total: 3 item(s)"))).toBe(true);

    consoleSpy.mockRestore();
  });

  it("filters by state when --state option provided", async () => {
    await createItem(tempDir, "features", "001-auth", "raw");
    await createItem(tempDir, "features", "002-api", "researched");
    await createItem(tempDir, "bugs", "001-crash", "planned");

    const logger = createMockLogger();
    const consoleSpy = spyOn(console, "log");

    await listCommand({ state: "raw" }, logger);

    const calls = consoleSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.includes("auth"))).toBe(true);
    expect(calls.some((c) => c.includes("researched"))).toBe(false);
    expect(calls.some((c) => c.includes("Total: 1 item(s)"))).toBe(true);

    consoleSpy.mockRestore();
  });

  it("outputs JSON when --json option provided", async () => {
    await createItem(tempDir, "features", "001-auth", "raw");
    await createItem(tempDir, "bugs", "001-crash", "planned");

    const logger = createMockLogger();
    const consoleSpy = spyOn(console, "log");

    await listCommand({ json: true }, logger);

    const output = consoleSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output);

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].id).toBe(1);
    expect(parsed[0].fullId).toBe("bugs/001-crash");
    expect(parsed[1].id).toBe(2);
    expect(parsed[1].fullId).toBe("features/001-auth");

    consoleSpy.mockRestore();
  });

  it("lists items sorted by id with short numeric IDs", async () => {
    await createItem(tempDir, "features", "002-second", "raw");
    await createItem(tempDir, "bugs", "001-first", "raw");
    await createItem(tempDir, "features", "001-first", "raw");

    const logger = createMockLogger();
    const consoleSpy = spyOn(console, "log");

    await listCommand({}, logger);

    const calls = consoleSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => /^\s*1\s+raw\s+first/.test(c))).toBe(true);
    expect(calls.some((c) => /^\s*2\s+raw\s+first/.test(c))).toBe(true);
    expect(calls.some((c) => /^\s*3\s+raw\s+second/.test(c))).toBe(true);

    consoleSpy.mockRestore();
  });
});
