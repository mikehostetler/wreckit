# Research: Implement Remote Tool Proxy for Sprite Agents

**Date**: 2025-01-28
**Item**: 076-implement-remote-tool-proxy

## Research Question
Implement a proxy layer that redirects standard agent tools (Bash, Read, Write, Glob, Grep) to execute inside a remote Sprite VM via `sprite exec`. This transforms the `SpriteAgent` into a fully functional, sandboxed runtime environment where agents operate safely in isolation from the host filesystem.

## Summary

The current `SpriteAgent` implementation (`src/agent/sprite-runner.ts:516-634`) only verifies connectivity to the Sprite CLI and does not actually execute agent work inside the VM. To achieve true sandboxing where agents can safely run dangerous commands like `rm -rf /` without affecting the host, we need to intercept standard agent tool calls and proxy them through `sprite exec` to run inside a disposable microVM.

This research reveals that the codebase has excellent infrastructure to build upon. The `execSprite()` primitive at `src/agent/sprite-runner.ts:446-486` already provides the core capability to execute commands inside a Sprite VM with proper timeout handling, streaming output, and error management. The RLM agent runner (`src/agent/rlm-runner.ts:64-200`) demonstrates how to initialize an AI agent with custom tools, and the tool registry system (`src/agent/rlm-tools.ts:663-698`) shows how to swap out tool implementations. The tool allowlist system (`src/agent/toolAllowlist.ts:58-143`) provides security boundaries that can be extended to support sandbox-aware tool restrictions.

The implementation requires creating remote proxy versions of the standard tools (RemoteRead, RemoteWrite, RemoteGlob, RemoteGrep, RemoteBash) that wrap `execSprite()` calls, integrating these into the `runSpriteAgent()` function following the RLM runner pattern, and ensuring proper binary data handling via base64 encoding for file operations.

## Current State Analysis

### Existing Implementation

**Sprite Runner Infrastructure**: `src/agent/sprite-runner.ts:1-635` provides the foundation:

- **Core Primitive**: `execSprite()` at lines 446-486 executes commands inside a Sprite VM
  - Uses `runWispCommand()` with `["exec", name, ...command]` args (line 456)
  - Supports streaming output via optional callbacks (lines 451-454)
  - Handles timeouts and SIGTERM→SIGKILL escalation (via `runWispCommand` at lines 154-173)
  - Returns `WispResult` with exit code, stdout, stderr (lines 30-36)
  - Distinguishes between subprocess errors (throw) and command failures (return success=false)

- **Agent Runner**: `runSpriteAgent()` at lines 516-634
  - Currently only verifies connectivity via `listSprites()` (line 570)
  - Does not initialize AI agent or run tools
  - Placeholder output noting full execution not implemented (lines 596-598)
  - **Missing**: No tool proxying, no agent initialization inside VM

- **VM Lifecycle Functions**: Lines 269-419 provide Sprite management
  - `startSprite()` (lines 269-307): Creates new VM
  - `attachSprite()` (lines 317-347): Attaches to console
  - `listSprites()` (lines 356-379): Lists active VMs
  - `killSprite()` (lines 389-419): Terminates VM

**RLM Agent Reference Pattern**: `src/agent/rlm-runner.ts:64-200` shows the full agent initialization pattern:

```typescript
// 1. Build Environment (lines 88-92)
const env = await buildAxAIEnv({ cwd, logger, provider: config.aiProvider });

// 2. Initialize AI Service (lines 95-126)
let ai: AxAIService;
if (config.aiProvider === "anthropic") {
  ai = new AxAIAnthropic({ apiKey: env.ANTHROPIC_API_KEY, ... });
}

// 3. Initialize JS Runtime (lines 128-133)
const jsRuntime = new JSRuntime({ CONTEXT_DATA: prompt, cwd });

// 4. Initialize Tools (lines 136-147)
const builtInTools = buildToolRegistry(options.allowedTools, jsRuntime);
const mcpTools = adaptMcpServersToAxTools(options.mcpServers, options.allowedTools);
const tools = [...builtInTools, ...mcpTools];

// 5. Create Agent (lines 153-172)
const agent = new AxAgent(ai, { tools });
```

**Standard Tool Implementations**: `src/agent/rlm-tools.ts:67-251` shows the tools to proxy:

