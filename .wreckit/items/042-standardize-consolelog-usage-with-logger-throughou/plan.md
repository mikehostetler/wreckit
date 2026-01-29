# Standardize console.log usage with logger throughout domain layer Implementation Plan

## Overview
This implementation migrates direct console usage in the domain layer to use the standardized Logger interface. The domain layer contains three files with direct console calls that bypass the logging abstraction, preventing proper log level control, unified formatting, and testability.

The Logger interface (`src/logging.ts`) already provides debug, info, warn, error, and json methods using pino with pino-pretty for formatted output. By migrating to use this interface, the domain layer will have consistent logging that can be controlled via --verbose/--debug flags and can be properly tested.

## Current State Analysis

### Files with Direct Console Usage in Domain Layer

**1. `src/domain/indexing.ts`** (Lines 65-67, 84-86)
- Uses `console.warn` for error messages when items directory cannot be read or items are invalid
- Function `scanItems(root: string)` has no options parameter currently
- Impact: Low complexity - straightforward replacement
- Call sites: 10+ locations across commands/doctor, commands/dream, commands/learn, commands/summarize, commands/orchestrator, onboarding, domain/resolveId

**2. `src/domain/ideas-agent.ts`** (Line 83)
- Uses `console.log` for verbose agent event formatting
- `ParseIdeasOptions` interface exists with `verbose` and `mockAgent` properties
- Impact: Low complexity - straightforward replacement
- Call sites: 3 locations in commands/ideas.ts

**3. `src/domain/ideas-interview.ts`** (Lines 182-184, 230-232, 250-251, 264-265, 268, 291-296, 332-339, 346-347, 393-395, 411-412, 419, 425, 440, 457-458, 526-587)
- Mix of console.log for interactive UI output and console.error for error messages
- `InterviewOptions` interface exists with `verbose` property
- Impact: High complexity due to interactive CLI elements with colors and formatting
- Key distinction: Some console calls are for UI/formatted output, others are logging
- Call sites: 2 locations (commands/ideas.ts, onboarding.ts)

### Current Pattern from Git Module (Correct)
```typescript
// src/git/index.ts:15-19
export interface GitOptions {
  cwd: string;
  logger: Logger;  // Required logger parameter
  dryRun?: boolean;
}

// Functions use options.logger.debug/info/warn/error
```

### Logger Interface
```typescript
// src/logging.ts:6-12
export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  json(data: unknown): void;
}
```

### Key Constraints Discovered
1. **Must maintain backward compatibility** - Cannot change public API signatures without optional parameters
2. **UI formatting must be preserved** - ideas-interview.ts uses colors/formatting that Logger doesn't support
3. **Tests use createLogger/createMockLogger** - Pattern already established for testing
4. **Commands layer already passes logger** - Commands receive logger and should pass to domain functions
5. **scanItems has many call sites** - Must update 10+ locations across the codebase
6. **resolveId.ts also needs updates** - Functions that call scanItems need to accept and pass logger

### Call Sites to Update
**indexing.ts (scanItems):**
- `src/onboarding.ts:160`
- `src/commands/dream.ts:204`
- `src/commands/learn.ts:40`
- `src/commands/summarize.ts:35`
- `src/commands/orchestrator.ts:116, 543`
- `src/doctor.ts:471, 695`
- `src/domain/resolveId.ts:13, 74`
- `src/domain/indexing.ts:100` (internal call in refreshIndex)
- `src/commands/status.ts:21` (re-export, no changes needed)
- `src/__tests__/indexing.test.ts` (multiple test calls)

**ideas-agent.ts (parseIdeasWithAgent):**
- `src/commands/ideas.ts:104, 109, 118`
- `src/__tests__/ideas-agent.test.ts:67, 78, 92, 120, 130, 138`

**ideas-interview.ts (runIdeaInterview):**
- `src/commands/ideas.ts:122`
- `src/onboarding.ts:83`

## Desired End State

All domain layer functions use the Logger interface for logging (info, warn, error, debug) while preserving interactive UI elements that require console output (colors, formatting, readline).

