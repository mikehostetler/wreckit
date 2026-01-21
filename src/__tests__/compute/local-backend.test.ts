import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { LocalBackend } from "../../compute/LocalBackend";
import type { IterationState } from "../../compute/ComputeBackend";
import { DEFAULT_CONFIG } from "../../config";
import type { Logger } from "../../logging";

function createTestLogger(): Logger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    json: () => {},
  };
}

describe("LocalBackend", () => {
  let tempDir: string;
  let backend: LocalBackend;
  let logger: Logger;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-local-backend-test-"));
    await fs.mkdir(path.join(tempDir, ".wreckit", "items", "001-test"), { recursive: true });
    logger = createTestLogger();
    backend = new LocalBackend(tempDir, DEFAULT_CONFIG, logger, true);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("sync", () => {
    it("is a no-op for upload", async () => {
      await expect(backend.sync("upload", ["/some/path"])).resolves.toBeUndefined();
    });

    it("is a no-op for download", async () => {
      await expect(backend.sync("download", ["/some/path"])).resolves.toBeUndefined();
    });
  });

  describe("readState", () => {
    it("reads from correct location", async () => {
      const itemId = "001-test";
      const statePath = path.join(tempDir, ".wreckit", "items", itemId, "state.json");
      const state: IterationState = { status: "DONE", summary: "Completed successfully" };
      await fs.writeFile(statePath, JSON.stringify(state));

      const result = await backend.readState(itemId);

      expect(result.status).toBe("DONE");
      expect(result.summary).toBe("Completed successfully");
    });

    it("returns CONTINUE for missing state file", async () => {
      const result = await backend.readState("001-test");

      expect(result.status).toBe("CONTINUE");
    });

    it("returns CONTINUE for invalid state file", async () => {
      const itemId = "001-test";
      const statePath = path.join(tempDir, ".wreckit", "items", itemId, "state.json");
      await fs.writeFile(statePath, JSON.stringify({ invalid: "data" }));

      const result = await backend.readState(itemId);

      expect(result.status).toBe("CONTINUE");
    });

    it("parses NEEDS_INPUT state with question", async () => {
      const itemId = "001-test";
      const statePath = path.join(tempDir, ".wreckit", "items", itemId, "state.json");
      const state: IterationState = {
        status: "NEEDS_INPUT",
        question: "What color should the button be?",
      };
      await fs.writeFile(statePath, JSON.stringify(state));

      const result = await backend.readState(itemId);

      expect(result.status).toBe("NEEDS_INPUT");
      expect(result.question).toBe("What color should the button be?");
    });

    it("parses BLOCKED state with error", async () => {
      const itemId = "001-test";
      const statePath = path.join(tempDir, ".wreckit", "items", itemId, "state.json");
      const state: IterationState = {
        status: "BLOCKED",
        error: "Failed to compile",
      };
      await fs.writeFile(statePath, JSON.stringify(state));

      const result = await backend.readState(itemId);

      expect(result.status).toBe("BLOCKED");
      expect(result.error).toBe("Failed to compile");
    });
  });

  describe("writeResponse", () => {
    it("writes to correct location", async () => {
      const itemId = "001-test";
      const response = "Use blue for the button";

      await backend.writeResponse(itemId, response);

      const responsePath = path.join(tempDir, ".wreckit", "items", itemId, "response.json");
      const content = await fs.readFile(responsePath, "utf-8");
      const data = JSON.parse(content);

      expect(data.response).toBe(response);
      expect(data.timestamp).toBeDefined();
    });

    it("writes valid JSON", async () => {
      const itemId = "001-test";
      await backend.writeResponse(itemId, "test response");

      const responsePath = path.join(tempDir, ".wreckit", "items", itemId, "response.json");
      const content = await fs.readFile(responsePath, "utf-8");

      expect(() => JSON.parse(content)).not.toThrow();
    });
  });

  describe("cleanup", () => {
    it("is a no-op", async () => {
      await expect(backend.cleanup()).resolves.toBeUndefined();
    });
  });

  describe("runIteration", () => {
    it("yields LogEvents from mock agent", async () => {
      const events: Array<{ type: string; message: string }> = [];

      for await (const event of backend.runIteration("001-test", {
        prompt: "Test prompt",
        cwd: tempDir,
      })) {
        events.push({ type: event.type, message: event.message });
      }

      expect(events.length).toBeGreaterThan(0);
      expect(events.every((e) => e.type === "stdout" || e.type === "stderr")).toBe(true);
      expect(events.every((e) => typeof e.message === "string")).toBe(true);
    }, { timeout: 30000 });

    it("yields events with timestamps", async () => {
      for await (const event of backend.runIteration("001-test", {
        prompt: "Test prompt",
        cwd: tempDir,
      })) {
        expect(event.timestamp).toBeDefined();
        expect(new Date(event.timestamp).toISOString()).toBe(event.timestamp);
        break;
      }
    }, { timeout: 30000 });

    it("includes mock agent output in messages", async () => {
      const messages: string[] = [];

      for await (const event of backend.runIteration("001-test", {
        prompt: "Test prompt",
        cwd: tempDir,
      })) {
        messages.push(event.message);
      }

      const output = messages.join("");
      expect(output).toContain("mock-agent");
    }, { timeout: 30000 });
  });

  describe("name", () => {
    it("returns 'local'", () => {
      expect(backend.name).toBe("local");
    });
  });
});
