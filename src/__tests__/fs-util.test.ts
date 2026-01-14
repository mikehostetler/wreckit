import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { pathExists, dirExists } from "../fs/util";

describe("fs/util utilities", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-fs-util-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("pathExists", () => {
    it("returns true for existing file", async () => {
      const filePath = path.join(tempDir, "test-file.txt");
      await fs.writeFile(filePath, "content");
      expect(await pathExists(filePath)).toBe(true);
    });

    it("returns true for existing directory", async () => {
      const dirPath = path.join(tempDir, "test-dir");
      await fs.mkdir(dirPath);
      expect(await pathExists(dirPath)).toBe(true);
    });

    it("returns false for non-existent path", async () => {
      const nonExistent = path.join(tempDir, "does-not-exist");
      expect(await pathExists(nonExistent)).toBe(false);
    });
  });

  describe("dirExists", () => {
    it("returns true for existing directory", async () => {
      const dirPath = path.join(tempDir, "test-dir");
      await fs.mkdir(dirPath);
      expect(await dirExists(dirPath)).toBe(true);
    });

    it("returns false for existing file", async () => {
      const filePath = path.join(tempDir, "test-file.txt");
      await fs.writeFile(filePath, "content");
      expect(await dirExists(filePath)).toBe(false);
    });

    it("returns false for non-existent path", async () => {
      const nonExistent = path.join(tempDir, "does-not-exist");
      expect(await dirExists(nonExistent)).toBe(false);
    });
  });
});
