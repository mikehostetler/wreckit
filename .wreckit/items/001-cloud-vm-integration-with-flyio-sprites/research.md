# Research: Cloud VM integration with Fly.io Sprites

**Date**: 2025-01-21
**Item**: 001-cloud-vm-integration-with-flyio-sprites

## Research Question
Agent tasks currently run only on local machines, limiting scalability and requiring local resources.

**Motivation:** Enables remote execution, better resource management, and scalable compute for Wreckit agent tasks.

**Success criteria:**
- CLI commands work: `wreckit sprite status|resume|destroy`
- ComputeBackend interface supports both LocalBackend and SpritesBackend
- SpriteSessionStore persists session state correctly
- SpriteEnv loads SPRITE_TOKEN and GITHUB_TOKEN from multiple sources
- New `compute` and `limits` config sections validated

**Technical constraints:**
- Requires Fly.io account and SPRITE_TOKEN
- Requires GitHub token for repo operations
- Must maintain backward compatibility with local backend
- Base64 encoding for file sync operations

**In scope:**
- CLI sprite commands
- Backend abstraction layer
- Session persistence
- Environment token loading
- Config validation for new sections
- File sync (upload/download)
- Auto-delete and resume behavior
- Limits enforcement (iterations, duration, budget, progress)
**Out of scope:**
- Multi-region support
- Concurrent session limits enforcement
- Sprite image customization
- Credential rotation automation
- Built-in cost tracking (relies on Fly.io dashboard)

**Signals:** priority: high, urgency: Feature branch ready for testing

## Summary

The research reveals that **Wreckit already has a partial implementation of Fly.io Sprites integration** through the `sprite` agent kind. The existing codebase includes:

1. **Complete Sprite CLI integration** (`src/agent/sprite-core.ts`) - Full wrapper around the Sprite/Wisp CLI with commands for start, list, kill, attach, and exec operations
2. **Sprite agent runner** (`src/agent/sprite-runner.ts`) - A fully functional agent runner that executes LLM agents inside isolated Sprite VMs with automatic file synchronization
3. **File sync infrastructure** (`src/fs/sync.ts`) - Archive-based project synchronization using tar.gz with base64 encoding for safe transfer
4. **Remote tools registry** (`src/agent/remote-tools.ts`) - A complete set of tools (Read, Write, Edit, Bash, Glob, Grep) that execute inside Sprite VMs
5. **CLI commands** (`src/commands/sprite.ts`) - User-facing commands for manual VM management (start, list, kill, attach, exec, pull)
6. **Environment variable loading** (`src/agent/env.ts`) - Multi-source token resolution with support for SPRITES_TOKEN

However, the item requirements ask for **additional functionality** beyond what exists:

**What's Missing:**
1. **CLI commands named differently** - Item asks for `status|resume|destroy` but current implementation has `list|attach|kill`
2. **ComputeBackend abstraction layer** - No existing interface for swapping between LocalBackend and SpritesBackend
3. **SpriteSessionStore** - No session state persistence system exists yet
4. **New config sections** - No `compute` or `limits` configuration sections in schemas
5. **GitHub token loading** - SpriteEnv doesn't explicitly handle GITHUB_TOKEN (though env loading is extensible)
6. **Resume behavior** - No mechanism to resume interrupted sessions from persisted state
7. **Limits enforcement** - No resource limiting (iterations, duration, budget, progress tracking)

**What Already Exists:**
- Complete Sprite CLI wrapper (`sprite-core.ts:47-377`)
- Working agent execution in VMs (`sprite-runner.ts:139-369`)
- File sync with base64 encoding (`sync.ts:118-412`)
- Remote tool registry (`remote-tools.ts:10-28`)
- Manual VM management commands (`sprite.ts:96-629`)
- SPRITES_TOKEN environment loading (`env.ts:187-216`)
- Ephemeral VM lifecycle management (`sprite-runner.ts:52-62`)
- Sandbox mode with --sandbox flag (`config.ts:181-229`)

**Key Finding:** The implementation appears to be 70% complete but lacks the higher-level abstractions (backend interface, session store) and config structure requested in the item.

