# Research: Replace interactive 'ask' merge strategy in learn command

**Date**: 2025-01-25
**Item**: 041-replace-interactive-ask-merge-strategy-in-learn-co

## Research Question
Interactive merge strategy for skill configurations is documented but throws a 'not yet implemented' error at runtime, breaking user expectations.

**Motivation:** The 'ask' strategy would allow users to interactively choose which skills to keep during merges, providing finer-grained control than binary append/replace options. This is particularly valuable when curating skills from multiple extraction sessions.

**Success criteria:**
- Interactive prompt asks user which skills to keep for each conflict
- Works with both phase_skills and skills arrays
- Gracefully handles non-TTY environments by falling back to append
- Test added for interactive merge flow
- Documentation updated to describe interactive behavior

**Technical constraints:**
- Must handle non-TTY environments (CI/CD) gracefully
- Should not break existing 'append' and 'replace' strategies
- Interactive prompts should use standard readline interface
- Cannot add new dependencies (use Node.js built-ins)

**In scope:**
- Implement interactive merge logic in mergeSkillConfigs function
- Add TTY detection and fallback to append when not interactive
- Add user prompts for conflict resolution
- Test with both TTY and non-TTY environments
**Out of scope:**
- Changing the append/replace strategies
- Modifying the skills.json schema
- Adding conflict resolution for skill definitions (only IDs)

**Signals:** priority: medium

## Summary

The research reveals that the `mergeSkillConfigs` function in `/Users/speed/wreckit/src/commands/learn.ts:103-143` currently throws a "not yet implemented" error for the "ask" strategy (line 141). The function handles two working strategies (append and replace) but needs interactive capability added. The codebase already has established patterns for TTY detection and readline-based user interaction that can be leveraged. The implementation should detect TTY availability using `process.stdout.isTTY`, use Node.js built-in `readline` module for prompts, and fall back to "append" behavior in non-interactive environments. The existing test file at `/Users/speed/wreckit/src/__tests__/commands/learn.test.ts:156-170` has a placeholder test that expects the "not yet implemented" error, which will need to be updated to test the new interactive behavior.

## Current State Analysis

### Existing Implementation

**Location:** `/Users/speed/wreckit/src/commands/learn.ts:103-143`

The `mergeSkillConfigs` function currently has three cases in its switch statement:
1. **"replace"** (lines 113-114): Returns extracted config entirely
2. **"append"** (lines 116-138): Merges phase_skills and skills arrays by keeping existing and adding new
3. **"ask"** (lines 140-141): Throws error "Interactive 'ask' merge strategy not yet implemented. Use 'append' or 'replace'."

The append strategy shows the merge logic:
- **phase_skills** (lines 118-123): Merges phase mappings by keeping existing skill IDs and appending new ones not already present
- **skills** (lines 126-133): Uses a Map to track skills by ID, only adding new skills that don't exist

**Function signature:**
```typescript
export function mergeSkillConfigs(
  existing: SkillConfig | null,
  extracted: SkillConfig,
  strategy: "append" | "replace" | "ask"
): SkillConfig
```

**Current test:** `/Users/speed/wreckit/src/__tests__/commands/learn.test.ts:156-170`
- Tests that "ask" strategy throws the expected error
- Will need to be replaced with tests for interactive behavior

### Key Files

