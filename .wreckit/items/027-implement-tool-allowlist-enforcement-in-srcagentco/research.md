# Research: Implement tool allowlist enforcement in `src/agent/codex-sdk-runner.ts`

**Date**: 2026-01-24
**Item**: 027-implement-tool-allowlist-enforcement-in-srcagentco

## Research Question
From milestone [M2] Finish Experimental SDK Integrations

**Motivation:** Strategic milestone: Finish Experimental SDK Integrations

## Summary

The `src/agent/codex-sdk-runner.ts` file already has complete **scaffolding** for tool allowlist enforcement but lacks actual SDK implementation. The file currently returns a "not yet implemented" error for all real executions (lines 76-83). The `getEffectiveToolAllowlist()` helper function is already defined (lines 35-48) and correctly prioritizes explicit `allowedTools`, then phase-based allowlists from `toolAllowlist.ts`, then falls back to no restrictions.

This item depends on item 026 (Amp SDK runner) which has been **completed**. The Amp SDK implementation provides the exact pattern to follow: it uses the existing `@anthropic-ai/claude-agent-sdk` package (not a new dependency) with endpoint configuration that can target different backends. The "Codex SDK" integration follows the same approach - using the Claude Agent SDK infrastructure with Codex-specific configuration.

The implementation is straightforward: copy the core logic from the completed `amp-sdk-runner.ts` (which itself mirrors `claude-sdk-runner.ts`), adapt the function signatures and types for `CodexRunAgentOptions`, and ensure tool allowlist enforcement works correctly via the SDK's `tools` option. The default timeout is 3600 seconds (1 hour).

## Current State Analysis

### Existing Implementation

The `codex-sdk-runner.ts` file at lines 1-85 contains:

| Component | Status | Location |
|-----------|--------|----------|
| `CodexRunAgentOptions` interface | Complete | `codex-sdk-runner.ts:7-22` |
| `getEffectiveToolAllowlist()` function | Complete | `codex-sdk-runner.ts:35-48` |
| Dry-run support | Complete | `codex-sdk-runner.ts:55-68` |
| Actual SDK execution | **TODO stub** | `codex-sdk-runner.ts:70-83` |

**Current stub behavior (lines 76-79):**
```typescript
logger.error("Codex SDK runner not yet implemented");
return {
  success: false,
  output: "Codex SDK runner is not yet implemented. Use process mode or claude_sdk instead.",
  timedOut: false,
  exitCode: 1,
  completionDetected: false,
};
```