## Current State Analysis

### Existing Implementation

#### 1. Sprite Core Functionality (`src/agent/sprite-core.ts`)

The `sprite-core.ts` file provides a complete wrapper around the Sprite CLI:

- **`runWispCommand()`** (`sprite-core.ts:47-193`) - Low-level command execution with timeout, token injection, and stream handling
- **`startSprite()`** (`sprite-core.ts:236-273`) - Creates new Sprite VMs via `sprite api /sprites -X POST`
- **`listSprites()`** (`sprite-core.ts:301-317`) - Lists active VMs via `sprite api /sprites`
- **`killSprite()`** (`sprite-core.ts:319-342`) - Terminates VMs via `sprite api /v1/sprites/{name} -X DELETE`
- **`attachSprite()`** (`sprite-core.ts:276-299`) - Interactive shell access via `sprite console {name}`
- **`execSprite()`** (`sprite-core.ts:343-377`) - Execute commands in VM with optional file uploads via `-file` flag

**Key Implementation Details:**
- Token authentication via `SPRITES_TOKEN` environment variable (`sprite-core.ts:68-71`)
- Default timeout of 300 seconds (`sprite-core.ts:54`)
- JSON response parsing with API/CLI status normalization (`sprite-core.ts:195-234`)
- Proper error handling with custom error types (WispNotFoundError, SpriteStartError, etc.)

#### 2. Sprite Agent Runner (`src/agent/sprite-runner.ts`)

The `sprite-runner.ts` file implements the complete agent execution lifecycle:

- **`runSpriteAgent()`** (`sprite-runner.ts:139-369`) - Main agent execution function with:
  - VM initialization and lifecycle management
  - Project synchronization (push to VM, pull from VM)
  - AxAI-based agent loop with tool calling
  - Ephemeral VM cleanup on completion

**Key Features:**
- **Ephemeral VM tracking** (`sprite-runner.ts:52-62`) - Global `currentEphemeralVM` variable tracks VM for cleanup
- **Automatic VM naming** (`sprite-runner.ts:164`) - Format: `wreckit-sandbox-{itemId}-{timestamp}` for ephemeral mode
- **Bi-directional sync** - Push before execution, pull after success (`sprite-runner.ts:178`, `sprite-runner.ts:334-350`)
- **Remote tool registry** (`sprite-runner.ts:183`) - Builds tools for VM execution
- **Agent loop with 100 iteration limit** (`sprite-runner.ts:209`, `sprite-runner.ts:215`)
- **Interrupt-safe cleanup** - Finally block ensures VM cleanup (`sprite-runner.ts:358-368`)

#### 3. File Synchronization (`src/fs/sync.ts`)

The `sync.ts` file implements archive-based project synchronization:

- **`createProjectArchive()`** (`sync.ts:118-202`) - Creates tar.gz with system tar command, excludes patterns
- **`uploadToSpriteVM()`** (`sync.ts:208-306`) - Uploads and extracts archive using `sprite exec -file source:dest`
- **`downloadFromSpriteVM()`** (`sync.ts:418-465`) - Creates tar in VM, outputs base64 to stdout
- **`extractProjectArchive()`** (`sync.ts:471-549`) - Extracts archive on host using system tar

**Exclude Patterns** (`sync.ts:92-112`):
```typescript
const DEFAULT_EXCLUDE_PATTERNS = [
  ".git", "node_modules", ".wreckit/project-sync.tar.gz",
  ".wreckit/backups", ".wreckit/tmp", ".wreckit/media",
  "dist", "build", ".DS_Store", "bin/sprite",
  "paper.pdf", "*.mp4", "*.mov", "*.avi",
  "*.png", "*.jpg", "*.jpeg", "*.ico", "*.woff2"
];
```

**Base64 Encoding** (`sync.ts:437`):
```typescript
// Execute tar inside VM, output to stdout as base64
const result = await execSprite(
  vmName,
  ["sh", "-c", `${tarArgs.join(" ")} | base64`],
  config, logger,
);
```

