# Research: Implement tool allowlist enforcement in `src/agent/amp-sdk-runner.ts`

**Date**: 2026-01-24
**Item**: 026-implement-tool-allowlist-enforcement-in-srcagentam

## Research Question
From milestone [M2] Finish Experimental SDK Integrations

**Motivation:** Strategic milestone: Finish Experimental SDK Integrations

## Summary

The `src/agent/amp-sdk-runner.ts` file already has the **scaffolding** for tool allowlist enforcement but lacks actual implementation. The file currently returns a "not yet implemented" error for all real executions. The `getEffectiveToolAllowlist()` helper function is already defined and correctly prioritizes explicit `allowedTools`, then phase-based allowlists from `toolAllowlist.ts`, then falls back to no restrictions.

The implementation gap is that while the tool allowlist logic exists, the actual Amp SDK integration does not. The runner needs to:
1. Import and initialize an Amp SDK client (similar to how `claude-sdk-runner.ts` uses `@anthropic-ai/claude-agent-sdk`)
2. Pass the effective tool allowlist to the SDK when executing queries
3. Handle SDK responses, streaming, timeout, error handling, and completion detection

This item is part of a dependency chain: Items 027 (Codex) and 028 (OpenCode) depend on 026 completing first, suggesting they share a similar implementation pattern.

## Current State Analysis

### Existing Implementation

The `amp-sdk-runner.ts` file at lines 1-85 contains:

- **Interface `AmpRunAgentOptions`** (lines 7-22): Already includes `phase?: string` for tool allowlist enforcement and `allowedTools?: string[]` for explicit restrictions
- **Function `getEffectiveToolAllowlist`** (lines 35-48): Already implemented correctly, mirrors the pattern in `codex-sdk-runner.ts` and `opencode-sdk-runner.ts`
- **Function `runAmpSdkAgent`** (lines 50-84): Returns a stub error on line 79: "Amp SDK runner is not yet implemented. Use process mode or claude_sdk instead."
- **Dry-run support** (lines 55-68): Already correctly logs tool restrictions during dry-run

### Key Files

| File | Description |
|------|-------------|
| `src/agent/amp-sdk-runner.ts:1-85` | The target file - has scaffolding but no real implementation |
| `src/agent/claude-sdk-runner.ts:1-301` | Reference implementation - shows how to integrate an SDK with tool allowlist |
| `src/agent/toolAllowlist.ts:1-162` | Defines phase-based tool allowlists via `PHASE_TOOL_ALLOWLISTS` and `getAllowedToolsForPhase()` |
| `src/agent/runner.ts:443-457` | Dispatch code that calls `runAmpSdkAgent` for `amp_sdk` kind |
| `src/agent/env.ts:1-109` | Environment variable resolution for SDK credentials |
| `src/schemas.ts:50-53` | Schema for `AmpSdkAgentSchema` - currently only has optional `model` field |

### Reference Implementation Pattern (claude-sdk-runner.ts)

The Claude SDK runner provides the implementation pattern to follow:

1. **SDK Import** (line 1): `import { query } from "@anthropic-ai/claude-agent-sdk"`
2. **Environment Setup** (line 29): `const sdkEnv = await buildSdkEnv({ cwd, logger })`
3. **Tool Allowlist Passing** (line 41): `...(options.allowedTools && { tools: options.allowedTools })`
4. **Query Execution** (line 45): `for await (const message of query({ prompt, options: sdkOptions }))`
5. **Message Formatting** (lines 224-257): `formatSdkMessage(message)` for output
6. **Event Emission** (lines 259-300): `emitAgentEventsFromSdkMessage()` for TUI integration
7. **Error Handling** (lines 114-222): Comprehensive handling for auth, rate limits, context, network errors
8. **Abort/Timeout** (lines 13-26): AbortController with cleanup registration

### Current Dispatch Flow

