import * as fs from "node:fs/promises";
import * as path from "node:path";
import { getBuildMetadataPath, findRepoRoot, resolveCwd } from "../fs/paths";

/**
 * Build metadata structure.
 */
export interface BuildMetadata {
  lastBuildTime: string; // ISO-8601 timestamp
  sourceHash: string; // SHA-256 hash of all src/**/*.ts files
  promptsHash: string; // SHA-256 hash of all src/prompts/**/*.md files
  version: string; // Metadata version
  buildSuccess: boolean;
  distExists: boolean;
}

export const BUILD_METADATA_VERSION = "1.0.0";

/**
 * Read build metadata from .wreckit/build-metadata.json.
 *
 * @param root - Repository root directory
 * @returns Build metadata or null if file doesn't exist
 */
export async function readBuildMetadata(
  root?: string,
): Promise<BuildMetadata | null> {
  try {
    const cwd = root ?? resolveCwd();
    const repoRoot = root ?? findRepoRoot(cwd);
    const metadataPath = getBuildMetadataPath(repoRoot);

    const content = await fs.readFile(metadataPath, "utf-8");
    const data = JSON.parse(content) as BuildMetadata;

    // Validate metadata structure
    if (
      !data.lastBuildTime ||
      !data.sourceHash ||
      !data.promptsHash ||
      !data.version
    ) {
      return null;
    }

    return data;
  } catch (err) {
    const errorCode = (err as NodeJS.ErrnoException).code;
    if (errorCode === "ENOENT") {
      return null;
    }
    throw err;
  }
}

/**
 * Write build metadata to .wreckit/build-metadata.json.
 *
 * @param metadata - Build metadata to write
 * @param root - Repository root directory
 */
export async function writeBuildMetadata(
  metadata: BuildMetadata,
  root?: string,
): Promise<void> {
  const cwd = root ?? resolveCwd();
  const repoRoot = root ?? findRepoRoot(cwd);
  const metadataPath = getBuildMetadataPath(repoRoot);

  // Ensure .wreckit directory exists
  await fs.mkdir(path.dirname(metadataPath), { recursive: true });

  // Write metadata atomically
  const tmpPath = `${metadataPath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(metadata, null, 2), "utf-8");
  await fs.rename(tmpPath, metadataPath);
}

/**
 * Create build metadata from current state.
 *
 * @param sourceHash - Current source hash
 * @param promptsHash - Current prompts hash
 * @param buildSuccess - Whether build succeeded
 * @returns Build metadata object
 */
export function createBuildMetadata(
  sourceHash: string,
  promptsHash: string,
  buildSuccess: boolean,
): BuildMetadata {
  return {
    lastBuildTime: new Date().toISOString(),
    sourceHash,
    promptsHash,
    version: BUILD_METADATA_VERSION,
    buildSuccess,
    distExists: buildSuccess, // dist exists if build succeeded
  };
}

/**
 * Update build metadata after a successful build.
 *
 * @param sourceHash - Current source hash
 * @param promptsHash - Current prompts hash
 * @param root - Repository root directory
 */
export async function updateBuildMetadata(
  sourceHash: string,
  promptsHash: string,
  root?: string,
): Promise<void> {
  const metadata = createBuildMetadata(sourceHash, promptsHash, true);
  await writeBuildMetadata(metadata, root);
}

/**
 * Check if dist/ directory is out-of-sync with source.
 *
 * @param currentSourceHash - Current source hash
 * @param currentPromptsHash - Current prompts hash
 * @param root - Repository root directory
 * @returns true if out-of-sync, false if up-to-date
 */
export async function isOutOfSync(
  currentSourceHash: string,
  currentPromptsHash: string,
  root?: string,
): Promise<boolean> {
  const metadata = await readBuildMetadata(root);

  if (!metadata) {
    // No metadata exists, need to build
    return true;
  }

  if (!metadata.buildSuccess || !metadata.distExists) {
    // Previous build failed or dist doesn't exist, need to build
    return true;
  }

  // Check if hashes match
  return (
    metadata.sourceHash !== currentSourceHash ||
    metadata.promptsHash !== currentPromptsHash
  );
}
