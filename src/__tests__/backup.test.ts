import { describe, it, expect, beforeEach, afterEach, vi } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  createSessionId,
  createBackupSession,
  backupFile,
  finalizeBackupSession,
  listBackupSessions,
  cleanupOldBackups,
  removeEmptyBackupSession,
} from "../fs/backup";
import type { Diagnostic } from "../doctor";

async function createWreckitDir(root: string): Promise<void> {
  await fs.mkdir(path.join(root, ".wreckit"), { recursive: true });
  await fs.mkdir(path.join(root, ".git"), { recursive: true });
}

describe("createSessionId", () => {
  it("returns ISO timestamp with safe characters", () => {
    const sessionId = createSessionId();

    // Should not contain colons or periods
    expect(sessionId).not.toContain(":");
    expect(sessionId).not.toContain(".");

    // Should be valid timestamp format (e.g., 2025-01-24T14-30-00-000Z)
    expect(sessionId).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/);
  });

  it("generates unique session IDs", async () => {
    const id1 = createSessionId();
    // Small delay to ensure different timestamp
    await new Promise((r) => setTimeout(r, 2));
    const id2 = createSessionId();

    expect(id1).not.toBe(id2);
  });
});

describe("createBackupSession", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-backup-test-"));
    await createWreckitDir(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("creates backup session directory", async () => {
    const sessionId = await createBackupSession(tempDir);

    expect(sessionId).toBeDefined();
    expect(sessionId.length).toBeGreaterThan(0);

    const sessionDir = path.join(tempDir, ".wreckit", "backups", sessionId);
    const stat = await fs.stat(sessionDir);
    expect(stat.isDirectory()).toBe(true);
  });

  it("returns the session ID", async () => {
    const sessionId = await createBackupSession(tempDir);

    // Should be a valid session ID format
    expect(sessionId).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/);
  });
});

describe("backupFile", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-backup-test-"));
    await createWreckitDir(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("copies file content to backup location", async () => {
    const sessionId = await createBackupSession(tempDir);

    // Create a test file
    const testFilePath = path.join(tempDir, ".wreckit", "test.json");
    const testContent = '{"test": "content"}';
    await fs.writeFile(testFilePath, testContent, "utf-8");

    const diagnostic: Diagnostic = {
      itemId: null,
      severity: "warning",
      code: "TEST_CODE",
      message: "Test message",
      fixable: true,
    };

    const entry = await backupFile(
      tempDir,
      sessionId,
      testFilePath,
      diagnostic,
      "modified",
    );

    expect(entry).not.toBeNull();
    expect(entry!.original_path).toBe(".wreckit/test.json");
    expect(entry!.backup_path).toBe("test.json");
    expect(entry!.operation).toBe("modified");
    expect(entry!.diagnostic_code).toBe("TEST_CODE");
    expect(entry!.item_id).toBeNull();

    // Verify backup content
    const backupPath = path.join(
      tempDir,
      ".wreckit",
      "backups",
      sessionId,
      "test.json",
    );
    const backupContent = await fs.readFile(backupPath, "utf-8");
    expect(backupContent).toBe(testContent);
  });

  it("preserves relative path structure for items", async () => {
    const sessionId = await createBackupSession(tempDir);

    // Create item directory and file
    const itemDir = path.join(tempDir, ".wreckit", "items", "001-test");
    await fs.mkdir(itemDir, { recursive: true });
    const itemFilePath = path.join(itemDir, "item.json");
    const itemContent = '{"id": "001-test"}';
    await fs.writeFile(itemFilePath, itemContent, "utf-8");

    const diagnostic: Diagnostic = {
      itemId: "001-test",
      severity: "warning",
      code: "STATE_FILE_MISMATCH",
      message: "State mismatch",
      fixable: true,
    };

    const entry = await backupFile(
      tempDir,
      sessionId,
      itemFilePath,
      diagnostic,
      "modified",
    );

    expect(entry).not.toBeNull();
    expect(entry!.backup_path).toBe("items/001-test/item.json");
    expect(entry!.item_id).toBe("001-test");

    // Verify backup structure
    const backupPath = path.join(
      tempDir,
      ".wreckit",
      "backups",
      sessionId,
      "items",
      "001-test",
      "item.json",
    );
    const backupContent = await fs.readFile(backupPath, "utf-8");
    expect(backupContent).toBe(itemContent);
  });

  it("returns null if file does not exist", async () => {
    const sessionId = await createBackupSession(tempDir);

    const nonExistentPath = path.join(tempDir, ".wreckit", "nonexistent.json");

    const diagnostic: Diagnostic = {
      itemId: null,
      severity: "warning",
      code: "TEST_CODE",
      message: "Test message",
      fixable: true,
    };

    const entry = await backupFile(
      tempDir,
      sessionId,
      nonExistentPath,
      diagnostic,
      "modified",
    );

    expect(entry).toBeNull();
  });

  it("sets operation type correctly for deleted files", async () => {
    const sessionId = await createBackupSession(tempDir);

    const testFilePath = path.join(tempDir, ".wreckit", "to-delete.json");
    await fs.writeFile(testFilePath, "{}", "utf-8");

    const diagnostic: Diagnostic = {
      itemId: null,
      severity: "warning",
      code: "BATCH_PROGRESS_CORRUPT",
      message: "Corrupt",
      fixable: true,
    };

    const entry = await backupFile(
      tempDir,
      sessionId,
      testFilePath,
      diagnostic,
      "deleted",
    );

    expect(entry).not.toBeNull();
    expect(entry!.operation).toBe("deleted");
  });
});

