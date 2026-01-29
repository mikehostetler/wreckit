# Research: Standardize console.log usage with logger throughout domain layer

**Date**: 2025-01-09
**Item**: 042-standardize-consolelog-usage-with-logger-throughou

## Research Question
Direct console usage in the domain layer bypasses the logging abstraction, preventing proper log level control and making testing difficult.

**Motivation:** Consistent logging through the Logger interface enables proper log levels, output redirection in tests, and unified formatting across the codebase.

**Success criteria:**
- Replace all console.log/warn/error in domain/ with logger calls
- Pass logger to functions that need it
- All console usage removed from domain layer
- Tests verify log output can be captured

**Technical constraints:**
- Must maintain backward compatibility with existing output
- Cannot change function signatures in public APIs
- Logger interface already exists and should be used

**In scope:**
- Replace console.log in ideas-interview.ts with logger
- Replace console.warn in indexing.ts with logger
- Replace console.log in ideas-agent.ts with logger
- Pass logger to domain functions that need it
**Out of scope:**
- Modifying the Logger interface
- Changing logging in commands layer (already uses logger)
- Adding new logging levels

**Signals:** priority: medium

## Summary
The domain layer contains three files with direct console usage that need to be migrated to use the Logger interface. The Logger interface (`src/logging.ts`) already exists and provides debug, info, warn, error, and json methods. The git module demonstrates the correct pattern for accepting logger as a parameter in domain functions.

The migration requires:
1. Adding an optional `logger?: Logger` parameter to domain functions (to maintain backward compatibility)
2. Replacing console.log with logger.info, console.warn with logger.warn, console.error with logger.error
3. Special handling for interactive/UI output in ideas-interview.ts (console.log for formatted output should remain or be handled differently)
4. Updating all call sites to pass logger from the commands layer

## Current State Analysis

### Existing Implementation

**Logger Interface** (`src/logging.ts:6-12`)
```typescript
export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  json(data: unknown): void;
}
```

The logger uses pino with pino-pretty for human-readable output. It supports four levels: debug, info, warn, error, plus a json method. By default, the logger is set to "silent" level unless --verbose or --debug is passed.

**Domain files with console usage:**

1. **`src/domain/ideas-interview.ts`** - 50 occurrences of console.log/error
   - Lines 182-184: Agent response rendering (formatted output)
   - Lines 230-232: Error messages about MCP tool failure
   - Lines 250-251: Error messages about MCP tool not called
   - Lines 264-265: Warning about payload limits
   - Line 268: Success message
   - Lines 291-296: Uncommitted changes warning (formatted UI)
   - Lines 332-339: Interview banner (formatted UI)
   - Lines 346-347: Cancellation message
   - Lines 393-395: Agent response rendering
   - Lines 411-412: Interview cancelled message
   - Lines 419, 425, 440: Various user prompts
   - Lines 457-458: Interview interrupted message
   - Lines 526-587: Simple interview formatted output

2. **`src/domain/indexing.ts`** - 2 occurrences of console.warn
   - Line 65-67: Warning when items directory cannot be read
   - Line 84-86: Warning when skipping invalid item

3. **`src/domain/ideas-agent.ts`** - 1 occurrence of console.log
   - Line 83: Agent event formatting in verbose mode

### Key Files

- **`src/logging.ts:6-107`** - Logger interface and implementation
  - Provides Logger interface with debug, info, warn, error, json methods
  - Uses pino with pino-pretty for formatted output
  - Default level is "silent" unless --verbose or --debug is set
  - `createLogger(options?: LoggerOptions): Logger` creates a new logger
  - `logger` export is a global default logger instance
  - `setLogger(l: Logger)` and `initLogger(options?: LoggerOptions)` for global management

- **`src/git/index.ts:15-19`** - Example of correct logger usage pattern
  ```typescript
  export interface GitOptions {
    cwd: string;
    logger: Logger;  // Required logger parameter
    dryRun?: boolean;
  }
  ```
  All git functions accept GitOptions which includes the logger. This is the pattern to follow.

- **`src/domain/ideas-interview.ts:16-18`** - Current InterviewOptions interface
  ```typescript
  export interface InterviewOptions {
    verbose?: boolean;
  }
  ```
  Needs to add `logger?: Logger` parameter

- **`src/domain/ideas-agent.ts:11-14`** - Current ParseIdeasOptions interface
  ```typescript
  export interface ParseIdeasOptions {
    verbose?: boolean;
    mockAgent?: boolean;
  }
  ```
  Needs to add `logger?: Logger` parameter

- **`src/domain/indexing.ts`** - Functions that need logger
  - `scanItems(root: string)` - Line 53
  - No options object currently, needs to add one

### Current Patterns and Conventions

**Git module pattern (correct):**
```typescript
export interface GitOptions {
  cwd: string;
  logger: Logger;  // Required
  dryRun?: boolean;
}

export async function hasUncommittedChanges(
  options: GitOptions
): Promise<boolean> {
  // Uses options.logger.warn/info/debug/error
}
```

**Commands layer pattern:**
- Commands receive logger as parameter
- Commands pass logger to domain functions
- Example: `src/commands/ideas.ts:90` - `export async function ideasCommand(options: IdeasOptions, logger: Logger, inputOverride?: string)`