#### 4. Remote Tools Registry (`src/agent/remote-tools.ts`)

The `remote-tools.ts` file provides tools that execute inside VMs:

- **`buildRemoteToolRegistry()`** (`remote-tools.ts:10-30`) - Factory function that creates all remote tools
- **`createRemoteReadTool()`** (`remote-tools.ts:32-77`) - Read files via `cat | base64`
- **`createRemoteWriteTool()`** (`remote-tools.ts:79-133`) - Write files via `echo | base64 -d >`
- **`createRemoteEditTool()`** (`remote-tools.ts:135-217`) - String replacement in files
- **`createRemoteBashTool()`** (`remote-tools.ts:219-265`) - Execute shell commands
- **`createRemoteGlobTool()`** (`remote-tools.ts:267-321`) - File pattern matching
- **`createRemoteGrepTool()`** (`remote-tools.ts:323-376`) - Content search

**All tools work at `/home/user/project` inside the VM** (`remote-tools.ts:37`).

#### 5. CLI Commands (`src/commands/sprite.ts`)

The `sprite.ts` file implements user-facing VM management commands:

- **`spriteStartCommand()`** (`sprite.ts:101-171`) - Start new VM with optional memory/CPU overrides
- **`spriteListCommand()`** (`sprite.ts:178-265`) - List all active VMs
- **`spriteKillCommand()`** (`sprite.ts:272-333`) - Terminate a VM
- **`spriteAttachCommand()`** (`sprite.ts:340-401`) - Attach interactive shell
- **`spriteExecCommand()`** (`sprite.ts:415-509`) - Execute command in VM
- **`spritePullCommand()`** (`sprite.ts:523-629`) - Pull files from VM

**Commands are registered in** `src/index.ts` (`index.ts:468-656`):
```typescript
spriteCmd.command("start <name>")  // -> spriteStartCommand
spriteCmd.command("list")          // -> spriteListCommand
spriteCmd.command("kill <name>")    // -> spriteKillCommand
spriteCmd.command("attach <name>")  // -> spriteAttachCommand
spriteCmd.command("exec <name> <command...>") // -> spriteExecCommand
spriteCmd.command("pull <name>")    // -> spritePullCommand
```

#### 6. Configuration System (`src/config.ts`, `src/schemas.ts`)

**Sprite Agent Schema** (`schemas.ts:76-124`):
```typescript
export const SpriteAgentSchema = z.object({
  kind: z.literal("sprite"),
  model: z.string().optional(),
  wispPath: z.string().default("sprite"),
  token: z.string().optional(),
  vmName: z.string().optional(),
  syncEnabled: z.boolean().default(true),
  syncExcludePatterns: z.array(z.string()).default([...]),
  syncOnSuccess: z.boolean().default(false),
  maxVMs: z.number().default(5),
  defaultMemory: z.string().default("512MiB"),
  defaultCPUs: z.string().default("1"),
  timeout: z.number().default(300),
});
```

**Sandbox Mode Transformation** (`config.ts:181-229`):
- Forces `agent.kind = "sprite"` when `--sandbox` flag is used
- Enables `syncEnabled = true` and `syncOnSuccess = true`
- Removes `vmName` to force ephemeral mode
- Applies default memory/CPU settings

**Environment Loading** (`env.ts:187-216`):
```typescript
export async function buildSpriteEnv(
  options: BuildSpriteEnvOptions
): Promise<Record<string, string>> {
  const { token, logger } = options;
  const baseEnv = await buildSdkEnv(options);
  const spriteEnv: Record<string, string> = { ...baseEnv };

  // Add token if provided (from config or explicit parameter)
  if (token) {
    spriteEnv.SPRITES_TOKEN = token;
    logger.debug("Sprites token loaded from config");
  } else if (baseEnv.SPRITES_TOKEN) {
    logger.debug("Sprites token loaded from environment");
  }

  return spriteEnv;
}
```

**Precedence for token loading** (`env.ts:1-9`):
1. `.wreckit/config.local.json agent.env` (project-specific, gitignored)
2. `.wreckit/config.json agent.env` (project defaults)
3. `process.env` (shell environment)
4. `~/.claude/settings.json env` (Claude user settings)

