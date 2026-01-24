# Research: Refactor runner.ts to adopt runAgentUnion pattern

**Date**: 2026-01-24
**Item**: 006-refactor-runnerts-to-adopt-runagentunion-pattern

## Research Question
The codebase has legacy runAgent logic that needs to be replaced with the runAgentUnion pattern.

**Motivation:** Consolidate agent running logic under a single pattern, removing legacy code.

**Success criteria:**
- Tests pass
- wreckit bench shows no regression

## Summary

The codebase currently has two parallel agent dispatch systems in `src/agent/runner.ts`:

1. **Legacy `runAgent()`** (lines 130-175): Uses the old `AgentConfig` interface with `mode: "process" | "sdk"` for determining which agent backend to use. This is the function currently used throughout the workflow.

2. **New `runAgentUnion()`** (lines 318-454): Uses a discriminated union type `AgentConfigUnion` with `kind: "process" | "claude_sdk" | "amp_sdk" | "codex_sdk" | "opencode_sdk"`. This provides a more extensible and type-safe dispatch mechanism.

The refactoring requires:
1. Updating the configuration system (`ConfigResolved`) to use the new `AgentConfigUnion` type instead of the legacy `mode: "process" | "sdk"` pattern
2. Replacing all `runAgent()` calls with `runAgentUnion()` calls
3. Updating `getAgentConfig()` to return `AgentConfigUnion` instead of `AgentConfig`
4. Updating tests to use the new pattern
5. Removing the legacy `runAgent()`, `AgentConfig`, and `RunAgentOptions` after migration

## Current State Analysis

### Existing Implementation

The runner.ts file contains both patterns side-by-side:

**Legacy AgentConfig** (`src/agent/runner.ts:55-62`):
```typescript
export interface AgentConfig {
  mode: "process" | "sdk";
  command: string;
  args: string[];
  completion_signal: string;
  timeout_seconds: number;
  max_iterations: number;
}
```

**New AgentConfigUnion** (`src/schemas.ts:155-161`):
```typescript
export const AgentConfigUnionSchema = z.discriminatedUnion("kind", [
  ProcessAgentSchema,
  ClaudeSdkAgentSchema,
  AmpSdkAgentSchema,
  CodexSdkAgentSchema,
  OpenCodeSdkAgentSchema,
]);
```

### Key Files

**Runner module:**
- `src/agent/runner.ts:130-175` - Legacy `runAgent()` function
- `src/agent/runner.ts:318-454` - New `runAgentUnion()` function
- `src/agent/runner.ts:55-62` - Legacy `AgentConfig` interface
- `src/agent/runner.ts:72-85` - Legacy `RunAgentOptions` interface
- `src/agent/runner.ts:293-308` - New `UnionRunAgentOptions` interface
- `src/agent/runner.ts:87-96` - `getAgentConfig()` function (returns legacy type)

**Agent exports:**
- `src/agent/index.ts:1-11` - Currently exports legacy types only, does NOT export `runAgentUnion`

**Configuration:**
- `src/config.ts:23-38` - `ConfigResolved` interface uses legacy agent structure
- `src/config.ts:50-74` - `DEFAULT_CONFIG` uses legacy agent config
- `src/schemas.ts:36-42` - `ConfigSchema.agent` uses legacy mode/command/args pattern

**Workflow call sites (all use legacy `runAgent`):**
- `src/workflow/itemWorkflow.ts:33` - imports `runAgent, getAgentConfig`
- `src/workflow/itemWorkflow.ts:222` - research phase
- `src/workflow/itemWorkflow.ts:370` - plan phase
- `src/workflow/itemWorkflow.ts:538` - implement phase (mockAgent path)
- `src/workflow/itemWorkflow.ts:611` - implement phase (main loop)
- `src/workflow/itemWorkflow.ts:1097` - PR phase (description generation)

**Ideas ingestion:**
- `src/domain/ideas-agent.ts:1` - imports `runAgent, getAgentConfig`
- `src/domain/ideas-agent.ts:60` - calls `runAgent()`

**SDK runners (used by runAgentUnion):**
- `src/agent/claude-sdk-runner.ts` - Claude SDK implementation (fully implemented)
- `src/agent/amp-sdk-runner.ts` - Amp SDK implementation (stub, returns error)
- `src/agent/codex-sdk-runner.ts` - Codex SDK implementation (stub)
- `src/agent/opencode-sdk-runner.ts` - OpenCode SDK implementation (stub)

**Tests:**
- `src/__tests__/agent.test.ts:6-9` - imports `runAgent, getAgentConfig, AgentConfig, RunAgentOptions`
- `src/__tests__/workflow.test.ts:21-24` - mocks `runAgent` and `getAgentConfig`
- `src/__tests__/edge-cases/dry-run.isospec.ts:27-28` - imports `runAgent`
- `src/__tests__/edge-cases/mock-agent.isospec.ts` - uses `runAgent`
- `src/__tests__/edge-cases/errors.isospec.ts` - uses `runAgent`

### Integration Points

1. **runAgentUnion internally uses runProcessAgent** (`src/agent/runner.ts:361-381`): The union function delegates to the existing `runProcessAgent()` helper for process mode, which is also used by legacy `runAgent()`.

