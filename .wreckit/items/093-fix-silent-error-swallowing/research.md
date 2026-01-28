# Research: Fix Silent Error Swallowing

**Date**: 2026-01-28
**Item**: 093-fix-silent-error-swallowing

## Research Question
Fix 7 instances of empty catch blocks in critical paths (strategy.ts, critique.ts, sync.ts, rlm-runner.ts, sprite-runner.ts) identified by Dreamer.

## Summary
This research identified **7 instances of empty catch blocks** that silently swallow errors in critical code paths. These empty catch blocks represent a technical debt that can hide failures, make debugging difficult, and potentially lead to data loss or corrupted state. The issue spans multiple components including agent runners, workflow orchestration, project synchronization, and command execution.

The pattern observed across all instances is that errors are being caught and discarded without any logging, error handling, or propagation. This violates the project's established error handling conventions, which use typed `WreckitError` classes, structured logging via the `Logger` interface, and proper error propagation.

All 7 instances require fixing by adding appropriate error handling. The recommended approach is to log errors using the available `logger` parameter and, where appropriate, re-throw or handle the error based on the context. In cleanup scenarios (finally blocks), errors should at minimum be logged as warnings. In critical paths, errors should be logged and either re-thrown or cause graceful degradation with user notification.

## Current State Analysis

### Key Files & Issues

1. **src/commands/strategy.ts** (2 instances)
   - Line 31: Silent item.json parse errors. Impact: Missing items in strategy analysis.
   - Line 34: Silent items directory read errors. Impact: Strategy analysis runs on empty list.

2. **src/workflow/critique.ts** (1 instance - 3 related)
   - Line 26, 38, 44: Silent JSON parsing in nested try-catch. Impact: Critique failures hard to diagnose.

3. **src/fs/sync.ts** (1 instance)
   - Line 95: Silent directory creation failure. Impact: Potential archive creation failure later.

4. **src/agent/rlm-runner.ts** (2 instances)
   - Line 161: Silent JSON parse failure for quoted args. Impact: Malformed tool calls.
   - Line 176: Tool execution error (partially handled).

5. **src/agent/sprite-runner.ts** (2 instances)
   - Line 279: Silent sync-back error. **CRITICAL**: Data loss risk.
   - Line 399: Silent VM cleanup error. Impact: Zombie VMs.

## Recommended Approach

### Phase 1: Critical Fixes (Immediate)
1. **sprite-runner.ts:279** - Sync-back failure
   - Add error logging.
   - Return failure result (not success) to prevent false positives.
   
2. **strategy.ts:42** - Item parsing errors
   - Add `logger.warn()` for each skipped item.

### Phase 2: High Priority
3. **sprite-runner.ts:399** - VM cleanup
   - Add `logger.warn()` for cleanup failures.
   
4. **strategy.ts:45** - Directory iteration
   - Add `logger.warn()` if items directory not found.

5. **sync.ts:247** - Directory creation
   - Check error code or rely on recursive mkdir.

### Phase 3: Best Practices
6. **rlm-runner.ts:252** - JSON parsing heuristic
   - Add `logger.debug()` for parse failures.

7. **critique.ts:63** - JSON parsing fallback
   - Add `logger.debug()` for failed parsing attempts.

## Implementation Strategy

1. **For critical errors**: Return failure objects, don't throw from nested contexts.
2. **For cleanup errors**: Always log at warn level.
3. **For fallback logic**: Log at debug level to track fallback usage.
4. **Test changes**: Verify logging appears in appropriate scenarios.