### Key Files

**Core Implementation:**
- `src/agent/sprite-core.ts:1-378` - Complete Sprite CLI wrapper with all primitive operations
- `src/agent/sprite-runner.ts:1-370` - Agent execution in VMs with lifecycle management
- `src/fs/sync.ts:1-599` - Archive-based file synchronization with base64 encoding
- `src/agent/remote-tools.ts:1-376` - Remote tool registry for VM execution

**CLI Interface:**
- `src/commands/sprite.ts:1-630` - User-facing sprite management commands
- `src/index.ts:468-656` - CLI command registration for sprite subcommands

**Configuration:**
- `src/schemas.ts:76-124` - SpriteAgentConfig schema definition
- `src/config.ts:181-229` - Sandbox mode config transformation
- `src/agent/env.ts:187-216` - SPRITES_TOKEN environment loading

**Agent Dispatch:**
- `src/agent/runner.ts:296-313` - Sprite agent case in union dispatch
- `src/agent/dispatcher.ts:177-190` - Sprite agent dispatcher

**Tests:**
- `src/__tests__/sandbox.test.ts:1-150` - Sandbox mode config transformation tests
- `src/__tests__/commands/sprite.test.ts` - Sprite command tests (referenced but not read)

## Technical Considerations

### Dependencies

**External Dependencies:**
- **Sprite CLI** (`@sprites-dev/cli`) - Must be installed separately, available via `npm install -g @sprites-dev/cli`
- **Fly.io/Sprites.dev account** - Requires authentication token
- **System utilities** - `tar` command required for archive operations

**Internal Dependencies:**
- `@ax-llm/ax` - AxAI SDK for agent execution (used in sprite-runner)
- `zod` - Schema validation for SpriteAgentConfig
- `commander` - CLI framework for sprite commands
- `pino` - Logging throughout sprite operations

### Patterns to Follow

**1. Agent Kind Discriminated Union Pattern** (`schemas.ts:126-134`):
```typescript
export const AgentConfigUnionSchema = z.discriminatedUnion("kind", [
  ProcessAgentSchema,
  ClaudeSdkAgentSchema,
  AmpSdkAgentSchema,
  CodexSdkAgentSchema,
  OpenCodeSdkAgentSchema,
  RlmSdkAgentSchema,
  SpriteAgentSchema,  // ← Sprite is already integrated
]);
```

The item asks for a ComputeBackend interface. Following the existing pattern, this should also be a discriminated union with kinds like `"local"` and `"sprites"`.

**2. Config Transformation Pattern** (`config.ts:231-301`):
The `applyOverrides()` function shows how to transform config based on flags:
- Check for sandbox flag
- Apply transformations
- Preserve other fields
- Return new config object

**3. Environment Variable Precedence** (`env.ts:118-124`):
```typescript
const sdkEnv: Record<string, string> = {
  ...claudeSettingsEnv,      // Lowest priority
  ...processEnv,             // Shell environment
  ...wreckitConfigEnv,       // Project defaults
  ...wreckitLocalEnv,        // Highest priority
};
```

This pattern should be followed for GITHUB_TOKEN loading in SpriteEnv.

**4. Error Handling Pattern** (`sprite-core.ts:98-115`):
```typescript
try {
  child = spawn(wispPath, args, { stdio: ["pipe", "pipe", "pipe"], env });
} catch (err) {
  if ((err as NodeJS.ErrnoException).code === "ENOENT") {
    // Handle CLI not found
    resolve({
      success: false,
      error: `Sprite CLI not found at '${wispPath}'.\n\nTo enable Sprite support:...`
    });
    return;
  }
}
```

Custom error types with helpful messages guide users to fix configuration issues.

**5. File Sync Pattern** (`sync.ts:118-412`):
- Create local tar.gz archive
- Upload via `sprite exec -file source:dest`
- Extract in VM
- On completion, create tar in VM
- Stream via base64 to stdout
- Decode and extract locally

