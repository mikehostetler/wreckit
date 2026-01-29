import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";

/**
 * Calculate SHA-256 hash of a single file.
 */
async function hashFile(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * Find all files matching a pattern in a directory recursively.
 */
async function findFiles(
  dir: string,
  extension: string,
): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip node_modules and __tests__ directories
      if (
        entry.name !== "node_modules" &&
        entry.name !== "dist" &&
        entry.name !== ".git"
      ) {
        const subFiles = await findFiles(fullPath, extension);
        files.push(...subFiles);
      }
    } else if (entry.isFile() && entry.name.endsWith(extension)) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Calculate combined SHA-256 hash of all TypeScript files in src/ directory.
 *
 * Hash is computed by:
 * 1. Finding all .ts files recursively
 * 2. Sorting file paths to ensure consistency
 * 3. Computing hash of each file
 * 4. Combining all hashes into a single hash
 *
 * @returns SHA-256 hash as hex string
 */
export async function calculateSourceHash(): Promise<string> {
  const srcDir = path.join(process.cwd(), "src");
  const files = await findFiles(srcDir, ".ts");

  // Sort files to ensure consistent hashing
  files.sort();

  if (files.length === 0) {
    throw new Error("No TypeScript files found in src/");
  }

  // Compute combined hash
  const combinedHash = crypto.createHash("sha256");
  for (const file of files) {
    const fileHash = await hashFile(file);
    combinedHash.update(fileHash);
  }

  return combinedHash.digest("hex");
}

/**
 * Calculate combined SHA-256 hash of all prompt files in src/prompts/ directory.
 *
 * @returns SHA-256 hash as hex string
 */
export async function calculatePromptsHash(): Promise<string> {
  const promptsDir = path.join(process.cwd(), "src", "prompts");

  try {
    await fs.access(promptsDir);
  } catch {
    // Prompts directory doesn't exist, return empty hash
    return crypto.createHash("sha256").digest("hex");
  }

  const files = await findFiles(promptsDir, ".md");

  // Sort files to ensure consistent hashing
  files.sort();

  if (files.length === 0) {
    return crypto.createHash("sha256").digest("hex");
  }

  // Compute combined hash
  const combinedHash = crypto.createHash("sha256");
  for (const file of files) {
    const fileHash = await hashFile(file);
    combinedHash.update(fileHash);
  }

  return combinedHash.digest("hex");
}

/**
 * Calculate both source and prompts hashes.
 *
 * @returns Object containing both hashes
 */
export async function calculateAllHashes(): Promise<{
  sourceHash: string;
  promptsHash: string;
}> {
  const [sourceHash, promptsHash] = await Promise.all([
    calculateSourceHash(),
    calculatePromptsHash(),
  ]);

  return { sourceHash, promptsHash };
}
