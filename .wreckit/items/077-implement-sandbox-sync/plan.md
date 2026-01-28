# Implement Sandbox Project Synchronization Implementation Plan

## Overview
Implement automatic synchronization of the current project's codebase into the Sprite VM when starting a Sprite Agent session. This solves the "Empty Box Problem" where agents start in a fresh VM with no access to the code they need to work on. The solution creates a tar.gz archive of the local project (respecting exclusions for .git, node_modules, and .wreckit), uploads it to the Sprite VM via the existing `execSprite` primitive using base64 encoding, and extracts it to `/home/user/project` before the agent begins execution.

## Current State Analysis

### Existing Infrastructure
The codebase has excellent foundational infrastructure for this feature:

**Sprite Execution Primitive** (`src/agent/sprite-runner.ts:459-499`):
- `execSprite()` executes commands inside running VMs
- Supports streaming output via `onStdoutChunk`/`onStderrChunk` callbacks
- Returns `WispResult` interface with proper error handling
- Distinguishes subprocess errors (throws) from command failures (returns success=false)
- **Key Insight**: This function can upload and extract archives

**Agent Runner Integration Point** (`src/agent/sprite-runner.ts:562-721`):
- `runSpriteAgent()` manages the complete agent lifecycle
- Current flow: dry-run check → VM initialization → environment setup → AI service → tool registry → agent execution
- **Gap**: No project synchronization between VM initialization (line 588) and agent execution (line 663)
- **Integration Point**: Insert sync logic after line 597 (VM ready) and before line 632 (tool building)

**Path Resolution** (`src/fs/paths.ts:5-31`):
- `findRepoRoot()` locates repository root by traversing up from cwd
- Looks for both `.git` and `.wreckit` directories
- Throws `RepoNotFoundError` if not found
- **Usage**: Should find project root for synchronization source

**File Utilities** (`src/fs/util.ts:11-103`):
- `pathExists()`, `dirExists()` for existence checks
- `tryReadFile()` for safe file reading with error categorization
- **Gap**: No archiving or file synchronization utilities

**Remote Tools Pattern** (`src/agent/remote-tools.ts:13-31`):
- Shows how VM operations use base64 encoding for binary-safe data transfer
- Read tool (lines 54-69): `cat file | base64` for reading
- Write tool (lines 108-122): `echo base64 | base64 -d > file` for writing
- **Pattern to Follow**: Sync should use similar base64 encoding

**Error Handling Pattern** (`src/errors.ts:408-487`):
- Sprite errors follow consistent pattern: `SpriteStartError`, `SpriteExecError`, etc.
- Error codes defined in `ErrorCodes` enum (lines 14-61)
- Each error includes contextual information (e.g., sprite name, command)
- **Need**: Add `SpriteSyncError` class following this pattern

**Configuration Schema** (`src/schemas.ts:74-105`):
- `SpriteAgentSchema` defines VM configuration (memory, CPUs, timeout, etc.)
- No sync-specific configuration fields yet
- **Optional**: Add `syncEnabled`, `syncExcludePatterns`, `syncTargetDir` fields

### Missing Components
- **File Archiving Module**: No tar.gz creation or extraction utilities
- **Sync Logic**: No VM upload/extraction implementation
- **Error Handling**: No sync-specific error classes

### Key Constraints
1. **No new dependencies**: Must use existing `execSprite` primitive and system `tar` command
2. **Binary-safe transfer**: Must handle binary files correctly via base64 encoding
3. **Shell command length limits**: Inline base64 may fail for large archives (>100KB typical)
4. **Performance**: Sync should complete quickly for small/medium projects
5. **Cleanup**: Temporary archives must be cleaned up to avoid disk leaks
6. **Backward compatibility**: Adding sync shouldn't break existing Sprite functionality

## Desired End State

