# Cloud VM Integration with Fly.io Sprites Implementation Plan

## Overview

This implementation adds higher-level abstractions for Fly.io Sprites integration, enabling seamless switching between local and remote compute backends, session persistence for resumable agent tasks, and resource limiting for cost control.

**Current State:** Wreckit has 70% of Sprite integration complete (CLI wrapper, file sync, remote tools, agent execution) but lacks:
- ComputeBackend abstraction layer
- Session persistence and resume capability
- Resource limits enforcement
- GitHub token loading
- CLI command aliases for requested naming

## Current State Analysis

### What Already Exists (No Changes Needed)
1. **Complete Sprite CLI wrapper** (`src/agent/sprite-core.ts`) - All primitive operations (start, list, kill, attach, exec)
2. **Agent execution in VMs** (`src/agent/sprite-runner.ts`) - Full lifecycle management with ephemeral VM cleanup
3. **File synchronization** (`src/fs/sync.ts`) - Tar.gz archives with base64 encoding
4. **Remote tools registry** (`src/agent/remote-tools.ts`) - Complete tool set (Read, Write, Edit, Bash, Glob, Grep)
5. **CLI commands** (`src/commands/sprite.ts`) - Manual VM management (start, list, kill, attach, exec, pull)
6. **SPRITES_TOKEN loading** (`src/agent/env.ts:187-216`) - Multi-source token resolution
7. **Sprite agent schema** (`src/schemas.ts:76-124`) - Fully defined with all configuration options

### What's Missing (To Be Implemented)
1. **ComputeBackend abstraction** - No interface for swapping between local and sprites backends
2. **SpriteSessionStore** - No session state persistence system
3. **New config sections** - No `compute` or `limits` sections in ConfigSchema
4. **GITHUB_TOKEN loading** - Not included in ALLOWED_PREFIXES or buildSpriteEnv()
5. **CLI command aliases** - Commands named `list|kill|attach` instead of `status|destroy|resume`
6. **Resume functionality** - No mechanism to resume interrupted sessions
7. **Limits enforcement** - No resource limiting (iterations, duration, budget, progress tracking)

## Desired End State

### Key Capabilities
1. **Backend abstraction**: Agent execution can be dispatched to either LocalBackend or SpritesBackend via a unified interface
2. **Session persistence**: Agent state (iteration count, messages, VM name) saved to `.wreckit/sessions/{sessionId}.json`
3. **Resume capability**: Interrupted agents can be resumed from persisted session state
4. **Resource limits**: Configurable caps on iterations, duration, budget, and progress steps
5. **GitHub token**: Automatically loaded from environment and passed to Sprite VMs
6. **CLI commands**: `wreckit sprite status|resume|destroy` commands work as requested

### Verification
- `npm run typecheck` passes without errors
- `npm test` passes (including new sprite-session-store tests)
- Manual verification: Can create session, interrupt, resume, and destroy via CLI
- Config validation accepts new `compute` and `limits` sections
- GITHUB_TOKEN appears in Sprite VM environment

## Key Discoveries

### Important Findings with File References
1. **Agent kind pattern already established** (`schemas.ts:126-134`) - Sprite is one of 7 agent kinds in discriminated union
   - Follow this pattern for ComputeBackend: discriminated union with `kind: "local" | "sprites"`

2. **Environment loading precedence documented** (`env.ts:1-9`) - Clear 4-level precedence:
   - `.wreckit/config.local.json agent.env` (highest)
   - `.wreckit/config.json agent.env`
   - `process.env`
   - `~/.claude/settings.json env` (lowest)
   - **Apply same pattern for GITHUB_TOKEN**

3. **Ephemeral VM lifecycle pattern** (`sprite-runner.ts:358-368`) - Cleanup in finally block
   - **Don't fail on cleanup errors**

4. **Config transformation exists** (`config.ts:181-229`) - `applySandboxMode()` shows how to force agent.kind
   - Check flag, apply transformation, preserve other fields
   - **Use this pattern for compute.backend selection**

5. **No existing compute-backend or session-store files** - Glob search returned empty
   - Create from scratch following existing patterns

6. **Path utility functions available** (`fs/paths.ts`) - Add `getSessionsDir()` and `getSessionPath()`

### Patterns to Follow
1. **Discriminated Union Pattern** (`schemas.ts:126-134`)
2. **Config Merge Pattern** (`config.ts:128-174`)
3. **Error Handling Pattern** (`sprite-core.ts:98-115`)
4. **CLI Options Pattern** (`commands/sprite.ts:19-61`)

## What We're NOT Doing

Explicitly out of scope to prevent scope creep:
1. **Multi-region support** - All VMs in default region
2. **Concurrent session limits enforcement** - maxVMs is config-only, not enforced globally
3. **Sprite image customization** - Use default Sprites.dev image
4. **Credential rotation automation** - Manual token management only
5. **Built-in cost tracking** - Rely on Fly.io dashboard for cost monitoring
6. **VM snapshots** - Session persistence stores agent state, not VM filesystem snapshots
7. **Global process coordination** - Session management is per-wreckit-instance, not cross-process
8. **Budget tracking integration** - maxBudgetDollars is config-only (no real-time cost API)

## Implementation Approach

### High-Level Strategy
1. **Add config sections first** - Foundation for everything else
2. **Create path utilities** - Add session directory helpers
3. **Implement session store** - Persistence layer for resume capability
4. **Add CLI command aliases** - Quick win, maps existing functionality
5. **Implement limits enforcement** - Safety mechanism before backend abstraction
6. **Create ComputeBackend abstraction** - Highest complexity, depends on limits
7. **Enhance environment loading** - Simple addition of GITHUB_TOKEN
8. **Add resume functionality** - Depends on session store and backend abstraction

