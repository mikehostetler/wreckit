# Refactor runner.ts to adopt runAgentUnion pattern Implementation Plan

## Overview

This refactoring consolidates the codebase's agent execution logic from a legacy `runAgent()` pattern using `mode: "process" | "sdk"` to the newer `runAgentUnion()` pattern using discriminated union types (`kind: "process" | "claude_sdk" | "amp_sdk" | "codex_sdk" | "opencode_sdk"`). The new pattern provides better type safety, exhaustive matching, and extensibility for future agent backends.

## Current State Analysis

The codebase has **two parallel dispatch systems** coexisting:

### Legacy System (to be removed)
- **`runAgent()`** (`src/agent/runner.ts:130-175`): Uses `AgentConfig` with `mode: "process" | "sdk"`
- **`AgentConfig`** (`src/agent/runner.ts:55-62`): Interface with `mode`, `command`, `args`, `completion_signal`, `timeout_seconds`, `max_iterations`
- **`RunAgentOptions`** (`src/agent/runner.ts:72-85`): Options interface with `config: AgentConfig`, `mcpServers`, `allowedTools`, etc.
- **`getAgentConfig()`** (`src/agent/runner.ts:87-96`): Extracts `AgentConfig` from `ConfigResolved`

### New System (to adopt)
- **`runAgentUnion()`** (`src/agent/runner.ts:318-454`): Uses discriminated union with `kind` discriminant
- **`AgentConfigUnion`** (`src/schemas.ts:155-161`): Discriminated union of `ProcessAgentSchema`, `ClaudeSdkAgentSchema`, etc.
- **`UnionRunAgentOptions`** (`src/agent/runner.ts:295-308`): Options interface with `config: AgentConfigUnion`

### Key Discoveries:

1. **`UnionRunAgentOptions` is missing `mcpServers`** (`src/agent/runner.ts:295-308`): The workflow phases `plan` and `implement` require passing MCP servers for structured data capture (PRD, story updates). The union options don't include this field.

2. **`ConfigResolved.agent` uses legacy structure** (`src/config.ts:28-33`): The configuration system uses `mode: "process" | "sdk"` instead of `kind`-based discriminated unions.

3. **`runAgentUnion` internally bridges to legacy code** (`src/agent/runner.ts:362-380, 386-406`): For both `process` and `claude_sdk` cases, the union function converts back to `AgentConfig` and calls `runProcessAgent` or `runClaudeSdkAgent` with legacy options.

4. **Six call sites need migration**:
   - `src/workflow/itemWorkflow.ts:222` (research phase)
   - `src/workflow/itemWorkflow.ts:370` (plan phase)
   - `src/workflow/itemWorkflow.ts:538` (implement phase - mockAgent path)
   - `src/workflow/itemWorkflow.ts:611` (implement phase - main loop)
   - `src/workflow/itemWorkflow.ts:1097` (PR phase)
   - `src/domain/ideas-agent.ts:60` (ideas parsing)

5. **Tests mock `runAgent` directly** (`src/__tests__/workflow.test.ts:21-24`): The workflow tests use `mock.module` to mock `runAgent`, which needs to be updated.

## Desired End State

After refactoring:

1. **Single dispatch system**: Only `runAgentUnion()` exists; `runAgent()`, `AgentConfig`, `RunAgentOptions`, and `getAgentConfig()` are removed
2. **Configuration uses union types**: `ConfigResolved.agent` is typed as `AgentConfigUnion`
3. **`UnionRunAgentOptions` is complete**: Includes `mcpServers` and `onAgentEvent` fields
4. **SDK runners use union types natively**: No bridging to legacy types inside `runAgentUnion`
5. **Tests use new pattern**: All test mocks updated to use `runAgentUnion`
6. **Exports updated**: `src/agent/index.ts` exports `runAgentUnion` and union types

### Verification:
- All tests pass: `npm test`
- Type checking passes: `npm run typecheck`
- Build succeeds: `npm run build`
- `wreckit bench` shows no regression (manual verification)

## What We're NOT Doing

1. **NOT implementing new SDK runners**: The stub implementations for `amp_sdk`, `codex_sdk`, `opencode_sdk` remain as stubs returning error results
2. **NOT changing configuration file format**: Users' existing `config.json` files will continue to work via schema migration
3. **NOT refactoring prompt templates or MCP servers**: These remain unchanged
4. **NOT adding new agent backends**: This is purely consolidation of existing patterns
5. **NOT changing the CLI interface**: Commands remain the same

