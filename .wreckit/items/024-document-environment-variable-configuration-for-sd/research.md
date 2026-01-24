# Research: Document environment variable configuration for SDK mode (ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL)

**Date**: 2026-01-24
**Item**: 024-document-environment-variable-configuration-for-sd

## Research Question
From milestone [M1] Complete Missing Documentation

**Motivation:** Strategic milestone: Complete Missing Documentation

## Summary

This item focuses on documenting environment variable configuration for wreckit's SDK mode. The environment variable system is fully implemented in `src/agent/env.ts` with a well-defined precedence model that merges variables from four sources. The documentation gap is that while MIGRATION.md comprehensively covers the environment variables, there is no standalone, focused reference for environment variable configuration that users can quickly consult.

The existing MIGRATION.md (created as part of item 023) already contains extensive environment variable documentation in the "Environment Variables" section (lines 189-259). This creates an opportunity to either: (1) extract and expand that section into standalone documentation, or (2) ensure MIGRATION.md serves as the canonical reference and add cross-references from other documentation files.

Given the current state where MIGRATION.md thoroughly documents environment variables, this item may be satisfied by verifying the documentation is complete and adding cross-references from README.md and AGENTS.md to the MIGRATION.md section. Additional work could include adding a dedicated "Environment Variables" section to README.md or creating a separate ENVIRONMENT.md file for quick reference.

## Current State Analysis

### Existing Implementation

The environment variable resolution system is fully implemented in `src/agent/env.ts`:

- **Source merging** (`env.ts:79-98`): Merges from 4 sources with explicit precedence
- **Allowed prefixes** (`env.ts:16`): `ANTHROPIC_`, `CLAUDE_CODE_`, `API_TIMEOUT` - only these prefixes are imported from `~/.claude/settings.json`
- **Custom endpoint handling** (`env.ts:100-105`): When `ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN` are set, `ANTHROPIC_API_KEY` is automatically blanked to prevent credential fallback
- **Diagnostic command** (`src/commands/sdk-info.ts`): `wreckit sdk-info` displays resolved environment

### Existing Documentation

Documentation is spread across multiple files:

| File | Coverage | Lines |
|------|----------|-------|
| **MIGRATION.md** | Comprehensive env var section | 189-259 |
| **AGENTS.md** | Brief env var resolution description | 97-116 |
| **README.md** | Mentions SDK mode needs ANTHROPIC_API_KEY | 329 |
| **specs/008-agent-runtime.md** | Spec-level env var documentation | 299-314 |

### Key Files

- `src/agent/env.ts:1-108` - Complete environment variable resolution implementation
- `src/agent/env.ts:16` - Allowed prefixes for Claude settings import: `ANTHROPIC_`, `CLAUDE_CODE_`, `API_TIMEOUT`
- `src/agent/env.ts:21-44` - `readClaudeUserEnv()` reads from `~/.claude/settings.json`
- `src/agent/env.ts:49-67` - `readWreckitEnv()` reads from wreckit config files
- `src/agent/env.ts:79-98` - `buildSdkEnv()` merges all sources with precedence
- `src/agent/env.ts:100-105` - Auto-blank `ANTHROPIC_API_KEY` when custom endpoint is configured
- `src/commands/sdk-info.ts:8-79` - `wreckit sdk-info` diagnostic command
- `src/agent/claude-sdk-runner.ts:134-167` - Authentication error help text
- `MIGRATION.md:189-259` - Comprehensive environment variable documentation
- `AGENTS.md:97-116` - Environment variable resolution reference
- `README.md:329` - Brief SDK mode requirements mention

### Environment Variables Used

| Variable | Purpose | Where Documented |
|----------|---------|------------------|
| `ANTHROPIC_API_KEY` | Direct Anthropic API authentication | MIGRATION.md:197, env.ts:102 |
| `ANTHROPIC_BASE_URL` | Custom API endpoint (e.g., Zai proxy) | MIGRATION.md:198, env.ts:101 |
| `ANTHROPIC_AUTH_TOKEN` | Authentication for custom endpoints | MIGRATION.md:199, env.ts:101 |
| `ANTHROPIC_MODEL` | Model override | sdk-info.ts:23 |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | Default Sonnet model | sdk-info.ts:24 |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | Default Haiku model | sdk-info.ts:25 |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | Default Opus model | sdk-info.ts:26 |
| `CLAUDE_CODE_*` | Claude Code settings (allowed prefix) | env.ts:16 |
| `API_TIMEOUT` | Timeout settings (allowed prefix) | env.ts:16 |

### Resolution Precedence

From `env.ts:92-98`, the merge order (highest to lowest priority):

1. `.wreckit/config.local.json` `agent.env` - Project-specific, gitignored
2. `.wreckit/config.json` `agent.env` - Project defaults
3. `process.env` - Shell environment
4. `~/.claude/settings.json` `env` - Claude user settings

