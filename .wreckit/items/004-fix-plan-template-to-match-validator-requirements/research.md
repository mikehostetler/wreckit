# Research: Fix plan template to match validator requirements

**Date**: 2025-06-20
**Item**: 004-fix-plan-template-to-match-validator-requirements

## Research Question
The plan phase prompt template (src/prompts/plan.md) instructs agents to create plan.md files with section headers that do not match what the validator (validatePlanQuality) expects, causing plans to fail validation even when following the template exactly.

**Motivation:** Plans created by following the prompt template currently fail with errors like 'Missing required sections: Implementation Plan Title, Current State, Phases' and 'Insufficient implementation phases: found 0, required at least 1'. Users must either manually edit generated plan.md files or override the local template as a workaround.

**Success criteria:**
- Plans generated using the updated template pass validation without errors
- Template includes all required section headers: Header, Implementation Plan Title, Overview, Current State, Desired End State, What We're NOT Doing, Implementation Approach, Phases, Testing Strategy
- Phases are properly wrapped in a '## Phases' container section with '### Phase X:' subsections
- Section headers match exactly (no extra words that cause regex matching to fail)

**Technical constraints:**
- Must update src/prompts/plan.md template file
- Validator requires exact section header matches using regex pattern: ^#+\s*${section.toLowerCase()}\s*$
- Validator counts phases by extracting content between '## Phases' and '## Testing Strategy' sections
- Required sections are defined in src/domain/validation.ts DEFAULT_PLAN_QUALITY_OPTIONS.requiredSections

**In scope:**
- Update src/prompts/plan.md to use exact section headers required by validator
- Add missing '## Implementation Plan Title' section
- Change '## Current State Analysis' to '## Current State'
- Wrap phase subsections under a '## Phases' container section
**Out of scope:**
- Modifying validator logic or regex patterns
- Changes to src/domain/validation.ts
- Adding new features or capabilities beyond fixing the template mismatch

**Signals:** priority: high, urgency: Users are currently blocked by this bug and must use workarounds to proceed

## Summary

The plan template in `src/prompts/plan.md` contains three critical mismatches with the validator requirements defined in `src/domain/validation.ts`:

1. **Missing "Implementation Plan Title" section**: The template omits this required section entirely (required at line 499 of validation.ts), while showing only `# {{title}} Implementation Plan` as the header (line 57 in plan.md).

2. **Incorrect section name for "Current State"**: The template uses `## Current State Analysis` (line 62 in plan.md) but the validator expects exactly `## Current State` (line 501 in validation.ts). The extra word "Analysis" causes the regex pattern `^#+\s*${section.toLowerCase()}\s*$` to fail matching.

3. **Missing "Phases" container section**: The template instructs agents to create phase sections as `## Phase 1:` (line 81 in plan.md), but the validator's `countPhases()` function (lines 517-528 in validation.ts) extracts content between `## Phases` and `## Testing Strategy`, then counts `###` (level 3) headers within that content. Without a `## Phases` container, the validator finds 0 phases.

The fix requires updating the example plan.md structure in the template (lines 56-137) to include all required sections with exact header names, and ensuring phases are wrapped in a `## Phases` container with `### Phase X:` subsections.

## Current State Analysis

### Existing Implementation

**Plan Template Structure** (src/prompts/plan.md:56-137):
The template provides an example markdown structure that agents should follow when creating plan.md files. The current structure includes:

```markdown
# {{title}} Implementation Plan

## Overview
[Content]

## Current State Analysis
[Content]  ← ❌ Should be "Current State"

## Desired End State
[Content]

### Key Discoveries:
[Content]

## What We're NOT Doing
[Content]

## Implementation Approach
[Content]

---

## Phase 1: [Descriptive Name]  ← ❌ Should be wrapped in "## Phases" section
### Overview
[Content]
...

## Phase 2: [Descriptive Name]
...

---

## Testing Strategy
[Content]
```

**Validator Requirements** (src/domain/validation.ts:495-608):
The validator defines exact requirements in `DEFAULT_PLAN_QUALITY_OPTIONS` (lines 495-508):

- Required sections: ["Header", "Implementation Plan Title", "Overview", "Current State", "Desired End State", "What We're NOT Doing", "Implementation Approach", "Phases", "Testing Strategy"]
- Minimum phases: 1

The validator uses two key functions:

1. **`findMissingPlanSections()`** (lines 537-559): Uses regex pattern `^#+\\s*${section.toLowerCase()}\\s*$` to match section headers. This pattern requires exact matches - extra words cause failures.

2. **`countPhases()`** (lines 517-528): Extracts content between "## Phases" and "## Testing Strategy" sections using `extractSectionContent()`, then counts `###` headers within that content. Without a "## Phases" section, this returns 0.

### Key Files

- **src/prompts/plan.md:56-137** - Example plan.md structure template
  - Line 57: `# {{title}} Implementation Plan` - Header (valid)
  - Line 59: `## Overview` - Overview section (valid)
  - Line 62: `## Current State Analysis` - ❌ Should be `## Current State`
  - Line 65: `## Desired End State` - Desired end state section (valid)
  - Line 73: `## What We're NOT Doing` - Scope section (valid)
  - Line 76: `## Implementation Approach` - Approach section (valid)
  - Line 81: `## Phase 1: [Descriptive Name]` - ❌ Should be wrapped in `## Phases` container
  - Line 113: `## Phase 2: [Descriptive Name]` - ❌ Same issue
  - Line 118: `## Testing Strategy` - Testing section (valid)
  - ❌ Missing: `## Implementation Plan Title` section entirely

