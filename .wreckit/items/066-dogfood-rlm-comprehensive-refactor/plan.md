# Dogfood RLM: Comprehensive Refactor of Agent Runner Implementation Plan

## Overview

This implementation plan uses the newly implemented Recursive Language Model (RLM) mode to perform a comprehensive refactor of `src/agent/runner.ts` and related files. The goal is to prove RLM's ability to handle large contexts (the entire agent module) and perform complex architectural improvements that standard agents struggle with.

The refactor will extract the dispatcher logic from `runner.ts` into a dedicated module, simplify the type system by removing legacy compatibility layers where safe, and improve code organization while maintaining backward compatibility with existing SDK runners.

The current `runner.ts` file contains 512 lines with multiple mixed responsibilities: process-based agent execution, legacy SDK support, new discriminated union dispatch system, and lifecycle management. This refactor will extract these concerns into focused modules while maintaining backward compatibility with existing tests.

## Current State Analysis

### Existing Implementation Structure

The agent module currently has these responsibilities mixed together in `runner.ts`:

1. **Lifecycle Management** (lines 7-54):
   - Global registries: `activeSdkControllers`, `activeProcessAgents`
   - Functions: `registerSdkController()`, `unregisterSdkController()`, `terminateAllAgents()`
   - These are exported and used by all SDK runners

2. **Legacy Configuration System** (lines 56-126):
   - `AgentConfig` interface with `mode: "process" | "sdk"`
   - `getAgentConfig()` converts union format to legacy format
   - Used by test suite (15+ test files reference these)

3. **Legacy Runner** (lines 160-317):
   - `runAgent()` with SDK-to-process fallback logic
   - `runProcessAgent()` handling ChildProcess spawn, timeout, stdout/stderr capture
   - `simulateMockAgent()` for testing

4. **New Dispatch System** (lines 319-511):
   - `runAgentUnion()` - discriminated union dispatcher
   - `UnionRunAgentOptions` interface
   - Switch statement on `config.kind` (6 agent kinds)

### Current SDK Runner Patterns

**Legacy Pattern** (`claude-sdk-runner.ts`):
- Accepts `RunAgentOptions` with legacy `AgentConfig`
- Uses `config.timeout_seconds`, `config.max_iterations`
- Import: `import type { AgentConfig, AgentResult, RunAgentOptions } from "./runner.js"`

**Modern Pattern** (`amp-sdk-runner.ts`, `rlm-runner.ts`):
- Accepts union config directly: `config: AmpSdkAgentConfig` or `config: RlmSdkAgentConfig`
- Define their own options interface with config property
- No conversion from legacy format

### Key Integration Points

1. **Workflow System** (`itemWorkflow.ts:39`):
   - Imports `runAgentUnion` and `getAgentConfigUnion`
   - Uses new API exclusively

2. **Test Suite** (`agent.test.ts` and isospec tests):
   - Imports legacy API: `runAgent`, `getAgentConfig`, `AgentConfig`, `RunAgentOptions`
   - 30+ test cases rely on legacy exports
   - **Must maintain backward compatibility**

3. **Public API** (`agent/index.ts`):
   - Exports both new (preferred) and legacy (deprecated) APIs
   - Clear separation with `@deprecated` comments
   - **Must not break existing exports**

### Constraints Discovered

1. **Backward Compatibility Required**: Tests import legacy API from `../agent` barrel export
2. **Lifecycle Management Used Everywhere**: All SDK runners call `registerSdkController()`
3. **Claude SDK Runner Still Uses Legacy**: Has conversion code from union to legacy
4. **Process Agent Runner Used Directly**: Called by `runAgentUnion()` with legacy conversion

### Key Discoveries

- **No external usages**: Grep search found 0 references to `runAgent()` or `getAgentConfig()` outside test files
- **Tests are the constraint**: All backward compatibility requirements stem from `src/__tests__/`
- **Mixed patterns**: Some SDK runners use modern pattern (amp, rlm), others use legacy (claude)
- **Conversion overhead**: `runAgentUnion()` converts process/claude cases back to legacy format

## Desired End State

### Architecture Goals