2. **runAgentUnion uses runClaudeSdkAgent** (`src/agent/runner.ts:384-406`): Same SDK runner used by legacy `runAgent()`.

3. **Configuration bridging in runAgentUnion** (`src/agent/runner.ts:362-380`): Currently converts `AgentConfigUnion` to legacy `AgentConfig` for process/claude_sdk backends. This bridge code can be removed once SDK runners are updated to take union types directly.

## Technical Considerations

### Dependencies

**External dependencies:**
- `@anthropic-ai/claude-agent-sdk` - Used by `claude-sdk-runner.ts`
- No new dependencies required

**Internal modules that need updates:**
- `src/config.ts` - Update `ConfigResolved.agent` to use `AgentConfigUnion`
- `src/schemas.ts` - Already has union schemas defined
- `src/agent/index.ts` - Export `runAgentUnion` and `UnionRunAgentOptions`
- `src/workflow/itemWorkflow.ts` - Replace all `runAgent` calls
- `src/domain/ideas-agent.ts` - Replace `runAgent` call
- All test files - Update to use new pattern

### Patterns to Follow

1. **Discriminated Union Pattern** (`src/schemas.ts:155-161`): Use `kind` as the discriminant property for exhaustive matching.

2. **Exhaustive Check** (`src/agent/runner.ts:310-312`):
```typescript
function exhaustiveCheck(x: never): never {
  throw new Error(`Unhandled agent kind: ${JSON.stringify(x)}`);
}
```

3. **Options interface migration**: `UnionRunAgentOptions` (`src/agent/runner.ts:295-308`) differs from `RunAgentOptions`:
   - Uses `config: AgentConfigUnion` instead of `config: AgentConfig`
   - Adds optional `timeoutSeconds?: number` (moved from config to options)
   - Does not include `mcpServers` (needs to be added for workflow compatibility)

### Migration Steps

1. **Phase 1: Update UnionRunAgentOptions**
   - Add `mcpServers` field to `UnionRunAgentOptions` to match `RunAgentOptions`
   - This is required for plan/implement phases that pass MCP servers

2. **Phase 2: Update Configuration Schema**
   - Modify `ConfigSchema.agent` to use `AgentConfigUnionSchema`
   - Update `ConfigResolved.agent` type in config.ts
   - Update `DEFAULT_CONFIG` to use new union format

3. **Phase 3: Create migration helper**
   - Create `getAgentConfigUnion()` that returns `AgentConfigUnion`
   - Temporarily keep `getAgentConfig()` for backwards compatibility

4. **Phase 4: Migrate workflow call sites**
   - Update each `runAgent()` call to `runAgentUnion()` one at a time
   - Pass `timeoutSeconds` from config to options

5. **Phase 5: Migrate ideas-agent**
   - Update `parseIdeasWithAgent()` to use `runAgentUnion()`

6. **Phase 6: Update tests**
   - Update test files to use new types and functions
   - Update mocks in `workflow.test.ts`

7. **Phase 7: Cleanup**
   - Remove legacy `runAgent()` function
   - Remove legacy `AgentConfig` and `RunAgentOptions` interfaces
   - Remove legacy `getAgentConfig()` function
   - Update exports in `src/agent/index.ts`

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking workflow during migration | High | Migrate call sites one at a time with tests between each |
| Test failures from mock mismatches | Medium | Update mocks in workflow.test.ts first before touching workflow code |
| Missing MCP server support in UnionRunAgentOptions | High | Add mcpServers field to UnionRunAgentOptions before starting migration |
| Config schema backwards incompatibility | High | Use zod union that accepts both old and new format during transition |
| SDK runner stubs not handling all options | Medium | Ensure amp/codex/opencode runners handle allowedTools and phase options |

## Recommended Approach

1. **Start with UnionRunAgentOptions enhancement**: Add the `mcpServers` field to `UnionRunAgentOptions` since workflow phases depend on this.

2. **Update SDK runners first**: Ensure all SDK runners (`amp-sdk-runner.ts`, `codex-sdk-runner.ts`, `opencode-sdk-runner.ts`) properly pass through all options including `mcpServers` and `allowedTools`.

3. **Add getAgentConfigUnion()**: Create the new helper function alongside the existing `getAgentConfig()` for a gradual migration.

4. **Migrate workflow call sites incrementally**: Update one phase at a time (research, plan, implement, pr) and run tests after each.

5. **Update config schema last**: The configuration schema change affects the most files and should be done after the runtime code is stable with the new pattern.

6. **Clean up**: Remove legacy code only after all tests pass with the new implementation.

## Open Questions

1. **Should we support both config formats during transition?** The current config schema uses `mode: "process" | "sdk"` while the new pattern uses `kind`. We could add a zod union that accepts both formats and transforms the old format to the new one.

2. **What should happen to non-implemented SDK runners?** Currently `amp_sdk`, `codex_sdk`, and `opencode_sdk` return errors. Should they continue to do so, or should they fall back to process mode?

3. **Should timeoutSeconds move to options or stay in config?** The current `runAgentUnion` takes `timeoutSeconds` as an option, but `runAgent` gets it from config. We should standardize.

4. **How to handle the completion_signal for SDK backends?** SDK backends don't use `completion_signal` the same way process mode does. Should this be optional in the union types?
