# Research: Implement Sandbox Output Synchronization

**Date**: 2025-01-28
**Item**: 078-implement-sandbox-output-sync

## Research Question
Implement the ability to retrieve files and artifacts from the Sprite VM back to the host machine. This closes the loop on sandboxed development, allowing changes made by the agent (fixes, refactors, build artifacts) to be persisted locally.

## Summary

The research reveals that implementing sandbox output synchronization (pulling files from VM to host) is the mirror image of the already-implemented input synchronization (pushing files from host to VM, Item 077). The codebase already has excellent infrastructure to build upon: the `src/fs/sync.ts` module implements project archiving and upload using system tar commands and base64 encoding, the `execSprite()` primitive at `src/agent/sprite-core.ts:312-342` executes commands inside VMs, and the remote tools system at `src/agent/remote-tools.ts` demonstrates the exact pattern for base64-encoded binary-safe data transfer.

The implementation requires adding three new functions to `src/fs/sync.ts`: `downloadFromSpriteVM()` to create an archive inside the VM and download it, `extractProjectArchive()` to extract it on the host, and `syncProjectFromVM()` as a convenience wrapper that combines both. These mirror the existing `uploadToSpriteVM()`, `createProjectArchive()`, and `syncProjectToVM()` functions. A new CLI command `wreckit sprite pull` needs to be added to `src/commands/sprite.ts` to enable manual file retrieval, and integration with `src/agent/sprite-runner.ts` will allow automatic sync-back when agents complete successfully.

Key technical considerations include handling large files via base64 encoding (potentially requiring chunked transfer), respecting existing exclude patterns to avoid pulling back node_modules or build artifacts, and proper cleanup of temporary archives in both VM and host. The implementation should follow the established patterns: use `execSprite()` for VM operations, maintain the error handling pattern with `SpriteSyncError`, and ensure all operations are logged appropriately.

## Current State Analysis

### Existing Implementation

**Sync Module** (`src/fs/sync.ts`): The codebase already has a complete implementation of host→VM synchronization that can be mirrored for VM→host:

- **`createProjectArchive()`** (lines 63-141): Creates tar.gz archives using system `tar` command
  - Uses `spawn('tar', ['czf', archivePath, ...excludeArgs, '-C', projectRoot, '.'])` for compression
  - Accepts `excludePatterns` parameter (default: `.git`, `node_modules`, `.wreckit`, `dist`, `build`, `.DS_Store`)
  - Returns `CreateArchiveResult` with archive path, size, and error handling
  - **Pattern to Mirror**: VM side archive creation will follow the same pattern but execute inside VM via `execSprite()`

- **`uploadToSpriteVM()`** (lines 147-196): Uploads archives to VM using base64 encoding
  - Reads archive as Buffer: `const archiveBuffer = await fs.readFile(archivePath)`
  - Converts to base64: `const base64Archive = archiveBuffer.toString('base64')`
  - Uses shell command: `mkdir -p ${targetDir} && echo "${base64Archive}" | base64 -d | tar xzf - -C ${targetDir}`
  - Streams base64 data through shell pipeline to extract in one operation
  - Returns `UploadArchiveResult` with VM path and error handling
  - **Pattern to Reverse**: Download will create archive in VM, base64-encode stdout, and decode on host

- **`syncProjectToVM()`** (lines 202-258): Convenience function combining archive creation and upload
  - Calls `createProjectArchive()`, then `uploadToSpriteVM()`
  - Cleans up local archive in finally block: `await fs.unlink(archiveResult.archivePath)`
  - Returns boolean success flag
  - **Mirror Needed**: `syncProjectFromVM()` should combine download and extraction with cleanup

**Sprite Core Primitives** (`src/agent/sprite-core.ts`): Low-level Sprite VM operations:

- **`execSprite()`** (lines 312-342): Execute commands inside running Sprite VMs
  - Args: `name: string`, `command: string[]`, `config: SpriteAgentConfig`, `logger: Logger`, `options?: {onStdoutChunk?, onStderrChunk?}`
  - Maps to `sprite exec <name> <command...>` CLI command
  - Returns `WispResult` interface: `{success: boolean, stdout: string, stderr: string, exitCode: number | null, error?: string}`
  - Supports streaming output via callbacks (useful for large file downloads)
  - **Key Capability**: Can execute `tar` commands inside VM to create archives
  - **Key Capability**: Stdout can be base64-encoded and decoded on host

