import * as fs from "node:fs/promises";

/**
 * Check if a path (file or directory) exists.
 * Uses fs.access() for a simple existence check.
 *
 * @param filePath - The path to check
 * @returns Promise that resolves to true if the path exists, false otherwise
 */
export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a path exists and is a directory.
 * Uses fs.stat() to verify the path is a directory, not a file.
 *
 * @param dirPath - The path to check
 * @returns Promise that resolves to true if the path is a directory, false otherwise
 */
export async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}
