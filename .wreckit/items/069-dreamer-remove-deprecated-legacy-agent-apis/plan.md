# [DREAMER] Remove deprecated legacy agent APIs Implementation Plan

## Overview
Remove deprecated legacy agent APIs (`runAgent()`, `getAgentConfig()`, `AgentConfig`, `RunAgentOptions`) from the codebase. These APIs have been superseded by the modern discriminated union-based system (`runAgentUnion()`, `getAgentConfigUnion()`, `AgentConfigUnion`, `UnionRunAgentOptions`). While all production code uses the modern APIs, test files still import and test the legacy APIs. This task migrates tests to modern APIs, then removes the deprecated implementations.

## Current State Analysis

### What Exists Now
The codebase maintains two parallel agent API systems:

1. **Modern API (Preferred)** - Used in production code
   - `runAgentUnion()` - Type-safe discriminated union dispatch (src/agent/runner.ts:352-498)
   - `getAgentConfigUnion()` - Direct config accessor (src/agent/runner.ts:92-94)
   - `AgentConfigUnion` - Kind-based configuration from src/schemas.ts
   - `UnionRunAgentOptions` - Modern options interface (src/agent/runner.ts:294-309)

2. **Legacy API (Deprecated)** - Still used in test files
   - `runAgent()` - Legacy mode-based dispatch (src/agent/runner.ts:190-256)
   - `getAgentConfig()` - Legacy config converter (src/agent/runner.ts:114-138)
   - `AgentConfig` - Mode-based interface (src/agent/runner.ts:32-39)
   - `RunAgentOptions` - Legacy options interface (src/agent/runner.ts:57-70)
   - Supporting functions: `simulateMockAgent()` (src/agent/runner.ts:140-170), `runLegacyProcessAgent()` (src/agent/runner.ts:263-288)
   - Re-exports in src/agent/index.ts:38-56 with @deprecated JSDoc comments

### Current Usage Verification
**Production code**: ✅ All uses modern APIs
- src/workflow/itemWorkflow.ts imports and uses `runAgentUnion` and `getAgentConfigUnion`
- src/agent/dispatcher.ts uses modern `AgentConfigUnion`

**Test files**: ❌ Still use deprecated APIs (must migrate)
- src/__tests__/agent.test.ts - Imports and tests `runAgent()`, `getAgentConfig()`, `AgentConfig`, `RunAgentOptions`
- src/__tests__/edge-cases/mock-agent.isospec.ts - Uses `runAgent()`, `AgentConfig`, `RunAgentOptions`
- src/__tests__/edge-cases/dry-run.isospec.ts - Uses `runAgent()`, `AgentConfig`, `RunAgentOptions`
- src/__tests__/edge-cases/errors.isospec.ts - Uses `runAgent()`, `AgentConfig`, `RunAgentOptions`

**Documentation**: ✅ Generated docs reference both APIs (will be regenerated)
- docs/api/agent/runner/README.md lists both legacy and modern functions
- docs/api/agent/runner/functions/ contains markdown for deprecated functions
- docs/api/agent/runner/interfaces/ contains markdown for deprecated types

**External consumers**: ⚠️ Unknown - wreckit is primarily a CLI tool, not a library
- No external consumers identified in research
- If any exist, they would break after this change (documented in CHANGELOG)

### Key Discoveries
- **Test migration required**: Test files are the remaining consumers of deprecated APIs
- **Straightforward removal**: The deprecated implementations are self-contained
- **No logic changes needed**: Modern API already in use in production
- **Documentation regeneration**: Running `bun run docs:api` will update docs after removal
- **Breaking change**: Any external consumers will need migration guidance

### Patterns to Follow
1. **Complete removal pattern** (from Item 066):
   - Migrate test files to modern APIs first
   - Remove deprecated function implementations
   - Remove deprecated type definitions
   - Remove re-exports from index files
   - Update documentation

2. **Test migration pattern**:
   - Replace `runAgent()` with `runAgentUnion()`
   - Replace `getAgentConfig()` with `getAgentConfigUnion()`
   - Replace `AgentConfig` type with `AgentConfigUnion` from schemas
   - Replace `RunAgentOptions` type with `UnionRunAgentOptions`
   - Update test assertions to match modern API behavior

## Desired End State

### Specification
1. **Clean codebase**: No deprecated functions or types exported from src/agent/
2. **Modern API only**: Only `runAgentUnion`, `getAgentConfigUnion`, and related types remain
3. **Updated tests**: All test files use modern APIs exclusively
4. **Updated documentation**: Generated docs show only modern API
5. **CHANGELOG entry**: Documents breaking change with migration guide