- `ReadTool` (lines 67-85): Uses `fs.readFile()` - needs to become `cat` via execSprite
- `WriteTool` (lines 87-114): Uses `fs.writeFile()` - needs to become `tee` or base64 wrapper
- `GlobTool` (lines 152-186): Uses `find` command - already command-based, easy to proxy
- `GrepTool` (lines 188-231): Uses `grep -r` - already command-based, easy to proxy
- `BashTool` (lines 233-251): Uses `exec()` - needs to be wrapped in execSprite

**Tool Registry System**: `src/agent/rlm-tools.ts:663-698` manages tool availability:

```typescript
const ALL_TOOLS: ToolRegistry = {
  Read: ReadTool,
  Write: WriteTool,
  Edit: EditTool,
  Glob: GlobTool,
  Grep: GrepTool,
  Bash: BashTool,
  // Sprite tools...
  SpawnSprite: SpawnSpriteTool,
  ExecSprite: ExecSpriteTool,
  // ...
};

export function buildToolRegistry(allowedTools?: string[], jsRuntime?: JSRuntime): AxFunction[] {
  let tools = allowedTools
    ? allowedTools.map((name) => ALL_TOOLS[name]).filter(Boolean)
    : Object.values(ALL_TOOLS);
  if (jsRuntime) {
    tools.push(createRunJSTool(jsRuntime));
  }
  return tools;
}
```

**Tool Allowlist System**: `src/agent/toolAllowlist.ts:19-143` provides phase-based security:

- `AVAILABLE_TOOLS` (lines 19-38): Lists all available tool names
- `PHASE_TOOL_ALLOWLISTS` (lines 58-143): Maps phases to allowed tools
- `getAllowedToolsForPhase()` (lines 151-153): Retrieves allowlist for a phase
- **Gap**: No distinction between local and sandboxed tool variants

**Configuration Schema**: `src/schemas.ts:74-99` defines `SpriteAgentConfig`:

```typescript
export const SpriteAgentSchema = z.object({
  kind: z.literal("sprite"),
  wispPath: z.string().default("sprite"),
  token: z.string().optional(), // Sprites.dev auth token
  maxVMs: z.number().default(5),
  defaultMemory: z.string().default("512MiB"),
  defaultCPUs: z.string().default("1"),
  timeout: z.number().default(300),
});
```

- **Missing**: No field to specify VM name for agent session
- **Missing**: No field to enable/disable tool proxying mode

**Error Handling**: `src/errors.ts:476-487` already has `SpriteExecError`:

```typescript
export class SpriteExecError extends WreckitError {
  constructor(
    public readonly spriteName: string,
    message: string,
  ) {
    super(
      `Failed to execute command in Sprite '${spriteName}': ${message}`,
      ErrorCodes.SPRITE_EXEC_FAILED,
    );
    this.name = "SpriteExecError";
  }
}
```

- **Already available**: Error code `SPRITE_EXEC_FAILED` exists (line 58)

### Key Files

| File | Purpose | Lines of Interest | Changes Required |
|------|---------|-------------------|------------------|
| `src/agent/sprite-runner.ts` | Sprite VM management | 446-486 (`execSprite`), 516-634 (`runSpriteAgent`) | Create remote tool implementations, rewrite `runSpriteAgent()` to initialize AI with remote tools |
| `src/agent/rlm-tools.ts` | Standard tool implementations | 67-251 (Read/Write/Glob/Grep/Bash), 663-698 (tool registry) | Add remote tool variants, extend registry with remote tools |
| `src/agent/rlm-runner.ts` | RLM agent reference pattern | 64-200 (agent initialization) | Follow pattern for Sprite agent initialization |
| `src/agent/toolAllowlist.ts` | Phase-based tool restrictions | 19-38 (AVAILABLE_TOOLS), 58-143 (PHASE_TOOL_ALLOWLISTS) | Add remote tool variants to allowlists |
| `src/schemas.ts` | Configuration schemas | 74-99 (`SpriteAgentSchema`) | Add `vmName` field, potentially `enableProxy` flag |
| `src/agent/dispatcher.ts` | Agent dispatch router | 177-190 (sprite case) | Ensure proper option passing to sprite runner |

## Technical Considerations

### Dependencies

**External Dependencies**:
- `sprite` CLI from Sprites.dev (already required by Items 073-075)
- No additional npm packages needed

