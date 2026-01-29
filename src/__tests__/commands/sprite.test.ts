import {
  describe,
  expect,
  it,
  beforeEach,
  afterEach,
  spyOn,
  vi,
} from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { ChildProcess } from "node:child_process";
import {
  spriteStartCommand,
  spriteListCommand,
  spriteKillCommand,
  spriteAttachCommand,
  spriteExecCommand,
} from "../../commands/sprite";
import type { Logger } from "../../logging";

function createMockLogger(): Logger & { messages: string[] } {
  const messages: string[] = [];
  return {
    messages,
    debug: vi.fn((msg: string) => messages.push(`debug: ${msg}`)),
    info: vi.fn((msg: string) => messages.push(`info: ${msg}`)),
    warn: vi.fn((msg: string) => messages.push(`warn: ${msg}`)),
    error: vi.fn((msg: string) => messages.push(`error: ${msg}`)),
    json: vi.fn(),
  };
}

async function setupTempDir(): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-sprite-test-"));
}

async function setupTempGitRepo(): Promise<string> {
  const tempDir = await setupTempDir();
  await fs.mkdir(path.join(tempDir, ".git"), { recursive: true });
  return tempDir;
}

async function setupSpriteConfig(tempDir: string): Promise<void> {
  const wreckitDir = path.join(tempDir, ".wreckit");
  await fs.mkdir(wreckitDir, { recursive: true });

  const configPath = path.join(wreckitDir, "config.json");
  const config = {
    schema_version: 1,
    base_branch: "main",
    branch_prefix: "wreckit/",
    merge_mode: "pr",
    agent: {
      kind: "sprite",
      wispPath: "sprite",
      maxVMs: 5,
      defaultMemory: "512MiB",
      defaultCPUs: "1",
      timeout: 300,
    },
    max_iterations: 100,
    timeout_seconds: 3600,
  };

  await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
}

function mockSpawnSuccess(stdout: string, stderr: string = "") {
  const mockChild = {
    stdout: {
      on: vi.fn((event, callback) => {
        if (event === "data") callback(Buffer.from(stdout));
      }),
    },
    stderr: {
      on: vi.fn((event, callback) => {
        if (event === "data") callback(Buffer.from(stderr));
      }),
    },
    on: vi.fn((event, callback) => {
      if (event === "close") callback(0);
    }),
    kill: vi.fn(),
  } as unknown as ChildProcess;

  return spyOn(global, "spawn").mockReturnValue(mockChild);
}

function mockSpawnError(errorCode: string = "ENOENT") {
  const error = new Error(`spawn ${errorCode}`);
  (error as NodeJS.ErrnoException).code = errorCode;

  const mockChild = {
    on: vi.fn((event, callback) => {
      if (event === "error") callback(error);
    }),
    kill: vi.fn(),
  } as unknown as ChildProcess;

  return spyOn(global, "spawn").mockReturnValue(mockChild);
}

function mockSpawnFailure(exitCode: number, stderr: string) {
  const mockChild = {
    stdout: {
      on: vi.fn(),
    },
    stderr: {
      on: vi.fn((event, callback) => {
        if (event === "data") callback(Buffer.from(stderr));
      }),
    },
    on: vi.fn((event, callback) => {
      if (event === "close") callback(exitCode);
    }),
    kill: vi.fn(),
  } as unknown as ChildProcess;

  return spyOn(global, "spawn").mockReturnValue(mockChild);
}