1. **Single Responsibility**: Each module handles one concern
   - `dispatcher.ts` - Pure dispatch logic based on agent kind
   - `lifecycle.ts` - Agent lifecycle management (register/unregister/terminate)
   - `runner.ts` - Thin wrapper maintaining backward compatibility

2. **No Legacy Conversion in Dispatch**: SDK runners accept union configs directly
3. **Type Safety**: Use `AgentConfigUnion` throughout, not legacy `AgentConfig`
4. **Preserved Test Coverage**: All existing tests pass without modification
5. **Clear Migration Path**: New code uses union API, legacy API deprecated but functional

### Module Structure

```
src/agent/
├── index.ts              # Public API (new + legacy exports)
├── runner.ts             # Legacy API wrappers (deprecated)
├── dispatcher.ts         # NEW: Pure dispatch function
├── lifecycle.ts          # NEW: Lifecycle management
├── process-runner.ts     # NEW: Extracted process agent logic
├── claude-sdk-runner.ts  # Updated to accept union config
├── amp-sdk-runner.ts     # No change (already modern)
├── codex-sdk-runner.ts   # No change (already modern)
├── opencode-sdk-runner.ts # No change (already modern)
├── rlm-runner.ts         # No change (already modern)
└── ...
```

### Verification Criteria

1. **Automated**:
   - `bun test` - All tests pass (agent.test.ts + isospec tests)
   - `bun run typecheck` - No type errors
   - All agent kinds work: process, claude_sdk, amp_sdk, codex_sdk, opencode_sdk, rlm

2. **Manual**:
   - RLM agent successfully performs the refactor using RLM mode
   - No regressions in workflow execution
   - MCP integration still functional
   - Lifecycle management (cleanup on exit) works

## What We're NOT Doing

- **Removing Legacy API**: Tests depend on it; keep as `@deprecated` wrappers
- **Changing Public Exports**: `src/agent/index.ts` exports must remain unchanged
- **Modifying SDK Runners** (except claude-sdk-runner): amp, codex, opencode, rlm are already modern
- **Breaking Test Suite**: All 30+ test cases must pass without modification
- **Changing Configuration Schema**: `AgentConfigUnion` in `schemas.ts` stays the same
- **Altering Workflow System**: `itemWorkflow.ts` already uses new API, no changes needed

## Implementation Approach

### High-Level Strategy

1. **Incremental Extraction**: Create new modules without modifying existing code first
2. **Backward Compatibility First**: Keep legacy exports working throughout
3. **Single Change Per File**: Each file modified in a separate, testable phase
4. **Test After Each Phase**: Run `bun test` after each phase to catch regressions early
5. **RLM as Execution Engine**: Use RLM mode to perform the refactor (dogfooding)

### Phase Ordering

1. **Phase 1**: Extract lifecycle functions (no behavior change, pure move)
2. **Phase 2**: Extract process runner (no behavior change, pure move)
3. **Phase 3**: Update claude-sdk-runner (remove legacy conversion)
4. **Phase 4**: Simplify dispatch logic (remove conversion overhead)
5. **Phase 5**: Documentation and cleanup

Each phase is independently testable and reversible.

---

## Phase 1: Extract Lifecycle Management

### Overview
Extract agent lifecycle management functions from `runner.ts` into a dedicated `lifecycle.ts` module. This isolates cleanup/cancellation logic and makes `runner.ts` smaller.

### Changes Required

#### 1. Create `src/agent/lifecycle.ts`

**File**: `src/agent/lifecycle.ts` (NEW)
**Changes**: New file containing lifecycle management functions

