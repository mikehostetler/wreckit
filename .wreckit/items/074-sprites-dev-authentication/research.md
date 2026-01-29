# Research: Sprites.dev Authentication and CLI Integration

**Date**: 2025-01-27
**Item**: 074-sprites-dev-authentication

## Research Question

Incorporate the Sprites API Token and support the official `sprite` CLI from sprites.dev. This ensures Wreckit can authenticate with the remote Sprites platform and use the `sprite` command for direct VM interaction (create, console, exec) alongside the `wisp` session manager.

## Summary

The current Wreckit codebase has implemented local Sprite support through the `wisp` CLI (Firecracker microVMs) in Item 073, but lacks integration with the remote Sprites.dev platform and its official `sprite` CLI. This research identifies that the task requires extending the existing `SpriteAgentConfig` schema to include authentication tokens, creating parallel `runSpriteCommand()` functions for the remote CLI, and updating the environment variable resolution system to securely handle Sprites.dev tokens.

The codebase provides excellent patterns to follow: the existing `wisp` CLI integration in `src/agent/sprite-runner.ts:77-191` demonstrates the core primitive pattern with proper timeout handling, error detection, and SIGTERM→SIGKILL escalation. The environment variable resolution system in `src/agent/env.ts:16-23` shows how to securely handle API keys with proper precedence (config.local.json → config.json → process.env). The schema evolution pattern in `src/schemas.ts:72-79` uses Zod's `.optional()` and `.default()` for backward compatibility.

Key findings reveal that no `SPRITES_` prefix currently exists in `ALLOWED_PREFIXES` at `src/agent/env.ts:16-23`, meaning Sprites tokens cannot be resolved from environment variables. The `SpriteAgentConfig` at `src/schemas.ts:72-79` has no `token` field for authentication. All Sprite operations (start, attach, list, kill) are hardcoded to use `wisp` CLI only, with no abstraction for switching between local and remote CLIs.

## Current State Analysis

### Existing Implementation

**Sprite Support (Item 073)**: Wreckit has basic Sprite support for local Firecracker microVMs using the `wisp` CLI:

- **Schema**: `SpriteAgentSchema` defined in `src/schemas.ts:72-79` with fields:
  - `wispPath`: Path to wisp CLI (default: "wisp")
  - `maxVMs`: Maximum concurrent VMs (default: 5)
  - `defaultMemory`: Memory allocation (default: "512MiB")
  - `defaultCPUs`: CPU allocation (default: "1")
  - `timeout`: Operation timeout in seconds (default: 300)
  - **Missing**: No `token` field for Sprites.dev authentication
  - **Missing**: No `spritePath` field for the remote CLI binary

- **Sprite Runner**: `src/agent/sprite-runner.ts:77-520` implements:
  - `runWispCommand()` at lines 77-191: Core primitive for executing wisp commands with timeout and error handling
  - `startSprite()`, `attachSprite()`, `listSprites()`, `killSprite()` at lines 237-374: High-level operations
  - `runSpriteAgent()` at lines 404-519: Agent runner interface that currently only verifies wisp connectivity
  - **Limitation**: All functions are hardcoded to use `config.wispPath`, no abstraction for different CLI types

- **CLI Commands**: `src/commands/sprite.ts:81-375` provides:
  - `spriteStartCommand` (lines 81-151), `spriteListCommand` (lines 158-239), `spriteKillCommand` (lines 246-307), `spriteAttachCommand` (lines 314-375)
  - JSON output support via `--json` flag
  - Configuration validation via `getSpriteConfig()` at lines 50-63
  - **Limitation**: All commands target `wisp` CLI only, no `--remote` flag or CLI selection logic

- **RLM Tools**: `src/agent/rlm-tools.ts:211-450` includes:
  - `SpawnSpriteTool`, `AttachSpriteTool`, `ListSpritesTool`, `KillSpriteTool`
  - `DEFAULT_SPRITE_CONFIG` at lines 211-218 with hardcoded `wispPath: "wisp"`
  - **Limitation**: No token support, no remote CLI support, only local wisp operations

