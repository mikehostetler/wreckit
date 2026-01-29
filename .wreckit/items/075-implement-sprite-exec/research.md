# Research: Implement Sprite Exec Capability

**Date**: 2025-01-27
**Item**: 075-implement-sprite-exec

## Research Question
Add the ability to execute commands inside a running Sprite VM via the `sprite exec` CLI command. This enables Wreckit agents to perform work (clone, build, test) inside the sandbox, not just manage the VM lifecycle.

## Summary

The current Sprite integration (Items 073 and 074) provides lifecycle management (start/attach/list/kill) but lacks the ability to execute commands inside running VMs. This research identifies that implementing `sprite exec` requires extending the existing `sprite-runner.ts` infrastructure with a new `execSprite()` function, adding a `spriteExecCommand` to the CLI, exposing an `ExecSprite` RLM tool for agents, and creating comprehensive error handling for command execution failures.

The codebase already has excellent patterns to follow. The `runWispCommand()` primitive at `src/agent/sprite-runner.ts:85-207` demonstrates proper subprocess management with timeout handling, streaming output capture via `onStdoutChunk`/`onStderrChunk` callbacks, and SIGTERM→SIGKILL escalation. The existing command implementations in `src/commands/sprite.ts:81-375` show the pattern for CLI option interfaces, configuration validation, and JSON output support. RLM tools in `src/agent/rlm-tools.ts:244-450` provide the template for agent-accessible tools with proper error handling and JSON responses.

Key findings reveal that Item 074 already refactored the CLI from generic `wisp` commands to the official `sprite` CLI with correct subcommand mapping (`start→create`, `attach→console`, `kill→delete`). The authentication token system is in place via `SPRITES_TOKEN` environment variable injection at `src/agent/sprite-runner.ts:91-96`. However, there's no `exec` command implementation yet, and the error handling system at `src/errors.ts:408-463` lacks execution-specific error classes like `SpriteExecError`.

## Current State Analysis

### Existing Implementation

**Sprite Runner Architecture**: `src/agent/sprite-runner.ts:1-540` implements the core Sprite integration:

- **Core Primitive**: `runWispCommand()` at lines 85-207 handles all subprocess execution
  - Uses `child_process.spawn` (line 106)
  - Supports streaming output via `onStdoutChunk` and `onStderrChunk` callbacks (lines 46-49, 162-177)
  - Implements SIGTERM→SIGKILL escalation for timeouts (lines 140-158)
  - Handles ENOENT errors for missing binary (lines 115-125)
  - Injects `SPRITES_TOKEN` environment variable when present (lines 91-96)

- **Lifecycle Operations**: Lines 246-394 implement VM management
  - `startSprite()` (lines 253-288): Maps to `sprite create <name>`
  - `attachSprite()` (lines 298-325): Maps to `sprite console <name>`
  - `listSprites()` (lines 334-357): Maps to `sprite list --json`
  - `killSprite()` (lines 367-394): Maps to `sprite delete <name>`
  - **Missing**: No `execSprite()` function for command execution

- **Error Handling**: Custom error classes at `src/errors.ts:408-463`
  - `WispNotFoundError` (line 414): Binary not found
  - `SpriteStartError` (line 429): VM start failure
  - `SpriteAttachError` (line 442): Attach failure
  - `SpriteKillError` (line 455): Termination failure
  - **Missing**: No `SpriteExecError` for command execution failures

**CLI Commands**: `src/commands/sprite.ts:1-376` provides user-facing commands:

- **Command Pattern**: All commands follow consistent structure
  - Options interface (e.g., `SpriteStartOptions` at lines 18-24)
  - Configuration loading via `getSpriteConfig()` (lines 50-63)
  - JSON output support via `--json` flag
  - Success/error handling with emoji prefixes (✅/❌)

