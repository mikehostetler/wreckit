import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  mock,
  spyOn,
} from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  runAgentUnion,
  getAgentConfigUnion,
  type AgentConfigUnion,
  type UnionRunAgentOptions,
} from "../agent";
import { DEFAULT_CONFIG, type ConfigResolved } from "../config";
import type { Logger } from "../logging";

function createMockLogger(): Logger {
  return {
    debug: mock(() => {}),
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
    json: mock(() => {}),
  };
}

describe("getAgentConfigUnion", () => {
  it("returns process kind config directly", () => {
    const config: ConfigResolved = {
      schema_version: 1,
      base_branch: "main",
      branch_prefix: "wreckit/",
      agent: {
        kind: "process",
        command: "amp",
        args: ["--dangerously-allow-all"],
        completion_signal: "<promise>COMPLETE</promise>",
      },
      max_iterations: 100,
      timeout_seconds: 3600,
      merge_mode: "pr",
      pr_checks: {
        commands: [],
        secret_scan: false,
        require_all_stories_done: true,
        allow_unsafe_direct_merge: false,
        allowed_remote_patterns: [],
      },
      branch_cleanup: {
        enabled: true,
        delete_remote: true,
      },
    };

    const result = getAgentConfigUnion(config);

    expect(result).toEqual({
      kind: "process",
      command: "amp",
      args: ["--dangerously-allow-all"],
      completion_signal: "<promise>COMPLETE</promise>",
    });
  });

  it("returns SDK kind config directly", () => {
    const result = getAgentConfigUnion(DEFAULT_CONFIG);

    expect(result.kind).toBe("claude_sdk");
    if (result.kind === "claude_sdk") {
      expect(result.model).toBeDefined();
      expect(result.max_tokens).toBeDefined();
    }
  });

  it("returns process kind config with custom settings", () => {
    const config: ConfigResolved = {
      schema_version: 1,
      base_branch: "develop",
      branch_prefix: "feature/",
      agent: {
        kind: "process",
        command: "claude",
        args: ["--dangerously-skip-permissions", "--print"],
        completion_signal: "FINISHED",
      },
      max_iterations: 50,
      timeout_seconds: 1800,
      merge_mode: "pr",
      pr_checks: {
        commands: [],
        secret_scan: false,
        require_all_stories_done: true,
        allow_unsafe_direct_merge: false,
        allowed_remote_patterns: [],
      },
      branch_cleanup: {
        enabled: true,
        delete_remote: true,
      },
    };

    const result = getAgentConfigUnion(config);

    expect(result.kind).toBe("process");
    if (result.kind === "process") {
      expect(result.command).toBe("claude");
      expect(result.args).toEqual([
        "--dangerously-skip-permissions",
        "--print",
      ]);
      expect(result.completion_signal).toBe("FINISHED");
    }
  });
});