### Success Criteria
1. All console.warn/error in domain layer replaced with logger.warn/error
2. Domain functions accept optional logger parameter in options interface
3. Internal logger pattern used: `const internalLogger = options.logger ?? logger`
4. Interactive UI output (colors, formatting) remains console-based
5. All call sites updated to pass logger
6. Tests verify log output can be captured
7. No regressions in output formatting for interactive interview mode
8. Backward compatibility maintained - functions work without logger parameter

## What We're NOT Doing

- **Modifying the Logger interface** - Current interface is sufficient
- **Changing logging in commands layer** - Commands already use logger correctly (out of scope per requirements)
- **Changing logging in commands/status.ts** - Despite having console usage, it's in commands layer not domain layer (out of scope)
- **Adding new logging levels** - Only using existing debug/info/warn/error/json methods
- **Replacing process.stdout.write** - Used for spinner, should remain as-is
- **Replacing readline-based UI** - Interactive prompts should remain console-based
- **Converting colored/formatted output to logger** - Logger doesn't support colors; UI elements stay console-based
- **Modifying the fmt helper object** - Keep console.log for formatted UI, logger.info for plain text logging

## Implementation Approach

The strategy is to:
1. Start with simplest files (indexing.ts, ideas-agent.ts) to establish pattern
2. Tackle complex file (ideas-interview.ts) with careful separation of logging vs UI
3. Update all call sites systematically
4. Ensure tests pass with proper logger injection

The key insight from analyzing ideas-interview.ts is that not all console.log calls should be replaced:
- **Replace with logger:** Error messages, warnings, informational logs
- **Keep console.log:** Interactive UI elements (banners, colored output, formatted responses, readline prompts)

This preserves the user experience while enabling proper logging for debugging and testing.

---

## Phase 1: Add Logger Parameter to indexing.ts

### Overview
Migrate `src/domain/indexing.ts` to use Logger interface for warning messages. This file has 2 console.warn calls and is called from 10+ locations throughout the codebase.

### Changes Required

#### 1. Add IndexOptions interface and update scanItems
**File**: `src/domain/indexing.ts`
**Changes**: Add options interface, import Logger, update function signature

```typescript
// Add after line 11 (after existing imports)
import { logger, type Logger } from "../logging";

// Add after line 18 (after ITEM_DIR_PATTERN)
export interface IndexOptions {
  logger?: Logger;
}

// Update line 53 - function signature
export async function scanItems(root: string, options?: IndexOptions): Promise<Item[]> {
  const itemsDir = getItemsDir(root);
  const internalLogger = options?.logger ?? logger;

  let entries: string[];
  try {
    entries = await fs.readdir(itemsDir);
  } catch (err) {
    // ENOENT means items directory doesn't exist yet - expected case
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    // Permission or I/O errors should warn, not silently return empty
    internalLogger.warn(
      `Cannot read items directory ${itemsDir}: ${err instanceof Error ? err.message : String(err)}`
    );
    return [];
  }

  const items: Item[] = [];

  for (const itemDirName of entries) {
    if (!ITEM_DIR_PATTERN.test(itemDirName)) continue;

    const itemDirPath = path.join(itemsDir, itemDirName);
    if (!(await dirExists(itemDirPath))) continue;

    try {
      const item = await readItem(itemDirPath);
      items.push(item);
    } catch (err) {
      const itemJsonPath = path.join(itemDirPath, "item.json");
      internalLogger.warn(
        `Skipping invalid item at ${itemJsonPath}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // ... rest of function unchanged (sorting logic)

// Update line 100 - refreshIndex signature
export async function refreshIndex(root: string, options?: IndexOptions): Promise<Index> {
  const items = await scanItems(root, options);
  const index = buildIndex(items);
  await writeIndex(root, index);
  return index;
}
```

#### 2. Update call sites (10+ locations)

**File**: `src/onboarding.ts:160`
```typescript
// Before
const items = await scanItems(gitRoot);

// After
const items = await scanItems(gitRoot, { logger });
```

**File**: `src/commands/dream.ts:204`
```typescript
// Before
const allItems = await scanItems(root);

// After
const allItems = await scanItems(root, { logger });
```

**File**: `src/commands/learn.ts:40`
```typescript
// Before
const allItems = await scanItems(root);