```typescript
import { spawn, type ChildProcess } from "node:child_process";
import type { Logger } from "../logging";

// Registry for cleanup on exit - tracks both SDK AbortControllers and process ChildProcesses
const activeSdkControllers = new Set<AbortController>();
const activeProcessAgents = new Set<ChildProcess>();

export function registerSdkController(controller: AbortController): void {
  activeSdkControllers.add(controller);
}

export function unregisterSdkController(controller: AbortController): void {
  activeSdkControllers.delete(controller);
}

export function registerProcessAgent(child: ChildProcess): void {
  activeProcessAgents.add(child);
}

export function unregisterProcessAgent(child: ChildProcess): void {
  activeProcessAgents.delete(child);
}

export function terminateAllAgents(logger?: Logger): void {
  // Abort all SDK agents
  for (const controller of [...activeSdkControllers]) {
    logger?.debug?.("Aborting SDK agent");
    try {
      controller.abort();
    } catch {
      // ignore
    }
  }
  activeSdkControllers.clear();

  // Kill all process-based agents (fallback mode)
  for (const child of [...activeProcessAgents]) {
    if (!child || child.killed) continue;
    logger?.debug?.(`Terminating agent process pid=${child.pid}`);

    try {
      child.kill("SIGTERM");
    } catch {
      // ignore
    }

    setTimeout(() => {
      if (child && !child.killed) {
        logger?.debug?.(`Force-killing agent process pid=${child.pid}`);
        try {
          child.kill("SIGKILL");
        } catch {
          // ignore
        }
      }
    }, 5000);
  }
  activeProcessAgents.clear();
}
```

**Rationale**: Pure extraction of existing code (lines 7-54 from runner.ts). Added `registerProcessAgent`/`unregisterProcessAgent` for consistency.

#### 2. Update `src/agent/runner.ts`

**File**: `src/agent/runner.ts`
**Changes**: Import lifecycle functions, delete original code

```typescript
// DELETE lines 7-54 (lifecycle code)
// ADD at top of file:
export {
  registerSdkController,
  unregisterSdkController,
  terminateAllAgents,
} from "./lifecycle.js";
```

**Rationale**: Re-export lifecycle functions to maintain public API. No behavior change.

#### 3. Update SDK Runners

**Files**: `claude-sdk-runner.ts`, `amp-sdk-runner.ts`, `rlm-runner.ts`, etc.
**Changes**: Update import path

```typescript
// BEFORE:
import { registerSdkController, unregisterSdkController } from "./runner.js";

// AFTER:
import { registerSdkController, unregisterSdkController } from "./lifecycle.js";
```

**Rationale**: Update import paths to new module. No functional change.

#### 4. Update `src/agent/index.ts`

**File**: `src/agent/index.ts`
**Changes**: Export lifecycle functions

```typescript
// ADD to new API exports section:
export {
  registerSdkController,
  unregisterSdkController,
  terminateAllAgents,
} from "./lifecycle";
```

**Rationale**: Maintain public API exports from new location.

### Success Criteria

#### Automated Verification:
- [ ] Tests pass: `bun test src/__tests__/agent.test.ts`
- [ ] Type checking passes: `bun run typecheck`
- [ ] No import errors in SDK runners
- [ ] Lifecycle functions still accessible from `src/agent` barrel export

#### Manual Verification:
- [ ] Lifecycle management still works (process cleanup on exit)
- [ ] No regressions in SDK agent execution
- [ ] Test suite unchanged (all tests pass without modification)

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Extract Process Runner

### Overview
Extract the process-based agent execution logic from `runner.ts` into a dedicated `process-runner.ts` module. This isolates ChildProcess spawning and lifecycle management.

### Changes Required

#### 1. Create `src/agent/process-runner.ts`

**File**: `src/agent/process-runner.ts` (NEW)
**Changes**: New file containing process agent execution logic

