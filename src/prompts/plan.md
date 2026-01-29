# Planning Phase

You are tasked with creating a detailed implementation plan through thorough analysis. Be skeptical, thorough, and produce a high-quality technical specification.

## Item Details

- **ID:** {{id}}
- **Title:** {{title}}
- **Section:** {{section}}
- **Overview:** {{overview}}
- **Branch:** {{branch_name}}
- **Base Branch:** {{base_branch}}
- **Working Directory:** {{item_path}}

## Research Summary

{{research}}

## Planning Process

### Step 1: Validate Understanding

1. **Verify the research findings:**
   - Cross-reference the requirements with actual code
   - Identify any discrepancies or gaps
   - Note assumptions that need verification

2. **Confirm scope:**
   - What's explicitly IN scope
   - What's explicitly OUT of scope
   - Dependencies on other work

### Step 2: Design the Solution

1. **Evaluate approaches:**
   - Consider multiple implementation options
   - Weigh pros/cons of each
   - Select the approach that best fits existing patterns

2. **Break down into phases:**
   - Each phase should be independently testable
   - Order phases to minimize risk
   - Consider rollback strategies

### Step 3: Create User Stories

For each discrete piece of work:

- Clear acceptance criteria
- Priority (1 = highest)
- Estimated complexity

## Output

Create TWO files at `{{item_path}}`:

### 1. plan.md - Detailed Implementation Plan

**CRITICAL:** You MUST use the EXACT section headers below. Do not paraphrase or omit them. The system validates these headers strictly.

Required Headers:

1. `# {{title}} Implementation Plan` (Top-level header)
2. `## Implementation Plan Title`
3. `## Overview`
4. `## Current State`
5. `## Desired End State`
6. `## What We're NOT Doing`
7. `## Implementation Approach`
8. `## Phases`
9. `## Testing Strategy`

Structure:

````markdown
# {{title}} Implementation Plan

## Implementation Plan Title

[Brief, descriptive title for this implementation plan]

## Overview

[Brief description of what we're implementing and why]

## Current State

[What exists now, what's missing, key constraints discovered]

## Desired End State

[Specification of the desired end state and how to verify it]

### Key Discoveries:

- [Important finding with file:line reference]
- [Pattern to follow]
- [Constraint to work within]

## What We're NOT Doing

[Explicitly list out-of-scope items to prevent scope creep]

## Implementation Approach

[High-level strategy and reasoning]

---

## Phases

### Phase 1: [Descriptive Name]

#### Overview

[What this phase accomplishes]

#### Changes Required:

##### 1. [Component/File Group]

**File**: `path/to/file.ext`
**Changes**: [Summary of changes]

```[language]
// Specific code to add/modify
```
````

#### Success Criteria:

##### Automated Verification:

- [ ] Tests pass: `npm test` or relevant command
- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`

##### Manual Verification:

- [ ] Feature works as expected when tested
- [ ] No regressions in related features
- [ ] Edge cases handled correctly

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to next phase.

---

### Phase 2: [Descriptive Name]

[Similar structure...]

---

## Testing Strategy

### Unit Tests:

- [What to test]
- [Key edge cases]

### Integration Tests:

- [End-to-end scenarios]

### Manual Testing Steps:

1. [Specific step to verify feature]
2. [Another verification step]

## Migration Notes

[If applicable, how to handle existing data/systems]

## References

- Research: `{{item_path}}/research.md`
- [Other relevant files with line references]

```

### 2. PRD - Structured User Stories

Call the `save_prd` MCP tool with the PRD data. The PRD schema:

- `schema_version`: Always 1
- `id`: "{{id}}"
- `branch_name`: "{{branch_name}}"
- `user_stories`: Array of stories, each with:
  - `id`: Story ID like "US-001"
  - `title`: Short descriptive title
  - `acceptance_criteria`: Array of specific, testable criteria
  - `priority`: Number (1 = highest)
  - `status`: "pending" (all new stories start as pending)
  - `notes`: Implementation notes (can be empty string)

## Important Guidelines

1. **Be Skeptical:**
   - Question vague requirements
   - Identify potential issues early
   - Don't assume - verify with code

2. **Be Thorough:**
   - Include specific file paths and line numbers
   - Write measurable success criteria
   - Separate automated vs manual verification

3. **Be Practical:**
   - Focus on incremental, testable changes
   - Consider migration and rollback
   - Think about edge cases
   - Include "what we're NOT doing"

4. **No Open Questions:**
   - If you encounter open questions, research them immediately
   - Do NOT write the plan with unresolved questions
   - Every decision must be made before finalizing

## Story Prioritization

- **Priority 1**: Core functionality, must be done first
- **Priority 2**: Important features that depend on Priority 1
- **Priority 3**: Nice-to-have, can be deferred
- **Priority 4**: Optional enhancements

## Common Patterns

### For Database Changes:
1. Schema/migration first
2. Add store methods
3. Update business logic
4. Expose via API
5. Update clients

### For New Features:
1. Research existing patterns
2. Start with data model
3. Build backend logic
4. Add API endpoints
5. Implement UI last

### For Refactoring:
1. Document current behavior
2. Plan incremental changes
3. Maintain backwards compatibility
4. Include migration strategy

## Completion

When you have:
1. Created `{{item_path}}/plan.md`
2. Called the `save_prd` tool with the PRD data

Output the following signal:
{{completion_signal}}
```