- **Existing Commands**:
  - `spriteStartCommand` (lines 81-151): Start VM with optional --memory/--cpus flags
  - `spriteListCommand` (lines 158-239): List active VMs
  - `spriteKillCommand` (lines 246-307): Terminate VM
  - `spriteAttachCommand` (lines 314-375): Attach to VM console
  - **Missing**: No `spriteExecCommand` for command execution

- **CLI Registration**: `src/index.ts:444-558` registers sprite commands
  - Main `sprite` command group at line 444
  - Subcommands registered via `program.command()` (lines 449-558)
  - **Missing**: No `sprite exec <name> -- <command>` registration

**RLM Tools**: `src/agent/rlm-tools.ts:211-450` exposes Sprite operations to agents:

- **Sprite Management Tools** (lines 244-450):
  - `SpawnSpriteTool` (lines 244-301): Create VM
  - `AttachSpriteTool` (lines 310-353): Attach to console
  - `ListSpritesTool` (lines 361-399): List VMs
  - `KillSpriteTool` (lines 407-450): Terminate VM
  - **Missing**: No `ExecSpriteTool` for command execution

- **DEFAULT_SPRITE_CONFIG** (lines 211-219): Provides defaults for RLM tools
  - `wispPath: "sprite"` (note: still named `wispPath` for backward compatibility)
  - `token: process.env.SPRITES_TOKEN` (line 218)
  - Resource limits: `maxVMs: 5`, `defaultMemory: "512MiB"`, `defaultCPUs: "1"`, `timeout: 300`

**Configuration System**: `src/schemas.ts:72-80` defines Sprite configuration:

```typescript
export const SpriteAgentSchema = z.object({
  kind: z.literal("sprite"),
  wispPath: z.string().default("sprite").describe("Path to sprite CLI binary"),
  token: z.string().optional().describe("Sprites.dev authentication token"),
  maxVMs: z.number().default(5),
  defaultMemory: z.string().default("512MiB"),
  defaultCPUs: z.string().default("1"),
  timeout: z.number().default(300),
});
```

**Testing Pattern**: `src/__tests__/commands/sprite.test.ts:1-454` shows mocking approach:

- Mock `spawn()` using `spyOn(global, "spawn")` (lines 69-121)
- Simulate stdout/stderr via Buffer callbacks (lines 71-80)
- Test success/error paths for each command
- **Missing**: No tests for `exec` command

### Key Files

| File | Purpose | Lines of Interest | Changes Required |
|------|---------|-------------------|------------------|
| `src/agent/sprite-runner.ts` | Core Sprite operations | 85-207 (`runWispCommand`), 246-394 (lifecycle ops) | Add `execSprite()` function |
| `src/commands/sprite.ts` | CLI command implementations | 1-376 (all commands) | Add `spriteExecCommand` and options interface |
| `src/index.ts` | CLI registration | 444-558 (sprite commands) | Register `sprite exec` subcommand |
| `src/agent/rlm-tools.ts` | RLM agent tools | 244-450 (sprite tools) | Add `ExecSpriteTool` |
| `src/errors.ts` | Error handling | 15-61 (ErrorCodes), 408-463 (sprite errors) | Add `SpriteExecError` class and code |
| `src/__tests__/commands/sprite.test.ts` | Integration tests | 1-454 | Add tests for exec command |

## Technical Considerations

### Dependencies

**External Dependencies**:
- `sprite` CLI from Sprites.dev (already required by Item 074)
- No additional npm packages (use existing `spawn` from `node:child_process`)

**Internal Modules** to integrate with:
- `src/agent/sprite-runner.ts:85-207` - Reuse `runWispCommand()` primitive
- `src/commands/sprite.ts:81-375` - Follow existing command pattern
- `src/agent/rlm-tools.ts:244-450` - Add new tool to registry
- `src/errors.ts:408-463` - Add execution error class
- `src/index.ts:444-558` - Register new CLI command

### Patterns to Follow

**1. Sprite Runner Pattern** (`src/agent/sprite-runner.ts`):

Create `execSprite()` function following the existing lifecycle operations:

