# Research: Implement Sandbox Project Synchronization

**Date**: 2026-01-28
**Item**: 077-implement-sandbox-sync

## Research Question
Automatically synchronize the current project's code into the Sprite VM when starting a Sprite Agent session. This solves the 'Empty Box Problem' by ensuring the agent has access to the codebase it is meant to work on.

## Summary

The research identifies that implementing Sprite project synchronization requires creating a new file synchronization module (`src/fs/sync.ts`) that compresses the local project into a tar.gz archive (respecting .gitignore exclusions for node_modules and .git), uploads it to the Sprite VM via the `execSprite` primitive, and extracts it to a working directory. This sync operation must be integrated into the `runSpriteAgent()` function at `src/agent/sprite-runner.ts:562-721`, specifically after VM initialization (line 588) and before agent execution begins (line 663).

The codebase already has excellent infrastructure to build upon. Item 075 implemented `execSprite()` at `src/agent/sprite-runner.ts:459-499` which can execute commands inside running VMs with proper streaming output support via `onStdoutChunk`/`onStderrChunk` callbacks. The `runWispCommand()` primitive at lines 100-236 handles subprocess spawning with timeout enforcement and binary-safe output capture. Node.js built-in `zlib` and `tar` streams can be used for compression without external dependencies. The project root detection via `findRepoRoot()` at `src/fs/paths.ts:5-31` and configuration loading through `loadConfig()` at `src/config.ts:223-266` are already in place.

Key findings reveal that no existing file synchronization or archiving utilities exist in the codebase - this will be new functionality. The Sprite VM starts completely empty (as documented in the agent description at line 647-649), so synchronization is essential for any real work. The agent's working directory context (`cwd` parameter) is already passed to `runSpriteAgent()` and should be used as the source for synchronization. The remote tools system at `src/agent/remote-tools.ts:13-31` shows the pattern for VM-executed operations, which sync should follow.

## Current State Analysis

### Existing Implementation

**Sprite Runner Architecture**: `src/agent/sprite-runner.ts:1-722` implements the core Sprite integration:

- **Core Primitive**: `runWispCommand()` at lines 100-236
  - Uses `child_process.spawn` for subprocess execution (line 133)
  - Supports streaming output via `onStdoutChunk` and `onStderrChunk` callbacks (lines 61-66, 189-204)
  - Implements timeout handling with SIGTERM→SIGKILL escalation (lines 167-185)
  - Handles ENOENT errors for missing binary (lines 142-151)
  - Returns `WispResult` interface (lines 43-49) with `success`, `stdout`, `stderr`, `exitCode`, `error` fields

- **VM Execution**: `execSprite()` at lines 459-499 (added in Item 075)
  - Executes commands inside running Sprite VMs
  - Maps to `sprite exec <name> <command...>` CLI command
  - Supports streaming callbacks for real-time output
  - Returns `WispResult` with exit code and output
  - Distinguishes subprocess errors (throws) from command failures (returns success=false)
  - **Key Insight**: This function can be used to upload and extract archives

- **Agent Runner**: `runSpriteAgent()` at lines 562-721
  - **Current Flow**:
    1. Dry-run check (lines 568-577)
    2. VM initialization via `ensureSpriteRunning()` (line 588)
    3. Environment setup for AI provider (lines 599-602)
    4. AI service initialization (lines 604-629)
    5. Remote tool registry building (line 632)
    6. Agent initialization (lines 644-653)
    7. Agent execution loop (lines 664-695)
  - **Gap**: No project synchronization between VM start and agent execution
  - **Integration Point**: After line 597 (VM ready) and before line 632 (tool building)

- **Agent Description** (lines 647-649): Explicitly states "The VM starts empty. You may need to install tools or clone repositories first."
  - This confirms the "Empty Box Problem"
  - Agent has no access to project code without synchronization

**File System Utilities**: `src/fs/` module provides path and file operations:

- **Path Resolution**: `src/fs/paths.ts:5-31` implements `findRepoRoot()`
  - Traverses up from `cwd` looking for `.git` and `.wreckit` directories
  - Returns repository root path
  - Throws `RepoNotFoundError` if not found
  - **Usage**: Should be used to find project root for synchronization source

- **File Existence Checks**: `src/fs/util.ts:11-103` provides:
  - `pathExists()` for simple existence checks (lines 11-18)
  - `dirExists()` for directory verification (lines 27-34)
  - `tryReadFile()` for safe file reading with error categorization (lines 55-68)
  - **Usage**: Can verify .gitignore exists and check for node_modules