## Implementation Approach

We take an **incremental migration** approach to minimize risk:

1. **Phase 1**: Enhance `UnionRunAgentOptions` to include all fields needed by workflow
2. **Phase 2**: Update config schema and `ConfigResolved` to support `AgentConfigUnion`
3. **Phase 3**: Create a helper that converts from config to union config
4. **Phase 4**: Migrate call sites one by one, running tests after each
5. **Phase 5**: Update tests to mock the new function
6. **Phase 6**: Remove legacy code and update exports

---

## Phase 1: Enhance UnionRunAgentOptions

### Overview
Add the missing `mcpServers` and `onAgentEvent` fields to `UnionRunAgentOptions` so it's a complete superset of the legacy `RunAgentOptions`.

### Changes Required:

#### 1. Update UnionRunAgentOptions interface
**File**: `src/agent/runner.ts`
**Lines**: 295-308

Add `mcpServers` field to match `RunAgentOptions`:

```typescript
export interface UnionRunAgentOptions {
  config: AgentConfigUnion;
  cwd: string;
  prompt: string;
  logger: Logger;
  dryRun?: boolean;
  mockAgent?: boolean;
  timeoutSeconds?: number;
  onStdoutChunk?: (chunk: string) => void;
  onStderrChunk?: (chunk: string) => void;
  onAgentEvent?: (event: AgentEvent) => void;
  /** MCP servers to make available to the agent (e.g., wreckit server for PRD capture) */
  mcpServers?: Record<string, unknown>;
  /** Restrict agent to only specific tools (e.g., MCP tools). Prevents use of Read, Write, Bash, etc. */
  allowedTools?: string[];
}
```

#### 2. Pass mcpServers through runAgentUnion
**File**: `src/agent/runner.ts`
**Lines**: 359-454

Update the switch cases to pass `mcpServers` to the SDK runners:

For `claude_sdk` case (around line 395):
```typescript
const legacyOptions: RunAgentOptions = {
  config: legacyConfig,
  cwd: options.cwd,
  prompt: options.prompt,
  logger: options.logger,
  dryRun: options.dryRun,
  mockAgent: options.mockAgent,
  onStdoutChunk: options.onStdoutChunk,
  onStderrChunk: options.onStderrChunk,
  onAgentEvent: options.onAgentEvent,
  allowedTools: options.allowedTools,
  mcpServers: options.mcpServers,  // ADD THIS LINE
};
```

For `process` case (around line 370):
```typescript
const legacyOptions: RunAgentOptions = {
  config: legacyConfig,
  cwd: options.cwd,
  prompt: options.prompt,
  logger: options.logger,
  dryRun: options.dryRun,
  mockAgent: options.mockAgent,
  onStdoutChunk: options.onStdoutChunk,
  onStderrChunk: options.onStderrChunk,
  onAgentEvent: options.onAgentEvent,
  allowedTools: options.allowedTools,
  mcpServers: options.mcpServers,  // ADD THIS LINE
};
```

### Success Criteria:

#### Automated Verification:
- [ ] Type checking passes: `npm run typecheck`
- [ ] Tests pass: `npm test`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] Review that `UnionRunAgentOptions` now has all fields from `RunAgentOptions`

---

## Phase 2: Update Configuration Schema

### Overview
Update `ConfigResolved.agent` to use `AgentConfigUnion` instead of the legacy inline type. Add schema migration to support both old (`mode`) and new (`kind`) formats.

### Changes Required:

#### 1. Update ConfigSchema to accept both formats
**File**: `src/schemas.ts`
**Lines**: 36-42

Create a backward-compatible schema that accepts both old and new format:

```typescript
// Legacy agent config (mode-based) - for backwards compatibility
export const LegacyAgentConfigSchema = z.object({
  mode: AgentModeSchema,
  command: z.string(),
  args: z.array(z.string()),
  completion_signal: z.string(),
});

// Config schema accepts either format
export const ConfigSchema = z.object({
  schema_version: z.number().default(1),
  base_branch: z.string().default("main"),
  branch_prefix: z.string().default("wreckit/"),
  merge_mode: MergeModeSchema.default("pr"),
  agent: z.union([LegacyAgentConfigSchema, AgentConfigUnionSchema]),
  max_iterations: z.number().default(100),
  timeout_seconds: z.number().default(3600),
  pr_checks: PrChecksSchema.optional(),
  branch_cleanup: BranchCleanupSchema.optional(),
});
```