```typescript
import { spawn, type ChildProcess } from "node:child_process";
import type { Logger } from "../logging";
import type { AgentEvent } from "../tui/agentEvents";
import type { ProcessAgentConfig } from "../schemas";
import type { AgentResult } from "./runner";
import { registerProcessAgent, unregisterProcessAgent } from "./lifecycle.js";

export interface ProcessRunnerOptions {
  config: ProcessAgentConfig;
  cwd: string;
  prompt: string;
  logger: Logger;
  onStdoutChunk?: (chunk: string) => void;
  onStderrChunk?: (chunk: string) => void;
  onAgentEvent?: (event: AgentEvent) => void;
  mcpServers?: Record<string, unknown>;
  allowedTools?: string[];
  timeoutSeconds?: number;
}

export async function runProcessAgent(
  config: ProcessAgentConfig,
  options: ProcessRunnerOptions
): Promise<AgentResult> {
  const { cwd, prompt, logger } = options;
  const timeoutSeconds = options.timeoutSeconds ?? 3600;

  return new Promise((resolve) => {
    let output = "";
    let timedOut = false;
    let completionDetected = false;
    let child: ChildProcess;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      child = spawn(config.command, config.args, {
        cwd,
        stdio: ["pipe", "pipe", "pipe"],
      });
      if (!child) {
        throw new Error("spawn returned undefined");
      }
      registerProcessAgent(child);
    } catch (err) {
      logger.error(`Failed to spawn agent: ${err}`);
      resolve({
        success: false,
        output: `Failed to spawn agent: ${err}`,
        timedOut: false,
        exitCode: null,
        completionDetected: false,
      });
      return;
    }

    if (timeoutSeconds > 0) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        logger.warn(`Agent timed out after ${timeoutSeconds} seconds`);
        try {
          child.kill("SIGTERM");
        } catch {
          // ignore
        }
        setTimeout(() => {
          if (!child.killed) {
            try {
              child.kill("SIGKILL");
            } catch {
              // ignore
            }
          }
        }, 5000);
      }, timeoutSeconds * 1000);
    }

    child.stdout?.on("data", (data: Buffer) => {
      const chunk = data.toString();
      output += chunk;
      if (options.onStdoutChunk) {
        options.onStdoutChunk(chunk);
      } else {
        process.stdout.write(chunk);
      }
      if (output.includes(config.completion_signal)) {
        completionDetected = true;
      }
    });

    child.stderr?.on("data", (data: Buffer) => {
      const chunk = data.toString();
      output += chunk;
      if (options.onStderrChunk) {
        options.onStderrChunk(chunk);
      } else {
        process.stderr.write(chunk);
      }
      if (output.includes(config.completion_signal)) {
        completionDetected = true;
      }
    });

    child.on("error", (err) => {
      unregisterProcessAgent(child);
      if (timeoutId) clearTimeout(timeoutId);
      logger.error(`Agent process error: ${err}`);
      resolve({
        success: false,
        output: output + `\nProcess error: ${err}`,
        timedOut: false,
        exitCode: null,
        completionDetected: false,
      });
    });

    child.on("close", (code) => {
      unregisterProcessAgent(child);
      if (timeoutId) clearTimeout(timeoutId);
      const success = code === 0 && completionDetected;
      logger.debug(`Agent exited with code ${code}, completion detected: ${completionDetected}`);
      resolve({
        success,
        output,
        timedOut,
        exitCode: code,
        completionDetected,
      });
    });

    if (child.stdin) {
      child.stdin.write(prompt);
      child.stdin.end();
    }
  });
}
```

**Rationale**: Pure extraction of process runner logic (lines 207-317 from runner.ts). Uses lifecycle module for registration.

#### 2. Update `src/agent/runner.ts`

**File**: `src/agent/runner.ts`
**Changes**: Delete `runProcessAgent`, update imports

```typescript
// DELETE lines 207-317 (runProcessAgent function)
// Legacy runAgent can now use process-runner module
```

**Rationale**: Process logic moved to dedicated module. Legacy `runAgent()` will be updated in Phase 4.

### Success Criteria

#### Automated Verification:
- [ ] Tests pass: `bun test src/__tests__/agent.test.ts`
- [ ] Type checking passes: `bun run typecheck`
- [ ] Process agent execution works correctly
- [ ] Timeout handling works
- [ ] Process cleanup on exit works

#### Manual Verification:
- [ ] Process-based agent still works (e.g., `amp --agent process run 001`)
- [ ] Process agents terminate on exit
- [ ] Completion signal detection works

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Update Claude SDK Runner

### Overview
Update `claude-sdk-runner.ts` to accept `ClaudeSdkAgentConfig` directly instead of legacy `AgentConfig`. This removes the conversion layer and standardizes on the union format.

### Changes Required

#### 1. Update `src/agent/claude-sdk-runner.ts`

