# Update documentation with supported SDK options Implementation Plan

## Overview

Update wreckit's documentation to include the three experimental SDK backends (`amp_sdk`, `codex_sdk`, `opencode_sdk`) that were added as part of milestone [M2] Finish Experimental SDK Integrations. The documentation currently covers only `process` and `claude_sdk` modes despite all five agent kinds being fully implemented and tested.

## Current State

### What Exists

The codebase has full support for five agent backends via a discriminated union configuration system:

| Agent Kind | Schema Location | Runner Implementation | Documentation |
|------------|-----------------|----------------------|---------------|
| `process` | `src/schemas.ts:36-41` | `src/agent/runner.ts` | README.md, MIGRATION.md |
| `claude_sdk` | `src/schemas.ts:43-48` | `src/agent/claude-sdk-runner.ts` | README.md, MIGRATION.md |
| `amp_sdk` | `src/schemas.ts:50-53` | `src/agent/amp-sdk-runner.ts` | **Missing** |
| `codex_sdk` | `src/schemas.ts:55-58` | `src/agent/codex-sdk-runner.ts` | **Missing** |
| `opencode_sdk` | `src/schemas.ts:60-62` | `src/agent/opencode-sdk-runner.ts` | **Missing** |

### Key Discoveries

1. **All SDK runners share identical behavior** (`src/agent/amp-sdk-runner.ts:1-372`, `src/agent/codex-sdk-runner.ts:1-372`, `src/agent/opencode-sdk-runner.ts:1-372`):
   - Same `@anthropic-ai/claude-agent-sdk` query API
   - Same environment resolution via `buildSdkEnv()`
   - Same error handling categories (auth, rate limit, context, network)
   - Same 3600 second default timeout
   - Same `bypassPermissions` mode

2. **Configuration differences** are minimal:
   - `amp_sdk`: Optional `model` override
   - `codex_sdk`: Required `model` with default `"codex-1"`
   - `opencode_sdk`: No configuration options (simplest)

3. **README.md structure** (lines 163-208) has clear subsections pattern:
   - "SDK Mode (Recommended)" with JSON example
   - "Process Mode (Default)" with Amp and Claude CLI examples

4. **MIGRATION.md structure** (lines 107-175) has configuration reference pattern:
   - Legacy vs new format examples
   - Environment variable documentation
   - Troubleshooting section

5. **Documentation uses legacy `mode` terminology** in some places but code uses `kind` discriminator. README.md line 173-178 shows old `mode: "sdk"` format.

## Desired End State

### Documentation Coverage

| Agent Kind | README.md | MIGRATION.md | AGENTS.md | CHANGELOG.md |
|------------|-----------|--------------|-----------|--------------|
| `process` | Documented | Documented | Updated | Existing |
| `claude_sdk` | Documented | Documented | Updated | Existing |
| `amp_sdk` | **Added** | **Added** | **Added** | **Added** |
| `codex_sdk` | **Added** | **Added** | **Added** | **Added** |
| `opencode_sdk` | **Added** | **Added** | **Added** | **Added** |

### Verification Criteria

1. All five agent kinds documented with configuration examples
2. Users can find and understand experimental SDK options
3. Environment variable resolution documented as shared across all SDK modes
4. "Experimental" label clearly communicated
5. No broken internal links or inconsistent terminology

## What We're NOT Doing

1. **NOT updating `wreckit sdk-info` command** - This is a separate feature request
2. **NOT adding new configuration options** to experimental SDK schemas
3. **NOT changing any code behavior** - Documentation only
4. **NOT creating tutorials** - Reference documentation only
5. **NOT documenting specific use cases** for each SDK (not enough product guidance)
6. **NOT migrating legacy `mode` syntax** in existing docs to `kind` syntax universally (only adding new `kind`-based examples)

## Implementation Approach

The documentation update follows a layered approach:
1. **README.md** - Add user-facing quick reference for all SDK options
2. **MIGRATION.md** - Add detailed configuration reference for experimental SDKs
3. **AGENTS.md** - Update developer reference with all agent kinds
4. **CHANGELOG.md** - Add changelog entry for experimental SDK documentation

---

## Phase 1: Update README.md with Experimental SDK Documentation

### Overview

Expand the "Agent Options" section (lines 163-208) to include all five agent kinds with clear configuration examples and a comparison table.

### Changes Required

#### 1. README.md Agent Options Section
**File**: `README.md`
**Lines**: 163-208
**Changes**:
- Update "SDK Mode (Recommended)" to use new `kind: "claude_sdk"` format
- Add "Experimental SDK Modes" subsection after SDK Mode section
- Add comparison table of all agent options
- Keep existing Process Mode examples

**Updated Content:**

Replace lines 163-208 with expanded section:

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

Uses the Claude Agent SDK directly for best performance and error handling:

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

Wreckit also supports experimental SDK integrations. These use the same underlying SDK infrastructure and share authentication/environment variable resolution with `claude_sdk`.

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

Spawns an external CLI process (for backward compatibility or custom agents):

**Amp CLI:**
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

**Claude CLI:**
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

