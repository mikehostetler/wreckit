import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  readBatchProgress,
  writeBatchProgress,
  clearBatchProgress,
} from "../fs/json";
import { getBatchProgressPath } from "../fs/paths";
import type { BatchProgress } from "../schemas";

describe("batch progress I/O", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "wreckit-batch-progress-")
    );
    await fs.mkdir(path.join(tempDir, ".wreckit"), { recursive: true });
    await fs.mkdir(path.join(tempDir, ".git"), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("readBatchProgress returns null for missing file", async () => {
    const result = await readBatchProgress(tempDir);
    expect(result).toBeNull();
  });

  it("round-trips batch progress correctly", async () => {
    const progress: BatchProgress = {
      schema_version: 1,
      session_id: "test-roundtrip",
      pid: process.pid,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      parallel: 1,
      queued_items: ["001-test"],
      current_item: null,
      completed: [],
      failed: [],
      skipped: [],
    };

    await writeBatchProgress(tempDir, progress);
    const read = await readBatchProgress(tempDir);

    expect(read).not.toBeNull();
    expect(read!.session_id).toBe("test-roundtrip");
    expect(read!.queued_items).toEqual(["001-test"]);
  });

  it("clearBatchProgress removes file", async () => {
    const progress: BatchProgress = {
      schema_version: 1,
      session_id: "test-clear",
      pid: process.pid,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      parallel: 1,
      queued_items: [],
      current_item: null,
      completed: [],
      failed: [],
      skipped: [],
    };

    await writeBatchProgress(tempDir, progress);
    await clearBatchProgress(tempDir);

    const result = await readBatchProgress(tempDir);
    expect(result).toBeNull();
  });

  it("clearBatchProgress does not throw for missing file", async () => {
    // Should complete without throwing
    await clearBatchProgress(tempDir);
    // If we get here, it didn't throw
    expect(true).toBe(true);
  });

  it("readBatchProgress returns null for invalid JSON", async () => {
    const progressPath = getBatchProgressPath(tempDir);
    await fs.writeFile(progressPath, "{ invalid json }");

    const result = await readBatchProgress(tempDir);
    expect(result).toBeNull();
  });

  it("readBatchProgress returns null for invalid schema", async () => {
    const progressPath = getBatchProgressPath(tempDir);
    await fs.writeFile(
      progressPath,
      JSON.stringify({ schema_version: 999, invalid: true })
    );

    const result = await readBatchProgress(tempDir);
    expect(result).toBeNull();
  });

  it("preserves all batch progress fields", async () => {
    const progress: BatchProgress = {
      schema_version: 1,
      session_id: "test-fields",
      pid: 12345,
      started_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T01:00:00Z",
      parallel: 4,
      queued_items: ["001-item", "002-item"],
      current_item: "001-item",
      completed: ["000-done"],
      failed: ["999-fail"],
      skipped: ["888-skip"],
    };

    await writeBatchProgress(tempDir, progress);
    const read = await readBatchProgress(tempDir);

    expect(read).not.toBeNull();
    expect(read!.schema_version).toBe(1);
    expect(read!.session_id).toBe("test-fields");
    expect(read!.pid).toBe(12345);
    expect(read!.started_at).toBe("2025-01-01T00:00:00Z");
    expect(read!.updated_at).toBe("2025-01-01T01:00:00Z");
    expect(read!.parallel).toBe(4);
    expect(read!.queued_items).toEqual(["001-item", "002-item"]);
    expect(read!.current_item).toBe("001-item");
    expect(read!.completed).toEqual(["000-done"]);
    expect(read!.failed).toEqual(["999-fail"]);
    expect(read!.skipped).toEqual(["888-skip"]);
  });
});
