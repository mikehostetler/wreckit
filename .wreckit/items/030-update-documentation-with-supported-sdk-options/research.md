# Research: Update documentation with supported SDK options

**Date**: 2025-01-25
**Item**: 030-update-documentation-with-supported-sdk-options

## Research Question
From milestone [M2] Finish Experimental SDK Integrations

**Motivation:** Strategic milestone: Finish Experimental SDK Integrations

## Summary

This task is the **final item in milestone M2** (Finish Experimental SDK Integrations). The preceding items (026-029) have already:
- Item 026: Implemented tool allowlist enforcement in `amp-sdk-runner.ts` (done)
- Item 027: Implemented tool allowlist enforcement in `codex-sdk-runner.ts` (done)
- Item 028: Implemented tool allowlist enforcement in `opencode-sdk-runner.ts` (done)
- Item 029: Added integration tests for each experimental SDK (done)

Now the documentation needs to be updated to reflect the full set of supported SDK options. The current documentation in `README.md` and `MIGRATION.md` documents `claude_sdk` mode well but does not document the three experimental SDK options (`amp_sdk`, `codex_sdk`, `opencode_sdk`).

**Primary Goal:** Add user-facing documentation for experimental SDK modes to:
1. `README.md` - Main user documentation
2. `MIGRATION.md` - Migration and troubleshooting guide
3. `ROADMAP.md` - Mark the milestone objective as complete

## Current State Analysis

### Existing Implementation

All five agent backends are fully implemented and tested in the codebase:

1. **Schema Definitions** (`src/schemas.ts:36-70`):
   - `ProcessAgentSchema` at lines 36-41: `kind: "process"` with command, args, completion_signal
   - `ClaudeSdkAgentSchema` at lines 43-48: `kind: "claude_sdk"` with model, max_tokens, tools
   - `AmpSdkAgentSchema` at lines 50-53: `kind: "amp_sdk"` with optional model
   - `CodexSdkAgentSchema` at lines 55-58: `kind: "codex_sdk"` with model (default: "codex-1")
   - `OpenCodeSdkAgentSchema` at lines 60-62: `kind: "opencode_sdk"` with no additional options

2. **Agent Dispatch** (`src/agent/runner.ts:389-494`):
   - `runAgentUnion()` function dispatches to appropriate runner based on `config.kind`
   - Case handling at lines 390-414 (process), 416-441 (claude_sdk), 443-457 (amp_sdk), 459-473 (codex_sdk), 475-489 (opencode_sdk)

3. **SDK Runners** - All share identical patterns:
   - `src/agent/amp-sdk-runner.ts:1-372` - Uses `@anthropic-ai/claude-agent-sdk` query API
   - `src/agent/codex-sdk-runner.ts:1-372` - Same structure as amp-sdk-runner
   - `src/agent/opencode-sdk-runner.ts:1-372` - Same structure as amp-sdk-runner

4. **Integration Tests** (`src/__tests__/sdk-integration/`):
   - `amp-sdk.integration.test.ts` - Comprehensive tests for Amp SDK
   - `codex-sdk.integration.test.ts` - Comprehensive tests for Codex SDK
   - `opencode-sdk.integration.test.ts` - Comprehensive tests for OpenCode SDK

### Key Files

- `src/schemas.ts:36-41` - ProcessAgentSchema Zod definition with kind literal "process"
- `src/schemas.ts:43-48` - ClaudeSdkAgentSchema with model, max_tokens, tools fields
- `src/schemas.ts:50-53` - AmpSdkAgentSchema with optional model field
- `src/schemas.ts:55-58` - CodexSdkAgentSchema with default model "codex-1"
- `src/schemas.ts:60-62` - OpenCodeSdkAgentSchema with no configuration options
- `src/schemas.ts:64-70` - AgentConfigUnionSchema discriminated union of all five kinds
- `src/agent/runner.ts:348-388` - runAgentUnion() function signature and dry-run handling
- `src/agent/runner.ts:389-414` - Process agent dispatch case
- `src/agent/runner.ts:443-457` - Amp SDK dispatch case with dynamic import
- `src/agent/runner.ts:459-473` - Codex SDK dispatch case with dynamic import
- `src/agent/runner.ts:475-489` - OpenCode SDK dispatch case with dynamic import
- `src/agent/amp-sdk-runner.ts:53-184` - runAmpSdkAgent() main function implementation
- `src/agent/amp-sdk-runner.ts:78-79` - Default timeout 3600 seconds
- `src/agent/amp-sdk-runner.ts:104-114` - SDK options with bypassPermissions mode
- `src/agent/codex-sdk-runner.ts:53-184` - runCodexSdkAgent() main function implementation
- `src/agent/opencode-sdk-runner.ts:53-184` - runOpenCodeSdkAgent() main function implementation
- `src/agent/toolAllowlist.ts:57-117` - Phase-based tool allowlists for all SDK runners
- `README.md:163-208` - Current Agent Options section (missing experimental SDKs)
- `MIGRATION.md:107-175` - Configuration Reference section (only claude_sdk and process)
- `AGENTS.md:79-93` - Config example section (uses legacy format)
- `ROADMAP.md:22-26` - M2 milestone objectives (line 26 needs checkbox update)

