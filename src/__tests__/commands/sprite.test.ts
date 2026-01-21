import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  spriteStatusCommand,
  spriteResumeCommand,
  spriteDestroyCommand,
} from "../../commands/sprite";
import { SpriteSessionStore, type SpriteSession } from "../../compute/sprites";
import type { Logger } from "../../logging";

function createMockLogger(): Logger {
  return {
    debug: mock(() => {}),
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
    json: mock(() => {}),
  };
}

describe("sprite commands", () => {
  let tmpDir: string;
  let store: SpriteSessionStore;
  let logger: Logger;
  let consoleLogSpy: ReturnType<typeof spyOn>;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sprite-cmd-test-"));
    await fs.mkdir(path.join(tmpDir, ".wreckit"), { recursive: true });
    await fs.mkdir(path.join(tmpDir, ".git"), { recursive: true });
    store = new SpriteSessionStore(tmpDir);
    logger = createMockLogger();
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(async () => {
    consoleLogSpy.mockRestore();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("spriteStatusCommand", () => {
    test("shows message when no sessions exist", async () => {
      await spriteStatusCommand({ cwd: tmpDir }, logger);

      expect(consoleLogSpy).toHaveBeenCalledWith("No active sprite sessions");
    });

    test("lists multiple sessions", async () => {
      const session1: SpriteSession = {
        spriteId: "sprite-1",
        repoSlug: "user/repo1",
        itemId: "001-feat",
        createdAt: "2024-01-15T10:00:00.000Z",
        lastAccessedAt: "2024-01-15T10:00:00.000Z",
        status: "active",
      };

      const session2: SpriteSession = {
        spriteId: "sprite-2",
        repoSlug: "user/repo2",
        itemId: "002-fix",
        createdAt: "2024-01-15T11:00:00.000Z",
        lastAccessedAt: "2024-01-15T11:00:00.000Z",
        status: "paused",
      };

      await store.save(session1);
      await store.save(session2);

      await spriteStatusCommand({ cwd: tmpDir }, logger);

      expect(consoleLogSpy).toHaveBeenCalledWith("Active Sprite Sessions:");
      const calls = consoleLogSpy.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(calls.some((c: string) => c.includes("001-feat"))).toBe(true);
      expect(calls.some((c: string) => c.includes("002-fix"))).toBe(true);
      expect(calls.some((c: string) => c.includes("active"))).toBe(true);
      expect(calls.some((c: string) => c.includes("paused"))).toBe(true);
    });
  });

  describe("spriteResumeCommand", () => {
    test("errors when session not found", async () => {
      await expect(
        spriteResumeCommand("nonexistent-item", { cwd: tmpDir }, logger)
      ).rejects.toThrow("No sprite session found for item: nonexistent-item");
    });

    test("errors when session exists but no SPRITE_TOKEN", async () => {
      const session: SpriteSession = {
        spriteId: "sprite-123",
        repoSlug: "user/repo",
        itemId: "001-feat",
        createdAt: "2024-01-15T10:00:00.000Z",
        lastAccessedAt: "2024-01-15T10:00:00.000Z",
        status: "active",
      };
      await store.save(session);

      await expect(
        spriteResumeCommand("001-feat", { cwd: tmpDir }, logger)
      ).rejects.toThrow("Missing required sprite tokens");
    });
  });

  describe("spriteDestroyCommand", () => {
    test("errors when session not found", async () => {
      await expect(
        spriteDestroyCommand("nonexistent-item", { cwd: tmpDir }, logger)
      ).rejects.toThrow("No sprite session found for item: nonexistent-item");
    });

    test("errors when session is active and --force not provided", async () => {
      const session: SpriteSession = {
        spriteId: "sprite-123",
        repoSlug: "user/repo",
        itemId: "001-feat",
        createdAt: "2024-01-15T10:00:00.000Z",
        lastAccessedAt: "2024-01-15T10:00:00.000Z",
        status: "active",
      };
      await store.save(session);

      await expect(
        spriteDestroyCommand("001-feat", { cwd: tmpDir }, logger)
      ).rejects.toThrow("Session for 001-feat is still active. Use --force to delete anyway.");
    });

    test("removes session when status is not active", async () => {
      const session: SpriteSession = {
        spriteId: "sprite-123",
        repoSlug: "user/repo",
        itemId: "001-feat",
        createdAt: "2024-01-15T10:00:00.000Z",
        lastAccessedAt: "2024-01-15T10:00:00.000Z",
        status: "completed",
      };
      await store.save(session);

      await spriteDestroyCommand("001-feat", { cwd: tmpDir }, logger);

      const remaining = await store.list();
      expect(remaining).toHaveLength(0);
      expect(logger.info).toHaveBeenCalledWith("Removed session for item: 001-feat");
    });

    test("removes session with --force even if active", async () => {
      const session: SpriteSession = {
        spriteId: "sprite-123",
        repoSlug: "user/repo",
        itemId: "001-feat",
        createdAt: "2024-01-15T10:00:00.000Z",
        lastAccessedAt: "2024-01-15T10:00:00.000Z",
        status: "active",
      };
      await store.save(session);

      await spriteDestroyCommand("001-feat", { cwd: tmpDir, force: true }, logger);

      const remaining = await store.list();
      expect(remaining).toHaveLength(0);
      expect(logger.info).toHaveBeenCalledWith("Removed session for item: 001-feat");
    });

    test("warns when SPRITE_TOKEN missing but still removes session", async () => {
      const session: SpriteSession = {
        spriteId: "sprite-123",
        repoSlug: "user/repo",
        itemId: "001-feat",
        createdAt: "2024-01-15T10:00:00.000Z",
        lastAccessedAt: "2024-01-15T10:00:00.000Z",
        status: "paused",
      };
      await store.save(session);

      await spriteDestroyCommand("001-feat", { cwd: tmpDir }, logger);

      expect(logger.warn).toHaveBeenCalledWith("Cannot delete remote sprite: missing SPRITE_TOKEN");
      const remaining = await store.list();
      expect(remaining).toHaveLength(0);
    });
  });
});
