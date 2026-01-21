# Fix plan template to match validator requirements Implementation Plan

## Overview
Update the plan phase prompt template (src/prompts/plan.md) to generate plan.md files that pass validation. The current template instructs agents to create plans with section headers that don't match the validator's exact requirements, causing validation failures even when agents follow the template precisely.

## Current State
The plan template at `src/prompts/plan.md` (lines 56-137) contains three critical mismatches with validator requirements:

1. **Missing "Implementation Plan Title" section** - The template omits this required section entirely (validation.ts:499)
2. **Incorrect section name** - Uses "## Current State Analysis" instead of "## Current State" (validation.ts:501), causing regex match failures
3. **Missing "Phases" container** - Phase sections use "## Phase 1:" headers directly instead of being wrapped in a "## Phases" container with "### Phase 1:" subsections (validation.ts:519)

The validator's `findMissingPlanSections()` function (validation.ts:552) uses the regex pattern `^#+\\s*${section.toLowerCase()}\\s*$` which requires exact word matches. Extra words like "Analysis" cause failures. The `countPhases()` function (validation.ts:519) extracts content between "## Phases" and "## Testing Strategy" sections, then counts ### headers within that content. Without a "## Phases" container, it returns 0 phases.

## Desired End State
The updated template generates plan.md files that pass all validation checks without requiring manual edits. Plans include all required sections with exact header matches, and phases are properly structured for automatic counting.

### Key Discoveries:
- The validator uses case-insensitive matching but requires exact words (no extra words) - validation.ts:552
- Test suite provides valid examples showing correct structure - plan-quality.test.ts:27-60, 355-401
- The "Key Discoveries" subsection (plan.md:68) is optional content within "Desired End State" section, not a required section - this is fine to keep
- Template variables like {{title}} are rendered before agents see the template, so the example structure should show literal section headers

## What We're NOT Doing
- Modifying validator logic or regex patterns in src/domain/validation.ts
- Changing the required sections array or validation rules
- Adding new features or capabilities beyond fixing the template mismatch
- Updating any other template files or prompts

## Implementation Approach
This is a straightforward template update. We'll modify the example plan.md structure in `src/prompts/plan.md` (lines 56-137) to include all required sections with exact header names and proper phase structure. The fix is isolated to a single file with no dependencies or migration needed.

---

## Phases

### Phase 1: Update plan template structure

#### Overview
Fix the three critical mismatches in the template by updating the example plan.md structure to match validator requirements.

#### Changes Required:

#### 1. src/prompts/plan.md
**File**: `/Users/mhostetler/Source/Wreckit/wreckit/src/prompts/plan.md`
**Changes**: Update the example plan.md structure (lines 56-137) to include all required sections with exact headers

**Specific changes:**
1. Add "## Implementation Plan Title" section after the header (after line 57)
2. Change "## Current State Analysis" to "## Current State" (line 62)
3. Wrap phase sections under a "## Phases" container with "### Phase X:" subsections (lines 81-113)
4. Keep all other content (success criteria, verification steps, etc.) as-is

**Updated structure (lines 56-137):**

```markdown
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

#### Success Criteria:

##### Automated Verification:
- [ ] Template file updates pass syntax validation
- [ ] No changes to validator logic (verify with `git diff src/domain/validation.ts`)
- [ ] Existing test suite still passes: `npm test -- plan-quality.test.ts`

##### Manual Verification:
- [ ] Generated plan.md files include all required sections
- [ ] Section headers match exactly (no extra words)
- [ ] Phases are wrapped in "## Phases" container with "### Phase X:" subsections
- [ ] Plans pass validation without manual editing

**Note**: Complete all automated verification, then manually test by generating a plan using the updated template before considering the task complete.

---

## Testing Strategy

### Unit Tests:
- Existing test suite in `src/__tests__/plan-quality.test.ts` validates the fix works correctly
- Tests show valid plan structures (lines 27-60, 355-401) that match our updated template

### Integration Tests:
- Generate a plan using the updated template
- Run `validatePlanQuality()` on the generated plan
- Verify all validation checks pass with no errors

### Manual Testing Steps:
1. Create a test item using the planning phase
2. Verify the generated plan.md includes "## Implementation Plan Title" section
3. Verify "## Current State" (not "Current State Analysis")
4. Verify "## Phases" container exists with "### Phase X:" subsections
5. Run validation and confirm zero errors
6. Check that phase counting returns the correct number (≥1)

## Migration Notes
No migration needed. This fix only affects new plans generated after the template update. Existing plans that were manually corrected will continue to work. Users who have overridden the template locally can adopt the updated template at their convenience.

## References
- Research: `/Users/mhostetler/Source/Wreckit/wreckit/.wreckit/items/004-fix-plan-template-to-match-validator-requirements/research.md`
- Template file: `src/prompts/plan.md` (lines 56-137 - example plan structure)
- Validator configuration: `src/domain/validation.ts` (lines 495-508 - DEFAULT_PLAN_QUALITY_OPTIONS)
- Section detection: `src/domain/validation.ts` (lines 537-559 - findMissingPlanSections)
- Phase counting: `src/domain/validation.ts` (lines 517-528 - countPhases)
- Valid examples: `src/__tests__/plan-quality.test.ts` (lines 27-60, 355-401)
