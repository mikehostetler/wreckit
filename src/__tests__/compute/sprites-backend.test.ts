import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { SpritesBackend, type SpritesEnv } from "../../compute/sprites/SpritesBackend";
import type { SpritesConfigResolved, LimitsConfigResolved } from "../../config";
import type { Logger } from "../../logging";
import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";

function createTestLogger(): Logger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    json: () => {},
  };
}

function createSpritesConfig(): SpritesConfigResolved {
  return {
    enabled: true,
    name_prefix: "wreckit-test",
    auto_delete: true,
    resume: true,
    workdir: "/var/local/wreckit",
    env_file: ".wreckit/.sprite.env",
    copy_claude_credentials: false,
    github: {
      use_token_for_clone: true,
      git_user_name: "wreckit",
      git_user_email: "wreckit@users.noreply.github.com",
    },
    sync: {
      upload_paths: [".wreckit/config.json", ".wreckit/items"],
      download_paths: [".wreckit/items", ".wreckit/logs"],
    },
  };
}

function createLimitsConfig(): LimitsConfigResolved {
  return {
    max_iterations: 100,
    max_duration_hours: 4,
    max_budget_usd: 20,
    no_progress_threshold: 3,
  };
}

function createSpritesEnv(): SpritesEnv {
  return {
    SPRITE_TOKEN: "test-sprite-token",
    GITHUB_TOKEN: "test-github-token",
  };
}

interface MockSpriteCommand extends EventEmitter {
  stdout: Readable;
  stderr: Readable;
  stdin: Writable;
  kill: () => void;
  wait: () => Promise<number>;
}

function createMockSpriteCommand(): MockSpriteCommand {
  const stdout = new Readable({ read() {} });
  const stderr = new Readable({ read() {} });
  const stdin = new Writable({ write(_chunk, _enc, cb) { cb(); } });
  
  const cmd = new EventEmitter() as MockSpriteCommand;
  cmd.stdout = stdout;
  cmd.stderr = stderr;
  cmd.stdin = stdin;
  cmd.kill = mock(() => {});
  cmd.wait = mock(async () => 0);
  
  return cmd;
}

interface MockSprite {
  name: string;
  exec: ReturnType<typeof mock>;
  spawn: ReturnType<typeof mock>;
  delete: ReturnType<typeof mock>;
}

function createMockSprite(name: string): MockSprite {
  return {
    name,
    exec: mock(async () => ({ stdout: "", stderr: "", exitCode: 0 })),
    spawn: mock(() => createMockSpriteCommand()),
    delete: mock(async () => {}),
  };
}

interface MockSpritesClient {
  sprite: ReturnType<typeof mock>;
  createSprite: ReturnType<typeof mock>;
  getSprite: ReturnType<typeof mock>;
  deleteSprite: ReturnType<typeof mock>;
}

function createMockClient(): MockSpritesClient {
  const mockSprite = createMockSprite("wreckit-test-001-test");
  return {
    sprite: mock(() => mockSprite),
    createSprite: mock(async () => mockSprite),
    getSprite: mock(async () => mockSprite),
    deleteSprite: mock(async () => {}),
  };
}

