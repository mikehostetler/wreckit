import { describe, it, expect, beforeEach, afterEach, vi, spyOn } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { Logger } from "../../logging";
import { checkPrMergeability } from "../../git/index";

function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    json: vi.fn(),
  };
}

// Import the git module to spy on its internal function
import * as gitModule from "../../git";

describe("git/index", () => {
  let tempDir: string;
  let mockLogger: Logger;
  let runGhCommandSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-git-test-"));
    mockLogger = createMockLogger();
    // Spy on the internal runGhCommand function
    runGhCommandSpy = vi.spyOn(gitModule, "runGhCommand");
  });

  afterEach(async () => {
    runGhCommandSpy.mockRestore();
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("checkPrMergeability", () => {
    it("returns mergeable: true when PR is mergeable", async () => {
      runGhCommandSpy.mockResolvedValue({
        stdout: JSON.stringify({ mergeable: true }),
        exitCode: 0,
      });

      const result = await checkPrMergeability(123, {
        cwd: tempDir,
        logger: mockLogger,
        dryRun: false,
      });

      expect(result.mergeable).toBe(true);
      expect(result.determined).toBe(true);
    });

    it("returns mergeable: false when PR has conflicts", async () => {
      runGhCommandSpy.mockResolvedValue({
        stdout: JSON.stringify({ mergeable: false }),
        exitCode: 0,
      });

      const result = await checkPrMergeability(456, {
        cwd: tempDir,
        logger: mockLogger,
        dryRun: false,
      });

      expect(result.mergeable).toBe(false);
      expect(result.determined).toBe(true);
    });

    it("returns determined: false when GitHub hasn't calculated mergeability yet", async () => {
      runGhCommandSpy.mockResolvedValue({
        stdout: JSON.stringify({ mergeable: null }),
        exitCode: 0,
      });

      const result = await checkPrMergeability(789, {
        cwd: tempDir,
        logger: mockLogger,
        dryRun: false,
      });

      expect(result.mergeable).toBe(false);
      expect(result.determined).toBe(false);
    });

    it("returns determined: false when gh command fails", async () => {
      runGhCommandSpy.mockResolvedValue({
        stdout: "",
        exitCode: 1,
      });

      const result = await checkPrMergeability(999, {
        cwd: tempDir,
        logger: mockLogger,
        dryRun: false,
      });

      expect(result.mergeable).toBe(false);
      expect(result.determined).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining("Failed to check mergeability"));
    });

    it("returns determined: false when JSON parsing fails", async () => {
      runGhCommandSpy.mockResolvedValue({
        stdout: "invalid json",
        exitCode: 0,
      });

      const result = await checkPrMergeability(111, {
        cwd: tempDir,
        logger: mockLogger,
        dryRun: false,
      });

      expect(result.mergeable).toBe(false);
      expect(result.determined).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining("Failed to parse mergeability"));
    });

    it("returns success in dryRun mode", async () => {
      const result = await checkPrMergeability(222, {
        cwd: tempDir,
        logger: mockLogger,
        dryRun: true,
      });

      expect(result.mergeable).toBe(true);
      expect(result.determined).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("[dry-run]"));
      // In dryRun mode, runGhCommand should not be called
      expect(runGhCommandSpy).not.toHaveBeenCalled();
    });
  });
});