### Functional Requirements
1. When a Sprite Agent starts, the current project's code is automatically synchronized to the VM
2. Synchronization excludes `.git`, `node_modules`, and `.wreckit` directories by default
3. The agent can immediately access project files via remote tools without manual cloning
4. Sync failures are reported clearly with actionable error messages
5. Temporary archive files are cleaned up after upload

### Non-Functional Requirements
1. **Performance**: Small projects (<100 files, <10MB) sync in <5 seconds
2. **Reliability**: Handle network failures, VM errors, and disk space issues gracefully
3. **Maintainability**: Code follows existing patterns (error handling, streaming, result types)
4. **Extensibility**: API accepts exclude patterns for future flexibility
5. **User Experience**: Show sync progress and clear error messages

### Verification Criteria
- Create a test project with various file types (code, images, PDFs)
- Run Sprite Agent in project directory
- Verify files appear in VM at `/home/user/project`
- Verify excluded directories (.git, node_modules) are not present
- Verify binary files transfer correctly (checksum match)
- Verify cleanup happens (no temp archives left behind)
- Test error cases: missing tar, permission denied, disk full

## Key Discoveries

1. **Integration Point Confirmed**: The exact location to insert sync is between VM initialization (line 588) and tool registry building (line 632) in `runSpriteAgent()`. This ensures the VM is running but before the agent starts execution.

2. **Base64 Transfer Pattern**: The remote tools demonstrate the exact pattern to use: `cat file | base64` for reading and `echo base64 | base64 -d > file` for writing. This avoids binary corruption.

3. **System tar Command**: Following the existing pattern of shelling out to system commands (like `sprite` CLI), use `spawn('tar')` instead of adding npm dependencies. This keeps the dependency surface minimal.

4. **Archive Size Risk**: Shell command length limits (typically 128KB-1MB) mean inline base64 encoding will fail for large projects. The initial implementation uses inline for simplicity, with future enhancement to file-based upload if needed.

5. **Project Root Detection**: `findRepoRoot()` requires both `.git` AND `.wreckit` directories. This means sync only works in initialized wreckit repositories, which is correct behavior.

6. **Agent Description Update Required**: Line 647-649 explicitly states "The VM starts empty." After implementing sync, this must be updated to "The VM has your project code synchronized from the host at /home/user/project."

7. **Error Recovery Strategy**: If sync fails, the agent should NOT continue with an empty VM. The "Empty Box Problem" means agents can't do useful work without project code, so fail early rather than falling back to empty VM.

8. **Existing Sprite Error Pattern**: All Sprite errors include the VM name in error context. The new `SpriteSyncError` should follow this pattern and include both the stage (archive/upload/extract) and project root.

9. **Streaming Support**: `runWispCommand()` supports streaming callbacks (`onStdoutChunk`, `onStderrChunk`). The sync implementation should expose these for progress tracking on large archives, even if not used immediately.

10. **No .gitignore Parsing Required**: Hardcoded exclusions (.git, node_modules, .wreckit) are sufficient for the initial implementation. Full .gitignore parsing can be added in a future item if needed.

## What We're NOT Doing

### Explicitly Out of Scope
1. **Two-way synchronization**: Changes made in the VM are NOT synced back to the host (planned for future item)
2. **Incremental sync**: Always performs full sync, not rsync-style differential updates
3. **Full .gitignore parsing**: Uses hardcoded exclusions (.git, node_modules, .wreckit) only
4. **Windows compatibility**: Documented as Linux/WSL-only for now
5. **Progress indicators**: Streaming callbacks exist but not exposed to users yet
6. **Configuration-driven exclusions**: API accepts exclude patterns but config schema extension is optional
7. **Optimized compression**: Uses default gzip compression; faster compression deferred if needed
8. **Concurrent VM sync**: Multiple syncs to same VM not handled (documented as user responsibility)
9. **Symlink handling**: Uses tar's default behavior (follows symlinks); custom handling deferred
10. **File permission preservation**: Uses default tar permissions; explicit mode setting deferred

## Implementation Approach