### Verification Criteria
- ✅ No `runAgent`, `getAgentConfig`, `AgentConfig`, or `RunAgentOptions` exports in src/agent/
- ✅ All test files import and use `runAgentUnion`, `getAgentConfigUnion`, `AgentConfigUnion`, `UnionRunAgentOptions`
- ✅ `bun test` passes with all tests green
- ✅ `bun run typecheck` passes with no errors
- ✅ `bun run build` succeeds
- ✅ `bun run docs:api` regenerates documentation
- ✅ docs/api/agent/runner/ no longer contains deprecated function/type docs
- ✅ CHANGELOG.md documents breaking change

## What We're NOT Doing
- ❌ Modifying modern API implementations (runAgentUnion, getAgentConfigUnion)
- ❌ Changing AgentConfigUnion schema definitions in src/schemas.ts
- ❌ Updating AGENTS.md or README.md (no references to legacy APIs found)
- ❌ Creating new tests - only migrating existing tests to modern APIs
- ❌ Version bump - will remain at 1.0.0 since this is internal cleanup

## Implementation Approach

The implementation is divided into **4 phases** to ensure safe, incremental progress:

### Phase 1: Update Test Files to Use Modern APIs
**Risk**: Low | **Rollback**: Easy (git revert)

Migrate all test files from legacy APIs to modern APIs. This ensures tests continue to pass after we remove the deprecated implementations.

**Why this phase first**: Tests are the safety net. By migrating them first, we verify the modern API works equivalently to the legacy API, and we prevent test failures when we remove the deprecated code.

---

### Phase 2: Remove Deprecated Implementations
**Risk**: Medium | **Rollback**: Easy (git revert)

Remove the deprecated function implementations and type definitions from src/agent/runner.ts. Tests will still pass because they were migrated in Phase 1.

**Why this phase second**: Once tests are migrated, we can safely remove the deprecated implementations without breaking anything.

---

### Phase 3: Remove Deprecated Re-exports
**Risk**: Low | **Rollback**: Easy (git revert)

Remove the deprecated re-exports from src/agent/index.ts. This completes the removal from the public API surface.

**Why this phase third**: Clean up the module exports to only expose the modern API.

---

### Phase 4: Regenerate Documentation and Update CHANGELOG
**Risk**: Low | **Rollback**: Easy (git revert)

Regenerate the API documentation and add a CHANGELOG entry documenting the breaking change.

**Why this phase last**: Documentation reflects the final state of the code.

---

## Phase 1: Update Test Files to Use Modern APIs

### Overview
Migrate all test files from deprecated legacy APIs to modern discriminated union APIs. This ensures test coverage continues to work after deprecated implementations are removed.

### Changes Required

#### 1. src/__tests__/agent.test.ts
**File**: `/Users/speed/wreckit/src/__tests__/agent.test.ts`
**Changes**: Complete migration from legacy to modern API

**Import changes** (lines 13-18):
```typescript
// OLD (deprecated)
import {
  runAgent,
  getAgentConfig,
  type AgentConfig,
  type RunAgentOptions,
} from "../agent";

// NEW (modern)
import {
  runAgentUnion,
  getAgentConfigUnion,
  type AgentConfigUnion,
  type UnionRunAgentOptions,
} from "../agent";
```

**Describe block "getAgentConfig" → "getAgentConfigUnion"** (lines 32-119):
```typescript
// OLD (deprecated)
describe("getAgentConfig", () => {
  it("converts process kind to legacy mode format", () => {
    const config: ConfigResolved = {
      agent: {
        kind: "process",
        command: "amp",
        args: ["--dangerously-allow-all"],
        completion_signal: "<promise>COMPLETE</promise>",
      },
      max_iterations: 100,
      timeout_seconds: 3600,
      // ... rest of config
    };
    const result = getAgentConfig(config);
    expect(result).toEqual({
      mode: "process",
      command: "amp",
      args: ["--dangerously-allow-all"],
      completion_signal: "<promise>COMPLETE</promise>",
      timeout_seconds: 3600,
      max_iterations: 100,
    });
  });
});

// NEW (modern) - Note: getAgentConfigUnion is now a pass-through
describe("getAgentConfigUnion", () => {
  it("returns process kind config directly", () => {
    const config: ConfigResolved = {
      agent: {
        kind: "process",
        command: "amp",
        args: ["--dangerously-allow-all"],
        completion_signal: "<promise>COMPLETE</promise>",
      },
      max_iterations: 100,
      timeout_seconds: 3600,
      // ... rest of config
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
    expect(result.model).toBeDefined();
    expect(result.max_tokens).toBeDefined();
  });
});
```

