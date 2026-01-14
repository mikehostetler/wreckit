import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { z } from "zod";
import {
  findRepoRoot,
  getWreckitDir,
  getConfigPath,
  getIndexPath,
  getPromptsDir,
  getSectionDir,
  getItemDir,
  getItemJsonPath,
  getPrdPath,
  getResearchPath,
  getPlanPath,
  getProgressLogPath,
  getPromptPath,
  readJsonWithSchema,
  writeJsonPretty,
  readConfig,
  readItem,
  writeItem,
  readPrd,
  writePrd,
  readIndex,
  writeIndex,
} from "../fs";
import {
  RepoNotFoundError,
  InvalidJsonError,
  SchemaValidationError,
  FileNotFoundError,
} from "../errors";
import type { Item, Prd, Index, Config } from "../schemas";

describe("Path utilities", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("findRepoRoot", () => {
    it("throws when .wreckit missing", async () => {
      await fs.mkdir(path.join(tempDir, ".git"));

      expect(() => findRepoRoot(tempDir)).toThrow(RepoNotFoundError);
    });

    it("throws when .git missing", async () => {
      await fs.mkdir(path.join(tempDir, ".wreckit"));

      expect(() => findRepoRoot(tempDir)).toThrow(RepoNotFoundError);
      expect(() => findRepoRoot(tempDir)).toThrow(
        /Found .wreckit.*but no .git/
      );
    });

    it("succeeds when both exist", async () => {
      await fs.mkdir(path.join(tempDir, ".git"));
      await fs.mkdir(path.join(tempDir, ".wreckit"));

      const result = findRepoRoot(tempDir);
      expect(result).toBe(tempDir);
    });

    it("finds root from nested directory", async () => {
      await fs.mkdir(path.join(tempDir, ".git"));
      await fs.mkdir(path.join(tempDir, ".wreckit"));
      const nestedDir = path.join(tempDir, "src", "deep", "nested");
      await fs.mkdir(nestedDir, { recursive: true });

      const result = findRepoRoot(nestedDir);
      expect(result).toBe(tempDir);
    });
  });

  describe("path helpers", () => {
    const root = "/test/repo";

    it("getWreckitDir returns correct path", () => {
      expect(getWreckitDir(root)).toBe("/test/repo/.wreckit");
    });

    it("getConfigPath returns correct path", () => {
      expect(getConfigPath(root)).toBe("/test/repo/.wreckit/config.json");
    });

    it("getIndexPath returns correct path", () => {
      expect(getIndexPath(root)).toBe("/test/repo/.wreckit/index.json");
    });

    it("getPromptsDir returns correct path", () => {
      expect(getPromptsDir(root)).toBe("/test/repo/.wreckit/prompts");
    });

    it("getSectionDir returns correct path", () => {
      expect(getSectionDir(root, "features")).toBe(
        "/test/repo/.wreckit/features"
      );
    });

    it("getItemDir returns correct path", () => {
      expect(getItemDir(root, "features/001-auth")).toBe(
        "/test/repo/.wreckit/features/001-auth"
      );
    });

    it("getItemJsonPath returns correct path", () => {
      expect(getItemJsonPath(root, "features/001-auth")).toBe(
        "/test/repo/.wreckit/features/001-auth/item.json"
      );
    });

    it("getPrdPath returns correct path", () => {
      expect(getPrdPath(root, "features/001-auth")).toBe(
        "/test/repo/.wreckit/features/001-auth/prd.json"
      );
    });

    it("getResearchPath returns correct path", () => {
      expect(getResearchPath(root, "features/001-auth")).toBe(
        "/test/repo/.wreckit/features/001-auth/research.md"
      );
    });

    it("getPlanPath returns correct path", () => {
      expect(getPlanPath(root, "features/001-auth")).toBe(
        "/test/repo/.wreckit/features/001-auth/plan.md"
      );
    });

    it("getProgressLogPath returns correct path", () => {
      expect(getProgressLogPath(root, "features/001-auth")).toBe(
        "/test/repo/.wreckit/features/001-auth/progress.log"
      );
    });

    it("getPromptPath returns correct path", () => {
      expect(getPromptPath(root, "features/001-auth")).toBe(
        "/test/repo/.wreckit/features/001-auth/prompt.md"
      );
    });
  });
});