```typescript
export async function execSprite(
  name: string,
  command: string[],
  config: SpriteAgentConfig,
  logger: Logger,
  options?: {
    onStdoutChunk?: (chunk: string) => void;
    onStderrChunk?: (chunk: string) => void;
  }
): Promise<WispResult> {
  const args = ["exec", name, ...command];

  logger.debug(`Executing in Sprite: ${config.wispPath} ${args.join(" ")}`);

  const result = await runWispCommand(args, {
    wispPath: config.wispPath,
    logger,
    timeout: config.timeout,
    token: config.token,
    onStdoutChunk: options?.onStdoutChunk,
    onStderrChunk: options?.onStderrChunk,
  });

  if (result.error?.includes("not found")) {
    throw new WispNotFoundError(config.wispPath);
  }

  if (!result.success) {
    throw new SpriteExecError(name, result.stderr || result.error || "Command execution failed");
  }

  return result;
}
```

**2. CLI Command Pattern** (`src/commands/sprite.ts:81-375`):

Follow the existing structure:

```typescript
export interface SpriteExecOptions {
  name: string;
  command: string[];  // Command and arguments to execute
  cwd?: string;
  json?: boolean;
}

export async function spriteExecCommand(
  options: SpriteExecOptions,
  logger: Logger
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const config = await getSpriteConfig(cwd);

  logger.debug(`Executing command in Sprite '${options.name}'...`);

  try {
    const result = await execSprite(options.name, options.command, config, logger);

    if (result.success) {
      const outputData = {
        success: true,
        message: `Executed command in Sprite '${options.name}'`,
        data: {
          name: options.name,
          command: options.command,
          exitCode: result.exitCode,
          stdout: result.stdout.trim(),
          stderr: result.stderr.trim(),
        },
      };

      if (options.json) {
        outputJson(outputData);
      } else {
        console.log(`✅ ${outputData.message}`);
        if (result.stdout.trim()) {
          console.log(`\nOutput:\n${result.stdout.trim()}`);
        }
      }
    } else {
      // Error handling...
    }
  } catch (err) {
    // Error handling...
  }
}
```

**3. RLM Tool Pattern** (`src/agent/rlm-tools.ts:244-450`):

Create `ExecSpriteTool` following existing tools:

```typescript
const ExecSpriteTool: AxFunction = {
  name: "ExecSprite",
  description: "Execute a command inside a running Sprite VM. Returns command output and exit code.",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Name/ID of the Sprite VM to execute command in",
      },
      command: {
        type: "array",
        items: { type: "string" },
        description: "Command and arguments to execute (e.g., ['npm', 'install'])",
      },
    },
    required: ["name", "command"],
  } as AxFunctionJSONSchema,
  func: async ({ name, command }: { name: string; command: string[] }) => {
    try {
      const { execSprite } = await import("./sprite-runner.js");

      const result = await execSprite(name, command, DEFAULT_SPRITE_CONFIG, spriteLogger);

      if (result.success) {
        return JSON.stringify({
          success: true,
          message: `Executed command in Sprite '${name}'`,
          data: {
            name,
            command,
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
          },
        }, null, 2);
      } else {
        return JSON.stringify({
          success: false,
          error: result.stderr || result.error || "Command execution failed",
        }, null, 2);
      }
    } catch (error: any) {
      return JSON.stringify({
        success: false,
        error: error.message || "Unknown error executing command",
      }, null, 2);
    }
  },
};
```

**4. CLI Registration Pattern** (`src/index.ts:444-558`):

Register the new command after `sprite attach`:

```typescript
spriteCmd
  .command("exec <name> <command...>")
  .description("Execute a command inside a running Sprite VM")
  .option("--json", "Output as JSON")
  .action(async (name, command, options, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    await executeCommand(
      async () => {
        await spriteExecCommand(
          {
            name,
            command,
            cwd: resolveCwd(globalOpts.cwd),
            json: options.json,
          },
          logger,
        );
      },
      logger,
      {
        verbose: globalOpts.verbose,
        quiet: globalOpts.quiet,
        dryRun: globalOpts.dryRun,
        cwd: resolveCwd(globalOpts.cwd),
      },
    );
  });
```