**Describe block "runAgent" → "runAgentUnion"** (lines 121-400+):
```typescript
// OLD (deprecated)
describe("runAgent", () => {
  it("successful run with completion signal detected", async () => {
    const config: AgentConfig = {
      mode: "process",
      command: "sh",
      args: ["-c", 'echo "output" && echo "<promise>COMPLETE</promise>"'],
      completion_signal: "<promise>COMPLETE</promise>",
      timeout_seconds: 10,
      max_iterations: 1,
    };

    const options: RunAgentOptions = {
      config,
      cwd: tempDir,
      prompt: "test prompt",
      logger: mockLogger,
    };

    const result = await runAgent(options);
    expect(result.success).toBe(true);
    // ... assertions
  });
});

// NEW (modern)
describe("runAgentUnion", () => {
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
      timeoutSeconds: 10,
    };

    const result = await runAgentUnion(options);
    expect(result.success).toBe(true);
    // ... assertions (unchanged)
  });
});
```

**Key differences in migration**:
- Legacy `AgentConfig` had `mode: "process" | "sdk"` → Modern `AgentConfigUnion` has `kind: "process" | "claude_sdk" | ...`
- Legacy `AgentConfig` included `timeout_seconds` and `max_iterations` → Modern `UnionRunAgentOptions` has `timeoutSeconds` option
- Legacy `runAgent()` auto-fallback from SDK to process → Modern `runAgentUnion()` requires explicit `kind`
- Test assertions remain the same - only setup code changes

**Describe block "runAgent - SDK mode config"** (lines 402-435):
```typescript
// OLD (deprecated)
describe("runAgent - SDK mode config", () => {
  it("claude_sdk kind configuration", () => {
    const config: ConfigResolved = {
      agent: {
        kind: "claude_sdk",
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
      },
      // ...
    };
    const result = getAgentConfig(config);
    expect(result.mode).toBe("sdk");
    expect(result.command).toBe("claude");
    expect(result.timeout_seconds).toBe(3600);
  });
});

// NEW (modern) - No conversion needed, just pass-through
describe("getAgentConfigUnion - claude_sdk kind", () => {
  it("returns claude_sdk config directly", () => {
    const config: ConfigResolved = {
      agent: {
        kind: "claude_sdk",
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
      },
      // ...
    };
    const result = getAgentConfigUnion(config);
    expect(result.kind).toBe("claude_sdk");
    expect(result.model).toBe("claude-sonnet-4-20250514");
    expect(result.max_tokens).toBe(4096);
  });
});
```

---

#### 2. src/__tests__/edge-cases/mock-agent.isospec.ts
**File**: `/Users/speed/wreckit/src/__tests__/edge-cases/mock-agent.isospec.ts`
**Changes**: Migrate from `runAgent` to `runAgentUnion`, update types

**Import changes** (line 5):
```typescript
// OLD (deprecated)
import { runAgent, type AgentConfig, type RunAgentOptions } from "../../agent";

// NEW (modern)
import { runAgentUnion, type AgentConfigUnion, type UnionRunAgentOptions } from "../../agent";
```

**Test migration pattern** (applies to all tests in file):
```typescript
// OLD (deprecated)
describe("Test 19: Basic mock-agent run", () => {
  it("logs simulation message, outputs emoji lines, and includes completion signal", async () => {
    const completionSignal = "<promise>COMPLETE</promise>";
    const config: AgentConfig = {
      mode: "process",
      command: "some-agent",
      args: ["--flag"],
      completion_signal: completionSignal,
      timeout_seconds: 10,
      max_iterations: 1,
    };

    const stdoutChunks: string[] = [];
    const options: RunAgentOptions = {
      config,
      cwd: tempDir,
      prompt: "test prompt",
      logger: mockLogger,
      mockAgent: true,
      onStdoutChunk: (chunk) => stdoutChunks.push(chunk),
    };

    const result = await runAgent(options);
    // assertions...
  });
});

// NEW (modern)
describe("Test 19: Basic mock-agent run", () => {
  it("logs simulation message, outputs emoji lines, and includes completion signal", async () => {
    const completionSignal = "<promise>COMPLETE</promise>";
    const config: AgentConfigUnion = {
      kind: "process",
      command: "some-agent",
      args: ["--flag"],
      completion_signal: completionSignal,
    };

    const stdoutChunks: string[] = [];
    const options: UnionRunAgentOptions = {
      config,
      cwd: tempDir,
      prompt: "test prompt",
      logger: mockLogger,
      mockAgent: true,
      onStdoutChunk: (chunk) => stdoutChunks.push(chunk),
    };

    const result = await runAgentUnion(options);
    // assertions unchanged...
  });
});
```

**Apply this pattern to all tests in the file** (lines 34, 55, 81, 99, 127, 159, 188, 227, 255, 289, 314, 341, 367, 398)

---

#### 3. src/__tests__/edge-cases/dry-run.isospec.ts
**File**: `/Users/speed/wreckit/src/__tests__/edge-cases/dry-run.isospec.ts`
**Changes**: Same migration pattern as mock-agent.isospec.ts