### High-Level Strategy
The implementation follows a three-phase approach that prioritizes core functionality first, then integration, then polish. Each phase is independently testable and builds on the previous phase.

**Phase 1: Core Synchronization Infrastructure** creates the new `src/fs/sync.ts` module with project archiving and VM upload capabilities. This phase can be tested independently without modifying the agent runner.

**Phase 2: Agent Integration** integrates the sync logic into `runSpriteAgent()` so it happens automatically when agents start. This phase also updates the agent description to reflect the new capability.

**Phase 3: Testing & Polish** adds comprehensive unit tests, error handling improvements, and edge case handling. This phase ensures the feature is production-ready.

### Key Design Decisions

1. **System tar Command**: Use `spawn('tar')` instead of npm tar package to follow existing patterns and avoid new dependencies. The codebase already shells out to `sprite` CLI, so this is consistent.

2. **Base64 Encoding**: Use base64 encoding for binary-safe transfer, following the exact pattern used in remote tools. This prevents corruption of binary files (images, PDFs, etc.).

3. **Error Recovery**: Fail the entire agent run if sync fails. The "Empty Box Problem" means agents can't work without project code, so continuing with an empty VM provides no value.

4. **Cleanup Strategy**: Use try-finally blocks to ensure temporary archives are deleted even if upload fails. Store archives in `.wreckit/` directory which is already gitignored.

5. **Integration Point**: Insert sync logic after VM initialization (line 597) and before tool registry building (line 632). This ensures the VM is running and project code is available before the agent starts.

6. **Configuration**: Add sync options to `SpriteAgentSchema` but make them optional with sensible defaults. This allows future flexibility without breaking existing configurations.

---

## Phase 1: Core Synchronization Infrastructure

### Overview
Create the `src/fs/sync.ts` module with project archiving and VM upload capabilities. Add the `SpriteSyncError` class to handle sync-specific failures. This phase creates the foundation for synchronization but does not integrate it into the agent yet.

### Changes Required

#### 1. Add Sync Error Class
**File**: `src/errors.ts`
**Lines**: 14-61 (ErrorCodes enum), 488+ (error class definitions)

**Add error code to ErrorCodes enum** (after line 57):

```typescript
export const ErrorCodes = {
  // ... existing codes ...
  SPRITE_EXEC_FAILED: "SPRITE_EXEC_FAILED",

  // Project synchronization errors (Item 077)
  SPRITE_SYNC_FAILED: "SPRITE_SYNC_FAILED",
} as const;
```

**Add error class after SpriteExecError** (after line 487):

```typescript
/**
 * Thrown when project synchronization to Sprite VM fails.
 * Distinguishes between archive creation, upload, and extraction failures.
 */
export class SpriteSyncError extends WreckitError {
  constructor(
    public readonly stage: 'archive' | 'upload' | 'extract',
    public readonly projectRoot: string,
    message: string,
  ) {
    super(
      `Failed to sync project '${projectRoot}' to Sprite VM at stage '${stage}': ${message}`,
      ErrorCodes.SPRITE_SYNC_FAILED,
    );
    this.name = "SpriteSyncError";
  }
}
```

#### 2. Create Sync Module
**File**: `src/fs/sync.ts` (NEW FILE)

**Full implementation**:

