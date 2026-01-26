# Research: [DREAMER] Remove empty catch blocks in critique.ts JSON parsing

**Date**: 2025-01-26
**Item**: 047-dreamer-remove-empty-catch-blocks-in-critiquets-js

## Research Question
Empty catch blocks in parseCritiqueJson (critique.ts lines 26, 38-40) suppress JSON parsing errors without logging or handling, making it impossible to diagnose parsing failures.

**Motivation:** Proper error handling ensures that errors are logged, surfaced, or handled appropriately. Silent failures make debugging extremely difficult and can lead to data corruption or incorrect system state.

**Success criteria:**
- All catch blocks log errors or handle them appropriately
- No empty catch blocks remain
- Error messages provide actionable context

**Technical constraints:**
- Must maintain existing JSON parsing logic
- Should not break existing fallback behavior
- Need to add logging infrastructure if missing

**In scope:**
- Add error logging to empty catch blocks in parseCritiqueJson
- Ensure errors are surfaced appropriately
- Maintain existing fallback parsing behavior
**Out of scope:**
- Refactoring JSON parsing strategy
- Changes to error handling architecture
- Modifying critique phase logic

**Signals:** priority: medium

## Summary
The `parseCritiqueJson` function in `src/workflow/critique.ts` contains three empty catch blocks (lines 26, 38-40, and 44) that silently swallow JSON parsing errors. This is a debugging anti-pattern that makes it impossible to diagnose why critique parsing fails when the critic agent outputs malformed JSON or unexpected content.

The fix requires modifying `parseCritiqueJson` to accept a `Logger` parameter and adding appropriate debug-level logging to each catch block. The logging should capture the specific parsing error (which JSON parsing strategy failed and why) without breaking the existing fallback behavior. This follows the established pattern in the codebase where JSON parsing failures in utility functions return null but log errors for debugging (e.g., `parsePrJson` in `itemWorkflow.ts`).

The Logger interface (`src/logging.ts`) already provides `debug`, `info`, `warn`, and `error` methods. The workflow already has access to a logger instance, so we only need to pass it down to the parsing function.

## Current State Analysis

### Existing Implementation

**Empty catch blocks in `parseCritiqueJson`** (`src/workflow/critique.ts:16-47`):
```typescript
function parseCritiqueJson(output: string): CritiqueResult | null {
  try {
    // Strategy 1: Look for JSON markdown block
    const codeBlockMatch = output.match(/```json\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      try {
        const parsed = JSON.parse(codeBlockMatch[1]);
        if (parsed.status === "approved" || parsed.status === "rejected") {
          return parsed as CritiqueResult;
        }
      } catch {}  // Line 26 - EMPTY CATCH BLOCK
    }

    // Strategy 2: Find the last valid JSON object in the output
    const matches = output.match(/\{[\s\S]*?\}/g);
    if (matches) {
      for (let i = matches.length - 1; i >= 0; i--) {
        try {
          const parsed = JSON.parse(matches[i]);
          if (parsed.status === "approved" || parsed.status === "rejected") {
            return parsed as CritiqueResult;
          }
        } catch {  // Lines 38-40 - EMPTY CATCH BLOCK
          continue;
        }
      }
    }
    return null;
  } catch {  // Line 44 - EMPTY CATCH BLOCK
    return null;
  }
}
```

**Current call site** (`src/workflow/critique.ts:142-151`):
```typescript
const critique = parseCritiqueJson(result.output);

