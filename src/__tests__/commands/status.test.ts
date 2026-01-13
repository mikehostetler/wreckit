import { describe, expect, it, beforeEach, afterEach, mock, spyOn, vi } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { statusCommand, scanItems } from "../../commands/status";
import type { Logger } from "../../logging";
import type { Item, Index } from "../../schemas";

function createMockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    json: vi.fn(),
  } satisfies Logger;
}

async function createItem(root: string, section: string, slug: string, state: string = "raw"): Promise<Item> {
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

describe("scanItems", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-test-"));
    await fs.mkdir(path.join(tempDir, ".wreckit"), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("returns empty array for empty .wreckit", async () => {
    const items = await scanItems(tempDir);
    expect(items).toHaveLength(0);
  });

  it("returns items sorted by id", async () => {
    await createItem(tempDir, "features", "002-second");
    await createItem(tempDir, "bugs", "001-first-bug");
    await createItem(tempDir, "features", "001-first");

    const items = await scanItems(tempDir);
    expect(items).toHaveLength(3);
    expect(items[0].id).toBe("bugs/001-first-bug");
    expect(items[1].id).toBe("features/001-first");
    expect(items[2].id).toBe("features/002-second");
  });

  it("returns correct item properties", async () => {
    await createItem(tempDir, "features", "001-test", "researched");

    const items = await scanItems(tempDir);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("features/001-test");
    expect(items[0].state).toBe("researched");
    expect(items[0].title).toBe("test");
  });

  it("skips prompts directory", async () => {
    await fs.mkdir(path.join(tempDir, ".wreckit", "prompts"), { recursive: true });
    await createItem(tempDir, "features", "001-test");

    const items = await scanItems(tempDir);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("features/001-test");
  });

  it("skips directories not matching item pattern", async () => {
    await fs.mkdir(path.join(tempDir, ".wreckit", "features", "not-an-item"), { recursive: true });
    await createItem(tempDir, "features", "001-valid");

    const items = await scanItems(tempDir);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("features/001-valid");
  });
});

describe("statusCommand", () => {
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

  it("shows 'No items found' for empty .wreckit", async () => {
    const logger = createMockLogger();
    await statusCommand({}, logger);

    expect(logger.info).toHaveBeenCalledWith("No items found");
  });

  it("shows multiple items with correct states", async () => {
    await createItem(tempDir, "foundation", "001-core-types", "raw");
    await createItem(tempDir, "foundation", "002-api-layer", "researched");
    await createItem(tempDir, "features", "001-auth", "planned");

    const logger = createMockLogger();
    await statusCommand({}, logger);

    const calls = logger.info.mock.calls.map((c) => c[0]);
    expect(calls.some((c) => c.includes("foundation/001-core-types") && c.includes("raw"))).toBe(true);
    expect(calls.some((c) => c.includes("foundation/002-api-layer") && c.includes("researched"))).toBe(true);
    expect(calls.some((c) => c.includes("features/001-auth") && c.includes("planned"))).toBe(true);
  });

  it("outputs valid Index JSON with --json", async () => {
    await createItem(tempDir, "features", "001-test", "raw");
    await createItem(tempDir, "bugs", "001-bug", "done");

    const logger = createMockLogger();
    await statusCommand({ json: true }, logger);

    expect(logger.json).toHaveBeenCalledTimes(1);
    const output = logger.json.mock.calls[0][0] as Index;

    expect(output.schema_version).toBe(1);
    expect(output.items).toHaveLength(2);
    expect(output.generated_at).toBeDefined();
    expect(output.items[0].id).toBe("bugs/001-bug");
    expect(output.items[1].id).toBe("features/001-test");
  });

  it("items are sorted by section/number", async () => {
    await createItem(tempDir, "features", "002-second");
    await createItem(tempDir, "bugs", "001-first");
    await createItem(tempDir, "features", "001-first");

    const logger = createMockLogger();
    await statusCommand({ json: true }, logger);

    const output = logger.json.mock.calls[0][0] as Index;
    expect(output.items[0].id).toBe("bugs/001-first");
    expect(output.items[1].id).toBe("features/001-first");
    expect(output.items[2].id).toBe("features/002-second");
  });
});