#### 2. Update ConfigResolved interface
**File**: `src/config.ts`
**Lines**: 23-38

Change the agent type to `AgentConfigUnion`:

```typescript
import type { AgentConfigUnion } from "./schemas";

export interface ConfigResolved {
  schema_version: number;
  base_branch: string;
  branch_prefix: string;
  merge_mode: "pr" | "direct";
  agent: AgentConfigUnion;
  max_iterations: number;
  timeout_seconds: number;
  pr_checks: PrChecksResolved;
  branch_cleanup: BranchCleanupResolved;
}
```

#### 3. Update DEFAULT_CONFIG
**File**: `src/config.ts`
**Lines**: 50-74

Change to use the new format:

```typescript
export const DEFAULT_CONFIG: ConfigResolved = {
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
```

#### 4. Add migration helper in mergeWithDefaults
**File**: `src/config.ts`
**Lines**: 76-116

Add logic to convert legacy `mode`-based config to `kind`-based:

```typescript
function migrateAgentConfig(agent: any): AgentConfigUnion {
  // If already using kind, return as-is
  if (agent && "kind" in agent) {
    return agent as AgentConfigUnion;
  }

  // Migrate from mode to kind
  if (agent && "mode" in agent) {
    if (agent.mode === "sdk") {
      return {
        kind: "claude_sdk",
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
      };
    } else {
      return {
        kind: "process",
        command: agent.command,
        args: agent.args ?? [],
        completion_signal: agent.completion_signal,
      };
    }
  }

  // Default
  return DEFAULT_CONFIG.agent;
}

export function mergeWithDefaults(partial: Partial<Config>): ConfigResolved {
  const agent = migrateAgentConfig(partial.agent);
  // ... rest of mergeWithDefaults
}
```

#### 5. Update applyOverrides
**File**: `src/config.ts`
**Lines**: 118-139

Update to handle the new agent structure. The overrides system primarily supports process mode command/args:

```typescript
export function applyOverrides(
  config: ConfigResolved,
  overrides: ConfigOverrides
): ConfigResolved {
  let agent = config.agent;

  // Apply overrides only if they're specified and agent is process type
  if (agent.kind === "process") {
    agent = {
      ...agent,
      command: overrides.agentCommand ?? agent.command,
      args: overrides.agentArgs ?? agent.args,
      completion_signal: overrides.completionSignal ?? agent.completion_signal,
    };
  }

  return {
    schema_version: config.schema_version,
    base_branch: overrides.baseBranch ?? config.base_branch,
    branch_prefix: overrides.branchPrefix ?? config.branch_prefix,
    merge_mode: config.merge_mode,
    agent,
    max_iterations: overrides.maxIterations ?? config.max_iterations,
    timeout_seconds: overrides.timeoutSeconds ?? config.timeout_seconds,
    pr_checks: config.pr_checks,
    branch_cleanup: config.branch_cleanup,
  };
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Type checking passes: `npm run typecheck`
- [ ] Tests pass: `npm test`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] Verify existing config files with `mode: "sdk"` still work
- [ ] Verify existing config files with `mode: "process"` still work

---

## Phase 3: Create getAgentConfigUnion Helper

### Overview
Create a new helper function that converts from `ConfigResolved` to `AgentConfigUnion`. This allows gradual migration of call sites.

### Changes Required:

#### 1. Add getAgentConfigUnion function
**File**: `src/agent/runner.ts`

Add after the existing `getAgentConfig` function (around line 96):

```typescript
/**
 * Get agent configuration in union format from resolved config.
 * This is the new helper that replaces getAgentConfig.
 */