- **`runWispCommand()`** (lines 57-186): Spawn sprite CLI subprocess with timeout handling
  - Uses `spawn(wispPath, args, {stdio: ['pipe', 'pipe', 'pipe'], env})`
  - Implements timeout with SIGTERM→SIGKILL escalation (lines 122-139)
  - Handles ENOENT errors for missing binary (lines 98-107)
  - Returns `WispResult` with success status and output
  - **Used By**: `execSprite()` internally

- **Other primitives** (for reference, not directly needed for output sync):
  - `startSprite()` (lines 208-242): Create and start new VM
  - `attachSprite()` (lines 244-267): Attach to VM console
  - `listSprites()` (lines 269-285): List all VMs
  - `killSprite()` (lines 287-310): Terminate VM

**Remote Tools Pattern** (`src/agent/remote-tools.ts`): Demonstrates exact base64 encoding pattern to follow:

- **`createRemoteReadTool()`** (lines 34-78): Read files from VM with binary-safe transfer
  ```typescript
  const result = await execSprite(
    vmName,
    ["sh", "-c", `cat "${file_path}" | base64`],
    config,
    logger
  );
  const content = Buffer.from(result.stdout.trim(), "base64").toString("utf-8");
  return content;
  ```
  - Reads file, pipes to base64, returns decoded content
  - **Pattern to Apply**: Archive download will use similar stdout base64 encoding

- **`createRemoteWriteTool()`** (lines 80-134): Write files to VM with binary-safe transfer
  ```typescript
  const base64Content = Buffer.from(content).toString("base64");
  const result = await execSprite(
    vmName,
    ["sh", "-c", `echo "${base64Content}" | base64 -d > "${file_path}"`],
    config,
    logger
  );
  ```
  - Encodes content to base64, decodes in VM via shell pipeline
  - **Already Used By**: `uploadToSpriteVM()` for archive upload

**Error Handling** (`src/errors.ts`): Consistent error pattern to follow:

- **Error codes** (lines 15-63): `SPRITE_SYNC_FAILED: "SPRITE_SYNC_FAILED"` already exists (line 59)
  - Added in Item 077 for sync operations
  - Can reuse for download errors

