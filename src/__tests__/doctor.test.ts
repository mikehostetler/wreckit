import { describe, it, expect, beforeEach, afterEach, mock, spyOn, vi } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { diagnose, applyFixes, runDoctor } from "../doctor";
import { doctorCommand } from "../commands/doctor";
import type { Item, Prd, Index } from "../schemas";

function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    json: vi.fn(),
    setConfig: vi.fn(),
  };
}

async function createWreckitDir(root: string): Promise<void> {
  await fs.mkdir(path.join(root, ".wreckit"), { recursive: true });
  await fs.mkdir(path.join(root, ".git"), { recursive: true });
}

async function createItem(
  root: string,
  id: string,
  overrides: Partial<Item> = {}
): Promise<void> {
  const [section, slug] = id.split("/");
  const itemDir = path.join(root, ".wreckit", section, slug);
  await fs.mkdir(itemDir, { recursive: true });

  const item: Item = {
    schema_version: 1,
    id,
    title: `Test item ${id}`,
    section,
    state: "raw",
    overview: "Test overview",
    branch: null,
    pr_url: null,
    pr_number: null,
    last_error: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };

  await fs.writeFile(
    path.join(itemDir, "item.json"),
    JSON.stringify(item, null, 2)
  );
}

async function createPrd(
  root: string,
  id: string,
  overrides: Partial<Prd> = {}
): Promise<void> {
  const [section, slug] = id.split("/");
  const itemDir = path.join(root, ".wreckit", section, slug);

  const prd: Prd = {
    schema_version: 1,
    id,
    branch_name: `wreckit/${slug}`,
    user_stories: [
      {
        id: "US-001",
        title: "Test story",
        acceptance_criteria: ["Test"],
        priority: 1,
        status: "pending",
        notes: "",
      },
    ],
    ...overrides,
  };

  await fs.writeFile(
    path.join(itemDir, "prd.json"),
    JSON.stringify(prd, null, 2)
  );
}