**5. Error Handling Pattern** (`src/errors.ts:408-463`):

Add execution-specific error class:

```typescript
/**
 * Thrown when command execution inside a Sprite VM fails.
 */
export class SpriteExecError extends WreckitError {
  constructor(
    public readonly spriteName: string,
    message: string,
  ) {
    super(`Failed to execute command in Sprite '${spriteName}': ${message}`, ErrorCodes.SPRITE_EXEC_FAILED);
    this.name = "SpriteExecError";
  }
}
```

Update `ErrorCodes` enum at lines 15-61:

```typescript
export const ErrorCodes = {
  // ... existing codes ...
  SPRITE_EXEC_FAILED: "SPRITE_EXEC_FAILED",
} as const;
```

**6. Testing Pattern** (`src/__tests__/commands/sprite.test.ts`):

Add tests following existing structure:

```typescript
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

    const mockStdout = "Command output\n";
    const spawnSpy = mockSpawnSuccess(mockStdout);

    const consoleSpy = spyOn(console, "log");
    await spriteExecCommand(
      { name: "test-sprite", command: ["ls", "-la"], cwd: tempDir },
      mockLogger
    );

    expect(spawnSpy).toHaveBeenCalledWith("sprite", [
      "exec",
      "test-sprite",
      "ls",
      "-la",
    ]);

    const calls = consoleSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.includes("Executed command in Sprite 'test-sprite'"))).toBe(true);

    consoleSpy.mockRestore();
    spawnSpy.mockRestore();
  });

  it("handles command execution failure", async () => {
    tempDir = await setupTempGitRepo();
    await setupSpriteConfig(tempDir);

    const spawnSpy = mockSpawnFailure(1, "Command not found\n");

    const consoleSpy = spyOn(console, "error");
    const exitSpy = spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`Process exited with code ${code}`);
    });

    await expect(
      spriteExecCommand(
        { name: "test-sprite", command: ["invalid"], cwd: tempDir },
        mockLogger
      )
    ).rejects.toThrow();

    consoleSpy.mockRestore();
    exitSpy.mockRestore();
    spawnSpy.mockRestore();
  });
});
```

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Command injection vulnerabilities** | High - Security breach | Validate command arguments; avoid shell interpretation; use array form of `spawn()` with explicit arguments |
| **Sprite VM not running** | Medium - Command fails | Check VM state before exec; provide clear error message if VM not found or stopped |
| **Long-running commands** | Medium - Timeout/hang | Respect `config.timeout` (default 300s); allow streaming output via callbacks; implement SIGTERM→SIGKILL escalation |
| **Output buffer overflow** | Low - Memory issues | Stream output via `onStdoutChunk`/`onStderrChunk` callbacks; don't buffer entire output in memory |
| **Exit code propagation** | Medium - Silent failures | Capture and return exit code; distinguish between success (0) and failure (non-zero); expose in JSON output |
| **Command with special characters** | Low - Parsing issues | Pass command as array to `spawn()`; avoid shell string interpolation; test with quotes, spaces, pipes |
| **Sprite CLI version compatibility** | Medium - Breaking changes | Document minimum Sprite CLI version; handle missing `exec` subcommand gracefully |
| **Authentication token expiration during exec** | Low - Intermittent failures | Token already injected via environment (line 91-96); if token expires, fail with auth error |
| **Concurrent exec calls to same VM** | Low - Race conditions | Sprite CLI should handle serialization; document limitation if issues arise |
| **Missing exec subcommand in older Sprite versions** | Medium - Feature unavailable | Detect `exec` support via error message; provide clear upgrade instructions |

## Recommended Approach

### Phase 1: Core Infrastructure (Foundation)

1. **Add Error Handling** in `src/errors.ts`:
   - Add `SPRITE_EXEC_FAILED` to `ErrorCodes` enum (lines 15-61)
   - Create `SpriteExecError` class following `SpriteStartError` pattern (lines 429-437)
   - Include `spriteName` and `command` in error context

