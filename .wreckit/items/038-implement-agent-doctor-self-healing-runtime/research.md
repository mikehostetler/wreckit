# Research: Implement The Agent Doctor (Self-Healing Runtime)

**Date**: 2025-01-25
**Item**: 038-implement-agent-doctor-self-healing-runtime

## Research Question

Implement a recursive self-healing capability where the runtime can catch system errors (git locks, npm failures, invalid JSON) and spawn a specialized "Doctor Agent" to fix the environment and resume execution.

**Key Features:**
- **Error Interception:** Catch exit codes and stderr from agent processes.
- **Doctor Skill:** A specialized skill set for environment repair (rm locks, npm install, json fix).
- **Recursive Recovery:** The watchdog should not crash; it should pause, heal, and retry.

**Motivation:** Demonstrated need during Campaign M4 where manual intervention was required for git locks and dependency issues.

## Summary

The wreckit codebase already has a foundation for error diagnosis and recovery through the `doctor.ts` module (`src/doctor.ts:1-857`). However, the current implementation is a **manual CLI command** that users run explicitly. The Agent Doctor feature requires **automated, recursive self-healing** that intercepts errors during agent execution and autonomously repairs the environment.

The research reveals three key architectural layers where the Agent Doctor must integrate:

1. **Error Interception Layer** - Currently, errors from agent processes are caught in `src/agent/runner.ts:160-317` (process-based) and SDK runners, but they only result in logging and failure. No automatic recovery is attempted.

2. **Orchestration Layer** - The orchestrator (`src/commands/orchestrator.ts:103-384`) manages batch execution with resumability via `batch-progress.json`, but when items fail, they're simply marked as failed and moved to a `failed` array. No retry logic exists beyond manual `--retry-failed` flag.

3. **Doctor Capabilities** - The existing `doctor.ts` module can diagnose and fix: state mismatches, stale index, batch progress corruption, missing prompts, git index locks, and JSON validation errors. These capabilities need to be exposed as programmatic APIs rather than just CLI commands.

The implementation requires creating a new **Self-Healing Agent Runner** wrapper that:
- Wraps existing agent execution with error monitoring
- Detects recoverable error patterns (git locks, npm failures, JSON corruption)
- Invokes doctor procedures autonomously
- Retries execution with exponential backoff
- Maintains audit trail of healing operations

## Current State Analysis

### Existing Implementation

#### Doctor Module (`src/doctor.ts`)
The doctor module provides comprehensive diagnostic and repair capabilities:

**Diagnostic Functions:**
- `diagnoseConfig()` (lines 206-244) - Validates config.json schema and JSON structure
- `diagnoseItem()` (lines 246-446) - Validates item state, artifact existence, PRD quality
- `diagnoseDependencies()` (lines 107-173) - Detects circular dependencies and missing deps
- `diagnoseIndex()` (lines 448-517) - Checks index.json sync state with actual items
- `diagnoseBatchProgress()` (lines 536-608) - Validates batch-progress.json and detects stale sessions
- `diagnosePrompts()` (lines 519-534) - Checks for missing prompt templates

**Repair Capabilities:**
- `applyFixes()` (lines 655-838) - Auto-fixes recoverable issues:
  - Rebuilds stale `index.json` by scanning items
  - Creates default prompt templates via `initPromptTemplates()`
  - Resets item states to match actual artifacts (e.g., `researched` → `idea` if research.md missing)
  - Removes stale/corrupt `batch-progress.json`

**Key Pattern:** All fixes create **backups** before modification (line 668: `createBackupSession`) and track backup entries for rollback.

#### Agent Runner (`src/agent/runner.ts`)
The agent runner supports multiple agent backends via a discriminated union:

**Process-based execution** (lines 207-317):
- Spawns agent process with `spawn()` from `node:child_process`
- Captures `stdout`, `stderr` separately
- Detects completion via `completion_signal` in output
- Returns `AgentResult` with `success`, `output`, `timedOut`, `exitCode`, `completionDetected`
- **No error recovery** - simply returns failure result