- **Dispatcher Integration**: `src/agent/dispatcher.ts:168-181` handles sprite agent dispatch:
  - Imports `runSpriteAgent` from sprite-runner
  - Passes `SpriteAgentConfig` to the runner
  - **Gap**: No CLI type detection or token validation

### Environment Variable Pattern

**Environment Resolution**: `src/agent/env.ts` implements a robust precedence system:

1. `.wreckit/config.local.json` agent.env (project-specific, gitignored)
2. `.wreckit/config.json` agent.env (project defaults)
3. `process.env` (shell environment)
4. `~/.claude/settings.json` env (Claude user settings)

**Allowed Prefixes** at lines 16-23:
- `ANTHROPIC_`
- `CLAUDE_CODE_`
- `API_TIMEOUT`
- `OPENAI_`
- `GOOGLE_`
- `ZAI_`
- **Missing**: No `SPRITES_` or `SPRITE_` prefix for token resolution

**AxAI Pattern** at lines 142-180:
- `buildAxAIEnv()` function shows how to handle provider-specific environment variables
- Demonstrates token mapping (e.g., `ANTHROPIC_AUTH_TOKEN` → `ANTHROPIC_API_KEY`)
- Shows conditional logic for different providers (anthropic, zai, openai, google)
- **Pattern to follow**: Create similar `buildSpriteEnv()` function

### Error Handling

**Sprite-Specific Errors**: `src/errors.ts:408-463` defines:
- `WispNotFoundError` (line 414) - when wisp binary not found
- `SpriteStartError` (line 429) - when VM start fails
- `SpriteAttachError` (line 442) - when attach fails
- `SpriteKillError` (line 455) - when kill fails
- **Pattern**: Each error extends `WreckitError` with descriptive messages and error codes
- **Gap**: No authentication-specific errors (e.g., `SpriteAuthError`, `SpriteTokenNotFoundError`)

**Error Codes** at lines 15-61:
- `WISP_NOT_FOUND`, `SPRITE_START_FAILED`, `SPRITE_ATTACH_FAILED`, `SPRITE_KILL_FAILED` defined
- **Missing**: No `SPRITE_TOKEN_MISSING`, `SPRITE_AUTH_FAILED` codes

### Configuration Management

**Config Schema**: `src/config.ts` and `src/schemas.ts`:
- Uses Zod for schema validation
- Supports discriminated unions for agent kinds at `src/schemas.ts:81-89`
- Migration logic for legacy configs at `src/config.ts:77-109`
- **Integration**: `applyOverrides()` at `src/config.ts:145-194` validates agent kinds (line 154)
- **Agent kind validation**: Line 154 lists valid kinds: `["process", "claude_sdk", "amp_sdk", "codex_sdk", "opencode_sdk", "rlm", "sprite"]`

**Gitignore**: `.wreckit/config.local.json` is gitignored at `.gitignore:7`, making it suitable for storing tokens

### Security Considerations

**Token Redaction Pattern** (from `src/agent/env.ts:124-129`):
- Existing pattern shows redaction of auth tokens in debug logs
- Code checks for custom base URL and auth token, then blanks API_KEY
- **Pattern to follow**: Implement similar redaction for Sprites token in all logging paths

## Technical Considerations

### Dependencies

**External Dependencies**:
- `sprite` CLI from Sprites.dev (to be installed by users)
- No additional npm packages required (use `spawn` from Node.js)

**Internal Modules**:
- `src/schemas.ts:72-79` - Add `token` field and `spritePath` field to `SpriteAgentSchema`
- `src/agent/sprite-runner.ts:77-520` - Support both `wisp` and `sprite` CLIs via new functions
- `src/agent/env.ts:16-23` - Add `SPRITES_` to `ALLOWED_PREFIXES` and create `buildSpriteEnv()`
- `src/agent/rlm-tools.ts:211-450` - Update tools to support token and remote CLI
- `src/commands/sprite.ts:81-375` - Add `--remote` flag and token validation
- `src/errors.ts:408-463` - Add authentication error classes
- `src/agent/dispatcher.ts:168-181` - Potentially add CLI type detection

