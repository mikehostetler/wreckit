# Research: Implement tool allowlist enforcement in `src/agent/opencode-sdk-runner.ts`

**Date**: 2025-01-24
**Item**: 028-implement-tool-allowlist-enforcement-in-srcagentop

## Research Question
From milestone [M2] Finish Experimental SDK Integrations

**Motivation:** Strategic milestone: Finish Experimental SDK Integrations

## Summary

The `src/agent/opencode-sdk-runner.ts` file (lines 1-85) already has complete **scaffolding** for tool allowlist enforcement but lacks actual SDK implementation. The file currently returns a "not yet implemented" error for all real executions (lines 76-84). The `getEffectiveToolAllowlist()` helper function is already defined (lines 35-48) and correctly prioritizes explicit `allowedTools`, then phase-based allowlists from `toolAllowlist.ts`, then falls back to no restrictions.

This item depends on items 026 (Amp SDK) and 027 (Codex SDK), both of which have been **completed**. The completed implementations in `amp-sdk-runner.ts` and `codex-sdk-runner.ts` provide the exact pattern to follow: they use the existing `@anthropic-ai/claude-agent-sdk` package with the SDK's `tools` option for allowlist enforcement. The "OpenCode SDK" integration follows the same approach - using the Claude Agent SDK infrastructure with the `tools` option to restrict available tools per phase.

The implementation is straightforward: copy the core logic from the completed `amp-sdk-runner.ts` (which itself mirrors `claude-sdk-runner.ts`), adapt the function signatures and types for `OpenCodeRunAgentOptions`, and ensure tool allowlist enforcement works correctly via the SDK's `tools` option. The default timeout is 3600 seconds (1 hour).

## Current State Analysis

### Existing Implementation

The `opencode-sdk-runner.ts` file contains:

| Component | Status | Location |
|-----------|--------|----------|
| `OpenCodeRunAgentOptions` interface | Complete | `opencode-sdk-runner.ts:7-22` |
| `getEffectiveToolAllowlist()` function | Complete | `opencode-sdk-runner.ts:35-48` |
| Dry-run support | Complete | `opencode-sdk-runner.ts:55-68` |
| Effective tools logging stub | Complete | `opencode-sdk-runner.ts:71-74` |
| Actual SDK execution | **TODO stub** | `opencode-sdk-runner.ts:76-84` |

**Current stub behavior (lines 76-84):**
```typescript
logger.error("OpenCode SDK runner not yet implemented");
return {
  success: false,
  output: "OpenCode SDK runner is not yet implemented. Use process mode or claude_sdk instead.",
  timedOut: false,
  exitCode: 1,
  completionDetected: false,
};
```

**Existing `getEffectiveToolAllowlist()` (lines 35-48):**
```typescript
function getEffectiveToolAllowlist(options: OpenCodeRunAgentOptions): string[] | undefined {
  // Explicit allowedTools takes precedence
  if (options.allowedTools !== undefined) {
    return options.allowedTools;
  }
  // Fall back to phase-based allowlist if phase is specified
  if (options.phase) {
    return getAllowedToolsForPhase(options.phase);
  }
  // No restrictions
  return undefined;
}
```

### Key Files

| File | Description |
|------|-------------|
| `src/agent/opencode-sdk-runner.ts:1-85` | **Target file** - has scaffolding but no real implementation |
| `src/agent/amp-sdk-runner.ts:1-372` | **Primary reference** - completed item 026, shows exact pattern to follow |
| `src/agent/codex-sdk-runner.ts:1-372` | **Secondary reference** - completed item 027, identical pattern |
| `src/agent/claude-sdk-runner.ts:1-301` | Original reference - first SDK runner implementation |
| `src/agent/toolAllowlist.ts:1-162` | Defines phase-based tool allowlists via `PHASE_TOOL_ALLOWLISTS` and `getAllowedToolsForPhase()` |
| `src/agent/runner.ts:475-489` | Dispatch code that calls `runOpenCodeSdkAgent` for `opencode_sdk` kind |
| `src/agent/env.ts:1-109` | Environment variable resolution for SDK credentials |
| `src/schemas.ts:60-62` | Schema for `OpenCodeSdkAgentSchema` - minimal, only `kind: "opencode_sdk"` |
| `src/tui/agentEvents.ts` | `AgentEvent` type definition for TUI integration |
| `src/__tests__/amp-sdk-runner.test.ts:1-131` | Test pattern to follow |
| `src/__tests__/codex-sdk-runner.test.ts:1-129` | Identical test pattern |