- **No Archiving Utilities**: Codebase lacks:
  - tar.gz creation/extraction functions
  - .gitignore parsing
  - File filtering based on ignore patterns
  - **Need**: Create new `src/fs/sync.ts` module

**Configuration System**: `src/config.ts:223-266` and `src/schemas.ts:74-105`:

- **Sprite Agent Config**: `SpriteAgentSchema` defines:
  ```typescript
  export const SpriteAgentSchema = z.object({
    kind: z.literal("sprite"),
    wispPath: z.string().default("sprite"),
    token: z.string().optional(),
    vmName: z.string().optional(),
    maxVMs: z.number().default(5),
    defaultMemory: z.string().default("512MiB"),
    defaultCPUs: z.string().default("1"),
    timeout: z.number().default(300),
  });
  ```
  - No sync-specific configuration fields yet
  - **Potential**: Add `syncEnabled`, `syncExcludePatterns` options

**Remote Tools Pattern**: `src/agent/remote-tools.ts:13-31` shows how VM operations work:

- Tools use `execSprite()` to execute commands inside VM
- Base64 encoding used for binary-safe data transfer (lines 54-69 for Read, 108-122 for Write)
- Streaming output via callbacks for long operations
- **Pattern to Follow**: Sync operation should use similar base64 encoding for archive upload

**Node.js Built-in Capabilities**:
- `zlib` module: Provides `createGzip()` for gzip compression
- `tar` stream: Not built-in, need `tar` npm package or use `spawn('tar')` command
- `fs` module: `createReadStream()`, `createWriteStream()` for streaming file operations
- **No External Dependencies**: Item 077's scope constraints specify "Must use existing `execSprite` primitive (no new binaries)"

### Key Files

| File | Purpose | Lines of Interest | Changes Required |
|------|---------|-------------------|------------------|
| `src/agent/sprite-runner.ts` | Core Sprite operations | 562-721 (`runSpriteAgent`), 459-499 (`execSprite`) | Integrate sync into agent startup |
| `src/fs/sync.ts` | **NEW FILE** | N/A | Implement project archiving and sync logic |
| `src/fs/paths.ts` | Path resolution | 5-31 (`findRepoRoot`) | Use to locate project root |
| `src/fs/util.ts` | File utilities | 11-103 (existence checks) | Use for .gitignore verification |
| `src/schemas.ts` | Configuration schemas | 74-105 (`SpriteAgentSchema`) | Optionally add sync config fields |
| `src/errors.ts` | Error handling | 15-61 (`ErrorCodes`), 408+ (Sprite errors) | Add `SpriteSyncError` class |
| `package.json` | Dependencies | 63-83 | Add `tar` package if needed |

## Technical Considerations

### Dependencies

**External Dependencies** (npm packages):
- **tar**: Currently NOT in `package.json` dependencies
  - Option A: Add `tar` package for programmatic tar creation/extraction
  - Option B: Use `spawn('tar')` to invoke system tar command (follows existing pattern)
  - **Recommendation**: Use `spawn('tar')` for consistency with `execSprite` pattern, avoiding new dependencies

**Node.js Built-in Modules**:
- `zlib`: For gzip compression (`createGzip()`)
- `fs`: For file system operations (`createReadStream`, `readdir`, `stat`)
- `path`: For path manipulation (`join`, `relative`, `resolve`)
- `child_process`: For spawning tar command (already using `spawn` in `runWispCommand`)

**Internal Modules** to integrate with:
- `src/agent/sprite-runner.ts:459-499` - Use `execSprite()` for upload and extraction
- `src/agent/sprite-runner.ts:562-721` - Integrate sync into `runSpriteAgent()`
- `src/fs/paths.ts:5-31` - Use `findRepoRoot()` to locate project root
- `src/errors.ts:408-463` - Add `SpriteSyncError` class following existing pattern

### Patterns to Follow

**1. File Archiving Pattern** (NEW - to be implemented in `src/fs/sync.ts`):