### Risk Mitigation
- **Backward compatibility**: New config sections are optional, existing sprite configs work unchanged
- **Incremental rollout**: Each phase is independently testable
- **Graceful degradation**: Missing tokens or invalid sessions log warnings, not failures
- **Migration not required**: `agent.kind: "sprite"` continues to work, `compute.backend` is opt-in

---

## Phase 1: Add Configuration Sections

### Overview
Add `compute` and `limits` sections to ConfigSchema to enable backend selection and resource limiting.

### Changes Required

#### 1.1 Add Compute Config Schema
**File**: `src/schemas.ts`
**Location**: After DoctorConfigSchema (line ~246)

**Changes**: Add ComputeConfigSchema with backend enum and sprites config

```typescript
export const ComputeConfigSchema = z.object({
  backend: z.enum(["local", "sprites"])
    .default("local")
    .describe("Which compute backend to use for agent execution"),

  sprites: z.object({
    wispPath: z.string().default("sprite"),
    token: z.string().optional(),
    vmName: z.string().optional(),
    syncEnabled: z.boolean().default(true),
    syncExcludePatterns: z.array(z.string()).default([
      ".git", "node_modules", ".wreckit", "dist", "build",
      "*.mp4", "*.mov", "*.avi", "*.png", "*.jpg", "*.jpeg"
    ]),
    syncOnSuccess: z.boolean().default(true),
    defaultMemory: z.string().default("512MiB"),
    defaultCPUs: z.string().default("1"),
    timeout: z.number().default(300),
  }).optional(),
});
```

#### 1.2 Add Limits Config Schema
**File**: `src/schemas.ts`
**Location**: After ComputeConfigSchema

**Changes**: Add LimitsConfigSchema with resource limits

```typescript
export const LimitsConfigSchema = z.object({
  maxIterations: z.number().default(100)
    .describe("Maximum agent loop iterations"),
  maxDurationSeconds: z.number().default(3600)
    .describe("Maximum execution time in seconds (1 hour default)"),
  maxBudgetDollars: z.number().optional()
    .describe("Maximum estimated cost in USD (optional)"),
  maxProgressSteps: z.number().default(1000)
    .describe("Maximum tool calls/progress steps"),
});
```

#### 1.3 Update ConfigSchema
**File**: `src/schemas.ts`
**Location**: ConfigSchema object (line ~280)

**Changes**: Add compute and limits as optional fields

```typescript
export const ConfigSchema = z.object({
  // ... existing fields
  compute: ComputeConfigSchema.optional(),
  limits: LimitsConfigSchema.optional(),
});
```

#### 1.4 Update ConfigResolved Type
**File**: `src/config.ts`
**Location**: ConfigResolved interface (line ~34)

**Changes**: Add compute and limits to interface

```typescript
export interface ConfigResolved {
  // ... existing fields
  compute?: z.infer<typeof ComputeConfigSchema>;
  limits?: z.infer<typeof LimitsConfigSchema>;
}
```

#### 1.5 Update Config Merge
**File**: `src/config.ts`
**Location**: mergeWithDefaults function (line ~160)

**Changes**: Preserve compute and limits from partial config

```typescript
export function mergeWithDefaults(partial: PartialConfigType): ConfigResolved {
  // ... existing merge logic
  return {
    // ... existing fields
    compute: partial.compute,
    limits: partial.limits,
  };
}
```

#### 1.6 Update applyOverrides
**File**: `src/config.ts`
**Location**: applyOverrides function (line ~287)

**Changes**: Preserve compute and limits when applying overrides

```typescript
export function applyOverrides(config: ConfigResolved, overrides: ConfigOverrides): ConfigResolved {
  // ... existing override logic
  return {
    ...config,
    compute: config.compute, // Preserve compute config
    limits: config.limits,    // Preserve limits config
  };
}
```

### Success Criteria

#### Automated Verification:
- [ ] `npm run typecheck` passes (TypeScript compiles without errors)
- [ ] Schema validation accepts new sections
- [ ] Schema validation rejects invalid backend value
- [ ] Default values applied when sections omitted

#### Manual Verification:
- [ ] Config files with new sections load without errors
- [ ] Existing config files without new sections continue to work
- [ ] `compute.backend` defaults to "local" when not specified
- [ ] `limits.maxIterations` defaults to 100 when not specified

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Add Session Path Utilities

### Overview
Add helper functions for session directory management following the existing path utilities pattern.

### Changes Required

#### 2.1 Add Session Path Functions
**File**: `src/fs/paths.ts`
**Location**: After getPromptPath function (line ~98)

**Changes**: Add getSessionsDir() and getSessionPath() functions

```typescript
export function getSessionsDir(cwd: string): string {
  return path.join(cwd, ".wreckit", "sessions");
}

export function getSessionPath(cwd: string, sessionId: string): string {
  const sessionsDir = getSessionsDir(cwd);
  const sanitizedId = sessionId.replace(/[^a-zA-Z0-9-_]/g, "_");
  return path.join(sessionsDir, `${sanitizedId}.json`);
}
```

### Success Criteria

#### Automated Verification:
- [ ] `npm run typecheck` passes
- [ ] Functions exported and accessible
- [ ] Paths resolve correctly: `.wreckit/sessions/{sessionId}.json`

#### Manual Verification:
- [ ] No breaking changes to existing path utilities

**Note**: Quick phase, proceed immediately to Phase 3.

---

## Phase 3: Implement SpriteSessionStore

