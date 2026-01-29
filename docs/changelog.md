# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Documentation for experimental SDK modes (`amp_sdk`, `codex_sdk`, `opencode_sdk`)
  - All experimental SDKs share authentication and environment variable resolution with `claude_sdk`
  - See README.md "Experimental SDK Modes" section for configuration examples
  - See MIGRATION.md "Experimental SDK Modes" section for detailed reference

### Removed
- Removed duplicate `idea` CLI command. Use `wreckit ideas` instead.
  - The `idea` command was identical to `ideas` and caused confusion
  - All functionality is preserved in the `ideas` command
  - `ideas` supports file input (`-f`), stdin, and interactive interview mode
- Removed deprecated legacy agent APIs (breaking change)
  - Removed `runAgent()` function - use `runAgentUnion()` instead
  - Removed `getAgentConfig()` function - use `getAgentConfigUnion()` instead
  - Removed `AgentConfig` type - use `AgentConfigUnion` from `schemas.ts` instead
  - Removed `RunAgentOptions` type - use `UnionRunAgentOptions` instead
  - Removed supporting functions: `simulateMockAgent()`, `runLegacyProcessAgent()`
  - Legacy mode-based API (`mode: "process" | "sdk"`) replaced by kind-based API (`kind: "process" | "claude_sdk" | "amp_sdk" | "codex_sdk" | "opencode_sdk" | "rlm"`)
  - All internal code and tests have been migrated to the modern API
  - **Breaking change**: External consumers importing these functions/types will need to update their code (if any exist)

**Migration guide for external consumers:**

If you were using the deprecated APIs directly from the wreckit agent module:

```typescript
// ❌ Old (removed)
import { runAgent, getAgentConfig, AgentConfig } from "wreckit/agent";
const config: AgentConfig = getAgentConfig(resolvedConfig);
await runAgent({ config, cwd, prompt, logger });

// ✅ New (current)
import { runAgentUnion, getAgentConfigUnion } from "wreckit/agent";
import type { AgentConfigUnion } from "wreckit/schemas";
const config: AgentConfigUnion = getAgentConfigUnion(resolvedConfig);
await runAgentUnion({ config, cwd, prompt, logger });
```

**Key differences:**
- Mode-based (`mode: "process" | "sdk"`) → Kind-based (`kind: "process" | "claude_sdk" | "amp_sdk" | "codex_sdk" | "opencode_sdk" | "rlm"`)
- No automatic fallback - explicitly select agent kind via config
- Agent config fields simplified - `timeout_seconds` and `max_iterations` moved to top-level `ConfigResolved`

## [1.0.0] - 2025-01-13

### Major Changes

### SDK Agent Mode (Default)
- Wreckit now uses the Claude Agent SDK by default for agent execution
- Significantly improved performance with in-process agent execution
- Better error handling with structured error types
- Built-in context management and tool support
- Automatic fallback to process mode if SDK authentication fails

### Configuration
- New `agent.mode` option: "sdk" (default) or "process"
- New `agent.sdk_model` option for model selection
- New `agent.sdk_max_tokens` option for token limits
- New `agent.sdk_tools` option for tool customization
- Backward compatible: existing `agent.command` configs still work

### Migration
- See [MIGRATION.md](/migration/.md) for migration guide
- Process mode remains available via `agent.mode: "process"`
- All existing configurations continue to work

### Fixes
- Fixed timeout handling in SDK mode
- Improved error messages for authentication failures
- Better streaming output handling

### Documentation
- Added MIGRATION.md with detailed migration guide
- Updated README.md with SDK mode documentation
- Added integration testing documentation

## Upgrade Notes

If you have a custom `agent.command` configuration, wreckit will continue using process mode. To migrate to SDK mode:

1. Update `.wreckit/config.json`:
   ```json
   {
     "agent": {
       "mode": "sdk",
       "sdk_model": "claude-sonnet-4-20250514"
     }
   }
   ```

2. Ensure `ANTHROPIC_API_KEY` is set or run `claude` to authenticate

3. Test with `--dry-run` first

See [MIGRATION.md](/migration/.md) for more details.

## [0.9.1] - Previous Release

- Initial release with process-based agent execution
- Support for Amp and Claude CLI agents
- Full workflow: research → plan → implement → PR