- **`/Users/speed/wreckit/src/commands/learn.ts:103-143`** - Main merge function to implement
- **`/Users/speed/wreckit/src/commands/learn.ts:18-29`** - LearnOptions interface with merge field
- **`/Users/speed/wreckit/src/index.ts:635`** - CLI option definition: `--merge <strategy>` accepts "append|replace|ask"
- **`/Users/speed/wreckit/src/__tests__/commands/learn.test.ts:156-170`** - Test expecting "not yet implemented" error
- **`/Users/speed/wreckit/src/schemas.ts:99-123`** - SkillConfig and Skill schema definitions
- **`/Users/speed/wreckit/docs/learn-command.md:24,109-132`** - Documentation mentioning merge strategies (note: doesn't mention "ask" strategy yet)

## Technical Considerations

### Dependencies

**External dependencies:**
- None required - use Node.js built-in `readline` module

**Internal modules to integrate with:**
- **`readline`** from `node:readline` - For user prompts (standard Node.js module)
- **`Logger`** from `../logging` - For informational messages (optional, can also use console.log directly)
- **`SkillConfig`** from `../schemas` - Type definitions for skill configurations

### Patterns to Follow

**TTY Detection Pattern** (from `/Users/speed/wreckit/src/onboarding.ts:113`):
```typescript
interactive = process.stdout.isTTY ?? false
```

**Readline Interface Pattern** (from `/Users/speed/wreckit/src/domain/ideas-interview.ts:515-524`):
```typescript
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const ask = (question: string): Promise<string> => {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
};

// Always close readline interface
try {
  // ... use ask ...
} finally {
  rl.close();
}
```

**Alternative Pattern** (from `/Users/speed/wreckit/src/domain/ideas-interview.ts:301-312`):
```typescript
const askUser = (prompt: string): Promise<string> => {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
};
```

**ANSI Color/Formatting** (optional - from `/Users/speed/wreckit/src/domain/ideas-interview.ts:20-42`):
- Colors: bold, dim, cyan, green, yellow, blue, magenta, gray
- Format functions like `fmt.bold()`, `fmt.cyan()`, etc.

**Conflict Detection Logic:**
- For **phase_skills**: Conflict when same skill ID appears in both configs with different phase assignments
- For **skills**: Conflict when skill with same ID has different definitions (tools, description, etc.)
- Per success criteria: Only resolve skill ID conflicts, not skill definition conflicts

### Data Structures

**SkillConfig** (from `/Users/speed/wreckit/src/schemas.ts:120-123`):
```typescript
{
  phase_skills: Record<string, string[]>,  // phase -> skill IDs
  skills: Array<{                           // skill definitions
    id: string,
    name: string,
    description: string,
    tools: string[],
    required_context?: Array<{...}>,
    mcp_servers?: Record<string, any>
  }>
}
```

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Non-TTY environments (CI/CD) cannot use readline | High | Detect `process.stdout.isTTY` and fallback to "append" strategy automatically |
| User provides invalid input | Medium | Validate input, provide clear prompts with examples, support default options |
| Breaking existing append/replace behavior | High | Keep switch statement structure, only add "ask" case, don't modify existing cases |
| Test complexity with interactive prompts | Medium | Use dependency injection for readline interface in tests, mock user input |
| Skill definition conflicts (out of scope) | Low | Only prompt for skill ID conflicts, keep existing skill definitions unchanged |
| Large number of conflicts makes interaction tedious | Low | Consider batch operations or "accept all" option for future enhancement |

## Recommended Approach

Based on research findings, here's the high-level implementation strategy:

### 1. Modify `mergeSkillConfigs` Function

**Add TTY detection at start of "ask" case:**
```typescript
case "ask": {
  // Check if running in TTY environment
  if (!process.stdout.isTTY) {
    // Fall back to append behavior
    // Log warning about non-interactive environment
    return /* append logic */;
  }

  // Interactive merge logic
}
```

**Implement interactive merge logic:**
1. Create readline interface
2. Collect all conflicts:
   - **phase_skills conflicts**: Skills that exist in both configs but with different phase mappings
   - **skills conflicts**: Skills with same ID (per success criteria, only resolve IDs, keep existing definitions)
3. For each conflict, prompt user with options:
   - Keep existing
   - Use extracted
   - Keep both (merge)
4. Build final config based on user choices
5. Close readline interface

**Prompt format** (example):
```
Conflict detected for skill 'code-analysis':

Existing: phase=research
Extracted: phase=plan

Choose action:
  [1] Keep existing (research)
  [2] Use extracted (plan)
  [3] Keep both (research, plan)
  [default: 1] >
```

### 2. Update Tests

**Remove** current test at `/Users/speed/wreckit/src/__tests__/commands/learn.test.ts:156-170` that expects error

**Add new tests:**
- Test TTY detection fallback to append
- Test interactive merge with skill conflicts (mock readline)
- Test interactive merge with no conflicts
- Test both phase_skills and skills conflicts
- Test user input validation

### 3. Update Documentation

**File:** `/Users/speed/wreckit/docs/learn-command.md`

Add "Ask (interactive)" section after "Replace" section (around line 132):
```markdown
### Ask (interactive)
Interactively choose which skills to keep for each conflict.

```bash
wreckit learn --merge ask
```

**Behavior:**
- Prompts user for each skill conflict
- Non-TTY environments automatically fall back to "append"
- Provides fine-grained control over skill merges
```

Also update line 24 to include "ask" in the options table.

### 4. Implementation Considerations

**Key design decisions:**
1. **Scope**: Only resolve skill ID conflicts in phase_skills arrays, not skill definition differences
2. **Fallback**: Non-TTY environments use "append" behavior (safe default)
3. **User experience**: Clear prompts with numbered options and sensible defaults
4. **Error handling**: Validate user input, handle empty/cancel responses
5. **Testing**: Mock readline interface to avoid actual prompts in tests

**Code structure:**
```typescript
case "ask": {
  // TTY check
  if (!process.stdout.isTTY) {
    // Log warning about non-interactive environment
    // Fall back to append behavior (reuse append logic)
  }

  // Interactive merge
  const rl = readline.createInterface({...});
  try {
    // Collect conflicts
    // Prompt user for each
    // Build result
  } finally {
    rl.close();
  }
}
```

## Open Questions

1. **Skill definition conflicts**: If a skill ID exists in both configs but with different definitions (different tools, description), should we prompt the user or silently keep the existing definition? The success criteria says "only IDs" but this could be clarified.

2. **Batch operations**: For large numbers of conflicts, should we support "accept all extracted", "keep all existing", or other batch operations? (Not in current scope but worth considering for UX).

3. **Logger vs console.log**: Should interactive prompts use the Logger instance or direct console.log? The existing patterns in `ideas-interview.ts` use console.log with formatting.

4. **Verbose mode**: Should the interactive merge show more details about skill conflicts in verbose mode? (e.g., full skill definitions, not just IDs).

5. **Cancel behavior**: What happens if user enters "quit" or presses Ctrl+C during interactive merge? Should we save partial results or abort entirely?

## Additional Research Findings

**Related files examined:**
- `/Users/speed/wreckit/src/commands/ideas.ts:54-56` - TTY detection pattern using `process.stdin.isTTY`
- `/Users/speed/wreckit/src/commands/orchestrator.ts:102` - Another TTY check pattern
- `/Users/speed/wreckit/src/__tests__/tui.test.ts:270-281` - Test pattern for mocking isTTY

**Color/formatting utilities available:**
- Full ANSI color definitions in `ideas-interview.ts:20-42`
- Format functions for bold, dim, colors for better UX
- Can enhance prompts with visual hierarchy

**Error handling patterns:**
- Readline interfaces should always be closed in `finally` blocks
- User input should be trimmed and validated
- Empty input should trigger default behavior
