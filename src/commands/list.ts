import type { Logger } from "../logging";
import { findRootFromOptions } from "../fs/paths";
import { buildIdMap } from "../domain/resolveId";

export interface ListOptions {
  json?: boolean;
  state?: string;
  cwd?: string;
}

function extractTitle(rawTitle: string): string {
  // Try to parse JSON if it looks like JSON
  if (rawTitle.startsWith("{")) {
    try {
      const parsed = JSON.parse(rawTitle);
      if (typeof parsed.title === "string") {
        return parsed.title;
      }
    } catch {
      // Fall through to return raw title
    }
  }
  return rawTitle;
}

export async function listCommand(
  options: ListOptions,
  _logger: Logger
): Promise<void> {
  const root = findRootFromOptions(options);
  const allItems = await buildIdMap(root);

  const items = options.state
    ? allItems.filter((i) => i.state === options.state)
    : allItems;

  if (options.json) {
    const jsonItems = items.map((i) => ({
      id: i.shortId,
      fullId: i.fullId,
      state: i.state,
      title: i.title,
    }));
    console.log(JSON.stringify(jsonItems, null, 2));
    return;
  }

  if (items.length === 0) {
    console.log("No items found");
    return;
  }

  const stateWidth = Math.max(5, ...items.map((i) => i.state.length));
  
  const cleanItems = items.map((i) => ({
    ...i,
    cleanTitle: extractTitle(i.title),
  }));
  
  const header = `${"#".padStart(3)}  ${"STATE".padEnd(stateWidth)}  TITLE`;
  console.log(header);

  for (const item of cleanItems) {
    const displayTitle = item.cleanTitle.length > 60 
      ? item.cleanTitle.substring(0, 57) + "..."
      : item.cleanTitle;
    const line = `${String(item.shortId).padStart(3)}  ${item.state.padEnd(stateWidth)}  ${displayTitle}`;
    console.log(line);
  }

  console.log("");
  console.log(`Total: ${items.length} item(s)`);
}