### Overview
Create a session persistence system that saves agent state to disk for resumable execution.

### Changes Required

#### 3.1 Create Session Store Module
**File**: `src/agent/sprite-session-store.ts` (new file)

**Changes**: Create SpriteSession interface and SpriteSessionStore class

```typescript
import fs from "fs/promises";
import path from "path";
import { Logger } from "pino";
import { getSessionsDir, getSessionPath } from "../fs/paths.js";

export interface SpriteSessionCheckpoint {
  iteration: number;
  progressLog: string;
  timestamp: number;
}

export interface SpriteSession {
  sessionId: string;
  vmName: string;
  itemId: string;
  startTime: number;
  config: {
    memory: string;
    cpus: string;
  };
  state: "running" | "paused" | "completed" | "failed";
  checkpoint?: SpriteSessionCheckpoint;
  endTime?: number;
  error?: string;
}

export class SpriteSessionStore {
  constructor(
    private cwd: string,
    private logger: Logger
  ) {}

  async initialize(): Promise<void> {
    const sessionsDir = getSessionsDir(this.cwd);
    try {
      await fs.mkdir(sessionsDir, { recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
    }
  }

  async save(session: SpriteSession): Promise<void> {
    await this.initialize();

    const sessionPath = getSessionPath(this.cwd, session.sessionId);
    const sessionData = JSON.stringify(session, null, 2);

    await fs.writeFile(sessionPath, sessionData, "utf-8");

    this.logger.debug({ sessionId: session.sessionId }, "Session saved");
  }

  async load(sessionId: string): Promise<SpriteSession | null> {
    const sessionPath = getSessionPath(this.cwd, sessionId);

    try {
      const content = await fs.readFile(sessionPath, "utf-8");
      const session = JSON.parse(content) as SpriteSession;

      // Validate required fields
      if (!session.sessionId || !session.vmName || !session.state) {
        throw new Error("Invalid session structure");
      }

      this.logger.debug({ sessionId }, "Session loaded");
      return session;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        this.logger.debug({ sessionId }, "Session not found");
        return null;
      }
      throw error;
    }
  }

  async list(filter?: { state?: string; itemId?: string }): Promise<SpriteSession[]> {
    await this.initialize();

    try {
      const sessionsDir = getSessionsDir(this.cwd);
      const entries = await fs.readdir(sessionsDir);
      const sessions: SpriteSession[] = [];

      for (const entry of entries) {
        if (!entry.endsWith(".json")) continue;

        const sessionId = entry.slice(0, -5); // Remove .json
        const session = await this.load(sessionId);

        if (session) {
          if (filter?.state && session.state !== filter.state) continue;
          if (filter?.itemId && session.itemId !== filter.itemId) continue;

          sessions.push(session);
        }
      }

      // Sort by start time (newest first)
      return sessions.sort((a, b) => b.startTime - a.startTime);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  async delete(sessionId: string): Promise<void> {
    const sessionPath = getSessionPath(this.cwd, sessionId);

    try {
      await fs.unlink(sessionPath);
      this.logger.debug({ sessionId }, "Session deleted");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        // Already deleted, ignore
        this.logger.debug({ sessionId }, "Session already deleted");
        return;
      }
      throw error;
    }
  }

  async updateState(
    sessionId: string,
    state: SpriteSession["state"],
    updates?: Partial<Omit<SpriteSession, "sessionId" | "vmName" | "itemId" | "startTime">>
  ): Promise<void> {
    const session = await this.load(sessionId);

    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.state = state;

    if (updates) {
      Object.assign(session, updates);
    }

    if (state === "completed" || state === "failed") {
      session.endTime = Date.now();
    }

    await this.save(session);
  }

  static generateSessionId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `sprite-${timestamp}-${random}`;
  }
}
```

#### 3.2 Export from Agent Module
**File**: `src/agent/sprite-runner.ts`
**Location**: At end of file

**Changes**: Re-export session store for convenience

```typescript
export { SpriteSessionStore, SpriteSession, type SpriteSessionCheckpoint } from "./sprite-session-store.js";
```

### Success Criteria

#### Automated Verification:
- [ ] `npm run typecheck` passes
- [ ] Create session: `save()` writes file to `.wreckit/sessions/{id}.json`
- [ ] Load session: `load()` reads and parses session file
- [ ] List sessions: `list()` returns sorted array
- [ ] Delete session: `delete()` removes file
- [ ] Missing session: `load()` returns null, doesn't throw
- [ ] Filters work: `list({ state: "paused" })` filters correctly

#### Manual Verification:
- [ ] Session files are valid JSON
- [ ] Session directory created automatically
- [ ] Multiple sessions can coexist
- [ ] Session JSON structure matches TypeScript interface

**Note**: Complete all verification before proceeding to Phase 4.

---

## Phase 4: Add CLI Command Aliases

### Overview
Add `status`, `resume`, and `destroy` commands as aliases to existing functionality and implement resume logic.

### Changes Required

#### 4.1 Implement spriteStatusCommand
**File**: `src/commands/sprite.ts`
**Location**: After spritePullCommand function (line ~629)

**Changes**: Create alias to spriteListCommand

```typescript
export async function spriteStatusCommand(
  options: SpriteListOptions,
  logger: Logger
): Promise<void> {
  // Alias to existing list command
  return spriteListCommand(options, logger);
}
```

#### 4.2 Implement spriteResumeCommand
**File**: `src/commands/sprite.ts`
**Location**: After spriteStatusCommand

**Changes**: Load session, validate state, mark as running