- **`SpriteSyncError` class** (lines 408-463, inferred from existing pattern):
  ```typescript
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
  - Distinguishes failures by stage (archive/upload/extract)
  - **Extension Needed**: Add 'download' stage for VM→host operations

**Configuration Schema** (`src/schemas.ts:74-113`): Sprite agent configuration:

- **`SpriteAgentSchema`** defines sync-related options (lines 92-99):
  ```typescript
  syncEnabled: z.boolean().default(true).describe("Automatically synchronize project to Sprite VM on start"),
  syncExcludePatterns: z.array(z.string()).default([".git", "node_modules", ".wreckit", "dist", "build", ".DS_Store"]),
  ```
  - **Current Scope**: Only applies to host→VM sync (Item 077)
  - **Extension Opportunity**: Add `syncOnSuccess: boolean` to auto-pull on agent completion
  - **Extension Opportunity**: Add `syncPullPatterns` to control what gets pulled back

**Sprite CLI Commands** (`src/commands/sprite.ts`): Existing Sprite command infrastructure:

- **`spriteStartCommand()`** (lines 89-159): Start new VM with custom memory/CPU
- **`spriteListCommand()`** (lines 166-253): List active VMs
- **`spriteKillCommand()`** (lines 260-321): Terminate VM
- **`spriteAttachCommand()`** (lines 328-389): Attach to VM console
- **`spriteExecCommand()`** (lines 403-497): Execute command in VM
- **Gap**: No `spritePullCommand()` yet - this is the primary addition needed

**Agent Runner** (`src/agent/sprite-runner.ts`): Sprite agent lifecycle:

- **`runSpriteAgent()`** (lines 87-241): Main agent execution flow
  - VM initialization (lines 109-122)
  - Project sync to VM (lines 124-147) - **Item 077 implementation**
  - Environment setup (lines 149-162)
  - Agent execution (lines 192-218)
  - Returns `AgentResult`: `{success, output, timedOut, exitCode, completionDetected}`
  - **Integration Point**: After successful execution, optionally sync back changed files

- **Agent description** (lines 176-180):
  ```typescript
  description: `You are an expert software engineer working inside a sandboxed Linux microVM.
  The project has been synchronized to /home/user/project.
  You can access and modify code there.
  `
  ```
  - **Update Needed**: Mention that changes can be pulled back to host

### Key Files

| File | Purpose | Lines of Interest | Changes Required |
|------|---------|-------------------|------------------|
| `src/fs/sync.ts` | File synchronization | 1-259 (existing sync to VM) | Add downloadFromSpriteVM(), extractProjectArchive(), syncProjectFromVM() |
| `src/commands/sprite.ts` | Sprite CLI commands | 1-498 (existing commands) | Add spritePullCommand() and SpritePullOptions interface |
| `src/agent/sprite-runner.ts` | Agent lifecycle | 87-241 (runSpriteAgent) | Optional auto-sync on successful completion |
| `src/agent/sprite-core.ts` | Core primitives | 312-342 (execSprite) | No changes - use existing primitive |
| `src/schemas.ts` | Configuration | 74-113 (SpriteAgentSchema) | Optional: add syncOnSuccess, syncPullPatterns |
| `src/errors.ts` | Error handling | 408-463 (SpriteSyncError) | Extend stage type to include 'download' |
| `src/__tests__/fs/sync.test.ts` | Sync tests | 1-143 (existing tests) | Add tests for download functions |

## Technical Considerations

### Dependencies

**No New External Dependencies Required**:
- Use existing `execSprite()` primitive for VM operations
- Use system `tar` command inside VM (already available in Linux VMs)
- Use Node.js built-in `fs` and `child_process` modules
- Follow Item 077's approach of avoiding npm tar package

**Node.js Built-in Modules**:
- `fs`: `createWriteStream()` for streaming archive extraction, `unlink()` for cleanup
- `path`: `join()` for path construction
- Buffer: `from(base64, 'base64')` for decoding downloaded archives

**Internal Modules** to integrate with:
- `src/fs/sync.ts:147-196` - Mirror `uploadToSpriteVM()` pattern for download
- `src/agent/sprite-core.ts:312-342` - Use `execSprite()` to create archives in VM
- `src/agent/remote-tools.ts:54-69` - Follow base64 stdout encoding pattern
- `src/errors.ts:59` - Reuse `SPRITE_SYNC_FAILED` error code
- `src/schemas.ts:92-99` - Optionally extend config for auto-pull behavior

### Patterns to Follow

**1. VM Archive Creation Pattern** (to be implemented in `src/fs/sync.ts`):

```typescript
import { execSprite } from '../agent/sprite-core';
import type { SpriteAgentConfig } from '../schemas';

export interface DownloadFromVMOptions {
  vmName: string;
  config: SpriteAgentConfig;
  logger: Logger;
  /** Path inside VM to archive (default: /home/user/project) */
  vmSourcePath?: string;
  /** Patterns to exclude from VM archive */
  excludePatterns?: string[];
}

export interface DownloadFromVMResult {
  success: boolean;
  archiveBuffer?: Buffer;
  archiveSize?: number;
  error?: string;
}

/**
 * Create a tar.gz archive inside the Sprite VM and download it to the host.
 * Uses base64 encoding to safely transfer binary data via stdout.
 */
