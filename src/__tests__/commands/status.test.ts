import {
  describe,
  expect,
  it,
  beforeEach,
  afterEach,
  mock,
  spyOn,
  vi,
  setSystemTime,
} from "bun:test";
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

describe("scanItems", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-test-"));
    await fs.mkdir(path.join(tempDir, ".wreckit", "items"), {
      recursive: true,
    });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("returns empty array for empty items dir", async () => {
    const items = await scanItems(tempDir);
    expect(items).toHaveLength(0);
  });

  it("returns items sorted by id", async () => {
    await createItem(tempDir, "002-second");
    await createItem(tempDir, "001-first");
    await createItem(tempDir, "003-third");

    const items = await scanItems(tempDir);
    expect(items).toHaveLength(3);
    expect(items[0].id).toBe("001-first");
    expect(items[1].id).toBe("002-second");
    expect(items[2].id).toBe("003-third");
  });

  it("returns correct item properties", async () => {
    await createItem(tempDir, "001-test", "researched");

    const items = await scanItems(tempDir);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("001-test");
    expect(items[0].state).toBe("researched");
    expect(items[0].title).toBe("test");
  });

  it("skips directories not matching item pattern", async () => {
    await fs.mkdir(path.join(tempDir, ".wreckit", "items", "not-an-item"), {
      recursive: true,
    });
    await createItem(tempDir, "001-valid");

    const items = await scanItems(tempDir);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("001-valid");
  });
});

describe("statusCommand", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-test-"));
    await fs.mkdir(path.join(tempDir, ".wreckit", "items"), {
      recursive: true,
    });
    await fs.mkdir(path.join(tempDir, ".git"), { recursive: true });
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("shows 'No items found' for empty items dir", async () => {
    const logger = createMockLogger();
    const consoleSpy = spyOn(console, "log");

    await statusCommand({}, logger);

    expect(consoleSpy).toHaveBeenCalledWith("No items found");
    consoleSpy.mockRestore();
  });

  it("shows multiple items with correct states", async () => {
    await createItem(tempDir, "001-core-types", "idea");
    await createItem(tempDir, "002-api-layer", "researched");
    await createItem(tempDir, "003-auth", "planned");

    const logger = createMockLogger();
    const consoleSpy = spyOn(console, "log");

    await statusCommand({}, logger);

    const calls = consoleSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.includes("idea"))).toBe(true);
    expect(calls.some((c) => c.includes("researched"))).toBe(true);
    expect(calls.some((c) => c.includes("planned"))).toBe(true);

    consoleSpy.mockRestore();
  });

  it("outputs valid Index JSON with --json", async () => {
    await createItem(tempDir, "001-test", "idea");
    await createItem(tempDir, "002-bug", "done");

    const logger = createMockLogger();
    await statusCommand({ json: true }, logger);

    expect(logger.json).toHaveBeenCalledTimes(1);
    const output = logger.json.mock.calls[0][0] as {
      schema_version: number;
      items: { id: number; fullId: string }[];
      generated_at: string;
    };

    expect(output.schema_version).toBe(1);
    expect(output.items).toHaveLength(2);
    expect(output.generated_at).toBeDefined();
    expect(output.items[0].id).toBe(1);
    expect(output.items[0].fullId).toBe("001-test");
    expect(output.items[1].id).toBe(2);
    expect(output.items[1].fullId).toBe("002-bug");
  });

  it("items are sorted by number", async () => {
    await createItem(tempDir, "002-second");
    await createItem(tempDir, "001-first");
    await createItem(tempDir, "003-third");

    const logger = createMockLogger();
    await statusCommand({ json: true }, logger);

    const output = logger.json.mock.calls[0][0] as {
      items: { id: number; fullId: string }[];
    };
    expect(output.items[0].fullId).toBe("001-first");
    expect(output.items[1].fullId).toBe("002-second");
    expect(output.items[2].fullId).toBe("003-third");
  });
});