2. **Implement `execSprite()` Function** in `src/agent/sprite-runner.ts`:
   - Add after `killSprite()` (after line 394)
   - Follow `startSprite()` pattern (lines 253-288)
   - Use `runWispCommand()` primitive with `["exec", name, ...command]` args
   - Support optional `onStdoutChunk`/`onStderrChunk` callbacks for streaming
   - Throw `SpriteExecError` on failure
   - Return `WispResult` with exit code, stdout, stderr

3. **Export New Function** in `src/agent/sprite-runner.ts`:
   - Add `execSprite` to exports (after line 540)
   - Update `runWispCommand()` to handle exec-specific errors if needed

### Phase 2: CLI Integration (User Interface)

4. **Add Command Options Interface** in `src/commands/sprite.ts`:
   - Create `SpriteExecOptions` interface (after line 41)
   - Include: `name: string`, `command: string[]`, `cwd?: string`, `json?: boolean`

5. **Implement CLI Command** in `src/commands/sprite.ts`:
   - Add `spriteExecCommand()` function (after line 375)
   - Follow `spriteStartCommand()` pattern (lines 81-151)
   - Load config via `getSpriteConfig()`
   - Call `execSprite()` with options
   - Handle success/error paths with emoji prefixes
   - Support `--json` output with exit code included

6. **Register CLI Command** in `src/index.ts`:
   - Add subcommand after `sprite attach` (after line 558)
   - Use `.command("exec <name> <command...>")` for variable argument capture
   - Wire up global options and executeCommand wrapper
   - Support `--json` flag

### Phase 3: RLM Tool Integration (Agent Access)

7. **Create RLM Tool** in `src/agent/rlm-tools.ts`:
   - Add `ExecSpriteTool` constant (after line 450)
   - Follow `SpawnSpriteTool` pattern (lines 244-301)
   - Parameters: `name` (string), `command` (array of strings)
   - Return JSON with `exitCode`, `stdout`, `stderr`
   - Handle errors gracefully (catch, return JSON error)

8. **Register Tool** in `src/agent/rlm-tools.ts`:
   - Add `ExecSprite: ExecSpriteTool` to `ALL_TOOLS` registry (line 453)
   - Include in `buildToolRegistry()` return value (line 467)

### Phase 4: Testing & Polish (Quality Assurance)

9. **Add Unit Tests** in `src/__tests__/commands/sprite.test.ts`:
   - Add `describe("spriteExecCommand", ...)` block (after line 454)
   - Test successful execution with mocked `spawn()`
   - Test command execution failure (non-zero exit code)
   - Test JSON output format
   - Test error handling (Sprite not found, command not found)
   - Test streaming output callbacks
   - Test timeout handling

10. **Documentation Updates**:
    - Update `src/index.ts` command help text
    - Add usage examples: `wreckit sprite exec my-vm -- npm install`
    - Document exit code handling in JSON output
    - Add troubleshooting for common exec failures

11. **Integration Testing** (if Sprite CLI available):
    - Test with real Sprite VM
    - Verify command execution inside VM
    - Test streaming output for long-running commands
    - Verify exit code propagation
    - Test with commands that produce large output

## Open Questions

1. **Sprite CLI `exec` Subcommand Interface**: What is the exact syntax for `sprite exec`?
   - Is it `sprite exec <name> <command...>` or `sprite exec <name> -- <command>`?
   - Does it require `--` separator to distinguish sprite flags from command flags?
   - **Recommendation**: Test with actual Sprite CLI or review documentation; implement CLI command with `<command...>` variadic argument (no `--` separator) and adjust if needed

2. **Output Streaming Behavior**: Should exec support streaming output to CLI?
   - The existing `runWispCommand()` supports `onStdoutChunk`/`onStderrChunk` callbacks (lines 162-177)
   - Should `wreckit sprite exec` stream output in real-time or buffer until completion?
   - **Recommendation**: Default to buffer (existing pattern), but expose streaming option via `--stream` flag for future enhancement

