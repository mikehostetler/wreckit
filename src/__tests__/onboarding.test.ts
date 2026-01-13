import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { runOnboardingIfNeeded } from "../onboarding";
import type { Logger } from "../logging";

function createMockLogger(): Logger & { messages: string[] } {
  const messages: string[] = [];
  return {
    messages,
    debug: vi.fn((msg: string) => messages.push(`debug: ${msg}`)),
    info: vi.fn((msg: string) => messages.push(`info: ${msg}`)),
    warn: vi.fn((msg: string) => messages.push(`warn: ${msg}`)),
    error: vi.fn((msg: string) => messages.push(`error: ${msg}`)),
    json: vi.fn(),
  };
}

describe("runOnboardingIfNeeded", () => {
  let tempDir: string;
  let mockLogger: Logger & { messages: string[] };

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-onboarding-"));
    mockLogger = createMockLogger();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("when not in a git repo", () => {
    it("returns not-git-repo in non-interactive mode", async () => {
      const result = await runOnboardingIfNeeded(mockLogger, {
        cwd: tempDir,
        interactive: false,
        noTui: false,
      });

      expect(result.proceed).toBe(false);
      expect(result.reason).toBe("not-git-repo");
      expect(mockLogger.messages.some((l) => l.includes("Not a git repository"))).toBe(true);
    });
  });

  describe("when in a git repo without .wreckit", () => {
    beforeEach(async () => {
      await fs.mkdir(path.join(tempDir, ".git"));
    });

    it("returns noninteractive when not interactive", async () => {
      const result = await runOnboardingIfNeeded(mockLogger, {
        cwd: tempDir,
        interactive: false,
        noTui: false,
      });

      expect(result.proceed).toBe(false);
      expect(result.reason).toBe("noninteractive");
      expect(mockLogger.messages.some((l) => l.includes("wreckit is not initialized"))).toBe(
        true
      );
      expect(mockLogger.messages.some((l) => l.includes("wreckit init"))).toBe(true);
    });

    it("returns noninteractive when noTui is true", async () => {
      const result = await runOnboardingIfNeeded(mockLogger, {
        cwd: tempDir,
        interactive: true,
        noTui: true,
      });

      expect(result.proceed).toBe(false);
      expect(result.reason).toBe("noninteractive");
    });
  });

  describe("when in a git repo with .wreckit but no ideas", () => {
    beforeEach(async () => {
      await fs.mkdir(path.join(tempDir, ".git"));
      await fs.mkdir(path.join(tempDir, ".wreckit"));
      await fs.writeFile(
        path.join(tempDir, ".wreckit", "config.json"),
        JSON.stringify({ schema_version: 1 })
      );
    });

    it("returns noninteractive when not interactive", async () => {
      const result = await runOnboardingIfNeeded(mockLogger, {
        cwd: tempDir,
        interactive: false,
        noTui: false,
      });

      expect(result.proceed).toBe(false);
      expect(result.reason).toBe("noninteractive");
      expect(mockLogger.messages.some((l) => l.includes("No ideas found"))).toBe(true);
    });
  });

  describe("when in a git repo with .wreckit and ideas", () => {
    beforeEach(async () => {
      await fs.mkdir(path.join(tempDir, ".git"));
      await fs.mkdir(path.join(tempDir, ".wreckit"));
      await fs.writeFile(
        path.join(tempDir, ".wreckit", "config.json"),
        JSON.stringify({ schema_version: 1 })
      );

      const ideaDir = path.join(tempDir, ".wreckit", "features", "001-test-idea");
      await fs.mkdir(ideaDir, { recursive: true });
      await fs.writeFile(
        path.join(ideaDir, "item.json"),
        JSON.stringify({
          schema_version: 1,
          id: "features/001-test-idea",
          title: "Test idea",
          section: "features",
          state: "raw",
          overview: "",
          branch: null,
          pr_url: null,
          pr_number: null,
          last_error: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
      );
    });

    it("proceeds without prompts", async () => {
      const result = await runOnboardingIfNeeded(mockLogger, {
        cwd: tempDir,
        interactive: false,
        noTui: false,
      });

      expect(result.proceed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("proceeds in interactive mode too", async () => {
      const result = await runOnboardingIfNeeded(mockLogger, {
        cwd: tempDir,
        interactive: true,
        noTui: false,
      });

      expect(result.proceed).toBe(true);
    });
  });
});