describe("spriteStartCommand", () => {
  let tempDir: string;
  let mockLogger: Logger & { messages: string[] };

  beforeEach(async () => {
    mockLogger = createMockLogger();
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("starts a Sprite successfully", async () => {
    tempDir = await setupTempGitRepo();
    await setupSpriteConfig(tempDir);

    const spawnSpy = mockSpawnSuccess("Started sprite test-sprite\n");

    const consoleSpy = spyOn(console, "log");
    await spriteStartCommand({ name: "test-sprite", cwd: tempDir }, mockLogger);

    expect(spawnSpy).toHaveBeenCalledWith("sprite", [
      "start",
      "test-sprite",
      "--memory",
      "512MiB",
      "--cpus",
      "1",
    ]);

    const calls = consoleSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.includes("Started Sprite 'test-sprite'"))).toBe(
      true,
    );

    consoleSpy.mockRestore();
    spawnSpy.mockRestore();
  });

  it("starts a Sprite with custom memory and CPUs", async () => {
    tempDir = await setupTempGitRepo();
    await setupSpriteConfig(tempDir);

    const spawnSpy = mockSpawnSuccess("Started sprite test-sprite\n");

    await spriteStartCommand(
      { name: "test-sprite", memory: "1GiB", cpus: "2", cwd: tempDir },
      mockLogger,
    );

    expect(spawnSpy).toHaveBeenCalledWith("sprite", [
      "start",
      "test-sprite",
      "--memory",
      "1GiB",
      "--cpus",
      "2",
    ]);

    spawnSpy.mockRestore();
  });

  it("outputs JSON when --json flag is provided", async () => {
    tempDir = await setupTempGitRepo();
    await setupSpriteConfig(tempDir);

    mockSpawnSuccess("Started sprite test-sprite\n");

    const consoleSpy = spyOn(console, "log");
    await spriteStartCommand(
      { name: "test-sprite", cwd: tempDir, json: true },
      mockLogger,
    );

    const calls = consoleSpy.mock.calls.map((c) => String(c[0]));
    const jsonOutput = calls.find((c) => c.includes('"success": true'));

    expect(jsonOutput).toBeDefined();
    expect(jsonOutput).toContain("test-sprite");

    consoleSpy.mockRestore();
  });

  it("handles Wisp not found error", async () => {
    tempDir = await setupTempGitRepo();
    await setupSpriteConfig(tempDir);

    const spawnSpy = mockSpawnError("ENOENT");

    const consoleSpy = spyOn(console, "error");
    const exitSpy = spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`Process exited with code ${code}`);
    });

    await expect(
      spriteStartCommand({ name: "test-sprite", cwd: tempDir }, mockLogger),
    ).rejects.toThrow();

    const calls = consoleSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.includes("Wisp CLI not found"))).toBe(true);

    consoleSpy.mockRestore();
    exitSpy.mockRestore();
    spawnSpy.mockRestore();
  });

  it("fails if agent kind is not sprite", async () => {
    tempDir = await setupTempGitRepo();

    // Create config with wrong agent kind
    const wreckitDir = path.join(tempDir, ".wreckit");
    await fs.mkdir(wreckitDir, { recursive: true });

    const configPath = path.join(wreckitDir, "config.json");
    const config = {
      schema_version: 1,
      base_branch: "main",
      branch_prefix: "wreckit/",
      merge_mode: "pr",
      agent: {
        kind: "claude_sdk",
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
      },
      max_iterations: 100,
      timeout_seconds: 3600,
    };

    await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");

    await expect(
      spriteStartCommand({ name: "test-sprite", cwd: tempDir }, mockLogger),
    ).rejects.toThrow("Agent kind must be 'sprite'");
  });
});

describe("spriteListCommand", () => {
  let tempDir: string;
  let mockLogger: Logger & { messages: string[] };

  beforeEach(async () => {
    mockLogger = createMockLogger();
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("lists active Sprites", async () => {
    tempDir = await setupTempGitRepo();
    await setupSpriteConfig(tempDir);

    const spritesJson = JSON.stringify([
      { id: "sprite-1", name: "test-sprite-1", state: "running" },
      { id: "sprite-2", name: "test-sprite-2", state: "running" },
    ]);

    mockSpawnSuccess(spritesJson);

    const consoleSpy = spyOn(console, "log");
    await spriteListCommand({ cwd: tempDir }, mockLogger);

    const calls = consoleSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.includes("Active Sprites: 2"))).toBe(true);

    consoleSpy.mockRestore();
  });

  it("shows 'No active Sprites' when list is empty", async () => {
    tempDir = await setupTempGitRepo();
    await setupSpriteConfig(tempDir);

    mockSpawnSuccess("[]");

    const consoleSpy = spyOn(console, "log");
    await spriteListCommand({ cwd: tempDir }, mockLogger);

    const calls = consoleSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.includes("No active Sprites"))).toBe(true);

    consoleSpy.mockRestore();
  });

  it("outputs JSON when --json flag is provided", async () => {
    tempDir = await setupTempGitRepo();
    await setupSpriteConfig(tempDir);

    const spritesJson = JSON.stringify([
      { id: "sprite-1", name: "test-sprite-1", state: "running" },
    ]);

    mockSpawnSuccess(spritesJson);

    const consoleSpy = spyOn(console, "log");
    await spriteListCommand({ cwd: tempDir, json: true }, mockLogger);

    const calls = consoleSpy.mock.calls.map((c) => String(c[0]));
    const jsonOutput = calls.find((c) => c.includes('"success": true'));

    expect(jsonOutput).toBeDefined();
    expect(jsonOutput).toContain("sprite-1");

    consoleSpy.mockRestore();
  });
});