**Import changes**:
```typescript
// OLD (deprecated)
import { runAgent, type AgentConfig, type RunAgentOptions } from "../../agent";

// NEW (modern)
import { runAgentUnion, type AgentConfigUnion, type UnionRunAgentOptions } from "../../agent";
```

**Test migration**: Apply same pattern - change `AgentConfig` to `AgentConfigUnion`, `RunAgentOptions` to `UnionRunAgentOptions`, `runAgent` to `runAgentUnion`, `mode: "process"` to `kind: "process"`, remove `timeout_seconds` and `max_iterations` from config.

**Special case** (line 527): Direct inline call
```typescript
// OLD (deprecated)
await runAgent({
  config: legacyConfig,
  cwd: tempDir,
  prompt: "test",
  logger: mockLogger,
  dryRun: true,
});

// NEW (modern)
await runAgentUnion({
  config: unionConfig,
  cwd: tempDir,
  prompt: "test",
  logger: mockLogger,
  dryRun: true,
});
```

---

#### 4. src/__tests__/edge-cases/errors.isospec.ts
**File**: `/Users/speed/wreckit/src/__tests__/edge-cases/errors.isospec.ts`
**Changes**: Same migration pattern as other isospec files

**Import changes** and **test migrations**: Apply same pattern as mock-agent.isospec.ts and dry-run.isospec.ts (lines 134, 161, 206, 261, 295, 322).

---

### Success Criteria

#### Automated Verification:
- [ ] Tests pass: `bun test` - All tests should pass with modern APIs
- [ ] Type checking passes: `bun run typecheck` - No type errors in migrated tests
- [ ] Linting passes: `bun run lint` - Code formatting is correct

#### Manual Verification:
- [ ] Review test migrations to ensure behavior is preserved
- [ ] Verify no deprecated imports remain in test files
- [ ] Confirm test coverage is equivalent (no tests lost or broken)

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Remove Deprecated Implementations

### Overview
Remove deprecated function implementations and type definitions from src/agent/runner.ts. Tests are now using modern APIs, so removing these implementations won't break anything.

### Changes Required

#### 2.1 Remove deprecated type definitions
**File**: `/Users/speed/wreckit/src/agent/runner.ts`
**Changes**: Delete lines 28-70 (AgentConfig and RunAgentOptions interfaces)

```typescript
// DELETE these lines (28-70):
/**
 * Legacy agent configuration format (mode-based).
 * @deprecated Use AgentConfigUnion (kind-based) instead.
 */
export interface AgentConfig {
  mode: "process" | "sdk";
  command: string;
  args: string[];
  completion_signal: string;
  timeout_seconds: number;
  max_iterations: number;
}

/**
 * Options for running an agent with legacy config format.
 * @deprecated Use UnionRunAgentOptions instead.
 */
export interface RunAgentOptions {
  config: AgentConfig;
  cwd: string;
  prompt: string;
  logger: Logger;
  dryRun?: boolean;
  mockAgent?: boolean;
  onStdoutChunk?: (chunk: string) => void;
  onStderrChunk?: (chunk: string) => void;
  onAgentEvent?: (event: AgentEvent) => void;
  mcpServers?: Record<string, unknown>;
  /** Restrict agent to only specific tools (e.g., MCP tools). Prevents use of Read, Write, Bash, etc. */
  allowedTools?: string[];
}
```

**Keep**: `AgentResult` interface (lines 41-51) - Used by modern API

---

#### 2.2 Remove deprecated getAgentConfig function
**File**: `/Users/speed/wreckit/src/agent/runner.ts`
**Changes**: Delete lines 100-138 (getAgentConfig function and comment block)

```typescript
// DELETE these lines (100-138):
// ============================================================
// Legacy API (Deprecated)
// ============================================================

/**
 * Get legacy agent configuration from resolved config.
 *
 * @deprecated Use `getAgentConfigUnion` and `runAgentUnion` instead.
 * This function converts the new AgentConfigUnion format back to the
 * legacy AgentConfig format for backward compatibility.
 *
 * **Migration path:**
 * - Old: `getAgentConfig(config)` → `AgentConfig` (mode-based)
 * - New: `getAgentConfigUnion(config)` → `AgentConfigUnion` (kind-based)
 *
 * @param config - The resolved wreckit configuration
 * @returns The agent configuration in legacy format (AgentConfig)
 */
export function getAgentConfig(config: ConfigResolved): AgentConfig {
  const agent = config.agent;

  // Convert from new kind-based format to legacy mode-based format
  if (agent.kind === "process") {
    return {
      mode: "process",
      command: agent.command,
      args: agent.args,
      completion_signal: agent.completion_signal,
      timeout_seconds: config.timeout_seconds,
      max_iterations: config.max_iterations,
    };
  }

  // All SDK kinds map to legacy mode: "sdk"
  return {
    mode: "sdk",
    command: "claude",
    args: [],
    completion_signal: "<promise>COMPLETE</promise>",
    timeout_seconds: config.timeout_seconds,
    max_iterations: config.max_iterations,
  };
}
```

