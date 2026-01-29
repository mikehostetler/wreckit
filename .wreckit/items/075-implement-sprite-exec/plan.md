# Implement Sprite Exec Capability Implementation Plan

## Overview

Add the ability to execute commands inside a running Sprite VM via the `sprite exec` CLI command. This enables Wreckit agents to perform work (clone, build, test) inside the sandbox, not just manage the VM lifecycle.

## Current State Analysis

The current Sprite integration (Items 073 and 074) provides lifecycle management only:

**Existing Sprite Operations** (`src/agent/sprite-runner.ts`):
- `startSprite()` → Maps to `sprite create <name>` (line 258)
- `attachSprite()` → Maps to `sprite console <name>` (line 303)
- `listSprites()` → Maps to `sprite list --json` (line 338)
- `killSprite()` → Maps to `sprite delete <name>` (line 372)

**Core Infrastructure**:
- `runWispCommand()` primitive (lines 85-207) handles subprocess execution with timeout enforcement, streaming output capture via callbacks, and SIGTERM→SIGKILL escalation
- Error handling system (`src/errors.ts:408-463`) includes `WispNotFoundError`, `SpriteStartError`, `SpriteAttachError`, `SpriteKillError` but **lacks** `SpriteExecError`
- CLI commands (`src/commands/sprite.ts:81-375`) follow consistent pattern with options interfaces, config loading, and JSON output support
- RLM tools (`src/agent/rlm-tools.ts:244-450`) expose `SpawnSprite`, `AttachSprite`, `ListSprites`, `KillSprite` tools for agents
- CLI registration (`src/index.ts:444-558`) registers sprite subcommands under `wreckit sprite` command group

**What's Missing**:
- No `execSprite()` function in `sprite-runner.ts`
- No `spriteExecCommand` in `commands/sprite.ts`
- No `sprite exec` subcommand registered in `src/index.ts`
- No `ExecSprite` tool in RLM registry
- No `SpriteExecError` class in `src/errors.ts`
- No tests for exec functionality

## Phases

### Phase 1: Core Infrastructure (Foundation)

**Overview**: Add error handling (`SpriteExecError`) and implement the core `execSprite()` function that wraps `runWispCommand()`. This establishes the foundation for CLI and RLM layers.

#### Changes Required

1. **Add Error Code and Error Class** in `src/errors.ts`:
   - Add `SPRITE_EXEC_FAILED` to `ErrorCodes`
   - Create `SpriteExecError` class

2. **Implement execSprite() Function** in `src/agent/sprite-runner.ts`:
   - Add `execSprite()` function
   - Handle subprocess errors vs command failures

### Phase 2: CLI Integration (User Interface)

**Overview**: Implement the CLI command and register it with Commander.js.

#### Changes Required

1. **Add Command Options Interface** in `src/commands/sprite.ts`:
   - `SpriteExecOptions`

2. **Implement CLI Command** in `src/commands/sprite.ts`:
   - `spriteExecCommand()`

3. **Register CLI Command** in `src/index.ts`:
   - Register `sprite exec` subcommand

### Phase 3: RLM Tool Integration (Agent Access)

**Overview**: Expose `ExecSprite` as an RLM tool so agents can execute commands inside Sprites.

#### Changes Required

1. **Create ExecSpriteTool** in `src/agent/rlm-tools.ts`:
   - Implement `ExecSpriteTool`
   - Register in `ALL_TOOLS`

### Phase 4: Testing & Polish (Quality Assurance)

**Overview**: Add comprehensive unit tests to ensure correctness and prevent regressions.

#### Changes Required

1. **Add Unit Tests** in `src/__tests__/commands/sprite.test.ts`:
   - Test `spriteExecCommand` success/failure/json/error paths