```typescript
import * as fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createGzip } from 'node:zlib';
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import type { Logger } from '../logging';

export interface SyncOptions {
  projectRoot: string;
  excludePatterns?: string[];  // Default: ['.git', 'node_modules']
  logger: Logger;
}

export interface SyncResult {
  success: boolean;
  archivePath?: string;
  archiveSize?: number;
  fileCount?: number;
  error?: string;
}

/**
 * Create a tar.gz archive of the project, excluding specified patterns.
 * Uses system tar command for compatibility with execSprite upload.
 */
export async function createProjectArchive(
  options: SyncOptions
): Promise<SyncResult> {
  const { projectRoot, excludePatterns = ['.git', 'node_modules'], logger } = options;

  logger.debug(`Creating project archive from ${projectRoot}`);

  // Build exclude arguments for tar
  const excludeArgs = excludePatterns.flatMap(p => ['--exclude', p]);

  // Create archive in temp directory
  const archivePath = path.join(projectRoot, '.wreckit', 'project-sync.tar.gz');

  return new Promise((resolve) => {
    const tar = spawn('tar', [
      'czf',  // create, gzip, file
      archivePath,
      ...excludeArgs,
      '-C', projectRoot,
      '.',  // Archive current directory contents
    ]);

    let stderr = '';

    tar.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    tar.on('close', async (code) => {
      if (code !== 0) {
        resolve({
          success: false,
          error: `tar failed with exit code ${code}: ${stderr}`,
        });
        return;
      }

      try {
        const stats = await fs.stat(archivePath);
        logger.debug(`Archive created: ${archivePath} (${stats.size} bytes)`);

        resolve({
          success: true,
          archivePath,
          archiveSize: stats.size,
        });
      } catch (err) {
        resolve({
          success: false,
          error: `Failed to read archive: ${(err as Error).message}`,
        });
      }
    });
  });
}
```

**2. VM Upload Pattern** (to be implemented in `src/fs/sync.ts`):

```typescript
import { execSprite } from '../agent/sprite-runner';
import type { SpriteAgentConfig } from '../schemas';

export interface UploadOptions {
  vmName: string;
  archivePath: string;
  config: SpriteAgentConfig;
  logger: Logger;
}

export interface UploadResult {
  success: boolean;
  vmPath?: string;
  error?: string;
}

/**
 * Upload archive to Sprite VM and extract it.
 * Uses base64 encoding to safely transfer binary data.
 */
export async function uploadToSpriteVM(
  options: UploadOptions
): Promise<UploadResult> {
  const { vmName, archivePath, config, logger } = options;

  logger.debug(`Uploading archive to Sprite VM '${vmName}'`);

  try {
    // Read archive and convert to base64
    const archiveBuffer = await fs.readFile(archivePath);
    const base64Archive = archiveBuffer.toString('base64');

    const targetDir = '/home/user/project';

    // Upload and extract in one operation to avoid temp file size limits
    const result = await execSprite(
      vmName,
      [
        'sh',
        '-c',
        `mkdir -p ${targetDir} && echo "${base64Archive}" | base64 -d | tar xzf - -C ${targetDir}`
      ],
      config,
      logger
    );

    if (!result.success && result.exitCode !== 0) {
      return {
        success: false,
        error: `Upload failed: ${result.stderr}`,
      };
    }

    logger.debug(`Archive extracted to ${targetDir}`);

    return {
      success: true,
      vmPath: targetDir,
    };
  } catch (err) {
    return {
      success: false,
      error: `Upload error: ${(err as Error).message}`,
    };
  }
}
```

**3. Integration Pattern** in `src/agent/sprite-runner.ts:562-721`:

Insert sync logic after VM initialization (after line 597):