```typescript
export async function spriteResumeCommand(
  sessionId: string,
  options: { cwd?: string },
  logger: Logger
): Promise<void> {
  const cwd = options.cwd || process.cwd();
  const { SpriteSessionStore } = await import("../agent/sprite-session-store.js");

  const store = new SpriteSessionStore(cwd, logger);
  await store.initialize();

  const session = await store.load(sessionId);

  if (!session) {
    logger.error(`Session not found: ${sessionId}`);
    throw new Error(`Session ${sessionId} not found`);
  }

  if (session.state !== "paused") {
    logger.error(
      `Cannot resume session in state: ${session.state}. ` +
      `Only paused sessions can be resumed.`
    );
    throw new Error(`Cannot resume session in state: ${session.state}`);
  }

  logger.info(
    `Resuming session ${sessionId}\n` +
    `  VM: ${session.vmName}\n` +
    `  Item: ${session.itemId}\n` +
    `  Iteration: ${session.checkpoint?.iteration || 0}`
  );

  // Mark session as running
  await store.updateState(sessionId, "running");

  logger.info(`Session ${sessionId} marked as running`);
  logger.info(`Use 'wreckit run ${session.itemId}' to continue execution`);
}
```

#### 4.3 Implement spriteDestroyCommand
**File**: `src/commands/sprite.ts`
**Location**: After spriteResumeCommand

**Changes**: Accept sessionId or vmName, destroy accordingly

```typescript
export async function spriteDestroyCommand(
  sessionIdOrVmName: string,
  options: SpriteKillOptions,
  logger: Logger
): Promise<void> {
  const { SpriteSessionStore } = await import("../agent/sprite-session-store.js");
  const cwd = options.cwd || process.cwd();

  // Try to load as session first
  const store = new SpriteSessionStore(cwd, logger);
  await store.initialize();

  const session = await store.load(sessionIdOrVmName);

  if (session) {
    // It's a session ID
    logger.info(
      `Destroying session ${sessionIdOrVmName}\n` +
      `  VM: ${session.vmName}\n` +
      `  Item: ${session.itemId}\n` +
      `  State: ${session.state}`
    );

    // Kill the VM
    await spriteKillCommand(session.vmName, options, logger);

    // Delete the session
    await store.delete(sessionIdOrVmName);

    logger.info(`Session ${sessionIdOrVmName} destroyed`);
  } else {
    // Treat as VM name
    logger.info(`Destroying VM: ${sessionIdOrVmName}`);
    await spriteKillCommand(sessionIdOrVmName, options, logger);
  }
}
```

#### 4.4 Register New Commands
**File**: `src/index.ts`
**Location**: After sprite pull command registration (line ~656)

**Changes**: Register status, resume, destroy commands

```typescript
spriteCmd
  .command("status")
  .description("List active Sprites VMs (alias for list)")
  .option("--json", "Output as JSON")
  .option("--cwd <path>", "Working directory")
  .action(async (options) => {
    const logger = getLogger();
    await spriteStatusCommand(options, logger);
  });

spriteCmd
  .command("resume <sessionId>")
  .description("Resume a paused Sprites session")
  .option("--cwd <path>", "Working directory")
  .action(async (sessionId, options) => {
    const logger = getLogger();
    await spriteResumeCommand(sessionId, options, logger);
  });

spriteCmd
  .command("destroy <sessionIdOrVmName>")
  .description("Destroy a Sprites session or VM")
  .option("--cwd <path>", "Working directory")
  .action(async (sessionIdOrVmName, options) => {
    const logger = getLogger();
    await spriteDestroyCommand(sessionIdOrVmName, options, logger);
  });
```

### Success Criteria

#### Automated Verification:
- [ ] `npm run typecheck` passes
- [ ] `wreckit sprite status` lists VMs (same as `wreckit sprite list`)
- [ ] `wreckit sprite destroy <vmName>` kills VM (same as `wreckit sprite kill`)
- [ ] `wreckit sprite resume <sessionId>` loads session and checks state
- [ ] Commands accept `--json` flag
- [ ] Commands respect `--cwd` flag

#### Manual Verification:
- [ ] `wreckit sprite status` shows active VMs
- [ ] `wreckit sprite destroy my-vm` terminates VM
- [ ] Create paused session, then `wreckit sprite resume <id>` works
- [ ] `wreckit sprite destroy <sessionId>` kills VM and deletes session

**Note**: Resume functionality is minimal in this phase (just marks session as running). Full resume logic will be added in Phase 8 after ComputeBackend abstraction.

---

## Phase 5: Implement Limits Enforcement

### Overview
Create a limits checking module that enforces resource constraints during agent execution.

### Changes Required

#### 5.1 Create Limits Module
**File**: `src/agent/limits.ts` (new file)

**Changes**: Create LimitsContext, LimitExceededError, enforceLimits(), LimitsTracker class

