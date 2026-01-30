import {
  describe,
  it,
  expect,
  beforeEach,
  afterAll,
  mock,
  spyOn,
} from "bun:test";
import * as originalSpriteCore from "../../agent/sprite-core";
import { buildRemoteToolRegistry } from "../../agent/remote-tools";
import type { SpriteAgentConfig } from "../../schemas";

function createMockLogger() {
  return {
    debug: mock(),
    info: mock(),
    warn: mock(),
    error: mock(),
    child: () => createMockLogger(),
  } as any;
}

// Mock execSprite in sprite-core module (used by remote-tools), preserve all other exports
const mockExecSprite = mock();
mock.module("../../agent/sprite-core", () => ({
  ...originalSpriteCore,
  execSprite: mockExecSprite,
  startSprite: mock(),
  listSprites: mock(),
  killSprite: mock(),
  attachSprite: mock(),
}));

afterAll(() => {
  mock.restore();
});

describe("Remote Tools", () => {
  const config: SpriteAgentConfig = {
    kind: "sprite",
    wispPath: "sprite",
    maxVMs: 1,
    defaultMemory: "512MiB",
    defaultCPUs: "1",
    timeout: 300,
    syncEnabled: true,
    syncExcludePatterns: [".git", "node_modules"],
    syncOnSuccess: false,
  };
  const logger = createMockLogger();
  const vmName = "test-vm";

  beforeEach(() => {
    mockExecSprite.mockReset();
  });

  it("Remote Read Tool: reads file via base64", async () => {
    const tools = buildRemoteToolRegistry(vmName, config, logger);
    const readTool = tools.find((t) => t.name === "Read");
    expect(readTool).toBeDefined();

    // Mock successful execution
    // "Hello World" in base64 is "SGVsbG8gV29ybGQ="
    mockExecSprite.mockResolvedValue({
      success: true,
      stdout: "SGVsbG8gV29ybGQ=",
      stderr: "",
      exitCode: 0,
    });

    // Implementation uses 'path' parameter, not 'file_path'
    const result = await readTool!.func({ path: "test.txt" });
    expect(result).toBe("Hello World");

    // Verify arguments - implementation prefixes with cd to remoteCwd
    const calls = mockExecSprite.mock.calls;
    expect(calls.length).toBe(1);
    expect(calls[0][0]).toBe(vmName);
    expect(calls[0][1][0]).toBe("sh");
    expect(calls[0][1][1]).toBe("-c");
    expect(calls[0][1][2]).toContain('cat "test.txt" | base64');
  });

  it("Remote Write Tool: writes file via base64", async () => {
    const tools = buildRemoteToolRegistry(vmName, config, logger);
    const writeTool = tools.find((t) => t.name === "Write");
    expect(writeTool).toBeDefined();

    mockExecSprite.mockResolvedValue({
      success: true,
      stdout: "",
      stderr: "",
      exitCode: 0,
    });

    const content = "Hello World";
    // base64 is SGVsbG8gV29ybGQ=
    // Implementation uses 'path' parameter, not 'file_path'
    const result = await writeTool!.func({
      path: "test.txt",
      content,
    });

    expect(result).toContain("Successfully wrote");

    const args = mockExecSprite.mock.calls[0][1];
    // Command includes cd prefix and base64 write command
    expect(args[2]).toContain(
      'echo "SGVsbG8gV29ybGQ=" | base64 -d > "test.txt"',
    );
  });

  it("Remote Bash Tool: executes command directly", async () => {
    const tools = buildRemoteToolRegistry(vmName, config, logger);
    const bashTool = tools.find((t) => t.name === "Bash");
    expect(bashTool).toBeDefined();

    mockExecSprite.mockResolvedValue({
      success: true,
      stdout: "command output",
      stderr: "",
      exitCode: 0,
    });

    const result = await bashTool!.func({ command: "ls -la" });
    expect(result).toBe("command output");

    // Implementation uses sh -c and prefixes with cd to remoteCwd
    const args = mockExecSprite.mock.calls[0][1];
    expect(args[0]).toBe("sh");
    expect(args[1]).toBe("-c");
    expect(args[2]).toContain("ls -la");
  });

  it("Handles execution errors gracefully", async () => {
    const tools = buildRemoteToolRegistry(vmName, config, logger);
    const bashTool = tools.find((t) => t.name === "Bash");

    mockExecSprite.mockResolvedValue({
      success: false,
      stdout: "",
      stderr: "Command not found",
      exitCode: 127,
    });

    const result = await bashTool!.func({ command: "invalid" });
    expect(result).toContain("Command failed with exit code 127");
    expect(result).toContain("Stderr: Command not found");
  });
});