---

#### 2.3 Remove simulateMockAgent helper
**File**: `/Users/speed/wreckit/src/agent/runner.ts`
**Changes**: Delete lines 140-170 (simulateMockAgent function)

```typescript
// DELETE these lines (140-170):
async function simulateMockAgent(options: RunAgentOptions, config: AgentConfig): Promise<AgentResult> {
  const mockLines = [
    "🤖 [mock-agent] Starting simulated agent run...",
    "📋 [mock-agent] Analyzing prompt...",
    "🔍 [mock-agent] Researching codebase...",
    "✏️  [mock-agent] Making changes...",
    "✅ [mock-agent] Changes complete!",
    `${config.completion_signal}`,
  ];

  let output = "";
  for (const line of mockLines) {
    const delay = 300 + Math.random() * 400;
    await new Promise((resolve) => setTimeout(resolve, delay));
    const chunk = line + "\n";
    output += chunk;
    if (options.onStdoutChunk) {
      options.onStdoutChunk(chunk);
    } else {
      process.stdout.write(chunk);
    }
  }

  return {
    success: true,
    output,
    timedOut: false,
    exitCode: 0,
    completionDetected: true,
  };
}
```

**Note**: The modern `runAgentUnion` has its own inline mock-agent implementation (lines 367-391) which we keep.

---

#### 2.4 Remove deprecated runAgent function
**File**: `/Users/speed/wreckit/src/agent/runner.ts`
**Changes**: Delete lines 172-256 (runAgent function)

```typescript
// DELETE these lines (172-256):
/**
 * Legacy agent runner for backward compatibility.
 *
 * @deprecated Use `runAgentUnion` instead. This function maintains the old
 * `mode: "process" | "sdk"` API and internally converts to the new union format.
 *
 * **Behavior:**
 * - If `config.mode === "sdk"`: Runs Claude SDK agent with fallback to process on auth error
 * - If `config.mode === "process"`: Runs process-based agent directly
 * - Supports dry-run and mock-agent modes for testing
 *
 * **Migration path:**
 * - Old: `runAgent({ config: legacyConfig, ...options })`
 * - New: `runAgentUnion({ config: unionConfig, ...options })`
 *
 * @param options - Legacy run options with AgentConfig
 * @returns Promise<AgentResult> with execution results
 */
export async function runAgent(options: RunAgentOptions): Promise<AgentResult> {
  const { config, cwd, prompt, logger, dryRun = false, mockAgent = false } = options;

  if (dryRun) {
    const modeLabel = config.mode === "sdk" ? "SDK agent" : `process: ${config.command} ${config.args.join(" ")}`;
    logger.info(`[dry-run] Would run ${modeLabel}`);
    logger.info(`[dry-run] Working directory: ${cwd}`);
    logger.info(`[dry-run] Prompt length: ${prompt.length} characters`);
    return {
      success: true,
      output: "[dry-run] No output",
      timedOut: false,
      exitCode: 0,
      completionDetected: true,
    };
  }

  if (mockAgent) {
    logger.info(`[mock-agent] Simulating agent run...`);
    return simulateMockAgent(options, config);
  }

  // Try SDK mode first
  if (config.mode === "sdk") {
    try {
      const { runClaudeSdkAgent } = await import("./claude-sdk-runner.js");

      // Convert legacy config to ClaudeSdkAgentConfig
      const claudeConfig: ClaudeSdkAgentConfig = {
        kind: "claude_sdk",
        model: "claude-sonnet-4-20250514",
        max_tokens: 8192,
      };

      const result = await runClaudeSdkAgent({
        config: claudeConfig,
        cwd,
        prompt,
        logger,
        dryRun: options.dryRun,
        mockAgent: options.mockAgent,
        onStdoutChunk: options.onStdoutChunk,
        onStderrChunk: options.onStderrChunk,
        onAgentEvent: options.onAgentEvent,
        mcpServers: options.mcpServers,
        allowedTools: options.allowedTools,
        timeoutSeconds: config.timeout_seconds,
      });

      // If SDK fails due to auth, fall back to process mode
      if (!result.success && result.output.includes("Authentication Error")) {
        logger.warn("SDK authentication failed, falling back to process mode");
        return runLegacyProcessAgent(options, { ...config, mode: "process" });
      }

      return result;
    } catch (error) {
      logger.error(`SDK mode failed: ${error}`);
      // Fall back to process mode on any error
      logger.warn("Falling back to process mode");
      return runLegacyProcessAgent(options, { ...config, mode: "process" });
    }
  }

  // Default to process-based execution (existing code)
  return runLegacyProcessAgent(options, config);
}
```