From `runner.ts:443-457`:
```typescript
case "amp_sdk": {
  const { runAmpSdkAgent } = await import("./amp-sdk-runner.js");
  return runAmpSdkAgent({
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

Note: The dispatch does **not** pass `phase` - only explicit `allowedTools`. This means phase-based enforcement requires either:
1. The caller to resolve phase to tools before calling
2. Passing phase through the dispatch chain

## Technical Considerations

### Dependencies

**External:**
- An Amp SDK package needs to be identified and added to `package.json`
- Currently only `@anthropic-ai/claude-agent-sdk` (^0.2.7) is in dependencies

**Internal:**
- `src/agent/toolAllowlist.ts` - `getAllowedToolsForPhase()`
- `src/agent/env.ts` - `buildSdkEnv()` for credential resolution
- `src/agent/runner.ts` - `registerSdkController()`, `unregisterSdkController()` for cleanup
- `src/tui/agentEvents.ts` - `AgentEvent` type for TUI integration

### Patterns to Follow

1. **Abort Controller Registration**: Register with `registerSdkController()` at start, unregister in `finally` block
2. **Timeout Handling**: Set up timeout with `setTimeout`, abort controller on timeout
3. **Message Streaming**: Iterate over async SDK messages, format and emit to output callbacks
4. **Event Emission**: Emit structured `AgentEvent` objects for TUI integration
5. **Error Categorization**: Handle auth, rate limit, context, network errors with specific messages
6. **Dry-Run Support**: Already implemented, just log and return success

### Tool Allowlist Enforcement

The Claude SDK uses a `tools` option to restrict available tools:
```typescript
...(options.allowedTools && { tools: options.allowedTools }),
```

The Amp SDK will need an equivalent mechanism. If the Amp SDK doesn't support tool restriction natively, we may need to:
1. Pre-filter available tools at SDK initialization
2. Intercept tool calls and reject unauthorized ones
3. Configure MCP server with only allowed tools

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Amp SDK doesn't exist or differs from Claude SDK | High | Research what "Amp SDK" refers to - may be an internal/proprietary SDK or a different API. May need to implement as process mode with `amp` CLI instead |
| Tool allowlist not supported by Amp SDK | Medium | Implement wrapper that validates tool calls against allowlist before execution |
| Breaking changes to dispatch interface | Medium | Keep interface compatible with `UnionRunAgentOptions`; add `phase` to dispatch if needed |
| No integration tests | Medium | ROADMAP objective includes "Add integration tests for each experimental SDK" |
| Credential configuration differs | Low | Extend `buildSdkEnv()` or create Amp-specific variant if needed |

## Recommended Approach

### Phase 1: Research Amp SDK
1. Identify what "Amp SDK" refers to - is there a public npm package?
2. Review Amp SDK documentation for tool restriction capabilities
3. Determine credential requirements (API key, base URL, auth token)

### Phase 2: Implement Core Runner
1. Add Amp SDK dependency to `package.json`
2. Implement `runAmpSdkAgent()` following `claude-sdk-runner.ts` pattern
3. Pass `allowedTools` to SDK (via `tools` option or equivalent)
4. Implement message streaming and event emission
5. Add error handling for auth, rate limits, etc.

### Phase 3: Testing
1. Add unit tests for `getEffectiveToolAllowlist()` (already implemented, just verify)
2. Add dry-run tests for Amp SDK runner
3. Add integration tests with mock Amp SDK responses

### Phase 4: Documentation
1. Update `specs/008-agent-runtime.md` to change status from Experimental to Implemented
2. Document Amp SDK configuration in README or MIGRATION.md

## Open Questions

1. **What is "Amp SDK"?** The codebase references "Amp" in process mode config (`command: "amp"`) suggesting an external CLI tool. Is there a corresponding SDK package, or does "Amp SDK" mean direct integration with whatever service `amp` CLI connects to?

2. **Phase passing**: The dispatch in `runner.ts` passes `allowedTools` but not `phase`. Should phase-based resolution happen at the caller level (already converted to tools), or should we add `phase` to `UnionRunAgentOptions`?

3. **MCP server integration**: The dispatch passes `mcpServers` but the current stub doesn't use it. How does Amp SDK integrate with MCP servers for wreckit tools like `save_prd`?

4. **Dependency chain**: Items 027 and 028 depend on this item. Are they expected to share implementation patterns, or is each SDK fundamentally different?

5. **Testing strategy**: What level of test coverage is required? Unit tests only, or should we have integration tests that mock SDK responses?