**File**: `src/agent/claude-sdk-runner.ts`
**Changes**: Accept union config, remove legacy parameters

```typescript
// BEFORE:
import type { AgentConfig, AgentResult, RunAgentOptions } from "./runner.js";
export async function runClaudeSdkAgent(options: RunAgentOptions, config: AgentConfig): Promise<AgentResult> {
  const { cwd, prompt, logger, onStdoutChunk, onStderrChunk, onAgentEvent } = options;
  // Uses config.timeout_seconds, config.max_iterations

// AFTER:
import type { Logger } from "../logging";
import type { AgentResult } from "./runner";
import { registerSdkController, unregisterSdkController } from "./lifecycle.js";
import type { AgentEvent } from "../tui/agentEvents";
import type { ClaudeSdkAgentConfig } from "../schemas";
import { buildSdkEnv } from "./env.js";

export interface ClaudeRunAgentOptions {
  config: ClaudeSdkAgentConfig;
  cwd: string;
  prompt: string;
  logger: Logger;
  dryRun?: boolean;
  onStdoutChunk?: (chunk: string) => void;
  onStderrChunk?: (chunk: string) => void;
  onAgentEvent?: (event: AgentEvent) => void;
  mcpServers?: Record<string, unknown>;
  allowedTools?: string[];
  timeoutSeconds?: number;
}

export async function runClaudeSdkAgent(options: ClaudeRunAgentOptions): Promise<AgentResult> {
  const { config, cwd, prompt, logger, onStdoutChunk, onStderrChunk, onAgentEvent } = options;
  const timeoutSeconds = options.timeoutSeconds ?? 3600;

  // Update timeout logic to use timeoutSeconds instead of config.timeout_seconds
  if (timeoutSeconds > 0) {
    timeoutId = setTimeout(() => {
      timedOut = true;
      logger.warn(`SDK agent timed out after ${timeoutSeconds} seconds`);
      abortController.abort();
    }, timeoutSeconds * 1000);
  }
```

**Rationale**: Standardize on union config pattern (same as amp, rlm runners). Remove legacy conversion.

### Success Criteria

#### Automated Verification:
- [ ] Tests pass: `bun test src/__tests__/agent.test.ts`
- [ ] Type checking passes: `bun run typecheck`
- [ ] Claude SDK agent execution works correctly
- [ ] No type errors in dispatcher integration

#### Manual Verification:
- [ ] Claude SDK agent still works (e.g., `wreckit --agent claude_sdk run 001`)
- [ ] Timeout handling works
- [ ] MCP integration still works

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to Phase 4.

---

## Phase 4: Simplify Dispatch Logic

### Overview
Remove the conversion overhead in the dispatch system. The dispatcher should pass union configs directly to all runners, eliminating the wasteful union → legacy → union conversion.

### Changes Required

#### 1. Update Dispatch Logic in `src/agent/runner.ts`

**File**: `src/agent/runner.ts`
**Changes**: Remove conversion in `process` and `claude_sdk` cases

```typescript
// Lines 389-413 - Process case (before)
case "process": {
  const legacyConfig: AgentConfig = { /* conversion */ };
  const legacyOptions: RunAgentOptions = { /* conversion */ };
  return runProcessAgent(legacyOptions);
}

// Lines 389-398 - Process case (after)
case "process": {
  const { runProcessAgent } = await import("./process-runner.js");
  return runProcessAgent(config, {
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
    timeoutSeconds: options.timeoutSeconds,
  });
}

// Lines 416-440 - Claude SDK case (before)
case "claude_sdk": {
  const legacyConfig: AgentConfig = { /* conversion */ };
  const legacyOptions: RunAgentOptions = { /* conversion */ };
  return runClaudeSdkAgent(legacyOptions, legacyConfig);
}

// Lines 416-432 - Claude SDK case (after)
case "claude_sdk": {
  const { runClaudeSdkAgent } = await import("./claude-sdk-runner.js");
  return runClaudeSdkAgent({
    config,
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
    timeoutSeconds: options.timeoutSeconds,
  });
}
```

#### 2. Update Legacy `runAgent()` Wrapper