### Patterns to Follow

**1. Schema Evolution Pattern** (`src/schemas.ts:72-79`):
- Add optional fields with defaults to maintain backward compatibility
- Use Zod's `.optional()` and `.default()` for new fields
- Follow existing pattern: `wispPath: z.string().default("wisp")`

**Example implementation**:
```typescript
export const SpriteAgentSchema = z.object({
  kind: z.literal("sprite"),
  wispPath: z.string().default("wisp"),
  spritePath: z.string().default("sprite"),  // NEW
  token: z.string().optional(),  // NEW - for Sprites.dev auth
  maxVMs: z.number().default(5),
  defaultMemory: z.string().default("512MiB"),
  defaultCPUs: z.string().default("1"),
  timeout: z.number().default(300),
});
```

**2. Environment Variable Pattern** (`src/agent/env.ts`):
- Add `"SPRITES_"` to `ALLOWED_PREFIXES` array at lines 16-23
- Create `buildSpriteEnv()` function following `buildAxAIEnv()` pattern at lines 142-180
- Support `SPRITES_TOKEN` environment variable
- Resolve from: env var → config.local.json → config.json (following precedence at lines 92-133)

**3. CLI Abstraction Pattern** (`src/agent/sprite-runner.ts`):
- Create `runSpriteCommand()` mirroring `runWispCommand()` at lines 77-191
- Add `cliType: "wisp" | "sprite"` to options interfaces
- Implement remote operations: `startRemoteSprite()`, `attachRemoteSprite()`, etc.
- Use token from config when `cliType === "sprite"`
- Inject token via environment variable to spawned process

**4. Error Handling Pattern** (`src/errors.ts:408-463`):
- Add `SPRITE_TOKEN_MISSING`, `SPRITE_AUTH_FAILED` to `ErrorCodes` enum at lines 15-61
- Create `SpriteTokenNotFoundError` class following `WispNotFoundError` pattern at line 414
- Add `SpriteAuthError` for authentication failures
- Follow existing error class pattern with public readonly fields

**5. RLM Tool Enhancement** (`src/agent/rlm-tools.ts:211-450`):
- Update `DEFAULT_SPRITE_CONFIG` at lines 211-218 to include token from environment
- Modify tool functions to accept optional `remote` parameter
- Pass token to sprite-runner functions when using remote CLI
- Consider adding separate tools: `SpawnRemoteSprite` vs `SpawnLocalSprite`

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Token exposure in logs | High | Add redaction logic in logger following pattern at `src/agent/env.ts:124-129`; audit all logging paths in sprite commands and runner |
| Breaking existing wisp workflows | Medium | Make `sprite` CLI opt-in; default to `wisp` for backward compatibility; add `--remote` flag to CLI commands |
| Invalid tokens causing silent failures | Medium | Add token validation before remote operations; fail fast with clear error messages using new `SpriteAuthError` |
| Confusion between local and remote Sprites | Low | Clear naming: document `wisp` for local, `sprite` for remote; add validation to ensure token present when using remote |
| Token stored in repo (accidental commit) | High | `.wreckit/config.local.json` already gitignored (`.gitignore:7`); add pre-commit hook warning; document secure token storage |
| Missing knowledge of sprite CLI interface | Medium | Research required: document how `sprite` CLI accepts authentication (env var vs flag vs config file) before implementation |

## Key Files