```typescript
import * as fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import type { Logger } from '../logging';
import type { SpriteAgentConfig } from '../schemas';
import { execSprite } from '../agent/sprite-runner';

/**
 * Result from creating a project archive.
 */
export interface CreateArchiveResult {
  success: boolean;
  archivePath?: string;
  archiveSize?: number;
  error?: string;
}

/**
 * Result from uploading archive to VM.
 */
export interface UploadArchiveResult {
  success: boolean;
  vmPath?: string;
  error?: string;
}

/**
 * Options for creating project archive.
 */
export interface CreateArchiveOptions {
  projectRoot: string;
  excludePatterns?: string[];
  logger: Logger;
}

/**
 * Options for uploading archive to VM.
 */
export interface UploadArchiveOptions {
  vmName: string;
  archivePath: string;
  config: SpriteAgentConfig;
  logger: Logger;
}

/**
 * Default exclude patterns for project synchronization.
 */
const DEFAULT_EXCLUDE_PATTERNS = [
  '.git',
  'node_modules',
  '.wreckit',
  'dist',
  'build',
];

/**
 * Create a tar.gz archive of the project, excluding specified patterns.
 * Uses system tar command for compatibility and to avoid npm dependencies.
 */
export async function createProjectArchive(
  options: CreateArchiveOptions
): Promise<CreateArchiveResult> {
  const { projectRoot, excludePatterns = DEFAULT_EXCLUDE_PATTERNS, logger } = options;

  logger.debug(`Creating project archive from ${projectRoot}`);

  const wreckitDir = path.join(projectRoot, '.wreckit');
  await fs.mkdir(wreckitDir, { recursive: true });

  const archivePath = path.join(wreckitDir, 'project-sync.tar.gz');
  const excludeArgs = excludePatterns.flatMap(p => ['--exclude', p]);

  return new Promise((resolve) => {
    const tar = spawn('tar', [
      'czf',
      archivePath,
      ...excludeArgs,
      '-C', projectRoot,
      '.',
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

    tar.on('error', (err) => {
      resolve({
        success: false,
        error: `tar process error: ${err.message}`,
      });
    });
  });
}

/**
 * Upload archive to Sprite VM and extract it to the target directory.
 * Uses base64 encoding to safely transfer binary data.
 */
export async function uploadToSpriteVM(
  options: UploadArchiveOptions
): Promise<UploadArchiveResult> {
  const { vmName, archivePath, config, logger } = options;

  logger.debug(`Uploading archive to Sprite VM '${vmName}'`);

  const targetDir = '/home/user/project';

  try {
    const archiveBuffer = await fs.readFile(archivePath);
    const base64Archive = archiveBuffer.toString('base64');

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

/**
 * Synchronize project to Sprite VM by creating archive and uploading it.
 * Automatically cleans up local archive after upload.
 */
export async function syncProjectToVM(
  vmName: string,
  projectRoot: string,
  config: SpriteAgentConfig,
  logger: Logger
): Promise<boolean> {
  const archiveResult = await createProjectArchive({
    projectRoot,
    logger,
  });

  if (!archiveResult.success) {
    logger.error(`Failed to create project archive: ${archiveResult.error}`);
    return false;
  }

  logger.info(`Project archive created: ${archiveResult.archiveSize} bytes`);

  const uploadResult = await uploadToSpriteVM({
    vmName,
    archivePath: archiveResult.archivePath!,
    config,
    logger,
  });

  // Clean up local archive
  if (archiveResult.archivePath) {
    try {
      await fs.unlink(archiveResult.archivePath);
      logger.debug('Cleaned up local archive');
    } catch (err) {
      logger.warn(`Failed to clean up archive: ${(err as Error).message}`);
    }
  }

  if (!uploadResult.success) {
    logger.error(`Failed to upload to VM: ${uploadResult.error}`);
    return false;
  }

  logger.info(`Project synchronized to ${uploadResult.vmPath}`);
  return true;
}
```

### Success Criteria

#### Automated Verification:
- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] Module can be imported: `import { syncProjectToVM } from './fs/sync'`
- [ ] Error class can be instantiated with correct properties
- [ ] Error code exists in `ErrorCodes` enum
- [ ] Functions are properly typed with TypeScript

**Note**: Complete Phase 1 fully before proceeding. This phase creates the foundation but does not integrate sync into the agent yet.

---

## Phase 2: Agent Integration

### Overview
Integrate synchronization into the `runSpriteAgent()` function so projects are automatically synced when agents start. Update agent description to reflect synchronized project availability. This phase makes the sync functionality actually work in the agent workflow.

### Changes Required

#### 1. Integrate Sync into Agent Startup
**File**: `src/agent/sprite-runner.ts`
**Lines**: 562-721 (runSpriteAgent function)