### Schema Definitions (from `src/schemas.ts:36-70`)

```typescript
// ProcessAgentSchema (lines 36-41)
{
  kind: "process",
  command: string,          // Required
  args: string[],           // Default: []
  completion_signal: string // Required
}

// ClaudeSdkAgentSchema (lines 43-48)
{
  kind: "claude_sdk",
  model: string,            // Default: "claude-sonnet-4-20250514"
  max_tokens: number,       // Default: 4096
  tools: string[]           // Optional
}

// AmpSdkAgentSchema (lines 50-53)
{
  kind: "amp_sdk",
  model: string             // Optional
}

// CodexSdkAgentSchema (lines 55-58)
{
  kind: "codex_sdk",
  model: string             // Default: "codex-1"
}

// OpenCodeSdkAgentSchema (lines 60-62)
{
  kind: "opencode_sdk"
  // No additional options
}
```

### Documentation Coverage Gap

| SDK Backend | README.md | MIGRATION.md | AGENTS.md |
|-------------|-----------|--------------|-----------|
| `process` | Documented | Documented | Mentioned |
| `claude_sdk` | Documented | Documented | Mentioned |
| `amp_sdk` | **Missing** | **Missing** | **Missing** |
| `codex_sdk` | **Missing** | **Missing** | **Missing** |
| `opencode_sdk` | **Missing** | **Missing** | **Missing** |

### Common Features Across All SDK Runners

All experimental SDK runners (`amp-sdk-runner.ts`, `codex-sdk-runner.ts`, `opencode-sdk-runner.ts`) share:

1. **Same SDK query API**: All use `@anthropic-ai/claude-agent-sdk` `query()` function (line 1 imports, line 117 usage)
2. **Same environment building**: All call `buildSdkEnv()` from `src/agent/env.ts` (line 95)
3. **Same error handling categories** (lines 186-293): Authentication, rate limit, context window, network errors
4. **Same message formatting**: `formatSdkMessage()` (lines 295-328) and `emitAgentEventsFromSdkMessage()` (lines 330-371)
5. **Same default timeout**: 3600 seconds (line 79)
6. **Same permission mode**: `bypassPermissions` with `allowDangerouslySkipPermissions: true` (lines 106-107)

### Integration Tests (from item 029)

Located in `src/__tests__/sdk-integration/`:
- `amp-sdk.integration.test.ts`
- `codex-sdk.integration.test.ts`
- `opencode-sdk.integration.test.ts`

Documented in `src/__tests__/integration/README.md:69-73`

Tests verify:
- Message formatting (assistant text, tool_use, tool_result, result, error)
- Event emission (assistant_text, tool_started, tool_result, run_result, error)
- Error handling (auth, rate limit, context window, network, generic)
- SDK options passing (mcpServers, allowedTools, bypassPermissions)

## Technical Considerations

### Dependencies

- All SDK modes depend on `@anthropic-ai/claude-agent-sdk` package
- No additional dependencies for experimental SDKs
- Environment variables resolved from same sources for all SDK modes (`src/agent/env.ts`)

### Patterns to Follow

From existing documentation:

