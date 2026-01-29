# Research: Remove Production Console Logs

**Date**: 2026-01-28
**Item**: 094-remove-production-console-logs

## Research Question
Replace hardcoded console.log statements with proper logger usage in rlm-runner.ts, sprite.ts, doctor.ts, and status.ts.

## Summary

The codebase has a proper logging infrastructure (`src/logging.ts`) based on Pino that provides structured logging with multiple log levels (debug, info, warn, error). However, several files still use direct `console.log`, `console.error`, and `console.warn` statements instead of the logger.

The task requires replacing these hardcoded console statements with proper logger calls in four specific files.

**Key Finding**: After thorough analysis, the console statements in `sprite.ts` and `status.ts` are **intentional user-facing CLI output** (not diagnostic logs) and are consistent with patterns in other commands (init.ts, list.ts). Only `rlm-runner.ts` and `doctor.ts` have actual diagnostic console statements that should be replaced with logger calls.

## Current State Analysis

### Files Requiring Changes

#### 1. `src/agent/rlm-runner.ts`
- **Line 298**: `console.log("DEBUG RESPONSE:", ...)` - Hardcoded debug output.
- **Line 392**: `console.error("CRITICAL AGENT ERROR:", ...)` - Error output.
- **Action**: Replace with `logger.debug()` and `logger.error()`.

#### 2. `src/doctor.ts`
- **Line 185**: `console.warn("Warning: Cannot read item...")` - Diagnostic warning.
- **Line 550**: Inline `console.warn`/`error` functions.
- **Action**: Replace with `logger.warn()` and pass logger to inline functions.

### Files NOT Requiring Changes (Intentional Usage)

#### 1. `src/commands/sprite.ts`
- Contains 30+ `console.log` statements for user-facing CLI output ("✅ Started Sprite...", etc.).
- consistent with other CLI commands.
- **Action**: Keep as-is.

#### 2. `src/commands/status.ts`
- Contains table output using `console.log`.
- **Action**: Keep as-is.

## Implementation Plan

1.  **rlm-runner.ts**: Replace debug/error consoles with logger.
2.  **doctor.ts**: Replace warn console with logger.
3.  **Documentation**: Add comments to sprite.ts/status.ts clarifying intentional console usage.

## Risks
- **Loss of Output**: If we replace CLI output with `logger.info`, it might be suppressed by default or formatted differently (JSON vs text). We are mitigating this by preserving console.log for primary CLI output.
