# Implementation Plan - Recursive Evolution: The Watchdog

## Overview
Implement a self-monitoring Watchdog mechanism that verifies system integrity and automatically recompiles the codebase when changes are detected. This ensures that the CLI (running from `dist/`) always matches the source code (`src/`), preventing regression loops and stale execution states, especially during autonomous agent operations.

## User Stories

### Phase 1: Integrity Verification (MVP)
- **US-001**: Implement `calculateSourceHash` utility to checksum `src/` files
- **US-002**: Create `check-integrity` command to verify `dist/` against source hash
- **US-003**: Store build metadata (hashes, timestamp) in `.wreckit/build-metadata.json` on successful build

### Phase 2: File Watching & Locking
- **US-004**: Implement `FileWatcher` service using `chokidar` to monitor `src/`
- **US-005**: Implement `BuildLock` mechanism to prevent concurrent builds (Watchdog vs Manual)
- **US-006**: Add stale lock detection and auto-release logic

### Phase 3: Automatic Recompilation
- **US-007**: Implement `safeRebuild` runner (backup dist, build, verify, restore on fail)
- **US-008**: Create `wreckit watchdog` daemon command
- **US-009**: Integrate Watchdog into `wreckit doctor` diagnostics

## Technical Architecture

### Directory Structure
```
src/
  integrity/
    checksum.ts       # Hash calculation logic
    metadata.ts       # Metadata storage/retrieval
    watcher.ts        # File watching service
    builder.ts        # Recompilation runner
  commands/
    watchdog.ts       # CLI command
```

### Build Metadata Schema
```json
{
  "last_build_time": "ISO-8601",
  "source_hash": "sha256-hash",
  "prompts_hash": "sha256-hash",
  "version": "1.0.0"
}
```

### Integration Points
- **CLI Startup**: Optional check for integrity on start.
- **Agent Runtime**: Verify integrity before starting long-running agents.
- **Geneticist**: Auto-recompile prompt templates when evolved.

## Risks & Mitigations
- **Infinite Rebuild Loops**: Debounce changes (500ms) and use BuildLock.
- **Corrupt dist/**: Always backup `dist/` to `.wreckit/backups/dist-pre-build` before rebuilding.
- **Performance**: Use async file hashing and efficient chokidar patterns.