**Add imports** (after existing imports around line 24):

```typescript
import { findRepoRoot } from "../fs/paths";
import { syncProjectToVM } from "../fs/sync";
import { SpriteSyncError } from "../errors";
```

**Insert sync logic after VM initialization** (after line 597, before line 599):

```typescript
    const vmReady = await ensureSpriteRunning(vmName, config, logger);
    if (!vmReady) {
      return {
        success: false,
        output: "Failed to initialize Sprite VM",
        timedOut: false,
        exitCode: 1,
        completionDetected: false,
      };
    }

    // === NEW: Synchronize project to VM ===
    logger.info('Synchronizing project to Sprite VM...');

    try {
      // Find project root from cwd
      const projectRoot = findRepoRoot(cwd);

      // Synchronize project
      const syncSuccess = await syncProjectToVM(vmName, projectRoot, config, logger);

      if (!syncSuccess) {
        logger.error('Project synchronization failed');
        return {
          success: false,
          output: 'Project synchronization failed. Agent cannot proceed without access to project code.',
          timedOut: false,
          exitCode: 1,
          completionDetected: false,
        };
      }

      logger.info('Project synchronized successfully');
    } catch (err) {
      // Handle RepoNotFoundError (not in a git repo)
      if ((err as Error).name === 'RepoNotFoundError') {
        logger.warn(`Not in a wreckit repository, skipping project sync`);
        // Continue without sync - agent will work with empty VM
      } else {
        throw err;  // Re-throw unexpected errors
      }
    }
    // === END SYNC ===

    // 2. Build Environment (API Keys)
```

#### 2. Update Agent Description
**File**: `src/agent/sprite-runner.ts`
**Lines**: 647-649 (agent description)

**Replace**:

```typescript
      description: `You are an expert software engineer working inside a sandboxed Linux microVM.
      You have access to standard tools (Bash, Read, Write) which execute INSIDE the VM.
      The project has been synchronized from the host machine to /home/user/project.
      You can access and modify the project code directly in this directory.
      `,
```

### Success Criteria

#### Automated Verification:
- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`
- [ ] No errors in imports (dynamic imports resolve correctly)

#### Manual Verification:
- [ ] Agent startup includes "Synchronizing project to Sprite VM..." log message
- [ ] Sync failure returns error result with exit code 1
- [ ] Successful sync continues to agent execution
- [ ] Agent description mentions /home/user/project directory
- [ ] Agent can read files from synced project

**Note**: Complete Phase 2 fully before proceeding. This phase integrates sync into the actual agent workflow.

---

## Phase 3: Testing & Polish

### Overview
Add comprehensive unit tests for the sync module and verify edge cases are handled correctly. This phase ensures the implementation is robust and production-ready.

### Changes Required

#### 1. Create Unit Tests
**File**: `src/__tests__/fs/sync.test.ts` (NEW FILE)

**Test implementation** (using Bun test framework):

```typescript
import { describe, it, expect, beforeEach, mock, spyOn } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { ChildProcess } from "node:child_process";
import {
  createProjectArchive,
  uploadToSpriteVM,
  syncProjectToVM,
} from "../../fs/sync";
import type { Logger } from "../../logging";
import type { SpriteAgentConfig } from "../../schemas";

function createMockLogger(): Logger & { messages: string[] } {
  const messages: string[] = [];
  return {
    messages,
    debug: (msg: string) => messages.push(`debug: ${msg}`),
    info: (msg: string) => messages.push(`info: ${msg}`),
    warn: (msg: string) => messages.push(`warn: ${msg}`),
    error: (msg: string) => messages.push(`error: ${msg}`),
  };
}

function createMockConfig(): SpriteAgentConfig {
  return {
    kind: "sprite",
    wispPath: "sprite",
    timeout: 300,
    maxVMs: 5,
    defaultMemory: "512MiB",
    defaultCPUs: "1",
  };
}