| File | Current Purpose | Lines of Interest | Changes Required |
|------|----------------|-------------------|------------------|
| `src/schemas.ts` | Zod schema definitions | 72-79 (`SpriteAgentSchema`) | Add `token?: string`, `spritePath?: string` fields |
| `src/agent/sprite-runner.ts` | Wisp CLI wrapper | 77-191 (`runWispCommand`), 237-374 (operations) | Add `runSpriteCommand()`, remote ops, CLI type detection |
| `src/agent/env.ts` | Environment resolution | 16-23 (`ALLOWED_PREFIXES`), 92-180 (build functions) | Add `SPRITES_` prefix, create `buildSpriteEnv()` |
| `src/commands/sprite.ts` | CLI commands | 81-375 (command implementations) | Add `--remote` flag, token validation, CLI selection logic |
| `src/agent/rlm-tools.ts` | RLM agent tools | 211-450 (Sprite tools) | Update tools to support token and remote CLI |
| `src/errors.ts` | Error classes | 15-61 (`ErrorCodes`), 408-463 (Sprite errors) | Add auth error codes and error classes |
| `src/agent/dispatcher.ts` | Agent dispatcher | 168-181 (sprite case) | Potentially add CLI type detection |
| `.gitignore` | Git ignore patterns | 7 (`config.local.json`) | Already gitignored - suitable for tokens |
| `README.md` | Documentation | 359-369 (Cloud Sandboxes section) | Document Sprites.dev setup and token configuration |

## Recommended Approach

### Phase 1: Schema and Environment Setup

1. **Update `SpriteAgentSchema`** in `src/schemas.ts:72-79`:
   - Add `token?: string` field (optional for backward compatibility)
   - Add `spritePath?: string` field (default: "sprite")
   - Maintain all existing fields to preserve wisp functionality

2. **Extend Environment Resolution** in `src/agent/env.ts`:
   - Add `"SPRITES_"` to `ALLOWED_PREFIXES` array at lines 16-23
   - Create `buildSpriteEnv()` function for Sprite-specific env vars (follow `buildAxAIEnv()` at lines 142-180)
   - Support `SPRITES_TOKEN` and potentially `SPRITES_API_ENDPOINT`
   - Ensure proper precedence: config.local.json → config.json → process.env

3. **Add Authentication Errors** in `src/errors.ts`:
   - Add `SPRITE_TOKEN_MISSING`, `SPRITE_AUTH_FAILED` to `ErrorCodes` enum at lines 15-61
   - Create `SpriteTokenNotFoundError` class (follow `WispNotFoundError` pattern at line 414)
   - Add `SpriteAuthError` for authentication failures (follow `SpriteStartError` pattern at line 429)

### Phase 2: Core Sprite Runner Support

1. **Create `runSpriteCommand()`** in `src/agent/sprite-runner.ts`:
   - Mirror `runWispCommand()` at lines 77-191 but for `sprite` CLI
   - Inject token via environment variable or CLI flag (research required)
   - Handle authentication errors gracefully using new error classes
   - Support the same timeout and SIGTERM→SIGKILL escalation pattern

2. **Implement Remote Operations** in `src/agent/sprite-runner.ts`:
   - `startRemoteSprite(name, config, token, logger)` - mirror `startSprite()` at lines 237-271
   - `attachRemoteSprite(name, config, token, logger)` - mirror `attachSprite()` at lines 281-307
   - `listRemoteSprites(config, token, logger)` - mirror `listSprites()` at lines 316-338
   - `killRemoteSprite(name, config, token, logger)` - mirror `killSprite()` at lines 348-374

3. **Update High-Level Functions** in `src/agent/sprite-runner.ts`:
   - Modify existing functions to detect CLI type based on config
   - Add helper to determine if using local (wisp) or remote (sprite) CLI
   - Route to appropriate low-level function based on CLI type

### Phase 3: CLI and Tool Integration

1. **Extend CLI Commands** in `src/commands/sprite.ts`:
   - Add `--remote` flag to command options interfaces (lines 18-41)
   - Add token validation when `--remote` is used (check `config.token` exists)
   - Route to appropriate CLI (wisp vs sprite) based on flag
   - Maintain backward compatibility (default to wisp without flag)