```typescript
export async function runSpriteAgent(
  config: SpriteAgentConfig,
  options: SpriteRunAgentOptions,
): Promise<AgentResult> {
  const { logger, cwd, prompt } = options;

  // ... existing dry-run check ...

  try {
    // 1. Initialize or connect to Sprite VM
    const vmName = config.vmName || `wreckit-agent-${Date.now()}`;
    logger.info(`Initializing Sprite environment (${vmName})...`);

    const vmReady = await ensureSpriteRunning(vmName, config, logger);
    if (!vmReady) {
      return { /* error */ };
    }

    // === NEW: Sync project to VM ===
    logger.info(`Synchronizing project to Sprite VM...`);

    const { createProjectArchive, uploadToSpriteVM } = await import('../fs/sync.js');

    // Find project root from cwd
    const { findRepoRoot } = await import('../fs/paths.js');
    const projectRoot = findRepoRoot(cwd);

    // Create archive (excludes .git, node_modules by default)
    const archiveResult = await createProjectArchive({
      projectRoot,
      excludePatterns: ['.git', 'node_modules'],
      logger,
    });

    if (!archiveResult.success) {
      logger.error(`Failed to create project archive: ${archiveResult.error}`);
      return {
        success: false,
        output: `Project sync failed: ${archiveResult.error}`,
        timedOut: false,
        exitCode: 1,
        completionDetected: false,
      };
    }

    logger.debug(`Archive created: ${archiveResult.archivePath} (${archiveResult.archiveSize} bytes)`);

    // Upload to VM
    const uploadResult = await uploadToSpriteVM({
      vmName,
      archivePath: archiveResult.archivePath!,
      config,
      logger,
    });

    if (!uploadResult.success) {
      logger.error(`Failed to upload to VM: ${uploadResult.error}`);
      return {
        success: false,
        output: `VM upload failed: ${uploadResult.error}`,
        timedOut: false,
        exitCode: 1,
        completionDetected: false,
      };
    }

    logger.info(`Project synchronized to ${uploadResult.vmPath}`);

    // Clean up local archive
    await fs.unlink(archiveResult.archivePath!);

    // === END SYNC ===

    // 2. Build Environment (API Keys)
    // ... existing code continues ...
```

**4. Error Handling Pattern** (`src/errors.ts:408-463`):

Add sync-specific error class:

```typescript
/**
 * Thrown when project synchronization to Sprite VM fails.
 */
export class SpriteSyncError extends WreckitError {
  constructor(
    public readonly stage: 'archive' | 'upload' | 'extract',
    public readonly projectRoot: string,
    message: string,
  ) {
    super(
      `Failed to sync project '${projectRoot}' to Sprite VM at stage '${stage}': ${message}`,
      ErrorCodes.SPRITE_SYNC_FAILED
    );
    this.name = "SpriteSyncError";
  }
}
```

Add to `ErrorCodes` enum (lines 15-61):

```typescript
export const ErrorCodes = {
  // ... existing codes ...
  SPRITE_SYNC_FAILED: "SPRITE_SYNC_FAILED",
} as const;
```

**5. Configuration Schema Extension** (optional, `src/schemas.ts:74-105`):

```typescript
export const SpriteAgentSchema = z.object({
  kind: z.literal("sprite"),
  wispPath: z.string().default("sprite"),
  token: z.string().optional(),
  vmName: z.string().optional(),
  maxVMs: z.number().default(5),
  defaultMemory: z.string().default("512MiB"),
  defaultCPUs: z.string().default("1"),
  timeout: z.number().default(300),
  // NEW: Sync configuration
  syncEnabled: z.boolean().default(true).describe("Enable automatic project sync"),
  syncExcludePatterns: z.array(z.string()).default([
    '.git',
    'node_modules',
    '.wreckit',  // Avoid recursive sync
  ]).describe("Patterns to exclude from sync"),
  syncTargetDir: z.string().default('/home/user/project').describe("Target directory in VM"),
});
```

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Large archive size exceeds command line limits** | High - Upload fails | Use base64 encoding with file-based upload (write to temp file in VM, then extract) instead of inline shell command; or split into chunks |
| **Archive takes too long to create** | Medium - Poor UX | Show progress indicators; implement timeout; skip sync if configured (syncEnabled: false) |
| **Binary files corrupted during base64 encoding** | High - Data loss | Test base64 roundtrip; use Buffer operations correctly; verify checksum after extraction |
| **VM disk space exhausted** | Medium - Sync fails | Check available space before upload; provide clear error message; document space requirements |
| **.gitignore parsing complexity** | Low - Edge cases | Start with hardcoded exclusions (.git, node_modules); add full .gitignore parsing later if needed |
| **Concurrent sync operations to same VM** | Low - Race condition | Document as user responsibility; VM serializes exec commands internally |
| **Permissions issues after sync** | Medium - Agent can't write | Preserve permissions during tar creation; set umask before extraction; chdir to writable directory |
| **Symlinks not handled correctly** | Low - Broken links | Use tar's `-h` flag to follow symlinks or document limitation |
| **Windows compatibility (CRLF issues)** | Medium - Platform-specific | Test on Windows; use tar in POSIX mode; document as Linux/WSL-only feature |
| **Memory exhaustion from large archives** | High - Crash | Stream archive creation using tar CLI (not in-memory); avoid loading entire archive into memory |
| **Temporary files not cleaned up** | Low - Disk leak | Use try-finally to clean up archive file; log cleanup errors |
| **Agent working directory mismatch** | Medium - Agent can't find files | Change agent's working directory in VM after sync; update agent description to mention synced location |