export function getAgentConfigUnion(config: ConfigResolved): AgentConfigUnion {
  return config.agent;
}
```

#### 2. Export from agent/index.ts
**File**: `src/agent/index.ts`

Add to exports:

```typescript
export {
  runAgent,
  runAgentUnion,
  getAgentConfig,
  getAgentConfigUnion,
  terminateAllAgents,
  registerSdkController,
  unregisterSdkController,
  type AgentConfig,
  type AgentResult,
  type RunAgentOptions,
  type UnionRunAgentOptions,
} from "./runner";
```

### Success Criteria:

#### Automated Verification:
- [ ] Type checking passes: `npm run typecheck`
- [ ] Tests pass: `npm test`
- [ ] Build succeeds: `npm run build`

---

## Phase 4: Migrate Workflow Call Sites

### Overview
Replace each `runAgent()` call with `runAgentUnion()` in the workflow module. Do this incrementally, testing after each change.

### Changes Required:

#### 1. Update imports in itemWorkflow.ts
**File**: `src/workflow/itemWorkflow.ts`
**Line**: 33

Change:
```typescript
import { runAgent, getAgentConfig } from "../agent/runner";
```

To:
```typescript
import { runAgentUnion, getAgentConfigUnion } from "../agent/runner";
```

#### 2. Update buildPromptVariables helper
**File**: `src/workflow/itemWorkflow.ts`
**Lines**: 158-166

The `sdk_mode` variable needs updating. With the new config, check for `kind`:

```typescript
return {
  // ... other fields
  sdk_mode: config.agent.kind === "claude_sdk",
  // ... other fields
};
```

#### 3. Migrate runPhaseResearch
**File**: `src/workflow/itemWorkflow.ts`
**Lines**: 215-234

Change:
```typescript
const agentConfig = getAgentConfig(config);

const result = await runAgent({
  config: agentConfig,
  cwd: itemDir,
  prompt,
  logger,
  dryRun,
  mockAgent,
  onStdoutChunk: onAgentOutput,
  onStderrChunk: onAgentOutput,
  onAgentEvent,
  allowedTools: getAllowedToolsForPhase("research"),
});
```

To:
```typescript
const agentConfig = getAgentConfigUnion(config);

const result = await runAgentUnion({
  config: agentConfig,
  cwd: itemDir,
  prompt,
  logger,
  dryRun,
  mockAgent,
  timeoutSeconds: config.timeout_seconds,
  onStdoutChunk: onAgentOutput,
  onStderrChunk: onAgentOutput,
  onAgentEvent,
  allowedTools: getAllowedToolsForPhase("research"),
});
```

#### 4. Migrate runPhasePlan
**File**: `src/workflow/itemWorkflow.ts`
**Lines**: 354-383

Similar changes, adding `mcpServers`:

```typescript
const agentConfig = getAgentConfigUnion(config);

