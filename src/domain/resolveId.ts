import { scanItems } from "./indexing";

export interface ResolvedItem {
  shortId: number;
  fullId: string;
  title: string;
  state: string;
}

export async function buildIdMap(root: string): Promise<ResolvedItem[]> {
  const items = await scanItems(root);
  return items.map((item, index) => ({
    shortId: index + 1,
    fullId: item.id,
    title: item.title,
    state: item.state,
  }));
}

export async function resolveId(root: string, input: string): Promise<string> {
  const num = parseInt(input, 10);
  if (isNaN(num) || num < 1) {
    throw new Error(`Invalid item ID: ${input}. Use a number (e.g., 1, 2, 3) or full ID (e.g., 001-auth)`);
  }

  const items = await buildIdMap(root);
  const item = items.find((i) => i.shortId === num);

  if (!item) {
    throw new Error(`Item #${num} not found. Use 'wreckit list' to see available items.`);
  }

  return item.fullId;
}
