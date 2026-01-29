# Remove Production Console Logs Implementation Plan

## Overview
Replace hardcoded console statements with proper logger usage in rlm-runner.ts and doctor.ts.

## Files to Modify

### 1. src/agent/rlm-runner.ts
- Replace `console.log("DEBUG RESPONSE:", ...)` with `logger.debug(...)`
- Replace `console.error("CRITICAL AGENT ERROR:", ...)` with `logger.error(...)`

### 2. src/doctor.ts
- Update `diagnoseDependencies` signature to accept `logger: Logger`
- Replace `console.warn` at line 185 with `logger.warn`
- Update `diagnoseSpriteVMs` inline console calls to use passed logger
- Update all call sites

## Files to Keep (Intentional CLI Output)
- src/commands/sprite.ts
- src/commands/status.ts
- src/commands/init.ts
- src/commands/list.ts

## Testing
- Verify debug output only shows with --debug
- Verify warnings still appear in doctor command
- Verify CLI commands still output tables/emojis correctly