const result = await runAgentUnion({
  config: agentConfig,
  cwd: itemDir,
  prompt,
  logger,
  dryRun,
  mockAgent,
  timeoutSeconds: config.timeout_seconds,
  onStdoutChunk: onAgentOutput,
  onStderrChunk: onAgentOutput,
  onAgentEvent,
  mcpServers: { wreckit: wreckitServer },
  allowedTools: getAllowedToolsForPhase("plan"),
});
```

#### 5. Migrate runPhaseImplement (mockAgent path)
**File**: `src/workflow/itemWorkflow.ts`
**Lines**: 534-551

```typescript
const agentConfig = getAgentConfigUnion(config);
await runAgentUnion({
  config: agentConfig,
  cwd: itemDir,
  prompt,
  logger,
  dryRun,
  mockAgent,
  timeoutSeconds: config.timeout_seconds,
  onStdoutChunk: onAgentOutput,
  onStderrChunk: onAgentOutput,
  onAgentEvent,
  allowedTools: getAllowedToolsForPhase("implement"),
});
```

#### 6. Migrate runPhaseImplement (main loop)
**File**: `src/workflow/itemWorkflow.ts`
**Lines**: 609-624

```typescript
const agentConfig = getAgentConfigUnion(config);
const result = await runAgentUnion({
  config: agentConfig,
  cwd: itemDir,
  prompt,
  logger,
  dryRun,
  mockAgent,
  timeoutSeconds: config.timeout_seconds,
  onStdoutChunk: onAgentOutput,
  onStderrChunk: onAgentOutput,
  onAgentEvent,
  mcpServers: { wreckit: wreckitServer },
  allowedTools: getAllowedToolsForPhase("implement"),
});
```

#### 7. Migrate runPhasePr
**File**: `src/workflow/itemWorkflow.ts`
**Lines**: 1096-1109

```typescript
const agentConfig = getAgentConfigUnion(config);
const result = await runAgentUnion({
  config: agentConfig,
  cwd: itemDir,
  prompt,
  logger,
  dryRun: false,
  mockAgent,
  timeoutSeconds: config.timeout_seconds,
  onStdoutChunk: onAgentOutput,
  onStderrChunk: onAgentOutput,
  onAgentEvent,
  allowedTools: getAllowedToolsForPhase("pr"),
});
```

### Success Criteria:

#### Automated Verification:
- [ ] Type checking passes: `npm run typecheck`
- [ ] Tests pass: `npm test`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] Run a simple workflow phase manually to verify it works

---

## Phase 5: Migrate ideas-agent.ts

### Overview
Update the ideas agent module to use the new pattern.

### Changes Required:

#### 1. Update imports
**File**: `src/domain/ideas-agent.ts`
**Line**: 1

Change:
```typescript
import { runAgent, getAgentConfig } from "../agent/runner";
```

To:
```typescript
import { runAgentUnion, getAgentConfigUnion } from "../agent/runner";
```

#### 2. Update parseIdeasWithAgent
**File**: `src/domain/ideas-agent.ts`
**Lines**: 44-86

Change:
```typescript
const config = getAgentConfig(resolvedConfig);
// ...
const result = await runAgent({
  cwd: root,
  prompt,
  config,
  logger,
  mcpServers: { wreckit: ideasServer },
  allowedTools: ["mcp__wreckit__save_parsed_ideas"],
  mockAgent: options.mockAgent,
  // ... callbacks
});
```

To:
```typescript
const config = getAgentConfigUnion(resolvedConfig);
// ...
const result = await runAgentUnion({
  config,
  cwd: root,
  prompt,
  logger,
  timeoutSeconds: resolvedConfig.timeout_seconds,
  mcpServers: { wreckit: ideasServer },
  allowedTools: ["mcp__wreckit__save_parsed_ideas"],
  mockAgent: options.mockAgent,
  // ... callbacks
});
```

### Success Criteria:

#### Automated Verification:
- [ ] Type checking passes: `npm run typecheck`
- [ ] Tests pass: `npm test`
- [ ] Build succeeds: `npm run build`

---

## Phase 6: Update Tests

### Overview
Update test files to use the new function names and types in mocks.

### Changes Required:

#### 1. Update workflow.test.ts mocks
**File**: `src/__tests__/workflow.test.ts`
**Lines**: 12-24

Change:
```typescript
const mockedRunAgent = vi.fn();
const mockedGetAgentConfig = vi.fn((config: ConfigResolved) => ({
  command: config.agent.command,
  args: config.agent.args,
  completion_signal: config.agent.completion_signal,
  timeout_seconds: config.timeout_seconds,
  max_iterations: config.max_iterations,
}));

mock.module("../agent/runner", () => ({
  runAgent: mockedRunAgent,
  getAgentConfig: mockedGetAgentConfig,
}));
```

To:
```typescript
const mockedRunAgentUnion = vi.fn();
const mockedGetAgentConfigUnion = vi.fn((config: ConfigResolved) => config.agent);