```typescript
import { Logger } from "pino";
import { LimitsConfig } from "../config.js";

export interface LimitsContext {
  iterations: number;
  durationSeconds: number;
  progressSteps: number;
}

export class LimitExceededError extends Error {
  constructor(
    public limitType: "iterations" | "duration" | "progress" | "budget",
    public limitValue: number,
    public actualValue: number
  ) {
    super(
      `Limit exceeded: ${limitType} (${actualValue} > ${limitValue}). ` +
      `Adjust limits.${limitType === "iterations" ? "maxIterations" :
        limitType === "duration" ? "maxDurationSeconds" :
        limitType === "progress" ? "maxProgressSteps" : "maxBudgetDollars"} to increase.`
    );
    this.name = "LimitExceededError";
  }
}

export function enforceLimits(
  limits: LimitsConfig,
  context: LimitsContext,
  logger: Logger
): void {
  // Check iterations
  if (context.iterations >= limits.maxIterations) {
    logger.warn({
      limit: limits.maxIterations,
      actual: context.iterations,
    }, "Iterations limit exceeded");
    throw new LimitExceededError("iterations", limits.maxIterations, context.iterations);
  }

  // Check duration
  if (context.durationSeconds >= limits.maxDurationSeconds) {
    logger.warn({
      limit: limits.maxDurationSeconds,
      actual: context.durationSeconds,
    }, "Duration limit exceeded");
    throw new LimitExceededError("duration", limits.maxDurationSeconds, context.durationSeconds);
  }

  // Check budget (if set)
  if (limits.maxBudgetDollars !== undefined) {
    // Budget tracking is estimated based on VM uptime
    // This is a rough estimate - actual costs may vary
    const estimatedCost = estimateCost(context.durationSeconds);
    if (estimatedCost >= limits.maxBudgetDollars) {
      logger.warn({
        limit: limits.maxBudgetDollars,
        actual: estimatedCost,
      }, "Budget limit exceeded");
      throw new LimitExceededError("budget", limits.maxBudgetDollars, estimatedCost);
    }
  }

  // Check progress steps
  if (context.progressSteps >= limits.maxProgressSteps) {
    logger.warn({
      limit: limits.maxProgressSteps,
      actual: context.progressSteps,
    }, "Progress steps limit exceeded");
    throw new LimitExceededError("progress", limits.maxProgressSteps, context.progressSteps);
  }

  // Log current usage for debugging
  logger.debug({
    iterations: { current: context.iterations, max: limits.maxIterations },
    duration: { current: context.durationSeconds, max: limits.maxDurationSeconds },
    progress: { current: context.progressSteps, max: limits.maxProgressSteps },
  }, "Limits check passed");
}

// Rough cost estimation based on Sprites.dev pricing
// This is approximate - actual costs depend on region, VM size, etc.
function estimateCost(durationSeconds: number): number {
  // Assume $0.00023 per second (based on 512MiB VM pricing)
  return durationSeconds * 0.00023;
}

export class LimitsTracker {
  private startTime: number;
  private progressSteps: number = 0;

  constructor() {
    this.startTime = Date.now();
  }

  getDurationSeconds(): number {
    return (Date.now() - this.startTime) / 1000;
  }

  getIterations(iterations: number): number {
    return iterations;
  }

  getProgressSteps(): number {
    return this.progressSteps;
  }

  incrementProgress(count: number = 1): void {
    this.progressSteps += count;
  }

  resetProgress(): void {
    this.progressSteps = 0;
  }

  getContext(iterations: number): LimitsContext {
    return {
      iterations: this.getIterations(iterations),
      durationSeconds: this.getDurationSeconds(),
      progressSteps: this.getProgressSteps(),
    };
  }
}
```

#### 5.2 Integrate into Sprite Runner
**File**: `src/agent/sprite-runner.ts`
**Location**: In runSpriteAgent function, inside the agent loop (line ~215)

**Changes**: Add limits enforcement checks in loop

```typescript
import { enforceLimits, LimitsTracker } from "./limits.js";

export async function runSpriteAgent(
  options: SpriteRunAgentOptions
): Promise<AgentResult> {
  // ... existing setup code ...

  const tracker = new LimitsTracker();

  try {
    while (loopCount < MAX_LOOPS && !completionDetected) {
      // Enforce limits
      if (config.limits) {
        const context = tracker.getContext(loopCount);
        enforceLimits(config.limits, context, logger);
      }

      // ... existing agent iteration code ...

      // Track progress
      tracker.incrementProgress(/* tool calls count */);
    }

    // ... existing completion code ...
  } catch (error) {
    if (error instanceof LimitExceededError) {
      logger.warn({ error, loopCount }, "Agent stopped due to limits");
      throw error;
    }
    throw error;
  }
}
```

### Success Criteria

#### Automated Verification:
- [ ] `npm run typecheck` passes
- [ ] `enforceLimits()` throws LimitExceededError when maxIterations exceeded
- [ ] `enforceLimits()` throws LimitExceededError when maxDurationSeconds exceeded
- [ ] `enforceLimits()` throws LimitExceededError when maxProgressSteps exceeded
- [ ] `LimitsTracker` correctly calculates duration
- [ ] `LimitsTracker` correctly counts progress steps

#### Manual Verification:
- [ ] Agent stops after maxIterations
- [ ] Agent stops after maxDurationSeconds
- [ ] Agent stops after maxProgressSteps
- [ ] Limits logged to debug output
- [ ] Error messages are clear and actionable

**Note**: Complete all verification before proceeding to Phase 6.

---

## Phase 6: Enhance Environment Loading

### Overview
Add GITHUB_TOKEN to the allowed environment prefixes and ensure it's loaded for Sprite operations.

### Changes Required

#### 6.1 Update ALLOWED_PREFIXES
**File**: `src/agent/env.ts`
**Location**: ALLOWED_PREFIXES constant (line ~17)

