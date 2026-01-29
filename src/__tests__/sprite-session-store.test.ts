import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { SpriteSessionStore, type SpriteSession } from "../agent/sprite-session-store";
import { type Logger } from "../logging";

const mockLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
} as unknown as Logger;

describe("SpriteSessionStore", () => {
  let tempDir: string;
  let store: SpriteSessionStore;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-test-"));
    // Create .wreckit structure and .git to satisfy findRepoRoot
    await fs.mkdir(path.join(tempDir, ".wreckit"), { recursive: true });
    await fs.mkdir(path.join(tempDir, ".git"), { recursive: true });
    store = new SpriteSessionStore(tempDir, mockLogger);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should generate unique session IDs", () => {
    const id1 = SpriteSessionStore.generateSessionId();
    const id2 = SpriteSessionStore.generateSessionId();
    expect(id1).not.toBe(id2);
    expect(id1).toStartWith("sprite-");
  });

  it("should save and load a session", async () => {
    const session: SpriteSession = {
      sessionId: "test-session",
      vmName: "test-vm",
      itemId: "test-item",
      startTime: new Date().toISOString(),
      config: {
        kind: "sprite",
        wispPath: "sprite",
        syncEnabled: true,
        syncExcludePatterns: [],
        syncOnSuccess: false,
        maxVMs: 1,
        defaultMemory: "512MiB",
        defaultCPUs: "1",
        timeout: 300,
      },
      state: "running",
    };

    await store.save(session);
    const loaded = await store.load("test-session");

    expect(loaded).toEqual(session);
  });

  it("should return null for non-existent session", async () => {
    const loaded = await store.load("non-existent");
    expect(loaded).toBeNull();
  });

  it("should list sessions sorted by start time", async () => {
    const session1: SpriteSession = {
      sessionId: "s1",
      vmName: "vm1",
      startTime: new Date(Date.now() - 10000).toISOString(),
      config: {} as any,
      state: "completed",
    };
    const session2: SpriteSession = {
      sessionId: "s2",
      vmName: "vm2",
      startTime: new Date(Date.now()).toISOString(),
      config: {} as any,
      state: "running",
    };

    await store.save(session1);
    await store.save(session2);

    const list = await store.list();
    expect(list).toHaveLength(2);
    expect(list[0].sessionId).toBe("s2"); // Newest first
    expect(list[1].sessionId).toBe("s1");
  });

  it("should filter sessions", async () => {
    const s1: SpriteSession = {
      sessionId: "s1",
      vmName: "vm1",
      itemId: "item1",
      startTime: new Date().toISOString(),
      config: {} as any,
      state: "running",
    };
    const s2: SpriteSession = {
      sessionId: "s2",
      vmName: "vm2",
      itemId: "item2",
      startTime: new Date().toISOString(),
      config: {} as any,
      state: "paused",
    };

    await store.save(s1);
    await store.save(s2);

    const running = await store.list({ state: "running" });
    expect(running).toHaveLength(1);
    expect(running[0].sessionId).toBe("s1");

    const item2 = await store.list({ itemId: "item2" });
    expect(item2).toHaveLength(1);
    expect(item2[0].sessionId).toBe("s2");
  });

  it("should delete a session", async () => {
    const session: SpriteSession = {
      sessionId: "delete-me",
      vmName: "vm",
      startTime: new Date().toISOString(),
      config: {} as any,
      state: "running",
    };

    await store.save(session);
    await store.delete("delete-me");
    const loaded = await store.load("delete-me");
    expect(loaded).toBeNull();
  });

  it("should update session state", async () => {
    const session: SpriteSession = {
      sessionId: "update-me",
      vmName: "vm",
      startTime: new Date().toISOString(),
      config: {} as any,
      state: "running",
    };

    await store.save(session);
    await store.updateState("update-me", "paused", {
      checkpoint: {
        iteration: 5,
        progressLog: "log",
        timestamp: new Date().toISOString(),
      },
    });

    const loaded = await store.load("update-me");
    expect(loaded?.state).toBe("paused");
    expect(loaded?.checkpoint?.iteration).toBe(5);
  });
});