mock.module("../agent/runner", () => ({
  runAgentUnion: mockedRunAgentUnion,
  getAgentConfigUnion: mockedGetAgentConfigUnion,
}));
```

Also update all references from `mockedRunAgent` to `mockedRunAgentUnion` throughout the file.

#### 2. Update createTestConfig helper
**File**: `src/__tests__/workflow.test.ts`
**Lines**: 135-161

Update the agent config to use new format:

```typescript
function createTestConfig(): ConfigResolved {
  return {
    schema_version: 1,
    base_branch: "main",
    branch_prefix: "wreckit/",
    agent: {
      kind: "claude_sdk",
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
    },
    max_iterations: 10,
    timeout_seconds: 60,
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
}
```

#### 3. Update agent.test.ts
**File**: `src/__tests__/agent.test.ts`
**Lines**: 5-11

Update imports and add tests for new functions:

```typescript
import {
  runAgent,
  runAgentUnion,
  getAgentConfig,
  getAgentConfigUnion,
  type AgentConfig,
  type RunAgentOptions,
  type UnionRunAgentOptions,
} from "../agent";
```

Add a new test section for `getAgentConfigUnion`:

```typescript
describe("getAgentConfigUnion", () => {
  it("returns agent config directly from ConfigResolved", () => {
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
      pr_checks: { /* ... */ },
      branch_cleanup: { /* ... */ },
    };

    const result = getAgentConfigUnion(config);

    expect(result.kind).toBe("claude_sdk");
    expect((result as any).model).toBe("claude-sonnet-4-20250514");
  });
});
```

#### 4. Update ideas-agent.test.ts test config
**File**: `src/__tests__/ideas-agent.test.ts`
**Lines**: 31-44

Update the test config to use new format:

```typescript
await fs.writeFile(
  path.join(baseDir, ".wreckit", "config.json"),
  JSON.stringify({
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
  })
);
```

### Success Criteria:

#### Automated Verification:
- [ ] Type checking passes: `npm run typecheck`
- [ ] All tests pass: `npm test`
- [ ] Build succeeds: `npm run build`

---

## Phase 7: Cleanup Legacy Code

### Overview
Remove legacy functions, types, and exports that are no longer used.

### Changes Required:

#### 1. Remove legacy code from runner.ts
**File**: `src/agent/runner.ts`

Remove:
- `AgentConfig` interface (lines 55-62)
- `RunAgentOptions` interface (lines 72-85) - Keep `AgentResult` as it's used by both
- `getAgentConfig` function (lines 87-96)
- `simulateMockAgent` function (lines 98-128)
- `runAgent` function (lines 130-175)
- `runProcessAgent` overload signature that takes `RunAgentOptions` without config param

Keep:
- `runProcessAgent` function (used internally by `runAgentUnion`)
- `AgentResult` interface (used by both systems)

#### 2. Update exports in agent/index.ts
**File**: `src/agent/index.ts`

Change:
```typescript
export {
  runAgent,
  runAgentUnion,
  getAgentConfig,
  getAgentConfigUnion,
  terminateAllAgents,
  registerSdkController,
  unregisterSdkController,
  type AgentConfig,
  type AgentResult,
  type RunAgentOptions,
  type UnionRunAgentOptions,
} from "./runner";
```

To:
```typescript
export {
  runAgentUnion,
  getAgentConfigUnion,
  terminateAllAgents,
  registerSdkController,
  unregisterSdkController,
  type AgentResult,
  type UnionRunAgentOptions,
} from "./runner";
```

#### 3. Update claude-sdk-runner.ts imports
**File**: `src/agent/claude-sdk-runner.ts`
**Line**: 3

The SDK runner currently imports legacy types. Update to use union types or keep internal helper types.

### Success Criteria:

#### Automated Verification:
- [ ] Type checking passes: `npm run typecheck`
- [ ] All tests pass: `npm test`
- [ ] Build succeeds: `npm run build`
- [ ] No unused exports warning

#### Manual Verification:
- [ ] Run `wreckit bench` to verify no regression (if benchmark data available)
- [ ] Run a complete workflow manually

---

## Testing Strategy

### Unit Tests:
- Test `getAgentConfigUnion` returns the correct config for various input types
- Test `runAgentUnion` handles all `kind` values correctly in dry-run mode
- Test config migration from legacy `mode` to new `kind` format

### Integration Tests:
- Workflow tests already cover the integration of agent runner with workflow phases
- These should pass after updating mocks

### Manual Testing Steps:
1. Run `wreckit init` to create a fresh project
2. Create a test item with `wreckit add`
3. Run `wreckit run <item-id> --phase research --mock-agent`
4. Verify the phase completes successfully
5. If benchmark data exists, run `wreckit bench` and compare results

## Migration Notes

### For Users:
- Existing `config.json` files with `mode: "process"` or `mode: "sdk"` will continue to work
- The migration happens transparently when the config is loaded
- Users can optionally update their config to use the new `kind` format:

**Old format:**
```json
{
  "agent": {
    "mode": "sdk",
    "command": "claude",
    "args": [],
    "completion_signal": "<promise>COMPLETE</promise>"
  }
}
```

**New format:**
```json
{
  "agent": {
    "kind": "claude_sdk",
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 4096
  }
}
```

Or for process mode:
```json
{
  "agent": {
    "kind": "process",
    "command": "amp",
    "args": ["--dangerously-allow-all"],
    "completion_signal": "<promise>COMPLETE</promise>"
  }
}
```

## References
- Research: `/Users/speed/wreckit/.wreckit/items/006-refactor-runnerts-to-adopt-runagentunion-pattern/research.md`
- Legacy runAgent: `src/agent/runner.ts:130-175`
- New runAgentUnion: `src/agent/runner.ts:318-454`
- Config schema: `src/schemas.ts:31-46`
- Workflow call sites: `src/workflow/itemWorkflow.ts`
- Ideas agent: `src/domain/ideas-agent.ts`
- Tests: `src/__tests__/workflow.test.ts`, `src/__tests__/agent.test.ts`