**Internal Modules** to integrate with:
- `src/agent/sprite-runner.ts:446-486` - Use `execSprite()` for all remote tool calls
- `src/agent/rlm-tools.ts:663-698` - Extend tool registry with remote variants
- `src/agent/rlm-runner.ts:64-200` - Follow agent initialization pattern
- `src/agent/toolAllowlist.ts:19-143` - Add remote tool names to allowlists
- `src/schemas.ts:74-99` - Extend schema for VM name and proxy configuration
- `src/errors.ts:476-487` - Use existing `SpriteExecError` for proxy failures

### Patterns to Follow

**1. Remote Tool Implementation Pattern**:

Create remote wrapper tools that follow this pattern:

```typescript
const RemoteReadTool: AxFunction = {
  name: "Read", // Same name as local tool for transparency
  description: "Read file contents from inside the Sprite VM sandbox",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path inside the VM" },
    },
    required: ["path"],
  } as AxFunctionJSONSchema,
  func: async ({ path: filePath }: { path: string }) => {
    try {
      const { execSprite } = await import("./sprite-runner.js");

      // Use base64 encoding to handle binary data and special characters
      const result = await execSprite(
        vmName, // Passed via closure or config
        ["sh", "-c", `cat "${filePath}" | base64`],
        config,
        logger
      );

      if (result.success) {
        const base64Content = result.stdout.trim();
        const content = Buffer.from(base64Content, 'base64').toString('utf-8');
        return content;
      } else {
        return `Error reading file ${filePath}: ${result.stderr}`;
      }
    } catch (error: any) {
      return `Error reading file ${filePath}: ${error.message}`;
    }
  },
};
```

**2. Agent Initialization Pattern** (from `src/agent/rlm-runner.ts`):

```typescript
export async function runSpriteAgent(
  config: SpriteAgentConfig,
  options: SpriteRunAgentOptions,
): Promise<AgentResult> {
  const { cwd, prompt, logger, allowedTools, mcpServers } = options;

  // 1. Initialize or connect to Sprite VM
  const vmName = config.vmName || `agent-session-${Date.now()}`;
  const vmReady = await ensureSpriteRunning(vmName, config, logger);
  if (!vmReady) {
    return { success: false, output: "Failed to initialize Sprite VM", ... };
  }

  // 2. Build AI service (reuse RLM pattern or use Claude SDK)
  const ai = await buildAIService(config, logger);

  // 3. Build remote tool registry
  const remoteTools = buildRemoteToolRegistry(
    allowedTools,
    vmName,
    config,
    logger
  );

  // 4. Add MCP servers if provided
  const mcpTools = mcpServers
    ? adaptMcpServersToAxTools(mcpServers, allowedTools)
    : [];

  const tools = [...remoteTools, ...mcpTools];

  // 5. Create and run agent
  const agent = new AxAgent(ai, { tools });
  let output = "";
  for await (const message of agent.query({ prompt })) {
    output += formatMessage(message);
    if (options.onStdoutChunk) {
      options.onStdoutChunk(formatMessage(message));
    }
  }

  return { success: true, output, ... };
}
```

**3. Binary Data Handling Pattern**:

Use base64 encoding for file content to handle:
- Binary files (images, executables)
- Files with special characters (newlines, quotes, control chars)
- Large files that might break shell command parsing

```typescript
// Write file with base64 encoding
const result = await execSprite(vmName,
  ["sh", "-c", `echo "${base64Content}" | base64 -d | tee "${filePath}"`],
  config, logger
);

// Read file with base64 encoding
const result = await execSprite(vmName,
  ["sh", "-c", `cat "${filePath}" | base64`],
  config, logger
);
```

**4. VM Lifecycle Management Pattern**:

```typescript
async function ensureSpriteRunning(
  name: string,
  config: SpriteAgentConfig,
  logger: Logger
): Promise<boolean> {
  // Check if VM already exists
  const listResult = await listSprites(config, logger);
  const sprites = parseWispJson(listResult.stdout, logger) as WispSpriteInfo[];
  const exists = sprites?.some(s => s.name === name && s.state === "running");

  if (exists) {
    logger.debug(`Sprite VM '${name}' already running`);
    return true;
  }

  // Start new VM
  logger.info(`Starting Sprite VM '${name}'...`);
  const startResult = await startSprite(name, config, logger);
  return startResult.success;
}
```

**5. Error Handling Pattern**:

