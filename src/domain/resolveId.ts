import { scanItems, parseItemId } from "./indexing";
import { AmbiguousIdError, ItemNotFoundError } from "../errors";
import type { Item } from "../schemas";
import { logger, type Logger } from "../logging";

export interface ResolvedItem {
  shortId: number;
  fullId: string;
  title: string;
  state: string;
}

export interface ResolveIdOptions {
  logger?: Logger;
}

export async function buildIdMap(
  root: string,
  options?: ResolveIdOptions,
): Promise<ResolvedItem[]> {
  const internalLogger = options?.logger ?? logger;
  const items = await scanItems(root, { logger: internalLogger });
  return items.map((item, index) => ({
    shortId: index + 1,
    fullId: item.id,
    title: item.title,
    state: item.state,
  }));
}

/**
 * Find items matching by numeric prefix.
 * Input "1" or "001" should match items starting with "001-".
 * Normalizes input to zero-padded format based on existing items.
 */
function findByNumericPrefix(items: Item[], input: string): Item[] {
  // Check if input is purely numeric
  if (!/^\d+$/.test(input)) {
    return [];
  }

  const inputNum = parseInt(input, 10);
  if (isNaN(inputNum) || inputNum < 1) {
    return [];
  }

  return items.filter((item) => {
    const parsed = parseItemId(item.id);
    if (!parsed) return false;
    const itemNum = parseInt(parsed.number, 10);
    return itemNum === inputNum;
  });
}

/**
 * Find items matching by slug suffix.
 * Input "dark-mode" should match items ending with "-dark-mode".
 * Matching is case-insensitive for better UX.
 */
function findBySlugSuffix(items: Item[], input: string): Item[] {
  const inputLower = input.toLowerCase();

  return items.filter((item) => {
    const parsed = parseItemId(item.id);
    if (!parsed) return false;
    // Match if the slug equals the input (case-insensitive)
    return parsed.slug.toLowerCase() === inputLower;
  });
}

/**
 * Resolves a user-provided ID to a full item ID.
 *
 * Resolution order (as specified in spec 009-cli.md):
 * 1. Exact match against full item ID
 * 2. Numeric prefix match (e.g., "1" or "001" matches "001-...")
 * 3. Slug suffix match (e.g., "dark-mode" matches "...-dark-mode")
 *
 * Throws AmbiguousIdError if multiple items match at any tier.
 * Throws ItemNotFoundError if no items match.
 */
export async function resolveId(
  root: string,
  input: string,
  options?: ResolveIdOptions,
): Promise<string> {
  const internalLogger = options?.logger ?? logger;
  const items = await scanItems(root, { logger: internalLogger });

  // Tier 1: Exact match
  const exactMatch = items.find((item) => item.id === input);
  if (exactMatch) {
    return exactMatch.id;
  }

  // Tier 2: Numeric prefix match
  const numericMatches = findByNumericPrefix(items, input);
  if (numericMatches.length === 1) {
    return numericMatches[0].id;
  }
  if (numericMatches.length > 1) {
    throw new AmbiguousIdError(
      input,
      numericMatches.map((item) => item.id),
    );
  }

  // Tier 3: Slug suffix match
  const slugMatches = findBySlugSuffix(items, input);
  if (slugMatches.length === 1) {
    return slugMatches[0].id;
  }
  if (slugMatches.length > 1) {
    throw new AmbiguousIdError(
      input,
      slugMatches.map((item) => item.id),
    );
  }

  // No matches found
  throw new ItemNotFoundError(input);
}