describe("diagnose", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-doctor-test-"));
    await createWreckitDir(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("returns empty diagnostics for clean .wreckit folder", async () => {
    await fs.writeFile(
      path.join(tempDir, ".wreckit", "config.json"),
      JSON.stringify({
        schema_version: 1,
        base_branch: "main",
        branch_prefix: "wreckit/",
        agent: {
          command: "amp",
          args: [],
          completion_signal: "DONE",
        },
        max_iterations: 100,
        timeout_seconds: 3600,
      })
    );
    await fs.mkdir(path.join(tempDir, ".wreckit", "prompts"));

    const diagnostics = await diagnose(tempDir);
    expect(diagnostics).toHaveLength(0);
  });

  it("returns MISSING_CONFIG when config.json does not exist", async () => {
    const diagnostics = await diagnose(tempDir);
    const configDiag = diagnostics.find((d) => d.code === "MISSING_CONFIG");

    expect(configDiag).toBeDefined();
    expect(configDiag?.severity).toBe("warning");
    expect(configDiag?.fixable).toBe(false);
  });

  it("returns INVALID_CONFIG when config.json is invalid", async () => {
    await fs.writeFile(
      path.join(tempDir, ".wreckit", "config.json"),
      JSON.stringify({ schema_version: "not a number" })
    );

    const diagnostics = await diagnose(tempDir);
    const configDiag = diagnostics.find((d) => d.code === "INVALID_CONFIG");

    expect(configDiag).toBeDefined();
    expect(configDiag?.severity).toBe("error");
  });

  it("returns INVALID_CONFIG for malformed JSON", async () => {
    await fs.writeFile(
      path.join(tempDir, ".wreckit", "config.json"),
      "{ invalid json }"
    );

    const diagnostics = await diagnose(tempDir);
    const configDiag = diagnostics.find((d) => d.code === "INVALID_CONFIG");

    expect(configDiag).toBeDefined();
    expect(configDiag?.severity).toBe("error");
  });

  it("returns MISSING_ITEM_JSON when item.json is missing", async () => {
    const itemDir = path.join(tempDir, ".wreckit", "test", "001-item");
    await fs.mkdir(itemDir, { recursive: true });

    const diagnostics = await diagnose(tempDir);
    const itemDiag = diagnostics.find((d) => d.code === "MISSING_ITEM_JSON");

    expect(itemDiag).toBeDefined();
    expect(itemDiag?.severity).toBe("error");
    expect(itemDiag?.itemId).toBe("test/001-item");
  });

  it("detects state/file mismatch for researched without research.md", async () => {
    await createItem(tempDir, "test/001-item", { state: "researched" });

    const diagnostics = await diagnose(tempDir);
    const mismatch = diagnostics.find((d) => d.code === "STATE_FILE_MISMATCH");

    expect(mismatch).toBeDefined();
    expect(mismatch?.severity).toBe("warning");
    expect(mismatch?.message).toContain("researched");
    expect(mismatch?.message).toContain("research.md");
  });

  it("detects state/file mismatch for planned without plan files", async () => {
    await createItem(tempDir, "test/001-item", { state: "planned" });

    const diagnostics = await diagnose(tempDir);
    const mismatch = diagnostics.find((d) => d.code === "STATE_FILE_MISMATCH");

    expect(mismatch).toBeDefined();
    expect(mismatch?.message).toContain("planned");
  });

  it("detects invalid prd.json", async () => {
    await createItem(tempDir, "test/001-item", { state: "planned" });
    const itemDir = path.join(tempDir, ".wreckit", "test", "001-item");
    await fs.writeFile(path.join(itemDir, "plan.md"), "# Plan");
    await fs.writeFile(
      path.join(itemDir, "prd.json"),
      JSON.stringify({ invalid: true })
    );

    const diagnostics = await diagnose(tempDir);
    const prdDiag = diagnostics.find((d) => d.code === "INVALID_PRD");

    expect(prdDiag).toBeDefined();
    expect(prdDiag?.severity).toBe("error");
  });

  it("detects stale index", async () => {
    await createItem(tempDir, "test/001-item", { state: "raw" });

    const staleIndex: Index = {
      schema_version: 1,
      items: [
        { id: "other/999-missing", state: "raw", title: "Missing item" },
      ],
      generated_at: new Date().toISOString(),
    };
    await fs.writeFile(
      path.join(tempDir, ".wreckit", "index.json"),
      JSON.stringify(staleIndex)
    );

    const diagnostics = await diagnose(tempDir);
    const indexDiag = diagnostics.find((d) => d.code === "INDEX_STALE");

    expect(indexDiag).toBeDefined();
    expect(indexDiag?.fixable).toBe(true);
  });

  it("detects missing prompts directory", async () => {
    const diagnostics = await diagnose(tempDir);
    const promptsDiag = diagnostics.find((d) => d.code === "MISSING_PROMPTS");

    expect(promptsDiag).toBeDefined();
    expect(promptsDiag?.severity).toBe("info");
    expect(promptsDiag?.fixable).toBe(true);
  });

  it("no MISSING_PROMPTS when prompts directory exists", async () => {
    await fs.mkdir(path.join(tempDir, ".wreckit", "prompts"));

    const diagnostics = await diagnose(tempDir);
    const promptsDiag = diagnostics.find((d) => d.code === "MISSING_PROMPTS");

    expect(promptsDiag).toBeUndefined();
  });
});