describe("SpritesBackend", () => {
  let tempDir: string;
  let logger: Logger;
  let config: SpritesConfigResolved;
  let limits: LimitsConfigResolved;
  let env: SpritesEnv;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "wreckit-sprites-backend-test-")
    );
    await fs.mkdir(path.join(tempDir, ".wreckit", "items", "001-test"), {
      recursive: true,
    });
    await fs.mkdir(path.join(tempDir, ".wreckit", "sessions"), {
      recursive: true,
    });
    logger = createTestLogger();
    config = createSpritesConfig();
    limits = createLimitsConfig();
    env = createSpritesEnv();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("create()", () => {
    it("throws when SPRITE_TOKEN is missing", async () => {
      await fs.writeFile(
        path.join(tempDir, ".wreckit", ".sprite.env"),
        "GITHUB_TOKEN=test-token\n"
      );

      await expect(
        SpritesBackend.create(tempDir, config, limits, logger, "owner/repo")
      ).rejects.toThrow("Missing required sprite tokens: SPRITE_TOKEN");
    });

    it("throws when GITHUB_TOKEN is missing", async () => {
      await fs.writeFile(
        path.join(tempDir, ".wreckit", ".sprite.env"),
        "SPRITE_TOKEN=test-token\n"
      );

      await expect(
        SpritesBackend.create(tempDir, config, limits, logger, "owner/repo")
      ).rejects.toThrow("Missing required sprite tokens: GITHUB_TOKEN");
    });

    it("throws when both tokens are missing", async () => {
      await expect(
        SpritesBackend.create(tempDir, config, limits, logger, "owner/repo")
      ).rejects.toThrow(
        "Missing required sprite tokens: SPRITE_TOKEN, GITHUB_TOKEN"
      );
    });

    it("succeeds when all tokens are present", async () => {
      await fs.writeFile(
        path.join(tempDir, ".wreckit", ".sprite.env"),
        "SPRITE_TOKEN=test-sprite-token\nGITHUB_TOKEN=test-github-token\n"
      );

      const backend = await SpritesBackend.create(
        tempDir,
        config,
        limits,
        logger,
        "owner/repo"
      );

      expect(backend.name).toBe("sprites");
    });
  });

  describe("ensureSprite (via runIteration)", () => {
    it("creates new sprite when none exists", async () => {
      const mockClient = createMockClient();
      const backend = new SpritesBackend(
        tempDir,
        config,
        limits,
        logger,
        env,
        "owner/repo",
        { client: mockClient as unknown as import("@fly/sprites").SpritesClient }
      );

      const mockCmd = createMockSpriteCommand();
      const mockSprite = createMockSprite("wreckit-test-001-test");
      mockSprite.spawn = mock(() => mockCmd);
      mockClient.createSprite = mock(async () => mockSprite);

      setTimeout(() => {
        mockCmd.emit("exit", 0);
      }, 10);

      const events: Array<{ type: string }> = [];
      for await (const event of backend.runIteration("001-test", {
        prompt: "Test prompt",
        cwd: tempDir,
      })) {
        events.push({ type: event.type });
      }

      expect(mockClient.createSprite).toHaveBeenCalled();
    });

    it("reuses existing sprite from session", async () => {
      const mockClient = createMockClient();
      const mockSprite = createMockSprite("wreckit-test-001-test");

      await fs.writeFile(
        path.join(tempDir, ".wreckit", "sessions", "owner%2Frepo__001-test.json"),
        JSON.stringify({
          spriteId: "wreckit-test-001-test",
          repoSlug: "owner/repo",
          itemId: "001-test",
          createdAt: new Date().toISOString(),
          lastAccessedAt: new Date().toISOString(),
          status: "active",
        })
      );

      mockClient.getSprite = mock(async () => mockSprite);

      const backend = new SpritesBackend(
        tempDir,
        config,
        limits,
        logger,
        env,
        "owner/repo",
        { client: mockClient as unknown as import("@fly/sprites").SpritesClient }
      );

      const mockCmd = createMockSpriteCommand();
      mockSprite.spawn = mock(() => mockCmd);

      setTimeout(() => {
        mockCmd.emit("exit", 0);
      }, 10);

      for await (const _event of backend.runIteration("001-test", {
        prompt: "Test prompt",
        cwd: tempDir,
      })) {
        // consume events
      }

      expect(mockClient.getSprite).toHaveBeenCalled();
      expect(mockClient.createSprite).not.toHaveBeenCalled();
    });

    it("creates new sprite when session sprite no longer exists", async () => {
      const mockClient = createMockClient();

      await fs.writeFile(
        path.join(tempDir, ".wreckit", "sessions", "owner%2Frepo__001-test.json"),
        JSON.stringify({
          spriteId: "wreckit-test-001-test",
          repoSlug: "owner/repo",
          itemId: "001-test",
          createdAt: new Date().toISOString(),
          lastAccessedAt: new Date().toISOString(),
          status: "active",
        })
      );

      mockClient.getSprite = mock(async () => {
        throw new Error("Sprite not found");
      });

      const mockSprite = createMockSprite("wreckit-test-001-test");
      const mockCmd = createMockSpriteCommand();
      mockSprite.spawn = mock(() => mockCmd);
      mockClient.createSprite = mock(async () => mockSprite);

      const backend = new SpritesBackend(
        tempDir,
        config,
        limits,
        logger,
        env,
        "owner/repo",
        { client: mockClient as unknown as import("@fly/sprites").SpritesClient }
      );

      setTimeout(() => {
        mockCmd.emit("exit", 0);
      }, 10);

      for await (const _event of backend.runIteration("001-test", {
        prompt: "Test prompt",
        cwd: tempDir,
      })) {
        // consume events
      }

      expect(mockClient.getSprite).toHaveBeenCalled();
      expect(mockClient.createSprite).toHaveBeenCalled();
    });
  });

  describe("sync", () => {
    it("uploads files correctly", async () => {
      const mockClient = createMockClient();
      const mockSprite = createMockSprite("wreckit-test-001-test");
      const mockCmd = createMockSpriteCommand();
      mockSprite.spawn = mock(() => mockCmd);
      mockClient.createSprite = mock(async () => mockSprite);

      const backend = new SpritesBackend(
        tempDir,
        config,
        limits,
        logger,
        env,
        "owner/repo",
        { client: mockClient as unknown as import("@fly/sprites").SpritesClient }
      );

      setTimeout(() => mockCmd.emit("exit", 0), 10);
      for await (const _event of backend.runIteration("001-test", {
        prompt: "Test",
        cwd: tempDir,
      })) {
        // consume events
      }

      const testFile = path.join(tempDir, "test-upload.txt");
      await fs.writeFile(testFile, "test content");

      mockSprite.exec.mockClear();
      await backend.sync("upload", ["test-upload.txt"]);

      expect(mockSprite.exec).toHaveBeenCalled();
    });

    it("downloads files correctly", async () => {
      const mockClient = createMockClient();
      const mockSprite = createMockSprite("wreckit-test-001-test");
      const mockCmd = createMockSpriteCommand();
      mockSprite.spawn = mock(() => mockCmd);
      mockClient.createSprite = mock(async () => mockSprite);

      const backend = new SpritesBackend(
        tempDir,
        config,
        limits,
        logger,
        env,
        "owner/repo",
        { client: mockClient as unknown as import("@fly/sprites").SpritesClient }
      );

      setTimeout(() => mockCmd.emit("exit", 0), 10);
      for await (const _event of backend.runIteration("001-test", {
        prompt: "Test",
        cwd: tempDir,
      })) {
        // consume events
      }

      const testContent = "downloaded content";
      const base64Content = Buffer.from(testContent).toString("base64");
      mockSprite.exec = mock(async () => ({
        stdout: base64Content,
        stderr: "",
        exitCode: 0,
      }));

      await backend.sync("download", ["downloaded.txt"]);

      const downloadedPath = path.join(tempDir, "downloaded.txt");
      const content = await fs.readFile(downloadedPath, "utf-8");
      expect(content).toBe(testContent);
    });

    it("throws when no active sprite", async () => {
      const mockClient = createMockClient();
      const backend = new SpritesBackend(
        tempDir,
        config,
        limits,
        logger,
        env,
        "owner/repo",
        { client: mockClient as unknown as import("@fly/sprites").SpritesClient }
      );

      await expect(backend.sync("upload", ["test.txt"])).rejects.toThrow(
        "No active sprite for sync"
      );
    });
  });

  describe("readState", () => {
    it("parses sprite response correctly", async () => {
      const mockClient = createMockClient();
      const mockSprite = createMockSprite("wreckit-test-001-test");
      const mockCmd = createMockSpriteCommand();
      mockSprite.spawn = mock(() => mockCmd);
      mockClient.createSprite = mock(async () => mockSprite);

      const backend = new SpritesBackend(
        tempDir,
        config,
        limits,
        logger,
        env,
        "owner/repo",
        { client: mockClient as unknown as import("@fly/sprites").SpritesClient }
      );

      setTimeout(() => mockCmd.emit("exit", 0), 10);
      for await (const _event of backend.runIteration("001-test", {
        prompt: "Test",
        cwd: tempDir,
      })) {
        // consume events
      }

      mockSprite.exec = mock(async () => ({
        stdout: JSON.stringify({ status: "DONE", summary: "Completed" }),
        stderr: "",
        exitCode: 0,
      }));

      const state = await backend.readState("001-test");

      expect(state.status).toBe("DONE");
      expect(state.summary).toBe("Completed");
    });

    it("returns CONTINUE when no active sprite", async () => {
      const mockClient = createMockClient();
      const backend = new SpritesBackend(
        tempDir,
        config,
        limits,
        logger,
        env,
        "owner/repo",
        { client: mockClient as unknown as import("@fly/sprites").SpritesClient }
      );

      const state = await backend.readState("001-test");

      expect(state.status).toBe("CONTINUE");
    });

    it("returns CONTINUE for invalid state", async () => {
      const mockClient = createMockClient();
      const mockSprite = createMockSprite("wreckit-test-001-test");
      const mockCmd = createMockSpriteCommand();
      mockSprite.spawn = mock(() => mockCmd);
      mockClient.createSprite = mock(async () => mockSprite);

      const backend = new SpritesBackend(
        tempDir,
        config,
        limits,
        logger,
        env,
        "owner/repo",
        { client: mockClient as unknown as import("@fly/sprites").SpritesClient }
      );

      setTimeout(() => mockCmd.emit("exit", 0), 10);
      for await (const _event of backend.runIteration("001-test", {
        prompt: "Test",
        cwd: tempDir,
      })) {
        // consume events
      }

      mockSprite.exec = mock(async () => ({
        stdout: JSON.stringify({ invalid: "data" }),
        stderr: "",
        exitCode: 0,
      }));

      const state = await backend.readState("001-test");

      expect(state.status).toBe("CONTINUE");
    });
  });

  describe("cleanup", () => {
    it("deletes sprite when auto_delete=true and succeeded", async () => {
      const mockClient = createMockClient();
      const mockSprite = createMockSprite("wreckit-test-001-test");
      const mockCmd = createMockSpriteCommand();
      mockSprite.spawn = mock(() => mockCmd);
      mockClient.createSprite = mock(async () => mockSprite);

      const backend = new SpritesBackend(
        tempDir,
        config,
        limits,
        logger,
        env,
        "owner/repo",
        { client: mockClient as unknown as import("@fly/sprites").SpritesClient }
      );

      setTimeout(() => mockCmd.emit("exit", 0), 10);
      for await (const _event of backend.runIteration("001-test", {
        prompt: "Test",
        cwd: tempDir,
      })) {
        // consume events
      }

      await backend.cleanup();

      expect(mockSprite.delete).toHaveBeenCalled();
    });

    it("does not delete sprite when auto_delete=false", async () => {
      const noDeleteConfig = { ...config, auto_delete: false };
      const mockClient = createMockClient();
      const mockSprite = createMockSprite("wreckit-test-001-test");
      const mockCmd = createMockSpriteCommand();
      mockSprite.spawn = mock(() => mockCmd);
      mockClient.createSprite = mock(async () => mockSprite);

      const backend = new SpritesBackend(
        tempDir,
        noDeleteConfig,
        limits,
        logger,
        env,
        "owner/repo",
        { client: mockClient as unknown as import("@fly/sprites").SpritesClient }
      );

      setTimeout(() => mockCmd.emit("exit", 0), 10);
      for await (const _event of backend.runIteration("001-test", {
        prompt: "Test",
        cwd: tempDir,
      })) {
        // consume events
      }

      await backend.cleanup();

      expect(mockSprite.delete).not.toHaveBeenCalled();
    });

    it("does not delete sprite when execution failed", async () => {
      const mockClient = createMockClient();
      const mockSprite = createMockSprite("wreckit-test-001-test");
      const mockCmd = createMockSpriteCommand();
      mockSprite.spawn = mock(() => mockCmd);
      mockClient.createSprite = mock(async () => mockSprite);

      const backend = new SpritesBackend(
        tempDir,
        config,
        limits,
        logger,
        env,
        "owner/repo",
        { client: mockClient as unknown as import("@fly/sprites").SpritesClient }
      );

      setTimeout(() => mockCmd.emit("exit", 1), 10);
      for await (const _event of backend.runIteration("001-test", {
        prompt: "Test",
        cwd: tempDir,
      })) {
        // consume events
      }

      await backend.cleanup();

      expect(mockSprite.delete).not.toHaveBeenCalled();
    });

    it("updates session status on cleanup", async () => {
      const noDeleteConfig = { ...config, auto_delete: false };
      const mockClient = createMockClient();
      const mockSprite = createMockSprite("wreckit-test-001-test");
      const mockCmd = createMockSpriteCommand();
      mockSprite.spawn = mock(() => mockCmd);
      mockClient.createSprite = mock(async () => mockSprite);

      const backend = new SpritesBackend(
        tempDir,
        noDeleteConfig,
        limits,
        logger,
        env,
        "owner/repo",
        { client: mockClient as unknown as import("@fly/sprites").SpritesClient }
      );

      setTimeout(() => mockCmd.emit("exit", 0), 10);
      for await (const _event of backend.runIteration("001-test", {
        prompt: "Test",
        cwd: tempDir,
      })) {
        // consume events
      }

      await backend.cleanup();

      const sessionPath = path.join(
        tempDir,
        ".wreckit",
        "sessions",
        "owner%2Frepo__001-test.json"
      );
      const sessionContent = await fs.readFile(sessionPath, "utf-8");
      const session = JSON.parse(sessionContent);

      expect(session.status).toBe("completed");
    });
  });

  describe("name", () => {
    it("returns 'sprites'", () => {
      const mockClient = createMockClient();
      const backend = new SpritesBackend(
        tempDir,
        config,
        limits,
        logger,
        env,
        "owner/repo",
        { client: mockClient as unknown as import("@fly/sprites").SpritesClient }
      );

      expect(backend.name).toBe("sprites");
    });
  });
});