```typescript
try {
  const result = await execSprite(vmName, command, config, logger);
  if (!result.success && result.exitCode !== 0) {
    // Command failed inside VM - return error to agent, don't throw
    return `Command failed with exit code ${result.exitCode}: ${result.stderr}`;
  }
  // Process successful result...
} catch (error) {
  if (error instanceof SpriteExecError) {
    // Subprocess error (exec failure) - return error to agent
    return `Failed to execute command in VM: ${error.message}`;
  }
  // Other errors - log and return
  logger.error(`Unexpected error in remote tool: ${error}`);
  return `Unexpected error: ${error}`;
}
```

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **File content corruption** | High - File data loss/binary corruption | Use base64 encoding for all file read/write operations; test with binary files (PNG, PDF); validate encoding round-trip |
| **Command injection vulnerabilities** | High - Security breach | Never use shell interpolation; pass commands as array to `execSprite()`; escape file paths properly; use `-c` wrapper scripts carefully |
| **VM not initialized** | Medium - Tool failures | Check VM state in `runSpriteAgent()` before starting; auto-start VM if missing; fail fast with clear error if VM startup fails |
| **Latency impacting agent performance** | Medium - Slow execution | Cache frequently read files; batch operations when possible; document latency expectations; consider async non-blocking tool design |
| **Timeouts on long operations** | Medium - Incomplete work | Respect `config.timeout` (default 300s); allow streaming output for long-running commands; implement proper SIGTERM→SIGKILL escalation |
| **Path mapping issues** | Medium - File not found errors | Clearly document that paths are relative to VM filesystem, not host; add path validation helper; test with nested paths and symlinks |
| **Concurrent tool calls to same VM** | Low - Race conditions | Sprite CLI likely serializes exec calls; document limitation; consider queueing if issues arise |
| **Large file transfers** | Low - Memory/performance issues | Stream output via callbacks; document size limitations; use chunked base64 for very large files (>10MB) |
| **VM state drift** | Low - Inconsistent behavior | Document that VM is mutable; agents should not rely on state persistence; consider ephemeral VM per session |
| **Error message obscuration** | Low - Debugging difficulty | Preserve both stdout and stderr in tool responses; include exit code in error messages; add debug mode with verbose output |

## Recommended Approach

### Phase 1: Remote Tool Implementations

1. **Create `src/agent/remote-tools.ts`**:
   - Implement `RemoteReadTool` using `cat` + base64 encoding
   - Implement `RemoteWriteTool` using `tee` + base64 decoding
   - Implement `RemoteGlobTool` using `find` command (already shell-based)
   - Implement `RemoteGrepTool` using `grep -r` command (already shell-based)
   - Implement `RemoteBashTool` as wrapper around `execSprite()`
   - Export `buildRemoteToolRegistry(vmName, config, logger, allowedTools?)` function

2. **Add VM Name to Schema** in `src/schemas.ts:74-99`:
   ```typescript
   export const SpriteAgentSchema = z.object({
     kind: z.literal("sprite"),
     wispPath: z.string().default("sprite"),
     token: z.string().optional(),
     vmName: z.string().optional().describe(
       "Name of Sprite VM to run agent in (auto-generated if not specified)"
     ),
     // ... existing fields
   });
   ```

3. **Add Remote Tools to Allowlists** in `src/agent/toolAllowlist.ts:19-38`:
   - Add to `AVAILABLE_TOOLS`:
     ```typescript
     RemoteRead: "Read", // Same name, proxied implementation
     RemoteWrite: "Write",
     RemoteBash: "Bash",
     RemoteGlob: "Glob",
     RemoteGrep: "Grep",
     ```
   - No changes needed to `PHASE_TOOL_ALLOWLISTS` (tools keep same names)

### Phase 2: Agent Runner Integration

4. **Rewrite `runSpriteAgent()`** in `src/agent/sprite-runner.ts:516-634`:
   - Remove placeholder connectivity check
   - Add `ensureSpriteRunning()` helper to initialize/connect to VM
   - Import `buildRemoteToolRegistry()` from remote-tools.ts
   - Import `buildAxAIEnv()` and AI service classes from RLM runner
   - Follow RLM runner pattern: build env → initialize AI → build tools → create agent
   - Handle timeout, abort controller, and event callbacks
   - Return proper `AgentResult` with output, exit code, completion status