### Reference Implementation Pattern (amp-sdk-runner.ts / codex-sdk-runner.ts)

The completed Amp and Codex SDK runners provide the exact pattern to follow:

| Step | amp-sdk-runner.ts Location | Description |
|------|---------------------------|-------------|
| SDK Import | Line 1 | `import { query } from "@anthropic-ai/claude-agent-sdk"` |
| Controller Registration | Lines 4, 82, 182 | `registerSdkController()`, `unregisterSdkController()` |
| Environment Setup | Line 95 | `const sdkEnv = await buildSdkEnv({ cwd, logger })` |
| Effective Tools | Lines 98-101 | `getEffectiveToolAllowlist(options)` + logging |
| SDK Options | Lines 103-114 | Includes `tools: effectiveTools` for allowlist |
| Query Execution | Lines 117-147 | `for await (const message of query(...))` |
| Message Formatting | Lines 295-328 | `formatSdkMessage()` |
| Event Emission | Lines 330-371 | `emitAgentEventsFromSdkMessage()` |
| Error Handling | Lines 186-293 | `handleSdkError()` with categories |
| Abort/Timeout | Lines 76-92 | AbortController setup |

### Current Dispatch Flow

From `runner.ts:475-489`:
```typescript
case "opencode_sdk": {
  const { runOpenCodeSdkAgent } = await import("./opencode-sdk-runner.js");
  return runOpenCodeSdkAgent({
    config,
    cwd: options.cwd,
    prompt: options.prompt,
    logger: options.logger,
    dryRun: options.dryRun,
    onStdoutChunk: options.onStdoutChunk,
    onStderrChunk: options.onStderrChunk,
    onAgentEvent: options.onAgentEvent,
    mcpServers: options.mcpServers,
    allowedTools: options.allowedTools,
  });
}
```

**Note:** The dispatch passes `allowedTools` but not `phase`. Phase-based resolution happens at the caller level (already converted to tools via `getAllowedToolsForPhase()` in workflow code).

### Schema Definition

From `src/schemas.ts:60-62`:
```typescript
export const OpenCodeSdkAgentSchema = z.object({
  kind: z.literal("opencode_sdk"),
});
```

This is the simplest schema of all SDK runners - no additional configuration fields. The runner should work identically to the other SDK runners with default settings.

### Tool Allowlist Definitions

From `toolAllowlist.ts:57-117`:

| Phase | Allowed Tools |
|-------|---------------|
| `idea` | `mcp__wreckit__save_parsed_ideas`, `mcp__wreckit__save_interview_ideas` |
| `research` | `Read`, `Write`, `Glob`, `Grep` |
| `plan` | `Read`, `Write`, `Edit`, `Glob`, `Grep`, `mcp__wreckit__save_prd` |
| `implement` | `Read`, `Write`, `Edit`, `Glob`, `Grep`, `Bash`, `mcp__wreckit__update_story_status` |
| `pr` | `Read`, `Glob`, `Grep`, `Bash` |
| `complete` | `Read`, `Glob`, `Grep`, `mcp__wreckit__complete` |
| `strategy` | `Read`, `Write`, `Glob`, `Grep` |

## Technical Considerations

### Dependencies

**External:**
- `@anthropic-ai/claude-agent-sdk` (^0.2.7) - already in `package.json`, no new dependency needed
- The SDK is used as the underlying infrastructure; "OpenCode" is a configuration mode, not a separate SDK

**Internal (needs to be imported):**
- `src/agent/env.ts` - `buildSdkEnv()` for credential resolution (not currently imported)
- `src/agent/runner.ts` - `registerSdkController()`, `unregisterSdkController()` for cleanup (not currently imported)

**Already imported:**
- `src/agent/toolAllowlist.ts` - `getAllowedToolsForPhase()` (line 5)
- Types from `../logging`, `./runner`, `../schemas`, `../tui/agentEvents`