**Changes**: Add "GITHUB_" prefix

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
```

#### 6.2 Update buildSpriteEnv
**File**: `src/agent/env.ts`
**Location**: buildSpriteEnv function (line ~195)

**Changes**: Add GITHUB_TOKEN loading with debug logging

```typescript
export async function buildSpriteEnv(
  options: BuildSpriteEnvOptions
): Promise<Record<string, string>> {
  const { token, logger } = options;
  const baseEnv = await buildSdkEnv(options);
  const spriteEnv: Record<string, string> = { ...baseEnv };

  // Add SPRITES_TOKEN
  if (token) {
    spriteEnv.SPRITES_TOKEN = token;
    logger.debug("SPRITES_TOKEN loaded from config");
  } else if (baseEnv.SPRITES_TOKEN) {
    logger.debug("SPRITES_TOKEN loaded from environment");
  }

  // Log GITHUB_TOKEN status (for debugging)
  if (baseEnv.GITHUB_TOKEN) {
    logger.debug("GITHUB_TOKEN loaded from environment (redacted)");
  } else {
    logger.debug("GITHUB_TOKEN not found in environment");
  }

  return spriteEnv;
}
```

#### 6.3 Pass GITHUB_TOKEN to Sprite VM
**File**: `src/agent/sprite-core.ts`
**Location**: runWispCommand function (line ~68)

**Changes**: Pass GITHUB_TOKEN in environment

```typescript
// The env object already includes all environment variables from buildSpriteEnv
// GITHUB_TOKEN will be automatically included since it's in ALLOWED_PREFIXES
// No changes needed here - just verify it's working
```

### Success Criteria

#### Automated Verification:
- [ ] `npm run typecheck` passes
- [ ] GITHUB_TOKEN allowed in buildSdkEnv()
- [ ] GITHUB_TOKEN present in buildSpriteEnv() output
- [ ] GITHUB_TOKEN passed to Sprite CLI in runWispCommand()

#### Manual Verification:
- [ ] Set GITHUB_TOKEN in `.wreckit/config.local.json` under `agent.env`
- [ ] Token appears in Sprite VM environment
- [ ] Can use GitHub operations from within Sprite VM
- [ ] Debug logs show token loading without exposing value

**Note**: Simple phase, proceed immediately to Phase 7.

---

## Phase 7: Implement ComputeBackend Abstraction

### Overview
Create an abstraction layer that allows agents to run on either local or sprites backends through a unified interface.

### Changes Required

#### 7.1 Create ComputeBackend Module
**File**: `src/agent/compute-backend.ts` (new file)

**Changes**: Create ComputeBackend interface, LocalBackend class, SpritesBackend class, createComputeBackend() factory, executeAgentOnBackend() function

```typescript
import { Logger } from "pino";
import { ComputeConfig, LimitsConfig } from "../config.js";
import { runAgent } from "./dispatcher.js";
import { runSpriteAgent } from "./sprite-runner.js";

export interface ExecuteAgentOptions {
  itemId: string;
  agentConfig: unknown;
  computeConfig: ComputeConfig;
  limitsConfig?: LimitsConfig;
  cwd: string;
  logger: Logger;
  sessionId?: string;
}

export interface AgentResult {
  success: boolean;
  error?: string;
  iterations: number;
  duration: number;
  filesModified: string[];
  output: string;
}

export interface ComputeBackend {
  readonly kind: "local" | "sprites";
  executeAgent(options: ExecuteAgentOptions): Promise<AgentResult>;
}

export class LocalBackend implements ComputeBackend {
  readonly kind = "local" as const;

  async executeAgent(options: ExecuteAgentOptions): Promise<AgentResult> {
    const { itemId, agentConfig, limitsConfig, cwd, logger } = options;

    logger.info({ itemId }, "Executing agent in local backend");

    const startTime = Date.now();

    try {
      // Call existing agent runner
      const result = await runAgent({
        itemId,
        config: agentConfig,
        cwd,
        logger,
      });

      return {
        success: true,
        iterations: result.iterations || 0,
        duration: (Date.now() - startTime) / 1000,
        filesModified: result.filesModified || [],
        output: result.output || "",
      };
    } catch (error) {
      logger.error({ error, itemId }, "Local execution failed");
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        iterations: 0,
        duration: (Date.now() - startTime) / 1000,
        filesModified: [],
        output: "",
      };
    }
  }
}

export class SpritesBackend implements ComputeBackend {
  readonly kind = "sprites" as const;
  private spritesConfig: NonNullable<ComputeConfig["sprites"]>;

  constructor(spritesConfig?: NonNullable<ComputeConfig["sprites"]>) {
    this.spritesConfig = spritesConfig || {};
  }

  async executeAgent(options: ExecuteAgentOptions): Promise<AgentResult> {
    const { itemId, agentConfig, limitsConfig, cwd, logger, sessionId } = options;

    logger.info({ itemId }, "Executing agent in sprites backend");

    const startTime = Date.now();

    try {
      // Call sprite runner with limits
      const result = await runSpriteAgent({
        itemId,
        config: {
          ...agentConfig,
          ...this.spritesConfig,
        },
        limits: limitsConfig,
        cwd,
        logger,
        sessionId,
      });

      return {
        success: true,
        iterations: result.iterations || 0,
        duration: (Date.now() - startTime) / 1000,
        filesModified: result.filesModified || [],
        output: result.output || "",
      };
    } catch (error) {
      logger.error({ error, itemId }, "Sprites execution failed");
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        iterations: 0,
        duration: (Date.now() - startTime) / 1000,
        filesModified: [],
        output: "",
      };
    }
  }
}

export function createComputeBackend(config: ComputeConfig): ComputeBackend {
  switch (config.backend) {
    case "local":
      return new LocalBackend();

    case "sprites":
      if (!config.sprites) {
        throw new Error(
          "Sprites backend requires sprites configuration. " +
          "Add 'sprites' section to compute config."
        );
      }
      return new SpritesBackend(config.sprites);

    default:
      throw new Error(`Unknown compute backend: ${config.backend}`);
  }
}

