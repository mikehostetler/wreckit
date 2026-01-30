import { describe, test, expect, afterEach } from "vitest";
import { launchTerminal } from "tuistory";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../..");
const CLI_PATH = path.join(ROOT, "dist/index.js");

describe("TUI E2E - status command", () => {
  let session: Awaited<ReturnType<typeof launchTerminal>> | null = null;

  afterEach(() => {
    session?.close();
    session = null;
  });

  test("wreckit --help shows usage", { timeout: 20000 }, async () => {
    session = await launchTerminal({
      command: "node",
      args: [CLI_PATH, "--help"],
      cols: 100,
      rows: 40,
      cwd: ROOT,
    });

    await session.waitForText("wreckit", { timeout: 15000 });

    const text = await session.text();

    expect(text).toContain("wreckit");
    expect(text).toContain("Options");
  });

  test("wreckit status shows item list", { timeout: 20000 }, async () => {
    session = await launchTerminal({
      command: "node",
      args: [CLI_PATH, "status", "--cwd", ROOT],
      cols: 100,
      rows: 30,
      cwd: ROOT,
    });

    // Wait for the status output to render
    await session.waitForText(/Items|No items|done|idea/i, { timeout: 15000 });

    const text = await session.text();

    // The status command should show something meaningful
    expect(text.length).toBeGreaterThan(0);
  });
});