**Existing `getEffectiveToolAllowlist()` (lines 35-48):**
```typescript
function getEffectiveToolAllowlist(options: CodexRunAgentOptions): string[] | undefined {
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
| `src/agent/codex-sdk-runner.ts:1-85` | **Target file** - has scaffolding but no real implementation |
| `src/agent/amp-sdk-runner.ts:1-372` | **Reference implementation** - completed item 026, shows exact pattern to follow |
| `src/agent/claude-sdk-runner.ts:1-301` | Original reference - first SDK runner implementation |
| `src/agent/toolAllowlist.ts:1-162` | Defines phase-based tool allowlists via `PHASE_TOOL_ALLOWLISTS` and `getAllowedToolsForPhase()` |
| `src/agent/runner.ts:459-473` | Dispatch code that calls `runCodexSdkAgent` for `codex_sdk` kind |
| `src/agent/env.ts:1-109` | Environment variable resolution for SDK credentials |
| `src/schemas.ts:55-58` | Schema for `CodexSdkAgentSchema` - has `kind: "codex_sdk"` and `model: string` (defaults to "codex-1") |
| `src/tui/agentEvents.ts:1-8` | `AgentEvent` type definition for TUI integration |

### Reference Implementation Pattern (amp-sdk-runner.ts)

The Amp SDK runner (completed in item 026) provides the exact pattern to follow:

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

From `runner.ts:459-473`:
```typescript
case "codex_sdk": {
  const { runCodexSdkAgent } = await import("./codex-sdk-runner.js");
  return runCodexSdkAgent({
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

From `src/schemas.ts:55-58`:
```typescript
export const CodexSdkAgentSchema = z.object({
  kind: z.literal("codex_sdk"),
  model: z.string().default("codex-1"),
});
```

This is simpler than Claude SDK schema but follows the same discriminated union pattern.

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
- `@anthropic-ai/claude-agent-sdk` (^0.2.7) - already in `package.json:53`, no new dependency needed
- The SDK is used as the underlying infrastructure; "Codex" is a configuration mode, not a separate SDK

**Internal (needs to be imported):**
- `src/agent/env.ts` - `buildSdkEnv()` for credential resolution
- `src/agent/runner.ts` - `registerSdkController()`, `unregisterSdkController()` for cleanup

**Already imported:**
- `src/agent/toolAllowlist.ts` - `getAllowedToolsForPhase()` (line 5)
- `src/tui/agentEvents.ts` - `AgentEvent` type (line 4)

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

When `tools` is specified, the SDK only allows those tools to be called. This is the same enforcement mechanism used by `claude-sdk-runner.ts` and `amp-sdk-runner.ts`.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| "Codex SDK" is a misnomer - actually uses Claude Agent SDK | Low | Document in comments; the "Codex" name refers to configuration mode, not a separate SDK |
| Codex model/endpoint requires different auth | Medium | Test with actual endpoints; `buildSdkEnv()` supports `ANTHROPIC_BASE_URL` for custom endpoints |
| No dedicated test coverage for codex-sdk-runner | Medium | Create test file following `amp-sdk-runner.test.ts` pattern |
| Breaking changes if SDK API changes | Low | All SDK runners use same SDK; changes would affect all equally |
| Tool name mismatch between Codex and Claude | Low | Tool names are standardized in `toolAllowlist.ts` |

## Recommended Approach

### Phase 1: Implement Core Codex SDK Runner

Copy the implementation pattern from `amp-sdk-runner.ts`:

**Step 1: Add imports at the top of the file:**
```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";
import { registerSdkController, unregisterSdkController } from "./runner.js";
import { buildSdkEnv } from "./env.js";
```

**Step 2: Replace `runCodexSdkAgent` function body (lines 50-84) with:**
- AbortController creation and registration
- Timeout setup using setTimeout (default 3600 seconds)
- Environment building via `buildSdkEnv()`
- SDK options construction with `tools` for allowlist
- Async iteration over `query()` messages
- Message formatting and event emission
- Error handling in catch block
- Cleanup in finally block

**Step 3: Add helper functions (copied from amp-sdk-runner.ts):**
- `handleSdkError()` - categorizes auth/rate limit/context/network errors (lines 186-293)
- `formatSdkMessage()` - converts SDK messages to output strings (lines 295-328)
- `emitAgentEventsFromSdkMessage()` - emits structured events for TUI (lines 330-371)

### Phase 2: Add Unit Tests

Create `src/__tests__/codex-sdk-runner.test.ts` following the pattern in `amp-sdk-runner.test.ts`:

1. **Dry-run tests:**
   - Returns success without calling SDK
   - Logs tool restrictions when `allowedTools` provided

2. **`getEffectiveToolAllowlist` resolution tests:**
   - Explicit `allowedTools` takes precedence over phase
   - Falls back to phase-based allowlist when no explicit tools
   - No restrictions when neither `allowedTools` nor phase specified

### Phase 3: Update Documentation

1. Update `ROADMAP.md` line 23 to mark objective complete:
   ```markdown
   - [x] Implement tool allowlist enforcement in `src/agent/codex-sdk-runner.ts`
   ```

2. Optionally update `specs/008-agent-runtime.md` line 334 status if desired

## Open Questions

1. **Model configuration**: The schema defines `model: z.string().default("codex-1")`. Should this be passed to the SDK options? The amp-sdk-runner doesn't use a model field. Need to verify how/if model selection works with the Claude Agent SDK.

2. **Endpoint configuration**: Does "Codex" imply a specific `ANTHROPIC_BASE_URL` or is it purely a model/configuration naming convention? The current implementation would use whatever endpoint is configured in environment.

3. **MCP server integration**: The dispatch passes `mcpServers` but we need to verify MCP tools work correctly with Codex-style execution. The tool names in `toolAllowlist.ts` use `mcp__wreckit__<tool_name>` format which should be SDK-agnostic.

4. **Test isolation**: Should tests mock the SDK's `query` function to avoid actual API calls? The amp-sdk-runner tests only test dry-run mode which doesn't call the SDK.

## Files to Modify

| File | Changes |
|------|---------|
| `src/agent/codex-sdk-runner.ts` | Add imports, replace stub with full implementation, add helper functions |
| `ROADMAP.md:23` | Mark objective as complete `[x]` |

## References

- Research for item 026: `.wreckit/items/026-implement-tool-allowlist-enforcement-in-srcagentam/research.md`
- Reference implementation (Amp): `src/agent/amp-sdk-runner.ts:1-372`
- Original reference (Claude): `src/agent/claude-sdk-runner.ts:1-301`
- Tool allowlist definitions: `src/agent/toolAllowlist.ts:57-117`
- Environment builder: `src/agent/env.ts:79-108`
- Agent runtime spec: `specs/008-agent-runtime.md`
- Milestone context: `ROADMAP.md:16-26` ([M2] Finish Experimental SDK Integrations)
- Dispatch code: `src/agent/runner.ts:459-473`
