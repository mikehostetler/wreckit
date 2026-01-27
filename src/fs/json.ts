import * as fs from "node:fs/promises";
import * as path from "node:path";
import { z } from "zod";
import {
  InvalidJsonError,
  SchemaValidationError,
  FileNotFoundError,
} from "../errors";
import {
  ConfigSchema,
  ItemSchema,
  PrdSchema,
  IndexSchema,
  BatchProgressSchema,
  type Config,
  type Item,
  type Prd,
  type Index,
  type BatchProgress,
} from "../schemas";
import { getConfigPath, getIndexPath, getBatchProgressPath } from "./paths";
import { safeWriteJson } from "./atomic";
import { FileLock, withRetry } from "./lock";

export async function readJsonWithSchema<T>(
  filePath: string,
  schema: z.ZodType<T>,
  options?: { useLock?: boolean },
): Promise<T> {
  const readImpl = async (): Promise<T> => {
    let content: string;
    try {
      content = await fs.readFile(filePath, "utf-8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw new FileNotFoundError(`File not found: ${filePath}`);
      }
      throw err;
    }

    let data: unknown;
    try {
      data = JSON.parse(content);
    } catch {
      throw new InvalidJsonError(`Invalid JSON in file: ${filePath}`);
    }

    const result = schema.safeParse(data);
    if (!result.success) {
      throw new SchemaValidationError(
        `Schema validation failed for ${filePath}: ${result.error.message}`,
      );
    }

    return result.data;
  };

  // Use shared lock for concurrent-safe reads if requested
  if (options?.useLock) {
    return FileLock.withSharedLock(filePath, readImpl);
  }

  return readImpl();
}

export async function writeJsonPretty(
  filePath: string,
  data: unknown,
  options?: { useLock?: boolean },
): Promise<void> {
  const writeImpl = async (): Promise<void> => {
    await safeWriteJson(filePath, data);
  };

  // Use exclusive lock for concurrent-safe writes if requested
  if (options?.useLock) {
    await withRetry(() => FileLock.withExclusiveLock(filePath, writeImpl));
  } else {
    await writeImpl();
  }
}

export async function readConfig(root: string): Promise<Config> {
  return readJsonWithSchema(getConfigPath(root), ConfigSchema);
}

export async function readItem(itemDir: string): Promise<Item> {
  const itemPath = path.join(itemDir, "item.json");
  return readJsonWithSchema(itemPath, ItemSchema);
}

export async function writeItem(itemDir: string, item: Item): Promise<void> {
  const itemPath = path.join(itemDir, "item.json");
  await writeJsonPretty(itemPath, item, { useLock: true });
}

export async function readPrd(itemDir: string): Promise<Prd> {
  const prdPath = path.join(itemDir, "prd.json");
  return readJsonWithSchema(prdPath, PrdSchema);
}

export async function writePrd(itemDir: string, prd: Prd): Promise<void> {
  const prdPath = path.join(itemDir, "prd.json");
  await writeJsonPretty(prdPath, prd, { useLock: true });
}

export async function readIndex(root: string): Promise<Index | null> {
  try {
    return await readJsonWithSchema(getIndexPath(root), IndexSchema);
  } catch (err) {
    if (err instanceof FileNotFoundError) {
      return null;
    }
    throw err;
  }
}

export async function writeIndex(root: string, index: Index): Promise<void> {
  await writeJsonPretty(getIndexPath(root), index, { useLock: true });
}

export async function readBatchProgress(
  root: string,
): Promise<BatchProgress | null> {
  const progressPath = getBatchProgressPath(root);
  try {
    return await readJsonWithSchema(progressPath, BatchProgressSchema, {
      useLock: true,
    });
  } catch (err) {
    if (err instanceof FileNotFoundError) {
      return null;
    }
    // Schema validation errors are expected (corrupt progress file)
    // These are detected and fixed by doctor, so return null to allow continue
    if (
      err instanceof SchemaValidationError ||
      err instanceof InvalidJsonError
    ) {
      return null;
    }
    // Permission errors and I/O errors should propagate (Spec 002 Gap 3)
    throw err;
  }
}

export async function writeBatchProgress(
  root: string,
  progress: BatchProgress,
): Promise<void> {
  const progressPath = getBatchProgressPath(root);
  await writeJsonPretty(progressPath, progress, { useLock: true });
}

export async function clearBatchProgress(root: string): Promise<void> {
  const progressPath = getBatchProgressPath(root);
  try {
    await fs.unlink(progressPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
  }
  // Also clean up any orphaned lock file
  try {
    await fs.unlink(`${progressPath}.lock`);
  } catch {
    // Ignore lock cleanup errors
  }
}
