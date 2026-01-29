# Replace interactive 'ask' merge strategy in learn command Implementation Plan

## Overview
Implement the interactive "ask" merge strategy for the `wreckit learn` command. Currently, the strategy is documented and accepted by the CLI but throws a "not yet implemented" error at runtime. This implementation will allow users to interactively choose which skills to keep during merges, providing finer-grained control than binary append/replace options when curating skills from multiple extraction sessions.

## Current State Analysis

**What exists now:**
- The `mergeSkillConfigs` function in `/Users/speed/wreckit/src/commands/learn.ts:103-143` has a switch statement with three strategies
- "replace" (lines 113-114): Returns extracted config entirely
- "append" (lines 116-138): Merges phase_skills and skills arrays intelligently
- "ask" (lines 140-141): Throws error with message "Interactive 'ask' merge strategy not yet implemented. Use 'append' or 'replace'."
- The CLI accepts `--merge ask` option (defined in `/Users/speed/wreckit/src/index.ts:635`)
- The LearnOptions interface at `/Users/speed/wreckit/src/commands/learn.ts:24` includes "ask" as a valid strategy
- Test at `/Users/speed/wreckit/src/__tests__/commands/learn.test.ts:156-170` expects the error to be thrown
- Documentation at `/Users/speed/wreckit/docs/learn-command.md:24` mentions "append" or "replace" but not "ask"
- Troubleshooting section at line 287-292 explains the error and tells users to use other strategies

**What's missing:**
- Interactive merge logic implementation
- TTY detection for non-interactive environments
- User prompts for conflict resolution
- Tests for interactive behavior
- Documentation for the ask strategy

**Key constraints discovered:**
- Must use Node.js built-in `readline` module (no new dependencies)
- Must handle non-TTY environments gracefully (CI/CD, piped input)
- Should not modify existing append/replace strategies
- Only resolve skill ID conflicts in phase_skills arrays, not skill definition differences (per success criteria)
- Use established patterns from `/Users/speed/wreckit/src/domain/ideas-interview.ts:515-524` for readline
- Use TTY detection pattern from `/Users/speed/wreckit/src/onboarding.ts:113`
- Can leverage ANSI formatting utilities from `/Users/speed/wreckit/src/domain/ideas-interview.ts:20-42`

## Desired End State

Users can run `wreckit learn --merge ask` and be prompted interactively for each skill conflict:

1. **TTY environments**: User sees clear prompts for each conflict and makes choices
2. **Non-TTY environments**: System falls back to "append" behavior automatically with a warning
3. **phase_skills conflicts**: User chooses to keep existing phase, use extracted phase, or merge both
4. **skills conflicts**: System keeps existing skill definitions (per scope constraints), only prompts for ID placement
5. **Documentation updated**: learn-command.md describes ask strategy behavior
6. **Tests pass**: New tests verify TTY detection, interactive prompts, and fallback behavior

### Key Discoveries:

- **Pattern to follow**: `/Users/speed/wreckit/src/domain/ideas-interview.ts:515-524` shows readline interface creation with try/finally cleanup
- **Pattern to follow**: `/Users/speed/wreckit/src/onboarding.ts:113` shows `process.stdout.isTTY ?? false` for TTY detection
- **Test pattern**: `/Users/speed/wreckit/src/__tests__/tui.test.ts:270-281` shows how to mock `process.stdin.isTTY` in tests using `Object.defineProperty`
- **Formatting utilities**: ANSI colors available at `/Users/speed/wreckit/src/domain/ideas-interview.ts:20-42` for better UX
- **Constraint to work within**: SkillConfig schema at `/Users/speed/wreckit/src/schemas.ts:120-123` defines structure with phase_skills (Record<string, string[]>) and skills (Array)
- **Scope clarification**: Success criteria says "only resolve skill ID conflicts" - meaning if a skill ID exists in both configs, we don't prompt about definition differences, just keep existing

## What We're NOT Doing

- **Changing append/replace strategies**: These work fine and must not be modified
- **Modifying skills.json schema**: The SkillConfigSchema stays the same
- **Resolving skill definition conflicts**: If a skill ID exists in both configs with different definitions (tools, description), we keep the existing definition without prompting (per success criteria)
- **Adding batch operations**: No "accept all" or "reject all" options (out of scope for this iteration)
- **Changing CLI interface**: The `--merge ask` option already exists and works
- **Implementing --review flag**: That's a separate feature mentioned in docs but not related to ask strategy