**SDK-based execution** (lines 389-494):
- Supports Claude SDK, Amp SDK, Codex SDK, OpenCode SDK
- Uses `runAgentUnion()` dispatch based on `config.kind`
- Each SDK runner handles its own error conditions
- Fallback to process mode on authentication failure (lines 189-200)

**Cleanup mechanism:** `terminateAllAgents()` (lines 19-54) tracks active SDK AbortControllers and process ChildProcesses for graceful shutdown.

#### Orchestrator (`src/commands/orchestrator.ts`)
Batch execution with resumability:

**Resumability** (lines 127-191):
- Reads `batch-progress.json` on startup
- Detects stale progress (>24 hours old or owning process dead)
- Supports `--no-resume` to start fresh
- Supports `--retry-failed` to re-queue failed items

**Error handling** (lines 333-360, 455-475):
- Catches errors from `runCommand()`
- Marks items as failed in `batchProgress.failed` array
- Persists error message to `item.last_error`
- Continues to next item (doesn't crash entire batch)

**Gap:** Failed items stay failed. No automatic retry or healing.

#### Git Operations (`src/git/index.ts`)
Git mutex for lock contention prevention:

**Mutex pattern** (lines 62-96):
- `Mutex` class serializes git operations to prevent `.git/index.lock` issues
- `gitMutex.dispatch()` wraps all `runGitCommand()` calls (line 95)
- Prevents concurrent git operations from creating lock conflicts

**Stale lock detection** (in `src/fs/lock.ts:156-196`):
- FileLock checks if lock process is still running via `process.kill(pid, 0)`
- Removes locks older than 60 seconds (`STALE_THRESHOLD_MS`)
- Auto-cleanup of stale locks during acquisition attempts

#### Error Types (`src/errors.ts`)
Comprehensive error class hierarchy:

**Base class:** `WreckitError` with error codes (lines 1-168)
- `AgentError` - Agent execution failures
- `GitError` - Git operation failures
- `InvalidJsonError` - JSON parsing failures
- `FileNotFoundError` - Missing files
- `PhaseFailedError` - Workflow phase failures with phase/item context

**Git-specific errors** (lines 316-389):
- `BranchError` - Branch create/checkout failures
- `PushError` - Push to remote failures
- `PrCreationError` - PR creation failures
- `MergeConflictError` - Merge conflict detection

### Key Files

#### `src/doctor.ts:1-857`
**What's there:** Complete diagnostic and repair system for wreckit repository state.
- Diagnoses config, items, index, dependencies, batch progress, prompts
- Applies fixes with backup tracking
- Supports `--fix` flag for automatic repair

**How it's used:** Currently only as CLI command (`wreckit doctor [--fix]`)
**Integration point:** Needs programmatic API for automated healing

#### `src/agent/runner.ts:160-317`
**What's there:** Process-based agent execution with stdout/stderr capture.
- Spawns agent command in subprocess
- Captures output chunk-by-chunk
- Returns structured `AgentResult`

**Gap:** No automatic error detection or recovery. Just returns failure.
**Integration point:** Wrap with error-detecting layer that calls doctor

#### `src/commands/orchestrator.ts:103-384`
**What's there:** Batch execution engine with resumability via batch-progress.json.
- Sequential or parallel item processing
- Dependency-aware ordering
- Checkpoint/restore via batch progress file

**Gap:** Failed items are not retried or healed. Just marked failed.
**Integration point:** Add retry loop with doctor intervention on failures

#### `src/git/index.ts:62-96`
**What's there:** Mutex for serializing git operations to prevent `.git/index.lock`.
- `gitMutex.dispatch()` wraps all git commands
- Prevents concurrent git operations

**Integration point:** Doctor should check for stale git locks and remove them

#### `src/fs/lock.ts:156-196`
**What's there:** FileLock with stale lock detection.
- Checks if lock process is running via `process.kill(pid, 0)`
- Removes locks older than 60 seconds
- Used for wreckit's own file locking (not git locks)

**Integration point:** Similar pattern needed for detecting `.git/index.lock` staleness

#### `src/workflow/itemWorkflow.ts:234-300`
**What's there:** Phase execution (research, plan, implement) with validation.
- Calls `runAgentUnion()` to execute agents
- Validates phase outputs (research quality, plan quality, story completion)
- Retries failed validation up to 3 times (lines 290-299)

**Gap:** Retries only on validation failures, not on system errors (git locks, npm failures)
**Integration point:** Add error catching and healing before validation retries

#### `src/commands/run.ts:57-174`
**What's there:** Single-item execution loop.
- Iterates through phases: research → plan → implement → critique → pr → complete
- Calls phase runners from workflow module
- Throws on phase failure

**Integration point:** Top-level error boundary for single-item execution

## Technical Considerations

### Dependencies

**External Dependencies:**
- `node:child_process` - For spawning repair commands (git, npm, rm)
- `node:fs/promises` - For file system repairs (removing locks, fixing JSON)

**Internal Modules:**
- `src/doctor.ts` - Diagnostic and repair procedures (reuse existing functions)
- `src/errors.ts` - Error type detection and classification
- `src/git/index.ts` - Git lock detection and removal
- `src/fs/lock.ts` - Stale lock detection patterns
- `src/agent/runner.ts` - Agent execution wrapper
- `src/commands/orchestrator.ts` - Batch execution integration
- `src/schemas.ts` - Skill definition for "doctor" skill

### Patterns to Follow

**1. Error Classification Pattern** (from `src/errors.ts`):
```typescript
if (error instanceof WreckitError) {
  // Check error.code for specific error types
  switch (error.code) {
    case ErrorCodes.GIT_ERROR:
      // Handle git errors
    case ErrorCodes.INVALID_JSON:
      // Handle JSON errors
  }
}
```

**2. Backup-Before-Modify Pattern** (from `src/doctor.ts:668-837`):
```typescript
const sessionId = await createBackupSession(root);
try {
  const entry = await backupFile(root, sessionId, filePath, diagnostic, "modified");
  // ... make modifications ...
  await finalizeBackupSession(root, sessionId, backupEntries);
} catch {
  await removeEmptyBackupSession(root, sessionId);
}
```

**3. Retry with Exponential Backoff Pattern** (from `src/fs/lock.ts:282-312`):
```typescript
for (let i = 0; i < maxRetries; i++) {
  try {
    return await fn();
  } catch (err) {
    const errorCode = (err as NodeJS.ErrnoException).code;
    if (RETRYABLE_CODES.has(errorCode)) {
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
      continue;
    }
    throw err;
  }
}
```

**4. Skill Loading Pattern** (from `src/agent/skillLoader.ts`):
```typescript
const skillResult = loadSkillsForPhase("implement", config.skills);
// Returns: { allowedTools, mcpServers, contextRequirements, loadedSkillIds }
```

**5. Agent Result Pattern** (from `src/agent/runner.ts:65-71`):
```typescript
interface AgentResult {
  success: boolean;
  output: string;
  timedOut: boolean;
  exitCode: number | null;
  completionDetected: boolean;
}
```

### Conventions Observed

1. **Error messages are human-readable** - Includes context and recovery suggestions
2. **All mutations create backups** - Doctor fixes always backup before modifying
3. **Processes are tracked for cleanup** - `activeProcessAgents` Set for graceful shutdown
4. **Git operations are serialized** - Mutex prevents concurrent git access
5. **Stale locks are auto-cleaned** - FileLock checks process liveness before waiting
6. **Batch progress is checkpointed** - Orchestrator saves state after each item

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Doctor Agent makes incorrect repair** | High - Could corrupt repository state | - Always create backups before repair<br>- Validate repair success before retry<br>- Limit doctor to safe operations (rm locks, npm install)<br>- Require user approval for destructive repairs via config flag |
| **Infinite retry loop** | High - Could run forever if error persists | - Max retry limit (default: 3)<br>- Exponential backoff between retries<br>- Give up after max attempts and mark as failed<br>- Log each attempt with timestamp |
| **Doctor Agent itself fails** | Medium - Recovery attempt could crash | - Wrap doctor procedures in try-catch<br>- Fall back to marking item as failed if doctor fails<br>- Log doctor failures separately for debugging |
| **False positive error detection** | Medium - Could interrupt valid execution | - Use specific error patterns (git lock messages, npm error codes)<br>- Whitelist recoverable error types<br>- Log detected errors for audit trail |
| **Race conditions in parallel mode** | High - Multiple items could try to repair same resource | - Doctor should acquire locks before repair (FileLock pattern)<br>- Serialize doctor operations via mutex<br>- Check if already healed before attempting repair |
| **Git lock removal during active operation** | Medium - Could corrupt git index | - Check if git process is running before removing lock<br>- Use stale detection (process not running + lock old)<br>- Only remove `.git/index.lock`, not other git files |
| **npm install modifies package-lock.json** | Low - Could cause merge conflicts | - Run npm install in item branch (not base branch)<br>- Commit repairs along with item changes<br>- Document repair in commit message |
| **Doctor skill conflicts with user skills** | Low - Tool allowlist conflicts | - Doctor skill should bypass tool restrictions (emergency mode)<br>- Add doctor skill as implicit skill for all phases<br>- Document that doctor tools are always available |

## Recommended Approach

### High-Level Strategy

Based on research findings, implement Agent Doctor as a **multi-layer self-healing system**:

#### Layer 1: Error Detection Wrapper (Agent Runner Level)
Create `src/agent/healingRunner.ts` that wraps `runAgentUnion()`:

```typescript
export async function runAgentWithHealing(
  options: UnionRunAgentOptions,
  healingConfig: HealingConfig
): Promise<AgentResult> {
  const maxRetries = healingConfig.maxRetries ?? 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    attempt++;
    const result = await runAgentUnion(options);

    if (result.success) {
      return result;
    }

    // Detect if error is recoverable
    const diagnosis = detectRecoverableError(result);
    if (!diagnosis) {
      return result; // Not recoverable, return failure
    }

    if (attempt >= maxRetries) {
      break; // Max retries reached
    }

    // Apply healing
    await applyHealing(diagnosis, options, healingConfig);

    // Exponential backoff before retry
    await sleep(1000 * Math.pow(2, attempt - 1));
  }

  return result; // Failed after all retries
}
```

#### Layer 2: Error Detection Engine
Create `src/agent/errorDetector.ts` with pattern matching:

```typescript
interface ErrorDiagnosis {
  recoverable: boolean;
  errorType: 'git_lock' | 'npm_failure' | 'json_corruption' | 'unknown';
  confidence: number; // 0-1
  suggestedRepair: string[];
}

function detectRecoverableError(result: AgentResult): ErrorDiagnosis | null {
  const output = result.output.toLowerCase();
  const stderr = result.stderr?.toLowerCase() ?? '';

  // Git lock detection
  if (output.includes('unable to create') && output.includes('.git/index.lock')) {
    return {
      recoverable: true,
      errorType: 'git_lock',
      confidence: 0.9,
      suggestedRepair: ['remove_git_lock'],
    };
  }

  // npm failure detection
  if (stderr.includes('npm err') && output.includes('missing module')) {
    return {
      recoverable: true,
      errorType: 'npm_failure',
      confidence: 0.8,
      suggestedRepair: ['npm_install'],
    };
  }

  // JSON corruption detection
  if (output.includes('unexpected token') && output.includes('.json')) {
    return {
      recoverable: true,
      errorType: 'json_corruption',
      confidence: 0.7,
      suggestedRepair: ['restore_from_backup'],
    };
  }

  return null; // Not a recoverable error
}
```

#### Layer 3: Healing Procedures Module
Create `src/agent/healer.ts` that leverages existing doctor.ts functions:

```typescript
async function applyHealing(
  diagnosis: ErrorDiagnosis,
  options: UnionRunAgentOptions,
  config: HealingConfig
): Promise<void> {
  switch (diagnosis.errorType) {
    case 'git_lock':
      await removeGitLock(options.cwd, config.logger);
      break;

    case 'npm_failure':
      await runNpmInstall(options.cwd, config.logger);
      break;

    case 'json_corruption':
      await restoreFromBackup(options.cwd, config.logger);
      break;
  }
}

// Reuse existing patterns from doctor.ts and git/index.ts
async function removeGitLock(cwd: string, logger: Logger): Promise<void> {
  const lockPath = path.join(cwd, '.git', 'index.lock');
  try {
    // Check if git process is running
    // Use stale lock detection from fs/lock.ts:156-196
    // Remove lock if stale
    await fs.unlink(lockPath);
    logger.info('Removed stale .git/index.lock');
  } catch (err) {
    logger.error(`Failed to remove git lock: ${err}`);
    throw err;
  }
}
```

#### Layer 4: Doctor Skill Definition
Add to wreckit config schema (reuse `src/schemas.ts:99-123` SkillSchema):

```json
{
  "skills": {
    "phase_skills": {
      "implement": ["doctor"]
    },
    "skills": [
      {
        "id": "doctor",
        "name": "Agent Doctor",
        "description": "Emergency environment repair capability",
        "tools": ["Bash"], // Only need Bash for repairs
        "required_context": [
          {
            "type": "file",
            "path": ".git/index.lock",
            "description": "Check for git lock files"
          },
          {
            "type": "file",
            "path": "package.json",
            "description": "Check for npm dependencies"
          }
        ]
      }
    ]
  }
}
```

#### Layer 5: Orchestrator Integration
Modify `src/commands/orchestrator.ts:297-360` to use healing runner:

```typescript
// Replace runCommand with healing version
const result = await runCommandWithHealing(
  item.id,
  { force, dryRun: false, mockAgent, ... },
  logger,
  { maxRetries: 3, enableHealing: !dryRun } // Healing config
);
```

### Implementation Phases

**Phase 1: Core Detection & Healing (MVP)**
- Implement `errorDetector.ts` with git lock and npm failure patterns
- Implement `healer.ts` with `removeGitLock()` and `runNpmInstall()`
- Create `healingRunner.ts` wrapper
- Add integration tests for error detection patterns

**Phase 2: Orchestrator Integration**
- Modify `orchestrator.ts` to use `runAgentWithHealing()`
- Add healing metrics to batch progress (healing_attempts, last_healing_at)
- Add CLI flag `--no-healing` to disable auto-healing
- Update `wreckit doctor` to show healing history

**Phase 3: JSON Corruption Recovery**
- Implement `restoreFromBackup()` using existing backup system
- Add JSON validation before/after agent runs
- Create rollback procedure if JSON corruption detected mid-run

**Phase 4: Monitoring & Auditing**
- Add healing event log (`.wreckit/healing-log.jsonl`)
- Track healing success rate by error type
- Add `wreckit doctor --healing-stats` command
- Alert on repeated healing failures (possible deeper issues)

**Phase 5: Advanced Healing (Future)**
- Add `DoctorAgent` that uses LLM to diagnose complex errors
- Implement config file repair (beyond JSON syntax)
- Add dependency conflict resolution
- Support for custom healing scripts via config

## Open Questions

1. **Should doctor require user approval for repairs?**
   - Config flag: `doctor.auto_repair: true | false | "safe-only"`
   - Safe repairs: git lock removal, npm install
   - Destructive repairs: JSON modifications, file deletions

2. **How to handle healing in parallel mode?**
   - Risk: Multiple workers trying to heal same resource
   - Solution: Shared healing mutex via `FileLock`
   - Or: Disable healing in parallel mode initially

3. **What if healing makes things worse?**
   - Always create backup before repair (existing pattern)
   - Validate repair success before retry
   - Rollback on validation failure
   - Give up after max retries and require manual intervention

4. **Should healing be logged separately from agent output?**
   - Yes: Create `.wreckit/healing-log.jsonl` for audit trail
   - Format: `{ timestamp, item_id, error_type, repair_attempt, success }`
   - Makes debugging and stats easier

5. **How to test healing without actually breaking things?**
   - Mock agent failures in tests (existing mockAgent pattern)
   - Create test scenarios with synthetic errors
   - Use integration tests with temporary git repos

6. **Should doctor skill be implicit or explicit?**
   - Implicit: Always available for all phases (emergency mode)
   - Explicit: User must configure in skills (current pattern)
   - Recommendation: Implicit for safety, but configurable

7. **What about npm install timeout/slow network?**
   - Add timeout to healing operations (default: 5 minutes)
   - Allow config override per operation type
   - Log timeout as separate error type (network vs local)
