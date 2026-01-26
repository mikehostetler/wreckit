# Research: Replace direct console calls with structured logging (048)

## Problem Statement
Direct console output calls (`console.log`, `console.warn`, `console.error`) bypass the structured logging system (`logger`), creating inconsistent log formatting and making it difficult to control log levels or aggregate logs effectively.

## Findings

### 1. Current Console Usage
The following files use `console` calls instead of the structured `logger`:
- `src/commands/show.ts`: Uses `console.log` for all output.
- `src/commands/phase.ts`: Uses `console.log` for output.
- `src/commands/list.ts`: Uses `console.log`.
- `src/commands/status.ts`: Uses `console.warn` and `console.log`.
- `src/commands/doctor.ts`: Uses `console.log`.
- `src/doctor.ts`: Uses `console.warn`.
- `src/workflow/itemWorkflow.ts`: Uses `console.log` and `console.warn`.
- `src/agent/healingRunner.ts`: Uses `console.error`.

### 2. Logging System Overview
The structured logging system is defined in `src/logging.ts`. It provides:
- `debug(message, ...args)`
- `info(message, ...args)`
- `warn(message, ...args)`
- `error(message, ...args)`
- `json(data)`

The logger can be configured to be silent, verbose, or quiet.

### 3. Constraints
- User-facing CLI output (like `show` or `list`) should remain readable and pretty-printed.
- If we switch to `logger.info`, and the logger is `silent` by default, the output will disappear!
- We need to ensure that the logger level is set appropriately for these commands, or use a method that always outputs to the console if intended for the user.

### 4. Proposed Solution
- Update `src/logging.ts` to include a `console` or `print` method for explicit user-facing output that respects formatting but isn't suppressed by default `silent` level?
- OR, ensure that CLI commands always initialize the logger with a level that shows their primary output.
- Actually, the `logger` in `src/logging.ts` has a `json` method that calls `console.log`.
- We should probably add a `info` level that is NOT silent by default for primary CLI output.

Wait, `src/logging.ts` says:
```typescript
  } else {
    // Default: suppress all logging
    level = "silent";
  }
```
If we change `console.log` to `logger.info` in `show.ts`, the output will be hidden by default! This is bad.

**Better Solution:**
Primary CLI output should probably use a specific logger method or we should change the default level.
Actually, Wreckit is a CLI tool, so `info` should probably be the default level, or we use `logger.info` for everything and set the level to `info` by default.

## Proposed Implementation Plan
1. Audit and replace `console` calls in priority files.
2. Ensure `logger` is used consistently.
3. Update `src/logging.ts` if necessary to support "always-on" CLI output.

## References
- `src/logging.ts`
- `src/commands/show.ts`
- `src/commands/phase.ts`
- `src/doctor.ts`