2. **Update RLM Tools** in `src/agent/rlm-tools.ts`:
   - Add token parameter to tool functions
   - Update `DEFAULT_SPRITE_CONFIG` at lines 211-218 to include token
   - Modify tool functions to support optional `remote` parameter
   - Consider separate tools: `SpawnRemoteSprite` vs `SpawnLocalSprite` for clarity

3. **Update Documentation**:
   - Add Sprites.dev setup instructions to `README.md` Cloud Sandboxes section (lines 359-369)
   - Document token configuration in MIGRATION.md
   - Provide example configs for both local (wisp) and remote (sprite) setups
   - Include security best practices for token storage

### Phase 4: Testing and Validation

1. **Unit Tests** (`src/__tests__/commands/sprite.test.ts`):
   - Mock `spawn()` for `sprite` CLI calls
   - Test token presence validation
   - Test remote vs local CLI selection
   - Test authentication error handling

2. **Integration Tests**:
   - Test with real `sprite` CLI (if available in CI)
   - Test environment variable resolution precedence
   - Test config.local.json token loading

3. **Security Testing**:
   - Verify token is redacted from all logs
   - Test that token doesn't leak in error messages
   - Validate gitignore prevents accidental token commits

## Open Questions

1. **Sprite CLI Authentication Mechanism**: How does the `sprite` CLI accept authentication?
   - Via environment variable (`SPRITES_TOKEN`)?
   - Via CLI flag (`--token` or `--api-token`)?
   - Via config file (`~/.sprite/config.json`)?
   - **Action Required**: Research `sprite` CLI documentation or inspect its source code

2. **CLI Command Equivalence**: Are `sprite` CLI commands equivalent to `wisp`?
   - Does `sprite start` map to `wisp start`?
   - What are the exact command names and flags?
   - Does `sprite` support `--json` flag like wisp?
   - **Action Required**: Document `sprite` CLI command interface through testing or documentation

3. **Token Scope and Permissions**: What permissions does the token need?
   - Can one token manage multiple Sprites?
   - Are there rate limits or quotas?
   - Does token expire? How to handle refresh?
   - **Action Required**: Review Sprites.dev API documentation

4. **Backward Compatibility Strategy**: Should we support both CLIs simultaneously?
   - Allow users to use local wisp for development, remote sprite for production?
   - Or require explicit choice via config field like `cliType: "wisp" | "sprite"`?
   - **Recommendation**: Support both, default to wisp (existing behavior), use sprite if `--remote` flag or `config.token` present

5. **Error Recovery**: What should happen when token expires or is invalid?
   - Prompt user to re-authenticate?
   - Fall back to local wisp?
   - Fail with clear error message?
   - **Recommendation**: Fail with clear error message + instructions, no silent fallback (could mask issues)

6. **Config Structure**: Should token be in `agent` config or top-level config?
   - `agent.token` (specific to sprite agent)
   - `sprites.token` (global sprites config)
   - **Recommendation**: `agent.token` in SpriteAgentConfig for consistency with other agent-specific settings

## Conclusion

The foundation for Sprites.dev integration is solid. The existing wisp CLI support in `src/agent/sprite-runner.ts:77-520` provides a clear template to follow. The main work involves:

1. Adding the `token` field to `SpriteAgentSchema` at `src/schemas.ts:72-79`
2. Extending the environment variable resolution in `src/agent/env.ts:16-23` to include `SPRITES_TOKEN`
3. Creating parallel functions for `sprite` CLI commands (following `runWispCommand()` pattern at lines 77-191)
4. Updating RLM tools at `src/agent/rlm-tools.ts:211-450` to pass the token
5. Adding authentication-specific error handling in `src/errors.ts:408-463`

The implementation should prioritize security (token redaction following pattern at `src/agent/env.ts:124-129`, gitignored config at `.gitignore:7`), backward compatibility (wisp still works as default), and clear error messages (missing token instructions).

**Critical next step**: Research the `sprite` CLI's authentication mechanism and command interface before implementation to ensure correct integration.
