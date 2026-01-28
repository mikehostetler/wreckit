import { describe, it, expect, beforeEach, mock } from "bun:test";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import {
  createProjectArchive,
  uploadToSpriteVM,
  downloadFromSpriteVM,
  extractProjectArchive,
} from "../../fs/sync";
import type { Logger } from "../../logging";
import type { SpriteAgentConfig } from "../../schemas";

// Mocks
const mockStat = mock().mockResolvedValue({ size: 1024 });
const mockUnlink = mock().mockResolvedValue(undefined);
const mockMkdir = mock().mockResolvedValue(undefined);
const mockReadFile = mock().mockResolvedValue(Buffer.from("fake-archive-content"));
const mockWriteFile = mock().mockResolvedValue(undefined);
const mockRm = mock().mockResolvedValue(undefined);

mock.module("node:fs/promises", () => ({
  stat: mockStat,
  unlink: mockUnlink,
  mkdir: mockMkdir,
  readFile: mockReadFile,
  writeFile: mockWriteFile,
  rm: mockRm,
  mkdtemp: mock().mockResolvedValue("/tmp/wreckit-sync-pull-xxx"),
}));

const mockSpawnFn = mock();
mock.module("node:child_process", () => ({
  spawn: mockSpawnFn,
}));

const mockExecSprite = mock();
mock.module("../../agent/sprite-core", () => ({
  execSprite: mockExecSprite,
}));

function createMockLogger(): Logger & { messages: string[] } {
  const messages: string[] = [];
  return {
    messages,
    debug: (msg: string) => messages.push(`debug: ${msg}`),
    info: (msg: string) => messages.push(`info: ${msg}`),
    warn: (msg: string) => messages.push(`warn: ${msg}`),
    error: (msg: string) => messages.push(`error: ${msg}`),
    child: () => createMockLogger(),
  } as any;
}

function createMockConfig(): SpriteAgentConfig {
  return {
    kind: "sprite",
    wispPath: "sprite",
    timeout: 300,
    maxVMs: 5,
    defaultMemory: "512MiB",
    defaultCPUs: "1",
    syncEnabled: true,
    syncExcludePatterns: [".git", "node_modules"],
    syncOnSuccess: false,
  };
}

describe("Project Synchronization", () => {
  const tempProject = "/tmp/test-project";
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockSpawnFn.mockReset();
    mockExecSprite.mockReset();
    mockStat.mockClear();
  });

  describe("createProjectArchive", () => {
    it("creates tar.gz archive with default exclusions", async () => {
      // Mock successful tar execution
      const mockChild = {
        stderr: {
          on: mock((event, callback) => {}),
        },
        on: mock((event, callback) => {
          if (event === "close") callback(0);
        }),
      };
      mockSpawnFn.mockReturnValue(mockChild);

      const result = await createProjectArchive({
        projectRoot: tempProject,
        logger: mockLogger,
      });

      expect(result.success).toBe(true);
      expect(result.archiveSize).toBe(1024);
      expect(mockSpawnFn).toHaveBeenCalledWith(
        "tar",
        expect.arrayContaining([
          "czf",
          expect.stringContaining("project-sync.tar.gz"),
          "--exclude", ".git",
          "--exclude", "node_modules",
          "--exclude", ".wreckit",
        ])
      );
    });
  });

  describe("uploadToSpriteVM", () => {
    const archivePath = path.join(tempProject, ".wreckit", "project-sync.tar.gz");
    const mockConfig = createMockConfig();

    it("uploads and extracts archive successfully", async () => {
      mockExecSprite.mockResolvedValue({
        success: true,
        stdout: "",
        stderr: "",
        exitCode: 0,
      });

      const result = await uploadToSpriteVM({
        vmName: "test-vm",
        archivePath,
        config: mockConfig,
        logger: mockLogger,
      });

      expect(result.success).toBe(true);
      expect(result.vmPath).toBe("/home/user/project");
      expect(mockExecSprite).toHaveBeenCalled();
    });

    it("handles upload failures", async () => {
      mockExecSprite.mockResolvedValue({
        success: false,
        stdout: "",
        stderr: "Disk full",
        exitCode: 1,
      });

      const result = await uploadToSpriteVM({
        vmName: "test-vm",
        archivePath,
        config: mockConfig,
        logger: mockLogger,
      });

      expect(result.success).toBe(false);
    });
  });

  describe("downloadFromSpriteVM", () => {
    it("downloads and decodes archive successfully", async () => {
      const fakeArchive = Buffer.from("fake-archive-content");
      const base64Archive = fakeArchive.toString("base64");

      mockExecSprite.mockResolvedValue({
        success: true,
        stdout: base64Archive,
        stderr: "",
        exitCode: 0,
      });

      const result = await downloadFromSpriteVM({
        vmName: "test-vm",
        config: mockConfig,
        logger: mockLogger,
      });

      expect(result.success).toBe(true);
      expect(result.archiveBuffer).toEqual(fakeArchive);
      expect(result.archiveSize).toBe(fakeArchive.length);
      expect(mockExecSprite).toHaveBeenCalledWith(
        "test-vm",
        expect.arrayContaining([
          "sh",
          "-c",
          expect.stringContaining("tar czf -"),
        ]),
        mockConfig,
        mockLogger,
      );
    });

    it("handles download failures", async () => {
      mockExecSprite.mockResolvedValue({
        success: false,
        stdout: "",
        stderr: "tar: error",
        exitCode: 1,
      });

      const result = await downloadFromSpriteVM({
        vmName: "test-vm",
        config: mockConfig,
        logger: mockLogger,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Archive creation in VM failed");
    });

    it("handles base64 decoding errors", async () => {
      mockExecSprite.mockResolvedValue({
        success: true,
        stdout: "invalid-base64!!!",
        stderr: "",
        exitCode: 0,
      });

      const result = await downloadFromSpriteVM({
        vmName: "test-vm",
        config: mockConfig,
        logger: mockLogger,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to decode archive");
    });
  });

  describe("extractProjectArchive", () => {
    it("extracts archive buffer successfully", async () => {
      const fakeArchive = Buffer.from("fake-archive-content");

      const mockChild = {
        stderr: {
          on: mock((event, callback) => {}),
        },
        on: mock((event, callback) => {
          if (event === "close") callback(0);
        }),
      };
      mockSpawnFn.mockReturnValue(mockChild);

      const result = await extractProjectArchive({
        archiveBuffer: fakeArchive,
        projectRoot: tempProject,
        logger: mockLogger,
      });

      expect(result.success).toBe(true);
      expect(result.extractedPath).toBe(tempProject);
      expect(mockWriteFile).toHaveBeenCalled();
      expect(mockRm).toHaveBeenCalled(); // temp dir cleanup
    });

    it("handles tar extraction failures", async () => {
      const fakeArchive = Buffer.from("fake-archive-content");

      const mockChild = {
        stderr: {
          on: mock((event, callback) => {
            if (event === "data") callback("tar: error");
          }),
        },
        on: mock((event, callback) => {
          if (event === "close") callback(1);
        }),
      };
      mockSpawnFn.mockReturnValue(mockChild);

      const result = await extractProjectArchive({
        archiveBuffer: fakeArchive,
        projectRoot: tempProject,
        logger: mockLogger,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("tar extraction failed");
    });

    it("cleans up temp files on error", async () => {
      mockWriteFile.mockRejectedValue(new Error("Write failed"));

      const result = await extractProjectArchive({
        archiveBuffer: Buffer.from("test"),
        projectRoot: tempProject,
        logger: mockLogger,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to write temp archive");
    });
  });
});
