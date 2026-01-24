# Research: Create MIGRATION.md with step-by-step guide from process mode to SDK mode

**Date**: 2026-01-24
**Item**: 023-create-migrationmd-with-step-by-step-guide-from-pr

## Research Question
From milestone [M1] Complete Missing Documentation

**Motivation:** Strategic milestone: Complete Missing Documentation

## Summary

The wreckit project has migrated from spawning external CLI agents (process mode) to using the Claude Agent SDK directly (SDK mode) as the default execution method. The README.md (line 208) and CHANGELOG.md (lines 35, 45, 67) reference a MIGRATION.md file that does not exist. This file is also listed in package.json's "files" array (line 14) indicating it should be shipped with the package.

The migration guide needs to document three key areas: (1) configuration changes between the two modes, (2) environment variable setup for SDK authentication, and (3) troubleshooting common migration issues. The codebase has extensive existing documentation and implementation details that inform what the migration guide should contain, including automatic fallback behavior from SDK to process mode when authentication fails.

The implementation already supports backward compatibility - existing process mode configurations continue to work without changes. The migration guide should explain how to opt into SDK mode, what benefits it provides, and how to diagnose issues when migrating.

## Current State Analysis

### Existing Implementation

The codebase has a complete implementation of both execution modes:

- **SDK mode (claude_sdk)**: Uses `@anthropic-ai/claude-agent-sdk` package directly, with in-process execution
- **Process mode**: Spawns external CLI tools (amp, claude) as subprocesses with stdio pipes
- **Automatic migration**: `src/config.ts:74-106` has `migrateAgentConfig()` that converts legacy mode-based config to new kind-based format

### Key Files

- `README.md:165-206` - Documents both SDK Mode and Process Mode configuration examples
- `CHANGELOG.md:16-73` - Version 1.0.0 release notes with migration notes section
- `package.json:14` - Lists MIGRATION.md in "files" array (file doesn't exist)
- `src/schemas.ts:14` - `AgentModeSchema = z.enum(["process", "sdk"])` (legacy)
- `src/schemas.ts:36-70` - New discriminated union schemas (ProcessAgentSchema, ClaudeSdkAgentSchema, etc.)
- `src/config.ts:45-68` - DEFAULT_CONFIG uses claude_sdk as default agent kind
- `src/config.ts:74-106` - `migrateAgentConfig()` function for automatic legacy config migration
- `src/agent/runner.ts:160-205` - `runAgent()` with automatic fallback from SDK to process mode
- `src/agent/claude-sdk-runner.ts:8-112` - SDK execution with detailed error handling
- `src/agent/claude-sdk-runner.ts:114-173` - `handleSdkError()` with authentication help text
- `src/agent/env.ts:1-108` - Environment variable resolution with precedence
- `specs/008-agent-runtime.md:56-103` - Detailed specification for both modes
- `AGENTS.md:97-116` - Environment variable resolution documentation

### Configuration Formats

**Legacy (process mode):**
```json
{
  "agent": {
    "mode": "process",
    "command": "claude",
    "args": ["--dangerously-skip-permissions", "--print"],
    "completion_signal": "<promise>COMPLETE</promise>"
  }
}
```

**New (kind-based SDK mode):**
```json
{
  "agent": {
    "kind": "claude_sdk",
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 4096
  }
}
```

**Minimal SDK mode (inherits defaults):**
```json
{
  "agent": {
    "mode": "sdk"
  }
}
```

### Environment Variable Sources (precedence high to low)

1. `.wreckit/config.local.json` `agent.env` - Project-specific, gitignored
2. `.wreckit/config.json` `agent.env` - Project defaults
3. `process.env` - Shell environment
4. `~/.claude/settings.json` `env` - Claude user settings

### Key Environment Variables

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Direct API authentication |
| `ANTHROPIC_BASE_URL` | Custom endpoint (e.g., Zai proxy) |
| `ANTHROPIC_AUTH_TOKEN` | Alternative auth for custom endpoints |

### Diagnostic Command

`wreckit sdk-info` - Shows resolved environment, account info, and supported models (`src/commands/sdk-info.ts`)

## Technical Considerations

### Dependencies

- Claude Agent SDK: `@anthropic-ai/claude-agent-sdk` (currently ^0.2.7 per package.json:53)
- No additional dependencies needed for migration documentation

### Patterns to Follow

- Documentation structure should match existing README.md style
- Configuration examples should use JSON format with comments explaining each field
- Error messages should match those in `claude-sdk-runner.ts:134-167` (handleSdkError)
- Troubleshooting should reference `wreckit sdk-info` command

### Backward Compatibility

The implementation ensures backward compatibility through:

1. **Config migration**: `migrateAgentConfig()` automatically converts `mode: "sdk"` to `kind: "claude_sdk"`
2. **Automatic fallback**: `runAgent()` falls back to process mode if SDK auth fails (runner.ts:188-199)
3. **Legacy format support**: `ConfigSchema` accepts both LegacyAgentConfigSchema and AgentConfigUnionSchema (schemas.ts:86)

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Users may not have ANTHROPIC_API_KEY set | High | Document multiple credential sources and diagnostic commands |
| SDK authentication errors may confuse users | Medium | Include detailed troubleshooting for auth issues (leverage handleSdkError help text) |
| Breaking changes in SDK API | Low | Document SDK version compatibility; SDK is pinned in package.json |
| Users on custom API endpoints (Zai, etc.) | Medium | Document ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN configuration |
| Confusion between legacy and new config formats | Medium | Show both formats with clear "prefer this" guidance |

## Recommended Approach

Create MIGRATION.md with the following structure:

1. **Overview** - What changed and why (performance, error handling, built-in tools)
2. **Quick Migration** - Minimal steps for users who want to "just migrate"
3. **Configuration Reference** - Detailed explanation of old vs new config formats
4. **Environment Setup** - How to configure credentials (API key vs custom endpoints)
5. **Verification** - How to test that migration succeeded (`wreckit sdk-info`, `--dry-run`)
6. **Fallback Behavior** - Explain automatic fallback to process mode
7. **Troubleshooting** - Common issues and solutions (leverage handleSdkError help text)
8. **Staying on Process Mode** - For users who prefer external CLI agents

The guide should:
- Start with the simplest path (delete old config, let defaults work)
- Progress to more complex scenarios (custom endpoints, specific models)
- Include copy-paste-ready configuration snippets
- Reference existing commands (`wreckit sdk-info`) for diagnostics

## Open Questions

1. **Model selection**: Should we document available models? The `sdk-info` command can fetch this dynamically.
2. **Amp SDK vs Claude SDK**: The experimental Amp SDK is mentioned in specs but marked "not yet implemented" in amp-sdk-runner.ts:79. Should migration guide mention it?
3. **Related items**: Items 024 (env var docs) and 025 (troubleshooting) overlap with this task. Should we coordinate or include their content in MIGRATION.md?

## Related Items

- **024-document-environment-variable-configuration-for-sd**: Documents environment variables in detail - consider merging content
- **025-add-troubleshooting-section-for-common-migration-i**: Troubleshooting section - consider merging content
- Both items are from the same M1 milestone and may be better addressed as part of this MIGRATION.md
