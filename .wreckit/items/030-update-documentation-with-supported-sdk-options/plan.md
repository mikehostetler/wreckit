# Update documentation with supported SDK options Implementation Plan

## Overview

This is the final item in milestone M2 (Finish Experimental SDK Integrations). The preceding items (026-029) have implemented tool allowlist enforcement for all experimental SDKs and added integration tests. Now we need to update the user-facing documentation to reflect the full set of supported SDK options.

**Goal:** Document the three experimental SDK modes (`amp_sdk`, `codex_sdk`, `opencode_sdk`) alongside the existing `claude_sdk` and `process` modes, and mark the M2 milestone objective as complete.

## Current State Analysis

### What Exists Now

1. **Schema Definitions** (`src/schemas.ts:36-70`):
   - All five agent backends are fully defined and implemented
   - `ProcessAgentSchema`: `kind: "process"` with command, args, completion_signal
   - `ClaudeSdkAgentSchema`: `kind: "claude_sdk"` with model, max_tokens, tools
   - `AmpSdkAgentSchema`: `kind: "amp_sdk"` with optional model
   - `CodexSdkAgentSchema`: `kind: "codex_sdk"` with model (default: "codex-1")
   - `OpenCodeSdkAgentSchema`: `kind: "opencode_sdk"` with no additional options

2. **SDK Runners** - All fully implemented with tool allowlist enforcement:
   - `src/agent/amp-sdk-runner.ts` - Amp SDK runner
   - `src/agent/codex-sdk-runner.ts` - Codex SDK runner
   - `src/agent/opencode-sdk-runner.ts` - OpenCode SDK runner

3. **Integration Tests** (`src/__tests__/sdk-integration/`):
   - `amp-sdk.integration.test.ts`
   - `codex-sdk.integration.test.ts`
   - `opencode-sdk.integration.test.ts`

4. **CHANGELOG.md** - Already has entry for experimental SDK documentation (lines 10-14)

5. **Current Documentation Coverage:**

   | SDK Backend | README.md | MIGRATION.md | AGENTS.md |
   |-------------|-----------|--------------|-----------|
   | `process` | Documented (lines 184-206) | Documented (lines 109-161) | Uses legacy format (line 88) |
   | `claude_sdk` | Documented (lines 167-179) | Documented (lines 138-175) | Uses legacy format (line 88) |
   | `amp_sdk` | **Missing** | **Missing** | **Missing** |
   | `codex_sdk` | **Missing** | **Missing** | **Missing** |
   | `opencode_sdk` | **Missing** | **Missing** | **Missing** |

6. **ROADMAP.md** - Line 26 has unchecked objective: `- [ ] Update documentation with supported SDK options`

### Key Discoveries

- **All SDKs use the same underlying SDK**: All experimental SDK runners import from `@anthropic-ai/claude-agent-sdk` (`src/agent/amp-sdk-runner.ts:1`)
- **Same environment resolution**: All SDKs use `buildSdkEnv()` from `src/agent/env.ts` (line 95 in each runner)
- **Same permission mode**: All use `bypassPermissions` with `allowDangerouslySkipPermissions: true` (lines 106-107)
- **Same default timeout**: 3600 seconds (line 79 in each runner)
- **Phase-based tool allowlists**: All SDKs use `getAllowedToolsForPhase()` from `src/agent/toolAllowlist.ts`
- **README.md uses legacy `mode` format**: Lines 173-178 show `mode: "sdk"` instead of `kind: "claude_sdk"`

### Decisions Made

1. **Update to `kind` format**: Convert README.md SDK examples from legacy `mode` to new `kind` format
2. **Document as "Experimental"**: Keep the experimental designation as noted in research
3. **Same auth for all SDKs**: Document that all use identical environment variable resolution
4. **No fallback for experimental**: Only `claude_sdk` has fallback - document this limitation
5. **CHANGELOG already done**: Skip Phase 4 since entry already exists

## Desired End State

After this item is complete:

1. **README.md** contains updated "Agent Options" section with all five agent kinds using `kind` format
2. **MIGRATION.md** contains "Experimental SDK Modes" section after line 175
3. **AGENTS.md** contains updated config example with `kind` format and agent kinds table
4. **ROADMAP.md** line 26 is marked complete: `[x] Update documentation with supported SDK options`

### Verification Criteria:
- All five agent `kind` values are documented in README.md with examples
- All configuration examples use `kind` format (not legacy `mode`)
- Configuration examples are syntactically valid JSON
- Experimental status is clearly communicated
- ROADMAP.md milestone M2 objective is checked off

## What We're NOT Doing

