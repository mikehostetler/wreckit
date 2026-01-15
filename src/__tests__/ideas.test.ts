import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  parseIdeasFromText,
  generateSlug,
  allocateItemId,
  createItemFromIdea,
  persistItems,
  ingestIdeas,
  type ParsedIdea,
} from "../domain/ideas";

describe("parseIdeasFromText", () => {
  it("single line becomes single idea", () => {
    const result = parseIdeasFromText("Add dark mode");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Add dark mode");
    expect(result[0].overview).toBe("");
  });

  it("multiple lines become multiple ideas", () => {
    const result = parseIdeasFromText("First idea\n\nSecond idea");
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("First idea");
    expect(result[1].title).toBe("Second idea");
  });

  it("markdown headers become titles", () => {
    const result = parseIdeasFromText("# Add dark mode\n## Fix login bug");
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("Add dark mode");
    expect(result[1].title).toBe("Fix login bug");
  });

  it("bullet points become separate items", () => {
    const result = parseIdeasFromText("- First item\n- Second item\n* Third item");
    expect(result).toHaveLength(3);
    expect(result[0].title).toBe("First item");
    expect(result[1].title).toBe("Second item");
    expect(result[2].title).toBe("Third item");
  });

  it("empty lines separate items", () => {
    const result = parseIdeasFromText("First\n\nSecond\n\nThird");
    expect(result).toHaveLength(3);
  });

  it("consecutive lines become title + overview", () => {
    const result = parseIdeasFromText(
      "# Add dark mode\nAllow users to toggle between themes\nThis is important for accessibility"
    );
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Add dark mode");
    expect(result[0].overview).toBe(
      "Allow users to toggle between themes\nThis is important for accessibility"
    );
  });

  it("handles mixed input", () => {
    const input = `# Add dark mode support
Allow users to toggle between light and dark themes

# Fix login timeout
The login page times out after 30 seconds

- Update CI to use Node 20
- Add unit tests for auth module`;

    const result = parseIdeasFromText(input);
    expect(result).toHaveLength(4);
    expect(result[0].title).toBe("Add dark mode support");
    expect(result[0].overview).toBe("Allow users to toggle between light and dark themes");
    expect(result[1].title).toBe("Fix login timeout");
    expect(result[1].overview).toBe("The login page times out after 30 seconds");
    expect(result[2].title).toBe("Update CI to use Node 20");
    expect(result[3].title).toBe("Add unit tests for auth module");
  });
});

describe("generateSlug", () => {
  it("'Add Dark Mode' -> 'add-dark-mode'", () => {
    expect(generateSlug("Add Dark Mode")).toBe("add-dark-mode");
  });

  it("'Fix bug #123' -> 'fix-bug-123'", () => {
    expect(generateSlug("Fix bug #123")).toBe("fix-bug-123");
  });

  it("long title is truncated", () => {
    const longTitle =
      "This is a very long title that should be truncated because it exceeds fifty characters limit";
    const slug = generateSlug(longTitle);
    expect(slug.length).toBeLessThanOrEqual(50);
  });

  it("special characters removed", () => {
    expect(generateSlug("Hello! @World# $Test%")).toBe("hello-world-test");
  });

  it("multiple spaces become single hyphen", () => {
    expect(generateSlug("Hello    World")).toBe("hello-world");
  });

  it("trims leading/trailing hyphens", () => {
    expect(generateSlug("  Hello World  ")).toBe("hello-world");
  });
});

describe("allocateItemId", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-test-"));
    await fs.mkdir(path.join(tempDir, ".wreckit"), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("empty items folder returns 001", async () => {
    const result = await allocateItemId(tempDir, "test-item");
    expect(result.number).toBe("001");
    expect(result.id).toBe("001-test-item");
  });

  it("existing 001 returns 002", async () => {
    const itemsDir = path.join(tempDir, ".wreckit", "items");
    await fs.mkdir(path.join(itemsDir, "001-existing"), { recursive: true });

    const result = await allocateItemId(tempDir, "new-item");
    expect(result.number).toBe("002");
    expect(result.id).toBe("002-new-item");
  });

  it("existing 001, 002 returns 003", async () => {
    const itemsDir = path.join(tempDir, ".wreckit", "items");
    await fs.mkdir(path.join(itemsDir, "001-first"), { recursive: true });
    await fs.mkdir(path.join(itemsDir, "002-second"), { recursive: true });

    const result = await allocateItemId(tempDir, "third");
    expect(result.number).toBe("003");
  });

  it("handles gaps (001, 003 -> 004)", async () => {
    const itemsDir = path.join(tempDir, ".wreckit", "items");
    await fs.mkdir(path.join(itemsDir, "001-first"), { recursive: true });
    await fs.mkdir(path.join(itemsDir, "003-third"), { recursive: true });

    const result = await allocateItemId(tempDir, "fourth");
    expect(result.number).toBe("004");
  });

  it("returns correct dir path", async () => {
    const result = await allocateItemId(tempDir, "test");
    expect(result.dir).toBe(path.join(tempDir, ".wreckit", "items", "001-test"));
  });
});