**Test pattern:**
- Tests use `createMockLogger()` to capture logs
- Example: `src/__tests__/ideas-agent.test.ts:9-17`

## Technical Considerations

### Dependencies

**External:**
- pino - logging library (already used)
- pino-pretty - pretty output (already used)

**Internal modules to integrate with:**
- `src/logging.ts` - Logger interface and factories
- `src/commands/ideas.ts` - calls domain functions, needs to pass logger
- `src/onboarding.ts:83` - calls runIdeaInterview, needs to pass logger

### Patterns to Follow

1. **Add optional logger parameter to domain functions**
   ```typescript
   export interface InterviewOptions {
     verbose?: boolean;
     logger?: Logger;  // Add this
   }
   ```

2. **Use internal logger or default**
   ```typescript
   const internalLogger = options.logger ?? logger;
   ```

3. **Replace console calls:**
   - `console.log(message)` → `logger.info(message)`
   - `console.warn(message)` → `logger.warn(message)`
   - `console.error(message)` → `logger.error(message)`

4. **For UI/formatted output (ideas-interview.ts):**
   - Keep console.log for interactive interview UI (banners, formatted responses)
   - Only replace informational/error logging with logger
   - The spinner and readline interactions should remain as-is

5. **Update call sites:**
   ```typescript
   // Before
   await runIdeaInterview(root, { verbose: true })

   // After
   await runIdeaInterview(root, { verbose: true, logger })
   ```

### Integration Points

**Files that call domain functions:**
- `src/commands/ideas.ts:104, 109, 118, 122` - calls parseIdeasWithAgent and runIdeaInterview
- `src/onboarding.ts:83` - calls runIdeaInterview
- `src/__tests__/ideas-agent.test.ts:67, 78, 92, 120, 130, 138` - tests for parseIdeasWithAgent

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking existing function signatures | High | Make logger parameter optional to maintain backward compatibility |
| Losing interactive UI output in ideas-interview.ts | Medium | Keep console.log for interactive UI elements, only replace logging statements |
| Tests failing due to missing logger | Medium | Update tests to use createMockLogger() or pass logger explicitly |
| Call sites not updated | Low | Search all references and update systematically |
| Logger output not visible by default | Low | Document that --verbose is needed to see logs; this is current behavior |
| fmt helper object uses colors that logger doesn't have | Low | Keep console.log for formatted UI output; logger.info is plain text |

## Recommended Approach

1. **Update Logger interface** (if needed)
   - Current Logger interface is sufficient
   - No changes needed

2. **Update domain functions - indexing.ts** (Low complexity)
   - Add `IndexOptions` interface with optional logger
   - Update `scanItems(root: string)` to `scanItems(root: string, options?: IndexOptions)`
   - Replace 2 console.warn calls with logger.warn
   - Update call sites (if any outside tests)

3. **Update domain functions - ideas-agent.ts** (Low complexity)
   - Add `logger?: Logger` to `ParseIdeasOptions`
   - Replace console.log on line 83 with logger.info
   - Internal logger: `const internalLogger = options.logger ?? logger`
   - Update call sites in commands/ideas.ts and tests

4. **Update domain functions - ideas-interview.ts** (High complexity)
   - Add `logger?: Logger` to `InterviewOptions`
   - **Keep console.log for:** UI banners (lines 291-296, 332-339, 526-587), formatted agent responses (lines 182-184, 393-395)
   - **Replace with logger:** Error messages (230-232, 250-251, 264-265), success message (268), warnings (425, 440)
   - The readline-based interactive UI should remain console-based
   - Update call sites in commands/ideas.ts and onboarding.ts

5. **Update tests**
   - `src/__tests__/ideas-agent.test.ts` - Already uses createLogger, just need to pass it
   - Any other tests that call these functions

6. **Update call sites**
   - `src/commands/ideas.ts` - Pass logger to parseIdeasWithAgent and runIdeaInterview
   - `src/onboarding.ts` - Pass logger to runIdeaInterview
   - `src/git/index.ts` - Update hasUncommittedChanges calls (already uses logger in GitOptions)

## Open Questions

1. **Should process.stdout.write in ideas-interview.ts be replaced?**
   - Lines 91, 94, 103, 223 use process.stdout.write for spinner and verbose output
   - Recommendation: Keep as-is for spinner, consider logger.debug for verbose output

2. **Should ideas-interview.ts keep formatted console output?**
   - The interview is an interactive CLI experience with colors and formatting
   - Logger output is plain text
   - Recommendation: Keep console.log for UI elements, use logger for informational/error messages

3. **Should scanItems change its signature?**
   - Currently: `scanItems(root: string)`
   - Would need: `scanItems(root: string, options?: IndexOptions)`
   - This is a breaking change unless options is optional
   - Recommendation: Make options parameter optional

4. **How to handle the fmt object (colors/formatting) with logger?**
   - Logger doesn't support colors (pino-pretty handles this)
   - Recommendation: Keep console.log for formatted UI, logger.info for plain text logging

5. **Should default to the global logger instance?**
   - Pattern: `const internalLogger = options.logger ?? logger`
   - Recommendation: Yes, use global logger as fallback for backward compatibility
