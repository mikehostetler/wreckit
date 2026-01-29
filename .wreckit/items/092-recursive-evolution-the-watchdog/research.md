# Research: Recursive Evolution: The Watchdog

**Date**: 2025-01-28
**Item**: 092-recursive-evolution-the-watchdog

## Research Question
Implement a self-monitoring mechanism that verifies system integrity and recompiles the codebase after changes to prevent regression loops.

## Summary

The Watchdog is a self-monitoring infrastructure component that continuously verifies system integrity and automatically recompiles the codebase when changes are detected to prevent regression loops. Unlike the Geneticist (Item 091) which optimizes prompts based on healing logs, or the Agent Doctor (Item 038) which heals runtime errors, the Watchdog focuses on **compilation integrity and change detection**. The research reveals that wreckit currently lacks any file watching or continuous monitoring capability—changes to source files require manual rebuilding via `npm run build` or `npm run watch`, and there's no mechanism to detect when the compiled `dist/` directory becomes out-of-sync with the `src/` directory. The implementation requires (1) a file watching subsystem that monitors source files for changes, (2) integrity verification that compares compiled artifacts against source checksums, (3) automatic recompilation triggered by detected changes, (4) validation that recompilation succeeded without breaking the CLI, and (5) integration with the existing build system from `package.json`. This is particularly important for wreckit because it's a CLI tool that users install globally—the Watchdog ensures that development changes don't cause runtime regressions, and provides a safety net for autonomous agents modifying the codebase.

## Current State Analysis

### Existing Build System

The wreckit project uses a standard TypeScript build configuration defined in `package.json:10-30`:

1. **Build Command**: `npm run build` executes `tsup src/index.ts --format esm --clean && cp -r src/prompts dist/` which compiles TypeScript to ESM format and copies prompt templates to the dist directory.

2. **Watch Mode**: `npm run watch` uses `tsup src/index.ts --format esm --watch --onSuccess "cp -r src/prompts dist/"` for development with automatic recompilation on file changes.

3. **Entry Point**: The CLI is defined as `"bin": { "wreckit": "./dist/index.js" }` and `"main": "./dist/index.js"` meaning all runtime execution depends on the compiled `dist/` directory.

4. **Published Files**: The `"files": ["dist/", ...]` configuration ensures only compiled artifacts are published to npm, not source files.

### Gap Analysis

**No Continuous Monitoring:** The current system has two fundamental gaps:

1. **No Integrity Verification**: There's no mechanism to detect when the `dist/` directory is out-of-sync with `src/`. If a developer modifies source files and forgets to run `npm run build`, the CLI will run stale code, leading to confusing bugs.

2. **No Automatic Recompilation**: Changes to source files require manual invocation of build commands. In autonomous agent scenarios where the Geneticist or other agents modify source code, there's no automatic rebuild, potentially causing the CLI to execute inconsistent or partially-updated code.

3. **No Change Detection**: The system has no checksum or hash verification to detect whether recompilation is needed. Each run of `wreckit` executes whatever is in `dist/` regardless of whether source files have changed.

4. **No Pre-execution Validation**: The CLI doesn't validate its own integrity before running. If `dist/` is missing, incomplete, or out-of-date, the CLI will either fail to start or run incorrect code.

### Related Infrastructure

The wreckit codebase has related patterns that inform the Watchdog design:

1. **Validation Systems**: `src/doctor.ts` provides comprehensive validation of repository state but doesn't extend to build integrity. The doctor validates JSON schemas, file existence, and state consistency but doesn't verify `dist/` matches `src/`.

2. **File Lock Patterns**: `src/fs/lock.ts` implements file locking with stale detection, which could be adapted for a build lock to prevent concurrent Watchdog and manual builds.

3. **Error Detection**: `src/agent/errorDetector.ts` classifies recoverable errors, but doesn't detect build inconsistencies or missing compiled artifacts.

4. **Self-Healing Runtime**: Item 038's `src/agent/healingRunner.ts` wraps agent execution with automatic healing, but only applies to agent operations, not to the CLI's own integrity.

5. **Backup System**: `src/fs/backup.ts` creates backups before modifications—useful for the Watchdog to restore previous builds if recompilation fails.

## Key Files

### Build Configuration

- `package.json:10-30` - Build scripts and entry point configuration
- `package.json:17` - `"build": "tsup src/index.ts --format esm --clean && cp -r src/prompts dist/"` - Current build command
- `package.json:23` - `"watch": "tsup src/index.ts --format esm --watch --onSuccess \"cp -r src/prompts dist/\""` - Development watch mode
- `tsup.config.ts` (if exists) - Build configuration (not found in search, likely using CLI args)

### Source Structure

- `src/index.ts` - CLI entry point that gets compiled to `dist/index.js`
- `src/prompts/` - Prompt templates that must be copied to `dist/prompts/`
- `dist/` - Compiled output directory (not in source control, generated by build)

### Related Patterns