- **NOT updating `wreckit sdk-info`** to list SDK backends (out of scope)
- **NOT documenting fallback behavior for experimental SDKs** (they don't have it)
- **NOT adding use-case guidance** (all currently use same SDK under the hood)
- **NOT documenting model-specific features** (no differentiation exists yet)
- **NOT creating new documentation files** (only updating existing ones)
- **NOT updating CHANGELOG.md** (entry already exists at lines 10-14)

## Implementation Approach

This is a documentation-only task. Changes are additive and non-breaking.

**Strategy:**
1. Update README.md with experimental SDK section and convert to `kind` format (user-facing primary doc)
2. Update MIGRATION.md with configuration reference (migration/troubleshooting doc)
3. Update AGENTS.md with SDK backend list and `kind` format (developer guidelines)
4. Update ROADMAP.md to mark objective complete (project tracking)

All changes are independent and can be verified individually.

---

## Phase 1: Update README.md

### Overview
Add documentation for experimental SDK modes and convert existing examples from legacy `mode` format to new `kind` format.

### Changes Required:

#### 1. Update Agent Options Section
**File**: `README.md`
**Location**: Lines 163-208
**Changes**:
- Convert SDK Mode example from `mode: "sdk"` to `kind: "claude_sdk"` format
- Add experimental SDK section with amp_sdk, codex_sdk, opencode_sdk examples
- Update Process Mode examples to use `kind: "process"` format

**Replace lines 163-208 with:**

```markdown
### Agent Options

Wreckit supports multiple agent execution backends:

| Kind | Description | Configuration |
|------|-------------|---------------|
| `claude_sdk` | Claude Agent SDK (recommended) | model, max_tokens, tools |
| `amp_sdk` | Amp SDK (experimental) | model (optional) |
| `codex_sdk` | Codex SDK (experimental) | model (default: codex-1) |
| `opencode_sdk` | OpenCode SDK (experimental) | none |
| `process` | External CLI process | command, args, completion_signal |

#### Claude SDK Mode (Recommended)
Uses the Claude Agent SDK directly for better performance and error handling:

```json
{
  "agent": {
    "kind": "claude_sdk",
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 8192
  }
}
```

#### Experimental SDK Modes

Wreckit supports experimental SDK integrations. These use the same underlying SDK infrastructure and share authentication/environment variable resolution with `claude_sdk`.

> **Note:** Experimental SDKs may have API changes in future releases.

**Amp SDK:**
```json
{
  "agent": {
    "kind": "amp_sdk",
    "model": "custom-model"
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

#### Process Mode
Spawns an external CLI process (backward compatible):

**Amp:**
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

**Claude:**
```json
{
  "agent": {
    "kind": "process",
    "command": "claude",
    "args": ["--dangerously-skip-permissions", "--print"],
    "completion_signal": "<promise>COMPLETE</promise>"
  }
}
```

See [MIGRATION.md](./MIGRATION.md) for detailed migration guide.
```

### Success Criteria:

#### Automated Verification:
- [ ] Build succeeds: `bun run build`
- [ ] Linting passes: `bun run lint`

#### Manual Verification:
- [ ] README.md renders correctly in GitHub/VS Code preview
- [ ] All JSON examples are valid JSON
- [ ] Table renders correctly with all 5 agent kinds
- [ ] Link to MIGRATION.md works

**Note**: Complete all verification before proceeding to next phase.

---

## Phase 2: Update MIGRATION.md

### Overview
Add configuration reference for experimental SDK modes after the "Default Configuration" section.

### Changes Required:

#### 1. Add Experimental SDK Modes Section
**File**: `MIGRATION.md`
**Location**: After line 175 (after Default Configuration section, before "### Config Migration Rules")
**Changes**: Insert new section with configuration reference for all three experimental SDKs

**Insert after line 175:**

```markdown

### Experimental SDK Modes

Wreckit supports experimental SDK backends for specialized use cases. All experimental SDKs:

- Use the same `@anthropic-ai/claude-agent-sdk` query API
- Share the same environment variable resolution (see [Environment Variables](#environment-variables))
- Have the same error handling and timeout behavior (3600 seconds default)
- Support MCP servers and tool restrictions

> **Note:** Experimental SDKs do not have automatic fallback to process mode.
> If authentication fails, the operation will fail (not fall back to CLI).

#### Amp SDK

Minimal configuration with optional model override:

```json
{
  "agent": {
    "kind": "amp_sdk",
    "model": "custom-model"
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `kind` | `"amp_sdk"` | Required | Discriminator for Amp SDK |
| `model` | string | (none) | Optional model override |

#### Codex SDK

Configuration with default model:

```json
{
  "agent": {
    "kind": "codex_sdk",
    "model": "codex-1"
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `kind` | `"codex_sdk"` | Required | Discriminator for Codex SDK |
| `model` | string | `"codex-1"` | Model to use |

#### OpenCode SDK

Zero-configuration SDK mode:

```json
{
  "agent": {
    "kind": "opencode_sdk"
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `kind` | `"opencode_sdk"` | Required | Discriminator for OpenCode SDK |

#### Switching Between SDK Modes

To switch from `claude_sdk` to an experimental SDK, change the `kind` field:

**Before (Claude SDK):**
```json
{
  "agent": {
    "kind": "claude_sdk",
    "model": "claude-sonnet-4-20250514"
  }
}
```

**After (Codex SDK):**
```json
{
  "agent": {
    "kind": "codex_sdk",
    "model": "codex-1"
  }
}
```

All SDK modes use the same credential resolution. Run `wreckit sdk-info` to verify your configuration.

```

### Success Criteria:

#### Automated Verification:
- [ ] Build succeeds: `bun run build`
- [ ] Linting passes: `bun run lint`

#### Manual Verification:
- [ ] MIGRATION.md renders correctly
- [ ] All JSON examples are valid JSON
- [ ] Tables render correctly
- [ ] Section links work within document

**Note**: Complete all verification before proceeding to next phase.

---

## Phase 3: Update AGENTS.md

### Overview
Update developer guidelines with current `kind` format and add agent backends reference.

### Changes Required:

#### 1. Update Config Section
**File**: `AGENTS.md`
**Location**: Lines 79-93
**Changes**:
- Update config example to use `kind: "claude_sdk"` instead of legacy format
- Add "Agent Kind Options" table after the config example

**Replace lines 79-93 with:**

```markdown
## Config

`.wreckit/config.json`:
```json
{
  "schema_version": 1,
  "base_branch": "main",
  "branch_prefix": "wreckit/",
  "merge_mode": "pr",
  "agent": {
    "kind": "claude_sdk",
    "model": "claude-sonnet-4-20250514"
  },
  "max_iterations": 100,
  "timeout_seconds": 3600,
  "branch_cleanup": {"enabled": true, "delete_remote": true}
}
```

### Agent Kind Options

| Kind | Description |
|------|-------------|
| `claude_sdk` | Claude Agent SDK (default, recommended) |
| `amp_sdk` | Amp SDK (experimental) |
| `codex_sdk` | Codex SDK (experimental) |
| `opencode_sdk` | OpenCode SDK (experimental) |
| `process` | External CLI process |

See [README.md](./README.md#agent-options) for configuration examples for each kind.
```

### Success Criteria:

#### Automated Verification:
- [ ] Build succeeds: `bun run build`
- [ ] Linting passes: `bun run lint`

#### Manual Verification:
- [ ] AGENTS.md renders correctly
- [ ] JSON example is valid
- [ ] Table lists all five agent kinds

**Note**: Complete all verification before proceeding to next phase.

---

## Phase 4: Update ROADMAP.md

### Overview
Mark the documentation objective as complete in milestone M2.

### Changes Required:

#### 1. Mark Objective Complete
**File**: `ROADMAP.md`
**Location**: Line 26
**Changes**: Change checkbox from unchecked to checked

**Before:**
```markdown
- [ ] Update documentation with supported SDK options
```

**After:**
```markdown
- [x] Update documentation with supported SDK options
```

### Success Criteria:

#### Automated Verification:
- [ ] Build succeeds: `bun run build`

#### Manual Verification:
- [ ] All five M2 objectives are now marked `[x]`
- [ ] Milestone M2 can be considered complete

---

## Testing Strategy

### Documentation Validation:
- All JSON examples should parse without error
- Markdown renders correctly (no broken links, tables)
- Configuration examples match actual schema definitions in `src/schemas.ts:50-62`

### Cross-Reference Verification:
- README.md examples match MIGRATION.md configuration reference
- AGENTS.md table matches schema definitions
- All documentation references same set of `kind` values

### Manual Testing Steps:
1. Open README.md in GitHub/VS Code preview and verify:
   - Table renders with all 5 agent kinds
   - All JSON code blocks are syntax highlighted
   - Link to MIGRATION.md works
2. Open MIGRATION.md and verify:
   - "Experimental SDK Modes" section appears after "Default Configuration"
   - Tables render correctly
   - JSON examples are valid
3. Open AGENTS.md and verify:
   - Config example uses `kind: "claude_sdk"` format
   - Agent kinds table renders with all 5 options
4. Open ROADMAP.md and verify:
   - All M2 objectives are marked `[x]`

## Migration Notes

Not applicable - this is documentation-only and does not affect runtime behavior.

## References

- Research: `/Users/speed/wreckit/.wreckit/items/030-update-documentation-with-supported-sdk-options/research.md`
- Schema definitions: `src/schemas.ts:36-70`
- Amp SDK runner: `src/agent/amp-sdk-runner.ts`
- Codex SDK runner: `src/agent/codex-sdk-runner.ts`
- OpenCode SDK runner: `src/agent/opencode-sdk-runner.ts`
- Tool allowlists: `src/agent/toolAllowlist.ts:57-117`
- Integration tests: `src/__tests__/sdk-integration/*.integration.test.ts`
- Current README.md: lines 163-208
- Current MIGRATION.md: lines 107-175
- Current AGENTS.md: lines 79-93
- Current ROADMAP.md: line 26