## Recommended Approach

### Phase 1: Core Synchronization Infrastructure (Foundation)

**Overview**: Create the `src/fs/sync.ts` module with project archiving and VM upload capabilities using system tar command and base64 encoding.

1. **Create `src/fs/sync.ts` Module**:
   - Implement `createProjectArchive()` function
   - Use `spawn('tar')` to create tar.gz archive
   - Support exclude patterns (default: .git, node_modules, .wreckit)
   - Return `SyncResult` with archive path and size

2. **Implement VM Upload**:
   - Implement `uploadToSpriteVM()` function
   - Read archive as Buffer
   - Convert to base64
   - Use `execSprite()` to upload and extract in one operation
   - Handle errors gracefully at each stage

3. **Add Error Handling**:
   - Create `SpriteSyncError` class in `src/errors.ts`
   - Add `SPRITE_SYNC_FAILED` to `ErrorCodes` enum
   - Include stage (archive/upload/extract) and project root in error context

### Phase 2: Agent Integration (Core Feature)

**Overview**: Integrate synchronization into the `runSpriteAgent()` function so projects are automatically synced when agents start.

4. **Integrate Sync into Agent Startup** in `src/agent/sprite-runner.ts:562-721`:
   - Import sync functions after line 520
   - Insert sync logic after VM ready check (after line 597)
   - Find project root using `findRepoRoot(cwd)`
   - Call `createProjectArchive()` with project root
   - Call `uploadToSpriteVM()` with archive path
   - Clean up local archive file
   - Return early error if sync fails

5. **Update Agent Description** (line 647-649):
   - Remove "The VM starts empty" statement
   - Add "The VM has your project code synchronized from the host"
   - Mention synced directory location

6. **Add Configuration Support** (optional):
   - Extend `SpriteAgentSchema` with sync options
   - Add `syncEnabled`, `syncExcludePatterns`, `syncTargetDir`
   - Respect configuration in sync logic

### Phase 3: Testing & Polish (Quality Assurance)

**Overview**: Add comprehensive tests and edge case handling.

7. **Add Unit Tests** in `src/__tests__/fs/sync.test.ts`:
   - Test archive creation with various directory structures
   - Test exclude patterns work correctly
   - Test upload/extract flow
   - Test error handling (missing tar, permission errors, disk full)
   - Mock `spawn()` for tar command
   - Mock `execSprite()` for upload

8. **Integration Testing** (if Sprite CLI available):
   - Test with real project
   - Verify synced files match source
   - Test binary file handling (images, PDFs)
   - Test large projects (>10k files)
   - Measure sync performance

9. **Edge Case Handling**:
   - Empty project (no files)
   - Project with only excluded files
   - Very large files (>100MB individual files)
   - Deep directory nesting (>50 levels)
   - Files with special characters (spaces, quotes, newlines)
   - Permission denied errors

## Open Questions

1. **Upload Method for Large Archives**: Should we use inline base64 shell command or file-based upload?
   - Inline: `echo "base64..." | base64 -d | tar xzf -` (simpler, but command line length limits)
   - File-based: Write base64 to temp file in VM, then decode and extract (more complex, no size limits)
   - **Recommendation**: Start with inline for simplicity; switch to file-based if archives exceed shell limits (~1MB typical, ~128KB with some shells)

2. **Working Directory in VM**: What directory should the agent work in after sync?
   - Option A: Change to synced directory before agent starts (`cd /home/user/project`)
   - Option B: Keep agent in home directory, tools use absolute paths
   - **Recommendation**: Option A - update agent to start in synced directory; update tool descriptions to reference current directory

3. **Two-way Sync Requirements**: Should changes made in VM be pulled back to host?
   - Item 077 scope explicitly excludes two-way sync ("Two-way sync (pulling changes back is a future item)")
   - **Recommendation**: Explicitly document as one-way (host → VM) only; agents can write to VM filesystem but changes aren't synced back

4. **Incremental Sync**: Should we implement incremental sync (rsync-style) or always full sync?
   - Full sync: Simpler, slower for large projects
   - Incremental: Faster, more complex (need file change detection)
   - **Recommendation**: Start with full sync; add incremental later if performance issues arise