export async function executeAgentOnBackend(
  backend: ComputeBackend,
  options: ExecuteAgentOptions
): Promise<AgentResult> {
  return backend.executeAgent(options);
}
```

#### 7.2 Update Agent Dispatcher
**File**: `src/agent/dispatcher.ts`
**Location**: Modify runAgent function to support limits parameter

**Changes**: Add limits parameter and enforcement

```typescript
export async function runAgent(
  options: RunAgentOptions & { limits?: LimitsConfig }
): Promise<AgentResult> {
  // ... existing code ...

  // If limits provided, enforce them in the agent loop
  // This will be specific to each agent type

  // ... rest of implementation ...
}
```

### Success Criteria

#### Automated Verification:
- [ ] `npm run typecheck` passes
- [ ] `createComputeBackend()` returns LocalBackend when backend="local"
- [ ] `createComputeBackend()` returns SpritesBackend when backend="sprites"
- [ ] `createComputeBackend()` throws error when sprites config missing
- [ ] `executeAgentOnBackend()` calls correct backend implementation
- [ ] Limits enforced in both backends

#### Manual Verification:
- [ ] Local backend executes agents successfully
- [ ] Sprites backend executes agents in VMs
- [ ] Backend selection from config works correctly
- [ ] Limits enforced in both backends

**Note**: This is the most complex phase. Complete thorough testing before proceeding.

---

## Phase 8: Full Resume Implementation

### Overview
Integrate session persistence with ComputeBackend to enable true resume functionality.

### Changes Required

#### 8.1 Update SpritesBackend to Support Resume
**File**: `src/agent/compute-backend.ts`
**Location**: In SpritesBackend class

**Changes**: Add session loading, state management, session ID passing

```typescript
import { SpriteSessionStore } from "./sprite-session-store.js";

export class SpritesBackend implements ComputeBackend {
  readonly kind = "sprites" as const;
  private spritesConfig: NonNullable<ComputeConfig["sprites"]>;
  private sessionStore: SpriteSessionStore | null = null;

  constructor(spritesConfig?: NonNullable<ComputeConfig["sprites"]>) {
    this.spritesConfig = spritesConfig || {};
  }

  private getSessionStore(cwd: string, logger: Logger): SpriteSessionStore {
    if (!this.sessionStore || this.sessionStore["cwd"] !== cwd) {
      this.sessionStore = new SpriteSessionStore(cwd, logger);
      this.sessionStore["cwd"] = cwd; // Track for comparison
    }
    return this.sessionStore;
  }

