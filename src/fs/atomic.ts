import * as fs from "node:fs/promises";
import * as path from "node:path";
import { randomBytes } from "node:crypto";

/**
 * Atomically write JSON data to a file.
 *
 * Uses the write-to-temp-then-rename pattern which is atomic on POSIX systems.
 * This prevents partial writes from corrupting data if the process crashes mid-write.
 *
 * @param filePath - The target file path
 * @param data - The data to JSON-stringify and write
 */
export async function safeWriteJson<T>(
  filePath: string,
  data: T
): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  // Generate unique temp file name to avoid collisions
  const tmpSuffix = randomBytes(6).toString("hex");
  const tmpPath = `${filePath}.${tmpSuffix}.tmp`;

  const content = JSON.stringify(data, null, 2) + "\n";

  try {
    await fs.writeFile(tmpPath, content, "utf-8");
    await fs.rename(tmpPath, filePath); // Atomic on POSIX
  } catch (error) {
    // Clean up temp file on failure
    try {
      await fs.unlink(tmpPath);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Clean up orphaned .tmp files in a directory.
 * These can occur if a process crashes during an atomic write.
 *
 * @param dirPath - Directory to scan for orphaned temp files
 * @returns Array of paths that were cleaned up
 */
export async function cleanupOrphanedTmpFiles(
  dirPath: string
): Promise<string[]> {
  const cleaned: string[] = [];

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".tmp")) {
        const tmpPath = path.join(dirPath, entry.name);
        try {
          await fs.unlink(tmpPath);
          cleaned.push(tmpPath);
        } catch {
          // Ignore individual file cleanup errors
        }
      }

      // Recurse into subdirectories
      if (entry.isDirectory()) {
        const subDirPath = path.join(dirPath, entry.name);
        const subCleaned = await cleanupOrphanedTmpFiles(subDirPath);
        cleaned.push(...subCleaned);
      }
    }
  } catch {
    // Directory doesn't exist or can't be read - that's fine
  }

  return cleaned;
}