**File**: `src/agent/runner.ts`
**Changes**: Keep legacy API working by calling new dispatch

```typescript
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

  // Convert legacy config to union format and dispatch
  const agent = config.mode === "sdk"
    ? { kind: "claude_sdk" as const, model: "claude-sonnet-4-20250514", max_tokens: 4096 }
    : {
        kind: "process" as const,
        command: config.command,
        args: config.args,
        completion_signal: config.completion_signal
      };

  return runAgentUnion({
    config: agent,
    cwd,
    prompt,
    logger,
    dryRun,
    mockAgent,
    timeoutSeconds: config.timeout_seconds,
    onStdoutChunk: options.onStdoutChunk,
    onStderrChunk: options.onStderrChunk,
    onAgentEvent: options.onAgentEvent,
    mcpServers: options.mcpServers,
    allowedTools: options.allowedTools,
  });
}
```

**Rationale**: Legacy API now uses new dispatch system internally. No behavior change for tests.

### Success Criteria

#### Automated Verification:
- [ ] All tests pass: `bun test` (especially agent.test.ts)
- [ ] Type checking passes: `bun run typecheck`
- [ ] No conversion logic in dispatch switch statement
- [ ] Claude SDK runner accepts union config directly

#### Manual Verification:
- [ ] Claude SDK agent works: `wreckit --agent claude_sdk run 001`
- [ ] Process agent works: `wreckit --agent process run 001`
- [ ] Legacy tests still pass (runAgent with legacy config)
- [ ] Mock-agent mode works with all agent kinds

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to Phase 5.

---

## Phase 5: Documentation and Cleanup

### Overview
Update comments, add deprecation notices, and ensure the code is self-documenting. This phase ensures future developers understand the module boundaries and migration path.

### Changes Required

#### 1. Update `src/agent/runner.ts` Comments

**File**: `src/agent/runner.ts`
**Changes**: Add clear section headers, document what's legacy vs new

```typescript
// ============================================================
// Type Definitions
// ============================================================

export interface AgentConfig { /* ... */ }
export interface AgentResult { /* ... */ }
export interface RunAgentOptions { /* ... */ }
export interface UnionRunAgentOptions { /* ... */ }

// ============================================================
// New API (Preferred)
// ============================================================

/**
 * Get agent configuration in union format from resolved config.
 */
export function getAgentConfigUnion(config: ConfigResolved): AgentConfigUnion {
  return config.agent;
}

/**
 * Run an agent using the discriminated union config.
 * This is the preferred dispatch system supporting 6 agent backends.
 */
export async function runAgentUnion(options: UnionRunAgentOptions): Promise<AgentResult> {
  // ...
}

// ============================================================
// Legacy API (Deprecated)
// ============================================================

/**
 * Legacy config converter for backward compatibility.
 * @deprecated Use getAgentConfigUnion instead.
 */
export function getAgentConfig(config: ConfigResolved): AgentConfig {
  // ...
}

/**
 * Legacy agent runner for backward compatibility.
 * @deprecated Use runAgentUnion instead.
 */
export async function runAgent(options: RunAgentOptions): Promise<AgentResult> {
  // ...
}
```

#### 2. Add Module Documentation

**Files**: `src/agent/{lifecycle,process-runner}.ts`
**Changes**: Add JSDoc comments to all exported functions

```typescript
// lifecycle.ts
/**
 * Register an SDK agent's AbortController for cleanup on process exit.
 * Called by each SDK runner when an agent starts.
 */
export function registerSdkController(controller: AbortController): void {
  // ...
}

/**
 * Unregister an SDK agent's AbortController after normal completion.
 * Called by each SDK runner in their finally block.
 */
export function unregisterSdkController(controller: AbortController): void {
  // ...
}

// process-runner.ts
/**
 * Run a process-based agent using the command specified in config.
 * This is the fallback mode when SDK agents are unavailable or fail.
 *
 * Handles process spawning, timeout enforcement, stdout/stderr capture,
 * and completion signal detection.
 */
export async function runProcessAgent(
  config: ProcessAgentConfig,
  options: ProcessRunnerOptions
): Promise<AgentResult> {
  // ...
}
```