---

#### 2.5 Remove runLegacyProcessAgent helper
**File**: `/Users/speed/wreckit/src/agent/runner.ts`
**Changes**: Delete lines 258-288 (runLegacyProcessAgent function)

```typescript
// DELETE these lines (258-288):
/**
 * Legacy wrapper for process agent execution.
 * Converts legacy AgentConfig to ProcessAgentConfig and calls process-runner module.
 * @deprecated Use process-runner.runProcessAgent with union config instead.
 */
async function runLegacyProcessAgent(options: RunAgentOptions, config: AgentConfig): Promise<AgentResult> {
  const { runProcessAgent } = await import("./process-runner.js");

  // Convert legacy config to ProcessAgentConfig
  const processConfig: ProcessAgentConfig = {
    kind: "process",
    command: config.command,
    args: config.args,
    completion_signal: config.completion_signal,
  };

  return runProcessAgent(processConfig, {
    config: processConfig,
    cwd: options.cwd,
    prompt: options.prompt,
    logger: options.logger,
    dryRun: options.dryRun,
    mockAgent: options.mockAgent,
    onStdoutChunk: options.onStdoutChunk,
    onStderrChunk: options.onStderrChunk,
    onAgentEvent: options.onAgentEvent,
    mcpServers: options.mcpServers,
    allowedTools: options.allowedTools,
    timeoutSeconds: config.timeout_seconds,
  });
}
```

**Result**: File now only contains modern API definitions (AgentResult, getAgentConfigUnion, UnionRunAgentOptions, runAgentUnion)

---

### Success Criteria

#### Automated Verification:
- [ ] Tests pass: `bun test` - All tests should still pass (they use modern APIs now)
- [ ] Type checking passes: `bun run typecheck` - No type errors after removals
- [ ] Build succeeds: `bun run build` - TypeScript compiles successfully

#### Manual Verification:
- [ ] Review src/agent/runner.ts to ensure no legacy code remains
- [ ] Verify no references to removed functions/types exist in source
- [ ] Confirm file structure is clean and well-organized
- [ ] File length reduced by ~160 lines

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Remove Deprecated Re-exports

### Overview
Remove deprecated re-exports from src/agent/index.ts. This completes the removal from the public API surface, leaving only modern API exports.

### Changes Required

#### 3.1 Remove Legacy API section
**File**: `/Users/speed/wreckit/src/agent/index.ts`
**Changes**: Delete lines 22-56 (entire Legacy API section)

```typescript
// DELETE these lines (22-56):
// ============================================================
// Legacy API (Deprecated)
// ============================================================
// These exports are kept for backward compatibility with existing tests.
// They will be removed in a future version.
//
// Migration guide:
// - runAgent → runAgentUnion
// - getAgentConfig → getAgentConfigUnion
// - AgentConfig → AgentConfigUnion (from schemas.ts)
// - RunAgentOptions → UnionRunAgentOptions
//
// The legacy API uses mode-based config ("process" | "sdk") while the new
// API uses kind-based config ("process" | "claude_sdk" | "amp_sdk" |
// "codex_sdk" | "opencode_sdk" | "rlm").

/**
 * @deprecated Use `runAgentUnion` instead.
 */
export { runAgent } from "./runner";

/**
 * @deprecated Use `getAgentConfigUnion` instead.
 */
export { getAgentConfig } from "./runner";

/**
 * @deprecated Use `AgentConfigUnion` from `../schemas` instead.
 */
export type { AgentConfig } from "./runner";

/**
 * @deprecated Use `UnionRunAgentOptions` instead.
 */
export type { RunAgentOptions } from "./runner";
```

---

#### 3.2 Simplify section header (optional cleanup)
**File**: `/Users/speed/wreckit/src/agent/index.ts`
**Changes**: Update lines 1-6 to remove "Preferred" and "New" labels

```typescript
// BEFORE:
// ============================================================
// New API (Preferred)
// ============================================================
// Use these exports for new code. They use the discriminated union format
// (AgentConfigUnion) which is type-safe and supports multiple agent backends.

// AFTER:
// ============================================================
// Agent API
// ============================================================
// Agent execution and lifecycle management using discriminated union format.
// Supports multiple agent backends (process, claude_sdk, amp_sdk, etc.).
```

**Result**: `src/agent/index.ts` exports only modern APIs (runAgentUnion, getAgentConfigUnion, lifecycle functions)

---

### Success Criteria

#### Automated Verification:
- [ ] Tests pass: `bun test` - No regressions
- [ ] Type checking passes: `bun run typecheck` - No import errors
- [ ] Build succeeds: `bun run build` - Exports are correct