## Implementation Approach

The implementation follows a phased approach that prioritizes core functionality first, then adds testing and documentation:

**High-level strategy:**
1. Extract reusable "append" logic into a helper function to avoid code duplication
2. Implement "ask" case with TTY detection and fallback to append
3. Add interactive merge logic that collects conflicts and prompts user
4. Write tests covering TTY, non-TTY, and conflict scenarios
5. Update documentation to describe the new behavior

**Reasoning:**
- Extracting append logic avoids duplicating the fallback code in the ask case
- TTY detection first ensures we never try to use readline in non-interactive environments
- Conflict collection happens before prompts so we can inform users how many conflicts to expect
- Tests use dependency injection for readline to avoid actual prompts during test runs
- Documentation update is last since the feature must work first

---

## Phase 1: Extract Append Logic and Add TTY Detection

### Overview
Refactor the append logic into a reusable helper function and implement the "ask" case with TTY detection that falls back to append. This provides the foundation for interactive merging while ensuring non-TTY environments work correctly.

### Changes Required:

#### 1. learn.ts - Refactor mergeSkillConfigs
**File**: `/Users/speed/wreckit/src/commands/learn.ts`

**Changes**:
1. Extract the append logic (lines 116-138) into a helper function `performAppendMerge()`
2. Replace the "ask" case (lines 140-141) with TTY detection and fallback logic

**Code to add after line 142:**

```typescript
/**
 * Perform append merge of skill configs.
 * Extracted as a helper to reuse in both append and ask strategies.
 */
function performAppendMerge(
  existing: SkillConfig,
  extracted: SkillConfig
): SkillConfig {
  // Merge phase_skills: keep existing, add new
  const phaseSkills = { ...existing.phase_skills };
  for (const [phase, skillIds] of Object.entries(extracted.phase_skills)) {
    const existingIds = phaseSkills[phase] || [];
    const newIds = skillIds.filter(id => !existingIds.includes(id));
    phaseSkills[phase] = [...existingIds, ...newIds];
  }

  // Merge skills: keep existing, add new (by ID)
  const existingSkillsMap = new Map(
    existing.skills.map(s => [s.id, s])
  );
  for (const skill of extracted.skills) {
    if (!existingSkillsMap.has(skill.id)) {
      existingSkillsMap.set(skill.id, skill);
    }
  }

  return {
    phase_skills: phaseSkills,
    skills: Array.from(existingSkillsMap.values())
  };
}
```

**Replace lines 116-138 with:**

```typescript
    case "append":
      return performAppendMerge(existing, extracted);
```

**Replace lines 140-141 with:**

```typescript
    case "ask": {
      // Check if running in TTY environment
      if (!process.stdout.isTTY) {
        console.warn("Not a TTY environment. Falling back to 'append' merge strategy.");
        return performAppendMerge(existing, extracted);
      }

      // Interactive merge logic will be added in Phase 2
      throw new Error("Interactive merge logic not yet implemented.");
    }
```

**Add import at top of file (around line 2):**

```typescript
import * as readline from "node:readline";
```

### Success Criteria:

#### Automated Verification:
- [ ] Tests pass: `npm test -- src/__tests__/commands/learn.test.ts`
- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] Run `wreckit learn --merge ask` in a non-TTY environment (e.g., `echo | wreckit learn --merge ask`) - should fall back to append with warning
- [ ] Existing append/replace strategies still work correctly
- [ ] No regressions in related features

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Implement Interactive Merge Logic

### Overview
Add the interactive merge logic that prompts users to resolve conflicts. This phase implements the core user experience where users see each conflict and make choices.

### Changes Required:

#### 1. learn.ts - Implement ask strategy
**File**: `/Users/speed/wreckit/src/commands/learn.ts`

**Changes**:
Replace the temporary error throw in the "ask" case with full interactive merge logic.

**Replace lines 140-141 (currently the error throw) with:**