1. **README.md Configuration Examples** (lines 168-206):
   - JSON code blocks with full example configs
   - Subsection headers (####) for each mode
   - Brief description before config

2. **MIGRATION.md Configuration Reference** (lines 109-175):
   - Tables showing old vs new formats
   - Default values documented inline
   - JSON examples with comments

3. **Error Message Pattern** (all SDK runners):
   - All authentication error messages reference `wreckit sdk-info`
   - Consistent troubleshooting guidance

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Users try experimental SDKs without understanding limitations | Medium | Add clear "Experimental" labels and warnings |
| Documentation drift from code | Low | Reference schemas as source of truth |
| Missing environment variable docs for experimental SDKs | Low | Note all SDKs share same env var resolution |
| Users confused about which SDK to use | Medium | Add comparison table with use cases |
| Over-documenting minimal schemas | Low | Document what options exist, note simplicity is intentional |

## Recommended Approach

### 1. Update README.md

Insert after line 179 (after Claude SDK section, before Process Mode):

```markdown
#### Experimental SDK Modes

> **Note:** These SDK modes are experimental and under active development. They share
> the same authentication and environment variable resolution as the Claude SDK.

**Amp SDK:**
```json
{
  "agent": {
    "kind": "amp_sdk",
    "model": "optional-model-override"
  }
}
```

**Codex SDK:**
```json
{
  "agent": {
    "kind": "codex_sdk",
    "model": "codex-1"
  }
}
```

**OpenCode SDK:**
```json
{
  "agent": {
    "kind": "opencode_sdk"
  }
}
```
```

### 2. Update MIGRATION.md

Add new section after "Configuration Reference" (after line 175):

```markdown
### Experimental SDK Modes

Wreckit supports additional SDK backends:

| Kind | Status | Configuration Options |
|------|--------|----------------------|
| `amp_sdk` | Experimental | `model` (optional) |
| `codex_sdk` | Experimental | `model` (default: `codex-1`) |
| `opencode_sdk` | Experimental | (none) |

All experimental SDK modes:
- Use the same environment variable resolution as `claude_sdk`
- Support the same MCP tools and allowlists
- Have integration tests verifying feature parity

To use an experimental SDK, update `.wreckit/config.json`:

```json
{
  "agent": {
    "kind": "amp_sdk"
  }
}
```
```

### 3. Update ROADMAP.md

Change line 26 from:
```markdown
- [ ] Update documentation with supported SDK options
```

To:
```markdown
- [x] Update documentation with supported SDK options
```

### 4. Optionally Update AGENTS.md

Add to architecture section (around line 75):

```markdown
Wreckit supports multiple agent backends:
- `claude_sdk` (default) - Claude Agent SDK
- `process` - External CLI agents (amp, claude)
- `amp_sdk`, `codex_sdk`, `opencode_sdk` - Experimental SDK integrations
```

## Files to Modify

| File | Changes | Priority |
|------|---------|----------|
| `README.md` | Add experimental SDK section after line 179 | High |
| `MIGRATION.md` | Add experimental SDK section after line 175 | High |
| `ROADMAP.md` | Mark objective complete `[x]` on line 26 | High |
| `AGENTS.md` | Add brief mention of SDK backends | Low |

## Open Questions

1. **Are there specific use cases for each experimental SDK that should be documented?**
   - Current code doesn't differentiate beyond configuration options
   - All currently use Claude Agent SDK under the hood (per imports in runners)
   - May need product guidance on positioning

2. **Should we document fallback behavior for experimental SDKs?**
   - `src/agent/runner.ts` doesn't implement fallback for experimental SDKs (lines 443-489)
   - Only `claude_sdk` has fallback to `process` mode (lines 188-199)

3. **Should `wreckit sdk-info` be updated to list available SDK backends?**
   - Currently only shows environment variable resolution
   - Could be enhanced to show all supported `kind` values
   - Out of scope for this documentation task

4. **Is there naming confusion between amp CLI process mode and amp_sdk?**
   - `process` mode with `command: "amp"` spawns Amp CLI
   - `amp_sdk` uses Claude Agent SDK with Amp-specific configuration
   - Documentation should clarify this distinction

5. **Model Availability:**
   - The `codex_sdk` has a default model of "codex-1"
   - Documentation should note model availability varies by endpoint

## References

- Dependency item (done): `029-add-integration-tests-for-each-experimental-sdk`
- Schema definitions: `src/schemas.ts:36-70`
- Agent dispatch: `src/agent/runner.ts:389-494`
- Amp SDK runner: `src/agent/amp-sdk-runner.ts:1-372`
- Codex SDK runner: `src/agent/codex-sdk-runner.ts:1-372`
- OpenCode SDK runner: `src/agent/opencode-sdk-runner.ts:1-372`
- Tool allowlists: `src/agent/toolAllowlist.ts:57-117`
- Integration tests: `src/__tests__/sdk-integration/*.integration.test.ts`
- Integration README: `src/__tests__/integration/README.md:69-73`
- Current documentation: `README.md:163-208`, `MIGRATION.md:107-175`, `AGENTS.md:79-93`
- Milestone context: `ROADMAP.md:22-26` ([M2] Finish Experimental SDK Integrations)