describe("spriteKillCommand", () => {
  let tempDir: string;
  let mockLogger: Logger & { messages: string[] };

  beforeEach(async () => {
    mockLogger = createMockLogger();
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("kills a Sprite successfully", async () => {
    tempDir = await setupTempGitRepo();
    await setupSpriteConfig(tempDir);

    const spawnSpy = mockSpawnSuccess("Killed sprite test-sprite\n");

    const consoleSpy = spyOn(console, "log");
    await spriteKillCommand({ name: "test-sprite", cwd: tempDir }, mockLogger);

    expect(spawnSpy).toHaveBeenCalledWith("sprite", ["kill", "test-sprite"]);

    const calls = consoleSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.includes("Killed Sprite 'test-sprite'"))).toBe(
      true,
    );

    consoleSpy.mockRestore();
    spawnSpy.mockRestore();
  });

  it("outputs JSON when --json flag is provided", async () => {
    tempDir = await setupTempGitRepo();
    await setupSpriteConfig(tempDir);

    mockSpawnSuccess("Killed sprite test-sprite\n");

    const consoleSpy = spyOn(console, "log");
    await spriteKillCommand(
      { name: "test-sprite", cwd: tempDir, json: true },
      mockLogger,
    );

    const calls = consoleSpy.mock.calls.map((c) => String(c[0]));
    const jsonOutput = calls.find((c) => c.includes('"success": true'));

    expect(jsonOutput).toBeDefined();
    expect(jsonOutput).toContain("test-sprite");

    consoleSpy.mockRestore();
  });
});