3. **Exit Code Handling**: How should non-zero exit codes be treated?
   - Should they throw errors or return success=false with exit code in data?
   - Existing pattern (lines 195-204) treats `code !== 0` as `success: false`
   - **Recommendation**: Follow existing pattern: Return `success: false` with `exitCode` in JSON data; don't throw for non-zero exit codes (only for subprocess errors)

4. **Working Directory Inside VM**: What directory does the command execute in?
   - Sprite VM's home directory? Current directory of host? Configurable?
   - Should we add `--cwd` option to specify working directory inside VM?
   - **Recommendation**: Start with default (Sprite's home); add `--cwd` option later if needed

5. **Interactive Commands**: How to handle commands requiring user input (e.g., `npm login`)?
   - Should exec support stdin passthrough?
   - Or explicitly document as non-interactive only?
   - **Recommendation**: Explicitly document as non-interactive only; reject/timeout commands that try to read stdin

6. **Command Array vs String**: Should CLI accept command as string or array?
   - CLI: `wreckit sprite exec my-vm npm install` (array-like via variadic args)
   - RLM Tool: `ExecSprite({ name: "my-vm", command: ["npm", "install"] })`
   - **Recommendation**: CLI uses variadic args (converted to array internally), RLM tool requires array for safety (avoids shell injection)

7. **Concurrent Exec Limits**: Should there be rate limiting on concurrent exec calls?
   - Item 073 defines `maxVMs: 5` but no `maxConcurrentExecs`
   - Risk of overwhelming a VM with multiple concurrent commands
   - **Recommendation**: Document as user responsibility; add limits in future if issues arise

8. **Large Output Handling**: What if command produces gigabytes of output?
   - Buffering entire output could exhaust memory
   - `runWispCommand()` accumulates stdout/stderr in strings (lines 99-100)
   - **Recommendation**: Document memory limitation; implement streaming output via callbacks for production use

## Implementation Notes

- **Reuse `runWispCommand()` Primitive**: The core primitive at `src/agent/sprite-runner.ts:85-207` already handles subprocess spawning, timeout enforcement, output capture, and error detection. Simply pass `["exec", name, ...command]` as args.

- **Follow Existing Error Patterns**: All Sprite operations use specific error classes (`SpriteStartError`, `SpriteAttachError`, `SpriteKillError`). Create `SpriteExecError` following the same pattern for consistency.

- **Support Streaming Output**: The `onStdoutChunk` and `onStderrChunk` callbacks (lines 46-49, 162-177) enable real-time output streaming. Expose these in the `execSprite()` signature for RLM tools that need streaming.

- **Respect Timeouts**: The `config.timeout` (default 300s) applies to exec operations. Long-running commands (e.g., `npm install`) may need increased timeout via config.

- **Exit Code Semantics**: Distinguish between subprocess errors (spawn failure, timeout) and command failure (non-zero exit code). Subprocess errors throw; command failures return `success: false` with exit code.

- **CLI Variadic Arguments**: Commander.js `.command("exec <name> <command...>")` captures all arguments after `<name>` into an array. Pass this array directly to `execSprite()` without shell interpolation.

- **RLM Tool Safety**: RLM tool requires command as array (not string) to avoid shell injection vulnerabilities. Array form of `spawn()` doesn't invoke shell, preventing `; rm -rf` style attacks.

- **Authentication**: Token already injected via environment variable (lines 91-96). No additional auth handling needed for exec.

- **Testing**: Mock `spawn()` using existing test helpers (`mockSpawnSuccess`, `mockSpawnFailure`). Test with realistic stdout/stderr to verify output capture.

- **Backward Compatibility**: Adding `exec` doesn't break existing Sprite functionality (start/attach/list/kill). No migration needed.

- **Documentation**: Update SPRITE_USAGE.md (from Item 073) to include exec examples and troubleshooting.