  async executeAgent(options: ExecuteAgentOptions): Promise<AgentResult> {
    const { itemId, agentConfig, limitsConfig, cwd, logger, sessionId } = options;

    logger.info({ itemId, sessionId }, "Executing agent in sprites backend");

    const startTime = Date.now();

    // Load session if resuming
    let session = null;
    if (sessionId) {
      const store = this.getSessionStore(cwd, logger);
      session = await store.load(sessionId);

      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      if (session.state !== "paused") {
        throw new Error(
          `Cannot resume session in state: ${session.state}. ` +
          `Only paused sessions can be resumed.`
        );
      }

      // Mark session as running
      await store.updateState(sessionId, "running");

      logger.info(
        { sessionId, vmName: session.vmName, iteration: session.checkpoint?.iteration },
        "Resuming session"
      );
    }

    try {
      // Call sprite runner with session info
      const result = await runSpriteAgent({
        itemId,
        config: {
          ...agentConfig,
          ...this.spritesConfig,
        },
        limits: limitsConfig,
        cwd,
        logger,
        sessionId,
        resumeFromIteration: session?.checkpoint?.iteration,
        vmName: session?.vmName, // Use existing VM if resuming
      });

      // Update session state on success
      if (sessionId) {
        const store = this.getSessionStore(cwd, logger);
        await store.updateState(sessionId, "completed");
      }

      return {
        success: true,
        iterations: result.iterations || 0,
        duration: (Date.now() - startTime) / 1000,
        filesModified: result.filesModified || [],
        output: result.output || "",
      };
    } catch (error) {
      // Update session state on error
      if (sessionId) {
        const store = this.getSessionStore(cwd, logger);
        await store.updateState(sessionId, "failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      logger.error({ error, itemId }, "Sprites execution failed");
      throw error;
    }
  }
}
```

#### 8.2 Enhance Sprite Runner for Resume
**File**: `src/agent/sprite-runner.ts`
**Location**: In runSpriteAgent function

**Changes**: Add sessionId parameter, session loading logic, resume from iteration

```typescript
export interface SpriteRunAgentOptions {
  itemId: string;
  config: SpriteAgentConfig;
  limits?: LimitsConfig;
  cwd: string;
  logger: Logger;
  sessionId?: string;
  resumeFromIteration?: number;
  vmName?: string; // If provided, use this VM instead of creating new one
}

export async function runSpriteAgent(
  options: SpriteRunAgentOptions
): Promise<AgentResult> {
  const {
    itemId,
    config,
    limits,
    cwd,
    logger,
    sessionId,
    resumeFromIteration = 0,
    vmName: providedVmName,
  } = options;

  // ... existing setup code ...

  // Use provided VM name or generate new one
  const vmName = providedVmName || `wreckit-sandbox-${itemId}-${Date.now()}`;

  logger.info({ vmName, itemId, resumeFromIteration }, "Starting sprite agent");

  // ... existing VM startup code ...

  const tracker = new LimitsTracker();
  let loopCount = resumeFromIteration; // Start from resumed iteration

  try {
    while (loopCount < MAX_LOOPS && !completionDetected) {
      // Enforce limits
      if (limits) {
        const context = tracker.getContext(loopCount);
        enforceLimits(limits, context, logger);
      }

      // ... existing agent iteration code ...

      loopCount++;
    }

    // Save session checkpoint if sessionId provided
    if (sessionId && loopCount >= resumeFromIteration) {
      const { SpriteSessionStore } = await import("./sprite-session-store.js");
      const store = new SpriteSessionStore(cwd, logger);

      const session = await store.load(sessionId);
      if (session) {
        await store.updateState(sessionId, session.state, {
          checkpoint: {
            iteration: loopCount,
            progressLog: "Agent checkpoint",
            timestamp: Date.now(),
          },
        });
      }
    }

    // ... existing completion code ...
  } catch (error) {
    // ... existing error handling ...
  }
}
```

#### 8.3 Update spriteResumeCommand
**File**: `src/commands/sprite.ts`
**Location**: In spriteResumeCommand function

**Changes**: Use executeAgentOnBackend() with sessionId

```typescript
export async function spriteResumeCommand(
  sessionId: string,
  options: { cwd?: string },
  logger: Logger
): Promise<void> {
  const cwd = options.cwd || process.cwd();
  const { SpriteSessionStore } = await import("../agent/sprite-session-store.js");
  const { createComputeBackend, executeAgentOnBackend } = await import("../agent/compute-backend.js");
  const { loadConfig } = await import("../config.js");

  const store = new SpriteSessionStore(cwd, logger);
  await store.initialize();

  const session = await store.load(sessionId);

  if (!session) {
    logger.error(`Session not found: ${sessionId}`);
    throw new Error(`Session ${sessionId} not found`);
  }

  if (session.state !== "paused") {
    logger.error(
      `Cannot resume session in state: ${session.state}. ` +
      `Only paused sessions can be resumed.`
    );
    throw new Error(`Cannot resume session in state: ${session.state}`);
  }

  logger.info(
    `Resuming session ${sessionId}\n` +
    `  VM: ${session.vmName}\n` +
    `  Item: ${session.itemId}\n` +
    `  Iteration: ${session.checkpoint?.iteration || 0}`
  );

  // Load config to get backend settings
  const config = await loadConfig(cwd);

  // Create backend
  const backend = createComputeBackend(
    config.compute || { backend: "sprites" }
  );

  // Execute agent with session
  await executeAgentOnBackend(backend, {
    itemId: session.itemId,
    agentConfig: {}, // Will use session config
    computeConfig: config.compute || { backend: "sprites" },
    limitsConfig: config.limits,
    cwd,
    logger,
    sessionId,
  });

  logger.info(`Session ${sessionId} resumed and completed`);
}
```

### Success Criteria

#### Automated Verification:
- [ ] `npm run typecheck` passes
- [ ] Session state saved before agent execution
- [ ] Session state updated to "running" on resume
- [ ] Session state updated to "completed" on success
- [ ] Session state updated to "failed" on error
- [ ] Resume loads VM name and iteration from session
- [ ] Limits enforced during resumed execution

#### Manual Verification:
- [ ] Create session, interrupt it, then resume successfully
- [ ] Resumed session continues from correct iteration
- [ ] Resumed session uses same VM
- [ ] Resumed session respects limits
- [ ] Session files updated correctly after resume

**Note**: This is the final phase. Complete thorough testing to ensure full resume functionality works end-to-end.

---

## Testing Strategy

### Unit Tests

**New Test Files:**
1. `src/__tests__/sprite-session-store.test.ts` - Session persistence tests
2. `src/__tests__/limits.test.ts` - Limits enforcement tests
3. `src/__tests__/compute-backend.test.ts` - Backend abstraction tests
4. `src/__tests__/config-schema.test.ts` - Schema validation tests

### Integration Tests

**End-to-End Scenarios:**
1. Session Lifecycle (create, interrupt, resume, destroy)
2. Backend Selection (local vs sprites)
3. Limits Enforcement (iterations, duration, progress)
4. Environment Loading (GITHUB_TOKEN)

### Manual Testing Steps

1. Test Session Creation and Resume
2. Test Limits Enforcement
3. Test GITHUB_TOKEN Loading
4. Test CLI Commands

## Migration Notes

### Backward Compatibility
- **No migration required**: Existing `agent.kind: "sprite"` configs continue to work unchanged
- **Opt-in new features**: `compute` and `limits` sections are optional
- **No breaking changes**: All existing CLI commands remain functional

### Config Migration (Optional)
Users can optionally migrate to new format but old format remains supported

### Session File Format
Sessions stored in `.wreckit/sessions/{sessionId}.json`

## References

### Research
- `/Users/speed/wreckit/.wreckit/items/001-cloud-vm-integration-with-flyio-sprites/research.md`

### Existing Implementation
- `src/agent/sprite-core.ts:1-378` - Sprite CLI wrapper
- `src/agent/sprite-runner.ts:1-370` - Agent execution in VMs
- `src/commands/sprite.ts:1-630` - CLI commands
- `src/schemas.ts:76-124` - SpriteAgentConfig schema
- `src/config.ts:181-229` - Sandbox mode transformation
- `src/agent/env.ts:187-216` - SPRITES_TOKEN loading
- `src/fs/paths.ts:1-100` - Path utility functions

### Patterns to Follow
- Discriminated union pattern: `src/schemas.ts:126-134`
- Config merge pattern: `src/config.ts:128-174`
- Error handling pattern: `src/agent/sprite-core.ts:98-115`
- Environment precedence: `src/agent/env.ts:1-9`
- Ephemeral lifecycle: `src/agent/sprite-runner.ts:358-368`