describe("spriteAttachCommand", () => {
  let tempDir: string;
  let mockLogger: Logger & { messages: string[] };

  beforeEach(async () => {
    mockLogger = createMockLogger();
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("attaches to a Sprite successfully", async () => {
    tempDir = await setupTempGitRepo();
    await setupSpriteConfig(tempDir);

    const spawnSpy = mockSpawnSuccess("Attached to sprite test-sprite\n");

    const consoleSpy = spyOn(console, "log");
    await spriteAttachCommand(
      { name: "test-sprite", cwd: tempDir },
      mockLogger,
    );

    expect(spawnSpy).toHaveBeenCalledWith("sprite", ["attach", "test-sprite"]);

    const calls = consoleSpy.mock.calls.map((c) => String(c[0]));
    expect(
      calls.some((c) => c.includes("Attached to Sprite 'test-sprite'")),
    ).toBe(true);

    consoleSpy.mockRestore();
    spawnSpy.mockRestore();
  });

  it("outputs JSON when --json flag is provided", async () => {
    tempDir = await setupTempGitRepo();
    await setupSpriteConfig(tempDir);

    mockSpawnSuccess("Attached to sprite test-sprite\n");

    const consoleSpy = spyOn(console, "log");
    await spriteAttachCommand(
      { name: "test-sprite", cwd: tempDir, json: true },
      mockLogger,
    );

    const calls = consoleSpy.mock.calls.map((c) => String(c[0]));
    const jsonOutput = calls.find((c) => c.includes('"success": true'));

    expect(jsonOutput).toBeDefined();
    expect(jsonOutput).toContain("test-sprite");

    consoleSpy.mockRestore();
  });
});

describe("spriteExecCommand", () => {
  let tempDir: string;
  let mockLogger: Logger & { messages: string[] };

  beforeEach(async () => {
    mockLogger = createMockLogger();
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("executes a command in a Sprite successfully", async () => {
    tempDir = await setupTempGitRepo();
    await setupSpriteConfig(tempDir);

    const mockStdout = "file1.txt\nfile2.txt\n";
    const spawnSpy = mockSpawnSuccess(mockStdout);

    const consoleSpy = spyOn(console, "log");
    await spriteExecCommand(
      { name: "test-sprite", command: ["ls", "-la"], cwd: tempDir },
      mockLogger,
    );

    expect(spawnSpy).toHaveBeenCalledWith("sprite", [
      "exec",
      "test-sprite",
      "ls",
      "-la",
    ]);

    const calls = consoleSpy.mock.calls.map((c) => String(c[0]));
    expect(
      calls.some((c) => c.includes("Executed command in Sprite 'test-sprite'")),
    ).toBe(true);
    expect(calls.some((c) => c.includes("file1.txt"))).toBe(true);

    consoleSpy.mockRestore();
    spawnSpy.mockRestore();
  });

  it("handles command execution failure (non-zero exit code)", async () => {
    tempDir = await setupTempGitRepo();
    await setupSpriteConfig(tempDir);

    const mockStderr = "Error: Command not found\n";
    const spawnSpy = mockSpawnFailure(1, mockStderr);

    const consoleSpy = spyOn(console, "log");
    const consoleErrorSpy = spyOn(console, "error");
    const exitSpy = spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`Process exited with code ${code}`);
    });

    await expect(
      spriteExecCommand(
        { name: "test-sprite", command: ["invalid-command"], cwd: tempDir },
        mockLogger,
      ),
    ).rejects.toThrow();

    expect(consoleErrorSpy).toHaveBeenCalled();
    const errorCalls = consoleErrorSpy.mock.calls.map((c) => String(c[0]));
    expect(
      errorCalls.some((c) => c.includes("Command failed with exit code 1")),
    ).toBe(true);

    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    exitSpy.mockRestore();
    spawnSpy.mockRestore();
  });

  it("outputs JSON format when --json flag is provided", async () => {
    tempDir = await setupTempGitRepo();
    await setupSpriteConfig(tempDir);

    const mockStdout = "Command output\n";
    const spawnSpy = mockSpawnSuccess(mockStdout);

    const consoleSpy = spyOn(console, "log");
    await spriteExecCommand(
      {
        name: "test-sprite",
        command: ["echo", "hello"],
        cwd: tempDir,
        json: true,
      },
      mockLogger,
    );

    const calls = consoleSpy.mock.calls.map((c) => String(c[0]));
    const jsonOutput = calls.find((c) => c.includes('"success": true'));

    expect(jsonOutput).toBeDefined();
    const parsed = JSON.parse(jsonOutput!);
    expect(parsed.success).toBe(true);
    expect(parsed.data.name).toBe("test-sprite");
    expect(parsed.data.command).toEqual(["echo", "hello"]);
    expect(parsed.data.exitCode).toBe(0);
    expect(parsed.data.stdout).toBe("Command output");

    consoleSpy.mockRestore();
    spawnSpy.mockRestore();
  });

  it("outputs JSON format for command failures", async () => {
    tempDir = await setupTempGitRepo();
    await setupSpriteConfig(tempDir);

    const mockStderr = "Command failed\n";
    const spawnSpy = mockSpawnFailure(2, mockStderr);

    const consoleSpy = spyOn(console, "log");
    const consoleErrorSpy = spyOn(console, "error");
    const exitSpy = spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`Process exited with code ${code}`);
    });

    await expect(
      spriteExecCommand(
        {
          name: "test-sprite",
          command: ["failing-command"],
          cwd: tempDir,
          json: true,
        },
        mockLogger,
      ),
    ).rejects.toThrow();

    const errorCalls = consoleErrorSpy.mock.calls.map((c) => String(c[0]));
    const jsonOutput = errorCalls.find((c) => c.includes('"success": false'));

    expect(jsonOutput).toBeDefined();
    const parsed = JSON.parse(jsonOutput!);
    expect(parsed.success).toBe(false);
    expect(parsed.data.exitCode).toBe(2);

    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    exitSpy.mockRestore();
    spawnSpy.mockRestore();
  });

  it("handles Sprite binary not found error", async () => {
    tempDir = await setupTempGitRepo();
    await setupSpriteConfig(tempDir);

    const spawnSpy = mockSpawnError("ENOENT");

    const consoleSpy = spyOn(console, "log");
    const consoleErrorSpy = spyOn(console, "error");
    const exitSpy = spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`Process exited with code ${code}`);
    });

    await expect(
      spriteExecCommand(
        { name: "test-sprite", command: ["ls"], cwd: tempDir },
        mockLogger,
      ),
    ).rejects.toThrow();

    const errorCalls = consoleErrorSpy.mock.calls.map((c) => String(c[0]));
    expect(errorCalls.some((c) => c.includes("not found"))).toBe(true);

    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    exitSpy.mockRestore();
    spawnSpy.mockRestore();
  });

  it("handles both stdout and stderr output", async () => {
    tempDir = await setupTempGitRepo();
    await setupSpriteConfig(tempDir);

    const mockStdout = "Standard output\n";
    const mockStderr = "Warning message\n";
    const spawnSpy = mockSpawnSuccess(mockStdout, mockStderr);

    const consoleLogSpy = spyOn(console, "log");
    await spriteExecCommand(
      { name: "test-sprite", command: ["npm", "install"], cwd: tempDir },
      mockLogger,
    );

    const logCalls = consoleLogSpy.mock.calls.map((c) => String(c[0]));
    expect(logCalls.some((c) => c.includes("Standard output"))).toBe(true);

    consoleLogSpy.mockRestore();
    spawnSpy.mockRestore();
  });
});