```typescript
    case "ask": {
      // Check if running in TTY environment
      if (!process.stdout.isTTY) {
        console.warn("Not a TTY environment. Falling back to 'append' merge strategy.");
        return performAppendMerge(existing, extracted);
      }

      // Interactive merge
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      try {
        // ANSI formatting for better UX
        const fmt = {
          bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
          dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
          cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
          yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
          green: (s: string) => `\x1b[32m${s}\x1b[0m`,
        };

        const ask = (question: string): Promise<string> => {
          return new Promise((resolve) => {
            rl.question(question, (answer) => {
              resolve(answer.trim());
            });
          });
        };

        console.log("");
        console.log(fmt.bold("Interactive Skill Merge"));
        console.log(fmt.dim("─".repeat(60)));

        // Collect phase_skills conflicts
        const phaseConflicts: Array<{
          phase: string;
          skillId: string;
          existingPhases: string[];
          extractedPhases: string[];
        }> = [];

        const allPhases = new Set([
          ...Object.keys(existing.phase_skills),
          ...Object.keys(extracted.phase_skills),
        ]);

        for (const phase of allPhases) {
          const existingIds = existing.phase_skills[phase] || [];
          const extractedIds = extracted.phase_skills[phase] || [];

          // Skills in extracted but not in existing for this phase
          for (const skillId of extractedIds) {
            if (!existingIds.includes(skillId)) {
              // Check if skill exists in a different phase
              const existingPhase = Object.entries(existing.phase_skills).find(
                ([_, ids]) => ids.includes(skillId)
              )?.[0];

              if (existingPhase) {
                // Conflict: skill in different phase
                phaseConflicts.push({
                  phase,
                  skillId,
                  existingPhases: [existingPhase],
                  extractedPhases: [phase],
                });
              } else {
                // No conflict: new skill, add it
                // Will be handled by non-conflict merge
              }
            }
          }
        }

        // If no conflicts, just append
        if (phaseConflicts.length === 0) {
          console.log(fmt.green("✓") + " No conflicts found. Using append strategy.");
          return performAppendMerge(existing, extracted);
        }

        console.log(
          fmt.yellow(`Found ${phaseConflicts.length} conflict${phaseConflicts.length > 1 ? "s" : ""} to resolve:\n`)
        );

        // Initialize result with existing config
        const resultPhaseSkills = { ...existing.phase_skills };
        const resultSkillsMap = new Map(existing.skills.map(s => [s.id, s]));

        // Add all non-conflicting skills from extracted
        for (const skill of extracted.skills) {
          if (!resultSkillsMap.has(skill.id)) {
            resultSkillsMap.set(skill.id, skill);
          }
        }

        // Resolve each conflict
        for (let i = 0; i < phaseConflicts.length; i++) {
          const conflict = phaseConflicts[i];
          const existingPhase = conflict.existingPhases[0];
          const extractedPhase = conflict.extractedPhases[0];

          console.log(
            fmt.bold(`[${i + 1}/${phaseConflicts.length}]`) +
            ` Skill: ${fmt.cyan(conflict.skillId)}`
          );
          console.log(`  Existing: phase=${fmt.dim(existingPhase)}`);
          console.log(`  Extracted: phase=${fmt.dim(extractedPhase)}`);

          const answer = await ask(
            `  Choose: ${fmt.green("1")} keep ${fmt.dim(existingPhase)}, ` +
            `${fmt.green("2")} use ${fmt.dim(extractedPhase)}, ` +
            `${fmt.green("3")} add to ${fmt.dim("both")}, ` +
            `${fmt.dim("[default: 1]")} > `
          );

          const choice = answer || "1";

          switch (choice) {
            case "1":
              // Keep existing - do nothing
              console.log(`  → Keeping in ${fmt.dim(existingPhase)} phase\n`);
              break;
            case "2":
              // Use extracted: remove from existing, add to extracted
              resultPhaseSkills[existingPhase] = resultPhaseSkills[existingPhase].filter(
                id => id !== conflict.skillId
              );
              resultPhaseSkills[extractedPhase] = [
                ...(resultPhaseSkills[extractedPhase] || []),
                conflict.skillId,
              ];
              console.log(`  → Moved to ${fmt.dim(extractedPhase)} phase\n`);
              break;
            case "3":
              // Add to both phases
              resultPhaseSkills[extractedPhase] = [
                ...(resultPhaseSkills[extractedPhase] || []),
                conflict.skillId,
              ];
              console.log(`  → Added to both phases\n`);
              break;
            default:
              console.log(fmt.yellow("  → Invalid choice, keeping existing\n"));
          }
        }

        // Add any remaining non-conflicting phase_skills
        for (const [phase, skillIds] of Object.entries(extracted.phase_skills)) {
          const existingIds = resultPhaseSkills[phase] || [];
          const newIds = skillIds.filter(id => !existingIds.includes(id));
          resultPhaseSkills[phase] = [...existingIds, ...newIds];
        }

        console.log(fmt.green("✓") + " Merge complete.\n");

        return {
          phase_skills: resultPhaseSkills,
          skills: Array.from(resultSkillsMap.values()),
        };
      } finally {
        rl.close();
      }
    }
```

### Success Criteria:

#### Automated Verification:
- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] Run `wreckit learn --merge ask` with actual skill conflicts - should prompt interactively
- [ ] Test option 1 (keep existing) - skill stays in original phase
- [ ] Test option 2 (use extracted) - skill moves to new phase
- [ ] Test option 3 (keep both) - skill appears in both phases
- [ ] Test invalid input - should default to option 1
- [ ] Test no conflicts - should use append without prompts
- [ ] Verify non-TTY still falls back to append

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Update Tests

### Overview
Replace the test that expects the "not yet implemented" error with comprehensive tests for the new interactive behavior. This phase ensures the feature works correctly in both TTY and non-TTY environments and handles edge cases.

### Changes Required:

#### 1. learn.test.ts - Replace and add tests
**File**: `/Users/speed/wreckit/src/__tests__/commands/learn.test.ts`

**Remove test at lines 156-170** (the one expecting the error)

**Add new tests after line 170:**

```typescript
    describe("ask strategy", () => {
      it("should fall back to append when not in TTY environment", () => {
        const originalIsTTY = process.stdout.isTTY;
        Object.defineProperty(process.stdout, "isTTY", { value: false, configurable: true });

        try {
          const existing: SkillConfig = {
            phase_skills: {
              research: ["existing-skill"],
            },
            skills: [
              {
                id: "existing-skill",
                name: "Existing Skill",
                description: "Existing skill",
                tools: ["Read"],
              },
            ],
          };

          const extracted: SkillConfig = {
            phase_skills: {
              plan: ["new-skill"],
            },
            skills: [
              {
                id: "new-skill",
                name: "New Skill",
                description: "New skill",
                tools: ["Grep"],
              },
            ],
          };

          const result = mergeSkillConfigs(existing, extracted, "ask");

          // Should behave like append (fallback)
          expect(result.skills).toHaveLength(2);
          expect(result.skills.find(s => s.id === "existing-skill")).toBeDefined();
          expect(result.skills.find(s => s.id === "new-skill")).toBeDefined();
          expect(result.phase_skills.research).toEqual(["existing-skill"]);
          expect(result.phase_skills.plan).toEqual(["new-skill"]);
        } finally {
          Object.defineProperty(process.stdout, "isTTY", { value: originalIsTTY, configurable: true });
        }
      });

      it("should use append behavior when TTY but no conflicts", () => {
        const originalIsTTY = process.stdout.isTTY;
        Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });

        try {
          // Mock readline to avoid actual prompts
          const mockCreateInterface = mock(() => ({
            question: (_: string, callback: (answer: string) => void) => {
              callback(""); // Empty input (should use defaults)
            },
            close: () => {},
          }));

          const originalReadline = globalThis.readline;
          // @ts-expect-error - mocking readline for test
          globalThis.readline = { createInterface: mockCreateInterface };

          const existing: SkillConfig = {
            phase_skills: {
              research: ["skill-1"],
            },
            skills: [
              { id: "skill-1", name: "Skill 1", description: "Test", tools: ["Read"] },
            ],
          };

          const extracted: SkillConfig = {
            phase_skills: {
              plan: ["skill-2"], // Different skill, no conflict
            },
            skills: [
              { id: "skill-2", name: "Skill 2", description: "Test", tools: ["Grep"] },
            ],
          };

          const result = mergeSkillConfigs(existing, extracted, "ask");

          // Should append both skills
          expect(result.skills).toHaveLength(2);
          expect(result.phase_skills.research).toEqual(["skill-1"]);
          expect(result.phase_skills.plan).toEqual(["skill-2"]);

          // @ts-expect-error - restoring readline
          globalThis.readline = originalReadline;
        } finally {
          Object.defineProperty(process.stdout, "isTTY", { value: originalIsTTY, configurable: true });
        }
      });

      it("should handle phase conflicts with user input in TTY", () => {
        const originalIsTTY = process.stdout.isTTY;
        Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });

        try {
          let questionCount = 0;
          const mockCreateInterface = mock(() => ({
            question: (_: string, callback: (answer: string) => void) => {
              questionCount++;
              // First question: choose option 2 (use extracted phase)
              if (questionCount === 1) {
                callback("2");
              } else {
                callback("");
              }
            },
            close: () => {},
          }));

          const originalReadline = globalThis.readline;
          // @ts-expect-error - mocking readline for test
          globalThis.readline = { createInterface: mockCreateInterface };

          const existing: SkillConfig = {
            phase_skills: {
              research: ["conflict-skill"],
            },
            skills: [
              { id: "conflict-skill", name: "Conflict", description: "Test", tools: ["Read"] },
            ],
          };

          const extracted: SkillConfig = {
            phase_skills: {
              plan: ["conflict-skill"], // Same skill, different phase
            },
            skills: [
              { id: "conflict-skill", name: "Conflict", description: "Test", tools: ["Read"] },
            ],
          };

          const result = mergeSkillConfigs(existing, extracted, "ask");

          // Should move skill from research to plan (option 2)
          expect(result.phase_skills.research).toEqual([]);
          expect(result.phase_skills.plan).toEqual(["conflict-skill"]);

          // @ts-expect-error - restoring readline
          globalThis.readline = originalReadline;
        } finally {
          Object.defineProperty(process.stdout, "isTTY", { value: originalIsTTY, configurable: true });
        }
      });
    });
```

**Add import at top of file (around line 1, if not already present):**

```typescript
import { mock } from "bun:test";
```

### Success Criteria:

#### Automated Verification:
- [ ] Tests pass: `npm test -- src/__tests__/commands/learn.test.ts`
- [ ] All learn command tests pass (not just new ones)
- [ ] No test failures in other test files
- [ ] Type checking passes: `npm run typecheck`

#### Manual Verification:
- [ ] Run tests multiple times to ensure they're deterministic
- [ ] Verify console output doesn't interfere with test runner
- [ ] Check that TTY property is properly restored after tests

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to Phase 4.

---

## Phase 4: Update Documentation

### Overview
Update the documentation to describe the ask merge strategy, its behavior, and when to use it. This ensures users understand the feature and how it works.

### Changes Required:

#### 1. learn-command.md - Update options table
**File**: `/Users/speed/wreckit/docs/learn-command.md`

**Update line 24** to include "ask" in the merge options:

```markdown
| `--merge <strategy>` | Merge strategy: `append` (default), `ask`, or `replace` |
```

**Add new section after line 132** (after the "Replace" section):

```markdown
### Ask (interactive)
Interactively choose which skills to keep for each conflict.

```bash
wreckit learn --merge ask
```

**Behavior:**
- Prompts user for each skill phase conflict
- Non-TTY environments (CI/CD, piped input) automatically fall back to "append"
- Provides fine-grained control over skill merges
- Options for each conflict:
  - **Keep existing**: Maintain the skill's current phase assignment
  - **Use extracted**: Move the skill to the extracted phase
  - **Keep both**: Add the skill to both phases

**When to use:**
- Curating skills from multiple extraction sessions
- Merging skills with conflicting phase assignments
- Wanting manual control over which skills to keep

**Example interaction:**
```
Interactive Skill Merge
────────────────────────────────────────────────────────────
Found 2 conflicts to resolve:

[1/2] Skill: code-analysis
  Existing: phase=research
  Extracted: phase=plan
  Choose: 1 keep research, 2 use plan, 3 add to both, [default: 1] > 2
  → Moved to plan phase

[2/2] Skill: test-generation
  Existing: phase=implement
  Extracted: phase=plan
  Choose: 1 keep implement, 2 use plan, 3 add to both, [default: 1] > 3
  → Added to both phases

✓ Merge complete.
```
```

**Remove troubleshooting section at lines 287-292** (the "Merge strategy not implemented" section) since it's no longer applicable.

### Success Criteria:

#### Automated Verification:
- [ ] Documentation is valid Markdown
- [ ] No syntax errors in code blocks
- [ ] All internal links still work

#### Manual Verification:
- [ ] Documentation accurately describes the feature behavior
- [ ] Examples in docs match actual implementation
- [ ] Read the docs as a new user - are they clear?

**Note**: Complete all verification steps. This is the final phase.

---

## Testing Strategy

### Unit Tests:

**Phase 1 tests (current tests still pass):**
- Existing append tests verify extracted logic still works
- Existing replace tests verify no regression
- New test verifies TTY detection and fallback to append

**Phase 2 tests (new functionality):**
- Test TTY detection with `process.stdout.isTTY` mocking
- Test non-TTY fallback behavior (use pattern from `/Users/speed/wreckit/src/__tests__/tui.test.ts:270-281`)
- Test no-conflict scenario (should use append)
- Test single conflict resolution
- Test multiple conflicts in sequence
- Test invalid user input (should default to option 1)
- Test readline interface is always closed (even on errors)

**Key edge cases:**
- Empty extracted config (no new skills)
- Empty existing config (first run, should just return extracted)
- Same skill in multiple phases in extracted
- Skill in extracted but not in existing (should add without prompting)
- User enters empty string (should use default)
- User enters invalid number (should use default)

### Integration Tests:

**End-to-end scenarios:**
1. **Fresh repository**: First learn with ask strategy (no existing skills.json)
2. **Simple merge**: One conflict, choose each option
3. **Complex merge**: Multiple conflicts, mixed choices
4. **CI/CD environment**: Non-TTY, verify fallback to append
5. **No conflicts**: Verify append behavior without prompts

### Manual Testing Steps:

1. **Setup test environment:**
   ```bash
   cd /tmp
   mkdir test-wreckit-ask
   cd test-wreckit-ask
   git init
   wreckit init
   ```

2. **Test TTY environment (interactive):**
   ```bash
   # Create a skills.json with a conflict
   cat > .wreckit/skills.json << 'EOF'
   {
     "phase_skills": {"research": ["test-skill"]},
     "skills": [{"id": "test-skill", "name": "Test", "description": "Test", "tools": ["Read"]}]
   }
   EOF

   # Run learn with ask (should prompt)
   wreckit learn --item 001 --merge ask --dry-run
   ```

3. **Test non-TTY environment (CI/CD):**
   ```bash
   # Pipe input to simulate non-TTY
   echo "" | wreckit learn --item 001 --merge ask --dry-run
   # Should see "Not a TTY environment. Falling back to 'append' merge strategy."
   ```

4. **Test fallback behavior:**
   ```bash
   # Verify append still works as expected
   wreckit learn --merge append
   ```

5. **Test documentation examples:**
   ```bash
   # Try examples from the updated docs
   wreckit learn --all --merge ask
   ```

## Migration Notes

No data migration required. This feature:
- Does not modify the skills.json schema
- Does not change existing append/replace behavior
- Only adds a new merge strategy option
- Falls back gracefully in non-interactive environments

**Rollback strategy:**
If issues arise, revert the changes to learn.ts and the ask strategy will again throw "not yet implemented" error, which is the current behavior. The append/replace strategies remain untouched.

## References

- Research: `/Users/speed/wreckit/.wreckit/items/041-replace-interactive-ask-merge-strategy-in-learn-co/research.md`
- Main implementation: `/Users/speed/wreckit/src/commands/learn.ts:103-143`
- Test file: `/Users/speed/wreckit/src/__tests__/commands/learn.test.ts:156-170`
- Schema definitions: `/Users/speed/wreckit/src/schemas.ts:99-123`
- CLI option definition: `/Users/speed/wreckit/src/index.ts:635`
- Readline pattern: `/Users/speed/wreckit/src/domain/ideas-interview.ts:515-524`
- TTY detection pattern: `/Users/speed/wreckit/src/onboarding.ts:113`
- TTY test pattern: `/Users/speed/wreckit/src/__tests__/tui.test.ts:270-281`
- Formatting utilities: `/Users/speed/wreckit/src/domain/ideas-interview.ts:20-42`
