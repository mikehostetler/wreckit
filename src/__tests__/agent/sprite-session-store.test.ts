import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { SpriteSessionStore, type SpriteSession } from "../../agent/sprite-session-store";
import { initLogger } from "../../logging";

describe("SpriteSessionStore", () => {
  let tempDir: string;
  let store: SpriteSessionStore;
  let logger: ReturnType<typeof initLogger>;

  beforeEach(async () => {
    // Create a temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-session-test-"));
    logger = initLogger();
    store = new SpriteSessionStore(tempDir, logger);
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  const createMockSession = (overrides?: Partial<SpriteSession>): SpriteSession => ({
    sessionId: "test-session-123",
    vmName: "test-vm",
    itemId: "test-item",
    startTime: new Date().toISOString(),
    config: {
      kind: "sprite",
      wispPath: "sprite",
      syncEnabled: true,
      syncExcludePatterns: [],
      syncOnSuccess: false,
      maxVMs: 5,
      defaultMemory: "512MiB",
      defaultCPUs: "1",
      timeout: 300,
    },
    state: "running",
    ...overrides,
  });

  test("save() writes session file to correct path", async () => {
    const session = createMockSession();
    await store.save(session);

    const sessionPath = path.join(tempDir, ".wreckit", "sessions", `${session.sessionId}.json`);
    const exists = await fs.access(sessionPath).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });

  test("save() creates sessions directory if it doesn't exist", async () => {
    const session = createMockSession();
    await store.save(session);

    const sessionsDir = path.join(tempDir, ".wreckit", "sessions");
    const exists = await fs.access(sessionsDir).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });

  test("load() reads and parses session file correctly", async () => {
    const session = createMockSession();
    await store.save(session);

    const loaded = await store.load(session.sessionId);
    expect(loaded).not.toBeNull();
    expect(loaded?.sessionId).toBe(session.sessionId);
    expect(loaded?.vmName).toBe(session.vmName);
    expect(loaded?.itemId).toBe(session.itemId);
    expect(loaded?.state).toBe(session.state);
  });

  test("load() returns null for non-existent session", async () => {
    const loaded = await store.load("non-existent-session");
    expect(loaded).toBeNull();
  });

  test("list() returns all sessions sorted by startTime (newest first)", async () => {
    const session1 = createMockSession({
      sessionId: "session-1",
      startTime: new Date(Date.now() - 3000).toISOString(), // 3 seconds ago
    });
    const session2 = createMockSession({
      sessionId: "session-2",
      startTime: new Date(Date.now() - 1000).toISOString(), // 1 second ago
    });
    const session3 = createMockSession({
      sessionId: "session-3",
      startTime: new Date(Date.now() - 2000).toISOString(), // 2 seconds ago
    });

    await store.save(session1);
    await store.save(session2);
    await store.save(session3);

    const sessions = await store.list();
    expect(sessions).toHaveLength(3);
    expect(sessions[0].sessionId).toBe("session-2"); // Newest
    expect(sessions[1].sessionId).toBe("session-3");
    expect(sessions[2].sessionId).toBe("session-1"); // Oldest
  });

  test("list({ state: 'paused' }) filters by state", async () => {
    const session1 = createMockSession({ sessionId: "session-1", state: "running" });
    const session2 = createMockSession({ sessionId: "session-2", state: "paused" });
    const session3 = createMockSession({ sessionId: "session-3", state: "paused" });

    await store.save(session1);
    await store.save(session2);
    await store.save(session3);

    const sessions = await store.list({ state: "paused" });
    expect(sessions).toHaveLength(2);
    expect(sessions.every(s => s.state === "paused")).toBe(true);
  });

  test("list({ itemId: '001' }) filters by itemId", async () => {
    const session1 = createMockSession({ sessionId: "session-1", itemId: "item-1" });
    const session2 = createMockSession({ sessionId: "session-2", itemId: "item-2" });
    const session3 = createMockSession({ sessionId: "session-3", itemId: "item-1" });

    await store.save(session1);
    await store.save(session2);
    await store.save(session3);

    const sessions = await store.list({ itemId: "item-1" });
    expect(sessions).toHaveLength(2);
    expect(sessions.every(s => s.itemId === "item-1")).toBe(true);
  });

  test("list({ state: 'paused', itemId: '001' }) filters by both", async () => {
    const session1 = createMockSession({ sessionId: "session-1", state: "running", itemId: "item-1" });
    const session2 = createMockSession({ sessionId: "session-2", state: "paused", itemId: "item-1" });
    const session3 = createMockSession({ sessionId: "session-3", state: "paused", itemId: "item-2" });

    await store.save(session1);
    await store.save(session2);
    await store.save(session3);

    const sessions = await store.list({ state: "paused", itemId: "item-1" });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sessionId).toBe("session-2");
  });

  test("delete() removes session file", async () => {
    const session = createMockSession();
    await store.save(session);

    await store.delete(session.sessionId);

    const sessionPath = path.join(tempDir, ".wreckit", "sessions", `${session.sessionId}.json`);
    const exists = await fs.access(sessionPath).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });

  test("delete() handles non-existent session gracefully", async () => {
    // Should not throw
    await expect(store.delete("non-existent-session")).resolves.not.toThrow();
  });

  test("updateState() updates session state and fields", async () => {
    const session = createMockSession({ state: "running" });
    await store.save(session);

    await store.updateState(session.sessionId, "paused", {
      checkpoint: {
        iteration: 10,
        progressLog: "Test checkpoint",
        timestamp: new Date().toISOString(),
      },
    });

    const updated = await store.load(session.sessionId);
    expect(updated?.state).toBe("paused");
    expect(updated?.checkpoint?.iteration).toBe(10);
  });

  test("updateState() throws error for non-existent session", async () => {
    await expect(
      store.updateState("non-existent-session", "paused")
    ).rejects.toThrow("Session non-existent-session not found");
  });

  test("updateState() sets endTime when state is 'completed'", async () => {
    const session = createMockSession({ state: "running" });
    await store.save(session);

    await store.updateState(session.sessionId, "completed");

    const updated = await store.load(session.sessionId);
    expect(updated?.state).toBe("completed");
    expect(updated?.endTime).toBeDefined();
  });

  test("updateState() sets endTime when state is 'failed'", async () => {
    const session = createMockSession({ state: "running" });
    await store.save(session);

    await store.updateState(session.sessionId, "failed", {
      error: "Test error",
    });

    const updated = await store.load(session.sessionId);
    expect(updated?.state).toBe("failed");
    expect(updated?.endTime).toBeDefined();
    expect(updated?.error).toBe("Test error");
  });
});