5. **Add AI Service Builder** in `src/agent/sprite-runner.ts` or `src/agent/env.ts`:
   - Create `buildSpriteAI()` function that:
     - Detects AI provider from environment or config
     - Initializes `AxAIAnthropic`, `AxAIOpenAI`, or `AxAIGoogleGemini`
     - Handles authentication via environment variables
     - Returns configured `AxAIService` instance

6. **Update Dispatcher** in `src/agent/dispatcher.ts:177-190`:
   - Verify that all options are passed correctly to `runSpriteAgent()`
   - Ensure `allowedTools`, `mcpServers`, `timeoutSeconds` are forwarded
   - No changes needed if options already match

### Phase 3: Testing & Validation

7. **Add Unit Tests** in `src/__tests__/agent/sprite-runner.test.ts`:
   - Test `ensureSpriteRunning()` with existing and non-existing VMs
   - Test each remote tool with mocked `execSprite()` calls
   - Test base64 encoding/decoding for file content
   - Test error handling (VM not found, command failure, timeout)
   - Test agent initialization with different AI providers

8. **Integration Tests** (if Sprite CLI available):
   - Test full agent execution: start VM → run agent → verify file operations
   - Test with binary files (PNG, PDF) to validate base64 encoding
   - Test with large files to verify performance
   - Test concurrent tool calls to same VM
   - Test latency and timeout handling

9. **Add Test Scenarios**:
   - Basic: Agent creates a file and reads it back
   - Complex: Agent clones a repo, runs tests, creates a new file
   - Error handling: Agent tries to delete system files (should fail safely)
   - Binary: Agent reads and writes an image file
   - Long-running: Agent runs `npm install` (test timeout/streaming)

### Phase 4: Documentation & Polish

10. **Update Documentation**:
    - Add SPRITES_AGENT_USAGE.md with:
      - How to configure Sprite agent in `.wreckit/config.json`
      - Explanation of sandboxing guarantees
      - Performance expectations (latency, timeouts)
      - Troubleshooting guide
    - Update README.md Cloud Sandboxes section
    - Add examples to MIGRATION.md

11. **Error Messages**:
    - Ensure all remote tool errors include context (VM name, file path, exit code)
    - Add helpful hints for common issues (VM not running, permission denied)
    - Document error codes in user-facing docs

12. **Performance Optimization** (if needed):
    - Implement file read caching for frequently accessed files
    - Add batch operations (read multiple files in one exec call)
    - Consider async tool design for long-running operations

## Open Questions

1. **AI Provider Configuration**: Should Sprite agents support multiple AI providers (anthropic, openai, google) like RLM agents?
   - **Recommendation**: Yes, reuse `buildAxAIEnv()` and provider detection from RLM runner for consistency

2. **VM Lifecycle Strategy**: Should the agent start a new VM each run or reuse existing VMs?
   - **Auto-start (recommended)**: Start VM if not running, reuse if exists
   - **Ephemeral**: Always create new VM, delete on completion
   - **Persistent**: Require user to pre-start VM via CLI
   - **Recommendation**: Auto-start for ease of use; add config option `ephemeral: boolean` for future

3. **VM Name Generation**: How to generate VM names if not specified in config?
   - Timestamp-based: `agent-session-${Date.now()}`
   - UUID-based: `agent-${uuid()}`
   - User-specific: `agent-${USER}-${Date.now()}`
   - **Recommendation**: Use `agent-session-${Date.now()}` with optional prefix from config

4. **File Path Semantics**: How should relative paths be handled?
   - Relative to VM's current directory (usually `/home/user`)
   - Relative to a project directory mounted into VM?
   - Absolute paths only?
   - **Recommendation**: Support both absolute and relative paths; relative paths resolve to VM's home directory (document this clearly)

5. **Working Directory**: What working directory should the agent operate in?
   - VM's home directory (`/home/sprite` or `/root`)
   - A mounted project directory from host?
   - Configurable via `agent.cwd` field?
   - **Recommendation**: Start with VM's home; add `cwd` field to schema later for project mounting

6. **Binary File Size Limits**: What's the maximum file size for base64 encoding?
   - Base64 increases size by 33%
   - Large files (>10MB) may cause memory issues
   - **Recommendation**: Document 10MB soft limit; add chunking for larger files in future enhancement

7. **Concurrent Tool Execution**: Should multiple tools be able to execute simultaneously in the same VM?
   - Sprite CLI likely serializes exec calls
   - Risk of race conditions if tools mutate shared state
   - **Recommendation**: Serialize tool calls for safety; document as known limitation