**6. Ephemeral Lifecycle Pattern** (`sprite-runner.ts:358-368`):
```typescript
finally {
  unregisterSdkController(abortController);
  if (ephemeral && vmName && !dryRun) {
    try {
      await killSprite(vmName, config, logger);
    } catch (err) {
      logger.warn(`Failed to cleanup ephemeral VM '${vmName}': ${errorMsg}`);
    }
    currentEphemeralVM = null;
  }
}
```

Always clean up resources in finally blocks, but don't fail on cleanup errors.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Sprite CLI not installed** | High - Blocks all sprite functionality | Already handled: `sprite-core.ts:98-115` provides helpful error message with installation instructions |
| **SPRITES_TOKEN missing** | High - Authentication failure | Already handled: `env.ts:195-216` loads from multiple sources with clear logging |
| **File sync corruption** | Medium - Data loss during transfer | Already handled: `sync.ts:150-201` uses system tar with error checking, base64 encoding prevents corruption |
| **VM orphaned on crash** | Medium - Resource leak in Fly.io | Already handled: `sprite-runner.ts:358-368` cleanup in finally block, `index.ts:1084-1134` interrupt handler with VM cleanup |
| **GitHub token not loaded** | Low - Can't create PRs from VM | Need to add: Extend `buildSpriteEnv()` to also load GITHUB_TOKEN using same precedence pattern |
| **No session persistence** | High - Can't resume after interruption | Need to add: Implement SpriteSessionStore to serialize VM state to disk |
| **No resource limits** | Medium - Unexpected costs from runaway agents | Need to add: Implement limits enforcement (iterations, duration, budget) |
| **Config incompatibility** | Low - Breaking change for existing users | Already handled: Backward compatible schema, sandbox mode is opt-in via flag |
| **Base64 encoding overhead** | Low - Performance impact on large files | Acceptable: Trade-off for reliability, already working in production |
| **Concurrent VM limits** | Low - Exceed Fly.io account limits | Configurable via `maxVMs` (default 5) in schema |

## Recommended Approach

Based on the research findings, here's the recommended implementation strategy:

### Phase 1: Add Missing Configuration Sections

**1.1 Add `compute` section to schemas** (`src/schemas.ts`):

```typescript
export const ComputeConfigSchema = z.object({
  backend: z.enum(["local", "sprites"]).default("local"),
  sprites: SpriteAgentSchema.optional(),
});

// Add to ConfigSchema
export const ConfigSchema = z.object({
  // ... existing fields
  compute: ComputeConfigSchema.optional(),
});
```

**1.2 Add `limits` section to schemas**:

```typescript
export const LimitsConfigSchema = z.object({
  maxIterations: z.number().default(100).describe("Maximum agent iterations"),
  maxDurationSeconds: z.number().default(3600).describe("Maximum execution time"),
  maxBudgetDollars: z.number().optional().describe("Maximum cost in USD"),
  maxProgressSteps: z.number().default(1000).describe("Maximum tool calls"),
});

// Add to ConfigSchema
export const ConfigSchema = z.object({
  // ... existing fields
  limits: LimitsConfigSchema.optional(),
});
```

### Phase 2: Implement ComputeBackend Abstraction

**2.1 Create ComputeBackend interface** (`src/agent/compute-backend.ts`):

```typescript
export interface ComputeBackend {
  readonly kind: "local" | "sprites";

  // Execute agent in this backend
  executeAgent(options: ExecuteAgentOptions): Promise<AgentResult>;

  // Lifecycle management
  start?(options: StartOptions): Promise<BackendStartResult>;
  stop?(options: StopOptions): Promise<BackendStopResult>;

  // Session management
  saveSession?(sessionId: string, state: unknown): Promise<void>;
  loadSession?(sessionId: string): Promise<unknown | null>;

  // Resource management
  enforceLimits?(limits: LimitsConfig, context: ExecutionContext): Promise<void>;
}

export class LocalBackend implements ComputeBackend {
  readonly kind = "local" as const;
  // Wraps existing agent runners (claude_sdk, amp_sdk, etc.)
}

export class SpritesBackend implements ComputeBackend {
  readonly kind = "sprites" as const;
  // Wraps sprite-runner.ts functionality
}
```