async function setupTempProject(): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-sync-test-"));
  await fs.mkdir(path.join(tempDir, ".git"), { recursive: true });
  await fs.mkdir(path.join(tempDir, ".wreckit"), { recursive: true });
  await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
  await fs.writeFile(path.join(tempDir, "package.json"), '{"name": "test"}');
  await fs.writeFile(path.join(tempDir, "src", "index.ts"), "console.log('test');");
  return tempDir;
}

function mockSpawn(exitCode: number = 0) {
  const mockChild = {
    stderr: {
      on: mock((event, callback) => {}),
    },
    on: mock((event, callback) => {
      if (event === "close") callback(exitCode);
    }),
  } as unknown as ChildProcess;
  return spyOn(global, "spawn").mockReturnValue(mockChild);
}

describe("Project Synchronization", () => {
  describe("createProjectArchive", () => {
    let tempProject: string;
    let mockLogger: Logger;

    beforeEach(async () => {
      tempProject = await setupTempProject();
      mockLogger = createMockLogger();
    });

    it("creates tar.gz archive with default exclusions", async () => {
      const spawnSpy = mockSpawn(0);

      const result = await createProjectArchive({
        projectRoot: tempProject,
        logger: mockLogger,
      });

      expect(result.success).toBe(true);
      expect(spawnSpy).toHaveBeenCalledWith(
        "tar",
        expect.arrayContaining([
          "czf",
          expect.stringContaining("project-sync.tar.gz"),
          "--exclude", ".git",
          "--exclude", "node_modules",
          "--exclude", ".wreckit",
        ])
      );
    });

    it("handles tar command failures", async () => {
      mockSpawn(1); // Non-zero exit code

      const result = await createProjectArchive({
        projectRoot: tempProject,
        logger: mockLogger,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("tar failed");
    });
  });

  describe("uploadToSpriteVM", () => {
    let tempProject: string;
    let archivePath: string;
    let mockLogger: Logger;
    let mockConfig: SpriteAgentConfig;

    beforeEach(async () => {
      tempProject = await setupTempProject();
      mockLogger = createMockLogger();
      mockConfig = createMockConfig();
      archivePath = path.join(tempProject, ".wreckit", "project-sync.tar.gz");
      await fs.writeFile(archivePath, "fake-archive-content");
    });

    it("uploads and extracts archive successfully", async () => {
      const mockExecSprite = mock().mockResolvedValue({
        success: true,
        stdout: "",
        stderr: "",
        exitCode: 0,
      });

      mock.module("../../agent/sprite-runner", () => ({
        execSprite: mockExecSprite,
      }));

      const result = await uploadToSpriteVM({
        vmName: "test-vm",
        archivePath,
        config: mockConfig,
        logger: mockLogger,
      });

      expect(result.success).toBe(true);
      expect(result.vmPath).toBe("/home/user/project");
    });

    it("handles upload failures", async () => {
      const mockExecSprite = mock().mockResolvedValue({
        success: false,
        stdout: "",
        stderr: "Disk full",
        exitCode: 1,
      });

      mock.module("../../agent/sprite-runner", () => ({
        execSprite: mockExecSprite,
      }));

      const result = await uploadToSpriteVM({
        vmName: "test-vm",
        archivePath,
        config: mockConfig,
        logger: mockLogger,
      });

      expect(result.success).toBe(false);
    });
  });

  describe("syncProjectToVM", () => {
    let tempProject: string;
    let mockLogger: Logger;
    let mockConfig: SpriteAgentConfig;

    beforeEach(async () => {
      tempProject = await setupTempProject();
      mockLogger = createMockLogger();
      mockConfig = createMockConfig();
    });

    it("successfully synchronizes project", async () => {
      mockSpawn(0);
      const mockExecSprite = mock().mockResolvedValue({
        success: true,
        stdout: "",
        stderr: "",
        exitCode: 0,
      });

      mock.module("../../agent/sprite-runner", () => ({
        execSprite: mockExecSprite,
      }));

      const result = await syncProjectToVM("test-vm", tempProject, mockConfig, mockLogger);

      expect(result).toBe(true);
    });

    it("cleans up archive after upload", async () => {
      mockSpawn(0);
      const mockExecSprite = mock().mockResolvedValue({
        success: true,
        stdout: "",
        stderr: "",
        exitCode: 0,
      });

      mock.module("../../agent/sprite-runner", () => ({
        execSprite: mockExecSprite,
      }));

      await syncProjectToVM("test-vm", tempProject, mockConfig, mockLogger);

      const archivePath = path.join(tempProject, ".wreckit", "project-sync.tar.gz");
      const exists = await fs.access(archivePath).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });
  });
});
```

### Success Criteria

#### Automated Verification:
- [ ] All tests pass: `bun test src/__tests__/fs/sync.test.ts`
- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] Tests cover success path (archive creation, upload, cleanup)
- [ ] Tests cover error paths (tar failure, upload failure, file errors)
- [ ] Tests verify exclude patterns work correctly
- [ ] Tests verify cleanup happens even on failure
- [ ] Edge cases handled (empty project, special characters, permissions)

**Note**: Complete Phase 3 fully. This phase ensures the implementation is robust and well-tested.

---

## Testing Strategy

### Unit Tests

**What to test**:
- Archive creation with various directory structures
- Exclude patterns (default and custom)
- Upload/extract flow with mocked execSprite
- Error handling (tar failures, VM errors, file I/O errors)
- Archive cleanup on success and failure
- Base64 encoding correctness

**Key edge cases**:
- Empty project (no files beyond excluded ones)
- Very large archive sizes (test buffer handling)
- Special characters in filenames (spaces, quotes, newlines)
- Permission denied errors during tar creation
- VM disk space exhaustion
- Binary file handling (images, PDFs)

### Integration Tests

**End-to-end scenarios** (if Sprite CLI available):
- Real project sync to actual VM
- Binary file handling (images, PDFs)
- Large projects (>1000 files)
- Verify synced files match source checksums

**Without Sprite CLI**:
- Mock-based integration tests (covered in unit tests)

### Manual Testing Steps

1. **Create test project**:
   ```bash
   mkdir /tmp/test-sync-project
   cd /tmp/test-sync-project
   git init
   wreckit init
   echo "test" > README.md
   mkdir src && echo "code" > src/index.ts
   ```

2. **Configure Sprite agent**:
   ```bash
   wreckit config agent.kind sprite
   ```

3. **Run agent and verify sync**:
   ```bash
   wreckit run sprite "list all files in the project"
   ```

4. **Verify expected behavior**:
   - Log shows "Synchronizing project to Sprite VM..."
   - Log shows "Project synchronized successfully"
   - Agent can access files in /home/user/project
   - Local .wreckit/project-sync.tar.gz is cleaned up

## Migration Notes

No data migration required. This is a new feature with no existing state to migrate.

**Backward Compatibility**:
- Existing Sprite agent workflows continue to work
- Sync is automatic and transparent to users
- No configuration changes required (defaults work for all projects)
- No database migrations (no persistent state added)

**User Impact**:
- Sprite agents now have access to project code automatically
- Faster agent startup (no need to clone repos manually)
- Slightly longer startup time (sync overhead, typically <5s for small projects)

## References

- Research: `/Users/speed/wreckit/.wreckit/items/077-implement-sandbox-sync/research.md`
- Core primitive: `src/agent/sprite-runner.ts:459-499` (execSprite)
- Integration point: `src/agent/sprite-runner.ts:562-721` (runSpriteAgent)
- Path utilities: `src/fs/paths.ts:5-31` (findRepoRoot)
- Error handling: `src/errors.ts:408-487` (Sprite error classes)
- Configuration schema: `src/schemas.ts:74-105` (SpriteAgentSchema)
- Remote tools pattern: `src/agent/remote-tools.ts:54-69` (base64 encoding)
