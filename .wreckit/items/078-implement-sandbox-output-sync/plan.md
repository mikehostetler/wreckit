# Implement Sandbox Output Synchronization Implementation Plan

## Overview
Implement the ability to retrieve files and artifacts from the Sprite VM back to the host machine via a new `wreckit sprite pull` command and optional automatic sync-back upon agent success. This closes the development loop by allowing changes made in the sandbox to be persisted.

## Current State
- **Sync to VM:** Implemented in Item 077 (`syncProjectToVM`).
- **VM Execution:** `execSprite` is available and supports streaming stdout.
- **Tools:** Remote tools use base64 encoding for binary safety.
- **Missing:** No mechanism to pull files *from* the VM to the host.

## Implementation Phases

### Phase 1: Core Download Infrastructure (`src/fs/sync.ts`)
- Implement `downloadFromSpriteVM`:
  - Execute `tar czf - . | base64` in VM.
  - Capture stdout, decode base64 to Buffer.
- Implement `extractProjectArchive`:
  - Write Buffer to temp file.
  - Extract using system `tar` to destination.
- Implement `syncProjectFromVM`:
  - Wrapper for download + extract + cleanup.
- Update `SpriteSyncError` in `src/errors.ts` to include 'download' stage.

### Phase 2: CLI Integration
- Add `spritePullCommand` to `src/commands/sprite.ts`.
- Register `pull` command in `src/index.ts`.
- Options: `--vm-path` (default `/home/user/project`), `--destination` (default cwd), `--exclude`.

### Phase 3: Runner Integration & Config
- Update `SpriteAgentSchema` in `src/schemas.ts` with `syncOnSuccess` (default false).
- Update `runSpriteAgent` in `src/agent/sprite-runner.ts`:
  - If `syncOnSuccess` is true and agent exits successfully (exit code 0), automatically call `syncProjectFromVM`.

### Phase 4: Testing
- Extend `src/__tests__/fs/sync.test.ts` with download tests.
- Verify base64 decoding and archive extraction.