describe("finalizeBackupSession", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-backup-test-"));
    await createWreckitDir(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("writes manifest with correct schema", async () => {
    const sessionId = await createBackupSession(tempDir);

    const entries = [
      {
        original_path: ".wreckit/test.json",
        backup_path: "test.json",
        operation: "modified" as const,
        diagnostic_code: "TEST_CODE",
        item_id: null,
      },
    ];

    await finalizeBackupSession(tempDir, sessionId, entries);

    const manifestPath = path.join(
      tempDir,
      ".wreckit",
      "backups",
      sessionId,
      "manifest.json",
    );
    const content = await fs.readFile(manifestPath, "utf-8");
    const manifest = JSON.parse(content);

    expect(manifest.schema_version).toBe(1);
    expect(manifest.session_id).toBe(sessionId);
    expect(manifest.reason).toBe("doctor-fix");
    expect(manifest.created_at).toBeDefined();
    expect(manifest.files).toHaveLength(1);
    expect(manifest.files[0].original_path).toBe(".wreckit/test.json");
  });

  it("writes manifest with multiple file entries", async () => {
    const sessionId = await createBackupSession(tempDir);

    const entries = [
      {
        original_path: ".wreckit/index.json",
        backup_path: "index.json",
        operation: "modified" as const,
        diagnostic_code: "INDEX_STALE",
        item_id: null,
      },
      {
        original_path: ".wreckit/items/001-test/item.json",
        backup_path: "items/001-test/item.json",
        operation: "modified" as const,
        diagnostic_code: "STATE_FILE_MISMATCH",
        item_id: "001-test",
      },
    ];

    await finalizeBackupSession(tempDir, sessionId, entries);

    const manifestPath = path.join(
      tempDir,
      ".wreckit",
      "backups",
      sessionId,
      "manifest.json",
    );
    const content = await fs.readFile(manifestPath, "utf-8");
    const manifest = JSON.parse(content);

    expect(manifest.files).toHaveLength(2);
  });
});

