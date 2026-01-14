import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import {
  readJsonWithSchema,
  safeWriteJson,
  cleanupOrphanedTmpFiles,
} from "../../fs";
import { ItemSchema } from "../../schemas";
import {
  InvalidJsonError,
  SchemaValidationError,
  FileNotFoundError,
} from "../../errors";

function makeTempDir(): string {
  return path.join(tmpdir(), `wreckit-test-${randomBytes(8).toString("hex")}`);
}

async function cleanup(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // Ignore
  }
}

describe("corruption detection", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = makeTempDir();
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await cleanup(tempDir);
  });

  describe("truncated item.json", () => {
    it("throws InvalidJsonError for truncated JSON", async () => {
      const itemPath = path.join(tempDir, "item.json");
      // Write truncated JSON (missing closing brace)
      await fs.writeFile(
        itemPath,
        '{"schema_version": 1, "id": "test"',
        "utf-8"
      );

      await expect(readJsonWithSchema(itemPath, ItemSchema)).rejects.toThrow(
        InvalidJsonError
      );
    });
  });

  describe("invalid JSON", () => {
    it("throws InvalidJsonError for malformed JSON", async () => {
      const itemPath = path.join(tempDir, "item.json");
      await fs.writeFile(itemPath, "not valid json at all", "utf-8");

      await expect(readJsonWithSchema(itemPath, ItemSchema)).rejects.toThrow(
        InvalidJsonError
      );
    });

    it("throws SchemaValidationError for valid JSON with wrong schema", async () => {
      const itemPath = path.join(tempDir, "item.json");
      await fs.writeFile(itemPath, '{"foo": "bar"}', "utf-8");

      await expect(readJsonWithSchema(itemPath, ItemSchema)).rejects.toThrow(
        SchemaValidationError
      );
    });
  });

  describe("missing file", () => {
    it("throws FileNotFoundError for non-existent file", async () => {
      const itemPath = path.join(tempDir, "nonexistent.json");

      await expect(readJsonWithSchema(itemPath, ItemSchema)).rejects.toThrow(
        FileNotFoundError
      );
    });
  });
});

describe("atomic writes", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = makeTempDir();
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await cleanup(tempDir);
  });

  describe("safeWriteJson", () => {
    it("writes valid JSON that can be read back", async () => {
      const filePath = path.join(tempDir, "test.json");
      const data = { foo: "bar", num: 42 };

      await safeWriteJson(filePath, data);

      const content = await fs.readFile(filePath, "utf-8");
      expect(JSON.parse(content)).toEqual(data);
    });

    it("creates parent directories if needed", async () => {
      const filePath = path.join(tempDir, "nested", "deep", "test.json");
      const data = { test: true };

      await safeWriteJson(filePath, data);

      const content = await fs.readFile(filePath, "utf-8");
      expect(JSON.parse(content)).toEqual(data);
    });

    it("does not leave .tmp files on success", async () => {
      const filePath = path.join(tempDir, "test.json");
      await safeWriteJson(filePath, { test: true });

      const files = await fs.readdir(tempDir);
      const tmpFiles = files.filter((f) => f.endsWith(".tmp"));
      expect(tmpFiles).toHaveLength(0);
    });

    it("overwrites existing file atomically", async () => {
      const filePath = path.join(tempDir, "test.json");
      await safeWriteJson(filePath, { version: 1 });
      await safeWriteJson(filePath, { version: 2 });

      const content = await fs.readFile(filePath, "utf-8");
      expect(JSON.parse(content)).toEqual({ version: 2 });
    });
  });
});

describe("orphaned temp file cleanup", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = makeTempDir();
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await cleanup(tempDir);
  });

  it("removes orphaned .tmp files", async () => {
    // Create orphaned temp files
    await fs.writeFile(
      path.join(tempDir, "item.json.abc123.tmp"),
      "{}",
      "utf-8"
    );
    await fs.writeFile(
      path.join(tempDir, "prd.json.def456.tmp"),
      "{}",
      "utf-8"
    );
    // Create a real file that should NOT be deleted
    await fs.writeFile(path.join(tempDir, "real.json"), "{}", "utf-8");

    const cleaned = await cleanupOrphanedTmpFiles(tempDir);

    expect(cleaned).toHaveLength(2);
    const remaining = await fs.readdir(tempDir);
    expect(remaining).toEqual(["real.json"]);
  });

  it("recursively cleans nested directories", async () => {
    const nestedDir = path.join(tempDir, "items", "001-test");
    await fs.mkdir(nestedDir, { recursive: true });
    await fs.writeFile(path.join(nestedDir, "orphan.tmp"), "{}", "utf-8");

    const cleaned = await cleanupOrphanedTmpFiles(tempDir);

    expect(cleaned).toHaveLength(1);
    expect(cleaned[0]).toContain("orphan.tmp");
  });

  it("returns empty array for non-existent directory", async () => {
    const cleaned = await cleanupOrphanedTmpFiles("/nonexistent/path");
    expect(cleaned).toEqual([]);
  });

  it("ignores non-.tmp files", async () => {
    await fs.writeFile(path.join(tempDir, "item.json"), "{}", "utf-8");
    await fs.writeFile(path.join(tempDir, "readme.md"), "test", "utf-8");

    const cleaned = await cleanupOrphanedTmpFiles(tempDir);

    expect(cleaned).toHaveLength(0);
    const remaining = await fs.readdir(tempDir);
    expect(remaining).toHaveLength(2);
  });
});