if (!critique) {
  const error = "Critic failed to output valid JSON decision";
  logger.error(error);
  // Regress to planned on parsing failure too
  item = { ...item, state: "planned", last_error: error };
  await writeItem(itemDir, item);
  return { success: true, item };
}
```

**The problem**: When `parseCritiqueJson` returns `null`, the calling code logs a generic error message ("Critic failed to output valid JSON decision") but has no insight into **why** parsing failed. Was it malformed JSON? Missing fields? Invalid enum values? The empty catch blocks discard this diagnostic information.

### Key Files

- **`src/workflow/critique.ts:16-47`** - `parseCritiqueJson` function with empty catch blocks
  - Line 26: Empty catch for JSON markdown block parsing
  - Lines 38-40: Empty catch for JSON object parsing in loop
  - Line 44: Empty catch for outer try-catch
  - Uses two-strategy parsing: (1) JSON markdown blocks, (2) last JSON object in output
  - Returns `CritiqueResult | null` - null indicates parsing failed
  - Called from `runPhaseCritique` at line 142

- **`src/workflow/critique.ts:49-177`** - `runPhaseCritique` function
  - Has access to `logger` via `options.logger` (line 56)
  - Calls `parseCritiqueJson(result.output)` at line 142
  - Logs generic error when parsing fails (line 146)
  - Regresses item to "planned" state on parsing failure (line 148)

- **`src/logging.ts:6-12`** - Logger interface definition
  ```typescript
  export interface Logger {
    debug(message: string, ...args: unknown[]): void;
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
    json(data: unknown): void;
  }
  ```
  - Provides debug, info, warn, error, and json methods
  - Uses pino with pino-pretty for formatted output
  - Default level is "silent" unless --verbose or --debug is set
  - Debug-level logs are appropriate for internal parsing errors

- **`src/workflow/itemWorkflow.ts:886-908`** - Similar pattern in `parsePrJson`
  ```typescript
  function parsePrJson(output: string): { title: string; body: string } | null {
    // ... parsing logic ...
    try {
      const parsed = JSON.parse(jsonStr);
      if (typeof parsed.title === "string" && typeof parsed.body === "string") {
        return { title: parsed.title, body: parsed.body };
      }
      return null;
    } catch {
      return null;  // Also has empty catch, but this is in a different context
    }
  }
  ```
  - Similar pattern: returns null on parse failure
  - Also has empty catch block (though in simpler context)
  - Shows this is a broader pattern in the codebase

## Technical Considerations

### Dependencies
- **Logger interface** (`src/logging.ts`) - Already available, no changes needed
- **pino logger** - Already configured in workflow options
- **No external dependencies** needed

### Patterns to Follow

1. **Error object capture**: Catch blocks should capture the error object to extract meaningful information:
   ```typescript
   } catch (error) {
     logger.debug(`Failed to parse JSON markdown block: ${error instanceof Error ? error.message : String(error)}`);
   }
   ```

2. **Contextual logging**: Each catch block should log which parsing strategy failed:
   - "Strategy 1 (JSON markdown block) failed"
   - "Strategy 2 (JSON object match) failed for match N"
   - "Outer parsing error"

3. **Non-breaking changes**: The function signature change (adding optional logger parameter) maintains backward compatibility:
   ```typescript
   function parseCritiqueJson(output: string, logger?: Logger): CritiqueResult | null
   ```

4. **Debug-level logging**: Use `logger.debug()` not `logger.error()` because:
   - Parsing failures are expected during normal operation (fallback behavior)
   - The caller already logs an error at line 146
   - Debug logs provide additional diagnostic context without noise

5. **Maintain fallback behavior**: The function must still return `null` on all errors to preserve existing logic

### Examples from Codebase

**Pattern 1: Error capture with logging** (`src/cli-utils.ts:21-22`):
```typescript
} catch (error) {
  handleError(error, logger, options);
```

**Pattern 2: Error message extraction** (`src/index.ts:761`):
```typescript
} catch (error) {
  logger.error(error instanceof Error ? error.message : String(error));
```

**Pattern 3: Debug logging for diagnostics** (`src/git/index.ts:117`):
```typescript
logger.debug(`Running: ${command} ${args.join(" ")}`);
```

**Pattern 4: Optional logger parameter** (Common pattern in codebase for utility functions):
```typescript
function someUtility(param: string, logger?: Logger): Result | null {
  if (logger) {
    logger.debug("Diagnostic info");
  }
  // ... implementation
}
```

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Breaking existing tests** | Medium | The function signature change is backward compatible (optional parameter). Existing call sites will continue to work without modification. |
| **Excessive logging noise** | Low | Use `logger.debug()` which is silent by default. Only appears when --debug or --verbose is set. |
| **Performance degradation** | Low | Logging is only done on error paths (when parsing fails), not on success paths. Minimal overhead. |
| **Logger not passed to function** | Low | Make logger parameter optional with `logger?: Logger`. Only log if logger is provided. |
| **Error object structure** | Low | Use safe error message extraction: `error instanceof Error ? error.message : String(error)` |

## Recommended Approach

### Step 1: Modify `parseCritiqueJson` function signature
Add optional logger parameter:
```typescript
function parseCritiqueJson(output: string, logger?: Logger): CritiqueResult | null {
```

### Step 2: Add logging to first catch block (line 26)
```typescript
} catch (error) {
  logger?.debug(
    `Failed to parse JSON markdown block in critique output: ` +
    `${error instanceof Error ? error.message : String(error)}`
  );
}
```

### Step 3: Add logging to second catch block (lines 38-40)
```typescript
} catch (error) {
  // Log and continue to next match
  logger?.debug(
    `Failed to parse JSON object ${i + 1}/${matches?.length} in critique output: ` +
    `${error instanceof Error ? error.message : String(error)}`
  );
  continue;
}
```

### Step 4: Add logging to outer catch block (line 44)
```typescript
} catch (error) {
  logger?.debug(
    `Unexpected error during critique JSON parsing: ` +
    `${error instanceof Error ? error.message : String(error)}`
  );
  return null;
}
```

### Step 5: Update call site to pass logger
```typescript
const critique = parseCritiqueJson(result.output, logger);
```

### Step 6: Verify no other call sites exist
Use `grep` to ensure `parseCritiqueJson` is only called from one location (confirmed: only called at line 142 in critique.ts).

### Testing Strategy
1. **Manual testing**: Run critique phase with --debug flag and verify logs appear when parsing fails
2. **Unit tests**: Add test cases for `parseCritiqueJson` with malformed JSON to verify logging works
3. **Integration tests**: Run existing critique tests to ensure no regressions
4. **Verification**: Run `bun test` and `bun run typecheck` to ensure no breakage

## Open Questions

1. **Should we also fix `parsePrJson`?** - This function in `itemWorkflow.ts:906` also has an empty catch block. However, it's out of scope for this item which specifically targets critique.ts. Consider creating a separate item if needed.

2. **What log level is appropriate?** - Recommendation is `debug()` level because:
   - Parsing failures are expected (handled by fallback)
   - Caller already logs at `error()` level
   - Debug provides diagnostics without noise
   - Only visible with --debug or --verbose

3. **Should we add more diagnostic context?** - Consider logging:
   - First N characters of the malformed JSON (could be large)
   - Which strategy failed (already included)
   - Item ID or context (not available in parser function)
   - Recommendation: Keep it simple - error message and strategy name is sufficient

4. **Should the function throw instead of returning null?** - NO. This would break the existing fallback behavior and is out of scope. The success criteria explicitly state "Must maintain existing JSON parsing logic" and "Should not break existing fallback behavior."