describe("JSON utilities", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-json-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const TestSchema = z.object({
    name: z.string(),
    value: z.number(),
  });

  describe("readJsonWithSchema", () => {
    it("succeeds with valid JSON", async () => {
      const filePath = path.join(tempDir, "test.json");
      await fs.writeFile(filePath, JSON.stringify({ name: "test", value: 42 }));

      const result = await readJsonWithSchema(filePath, TestSchema);
      expect(result).toEqual({ name: "test", value: 42 });
    });

    it("throws SchemaValidationError for invalid data", async () => {
      const filePath = path.join(tempDir, "test.json");
      await fs.writeFile(
        filePath,
        JSON.stringify({ name: "test", value: "not a number" })
      );

      await expect(readJsonWithSchema(filePath, TestSchema)).rejects.toThrow(
        SchemaValidationError
      );
    });

    it("throws InvalidJsonError for malformed JSON", async () => {
      const filePath = path.join(tempDir, "test.json");
      await fs.writeFile(filePath, "{ invalid json }");

      await expect(readJsonWithSchema(filePath, TestSchema)).rejects.toThrow(
        InvalidJsonError
      );
    });

    it("throws FileNotFoundError for missing file", async () => {
      const filePath = path.join(tempDir, "nonexistent.json");

      await expect(readJsonWithSchema(filePath, TestSchema)).rejects.toThrow(
        FileNotFoundError
      );
    });
  });

  describe("writeJsonPretty", () => {
    it("creates pretty-printed JSON with 2 spaces and trailing newline", async () => {
      const filePath = path.join(tempDir, "output.json");
      const data = { name: "test", value: 42 };

      await writeJsonPretty(filePath, data);

      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toBe('{\n  "name": "test",\n  "value": 42\n}\n');
    });

    it("creates parent directories if needed", async () => {
      const filePath = path.join(tempDir, "nested", "dir", "output.json");
      const data = { name: "test" };

      await writeJsonPretty(filePath, data);

      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toContain('"name": "test"');
    });
  });

  describe("round-trip", () => {
    it("write then read returns same data", async () => {
      const filePath = path.join(tempDir, "roundtrip.json");
      const data = { name: "roundtrip", value: 123 };

      await writeJsonPretty(filePath, data);
      const result = await readJsonWithSchema(filePath, TestSchema);

      expect(result).toEqual(data);
    });
  });
});

describe("Typed wrapper tests", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-typed-test-"));
    await fs.mkdir(path.join(tempDir, ".wreckit"), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const validConfig: Config = {
    schema_version: 1,
    base_branch: "main",
    branch_prefix: "wreckit/",
    agent: {
      mode: "process",
      command: "amp",
      args: ["--dangerously-allow-all"],
      completion_signal: "DONE",
    },
    max_iterations: 100,
    timeout_seconds: 3600,
  };

  const validItem: Item = {
    schema_version: 1,
    id: "features/001-auth",
    title: "Auth Feature",
    section: "features",
    state: "raw",
    overview: "Add authentication",
    branch: null,
    pr_url: null,
    pr_number: null,
    last_error: null,
    created_at: "2025-01-12T00:00:00Z",
    updated_at: "2025-01-12T00:00:00Z",
  };

  const validPrd: Prd = {
    schema_version: 1,
    id: "features/001-auth",
    branch_name: "wreckit/001-auth",
    user_stories: [
      {
        id: "US-001",
        title: "User can log in",
        acceptance_criteria: ["User sees login form"],
        priority: 1,
        status: "pending",
        notes: "",
      },
    ],
  };

  const validIndex: Index = {
    schema_version: 1,
    items: [{ id: "features/001-auth", state: "raw", title: "Auth Feature" }],
    generated_at: "2025-01-12T00:00:00Z",
  };

  describe("readConfig", () => {
    it("reads valid config", async () => {
      await fs.writeFile(
        path.join(tempDir, ".wreckit", "config.json"),
        JSON.stringify(validConfig)
      );

      const result = await readConfig(tempDir);
      expect(result).toEqual(validConfig);
    });

    it("throws on invalid config", async () => {
      await fs.writeFile(
        path.join(tempDir, ".wreckit", "config.json"),
        JSON.stringify({ invalid: "config" })
      );

      await expect(readConfig(tempDir)).rejects.toThrow(SchemaValidationError);
    });
  });

  describe("readItem / writeItem", () => {
    it("writes and reads valid item", async () => {
      const itemDir = path.join(tempDir, ".wreckit", "features", "001-auth");

      await writeItem(itemDir, validItem);
      const result = await readItem(itemDir);

      expect(result).toEqual(validItem);
    });

    it("throws on invalid item data", async () => {
      const itemDir = path.join(tempDir, ".wreckit", "features", "001-auth");
      await fs.mkdir(itemDir, { recursive: true });
      await fs.writeFile(
        path.join(itemDir, "item.json"),
        JSON.stringify({ invalid: "item" })
      );

      await expect(readItem(itemDir)).rejects.toThrow(SchemaValidationError);
    });
  });

  describe("readPrd / writePrd", () => {
    it("writes and reads valid prd", async () => {
      const itemDir = path.join(tempDir, ".wreckit", "features", "001-auth");

      await writePrd(itemDir, validPrd);
      const result = await readPrd(itemDir);

      expect(result).toEqual(validPrd);
    });

    it("throws on invalid prd data", async () => {
      const itemDir = path.join(tempDir, ".wreckit", "features", "001-auth");
      await fs.mkdir(itemDir, { recursive: true });
      await fs.writeFile(
        path.join(itemDir, "prd.json"),
        JSON.stringify({ invalid: "prd" })
      );

      await expect(readPrd(itemDir)).rejects.toThrow(SchemaValidationError);
    });
  });

  describe("readIndex / writeIndex", () => {
    it("writes and reads valid index", async () => {
      await writeIndex(tempDir, validIndex);
      const result = await readIndex(tempDir);

      expect(result).toEqual(validIndex);
    });

    it("returns null when index does not exist", async () => {
      const result = await readIndex(tempDir);
      expect(result).toBeNull();
    });

    it("throws on invalid index data", async () => {
      await fs.writeFile(
        path.join(tempDir, ".wreckit", "index.json"),
        JSON.stringify({ invalid: "index" })
      );

      await expect(readIndex(tempDir)).rejects.toThrow(SchemaValidationError);
    });
  });
});