#### Manual Verification:
- [ ] Review src/agent/index.ts - Only modern API exports remain
- [ ] Verify no deprecated exports are accessible from the module
- [ ] Confirm module exports are clean and minimal
- [ ] File is concise: Only ~20 lines (down from ~57)

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to Phase 4.

---

## Phase 4: Regenerate Documentation and Update CHANGELOG

### Overview
Regenerate the API documentation to reflect the removal of deprecated APIs, and add a CHANGELOG entry documenting this breaking change.

### Changes Required

#### 4.1 Regenerate API documentation
**Command**: `bun run docs:api`
**Location**: `/Users/speed/wreckit/docs/api/agent/runner/`

This command will:
- Regenerate docs/api/agent/runner/README.md to list only modern functions
- Remove docs/api/agent/runner/functions/getAgentConfig.md
- Remove docs/api/agent/runner/functions/runAgent.md
- Remove docs/api/agent/runner/interfaces/AgentConfig.md
- Remove docs/api/agent/runner/interfaces/RunAgentOptions.md
- Keep docs/api/agent/runner/functions/getAgentConfigUnion.md (unchanged)
- Keep docs/api/agent/runner/functions/runAgentUnion.md (unchanged)
- Keep docs/api/agent/runner/interfaces/AgentResult.md (unchanged)
- Keep docs/api/agent/runner/interfaces/UnionRunAgentOptions.md (unchanged)

**Expected result**: docs/api/agent/runner/README.md should only list:
- Interfaces: AgentResult, UnionRunAgentOptions
- Functions: getAgentConfigUnion, registerSdkController, runAgentUnion, terminateAllAgents, unregisterSdkController

---

#### 4.2 Update CHANGELOG.md
**File**: `/Users/speed/wreckit/docs/changelog.md`
**Changes**: Add entry to [Unreleased] section under "Removed" heading

```markdown
## [Unreleased]

### Removed
- Removed duplicate `idea` CLI command. Use `wreckit ideas` instead.
  - The `idea` command was identical to `ideas` and caused confusion
  - All functionality is preserved in the `ideas` command
  - `ideas` supports file input (`-f`), stdin, and interactive interview mode

+ - Removed deprecated legacy agent APIs (breaking change)
+   - Removed `runAgent()` function - use `runAgentUnion()` instead
+   - Removed `getAgentConfig()` function - use `getAgentConfigUnion()` instead
+   - Removed `AgentConfig` type - use `AgentConfigUnion` from `schemas.ts` instead
+   - Removed `RunAgentOptions` type - use `UnionRunAgentOptions` instead
+   - Removed supporting functions: `simulateMockAgent()`, `runLegacyProcessAgent()`
+   - Legacy mode-based API (`mode: "process" | "sdk"`) replaced by kind-based API (`kind: "process" | "claude_sdk" | "amp_sdk" | "codex_sdk" | "opencode_sdk" | "rlm"`)
+   - All internal code and tests have been migrated to the modern API
+   - **Breaking change**: External consumers importing these functions/types will need to update their code (if any exist)
+
+ **Migration guide for external consumers:**
+
+ If you were using the deprecated APIs directly from the wreckit agent module:
+
+ ```typescript
+ // ❌ Old (removed)
+ import { runAgent, getAgentConfig, AgentConfig } from "wreckit/agent";
+ const config: AgentConfig = getAgentConfig(resolvedConfig);
+ await runAgent({ config, cwd, prompt, logger });
+
+ // ✅ New (current)
+ import { runAgentUnion, getAgentConfigUnion } from "wreckit/agent";
+ import type { AgentConfigUnion } from "wreckit/schemas";
+ const config: AgentConfigUnion = getAgentConfigUnion(resolvedConfig);
+ await runAgentUnion({ config, cwd, prompt, logger });
+ ```
+
+ **Key differences:**
+ - Mode-based (`mode: "process" | "sdk"`) → Kind-based (`kind: "process" | "claude_sdk" | "amp_sdk" | "codex_sdk" | "opencode_sdk" | "rlm"`)
+ - No automatic fallback - explicitly select agent kind via config
+ - Agent config fields simplified - `timeout_seconds` and `max_iterations` moved to top-level `ConfigResolved`
```

---

### Success Criteria

#### Automated Verification:
- [ ] Documentation generation succeeds: `bun run docs:api` - No errors
- [ ] Documentation build succeeds: `bun run docs:build` - Full docs build correctly

#### Manual Verification:
- [ ] Verify docs/api/agent/runner/README.md no longer lists deprecated functions
- [ ] Confirm deprecated function docs are removed from docs/api/agent/runner/functions/
- [ ] Confirm deprecated type docs are removed from docs/api/agent/runner/interfaces/
- [ ] Review CHANGELOG.md to ensure entry is clear and complete
- [ ] Test CLI functionality: `wreckit --help` and `wreckit status` work correctly