### Patterns to Follow

1. **Abort Controller Registration**: Register with `registerSdkController()` at start, unregister in `finally` block
2. **Timeout Handling**: Set up timeout with `setTimeout`, abort controller on timeout, default 3600 seconds
3. **Message Streaming**: Iterate over async SDK messages, format and emit to output callbacks
4. **Event Emission**: Emit structured `AgentEvent` objects for TUI integration
5. **Error Categorization**: Handle auth (401, API key), rate limit (429), context (tokens), network (ECONNREFUSED) errors
6. **Dry-Run Support**: Already implemented, just log and return success

### Tool Allowlist Enforcement

The tool allowlist is enforced at the SDK layer via the `tools` option:
```typescript
const sdkOptions: any = {
  cwd,
  permissionMode: "bypassPermissions",
  allowDangerouslySkipPermissions: true,
  abortController,
  env: sdkEnv,
  ...(options.mcpServers && { mcpServers: options.mcpServers }),
  ...(effectiveTools && { tools: effectiveTools }),  // <-- Allowlist enforcement
};
```

When `tools` is specified, the SDK only allows those tools to be called. This is the same enforcement mechanism used by `claude-sdk-runner.ts`, `amp-sdk-runner.ts`, and `codex-sdk-runner.ts`.

### Implementation Difference from Predecessors

The OpenCode SDK runner is identical in implementation to Amp and Codex runners. The only differences are:

1. **Import types**: Uses `OpenCodeSdkAgentConfig` instead of `AmpSdkAgentConfig` or `CodexSdkAgentConfig`
2. **Interface name**: `OpenCodeRunAgentOptions` instead of `AmpRunAgentOptions` or `CodexRunAgentOptions`
3. **Function name**: `runOpenCodeSdkAgent` instead of `runAmpSdkAgent` or `runCodexSdkAgent`
4. **Error messages**: "OpenCode SDK" instead of "Amp SDK" or "Codex SDK"

The underlying SDK integration and tool allowlist enforcement is identical.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| "OpenCode SDK" is a misnomer - actually uses Claude Agent SDK | Low | Document in comments; the "OpenCode" name refers to configuration mode, not a separate SDK |
| OpenCode endpoint requires different auth | Medium | Test with actual endpoints; `buildSdkEnv()` supports `ANTHROPIC_BASE_URL` for custom endpoints |
| No dedicated test coverage for opencode-sdk-runner | Medium | Create test file following `amp-sdk-runner.test.ts` and `codex-sdk-runner.test.ts` pattern |
| Breaking changes if SDK API changes | Low | All SDK runners use same SDK; changes would affect all equally |
| Tool name mismatch between backends | Low | Tool names are standardized in `toolAllowlist.ts` |

## Recommended Approach

### Phase 1: Implement Core OpenCode SDK Runner

Copy the implementation from `amp-sdk-runner.ts` and adapt for OpenCode:

**Step 1: Add imports at the top of the file (after existing imports):**
```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";
import { registerSdkController, unregisterSdkController } from "./runner.js";
import { buildSdkEnv } from "./env.js";
```

**Step 2: Replace `runOpenCodeSdkAgent` function body (lines 50-84) with:**
- AbortController creation and registration
- Timeout setup using setTimeout (default 3600 seconds)
- Environment building via `buildSdkEnv()`
- SDK options construction with `tools` for allowlist
- Async iteration over `query()` messages
- Message formatting and event emission
- Error handling in catch block
- Cleanup in finally block

**Step 3: Add helper functions (copied from amp-sdk-runner.ts, adapted for OpenCode):**
- `handleSdkError()` - categorizes auth/rate limit/context/network errors (change error prefix to "OpenCode SDK error")
- `formatSdkMessage()` - converts SDK messages to output strings (identical)
- `emitAgentEventsFromSdkMessage()` - emits structured events for TUI (identical)

### Phase 2: Add Unit Tests

Create `src/__tests__/opencode-sdk-runner.test.ts` following the pattern in `amp-sdk-runner.test.ts` and `codex-sdk-runner.test.ts`:

1. **Dry-run tests:**
   - Returns success without calling SDK
   - Logs tool restrictions when `allowedTools` provided