export async function downloadFromSpriteVM(
  options: DownloadFromVMOptions
): Promise<DownloadFromVMResult> {
  const { vmName, config, logger, vmSourcePath = '/home/user/project', excludePatterns = [] } = options;

  logger.debug(`Creating archive in VM '${vmName}' at ${vmSourcePath}`);

  const excludeArgs = excludePatterns.flatMap(p => ['--exclude', p]);
  const tarArgs = ['tar', 'czf', '-', ...excludeArgs, '-C', vmSourcePath, '.'];

  // Execute tar inside VM, output to stdout as base64
  const result = await execSprite(
    vmName,
    [
      'sh',
      '-c',
      `${tarArgs.join(' ')} | base64`
    ],
    config,
    logger
  );

  if (!result.success || result.exitCode !== 0) {
    return {
      success: false,
      error: `Archive creation in VM failed: ${result.stderr}`,
    };
  }

  try {
    // Decode base64 output to get archive buffer
    const archiveBuffer = Buffer.from(result.stdout.trim(), 'base64');
    logger.debug(`Downloaded archive: ${archiveBuffer.length} bytes`);

    return {
      success: true,
      archiveBuffer,
      archiveSize: archiveBuffer.length,
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to decode archive: ${(err as Error).message}`,
    };
  }
}
```

**2. Local Archive Extraction Pattern** (to be implemented in `src/fs/sync.ts`):

```typescript
import * as fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import * as os from 'node:os';

export interface ExtractArchiveOptions {
  archiveBuffer: Buffer;
  projectRoot: string;
  logger: Logger;
}

export interface ExtractArchiveResult {
  success: boolean;
  extractedPath?: string;
  fileCount?: number;
  error?: string;
}

/**
 * Extract a tar.gz archive buffer to the project directory.
 * Writes buffer to temp file, then uses system tar to extract.
 */
export async function extractProjectArchive(
  options: ExtractArchiveOptions
): Promise<ExtractArchiveResult> {
  const { archiveBuffer, projectRoot, logger } = options;

  logger.debug(`Extracting archive to ${projectRoot}`);

  // Write buffer to temp file
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wreckit-sync-pull-'));
  const tempArchivePath = path.join(tempDir, 'pull-archive.tar.gz');

  try {
    await fs.writeFile(tempArchivePath, archiveBuffer);
    logger.debug(`Wrote temp archive: ${tempArchivePath}`);

    // Extract using system tar
    return new Promise((resolve) => {
      const tar = spawn('tar', ['xzf', tempArchivePath, '-C', projectRoot]);

      let stderr = '';

      tar.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      tar.on('close', async (code) => {
        // Clean up temp archive
        try {
          await fs.unlink(tempArchivePath);
          await fs.rm(tempDir, { recursive: true });
        } catch (cleanupErr) {
          logger.warn(`Failed to clean up temp archive: ${(cleanupErr as Error).message}`);
        }

        if (code !== 0) {
          resolve({
            success: false,
            error: `tar extraction failed with exit code ${code}: ${stderr}`,
          });
          return;
        }

        logger.debug(`Archive extracted to ${projectRoot}`);
        resolve({
          success: true,
          extractedPath: projectRoot,
        });
      });

      tar.on('error', (err) => {
        resolve({
          success: false,
          error: `tar process error: ${err.message}`,
        });
      });
    });
  } catch (err) {
    // Clean up on error
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {}
    return {
      success: false,
      error: `Failed to write temp archive: ${(err as Error).message}`,
    };
  }
}
```

**3. Combined Sync Function** (to be implemented in `src/fs/sync.ts`):

```typescript
export interface SyncFromVMOptions {
  vmName: string;
  projectRoot: string;
  config: SpriteAgentConfig;
  logger: Logger;
  vmSourcePath?: string;
  excludePatterns?: string[];
}

export interface SyncFromVMResult {
  success: boolean;
  localPath?: string;
  archiveSize?: number;
  error?: string;
}

/**
 * Synchronize files from Sprite VM back to host machine.
 * Creates archive in VM, downloads it, extracts to project directory.
 * This is the mirror operation of syncProjectToVM().
 */
export async function syncProjectFromVM(
  options: SyncFromVMOptions
): Promise<SyncFromVMResult> {
  const { vmName, projectRoot, config, logger, vmSourcePath, excludePatterns } = options;

  logger.info(`Pulling files from Sprite VM '${vmName}'...`);

  const downloadResult = await downloadFromSpriteVM({
    vmName,
    config,
    logger,
    vmSourcePath,
    excludePatterns,
  });

  if (!downloadResult.success) {
    logger.error(`Failed to download from VM: ${downloadResult.error}`);
    return {
      success: false,
      error: downloadResult.error,
    };
  }

  logger.info(`Downloaded archive: ${downloadResult.archiveSize} bytes`);

  const extractResult = await extractProjectArchive({
    archiveBuffer: downloadResult.archiveBuffer!,
    projectRoot,
    logger,
  });

  if (!extractResult.success) {
    logger.error(`Failed to extract archive: ${extractResult.error}`);
    return {
      success: false,
      error: extractResult.error,
    };
  }

  logger.info(`Files pulled to ${extractResult.extractedPath}`);
  return {
    success: true,
    localPath: extractResult.extractedPath,
    archiveSize: downloadResult.archiveSize,
  };
}
```

**4. CLI Command Pattern** (to be added to `src/commands/sprite.ts`):

```typescript
export interface SpritePullOptions {
  name: string;
  /** Path in VM to pull from (default: /home/user/project) */
  vmPath?: string;
  /** Local destination (default: current directory) */
  destination?: string;
  /** Patterns to exclude */
  exclude?: string[];
  cwd?: string;
  json?: boolean;
}

/**
 * Pull files from a Sprite VM back to the host machine.
 *
 * Usage: wreckit sprite pull <name> [--vm-path <path>] [--destination <dir>] [--exclude <pattern>] [--json]
 *
 * @example
 * ```bash
 * wreckit sprite pull my-vm
 * wreckit sprite pull my-vm --vm-path /home/user/project/dist --destination ./dist
 * wreckit sprite pull my-vm --exclude node_modules --exclude .git
 * ```
 */
export async function spritePullCommand(
  options: SpritePullOptions,
  logger: Logger,
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const config = await getSpriteConfig(cwd);
  const destination = options.destination ?? cwd;

  logger.debug(`Pulling from Sprite '${options.name}'...`);

  try {
    const { syncProjectFromVM } = await import('../fs/sync.js');

    const result = await syncProjectFromVM({
      vmName: options.name,
      projectRoot: destination,
      config,
      logger,
      vmSourcePath: options.vmPath,
      excludePatterns: options.exclude,
    });

    if (result.success) {
      const outputData = {
        success: true,
        message: `Pulled files from Sprite '${options.name}'`,
        data: {
          name: options.name,
          localPath: result.localPath,
          archiveSize: result.archiveSize,
        },
      };

      if (options.json) {
        outputJson(outputData);
      } else {
        console.log(`✅ ${outputData.message}`);
        console.log(`   📁 Local: ${result.localPath}`);
        console.log(`   📦 Size: ${result.archiveSize} bytes`);
      }
    } else {
      const errorData = {
        success: false,
        error: result.error || "Pull failed",
      };

      if (options.json) {
        outputJson(errorData);
      } else {
        console.error(`❌ ${errorData.error}`);
      }
      process.exit(1);
    }
  } catch (err) {
    if (err instanceof WispNotFoundError) {
      const errorData = {
        success: false,
        error: err.message,
      };

      if (options.json) {
        outputJson(errorData);
      } else {
        console.error(`❌ ${err.message}`);
      }
      process.exit(1);
    }

    throw err;
  }
}
```

**5. Error Handling Extension** (`src/errors.ts`):

Extend `SpriteSyncError` stage type (around line 410):

```typescript
export class SpriteSyncError extends WreckitError {
  constructor(
    public readonly stage: 'archive' | 'upload' | 'extract' | 'download',
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

**6. Agent Integration Pattern** (optional, `src/agent/sprite-runner.ts`):

After successful agent execution (after line 227), optionally sync back:

```typescript
// ... agent execution completes successfully ...

if (result.success && config.syncOnSuccess) {
  logger.info('Agent completed successfully, pulling changes from VM...');

  try {
    const { syncProjectFromVM } = await import('../fs/sync.js');
    const projectRoot = findRepoRoot(cwd);

    const pullResult = await syncProjectFromVM({
      vmName,
      projectRoot,
      config,
      logger,
      excludePatterns: config.syncExcludePatterns,
    });

    if (pullResult.success) {
      logger.info(`Changes pulled from VM: ${pullResult.archiveSize} bytes`);
    } else {
      logger.warn(`Failed to pull changes from VM: ${pullResult.error}`);
      // Don't fail the entire agent run, just log warning
    }
  } catch (err) {
    if ((err as Error).name !== 'RepoNotFoundError') {
      logger.warn(`Error pulling changes from VM: ${(err as Error).message}`);
    }
  }
}

return result;
```

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Base64 encoding increases size by 33%** | Medium - Slower transfer, more memory | Already factored into design; use stdout streaming for large archives; consider chunking if archives exceed 100MB |
| **Shell command length limits for inline base64** | Medium - Download fails for large archives | Use stdout-based transfer (tar | base64) instead of shell variable; no command line length limits |
| **Memory exhaustion from large archive buffers** | High - Crash on large projects | Use `onStdoutChunk` callback to stream base64 decoding; implement chunked transfer for >100MB archives |
| **File conflicts on host (modified files)** | Medium - Data loss or merge issues | Document as user responsibility; use git to detect conflicts; optional: implement .orig backup before extraction |
| **Permission issues after extraction** | Low - Files not writable | Preserve permissions from VM; use tar's `-p` flag; set umask before extraction |
| **Symlinks not handled correctly** | Low - Broken links or security issues | Test symlink handling; document security considerations; optional: flag to resolve/dereference symlinks |
| **Pulling back excluded directories (node_modules)** | Low - Wasted bandwidth/disk space | Respect `syncExcludePatterns` from config; default to excluding .git, node_modules, .wreckit |
| **Concurrent pull operations corrupt extraction** | Low - Race condition | Document as user responsibility; use file locking if needed (not in initial scope) |
| **VM archive creation fails (tar not available)** | Medium - Feature breaks | Assume standard Linux VM with tar; provide clear error message if tar missing |
| **Host disk space exhausted during extraction** | Medium - Sync fails | Check available space before extraction; provide clear error message; document space requirements |
| **Temporary archive files not cleaned up** | Low - Disk leak | Use try-finally blocks for cleanup; clean up in both success and error paths |
| **Binary corruption during base64 transfer** | High - Data loss | Test base64 roundtrip with various file types; verify checksums in tests |
| **Windows compatibility (CRLF issues)** | Medium - Platform-specific | Document as Linux/WSL-only for now; test on Windows if needed |
| **Agent pulls back files while VM still running** | Low - Inconsistent state | Only pull after agent completes and exits; document VM lifecycle |

## Recommended Approach

### Phase 1: Core Download Infrastructure (Foundation)

**Overview**: Implement VM→host file transfer by adding download functions to `src/fs/sync.ts` that mirror the existing upload functions. This phase creates the foundation for pulling files from VMs but does not add CLI commands or agent integration yet.

1. **Add `downloadFromSpriteVM()` function**:
   - Execute `tar czf - -C /home/user/project . | base64` inside VM via `execSprite()`
   - Capture base64-encoded stdout
   - Decode to Buffer using `Buffer.from(stdout, 'base64')`
   - Return `DownloadFromVMResult` with archive buffer and size
   - Handle tar failures and base64 decoding errors

2. **Add `extractProjectArchive()` function**:
   - Write archive Buffer to temp file in OS temp directory
   - Use `spawn('tar', ['xzf', tempArchivePath, '-C', projectRoot])` for extraction
   - Clean up temp file in finally block
   - Return `ExtractArchiveResult` with local path and error handling
   - Handle tar extraction failures and cleanup errors

3. **Add `syncProjectFromVM()` convenience function**:
   - Combine download and extraction in one operation
   - Call `downloadFromSpriteVM()`, then `extractProjectArchive()`
   - Return `SyncFromVMResult` with success status and metrics
   - Provide clear error messages at each stage
   - Mirror the API of `syncProjectToVM()` for consistency

### Phase 2: CLI Integration (User-Facing Feature)

**Overview**: Add the `wreckit sprite pull` CLI command to enable manual file retrieval from VMs. This makes the feature accessible to users for testing and manual workflows.

4. **Add `SpritePullOptions` interface** in `src/commands/sprite.ts`:
   - Fields: `name: string`, `vmPath?: string`, `destination?: string`, `exclude?: string[]`, `cwd?: string`, `json?: boolean`
   - Follow existing options pattern (lines 19-49)
   - Default vmPath to `/home/user/project`
   - Default destination to current working directory

5. **Implement `spritePullCommand()` function** in `src/commands/sprite.ts`:
   - Load Sprite config using `getSpriteConfig(cwd)`
   - Call `syncProjectFromVM()` with options
   - Output success/error messages with emoji indicators
   - Support `--json` flag for machine-readable output
   - Handle `WispNotFoundError` and other errors gracefully
   - Follow existing command pattern (lines 89-497)

6. **Register CLI command** in main CLI file (likely `src/index.ts` or commands index):
   - Add `sprite pull` subcommand to CLI parser
   - Map to `spritePullCommand()` function
   - Include help text and examples
   - Follow existing command registration pattern

### Phase 3: Testing & Polish (Quality Assurance)

**Overview**: Add comprehensive tests and handle edge cases to ensure the implementation is robust and production-ready.

7. **Add unit tests** in `src/__tests__/fs/sync.test.ts`:
   - Test `downloadFromSpriteVM()` with mocked `execSprite()`
   - Test `extractProjectArchive()` with mocked `spawn()` and file operations
   - Test `syncProjectFromVM()` end-to-end flow
   - Test error handling (tar failures, base64 errors, disk full)
   - Test exclude patterns work correctly
   - Verify temp file cleanup in success and error paths

8. **Add CLI command tests** in `src/__tests__/commands/sprite.test.ts`:
   - Test `spritePullCommand()` with various options
   - Test success and error paths
   - Test `--json` output format
   - Test error handling (VM not found, download failure)
   - Follow existing test pattern (lines 124-645)

9. **Edge case handling**:
   - Empty project (no files to pull)
   - Very large archives (>100MB, test memory usage)
   - Files with special characters (spaces, quotes, newlines)
   - Permission denied errors during extraction
   - Disk space exhausted
   - VM path doesn't exist
   - Symlink handling (preserve, resolve, or error)

### Phase 4: Agent Integration (Stretch Goal)

**Overview**: Optionally integrate automatic file pull-back into the agent runner so changes are synced when agents complete successfully. This enables the "close the loop" workflow described in the item overview.

10. **Extend `SpriteAgentSchema`** in `src/schemas.ts:74-113`:
    - Add `syncOnSuccess: z.boolean().default(false)` to enable auto-pull
    - Add `syncPullPatterns: z.array(z.string()).optional()` for pull-specific excludes
    - Document as optional feature for automatic sync-back

11. **Integrate into `runSpriteAgent()`** in `src/agent/sprite-runner.ts:87-241`:
    - After successful agent execution (after line 227)
    - Check `config.syncOnSuccess` flag
    - Call `syncProjectFromVM()` with project root and excludes
    - Log success or warning (don't fail entire agent run on pull failure)
    - Update agent description to mention that changes can be pulled back

12. **Add integration tests** for auto-pull:
    - Test that pull happens when agent succeeds and `syncOnSuccess=true`
    - Test that pull doesn't happen when `syncOnSuccess=false`
    - Test that pull failures don't fail the agent run
    - Test with real VM if available, otherwise mock

## Open Questions

1. **Default Behavior**: Should files be pulled back automatically or only on explicit command?
   - Item overview says "Option to automatically sync back changed files on agent success (stretch goal or separate config)"
   - **Recommendation**: Manual-only via `wreckit sprite pull` in initial implementation; add `syncOnSuccess` config option as stretch goal

2. **What to Pull**: Pull entire VM directory or only changed files?
   - Option A: Pull entire `/home/user/project` (simple, but includes unchanged files)
   - Option B: Track changes and only pull modified files (complex, requires change detection)
   - **Recommendation**: Option A for simplicity; users can use git to see what actually changed

3. **Exclude Patterns**: Should pull use the same excludes as push?
   - Push excludes: `.git`, `node_modules`, `.wreckit`, `dist`, `build`
   - Pull might want different excludes (e.g., pull `dist` if it's a build artifact)
   - **Recommendation**: Reuse `syncExcludePatterns` by default; add `syncPullPatterns` config option for customization

4. **Conflict Resolution**: What if files on host were modified during agent run?
   - Option A: Always overwrite (data loss risk)
   - Option B: Skip pull if conflicts detected (safe, but incomplete)
   - Option C: Create backup files, then overwrite (.orig pattern)
   - Option D: Require git stash/commit before pull
   - **Recommendation**: Document as user responsibility; suggest using git to detect conflicts; optionally add `.orig` backup in future

5. **Large File Handling**: How to handle archives >100MB that might cause memory issues?
   - Current design loads entire base64 output into Buffer
   - For very large projects, this could exhaust memory
   - **Recommendation**: Start with simple buffer approach; add chunked streaming transfer via `onStdoutChunk` if performance issues arise

6. **VM Path Configuration**: Should the VM path be configurable?
   - Current sync hardcodes `/home/user/project`
   - Users might want to pull from other directories (e.g., `/home/user/build-output`)
   - **Recommendation**: Add `--vm-path` CLI option for manual pull; keep hardcoded for auto-pull

7. **Cleanup Scope**: What should be cleaned up in VM after pull?
   - Option A: Nothing - leave VM state as-is (simple, but disk accumulates)
   - Option B: Delete archive after pull - but tar outputs to stdout, so no temp file
   - Option C: Delete entire VM directory after pull - too destructive
   - **Recommendation**: No cleanup needed in VM (tar outputs to stdout, no temp files); document that VM state persists

8. **Windows Compatibility**: Should this work on Windows hosts?
   - Item 077 documented as Linux/WSL-only
   - tar command and path handling differ on Windows
   - **Recommendation**: Explicitly document as Linux/WSL-only for now; add Windows support later if demand exists

9. **Streaming vs Buffering**: Should we stream download to disk or buffer in memory?
   - Streaming: Lower memory usage, more complex implementation
   - Buffering: Simpler code, higher memory usage
   - **Recommendation**: Start with buffering (Buffer from stdout); add streaming if archives exceed 100MB in practice

10. **Verification**: How to verify pulled files match VM files?
    - Option A: No verification (trust base64 transfer)
    - Option B: Compare file counts (basic sanity check)
    - Option C: Checksum verification (SHA256, but requires two VM roundtrips)
    - **Recommendation**: No verification in initial implementation; log file count for basic validation; add checksums as future enhancement

## Implementation Notes

- **Mirror Existing Patterns**: The download functions should mirror the upload functions in `src/fs/sync.ts:147-258`. Where upload creates local archive and uploads via base64, download creates remote archive and downloads via base64. This symmetry makes the code easier to understand and maintain.

- **Reuse execSprite() Primitive**: All VM operations must use `execSprite()` from `src/agent/sprite-core.ts:312-342`. Do not implement new VM communication code. The `execSprite()` function already handles timeout, streaming, and error recovery.

- **Follow Base64 Pattern**: The remote tools at `src/agent/remote-tools.ts:54-69` show the exact pattern for base64 encoding: `cat file | base64` for reading, decode with `Buffer.from(stdout, 'base64')`. Apply this pattern to archive download.

- **Error Handling Consistency**: Use the existing `SpriteSyncError` class from `src/errors.ts`. Extend the stage type to include `'download'` in addition to `'archive' | 'upload' | 'extract'`. This provides consistent error reporting across sync operations.

- **Temp File Cleanup**: Use try-finally blocks to ensure temporary archives are deleted even if extraction fails. Store temp files in OS temp directory (`/tmp` on Unix, `%TEMP%` on Windows) via `fs.mkdtemp()`, not in project directory.

- **Logging Best Practices**: Log at appropriate levels: `debug` for detailed operations (tar commands, file paths), `info` for user-visible progress (starting download, extraction complete), `warn` for non-fatal issues (cleanup failures), `error` for failures (download failed, extraction failed).

- **CLI Command Pattern**: Follow the existing sprite commands in `src/commands/sprite.ts:89-497`. Use the same structure: load config, call function, output result with emoji indicators, support `--json` flag, handle errors gracefully.

- **Testing Strategy**: Mock both `execSprite()` for VM operations and `spawn()` for tar extraction to test without actual Sprite CLI. Use the existing test patterns from `src/__tests__/fs/sync.test.ts:56-142` and `src/__tests__/commands/sprite.test.ts`.

- **Configuration-Driven**: Respect the existing `syncExcludePatterns` from `SpriteAgentSchema` for what to exclude from pull. Optionally add `syncPullPatterns` for pull-specific exclusions if users need different behavior.

- **Performance Considerations**: Base64 encoding increases archive size by 33%. For large projects (>1000 files, >100MB), consider chunked transfer via `onStdoutChunk` callback to stream decode and avoid loading entire archive into memory.

- **Backward Compatibility**: Adding download functionality doesn't break existing sync-to-VM behavior. No migration needed for existing projects. Auto-pull feature should be opt-in via `syncOnSuccess: false` default.

- **Documentation**: Update agent description to mention that changes can be pulled back. Document the `wreckit sprite pull` command with examples. Provide clear error messages (e.g., "Failed to create archive in VM: tar not found").

- **Security Considerations**: Be cautious with symlinks in archives - they could be used to write files outside the target directory. Consider adding a flag to control symlink handling (dereference, reject, or preserve). Document security implications.

- **Git Integration**: Encourage users to use git to track changes before and after agent runs. This makes it easy to see what the agent modified and resolve conflicts if files were modified on the host during the agent run.
