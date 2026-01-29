# Implement Remote Tool Proxy for Sprite Agents

## Overview
Implement a proxy layer that redirects standard agent tools (Bash, Read, Write, Glob, Grep) to execute inside a remote Sprite VM via `sprite exec`. This transforms the `SpriteAgent` into a fully functional, sandboxed runtime environment.

## Current State Analysis
- **Runner:** `runSpriteAgent` currently only checks connectivity.
- **Tools:** `execSprite` primitive exists but is not used by agent tools.
- **Schema:** `SpriteAgentConfig` lacks `vmName` for persistent sessions.

## Phases

### Phase 1: Remote Tool Implementations
**Goal:** Create `src/agent/remote-tools.ts` with proxied versions of standard tools.
- Implement `RemoteReadTool`: `cat <file> | base64`
- Implement `RemoteWriteTool`: `echo <base64> | base64 -d > <file>`
- Implement `RemoteBashTool`: `execSprite(..., ["bash", "-c", command])`
- Implement `RemoteGlobTool`: `find` command wrapper.
- Implement `RemoteGrepTool`: `grep` command wrapper.
- Export `buildRemoteToolRegistry`.

### Phase 2: Schema Updates
**Goal:** Add `vmName` to configuration.
- Update `SpriteAgentSchema` in `src/schemas.ts`.

### Phase 3: Runner Integration
**Goal:** Update `runSpriteAgent` to initialize the AI agent with remote tools.
- Auto-generate or use `vmName`.
- Call `ensureSpriteRunning` (start if not running).
- Initialize `AxAgent` with `remoteTools`.
- Execute agent loop.

### Phase 4: Testing
**Goal:** Verify tool proxying works.
- Add unit tests for `remote-tools.ts` mocking `execSprite`.
- Verify base64 encoding/decoding logic.