**2.2 Update agent dispatch** (`src/agent/runner.ts`):

```typescript
export async function runAgentWithBackend(
  backend: ComputeBackend,
  options: ExecuteAgentOptions
): Promise<AgentResult> {
  return backend.executeAgent(options);
}
```

### Phase 3: Implement SpriteSessionStore

**3.1 Create session store** (`src/agent/sprite-session-store.ts`):

```typescript
export interface SpriteSession {
  sessionId: string;
  vmName: string;
  itemId: string;
  startTime: string;
  config: SpriteAgentConfig;
  state: "running" | "paused" | "completed" | "failed";
  checkpoint?: {
    iteration: number;
    progressLog: string;
    vmSnapshotId?: string;  // For future VM snapshot support
  };
}

export class SpriteSessionStore {
  async save(session: SpriteSession): Promise<void> {
    const sessionPath = this.getSessionPath(session.sessionId);
    await safeWriteJson(sessionPath, session);
  }

  async load(sessionId: string): Promise<SpriteSession | null> {
    const sessionPath = this.getSessionPath(sessionId);
    try {
      const content = await fs.readFile(sessionPath, "utf-8");
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  async list(filter?: { state?: string; itemId?: string }): Promise<SpriteSession[]> {
    // Scan .wreckit/sessions/ directory
    // Filter by state/itemId if provided
  }

  async delete(sessionId: string): Promise<void> {
    const sessionPath = this.getSessionPath(sessionId);
    await fs.unlink(sessionPath);
  }
}
```

**3.2 Add resume functionality** (`src/agent/sprite-runner.ts`):

```typescript
export async function resumeSpriteAgent(
  sessionId: string,
  options: SpriteRunAgentOptions
): Promise<AgentResult> {
  const sessionStore = new SpriteSessionStore(options.cwd);
  const session = await sessionStore.load(sessionId);

  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }

  if (session.state !== "paused") {
    throw new Error(`Cannot resume session in state: ${session.state}`);
  }

  // Reattach to existing VM
  // Restore agent state from checkpoint
  // Continue execution
}
```

### Phase 4: Enhance CLI Commands

**4.1 Map existing commands to requested names** (`src/commands/sprite.ts`):

```typescript
// Add aliases for requested command names
export async function spriteStatusCommand(
  options: SpriteListOptions,
  logger: Logger
): Promise<void> {
  // Alias to spriteListCommand
  return spriteListCommand(options, logger);
}

export async function spriteResumeCommand(
  sessionId: string,
  options: { cwd?: string },
  logger: Logger
): Promise<void> {
  // Implement resume functionality
}

export async function spriteDestroyCommand(
  sessionIdOrVmName: string,
  options: SpriteKillOptions,
  logger: Logger
): Promise<void> {
  // Check if it's a sessionId or vmName
  // If sessionId, load session and kill VM
  // Alias to spriteKillCommand for vmName
}
```

**4.2 Register new commands** (`src/index.ts`):

```typescript
spriteCmd
  .command("status")      // -> spriteStatusCommand (alias for list)
  .command("resume <id>") // -> spriteResumeCommand
  .command("destroy <id>")// -> spriteDestroyCommand (alias for kill)
```

### Phase 5: Enhance Environment Loading

**5.1 Add GITHUB_TOKEN to SpriteEnv** (`src/agent/env.ts`):

```typescript
const ALLOWED_PREFIXES = [
  "ANTHROPIC_",
  "CLAUDE_CODE_",
  "API_TIMEOUT",
  "OPENAI_",
  "GOOGLE_",
  "ZAI_",
  "SPRITES_",
  "GITHUB_",  // Add this
];

export async function buildSpriteEnv(
  options: BuildSpriteEnvOptions
): Promise<Record<string, string>> {
  const { token, logger } = options;
  const baseEnv = await buildSdkEnv(options);
  const spriteEnv: Record<string, string> = { ...baseEnv };

  // Add SPRITES_TOKEN
  if (token) {
    spriteEnv.SPRITES_TOKEN = token;
    logger.debug("Sprites token loaded from config");
  } else if (baseEnv.SPRITES_TOKEN) {
    logger.debug("Sprites token loaded from environment");
  }

  // Add GITHUB_TOKEN (same precedence pattern)
  if (baseEnv.GITHUB_TOKEN) {
    logger.debug("GitHub token loaded from environment");
  }

  return spriteEnv;
}
```