### Configuration Examples

**Direct Anthropic API (shell):**
```bash
export ANTHROPIC_API_KEY=sk-ant-api03-...
```

**Direct Anthropic API (`~/.claude/settings.json`):**
```json
{
  "env": {
    "ANTHROPIC_API_KEY": "sk-ant-api03-..."
  }
}
```

**Custom endpoint (`.wreckit/config.local.json`):**
```json
{
  "agent": {
    "env": {
      "ANTHROPIC_BASE_URL": "https://api.z.ai/api/anthropic",
      "ANTHROPIC_AUTH_TOKEN": "your-zai-token"
    }
  }
}
```

**Project-wide defaults (`.wreckit/config.json`):**
```json
{
  "agent": {
    "env": {
      "ANTHROPIC_BASE_URL": "https://your-company-proxy.example.com"
    }
  }
}
```

## Technical Considerations

### Dependencies

This item depends on:
- **Item 023** (MIGRATION.md creation): Already completed with extensive env var documentation

### Patterns to Follow

- Documentation should be consistent with existing style in MIGRATION.md
- Include JSON configuration examples with comments
- Reference `wreckit sdk-info` for diagnostics
- Follow the table-based format used in MIGRATION.md for variable references

### Integration Points

Environment variables are used by:
- `src/agent/claude-sdk-runner.ts` - SDK execution
- `src/domain/ideas-interview.ts` - Interview mode
- `src/commands/sdk-info.ts` - Diagnostic output

### What's Missing from Documentation

1. **README.md lacks detail**: Line 329 only says "Set `ANTHROPIC_API_KEY` environment variable" - no mention of custom endpoints
2. **No quick reference**: Users need to read MIGRATION.md to find env var details
3. **Model selection variables**: `ANTHROPIC_MODEL`, `ANTHROPIC_DEFAULT_*_MODEL` are shown in sdk-info but not documented in MIGRATION.md
4. **CLAUDE_CODE_ and API_TIMEOUT prefixes**: Mentioned in code but not documented anywhere

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Duplication across files | Medium | Cross-reference from README.md/AGENTS.md to MIGRATION.md rather than duplicating |
| Documentation drift | Low | Keep canonical reference in one place (MIGRATION.md) |
| Users missing env var docs | Medium | Add clear pointers in README.md and error messages |
| Undocumented variables | Low | Document model selection variables and allowed prefixes |

## Recommended Approach

### Option A: Enhance Existing Documentation (Recommended)

1. **Add missing variables to MIGRATION.md**:
   - Document `ANTHROPIC_MODEL`
   - Document `ANTHROPIC_DEFAULT_SONNET_MODEL`, `ANTHROPIC_DEFAULT_HAIKU_MODEL`, `ANTHROPIC_DEFAULT_OPUS_MODEL`
   - Document that `CLAUDE_CODE_*` and `API_TIMEOUT` prefixes are also imported from Claude settings

2. **Add cross-references**:
   - In README.md "Requirements" section, add link to MIGRATION.md environment section
   - In AGENTS.md "Environment Variable Resolution" section, note that full details are in MIGRATION.md

3. **Expand README.md Requirements section**:
   - Add brief mention of `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN` for custom endpoints
   - Reference `wreckit sdk-info` diagnostic command

### Option B: Create Standalone ENVIRONMENT.md

Create a new `ENVIRONMENT.md` file with:
- Complete environment variable reference
- Configuration examples for all scenarios
- Troubleshooting section

**Pros**: Single reference location, easy to find
**Cons**: More documentation to maintain, risk of drift from MIGRATION.md

### Implementation Steps (Option A)

1. Read MIGRATION.md to confirm current state
2. Add missing model selection variables (`ANTHROPIC_MODEL`, `ANTHROPIC_DEFAULT_*_MODEL`)
3. Document allowed prefixes for Claude settings import
4. Update README.md to link to MIGRATION.md environment section
5. Update AGENTS.md to reference MIGRATION.md for full details
6. Verify `wreckit sdk-info` output matches documentation

## Open Questions

1. **Should model selection variables be documented?** They're displayed in `sdk-info` but may be internal/advanced. Need to verify if they're officially supported.

2. **Is CLAUDE_CODE_ prefix intentionally undocumented?** It's in the allowed prefixes but not mentioned in any docs. May be for internal use only.

3. **Coordination with item 025**: Item 025 is "Add troubleshooting section for common migration issues" - should environment-related troubleshooting live there or in this item's scope?

## Related Items

- **023-create-migrationmd-with-step-by-step-guide-from-pr**: Completed - created MIGRATION.md which contains the primary env var documentation
- **025-add-troubleshooting-section-for-common-migration-i**: Upcoming - may include env var troubleshooting content