- `src/doctor.ts:1-857` - Comprehensive validation and diagnostics (inspiration for Watchdog integrity checks)
- `src/fs/lock.ts:156-196` - File lock with stale detection pattern (can be adapted for build locking)
- `src/agent/healingRunner.ts:28-38` - `HealingLogEntry` structure (pattern for Watchdog event logging)
- `src/commands/orchestrator.ts:127-191` - Batch progress tracking pattern (could track Watchdog checks)
- `src/git/index.ts:62-96` - Mutex pattern for serializing operations (useful for preventing concurrent builds)

## Technical Considerations

### Dependencies

**Internal Modules:**
- `src/doctor.ts` - For validation patterns and diagnostic reporting structure
- `src/fs/lock.ts` - For build lock file to prevent concurrent Watchdog and manual builds
- `src/fs/paths.ts` - For path utilities (`getWreckitDir`, etc.)
- `src/logging.ts` - For logging Watchdog activity
- `src/config.ts` - For Watchdog configuration settings

**External Dependencies:**
- `chokidar` (recommended) - File watching library for efficient monitoring of `src/` directory
- `tsup` - Already used for builds, can be invoked programmatically
- Node.js `fs/promises` - For file system operations
- Node.js `child_process` - For spawning build commands
- Node.js `crypto` - For checksum/hash generation to detect changes

### Build Lock Pattern

Adapt from `src/fs/lock.ts:156-196` to create a build lock:

```typescript
// Prevent concurrent Watchdog and manual builds
const buildLockPath = path.join(wreckitDir, '.build-lock');
// Acquire lock before starting build
// Release lock after build completes or fails
// Detect stale locks (process not running + lock > timeout)
```

### Checksum Strategy

Implement hash-based change detection:

1. **Source Hash**: Calculate SHA-256 hash of all `src/**/*.ts` files
2. **Prompts Hash**: Calculate SHA-256 hash of all `src/prompts/**/*.md` files
3. **Build Metadata**: Store hash in `.wreckit/build-metadata.json` after successful build
4. **Comparison**: On Watchdog check, compare current hashes against stored hashes
5. **Rebuild Trigger**: If hashes differ, trigger recompilation

### File Watching Approaches

**Option 1: Polling-Based**
- Periodically check file modification times (mtime)
- Simple but less responsive
- Use existing `setInterval` pattern

**Option 2: Event-Based (Recommended)**
- Use `chokidar` library for efficient file watching
- Get immediate notification on file changes
- More complex but better UX

**Option 3: Git-Based**
- Monitor git index for changes to `src/` files
- Only works in git repos
- Useful for detecting changes vs uncommitted modifications

### Recompilation Safety

1. **Pre-build Validation**: Check TypeScript compilation errors before overwriting `dist/`
2. **Rollback on Failure**: If build fails, restore previous `dist/` from backup
3. **Build Artifact Verification**: After build, verify `dist/index.js` exists and is valid
4. **Prompts Sync Check**: Verify `dist/prompts/` was copied correctly
5. **CLI Smoke Test**: Run `wreckit --version` or similar to verify CLI is functional

## Patterns to Follow

1. **Diagnostic Pattern** (from `src/doctor.ts`):
   ```typescript
   interface Diagnostic {
     code: string;
     severity: "error" | "warning" | "info";
     message: string;
     fixable: boolean;
   }
   ```

2. **Healing Log Pattern** (from `src/agent/healingRunner.ts`):
   ```typescript
   interface WatchdogEvent {
     timestamp: string;
     eventType: "change_detected" | "build_started" | "build_succeeded" | "build_failed";
     details: { ... };
   }
   ```

3. **Mutex Pattern** (from `src/git/index.ts:62-96`):
   - Serialize build operations to prevent race conditions
   - Use timeout-based lock release

