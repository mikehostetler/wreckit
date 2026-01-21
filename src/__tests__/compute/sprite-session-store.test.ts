import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  SpriteSessionStore,
  type SpriteSession,
} from "../../compute/sprites";

describe("SpriteSessionStore", () => {
  let tmpDir: string;
  let store: SpriteSessionStore;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sprite-session-test-"));
    store = new SpriteSessionStore(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("getSessionKey", () => {
    test("generates key from repoSlug and itemId", () => {
      const key = SpriteSessionStore.getSessionKey("mikehostetler/wreckit", "001-add-feature");
      expect(key).toBe("mikehostetler%2Fwreckit__001-add-feature");
    });

    test("handles slashes in repoSlug", () => {
      const key = SpriteSessionStore.getSessionKey("org/repo/sub", "002-fix");
      expect(key).toBe("org%2Frepo%2Fsub__002-fix");
    });

    test("handles special characters", () => {
      const key = SpriteSessionStore.getSessionKey("user/my-repo", "003-feat@test");
      expect(key).toBe("user%2Fmy-repo__003-feat@test");
    });

    test("handles spaces", () => {
      const key = SpriteSessionStore.getSessionKey("user/my repo", "004 feature");
      expect(key).toBe("user%2Fmy%20repo__004 feature");
    });
  });

  describe("save and get", () => {
    test("saves and retrieves a session", async () => {
      const session: SpriteSession = {
        spriteId: "sprite-123",
        repoSlug: "mikehostetler/wreckit",
        itemId: "001-add-feature",
        createdAt: "2024-01-15T10:00:00.000Z",
        lastAccessedAt: "2024-01-15T10:00:00.000Z",
        status: "active",
      };

      await store.save(session);
      const retrieved = await store.get("mikehostetler/wreckit", "001-add-feature");

      expect(retrieved).toEqual(session);
    });

    test("updates existing session", async () => {
      const session: SpriteSession = {
        spriteId: "sprite-123",
        repoSlug: "mikehostetler/wreckit",
        itemId: "001-add-feature",
        createdAt: "2024-01-15T10:00:00.000Z",
        lastAccessedAt: "2024-01-15T10:00:00.000Z",
        status: "active",
      };

      await store.save(session);

      const updatedSession = { ...session, status: "completed" as const };
      await store.save(updatedSession);

      const retrieved = await store.get("mikehostetler/wreckit", "001-add-feature");
      expect(retrieved?.status).toBe("completed");
    });
  });

  describe("delete", () => {
    test("deletes an existing session", async () => {
      const session: SpriteSession = {
        spriteId: "sprite-123",
        repoSlug: "mikehostetler/wreckit",
        itemId: "001-add-feature",
        createdAt: "2024-01-15T10:00:00.000Z",
        lastAccessedAt: "2024-01-15T10:00:00.000Z",
        status: "active",
      };

      await store.save(session);
      await store.delete("mikehostetler/wreckit", "001-add-feature");

      const retrieved = await store.get("mikehostetler/wreckit", "001-add-feature");
      expect(retrieved).toBeNull();
    });

    test("does not throw when deleting non-existent session", async () => {
      await expect(
        store.delete("nonexistent/repo", "000-missing")
      ).resolves.toBeUndefined();
    });
  });

  describe("list", () => {
    test("lists all sessions", async () => {
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

      const sessions = await store.list();
      expect(sessions).toHaveLength(2);
      expect(sessions).toContainEqual(session1);
      expect(sessions).toContainEqual(session2);
    });

    test("returns empty array when no sessions exist", async () => {
      const sessions = await store.list();
      expect(sessions).toEqual([]);
    });
  });

  describe("touch", () => {
    test("updates lastAccessedAt timestamp", async () => {
      const originalTime = "2024-01-15T10:00:00.000Z";
      const session: SpriteSession = {
        spriteId: "sprite-123",
        repoSlug: "mikehostetler/wreckit",
        itemId: "001-add-feature",
        createdAt: originalTime,
        lastAccessedAt: originalTime,
        status: "active",
      };

      await store.save(session);

      await new Promise((resolve) => setTimeout(resolve, 10));
      await store.touch("mikehostetler/wreckit", "001-add-feature");

      const retrieved = await store.get("mikehostetler/wreckit", "001-add-feature");
      expect(retrieved?.lastAccessedAt).not.toBe(originalTime);
      expect(retrieved?.createdAt).toBe(originalTime);
    });

    test("does nothing for non-existent session", async () => {
      await expect(
        store.touch("nonexistent/repo", "000-missing")
      ).resolves.toBeUndefined();
    });
  });

  describe("get returns null for missing session", () => {
    test("returns null when session does not exist", async () => {
      const result = await store.get("nonexistent/repo", "000-missing");
      expect(result).toBeNull();
    });
  });

  describe("handles corrupted JSON gracefully", () => {
    test("get returns null for corrupted JSON file", async () => {
      const sessionsDir = path.join(tmpDir, ".wreckit", "sessions");
      await fs.mkdir(sessionsDir, { recursive: true });

      const key = SpriteSessionStore.getSessionKey("user/repo", "001-test");
      const filePath = path.join(sessionsDir, `${key}.json`);
      await fs.writeFile(filePath, "{ invalid json }", "utf-8");

      const result = await store.get("user/repo", "001-test");
      expect(result).toBeNull();
    });

    test("get returns null for invalid schema", async () => {
      const sessionsDir = path.join(tmpDir, ".wreckit", "sessions");
      await fs.mkdir(sessionsDir, { recursive: true });

      const key = SpriteSessionStore.getSessionKey("user/repo", "001-test");
      const filePath = path.join(sessionsDir, `${key}.json`);
      await fs.writeFile(
        filePath,
        JSON.stringify({ spriteId: "test", invalid: true }),
        "utf-8"
      );

      const result = await store.get("user/repo", "001-test");
      expect(result).toBeNull();
    });

    test("list skips corrupted JSON files", async () => {
      const sessionsDir = path.join(tmpDir, ".wreckit", "sessions");
      await fs.mkdir(sessionsDir, { recursive: true });

      const validSession: SpriteSession = {
        spriteId: "sprite-1",
        repoSlug: "user/valid",
        itemId: "001-valid",
        createdAt: "2024-01-15T10:00:00.000Z",
        lastAccessedAt: "2024-01-15T10:00:00.000Z",
        status: "active",
      };
      await store.save(validSession);

      const corruptedKey = SpriteSessionStore.getSessionKey("user/corrupt", "002-corrupt");
      const corruptedPath = path.join(sessionsDir, `${corruptedKey}.json`);
      await fs.writeFile(corruptedPath, "not valid json", "utf-8");

      const sessions = await store.list();
      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toEqual(validSession);
    });
  });
});
