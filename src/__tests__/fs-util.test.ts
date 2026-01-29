import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  pathExists,
  dirExists,
  tryReadFile,
  checkPathAccess,
} from "../fs/util";
import { ArtifactReadError } from "../errors";

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

  describe("tryReadFile", () => {
    it("returns ok status with content for existing readable file", async () => {
      const filePath = path.join(tempDir, "readable.txt");
      await fs.writeFile(filePath, "test content");

      const result = await tryReadFile(filePath);

      expect(result.status).toBe("ok");
      if (result.status === "ok") {
        expect(result.content).toBe("test content");
      }
    });

    it("returns not_found status for missing file", async () => {
      const filePath = path.join(tempDir, "missing.txt");

      const result = await tryReadFile(filePath);

      expect(result.status).toBe("not_found");
    });

    it("returns error status with ArtifactReadError for permission errors", async () => {
      // Skip on Windows where permission manipulation doesn't work the same
      if (process.platform === "win32") {
        return;
      }

      const filePath = path.join(tempDir, "unreadable.txt");
      await fs.writeFile(filePath, "secret content");
      await fs.chmod(filePath, 0o000); // Remove all permissions

      try {
        const result = await tryReadFile(filePath);

        expect(result.status).toBe("error");
        if (result.status === "error") {
          expect(result.error).toBeInstanceOf(ArtifactReadError);
          expect(result.error.filePath).toBe(filePath);
          expect(result.error.code).toBe("ARTIFACT_READ_ERROR");
        }
      } finally {
        // Restore permissions for cleanup
        await fs.chmod(filePath, 0o644);
      }
    });
  });

  describe("checkPathAccess", () => {
    it("returns exists: true for accessible file", async () => {
      const filePath = path.join(tempDir, "accessible.txt");
      await fs.writeFile(filePath, "content");

      const result = await checkPathAccess(filePath);

      expect(result.exists).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("returns exists: true for accessible directory", async () => {
      const dirPath = path.join(tempDir, "accessible-dir");
      await fs.mkdir(dirPath);

      const result = await checkPathAccess(dirPath);

      expect(result.exists).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("returns exists: false for missing path", async () => {
      const filePath = path.join(tempDir, "missing.txt");

      const result = await checkPathAccess(filePath);

      expect(result.exists).toBe(false);
      expect(result.error).toBeUndefined();
    });

    it("returns error for permission-denied path", async () => {
      // Skip on Windows where permission manipulation doesn't work the same
      // Also skip when running as root (uid 0) since root bypasses file permissions
      if (process.platform === "win32" || process.getuid?.() === 0) {
        return;
      }

      // Create a directory with no execute permission - this blocks access to files inside
      const restrictedDir = path.join(tempDir, "restricted-dir");
      await fs.mkdir(restrictedDir);
      const filePath = path.join(restrictedDir, "file.txt");
      await fs.writeFile(filePath, "content");
      await fs.chmod(restrictedDir, 0o000); // Remove all permissions from directory

      try {
        const result = await checkPathAccess(filePath);

        expect(result.exists).toBe(false);
        expect(result.error).toBeInstanceOf(ArtifactReadError);
        if (result.error) {
          expect(result.error.filePath).toBe(filePath);
          expect(result.error.code).toBe("ARTIFACT_READ_ERROR");
        }
      } finally {
        await fs.chmod(restrictedDir, 0o755);
      }
    });
  });
});
