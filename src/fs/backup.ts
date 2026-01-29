import * as fs from "node:fs/promises";
import * as path from "node:path";
import { safeWriteJson } from "./atomic";
import {
  getBackupsDir,
  getBackupSessionDir,
  getBackupManifestPath,
  getWreckitDir,
} from "./paths";
import type { BackupFileEntry, BackupManifest } from "../schemas";
import type { Diagnostic } from "../doctor";

/**
 * Generate a session ID from current timestamp.
 * Format: ISO 8601 with safe characters for filenames.
 * Example: "2025-01-24T14-30-00-000Z"
 */
export function createSessionId(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/**
 * Create backup session directory.
 * @returns The session ID (not the directory path)
 */
export async function createBackupSession(root: string): Promise<string> {
  const sessionId = createSessionId();
  const sessionDir = getBackupSessionDir(root, sessionId);
  await fs.mkdir(sessionDir, { recursive: true });
  return sessionId;
}

/**
 * Check if a path exists and is accessible.
 * Returns exists=true if file exists and is readable.
 * Returns exists=false if file doesn't exist.
 * Throws if file exists but is not readable (permission error).
 */
async function checkFileAccess(filePath: string): Promise<{ exists: boolean }> {
  try {
    await fs.access(filePath, fs.constants.R_OK);
    return { exists: true };
  } catch (err) {
    const errno = (err as NodeJS.ErrnoException).code;
    if (errno === "ENOENT") {
      return { exists: false };
    }
    // Permission error or other - propagate it
    throw err;
  }
}

/**
 * Backup a file before modification or deletion.
 *
 * @returns BackupFileEntry if backup succeeded, null if file doesn't exist
 * @throws Error if file exists but cannot be read (permission error)
 */
export async function backupFile(
  root: string,
  sessionId: string,
  filePath: string,
  diagnostic: Diagnostic,
  operation: "modified" | "deleted",
): Promise<BackupFileEntry | null> {
  // Check if file exists and is accessible
  const accessCheck = await checkFileAccess(filePath);
  if (!accessCheck.exists) {
    return null; // File doesn't exist, nothing to backup
  }

  // Read file content
  const content = await fs.readFile(filePath, "utf-8");

  const sessionDir = getBackupSessionDir(root, sessionId);
  const wreckitDir = getWreckitDir(root);

  // Calculate relative path from .wreckit directory for backup structure
  const backupRelativePath = path.relative(wreckitDir, filePath);
  // Calculate relative path from repo root for manifest
  const originalRelativePath = path.relative(root, filePath);

  // Create backup path preserving directory structure
  const backupPath = path.join(sessionDir, backupRelativePath);

  // Ensure backup directory exists and write content
  await fs.mkdir(path.dirname(backupPath), { recursive: true });
  await fs.writeFile(backupPath, content, "utf-8");

  return {
    original_path: originalRelativePath,
    backup_path: backupRelativePath,
    operation,
    diagnostic_code: diagnostic.code,
    item_id: diagnostic.itemId,
  };
}

/**
 * Finalize backup session by writing the manifest.
 */
export async function finalizeBackupSession(
  root: string,
  sessionId: string,
  entries: BackupFileEntry[],
): Promise<void> {
  const manifest: BackupManifest = {
    schema_version: 1,
    session_id: sessionId,
    created_at: new Date().toISOString(),
    reason: "doctor-fix",
    files: entries,
  };

  const manifestPath = getBackupManifestPath(root, sessionId);
  await safeWriteJson(manifestPath, manifest);
}

/**
 * List all backup sessions, sorted by date (newest first).
 */
export async function listBackupSessions(root: string): Promise<string[]> {
  const backupsDir = getBackupsDir(root);

  try {
    const entries = await fs.readdir(backupsDir, { withFileTypes: true });
    const sessions = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
      .reverse(); // Newest first (ISO timestamps sort correctly)

    return sessions;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }
}

/**
 * Clean up old backup sessions, keeping only the most recent ones.
 */
export async function cleanupOldBackups(
  root: string,
  keepCount: number = 10,
): Promise<string[]> {
  const sessions = await listBackupSessions(root);
  const deleted: string[] = [];

  if (sessions.length <= keepCount) {
    return deleted;
  }

  const toDelete = sessions.slice(keepCount);
  const backupsDir = getBackupsDir(root);

  for (const sessionId of toDelete) {
    try {
      await fs.rm(path.join(backupsDir, sessionId), {
        recursive: true,
        force: true,
      });
      deleted.push(sessionId);
    } catch {
      // Ignore cleanup errors for individual sessions
    }
  }

  return deleted;
}

/**
 * Remove an empty backup session (when no backups were needed).
 */
export async function removeEmptyBackupSession(
  root: string,
  sessionId: string,
): Promise<void> {
  const sessionDir = getBackupSessionDir(root, sessionId);
  try {
    await fs.rm(sessionDir, { recursive: true, force: true });
  } catch {
    // Ignore removal errors
  }
}