5. **.gitignore Parsing**: Should we parse and respect .gitignore patterns?
   - Current scope: Hardcode exclusions (.git, node_modules)
   - Full .gitignore: More flexible, requires parser implementation
   - **Recommendation**: Start with hardcoded exclusions; add .gitignore parsing in future item if needed

6. **Sync Granularity**: Sync entire repo or just working directory files?
   - Entire repo: Includes all branches, git history (if not excluding .git)
   - Working directory: Only current files, excludes .git directory
   - **Recommendation**: Working directory only (exclude .git by default), as agent should work on current state

7. **Performance Baseline**: What sync performance is acceptable?
   - Small project (<100 files, <10MB): <5 seconds
   - Medium project (<1k files, <100MB): <30 seconds
   - Large project (<10k files, <500MB): <2 minutes
   - **Recommendation**: Measure with real projects; optimize if baseline not met; add progress indicators for long syncs

8. **Error Recovery**: What should happen if sync fails partway through?
   - Option A: Fail entire agent run (safe, but all-or-nothing)
   - Option B: Continue with empty VM (agent can clone repo itself)
   - **Recommendation**: Option A - fail agent run with clear error; sync is required for most workflows; add `--no-sync` flag to skip if needed

9. **Temp File Location**: Where should local archive be stored?
   - Option A: `.wreckit/project-sync.tar.gz` (project-specific, gitignored via existing pattern)
   - Option B: `/tmp/wreckit-sync-{timestamp}.tar.gz` (system temp, auto-cleanup)
   - **Recommendation**: Option A - easier to debug; already gitignored by `.wreckit/config.local.json` pattern

10. **Cross-platform Compatibility**: Should this work on Windows?
    - tar command availability varies on Windows
    - Path separators differ (\\ vs /)
    - **Recommendation**: Explicitly document as Linux/WSL-only for now; add Windows support later if demand exists

## Implementation Notes

- **Reuse execSprite() Primitive**: The `execSprite()` function at `src/agent/sprite-runner.ts:459-499` already handles command execution inside VMs. Use it for upload/extract operations instead of implementing new VM communication.

- **Follow Existing Sprite Patterns**: All Sprite operations use specific error classes and result types. Create `SpriteSyncError` following the same pattern for consistency with `SpriteStartError`, `SpriteExecError`, etc.

- **Use System tar Command**: Follow the existing pattern of shelling out to system commands (like `sprite` CLI) instead of using npm packages. This keeps dependencies minimal and follows established patterns.

- **Base64 Encoding for Binary Safety**: The remote tools at `src/agent/remote-tools.ts:54-69` show that base64 encoding is used for binary-safe data transfer. Apply the same pattern for archive upload to avoid corruption.

- **Project Root Detection**: The `findRepoRoot()` function at `src/fs/paths.ts:5-31` already locates the repository root. Use this to find the source directory for synchronization.

- **Streaming for Large Operations**: The `onStdoutChunk`/`onStderrChunk` callbacks in `runWispCommand()` (lines 189-204) enable streaming output. Expose these in sync operations for progress tracking on large archives.

- **Configuration-Driven Exclusions**: While hardcoded exclusions (.git, node_modules) work for initial implementation, design the API to accept exclude patterns for future flexibility (e.g., syncExcludePatterns config field).

- **Cleanup is Critical**: Use try-finally blocks to ensure temporary archives are deleted even if upload fails. Unchecked temp files will accumulate over time and fill disk space.

- **Agent Description Update**: The agent description at line 647-649 explicitly mentions the VM starts empty. After sync is implemented, update this to reflect that project code is available.

- **Backward Compatibility**: Adding sync doesn't break existing Sprite functionality. No migration needed for existing projects. Make sync opt-out via configuration if users want empty VMs.

- **Testing Mock Strategy**: Mock both `spawn('tar')` for archive creation and `execSprite()` for upload to test without actual Sprite CLI. Use the existing test patterns from `src/__tests__/commands/sprite.test.ts`.

- **Performance Considerations**: Archive creation and upload are I/O bound. For large projects, consider: 1) Using faster compression (gzip -1), 2) Showing progress indicators, 3) Running sync in background with notification when ready.

- **Error Messages**: Provide actionable error messages. Instead of "Sync failed", use "Failed to create archive: tar not found. Install tar command." or "Upload failed: VM disk full. Free up space and retry."