See [MIGRATION.md](./MIGRATION.md) for detailed configuration and environment variable documentation.
```

### Success Criteria

#### Automated Verification:
- [ ] No build errors: `bun run build`
- [ ] Type checking passes: `bun run typecheck`
- [ ] Linting passes: `bun run lint`

#### Manual Verification:
- [ ] README.md renders correctly in GitHub preview
- [ ] All JSON examples are valid JSON
- [ ] Table renders correctly
- [ ] Links to MIGRATION.md work

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to next phase.

---

## Phase 2: Update MIGRATION.md with Experimental SDK Configuration Reference

### Overview

Add a new section documenting experimental SDK configuration, including schema details and switching between SDK modes.

### Changes Required

#### 1. MIGRATION.md - Add Experimental SDKs Section
**File**: `MIGRATION.md`
**Location**: After "Configuration Reference" section (after line 186)
**Changes**: Add new section "Experimental SDK Modes"

**New Content to Insert:**

```markdown
### Experimental SDK Modes

Wreckit supports experimental SDK backends for specialized use cases. All experimental SDKs:

- Use the same `@anthropic-ai/claude-agent-sdk` query API
- Share the same environment variable resolution (see [Environment Variables](#environment-variables))
- Have the same error handling and timeout behavior (3600 seconds default)
- Support MCP servers and tool restrictions

> **Note:** These SDKs are marked experimental and may have API changes in future releases.

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

### Success Criteria

#### Automated Verification:
- [ ] No build errors: `bun run build`
- [ ] Linting passes: `bun run lint`

#### Manual Verification:
- [ ] MIGRATION.md renders correctly in GitHub preview
- [ ] All JSON examples are valid JSON
- [ ] Tables render correctly
- [ ] Section links work within document

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to next phase.

---

## Phase 3: Update AGENTS.md with All Agent Kinds

### Overview

Update the developer-facing AGENTS.md to list all five agent kinds in the architecture and configuration sections.

### Changes Required

#### 1. AGENTS.md - Update Config Section
**File**: `AGENTS.md`
**Lines**: 79-93
**Changes**: Update the config example to show `kind`-based format and list all options

**Updated Content:**

Replace lines 79-93:

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

See README.md for configuration examples for each kind.
```

### Success Criteria

#### Automated Verification:
- [ ] No build errors: `bun run build`
- [ ] Linting passes: `bun run lint`

#### Manual Verification:
- [ ] AGENTS.md renders correctly in GitHub preview
- [ ] JSON example is valid
- [ ] Table renders correctly

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to next phase.

---

## Phase 4: Update CHANGELOG.md with Experimental SDK Entry

### Overview

Add a changelog entry documenting the experimental SDK support.

### Changes Required

#### 1. CHANGELOG.md - Add Entry to [Unreleased]
**File**: `CHANGELOG.md`
**Location**: Under `## [Unreleased]` section (after line 8)
**Changes**: Add new "Added" section for experimental SDK documentation

**New Content:**

```markdown
### Added
- Documentation for experimental SDK modes (`amp_sdk`, `codex_sdk`, `opencode_sdk`)
  - All experimental SDKs share authentication and environment variable resolution with `claude_sdk`
  - See README.md "Experimental SDK Modes" section for configuration examples
  - See MIGRATION.md "Experimental SDK Modes" section for detailed reference
```

### Success Criteria

#### Automated Verification:
- [ ] No build errors: `bun run build`
- [ ] Linting passes: `bun run lint`

#### Manual Verification:
- [ ] CHANGELOG.md renders correctly
- [ ] Entry follows Keep a Changelog format

**Note**: Complete all automated verification, then pause for manual confirmation.

---

## Testing Strategy

### Unit Tests
- N/A - Documentation changes only, no code changes

### Integration Tests
- N/A - Documentation changes only, no code changes

### Manual Testing Steps

1. **Verify README.md rendering:**
   - Open README.md in GitHub preview (or VS Code markdown preview)
   - Verify table renders with all 5 agent kinds
   - Verify all JSON code blocks are syntax highlighted
   - Verify link to MIGRATION.md works

2. **Verify MIGRATION.md rendering:**
   - Open MIGRATION.md in preview
   - Verify new "Experimental SDK Modes" section appears
   - Verify tables render correctly
   - Verify JSON examples are valid

3. **Verify AGENTS.md rendering:**
   - Open AGENTS.md in preview
   - Verify config example uses `kind: "claude_sdk"` format
   - Verify agent kinds table renders

4. **Verify CHANGELOG.md rendering:**
   - Open CHANGELOG.md in preview
   - Verify new entry under [Unreleased]
   - Verify format matches existing entries

5. **Cross-reference accuracy:**
   - Verify `src/schemas.ts` agent schemas match documented options
   - Verify default values in docs match schema defaults

## Migration Notes

N/A - Documentation changes only. No data migration required.

## References

- Research: `/Users/speed/wreckit/.wreckit/items/030-update-documentation-with-supported-sdk-options/research.md`
- Schema definitions: `src/schemas.ts:36-70`
- Agent dispatch: `src/agent/runner.ts:389-493`
- Amp SDK runner: `src/agent/amp-sdk-runner.ts:1-372`
- Codex SDK runner: `src/agent/codex-sdk-runner.ts:1-372`
- OpenCode SDK runner: `src/agent/opencode-sdk-runner.ts:1-372`
