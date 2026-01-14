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
  type Config,
  type Item,
  type Prd,
  type Index,
} from "../schemas";
import { getConfigPath, getIndexPath } from "./paths";
import { safeWriteJson } from "./atomic";

export async function readJsonWithSchema<T>(
  filePath: string,
  schema: z.ZodType<T>
): Promise<T> {
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
      `Schema validation failed for ${filePath}: ${result.error.message}`
    );
  }

  return result.data;
}

export async function writeJsonPretty(
  filePath: string,
  data: unknown
): Promise<void> {
  await safeWriteJson(filePath, data);
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
  await writeJsonPretty(itemPath, item);
}

export async function readPrd(itemDir: string): Promise<Prd> {
  const prdPath = path.join(itemDir, "prd.json");
  return readJsonWithSchema(prdPath, PrdSchema);
}

export async function writePrd(itemDir: string, prd: Prd): Promise<void> {
  const prdPath = path.join(itemDir, "prd.json");
  await writeJsonPretty(prdPath, prd);
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
  await writeJsonPretty(getIndexPath(root), index);
}
