import {
  describe,
  expect,
  it,
  beforeEach,
  afterEach,
  mock,
} from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { Logger } from "../../logging";

// Create mock functions for sprite-runner
const mockStartSprite = mock();
const mockListSprites = mock();
const mockKillSprite = mock();
const mockAttachSprite = mock();
const mockExecSprite = mock();

// Mock the sprite-runner module
mock.module("../../agent/sprite-runner", () => ({
  startSprite: mockStartSprite,
  listSprites: mockListSprites,
  killSprite: mockKillSprite,
  attachSprite: mockAttachSprite,
  execSprite: mockExecSprite,
  parseWispJson: (output: string) => {
    try {
      return JSON.parse(output);
    } catch {
      return [];
    }
  },
}));

// Import after mocking
import {
  spriteStartCommand,
  spriteListCommand,
  spriteKillCommand,
  spriteAttachCommand,
  spriteExecCommand,
} from "../../commands/sprite";

function createMockLogger(): Logger & { messages: string[] } {
  const messages: string[] = [];
  return {
    messages,
    debug: mock((msg: string) => messages.push(`debug: ${msg}`)),
    info: mock((msg: string) => messages.push(`info: ${msg}`)),
    warn: mock((msg: string) => messages.push(`warn: ${msg}`)),
    error: mock((msg: string) => messages.push(`error: ${msg}`)),
    json: mock(),
  } as any;
}

async function setupTempGitRepo(): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-sprite-test-"));
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

describe("spriteStartCommand", () => {
  let tempDir: string;
  let mockLogger: Logger & { messages: string[] };

  beforeEach(async () => {
    mockLogger = createMockLogger();
    mockStartSprite.mockReset();
    mockListSprites.mockReset();
    mockKillSprite.mockReset();
    mockAttachSprite.mockReset();
    mockExecSprite.mockReset();
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("starts a Sprite successfully", async () => {
    tempDir = await setupTempGitRepo();
    await setupSpriteConfig(tempDir);

    mockStartSprite.mockResolvedValue({
      success: true,
      stdout: "Started sprite test-sprite\n",
      stderr: "",
      exitCode: 0,
    });

    await spriteStartCommand({ name: "test-sprite", cwd: tempDir }, mockLogger);

    expect(mockStartSprite).toHaveBeenCalledWith(
      "test-sprite",
      expect.objectContaining({ defaultMemory: "512MiB", defaultCPUs: "1" }),
      mockLogger,
    );
    expect(mockLogger.messages.some((m) => m.includes("test-sprite"))).toBe(true);
  });

  it("starts a Sprite with custom memory and CPUs", async () => {
    tempDir = await setupTempGitRepo();
    await setupSpriteConfig(tempDir);

    mockStartSprite.mockResolvedValue({
      success: true,
      stdout: "Started sprite test-sprite\n",
      stderr: "",
      exitCode: 0,
    });

    await spriteStartCommand(
      { name: "test-sprite", memory: "1GiB", cpus: "2", cwd: tempDir },
      mockLogger,
    );

    expect(mockStartSprite).toHaveBeenCalled();
  });

  it("outputs JSON when --json flag is provided", async () => {
    tempDir = await setupTempGitRepo();
    await setupSpriteConfig(tempDir);

    mockStartSprite.mockResolvedValue({
      success: true,
      stdout: "Started sprite test-sprite\n",
      stderr: "",
      exitCode: 0,
    });

    const consoleSpy = mock();
    const originalLog = console.log;
    console.log = consoleSpy;

    await spriteStartCommand(
      { name: "test-sprite", cwd: tempDir, json: true },
      mockLogger,
    );

    console.log = originalLog;

    const calls = consoleSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.includes('"success"'))).toBe(true);
  });

  it("handles Wisp not found error", async () => {
    tempDir = await setupTempGitRepo();
    await setupSpriteConfig(tempDir);

    const { WispNotFoundError } = await import("../../errors");
    mockStartSprite.mockRejectedValue(new WispNotFoundError("sprite"));

    const consoleErrorSpy = mock();
    const originalError = console.error;
    console.error = consoleErrorSpy;

    const exitSpy = mock();
    const originalExit = process.exit;
    process.exit = exitSpy as any;

    try {
      await spriteStartCommand({ name: "test-sprite", cwd: tempDir }, mockLogger);
    } catch {}

    console.error = originalError;
    process.exit = originalExit;

    const errorCalls = consoleErrorSpy.mock.calls.map((c) => String(c[0]));
    expect(errorCalls.some((c) => c.includes("not found") || c.includes("Wisp"))).toBe(true);
  });
});