describe("listBackupSessions", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-backup-test-"));
    await createWreckitDir(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("returns empty array when no backups exist", async () => {
    const sessions = await listBackupSessions(tempDir);
    expect(sessions).toEqual([]);
  });

  it("returns sessions sorted by date (newest first)", async () => {
    const backupsDir = path.join(tempDir, ".wreckit", "backups");
    await fs.mkdir(backupsDir, { recursive: true });

    // Create sessions with specific names to ensure ordering
    const session1 = "2025-01-24T10-00-00-000Z";
    const session2 = "2025-01-24T12-00-00-000Z";
    const session3 = "2025-01-24T11-00-00-000Z";

    await fs.mkdir(path.join(backupsDir, session1));
    await fs.mkdir(path.join(backupsDir, session2));
    await fs.mkdir(path.join(backupsDir, session3));

    const sessions = await listBackupSessions(tempDir);

    expect(sessions).toEqual([session2, session3, session1]);
  });

  it("only returns directories, not files", async () => {
    const backupsDir = path.join(tempDir, ".wreckit", "backups");
    await fs.mkdir(backupsDir, { recursive: true });

    const session1 = "2025-01-24T10-00-00-000Z";
    await fs.mkdir(path.join(backupsDir, session1));
    await fs.writeFile(path.join(backupsDir, "some-file.txt"), "test");

    const sessions = await listBackupSessions(tempDir);

    expect(sessions).toEqual([session1]);
  });
});

describe("cleanupOldBackups", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-backup-test-"));
    await createWreckitDir(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("keeps specified number of most recent backups", async () => {
    const backupsDir = path.join(tempDir, ".wreckit", "backups");
    await fs.mkdir(backupsDir, { recursive: true });

    // Create 5 sessions
    const sessions = [
      "2025-01-24T10-00-00-000Z",
      "2025-01-24T11-00-00-000Z",
      "2025-01-24T12-00-00-000Z",
      "2025-01-24T13-00-00-000Z",
      "2025-01-24T14-00-00-000Z",
    ];

    for (const session of sessions) {
      await fs.mkdir(path.join(backupsDir, session));
    }

    const deleted = await cleanupOldBackups(tempDir, 3);

    expect(deleted).toHaveLength(2);
    expect(deleted).toContain("2025-01-24T10-00-00-000Z");
    expect(deleted).toContain("2025-01-24T11-00-00-000Z");

    const remaining = await listBackupSessions(tempDir);
    expect(remaining).toHaveLength(3);
    expect(remaining).toContain("2025-01-24T14-00-00-000Z");
    expect(remaining).toContain("2025-01-24T13-00-00-000Z");
    expect(remaining).toContain("2025-01-24T12-00-00-000Z");
  });

  it("does nothing when under the limit", async () => {
    const backupsDir = path.join(tempDir, ".wreckit", "backups");
    await fs.mkdir(backupsDir, { recursive: true });

    const session = "2025-01-24T10-00-00-000Z";
    await fs.mkdir(path.join(backupsDir, session));

    const deleted = await cleanupOldBackups(tempDir, 10);

    expect(deleted).toHaveLength(0);

    const remaining = await listBackupSessions(tempDir);
    expect(remaining).toHaveLength(1);
  });

  it("defaults to keeping 10 sessions", async () => {
    const backupsDir = path.join(tempDir, ".wreckit", "backups");
    await fs.mkdir(backupsDir, { recursive: true });

    // Create 12 sessions
    for (let i = 0; i < 12; i++) {
      const session = `2025-01-24T${String(i).padStart(2, "0")}-00-00-000Z`;
      await fs.mkdir(path.join(backupsDir, session));
    }

    const deleted = await cleanupOldBackups(tempDir);

    expect(deleted).toHaveLength(2);

    const remaining = await listBackupSessions(tempDir);
    expect(remaining).toHaveLength(10);
  });
});

describe("removeEmptyBackupSession", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-backup-test-"));
    await createWreckitDir(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("removes empty session directory", async () => {
    const sessionId = await createBackupSession(tempDir);

    const sessionDir = path.join(tempDir, ".wreckit", "backups", sessionId);
    const statBefore = await fs
      .stat(sessionDir)
      .then(() => true)
      .catch(() => false);
    expect(statBefore).toBe(true);

    await removeEmptyBackupSession(tempDir, sessionId);

    const statAfter = await fs
      .stat(sessionDir)
      .then(() => true)
      .catch(() => false);
    expect(statAfter).toBe(false);
  });

  it("does not throw if session does not exist", async () => {
    await expect(
      removeEmptyBackupSession(tempDir, "nonexistent-session"),
    ).resolves.toBeUndefined();
  });
});