describe("applyFixes", () => {
  let tempDir: string;
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-doctor-fix-"));
    await createWreckitDir(tempDir);
    mockLogger = createMockLogger();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("rebuilds stale index", async () => {
    await createItem(tempDir, "test/001-item", { state: "raw" });

    const diagnostics = [
      {
        itemId: null,
        severity: "warning" as const,
        code: "INDEX_STALE",
        message: "index.json is out of sync",
        fixable: true,
      },
    ];

    const results = await applyFixes(tempDir, diagnostics, mockLogger);

    expect(results).toHaveLength(1);
    expect(results[0].fixed).toBe(true);
    expect(results[0].message).toContain("Rebuilt");

    const indexPath = path.join(tempDir, ".wreckit", "index.json");
    const content = await fs.readFile(indexPath, "utf-8");
    const index = JSON.parse(content);
    expect(index.items).toHaveLength(1);
    expect(index.items[0].id).toBe("test/001-item");
  });

  it("creates missing prompts", async () => {
    const diagnostics = [
      {
        itemId: null,
        severity: "info" as const,
        code: "MISSING_PROMPTS",
        message: "prompts directory is missing",
        fixable: true,
      },
    ];

    const results = await applyFixes(tempDir, diagnostics, mockLogger);

    expect(results).toHaveLength(1);
    expect(results[0].fixed).toBe(true);

    const promptsDir = path.join(tempDir, ".wreckit", "prompts");
    const stat = await fs.stat(promptsDir);
    expect(stat.isDirectory()).toBe(true);
  });

  it("resets mismatched state", async () => {
    await createItem(tempDir, "test/001-item", { state: "researched" });

    const diagnostics = [
      {
        itemId: "test/001-item",
        severity: "warning" as const,
        code: "STATE_FILE_MISMATCH",
        message: "State is 'researched' but research.md is missing",
        fixable: true,
      },
    ];

    const results = await applyFixes(tempDir, diagnostics, mockLogger);

    expect(results).toHaveLength(1);
    expect(results[0].fixed).toBe(true);
    expect(results[0].message).toContain("raw");

    const itemPath = path.join(
      tempDir,
      ".wreckit",
      "test",
      "001-item",
      "item.json"
    );
    const content = await fs.readFile(itemPath, "utf-8");
    const item = JSON.parse(content);
    expect(item.state).toBe("raw");
  });

  it("does not modify non-fixable issues", async () => {
    const diagnostics = [
      {
        itemId: null,
        severity: "error" as const,
        code: "INVALID_CONFIG",
        message: "config.json is invalid",
        fixable: false,
      },
    ];

    const results = await applyFixes(tempDir, diagnostics, mockLogger);
    expect(results).toHaveLength(0);
  });

  it("returns fix results for all fixable diagnostics", async () => {
    await createItem(tempDir, "test/001-item", { state: "researched" });

    const diagnostics = [
      {
        itemId: null,
        severity: "info" as const,
        code: "MISSING_PROMPTS",
        message: "prompts directory is missing",
        fixable: true,
      },
      {
        itemId: "test/001-item",
        severity: "warning" as const,
        code: "STATE_FILE_MISMATCH",
        message: "State is 'researched' but research.md is missing",
        fixable: true,
      },
    ];

    const results = await applyFixes(tempDir, diagnostics, mockLogger);

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.fixed)).toBe(true);
  });
});

describe("doctorCommand", () => {
  let tempDir: string;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let originalCwd: string;
  let originalExit: typeof process.exit;
  let exitCode: number | undefined;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-doctor-cmd-"));
    await createWreckitDir(tempDir);
    mockLogger = createMockLogger();
    originalCwd = process.cwd();
    process.chdir(tempDir);
    exitCode = undefined;
    originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitCode = code;
      throw new Error("process.exit called");
    }) as typeof process.exit;
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    process.exit = originalExit;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("prints diagnostics grouped by severity", async () => {
    await createItem(tempDir, "test/001-item", { state: "researched" });
    await fs.writeFile(
      path.join(tempDir, ".wreckit", "config.json"),
      "{ invalid json }"
    );

    const consoleSpy = spyOn(console, "log");

    try {
      await doctorCommand({}, mockLogger);
    } catch {
      // process.exit throws
    }

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("without --fix, does not modify files", async () => {
    await createItem(tempDir, "test/001-item", { state: "researched" });

    await doctorCommand({}, mockLogger);

    const itemPath = path.join(
      tempDir,
      ".wreckit",
      "test",
      "001-item",
      "item.json"
    );
    const content = await fs.readFile(itemPath, "utf-8");
    const item = JSON.parse(content);
    expect(item.state).toBe("researched");
  });

  it("with --fix, applies fixes", async () => {
    await createItem(tempDir, "test/001-item", { state: "researched" });

    await doctorCommand({ fix: true }, mockLogger);

    const itemPath = path.join(
      tempDir,
      ".wreckit",
      "test",
      "001-item",
      "item.json"
    );
    const content = await fs.readFile(itemPath, "utf-8");
    const item = JSON.parse(content);
    expect(item.state).toBe("raw");
  });

  it("exits with code 1 if errors remain after fixes", async () => {
    await fs.writeFile(
      path.join(tempDir, ".wreckit", "config.json"),
      "{ invalid json }"
    );

    try {
      await doctorCommand({ fix: true }, mockLogger);
    } catch {
      // process.exit throws
    }

    expect(exitCode).toBe(1);
  });

  it("shows success message when no issues found", async () => {
    await fs.writeFile(
      path.join(tempDir, ".wreckit", "config.json"),
      JSON.stringify({
        schema_version: 1,
        base_branch: "main",
        branch_prefix: "wreckit/",
        agent: { command: "amp", args: [], completion_signal: "DONE" },
        max_iterations: 100,
        timeout_seconds: 3600,
      })
    );
    await fs.mkdir(path.join(tempDir, ".wreckit", "prompts"));

    const consoleSpy = spyOn(console, "log");

    await doctorCommand({}, mockLogger);

    expect(consoleSpy).toHaveBeenCalledWith("✓ No issues found");
    consoleSpy.mockRestore();
  });
});