describe("runAgentUnion", () => {
  let tempDir: string;
  let mockLogger: Logger;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-agent-test-"));
    mockLogger = createMockLogger();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("successful run with completion signal detected", async () => {
    const config: AgentConfigUnion = {
      kind: "process",
      command: "sh",
      args: ["-c", 'echo "output" && echo "<promise>COMPLETE</promise>"'],
      completion_signal: "<promise>COMPLETE</promise>",
    };

    const options: UnionRunAgentOptions = {
      config,
      cwd: tempDir,
      prompt: "test prompt",
      logger: mockLogger,
    };

    const result = await runAgentUnion(options);

    expect(result.success).toBe(true);
    expect(result.completionDetected).toBe(true);
    expect(result.timedOut).toBe(false);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("output");
    expect(result.output).toContain("<promise>COMPLETE</promise>");
  });

  it("run without completion signal (success: false, completionDetected: false)", async () => {
    const config: AgentConfigUnion = {
      kind: "process",
      command: "sh",
      args: ["-c", 'echo "output without signal"'],
      completion_signal: "<promise>COMPLETE</promise>",
    };

    const options: UnionRunAgentOptions = {
      config,
      cwd: tempDir,
      prompt: "test prompt",
      logger: mockLogger,
    };

    const result = await runAgentUnion(options);

    expect(result.success).toBe(false);
    expect(result.completionDetected).toBe(false);
    expect(result.timedOut).toBe(false);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("output without signal");
  });

  it("timeout handling", async () => {
    const config: AgentConfigUnion = {
      kind: "process",
      command: "sh",
      args: ["-c", "sleep 3"],
      completion_signal: "<promise>COMPLETE</promise>",
    };

    const options: UnionRunAgentOptions = {
      config,
      cwd: tempDir,
      prompt: "test prompt",
      logger: mockLogger,
      timeoutSeconds: 1,
    };

    const result = await runAgentUnion(options);

    expect(result.success).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(result.completionDetected).toBe(false);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("timed out"),
    );
  }, 5000);

  it("dryRun mode logs but doesn't execute", async () => {
    const config: AgentConfigUnion = {
      kind: "process",
      command: "sh",
      args: ["-c", 'echo "should not run"'],
      completion_signal: "<promise>COMPLETE</promise>",
    };

    const options: UnionRunAgentOptions = {
      config,
      cwd: tempDir,
      prompt: "test prompt",
      logger: mockLogger,
      dryRun: true,
    };

    const result = await runAgentUnion(options);

    expect(result.success).toBe(true);
    expect(result.completionDetected).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.output).toBe("[dry-run] No output");
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining("[dry-run]"),
    );
  });

  it("non-zero exit code handling", async () => {
    const config: AgentConfigUnion = {
      kind: "process",
      command: "sh",
      args: ["-c", 'echo "error output" && exit 1'],
      completion_signal: "<promise>COMPLETE</promise>",
    };

    const options: UnionRunAgentOptions = {
      config,
      cwd: tempDir,
      prompt: "test prompt",
      logger: mockLogger,
    };

    const result = await runAgentUnion(options);

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.completionDetected).toBe(false);
    expect(result.timedOut).toBe(false);
  });

  it("non-zero exit code with completion signal still fails", async () => {
    const config: AgentConfigUnion = {
      kind: "process",
      command: "sh",
      args: ["-c", 'echo "<promise>COMPLETE</promise>" && exit 1'],
      completion_signal: "<promise>COMPLETE</promise>",
    };

    const options: UnionRunAgentOptions = {
      config,
      cwd: tempDir,
      prompt: "test prompt",
      logger: mockLogger,
    };

    const result = await runAgentUnion(options);

    expect(result.success).toBe(false);
    expect(result.completionDetected).toBe(true);
    expect(result.exitCode).toBe(1);
  });

  it("receives prompt via stdin", async () => {
    const config: AgentConfigUnion = {
      kind: "process",
      command: "sh",
      args: ["-c", 'cat && echo "<promise>COMPLETE</promise>"'],
      completion_signal: "<promise>COMPLETE</promise>",
    };

    const testPrompt = "This is my test prompt content";
    const options: UnionRunAgentOptions = {
      config,
      cwd: tempDir,
      prompt: testPrompt,
      logger: mockLogger,
    };

    const result = await runAgentUnion(options);

    expect(result.success).toBe(true);
    expect(result.output).toContain(testPrompt);
  });

  it("handles command not found", async () => {
    const config: AgentConfigUnion = {
      kind: "process",
      command: "nonexistent-command-xyz-123",
      args: [],
      completion_signal: "<promise>COMPLETE</promise>",
    };

    const options: UnionRunAgentOptions = {
      config,
      cwd: tempDir,
      prompt: "test prompt",
      logger: mockLogger,
    };

    const result = await runAgentUnion(options);

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(null);
    expect(result.completionDetected).toBe(false);
  });

  it("dry-run mode works with claude_sdk kind", async () => {
    const config: AgentConfigUnion = {
      kind: "claude_sdk",
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
    };

    const options: UnionRunAgentOptions = {
      config,
      cwd: tempDir,
      prompt: "test prompt",
      logger: mockLogger,
      dryRun: true,
    };

    const result = await runAgentUnion(options);

    expect(result.success).toBe(true);
    expect(result.completionDetected).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.output).toBe("[dry-run] No output");
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining("[dry-run]"),
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining("claude_sdk"),
    );
  });

  it("mock-agent mode works with claude_sdk kind", async () => {
    const config: AgentConfigUnion = {
      kind: "claude_sdk",
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
    };

    const options: UnionRunAgentOptions = {
      config,
      cwd: tempDir,
      prompt: "test prompt",
      logger: mockLogger,
      mockAgent: true,
    };

    const result = await runAgentUnion(options);

    expect(result.success).toBe(true);
    expect(result.completionDetected).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("[mock-agent]");
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining("[mock-agent]"),
    );
  });
});

describe("getAgentConfigUnion - claude_sdk kind", () => {
  it("returns claude_sdk config directly", () => {
    const config: ConfigResolved = {
      schema_version: 1,
      base_branch: "main",
      branch_prefix: "wreckit/",
      agent: {
        kind: "claude_sdk",
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
      },
      max_iterations: 100,
      timeout_seconds: 3600,
      merge_mode: "pr",
      pr_checks: {
        commands: [],
        secret_scan: false,
        require_all_stories_done: true,
        allow_unsafe_direct_merge: false,
        allowed_remote_patterns: [],
      },
      branch_cleanup: {
        enabled: true,
        delete_remote: true,
      },
    };

    const result = getAgentConfigUnion(config);

    expect(result.kind).toBe("claude_sdk");
    if (result.kind === "claude_sdk") {
      expect(result.model).toBe("claude-sonnet-4-20250514");
      expect(result.max_tokens).toBe(4096);
    }
  });
});
