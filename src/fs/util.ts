import * as fs from "node:fs/promises";
import { ArtifactReadError } from "../errors";

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

/**
 * Result type for tryReadFile.
 * - status: "ok" with content for successful reads
 * - status: "not_found" when file doesn't exist (ENOENT)
 * - status: "error" with ArtifactReadError for permission/I/O errors
 */
export type FileReadResult =
  | { status: "ok"; content: string }
  | { status: "not_found" }
  | { status: "error"; error: ArtifactReadError };

/**
 * Attempt to read a file with proper error categorization.
 * Unlike fs.readFile, this distinguishes between "file not found" (expected)
 * and permission/I/O errors (unexpected, should be reported).
 *
 * @param filePath - Path to the file to read
 * @returns FileReadResult discriminated union
 */
export async function tryReadFile(filePath: string): Promise<FileReadResult> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return { status: "ok", content };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { status: "not_found" };
    }
    return {
      status: "error",
      error: new ArtifactReadError(filePath, err as Error),
    };
  }
}

/**
 * Result type for checkPathAccess.
 * - exists: true if path is accessible
 * - exists: false if path doesn't exist (ENOENT)
 * - exists: false with error if path cannot be accessed (permission/I/O)
 */
export interface PathAccessResult {
  exists: boolean;
  error?: ArtifactReadError;
}

/**
 * Check if a path exists, distinguishing "not found" from "cannot access".
 * Unlike pathExists, this surfaces permission/I/O errors via the error property.
 *
 * @param filePath - Path to check
 * @returns PathAccessResult with exists flag and optional error
 */
export async function checkPathAccess(
  filePath: string,
): Promise<PathAccessResult> {
  try {
    await fs.access(filePath);
    return { exists: true };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { exists: false };
    }
    return {
      exists: false, // We don't know if it exists, but we can't access it
      error: new ArtifactReadError(filePath, err as Error),
    };
  }
}