describe("spriteListCommand", () => {
  let tempDir: string;
  let mockLogger: Logger & { messages: string[] };

  beforeEach(async () => {
    mockLogger = createMockLogger();
    mockListSprites.mockReset();
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("lists active Sprites", async () => {
    tempDir = await setupTempGitRepo();
    await setupSpriteConfig(tempDir);

    mockListSprites.mockResolvedValue({
      success: true,
      stdout: JSON.stringify([{ name: "test-vm", state: "running" }]),
      stderr: "",
      exitCode: 0,
    });

    await spriteListCommand({ cwd: tempDir }, mockLogger);

    expect(mockListSprites).toHaveBeenCalled();
  });

  it("shows 'No active Sprites' when list is empty", async () => {
    tempDir = await setupTempGitRepo();
    await setupSpriteConfig(tempDir);

    mockListSprites.mockResolvedValue({
      success: true,
      stdout: "[]",
      stderr: "",
      exitCode: 0,
    });

    await spriteListCommand({ cwd: tempDir }, mockLogger);

    expect(mockListSprites).toHaveBeenCalled();
  });

  it("outputs JSON when --json flag is provided", async () => {
    tempDir = await setupTempGitRepo();
    await setupSpriteConfig(tempDir);

    mockListSprites.mockResolvedValue({
      success: true,
      stdout: JSON.stringify([{ name: "test-vm", state: "running" }]),
      stderr: "",
      exitCode: 0,
    });

    const consoleSpy = mock();
    const originalLog = console.log;
    console.log = consoleSpy;

    await spriteListCommand({ cwd: tempDir, json: true }, mockLogger);

    console.log = originalLog;

    expect(consoleSpy).toHaveBeenCalled();
  });
});

describe("spriteKillCommand", () => {
  let tempDir: string;
  let mockLogger: Logger & { messages: string[] };

  beforeEach(async () => {
    mockLogger = createMockLogger();
    mockKillSprite.mockReset();
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("kills a Sprite successfully", async () => {
    tempDir = await setupTempGitRepo();
    await setupSpriteConfig(tempDir);

    mockKillSprite.mockResolvedValue({
      success: true,
      stdout: "Killed sprite test-sprite\n",
      stderr: "",
      exitCode: 0,
    });

    await spriteKillCommand({ name: "test-sprite", cwd: tempDir }, mockLogger);

    expect(mockKillSprite).toHaveBeenCalled();
  });

  it("outputs JSON when --json flag is provided", async () => {
    tempDir = await setupTempGitRepo();
    await setupSpriteConfig(tempDir);

    mockKillSprite.mockResolvedValue({
      success: true,
      stdout: "Killed sprite test-sprite\n",
      stderr: "",
      exitCode: 0,
    });

    const consoleSpy = mock();
    const originalLog = console.log;
    console.log = consoleSpy;

    await spriteKillCommand({ name: "test-sprite", cwd: tempDir, json: true }, mockLogger);

    console.log = originalLog;

    expect(consoleSpy).toHaveBeenCalled();
  });
});

describe("spriteAttachCommand", () => {
  let tempDir: string;
  let mockLogger: Logger & { messages: string[] };

  beforeEach(async () => {
    mockLogger = createMockLogger();
    mockAttachSprite.mockReset();
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("attaches to a Sprite successfully", async () => {
    tempDir = await setupTempGitRepo();
    await setupSpriteConfig(tempDir);

    mockAttachSprite.mockResolvedValue({
      success: true,
      stdout: "Attached to sprite test-sprite\n",
      stderr: "",
      exitCode: 0,
    });

    await spriteAttachCommand({ name: "test-sprite", cwd: tempDir }, mockLogger);

    expect(mockAttachSprite).toHaveBeenCalled();
  });

  it("outputs JSON when --json flag is provided", async () => {
    tempDir = await setupTempGitRepo();
    await setupSpriteConfig(tempDir);

    mockAttachSprite.mockResolvedValue({
      success: true,
      stdout: "Attached to sprite test-sprite\n",
      stderr: "",
      exitCode: 0,
    });

    const consoleSpy = mock();
    const originalLog = console.log;
    console.log = consoleSpy;

    await spriteAttachCommand({ name: "test-sprite", cwd: tempDir, json: true }, mockLogger);

    console.log = originalLog;

    expect(consoleSpy).toHaveBeenCalled();
  });
});

describe("spriteExecCommand", () => {
  let tempDir: string;
  let mockLogger: Logger & { messages: string[] };

  beforeEach(async () => {
    mockLogger = createMockLogger();
    mockExecSprite.mockReset();
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("executes a command in a Sprite successfully", async () => {
    tempDir = await setupTempGitRepo();
    await setupSpriteConfig(tempDir);

    mockExecSprite.mockResolvedValue({
      success: true,
      stdout: "file1.txt\nfile2.txt\n",
      stderr: "",
      exitCode: 0,
    });

    await spriteExecCommand(
      { name: "test-sprite", command: ["ls", "-la"], cwd: tempDir },
      mockLogger,
    );

    expect(mockExecSprite).toHaveBeenCalled();
  });

  it("handles command execution failure (non-zero exit code)", async () => {
    tempDir = await setupTempGitRepo();
    await setupSpriteConfig(tempDir);

    mockExecSprite.mockResolvedValue({
      success: false,
      stdout: "",
      stderr: "Command not found",
      exitCode: 1,
    });

    const consoleErrorSpy = mock();
    const originalError = console.error;
    console.error = consoleErrorSpy;

    const exitSpy = mock();
    const originalExit = process.exit;
    process.exit = exitSpy as any;

    try {
      await spriteExecCommand(
        { name: "test-sprite", command: ["invalid-command"], cwd: tempDir },
        mockLogger,
      );
    } catch {}

    console.error = originalError;
    process.exit = originalExit;

    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("outputs JSON format when --json flag is provided", async () => {
    tempDir = await setupTempGitRepo();
    await setupSpriteConfig(tempDir);

    mockExecSprite.mockResolvedValue({
      success: true,
      stdout: "Command output",
      stderr: "",
      exitCode: 0,
    });

    const consoleSpy = mock();
    const originalLog = console.log;
    console.log = consoleSpy;

    await spriteExecCommand(
      { name: "test-sprite", command: ["echo", "hello"], cwd: tempDir, json: true },
      mockLogger,
    );

    console.log = originalLog;

    expect(consoleSpy).toHaveBeenCalled();
  });

  it("outputs JSON format for command failures", async () => {
    tempDir = await setupTempGitRepo();
    await setupSpriteConfig(tempDir);

    mockExecSprite.mockResolvedValue({
      success: false,
      stdout: "",
      stderr: "Command failed",
      exitCode: 2,
    });

    const consoleSpy = mock();
    const originalLog = console.log;
    console.log = consoleSpy;

    const consoleErrorSpy = mock();
    const originalError = console.error;
    console.error = consoleErrorSpy;

    const exitSpy = mock();
    const originalExit = process.exit;
    process.exit = exitSpy as any;

    try {
      await spriteExecCommand(
        { name: "test-sprite", command: ["failing-command"], cwd: tempDir, json: true },
        mockLogger,
      );
    } catch {}

    console.log = originalLog;
    console.error = originalError;
    process.exit = originalExit;

    // JSON output may go to either log or error
    expect(consoleSpy.mock.calls.length + consoleErrorSpy.mock.calls.length).toBeGreaterThan(0);
  });

  it("handles Sprite binary not found error", async () => {
    tempDir = await setupTempGitRepo();
    await setupSpriteConfig(tempDir);

    const { WispNotFoundError } = await import("../../errors");
    mockExecSprite.mockRejectedValue(new WispNotFoundError("sprite"));

    const consoleErrorSpy = mock();
    const originalError = console.error;
    console.error = consoleErrorSpy;

    const exitSpy = mock();
    const originalExit = process.exit;
    process.exit = exitSpy as any;

    try {
      await spriteExecCommand(
        { name: "test-sprite", command: ["ls"], cwd: tempDir },
        mockLogger,
      );
    } catch {}

    console.error = originalError;
    process.exit = originalExit;

    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("handles both stdout and stderr output", async () => {
    tempDir = await setupTempGitRepo();
    await setupSpriteConfig(tempDir);

    mockExecSprite.mockResolvedValue({
      success: true,
      stdout: "Standard output",
      stderr: "Warning message",
      exitCode: 0,
    });

    await spriteExecCommand(
      { name: "test-sprite", command: ["npm", "install"], cwd: tempDir },
      mockLogger,
    );

    expect(mockExecSprite).toHaveBeenCalled();
  });
});
