import { describe, it, expect, beforeEach, mock } from "bun:test";
import * as path from "node:path";
import {
  createProjectArchive,
  uploadToSpriteVM,
} from "../../fs/sync";
import type { Logger } from "../../logging";
import type { SpriteAgentConfig } from "../../schemas";

// Mocks
const mockStat = mock().mockResolvedValue({ size: 1024 });
const mockUnlink = mock().mockResolvedValue(undefined);
const mockMkdir = mock().mockResolvedValue(undefined);
const mockReadFile = mock().mockResolvedValue(Buffer.from("fake-archive-content"));

mock.module("node:fs/promises", () => ({
  stat: mockStat,
  unlink: mockUnlink,
  mkdir: mockMkdir,
  readFile: mockReadFile,
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
});