8. **VM State Persistence**: Should the VM persist between agent runs?
   - Persistent: Faster for subsequent runs, but state drift
   - Ephemeral: Clean state every time, but slower startup
   - **Recommendation**: Default to persistent (VM stays running); add `ephemeral` config option to auto-delete on completion

9. **MCP Server Support**: Should Sprite agents support MCP servers?
   - RLM runner already supports MCP (`adaptMcpServersToAxTools`)
   - MCP tools would run on host, not inside VM (security risk?)
   - **Recommendation**: Support MCP but document security implications; add `mcpSandboxed` config flag for future

10. **Fallback to Local Tools**: What happens if VM exec fails?
    - Fail all tool calls?
    - Fall back to local tools (security risk)?
    - Retry VM connection?
    - **Recommendation**: Fail all tool calls with clear error; do NOT silently fall back to local tools (would break sandboxing guarantees)

11. **Resource Limits**: How to prevent agent from consuming all VM resources?
    - Sprite VMs have memory/CPU limits via `--memory` and `--cpus` flags
    - Should we add disk limits? Network limits?
    - **Recommendation**: Rely on Sprite's existing resource limits; document that agents can fill disk

12. **Interactive Commands**: How to handle commands requiring user input (e.g., `npm login`)?
    - Block interactive commands explicitly?
    - Allow stdin passthrough via `sprite exec`?
    - **Recommendation**: Explicitly document as non-interactive only; commands that read stdin will timeout or fail

## Implementation Notes

- **Reuse `execSprite()` Primitive**: The core primitive at `src/agent/sprite-runner.ts:446-486` already handles subprocess spawning, timeout enforcement, output capture, and error detection. Simply pass different commands for each tool.

- **Follow RLM Runner Pattern**: The agent initialization flow in `src/agent/rlm-runner.ts:64-200` provides a complete template for building AI services, tool registries, and running queries. Adapt this pattern for Sprite agents.

- **Base64 Encoding for File Content**: Using `base64` encoding for file reads/writes ensures binary safety and prevents shell injection from file content. The pattern `cat file | base64` and `echo data | base64 -d | tee file` is well-tested.

- **Tool Names Stay the Same**: Remote tools use the same names as local tools (`Read`, `Write`, `Bash`, etc.) for transparency. The proxying is invisible to the agent.

- **Error Handling Distinguishes Subprocess vs Command Failures**: `execSprite()` throws for subprocess errors (spawn failure, timeout) but returns `success: false` for command failures (non-zero exit code). Remote tools should follow this pattern.

- **VM Initialization is Idempotent**: `ensureSpriteRunning()` checks if VM exists before starting, making it safe to call multiple times.

- **Timeout is Configurable**: The `config.timeout` field (default 300s) applies to all tool operations via `execSprite()`. Long-running commands like `npm install` may need increased timeout.

- **Streaming Output is Supported**: The `onStdoutChunk` and `onStderrChunk` callbacks in `execSprite()` enable real-time output streaming for long-running commands.

- **MCP Tools Can Be Added**: The tool registry supports mixing remote tools with MCP tools. MCP tools execute on host, remote tools execute in VM. Document this security distinction.

- **Allowlist System Works Transparently**: Since remote tools keep the same names as local tools, the existing `PHASE_TOOL_ALLOWLISTS` work without modification.

- **Authentication is Handled**: The `SPRITES_TOKEN` environment variable is already injected via `runWispCommand()` at lines 107-110. No additional auth handling needed.

- **Testing Requires Mocking**: Unit tests should mock `execSprite()` to avoid requiring actual Sprite CLI. Integration tests should test with real VMs if available in CI.

- **Performance Consideration**: Each tool call spawns a new `sprite exec` process, which adds latency. Document this expectation; optimize with caching if needed.

- **Security Guarantee**: By intercepting all tool calls and routing through `sprite exec`, we ensure the agent never directly accesses the host filesystem. This provides true sandbox isolation.

- **Backward Compatibility**: Adding remote tool proxying doesn't break existing Sprite functionality (start/attach/list/kill). The change is isolated to `runSpriteAgent()`.

- **Graceful Degradation**: If Sprite CLI is not available or VM fails to start, `runSpriteAgent()` returns a clear error. It does NOT fall back to local tools (which would break sandboxing).