### Phase 6: Implement Limits Enforcement

**6.1 Create limits checker** (`src/agent/limits.ts`):

```typescript
export interface LimitsContext {
  iterations: number;
  durationSeconds: number;
  budgetDollars?: number;
  progressSteps: number;
}

export async function enforceLimits(
  limits: LimitsConfig,
  context: LimitsContext,
  logger: Logger
): Promise<void> {
  if (context.iterations >= limits.maxIterations) {
    throw new Error(`Maximum iterations (${limits.maxIterations}) exceeded`);
  }

  if (context.durationSeconds >= limits.maxDurationSeconds) {
    throw new Error(`Maximum duration (${limits.maxDurationSeconds}s) exceeded`);
  }

  if (limits.maxBudgetDollars && context.budgetDollars) {
    if (context.budgetDollars >= limits.maxBudgetDollars) {
      throw new Error(`Maximum budget ($${limits.maxBudgetDollars}) exceeded`);
    }
  }

  if (context.progressSteps >= limits.maxProgressSteps) {
    throw new Error(`Maximum progress steps (${limits.maxProgressSteps}) exceeded`);
  }
}
```

**6.2 Integrate into sprite runner** (`src/agent/sprite-runner.ts`):

```typescript
// In runSpriteAgent loop
while (loopCount < MAX_LOOPS && !completionDetected) {
  const context: LimitsContext = {
    iterations: loopCount,
    durationSeconds: (Date.now() - startTime) / 1000,
    progressSteps: totalToolCalls,
  };

  if (config.limits) {
    await enforceLimits(config.limits, context, logger);
  }

  // Continue execution...
}
```

### Implementation Order (Priority)

1. **Config sections** - Foundation for everything else (1-2 hours)
2. **CLI command aliases** - Quick win, maps existing functionality (1 hour)
3. **ComputeBackend abstraction** - Enables clean backend switching (3-4 hours)
4. **SpriteSessionStore** - Enables resume functionality (2-3 hours)
5. **GITHUB_TOKEN loading** - Simple enhancement (30 minutes)
6. **Limits enforcement** - Safety mechanism (2 hours)
7. **Resume functionality** - Depends on session store (2-3 hours)

**Total Estimate:** 12-17 hours of development work

## Open Questions

1. **Session persistence format**: Should we store just metadata (vmName, iteration count) or full agent state (messages, tool results)? Full state enables true resume but increases storage complexity.

2. **VM snapshot support**: Does Fly.io Sprites support VM snapshots/checkpoints? If yes, we could save VM state and restore it later. If no, we can only save agent-level state and reattach to the same VM.

3. **Budget tracking**: How do we track actual cost in dollars? Sprites.dev pricing may not provide real-time cost data. May need to estimate based on VM uptime.

4. **Concurrent session limits**: Should we enforce `maxVMs` globally (across all wreckit instances) or per process? Global enforcement would require a lock file or daemon.

5. **Backward compatibility**: How do we migrate existing `agent.kind: "sprite"` configs to the new `compute.backend: "sprites"` format? Need a migration function.

6. **Error recovery on resume**: What happens if the VM is destroyed while a session is paused? Should we automatically create a new VM and restart from the last checkpoint?

7. **Test strategy**: How do we test Sprite integration without a real Fly.io account? Need mocks for the Sprite CLI or integration tests with a test account.

8. **Multi-region support**: Marked as out of scope, but should the config schema allow specifying a region for future use?

9. **Progress tracking**: How do we count "progress steps"? Is it tool calls, LLM tokens, files modified, or something else?

10. **Session cleanup**: Should old sessions be auto-deleted after a certain time? Need a TTL or cleanup job.