// After
const allItems = await scanItems(root, { logger });
```

**File**: `src/commands/summarize.ts:35`
```typescript
// Before
const allItems = await scanItems(root);

// After
const allItems = await scanItems(root, { logger });
```

**File**: `src/commands/orchestrator.ts` (Lines 116, 543)
```typescript
// Before
const items = await scanItems(root);

// After (both locations)
const items = await scanItems(root, { logger });
```

**File**: `src/doctor.ts` (Lines 471, 695)
```typescript
// Before
const actualItems = await scanItems(root);
const items = await scanItems(root);

// After (both locations)
const actualItems = await scanItems(root, { logger });
const items = await scanItems(root, { logger });
```

**File**: `src/domain/resolveId.ts`
```typescript
// Add import at top
import { logger, type Logger } from "../logging";

// Add options interface
export interface ResolveIdOptions {
  logger?: Logger;
}

// Update buildIdMap function (line 13)
export async function buildIdMap(root: string, options?: ResolveIdOptions): Promise<Item[]> {
  const internalLogger = options?.logger ?? logger;
  const items = await scanItems(root, { logger: internalLogger });
  // ... rest of function

// Update buildShortIdMap function (line 74) similarly
```

#### 3. Update tests
**File**: `src/__tests__/indexing.test.ts`

Update the test that checks for warnings to use logger:

```typescript
// Add import at top
import { createLogger, type Logger } from "../logging";

function createMockLogger(): Logger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    json: () => {},
  };
}