4. **Backup Pattern** (from `src/fs/backup.ts`):
   - Create backup of `dist/` before overwriting
   - Restore if build fails

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Build failures corrupt dist/** | High | Create backups before building; restore on failure |
| **Concurrent build race conditions** | Medium | Use build lock file to serialize builds |
| **File watching misses changes** | Medium | Use reliable library (chokidar); implement periodic fallback checks |
| **Infinite rebuild loops** | High | Debounce file changes; track in-progress builds |
| **Performance overhead** | Low | Efficient file watching; minimal hashing cost; only when enabled |
| **False positives (rebuild when not needed)** | Low | Use hash-based detection, not just timestamps |
| **Watchdog crashes during build** | Medium | Build lock auto-releases on timeout; recovery on restart |
| **Prompts not copied to dist/** | High | Explicit verification step; copy as part of build command |
| **TypeScript compilation errors** | Medium | Pre-build validation; don't overwrite dist/ if compilation fails |
| **npm install dependencies change** | Low | Also monitor package.json and node_modules |

## Recommended Approach

Based on research findings, here's the implementation strategy:

### Phase 1: Integrity Verification (MVP)

1. **Build Metadata Storage**: Create `.wreckit/build-metadata.json` to track:
   ```json
   {
     "last_build_time": "2025-01-28T10:00:00.000Z",
     "source_hash": "sha256:...",
     "prompts_hash": "sha256:...",
     "build_success": true,
     "dist_exists": true
   }
   ```

2. **Checksum Calculation**: Implement `calculateSourceHash()` function that:
   - Walks `src/**/*.ts` directory recursively
   - Calculates SHA-256 of each file
   - Combines hashes into single source hash

3. **Integrity Check Command**: Add `wreckit watchdog --check` command that:
   - Calculates current source hash
   - Reads stored hash from build metadata
   - Reports if out-of-sync
   - Exit code 1 if out-of-sync (for CI/CD)

### Phase 2: File Watching

1. **File Watcher Service**: Create background service that:
   - Uses `chokidar` to watch `src/` and `src/prompts/` directories
   - Debounces changes (wait 500ms after last change before triggering)
   - Acquires build lock before starting build
   - Triggers recompilation on changes

2. **Build Lock Implementation**: Create `.wreckit/.build-lock` file with:
   ```json
   {
     "pid": 12345,
     "timestamp": "2025-01-28T10:00:00.000Z",
     "operation": "watchdog_build"
   }
   ```

3. **Stale Lock Detection**: Auto-release locks older than 10 minutes (crash recovery)

### Phase 3: Automatic Recompilation

1. **Build Runner**: Implement `runBuild()` function that:
   - Creates backup of existing `dist/` directory
   - Runs `tsup src/index.ts --format esm --clean`
   - Copies `src/prompts/` to `dist/prompts/`
   - Verifies `dist/index.js` exists
   - Runs CLI smoke test (`dist/index.js --version`)
   - On success: update build metadata, release lock
   - On failure: restore from backup, release lock, log error

2. **Watchdog Event Log**: Track all Watchdog activity in `.wreckit/watchdog-log.jsonl`:
   ```json
   {"timestamp":"...","eventType":"change_detected","files":["src/index.ts"]}
   {"timestamp":"...","eventType":"build_started","source_hash":"..."}
   {"timestamp":"...","eventType":"build_succeeded","duration_ms":1234}
   ```

### Phase 4: CLI Integration

1. **Pre-flight Check**: Add Watchdog check to CLI startup (optional via config):
   ```bash
   wreckit --check-integrity  # Fails if dist/ is out-of-sync
   ```

2. **Auto-watch Mode**: Add background watching mode:
   ```bash
   wreckit watchdog --daemon  # Runs in background, watches and rebuilds
   wreckit watchdog --stop    # Stops background Watchdog
   ```

3. **Orchestrator Integration**: Before running agents, verify build is up-to-date

### Phase 5: Configuration

Add watchdog configuration to `.wreckit/config.json`:

```json
{
  "watchdog": {
    "enabled": false,  // Opt-in for safety
    "check_on_start": true,  // Verify integrity before CLI commands
    "auto_rebuild": false,  // Automatically rebuild when changes detected
    "file_watch": {
      "enabled": false,
      "debounce_ms": 500,
      "paths": ["src/", "src/prompts/", "package.json"]
    },
    "build_lock": {
      "timeout_ms": 600000  // 10 minutes
    },
    "on_failure": "rollback"  // or "warn" or "error"
  }
}
```

## Open Questions

1. **Opt-in vs Opt-out**: Should Watchdog be enabled by default? Recommended: Opt-in (disabled by default) for safety, users can enable for development.

2. **Daemon vs Check-only**: Should Watchdog run continuously as a daemon, or only perform integrity checks on demand? Recommended: Support both modes—check-only by default, daemon mode opt-in.

3. **Package Changes**: Should Watchdog trigger rebuild when `package.json` or `node_modules/` changes? Recommended: Yes, monitor `package.json`, but not `node_modules/` (too noisy).

4. **CI/CD Integration**: Should Watchdog check be run in CI to ensure `dist/` is up-to-date? Recommended: Yes, add `wreckit watchdog --check` to CI pipeline.

5. **Concurrent Development**: How to handle multiple developers modifying source simultaneously? Recommended: Build lock file prevents concurrent builds, each developer's Watchdog waits for lock.

6. **Testing Strategy**: How to test Watchdog without causing infinite rebuild loops? Recommended: Mock file system in tests, use fixture source directories, verify lock behavior.

7. **Performance Impact**: What's the overhead of file watching and hashing? Recommended: Benchmark with large codebases, expected <1% CPU usage with chokidar.

8. **Error Recovery**: If Watchdog repeatedly fails to build, should it disable itself? Recommended: Yes, auto-disable after 3 consecutive build failures and log error for manual intervention.

## Integration Points

### With Item 038 (Agent Doctor)

- Watchdog provides **pre-execution integrity validation** before Doctor runs
- Doctor provides **healing for build failures** (e.g., if tsup is not installed)
- Both use similar diagnostic logging patterns

### With Item 091 (Geneticist)

- Geneticist may modify `src/prompts/*.md` files
- Watchdog automatically recompiles when prompts change
- Prevents CLI from running stale prompt templates

### With Orchestrator

- Watchdog verifies build integrity before agent execution
- Prevents agents from running inconsistent code
- Provides early failure if dist/ is missing or broken

### With Existing Commands

- `wreckit build` - Manual build command (uses Watchdog's build runner)
- `wreckit doctor` - Extended to check build integrity
- `wreckit status` - Shows build status (up-to-date or stale)