**Note**: Complete all automated and manual verification. This is the final phase.

---

## Testing Strategy

### Unit Tests
- **Migrated test suites**: All existing tests are migrated to use modern APIs
- **Test coverage**: No reduction in test coverage - all tests continue to pass
- **Behavior preservation**: Migrated tests verify equivalent behavior

### Integration Tests
- **CLI functionality**: Run `wreckit --help` and `wreckit status` to verify CLI works
- **Agent execution**: Run a simple wreckit workflow with `--dry-run` to verify agent runner works
- **End-to-end**: Run a full workflow (research → plan → implement) to verify no regressions

### Manual Testing Steps
1. **Phase 1 verification**:
   - Run `bun test` - All tests pass
   - Review migrated test files for correctness
   - Verify no deprecated imports remain

2. **Phase 2 verification**:
   - Run `bun test` - Tests still pass (they use modern APIs now)
   - Run `bun run typecheck` - No type errors
   - Review src/agent/runner.ts - No legacy code remains

3. **Phase 3 verification**:
   - Run `bun run build` - Build succeeds
   - Review src/agent/index.ts - Only modern exports remain
   - Verify imports from other files still work

4. **Phase 4 verification**:
   - Run `bun run docs:api` - Docs regenerate successfully
   - Review docs/api/agent/runner/README.md - Only modern APIs listed
   - Review CHANGELOG.md - Entry is clear and complete
   - Run `wreckit --help` - CLI works
   - Run `wreckit status` - Status command works

---

## Migration Notes

### For Internal Code
- **No migration needed**: All production code already uses modern APIs
- **Test migration**: Tests are migrated in Phase 1 to use modern APIs

### For External Consumers (If Any Exist)
If any external tools or packages import from wreckit's `src/agent/` module, they will need to update their code:

**Old API → New API mapping**:

| Legacy (Removed) | Modern (Replacement) |
|------------------|----------------------|
| `runAgent({ config, ... })` | `runAgentUnion({ config, ... })` |
| `getAgentConfig(config)` | `getAgentConfigUnion(config)` |
| `AgentConfig` (mode-based) | `AgentConfigUnion` (kind-based) |
| `RunAgentOptions` | `UnionRunAgentOptions` |

**Key differences**:
- **Mode-based** (`mode: "process" | "sdk"`) → **Kind-based** (`kind: "process" | "claude_sdk" | "amp_sdk" | "codex_sdk" | "opencode_sdk" | "rlm"`)
- Legacy `runAgent()` had automatic fallback from SDK to process mode → Modern `runAgentUnion()` requires explicit `kind` selection
- Legacy `AgentConfig` had fields like `timeout_seconds`, `max_iterations` → These are now in `UnionRunAgentOptions.timeoutSeconds`

**Example migration**:
```typescript
// ❌ Old (removed)
import { runAgent, getAgentConfig, AgentConfig } from "wreckit/agent";
const config: AgentConfig = getAgentConfig(resolvedConfig);
await runAgent({ config, cwd, prompt, logger });

// ✅ New (current)
import { runAgentUnion, getAgentConfigUnion } from "wreckit/agent";
import type { AgentConfigUnion } from "wreckit/schemas";
const config: AgentConfigUnion = getAgentConfigUnion(resolvedConfig);
await runAgentUnion({ config, cwd, prompt, logger });
```

**Note**: wreckit is primarily a CLI tool, not a library. External consumers are unlikely, but if they exist, this CHANGELOG entry provides migration guidance.

---

## References

### Research
- `/Users/speed/wreckit/.wreckit/items/069-dreamer-remove-deprecated-legacy-agent-apis/research.md`

### Key Source Files
- `/Users/speed/wreckit/src/agent/runner.ts` - Deprecated implementations (lines 28-288)
- `/Users/speed/wreckit/src/agent/index.ts` - Deprecated re-exports (lines 22-56)

### Test Files to Migrate
- `/Users/speed/wreckit/src/__tests__/agent.test.ts` - Main test suite
- `/Users/speed/wreckit/src/__tests__/edge-cases/mock-agent.isospec.ts` - Mock agent tests
- `/Users/speed/wreckit/src/__tests__/edge-cases/dry-run.isospec.ts` - Dry-run tests
- `/Users/speed/wreckit/src/__tests__/edge-cases/errors.isospec.ts` - Error handling tests

### Documentation
- `/Users/speed/wreckit/docs/api/agent/runner/` - Generated API docs
- `/Users/speed/wreckit/docs/changelog.md` - CHANGELOG to update

### Related Items
- Item 066 (dogfood-rlm-comprehensive-refactor) - Noted these deprecations