describe("createItemFromIdea", () => {
  it("creates valid Item with correct fields", () => {
    const idea: ParsedIdea = {
      title: "Add dark mode",
      overview: "Allow users to toggle themes",
    };

    const item = createItemFromIdea("001-add-dark-mode", idea);

    expect(item.id).toBe("001-add-dark-mode");
    expect(item.title).toBe("Add dark mode");
    expect(item.overview).toBe("Allow users to toggle themes");
    expect(item.schema_version).toBe(1);
  });

  it("state is 'raw'", () => {
    const item = createItemFromIdea("001-test", {
      title: "Test",
      overview: "",
    });
    expect(item.state).toBe("raw");
  });

  it("timestamps are set", () => {
    const before = new Date().toISOString();
    const item = createItemFromIdea("001-test", {
      title: "Test",
      overview: "",
    });
    const after = new Date().toISOString();

    expect(item.created_at).toBeDefined();
    expect(item.updated_at).toBeDefined();
    expect(item.created_at >= before).toBe(true);
    expect(item.created_at <= after).toBe(true);
    expect(item.created_at).toBe(item.updated_at);
  });

  it("nullable fields are null", () => {
    const item = createItemFromIdea("001-test", {
      title: "Test",
      overview: "",
    });

    expect(item.branch).toBeNull();
    expect(item.pr_url).toBeNull();
    expect(item.pr_number).toBeNull();
    expect(item.last_error).toBeNull();
  });
});

describe("persistItems", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-test-"));
    await fs.mkdir(path.join(tempDir, ".wreckit"), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("creates directories and item.json", async () => {
    const ideas: ParsedIdea[] = [{ title: "Add dark mode", overview: "Theme support" }];

    const result = await persistItems(tempDir, ideas);

    expect(result.created).toHaveLength(1);
    expect(result.skipped).toHaveLength(0);

    const itemPath = path.join(
      tempDir,
      ".wreckit",
      "items",
      "001-add-dark-mode",
      "item.json"
    );
    const content = await fs.readFile(itemPath, "utf-8");
    const item = JSON.parse(content);

    expect(item.title).toBe("Add dark mode");
  });

  it("skips existing items", async () => {
    const itemsDir = path.join(tempDir, ".wreckit", "items");
    await fs.mkdir(path.join(itemsDir, "001-add-dark-mode"), { recursive: true });

    const ideas: ParsedIdea[] = [{ title: "Add dark mode", overview: "" }];
    const result = await persistItems(tempDir, ideas);

    expect(result.created).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
  });

  it("returns created and skipped lists", async () => {
    const ideas: ParsedIdea[] = [
      { title: "First feature", overview: "" },
      { title: "Second feature", overview: "" },
    ];

    const result = await persistItems(tempDir, ideas);

    expect(result.created).toHaveLength(2);
    expect(result.skipped).toHaveLength(0);
    expect(result.created[0].title).toBe("First feature");
    expect(result.created[1].title).toBe("Second feature");
  });

  it("creates items in items folder", async () => {
    const ideas: ParsedIdea[] = [
      { title: "Add feature", overview: "" },
      { title: "Fix bug", overview: "" },
      { title: "Update CI", overview: "" },
    ];

    const result = await persistItems(tempDir, ideas);

    expect(result.created).toHaveLength(3);

    const itemsDir = path.join(tempDir, ".wreckit", "items");
    const entries = await fs.readdir(itemsDir);

    expect(entries).toContain("001-add-feature");
    expect(entries).toContain("002-fix-bug");
    expect(entries).toContain("003-update-ci");
  });
});

describe("ingestIdeas integration", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-test-"));
    await fs.mkdir(path.join(tempDir, ".wreckit"), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("full flow from text to persisted items", async () => {
    const input = `# Add dark mode support
Allow users to toggle between light and dark themes

# Fix login timeout
The login page times out after 30 seconds

- Update CI to use Node 20
- Add unit tests for auth module`;

    const result = await ingestIdeas(tempDir, input);

    expect(result.created).toHaveLength(4);
    expect(result.skipped).toHaveLength(0);

    const itemsDir = path.join(tempDir, ".wreckit", "items");
    const entries = await fs.readdir(itemsDir);
    expect(entries).toHaveLength(4);
  });

  it("idempotent (re-running doesn't duplicate)", async () => {
    const input = "# Add feature\nSome description";

    const first = await ingestIdeas(tempDir, input);
    expect(first.created).toHaveLength(1);

    const second = await ingestIdeas(tempDir, input);
    expect(second.created).toHaveLength(0);
    expect(second.skipped).toHaveLength(1);
  });

  it("handles empty input", async () => {
    const result = await ingestIdeas(tempDir, "");
    expect(result.created).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
  });

  it("handles whitespace-only input", async () => {
    const result = await ingestIdeas(tempDir, "   \n\n   \n");
    expect(result.created).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
  });
});