- **src/domain/validation.ts:495-508** - DEFAULT_PLAN_QUALITY_OPTIONS
  - Line 496: minPhases: 1
  - Lines 498-507: Required sections array defining exact section names needed

- **src/domain/validation.ts:517-528** - countPhases() function
  - Line 519: Calls `extractSectionContent(content, "Phases", "Testing Strategy")`
  - Line 525: Counts `###` headers within the extracted phases section
  - Returns 0 if no "## Phases" section exists

- **src/domain/validation.ts:537-559** - findMissingPlanSections() function
  - Line 552: Regex pattern `^#+\\s*${section.toLowerCase()}\\s*$` for matching
  - Requires exact section name match (case-insensitive but exact words)

- **src/__tests__/plan-quality.test.ts:8-23** - Test configuration showing expected structure
  - Lines 12-22: Default options showing all required sections
  - Lines 27-60: Valid example with `## Implementation Plan Title` and `## Phases` container

- **src/__tests__/plan-quality.test.ts:355-401** - Real-world valid plan example
  - Line 357: `# Implementation Plan: Add User Authentication` - Header
  - Line 360: `## Implementation Plan Title` - Required section present
  - Line 366: `## Current State` - Correct section name (not "Current State Analysis")
  - Line 378: `## Phases` - Container section present
  - Line 380: `### Phase 1: Database Schema` - Phase as ### (level 3) header
  - Line 392: `## Testing Strategy` - End of phases section

## Technical Considerations

### Dependencies

- **Template loading system**: The plan.md template is loaded via `src/prompts.ts:33-36` (`getDefaultTemplate()`) and rendered with variables via `renderPrompt()` (lines 55-95). Changes to the template file will automatically be used when agents run the plan phase.

- **Validation pipeline**: Plans are validated when transitioning to the "planned" state via `canEnterPlanned()` in `src/domain/validation.ts:41-51`, which calls `validatePlanQuality()`. The validator logic is out of scope for this fix.

- **Test coverage**: Comprehensive tests exist in `src/__tests__/plan-quality.test.ts` that will validate the fix works correctly. The tests show valid plan structures that pass validation.

### Patterns to Follow

**Section Header Pattern**: The validator uses case-insensitive matching but requires exact words. Section headers must match exactly (no extra words like "Analysis" after "Current State"). The regex pattern `^#+\\s*${section.toLowerCase()}\\s*$` allows:
- Any heading level (# or ## or ###)
- Case-insensitive matching
- Optional trailing whitespace
- But NO extra words

**Phase Structure Pattern**: Based on test examples (plan-quality.test.ts:48-53, 85-94, 378-391):
- Must have `## Phases` container section (level 2 header)
- Individual phases use `### Phase X: [Description]` (level 3 headers)
- Phase content follows until next phase or end of section
- "## Testing Strategy" marks the end of the phases section

**Template Variable Pattern**: The plan.md template uses Mustache-style variables like `{{title}}`, `{{id}}`, etc. (plan.md:6-12). The example structure in lines 56-137 should show the literal section headers that will appear in generated plans, not template variables.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking existing user plans that use the old template | Medium | Users can override the template locally; the fix only affects new plans. Existing plans that were already manually corrected will continue to work. |
| Agents may not follow the updated template precisely | Low | The template is explicit instruction; agents follow templates closely. The fix makes the template match what's actually required. |
| Missing "Key Discoveries" subsection | Low | The "Key Discoveries" subsection (line 68 in current template) is not a required section per the validator. It can be kept as optional content within sections. |
| Phase numbering or format confusion | Low | The template clearly shows `### Phase 1: [Descriptive Name]` format. Tests confirm this format works with the validator. |

## Recommended Approach

The fix requires updating the example plan.md structure in `src/prompts/plan.md` (lines 56-137) with the following changes:

1. **Add "Implementation Plan Title" section** after the header:
   ```markdown
   # {{title}} Implementation Plan

   ## Implementation Plan Title
   [Brief, descriptive title for this implementation plan]

   ## Overview
   ...
   ```

2. **Rename "Current State Analysis" to "Current State"**:
   ```markdown
   ## Current State
   [What exists now, what's missing, key constraints discovered]
   ```

3. **Add "## Phases" container section** and convert phase headers to level 3:
   ```markdown
   ## Phases

   ### Phase 1: [Descriptive Name]
   ### Overview
   [What this phase accomplishes]

   ### Changes Required:
   ...

   ### Success Criteria:
   ...

   ### Phase 2: [Descriptive Name]
   ...
   ```

4. **Keep optional "Key Discoveries" subsection** as it doesn't conflict with validation (it's content within "Desired End State" section, not a separate section header).

5. **Preserve all other content** (success criteria, verification steps, etc.) as they are valuable guidance.

The updated template structure should match the valid examples shown in the test suite (plan-quality.test.ts:27-60, 355-401) to ensure plans generated from it will pass validation.

## Open Questions

None. The fix is straightforward:
- The validator requirements are clearly defined in `src/domain/validation.ts:495-508`
- The test suite provides multiple examples of valid plan structures
- The current template's issues are identifiable and fixable with minimal changes
- No changes to validator logic or other components are needed
- The fix is isolated to the template file as specified in scope