2. **`getEffectiveToolAllowlist` resolution tests:**
   - Explicit `allowedTools` takes precedence over phase
   - Falls back to phase-based allowlist when no explicit tools
   - No restrictions when neither `allowedTools` nor phase specified

### Phase 3: Update Documentation

1. Update `ROADMAP.md` line 24 to mark objective complete:
   ```markdown
   - [x] Implement tool allowlist enforcement in `src/agent/opencode-sdk-runner.ts`
   ```

2. Optionally update `specs/008-agent-runtime.md` line 335 status from "Experimental" to "Implemented"

## Implementation Checklist

Based on comparison with completed `amp-sdk-runner.ts`:

- [ ] Add `import { query } from "@anthropic-ai/claude-agent-sdk"` at line 1
- [ ] Add `import { registerSdkController, unregisterSdkController } from "./runner.js"` (after line 4)
- [ ] Add `import { buildSdkEnv } from "./env.js"` (after line 4)
- [ ] Add variables: `output = ""`, `timedOut = false`, `timeoutId`, `abortController`
- [ ] Add `registerSdkController(abortController)` call
- [ ] Add timeout setup with `setTimeout` (3600 seconds)
- [ ] Add `const sdkEnv = await buildSdkEnv({ cwd, logger })`
- [ ] Get effective tools and log if present
- [ ] Build `sdkOptions` with `cwd`, `permissionMode`, `abortController`, `env`, `mcpServers`, `tools`
- [ ] Implement `for await (const message of query(...))` loop
- [ ] Add `formatSdkMessage()` function
- [ ] Add `emitAgentEventsFromSdkMessage()` function
- [ ] Add `handleSdkError()` function with auth/rate-limit/context/network categories
- [ ] Handle timeout result
- [ ] Return success result
- [ ] Implement catch block with `handleSdkError()`
- [ ] Add `finally` block with `unregisterSdkController(abortController)`
- [ ] Create `src/__tests__/opencode-sdk-runner.test.ts`

## Open Questions

1. **Model configuration**: The schema has no model field (unlike `codex_sdk` which has `model: "codex-1"`). Should there be a default model, or is "OpenCode" purely an endpoint/configuration distinction?

2. **Endpoint configuration**: Does "OpenCode" imply a specific `ANTHROPIC_BASE_URL` or is it purely a naming convention? The current implementation would use whatever endpoint is configured in environment.

3. **MCP server integration**: The dispatch passes `mcpServers` and the implementation should pass them to the SDK. This should work identically to the other SDK runners.

4. **Test isolation**: Should tests mock the SDK's `query` function to avoid actual API calls? The existing tests for amp-sdk-runner and codex-sdk-runner only test dry-run mode which doesn't call the SDK.

## Files to Create/Modify

| File | Changes |
|------|---------|
| `src/agent/opencode-sdk-runner.ts` | Add imports, replace stub with full implementation, add helper functions |
| `src/__tests__/opencode-sdk-runner.test.ts` | **New file** - test suite following amp-sdk-runner.test.ts pattern |
| `ROADMAP.md:24` | Mark objective as complete `[x]` |

## References

- Research for item 026: `.wreckit/items/026-implement-tool-allowlist-enforcement-in-srcagentam/research.md`
- Reference implementation (Amp): `src/agent/amp-sdk-runner.ts:1-372`
- Reference implementation (Codex): `src/agent/codex-sdk-runner.ts:1-372`
- Original reference (Claude): `src/agent/claude-sdk-runner.ts:1-301`
- Test pattern (Amp): `src/__tests__/amp-sdk-runner.test.ts:1-131`
- Test pattern (Codex): `src/__tests__/codex-sdk-runner.test.ts:1-129`
- Tool allowlist definitions: `src/agent/toolAllowlist.ts:57-117`
- Environment builder: `src/agent/env.ts:79-108`
- Agent runtime spec: `specs/008-agent-runtime.md`
- Milestone context: `ROADMAP.md:16-27` ([M2] Finish Experimental SDK Integrations)
- Dispatch code: `src/agent/runner.ts:475-489`
- Schema definition: `src/schemas.ts:60-62`