### Success Criteria

#### Automated Verification:
- [ ] No documentation build errors
- [ ] All exports are documented
- [ ] Deprecation notices are present

#### Manual Verification:
- [ ] Code is self-documenting (clear names, obvious purpose)
- [ ] New developers can understand module boundaries
- [ ] Legacy vs new API distinction is clear

**Note**: This is the final phase. Complete all verification and document results.

---

## Testing Strategy

### Unit Tests

**Existing Tests** (No modifications needed):
- `src/__tests__/agent.test.ts` - Tests legacy API (getAgentConfig, runAgent)
- `src/__tests__/edge-cases/mock-agent.isospec.ts` - Mock agent tests
- `src/__tests__/edge-cases/errors.isospec.ts` - Error handling tests

**New Test Coverage** (Optional additions):
- Test dispatcher directly with each agent kind
- Test lifecycle module registration/cleanup
- Test process runner timeout handling

### Integration Tests

**End-to-End Scenarios**:
1. **Process Agent**: Run wreckit with `--agent process` on a simple item
2. **Claude SDK**: Run wreckit with `--agent claude_sdk` on a simple item
3. **RLM Agent**: Run wreckit with `--rlm` on item 066 (this refactor)
4. **Full Workflow**: Run complete workflow (research → plan → implement → pr) with RLM

### Manual Testing Steps

1. **Verify All Agent Kinds**:
   ```bash
   wreckit --agent process run 001
   wreckit --agent claude_sdk run 001
   wreckit --agent amp_sdk run 001
   wreckit --agent codex_sdk run 001
   wreckit --agent opencode_sdk run 001
   wreckit --rlm run 001
   ```

2. **Verify Workflow Integration**:
   ```bash
   wreckit run 066 --rlm
   ```
   Should successfully complete all phases using RLM agent.

3. **Verify Lifecycle Management**:
   - Start agent, then Ctrl+C
   - Verify all processes terminate
   - Verify all SDK agents abort

4. **Verify MCP Integration**:
   - Run wreckit with wreckit MCP server
   - Verify agent can capture PRD via MCP tools

## Migration Notes

### For Codebase Maintainers

**No migration needed** - This refactor maintains backward compatibility:
- Legacy API (`runAgent`, `getAgentConfig`) still works
- Tests continue to pass without modification
- Public API exports unchanged

**Recommended for new code**:
- Use `runAgentUnion` instead of `runAgent`
- Use `getAgentConfigUnion` instead of `getAgentConfig`
- Use `AgentConfigUnion` instead of `AgentConfig`

### For External Consumers (if any)

**Current Status**: No external consumers identified (grep found 0 references)

**Future Migration Path** (if consumers exist):
1. Update imports: `runAgent` → `runAgentUnion`
2. Update config: `AgentConfig` → `AgentConfigUnion`
3. Update options: `RunAgentOptions` → `UnionRunAgentOptions`
4. Remove usage of `mode` field, use `kind` instead

## References

**Research Document**:
- `/Users/speed/wreckit/.wreckit/items/066-dogfood-rlm-comprehensive-refactor/research.md`

**Key Source Files**:
- `src/agent/runner.ts:1-512` - Current monolithic runner
- `src/agent/index.ts:1-23` - Public API exports
- `src/schemas.ts:33-79` - Agent configuration types
- `src/workflow/itemWorkflow.ts:39` - Workflow integration
- `src/__tests__/agent.test.ts:1-428` - Test suite

**SDK Runners**:
- `src/agent/claude-sdk-runner.ts:1-301` - Claude SDK (legacy pattern)
- `src/agent/amp-sdk-runner.ts:1-90` - Amp SDK (modern pattern)
- `src/agent/codex-sdk-runner.ts:1-94` - Codex SDK (modern pattern)
- `src/agent/opencode-sdk-runner.ts:1-110` - OpenCode SDK (modern pattern)
- `src/agent/rlm-runner.ts:1-233` - RLM mode (modern pattern)

**Related Work**:
- Item 064: Phase 4 - Discriminated Union Agent Configuration
- Item 065: RLM Mode Implementation