// Update describe("scanItems") block
describe("scanItems", () => {
  let tempDir: string;
  let mockLogger: Logger;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wreckit-scan-test-"));
    mockLogger = createMockLogger();
  });

  // ... existing tests ...

  it("skips invalid item.json files with warning", async () => {
    await createTestFixture(tempDir, [
      { id: "001-valid", item: { title: "Valid" } },
    ]);

    const warnSpy = vi.spyOn(mockLogger, "warn");

    const result = await scanItems(tempDir, { logger: mockLogger });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("001-valid");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Skipping invalid item")
    );
  });
});
```

**Note**: Other tests in this file don't need changes since they don't test error paths. The options parameter is optional so existing calls still work.

### Success Criteria

#### Automated Verification:
- [ ] Tests pass: `npm test -- src/__tests__/indexing.test.ts`
- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] Warning messages still appear when items directory has permission errors (with --verbose)
- [ ] Invalid items are skipped with appropriate warnings (with --verbose)
- [ ] No console.warn calls remain in indexing.ts
- [ ] All commands that use scanItems still work correctly

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Add Logger Parameter to ideas-agent.ts

### Overview
Migrate `src/domain/ideas-agent.ts` to use Logger interface for verbose agent event output. This file has 1 console.log call and already has a ParseIdeasOptions interface.

### Changes Required

#### 1. Add logger to ParseIdeasOptions
**File**: `src/domain/ideas-agent.ts`
**Changes**: Add optional logger parameter to options interface

```typescript
// Update lines 11-14
export interface ParseIdeasOptions {
  verbose?: boolean;
  mockAgent?: boolean;
  logger?: Logger;  // Add this
}
```

#### 2. Update parseIdeasWithAgent to use logger
**File**: `src/domain/ideas-agent.ts`
**Changes**: Use logger instead of console.log for agent event formatting

```typescript
// Update function starting at line 36
export async function parseIdeasWithAgent(
  text: string,
  root: string,
  options: ParseIdeasOptions = {}
): Promise<ParsedIdea[]> {
  const internalLogger = options.logger ?? logger;
  // ... existing code ...

  // Update line 64 - pass internalLogger to runAgentUnion
  const result = await runAgentUnion({
    config,
    cwd: root,
    prompt,
    logger: internalLogger,  // Changed from logger
    timeoutSeconds: resolvedConfig.timeout_seconds,
    // ... rest of options
  });

  // Update lines 79-86
  onAgentEvent: (event: AgentEvent) => {
    if (options.verbose) {
      const formatted = formatAgentEvent(event);
      if (formatted) {
        internalLogger.info(formatted);  // Was console.log
      }
    }
  },
```

#### 3. Update call sites
**File**: `src/commands/ideas.ts`
```typescript
// Lines 104, 109, 118 - Update all three calls
// Before
ideas = await parseIdeasWithAgent(inputOverride, root, { verbose: options.verbose });
ideas = await parseIdeasWithAgent(input, root, { verbose: options.verbose });
ideas = await parseIdeasWithAgent(input, root, { verbose: options.verbose });

// After
ideas = await parseIdeasWithAgent(inputOverride, root, {
  verbose: options.verbose,
  logger
});

ideas = await parseIdeasWithAgent(input, root, {
  verbose: options.verbose,
  logger
});

ideas = await parseIdeasWithAgent(input, root, {
  verbose: options.verbose,
  logger
});
```

#### 4. Update tests
**File**: `src/__tests__/ideas-agent.test.ts`

The tests already create a logger but don't pass it. Update to pass logger:

```typescript
// Lines 67, 78, 92, 120, 130, 138 - Update all parseIdeasWithAgent calls
// Before
await expect(
  parseIdeasWithAgent(input, tempDir, {
    verbose: false,
    mockAgent: true,
  })
).rejects.toThrow(McpToolNotCalledError);

// After
await expect(
  parseIdeasWithAgent(input, tempDir, {
    verbose: false,
    mockAgent: true,
    logger: mockLogger,  // Add this to all 6 calls
  })
).rejects.toThrow(McpToolNotCalledError);
```

### Success Criteria

#### Automated Verification:
- [ ] Tests pass: `npm test -- src/__tests__/ideas-agent.test.ts`
- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] Agent events still appear when --verbose is used
- [ ] No console.log calls remain in ideas-agent.ts
- [ ] Output format is unchanged
- [ ] Without --verbose, no agent event output (silent by default)

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Add Logger Parameter to ideas-interview.ts

### Overview
Migrate `src/domain/ideas-interview.ts` to use Logger interface while preserving interactive UI elements. This is the most complex file due to the mix of logging and UI output.

### Key Decision: What to Replace vs Keep

**Replace with logger (error/warning logging):**
- Lines 230-232, 250-251: Error messages about MCP tool failure
- Lines 264-265: Warning about payload limits
- Line 268: Success message (✓ Captured N ideas)
- Lines 425, 440: Warning about no session ID captured

**Keep as console.log (interactive UI elements):**
- Lines 182-184, 393-395: Agent response rendering (formatted output with colors)
- Lines 291-296: Uncommitted changes warning (formatted UI banner)
- Lines 332-339: Interview banner (formatted UI with colors)
- Lines 346-347, 411-412: Cancellation messages (formatted UI)
- Lines 419: User prompt (readline interaction)
- Lines 457-458: Interview interrupted message (formatted UI)
- Lines 526-587: Simple interview formatted output (colored UI)
- Lines 91, 94, 103, 223: process.stdout.write for spinner

### Changes Required

#### 1. Add logger to InterviewOptions
**File**: `src/domain/ideas-interview.ts`
**Changes**: Add optional logger parameter

```typescript
// Update lines 16-18
export interface InterviewOptions {
  verbose?: boolean;
  logger?: Logger;  // Add this
}
```

#### 2. Update runIdeaInterview to use logger
**File**: `src/domain/ideas-interview.ts`
**Changes**: Use logger for error/warning messages, keep console for UI

```typescript
// Update function starting at line 276
export async function runIdeaInterview(
  root: string,
  options: InterviewOptions = {}
): Promise<ParsedIdea[]> {
  const systemPrompt = await loadPromptTemplate(root, "interview");

  // Build SDK environment to pass custom credentials
  const internalLogger = options.logger ?? logger;
  const sdkEnv = await buildSdkEnv({ cwd: root, logger: internalLogger });

  // Warn if user has uncommitted changes (lines 287-298)
  // KEEP console.log for UI formatting
  const inGitRepo = await isGitRepo(root);
  if (inGitRepo) {
    const hasChanges = await hasUncommittedChanges({ cwd: root, logger: internalLogger });
    if (hasChanges) {
      console.log("");
      console.log("⚠️  You have uncommitted changes.");
      console.log("  The idea phase is for planning and exploration only.");
      console.log("  The agent is configured to read-only and cannot make code changes.");
      console.log("  You may want to commit or stash your work first for a clean slate.");
      console.log("");
    }
  }

  // ... rest of function ...

  // Lines 332-339 - KEEP console.log for banner (formatted UI)
  console.log("");
  console.log(fmt.gray("─".repeat(60)));
  console.log(fmt.bold(" 🚀  Capture a new idea"));
  console.log(fmt.gray("─".repeat(60)));
  console.log(fmt.dim("Type 'done' when finished, 'quit' to cancel"));
  console.log("");
  console.log("What's your idea? " + fmt.dim("(Just describe it in your own words)"));
  console.log("");

  // Lines 346-347 - KEEP console.log for formatted UI
  if (isCancelSignal(initialIdea) || !initialIdea.trim()) {
    console.log("");
    console.log(fmt.yellow("No idea provided. Cancelled."));
    rl.close();
    return [];
  }

  // Lines 393-395 - KEEP console.log for formatted agent response
  const rendered = renderMarkdown(assistantResponse.trim());
  console.log(fmt.magenta("Agent:"));
  console.log(rendered);
  console.log("");

  // Line 419 - KEEP console.log for readline prompt
  if (!userInput.trim()) {
    console.log(fmt.dim("(Press Enter again to finish, or type your response)"));

    // Lines 425, 440 - Replace console.error with logger.warn
    if (!sessionId) {
      internalLogger.warn("No session ID captured, falling back to JSON extraction");
    }
  }

  // Lines 411-412 - KEEP console.log for formatted UI
  if (isCancelSignal(userInput)) {
    console.log("");
    console.log(fmt.yellow("Interview cancelled."));
    rl.close();
    return [];
  }

  // Lines 457-458 - KEEP console.log for formatted UI
  if ((error as any)?.code === "ERR_USE_AFTER_CLOSE") {
    console.log("");
    console.log(fmt.yellow("Interview interrupted."));
    return [];
  }
```

#### 3. Update finishInterview function
**File**: `src/domain/ideas-interview.ts`
**Changes**: Add logger parameter, replace console.error/warn

```typescript
// Update function signature (line 152)
async function finishInterview(
  session: unstable_v2_Session,
  sessionId: string,
  verbose?: boolean,
  sdkEnv?: Record<string, string>,
  logger?: Logger  // Add this parameter
): Promise<ParsedIdea[]> {
  const internalLogger = logger ?? logger;  // Use parameter or global

  const spinner = createSpinner("Finishing...");
  spinner.start();

  // ... spinner and summary ...

  // KEEP console.log for agent response rendering (lines 182-184)
  spinner.stop();
  const rendered = renderMarkdown(assistantResponse.trim());
  console.log(fmt.magenta("Agent:"));
  console.log(rendered);
  console.log("");

  // ... MCP extraction ...

  // Replace console.error with logger.error (lines 230-232)
  } catch (error) {
    extractSpinner.stop();
    internalLogger.error("Failed to extract ideas via MCP tool");
    internalLogger.warn("The agent must call the save_interview_ideas tool to capture ideas.");
    internalLogger.warn("JSON fallback has been removed for security reasons.");
    throw new McpToolNotCalledError(
      "Agent did not call the required MCP tool (save_interview_ideas). " +
        "The agent must use the structured tool call to save ideas from interviews. " +
        "JSON fallback has been removed for security reasons."
    );
  }

  // Replace console.error with logger.error (lines 250-251)
  if (capturedIdeas.length === 0) {
    internalLogger.error("Failed to extract ideas - MCP tool was not called");
    internalLogger.warn("The agent must call the save_interview_ideas tool to capture ideas.");
    throw new McpToolNotCalledError(
      "Agent did not call the required MCP tool (save_interview_ideas). " +
        "The agent must use the structured tool call to save ideas from interviews. " +
        "JSON fallback has been removed for security reasons."
    );
  }

  // Replace console.error with logger.warn (lines 264-265)
  try {
    assertPayloadLimits(capturedIdeas);
  } catch (error) {
    const err = error as Error;
    internalLogger.warn(`Warning: ${err.message}`);
    internalLogger.warn("Some ideas may not have been captured correctly.");
    return [];
  }

  // Replace console.log with logger.info (line 268)
  internalLogger.info(`Captured ${capturedIdeas.length} idea(s)`);
  return capturedIdeas;
```

#### 4. Update finishInterview call sites
**File**: `src/domain/ideas-interview.ts`
```typescript
// Line 427 - update from:
ideas = await finishInterview(session, sessionId || "", options.verbose, sdkEnv);
// To:
ideas = await finishInterview(session, sessionId || "", options.verbose, sdkEnv, internalLogger);

// Line 442 - update from:
ideas = await finishInterview(session, sessionId || "", options.verbose, sdkEnv);
// To:
ideas = await finishInterview(session, sessionId || "", options.verbose, sdkEnv, internalLogger);
```

#### 5. Update call sites in commands
**File**: `src/commands/ideas.ts:122`
```typescript
// Before
ideas = await runIdeaInterview(root, { verbose: options.verbose });

// After
ideas = await runIdeaInterview(root, {
  verbose: options.verbose,
  logger
});
```

**File**: `src/onboarding.ts:83`
```typescript
// Before
ideas = await runIdeaInterview(root, { verbose: false });

// After
ideas = await runIdeaInterview(root, {
  verbose: false,
  logger
});
```

#### 6. Update runSimpleInterview
**File**: `src/domain/ideas-interview.ts`
**Changes**: This function has no options parameter, so we don't need to change it
- All console.log calls in runSimpleInterview (lines 526-587) are for formatted UI
- Keep them as-is since they're part of the interactive CLI experience

### Success Criteria

#### Automated Verification:
- [ ] Tests pass: `npm test`
- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] Error messages appear in logs when --verbose is used
- [ ] Interactive UI (banners, colors, prompts) still displays correctly
- [ ] Success messages appear in logs with --verbose
- [ ] No console.error calls remain in error paths (should use logger.error)
- [ ] No console.warn calls remain (should use logger.warn)
- [ ] Colored output and formatting (fmt object) still works
- [ ] Interview mode works correctly interactively

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to Phase 4.

---

## Phase 4: Comprehensive Verification

### Overview
Final verification phase to ensure all changes work correctly end-to-end and no regressions were introduced.

### Verification Steps

#### 1. Automated Testing
Run all test suites to ensure nothing broke:
```bash
npm test
npm run typecheck
npm run lint
npm run build
```

#### 2. Manual Testing - Indexing
```bash
# Test 1: Normal operation
wreckit status
# Should display items correctly

# Test 2: Invalid item (triggers warning)
mkdir -p .wreckit/items/001-test
echo "invalid json" > .wreckit/items/001-test/item.json
wreckit status --verbose
# Should see warning logged

# Test 3: Doctor command
wreckit doctor
# Should run without logging errors
```

#### 3. Manual Testing - Ideas Agent
```bash
# Test 1: Ideas command without verbose
echo "Add dark mode support" | wreckit ideas
# Should parse ideas, no agent event output

# Test 2: Ideas command with verbose
echo "Add dark mode support" | wreckit ideas --verbose
# Should see agent events logged

# Test 3: File input
wreckit ideas --file ideas.md
# Should parse correctly
```

#### 4. Manual Testing - Interview Mode
```bash
# Test 1: Interactive interview
wreckit ideas
# Type: "Add dark mode"
# Type: "done"
# Should see colored banners and agent responses

# Test 2: Interview with verbose
wreckit ideas --verbose
# Should see additional logging

# Test 3: Onboarding flow
rm -rf .wreckit/items/*
wreckit
# Should trigger interview flow
```

#### 5. Verify No Console Usage Remains
```bash
# Check domain layer for remaining console usage
grep -r "console\." src/domain/*.ts | grep -v "test"
# Should only find console.log for UI elements in ideas-interview.ts
```

### Success Criteria

#### Automated Verification:
- [ ] All tests pass: `npm test`
- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`
- [ ] No console.warn/console.error remain in domain layer (except UI)
- [ ] All domain functions accept optional logger parameter

#### Manual Verification:
- [ ] wreckit status displays items correctly
- [ ] wreckit ideas (interactive) works with colored UI
- [ ] echo 'test' | wreckit ideas --verbose shows agent events
- [ ] wreckit doctor runs without logging errors
- [ ] wreckit onboarding flow works correctly
- [ ] Backward compatibility maintained - functions work without logger
- [ ] No regressions in user-facing functionality

**Note**: This is the final phase. Complete all verification before considering the work complete.

---

## Testing Strategy

### Unit Tests
- Test that logger methods are called with correct messages
- Test that optional logger parameter falls back to global logger
- Test that error paths still produce appropriate log output
- Test that verbose mode still shows event logs
- Test that functions work without logger parameter (backward compatibility)

### Integration Tests
- Test end-to-end flow from commands to domain with logger
- Test that --verbose flag enables log output
- Test that logs can be captured in test fixtures
- Test that all call sites correctly pass logger

### Manual Testing Steps

1. **Test indexing warnings:**
   ```bash
   # Create an invalid item to trigger warning
   mkdir -p .wreckit/items/001-test
   echo '{"invalid": "data"}' > .wreckit/items/001-test/item.json
   wreckit status --verbose
   # Should see warning message in logs
   ```

2. **Test ideas-agent verbose output:**
   ```bash
   echo "Add dark mode support" | wreckit ideas --verbose
   # Should see agent events with --verbose
   # Without --verbose, should be silent
   ```

3. **Test interview mode:**
   ```bash
   wreckit ideas
   # Interactive UI should display correctly with colors and formatting
   # Type your idea, then "done"
   # Error messages should appear in logs with --verbose
   ```

4. **Test logger can be captured:**
   ```bash
   # Run with verbose and see logs
   wreckit ideas --verbose < ideas.md
   # Logs should appear with proper formatting
   ```

5. **Test onboarding:**
   ```bash
   rm -rf .wreckit/items/*
   wreckit
   # Should trigger interview flow correctly
   ```

## Migration Notes

### Breaking Changes
None - All logger parameters are optional to maintain backward compatibility.

### Backward Compatibility
- All logger parameters are optional (`logger?: Logger`)
- Functions fall back to global logger instance: `const internalLogger = options.logger ?? logger`
- Existing call sites without logger parameter continue to work
- No changes to public API signatures (only adding optional parameters)

### Deprecation Notices
None - This is an internal implementation detail, not a public API change.

### Data Migration
None - No data structures are changed.

### Logging Levels
- **Silent by default**: Logger is set to "silent" level unless --verbose or --debug
- **--verbose**: Sets level to "debug", shows info, warn, error
- **--debug**: Sets level to "debug" with JSON output
- This behavior is unchanged from current implementation

### Interactive UI vs Logging
- **Interactive UI**: Keep console.log for banners, formatted responses with colors (fmt object)
- **Logging**: Use logger.info/warn/error for informational messages, errors, warnings
- **Spinner**: Keep process.stdout.write for spinner control
- This preserves the user experience while enabling proper log capture for testing and debugging

## References

- Research: `/Users/speed/wreckit/.wreckit/items/042-standardize-consolelog-usage-with-logger-throughou/research.md`
- Logger interface: `src/logging.ts:6-12`
- Git module pattern: `src/git/index.ts:15-19`
- Domain files to update:
  - `src/domain/indexing.ts:53-104`
  - `src/domain/ideas-agent.ts:36-107`
  - `src/domain/ideas-interview.ts:276-593`
- Call sites to update:
  - `src/commands/ideas.ts:104, 109, 118, 122`
  - `src/onboarding.ts:83, 160`
  - `src/commands/dream.ts:204`
  - `src/commands/learn.ts:40`
  - `src/commands/summarize.ts:35`
  - `src/commands/orchestrator.ts:116, 543`
  - `src/doctor.ts:471, 695`
  - `src/domain/resolveId.ts:13, 74`
  - `src/__tests__/ideas-agent.test.ts:67, 78, 92, 120, 130, 138`
  - `src/__tests__/indexing.test.ts:217-240`
