# Implement payload size limits in ideas ingestion (spec 001 gap) Implementation Plan

## Implementation Plan Title

Unify error handling and update documentation for payload size limits validation in ideas ingestion.

## Overview

This item addresses the implementation gap identified in spec 001-ideas-ingestion.md regarding payload size limits. **The validation logic is already fully implemented** in the codebase. The primary work is to:

1. **Fix inconsistent error handling** between document/file parsing and interview ingestion paths
2. **Update spec documentation** to reflect the current implementation state

This is primarily a **consistency and documentation fix**, not a new feature implementation.

## Current State

### What Exists (Already Implemented)

The payload size limits feature is **fully operational** with comprehensive implementation:

1. **Validation Logic** (`src/domain/validation.ts:115-236`):
   - `PAYLOAD_LIMITS` constant defines all limits (line 119-125)
   - `validatePayloadLimits()` function performs comprehensive validation (line 189-220)
   - `assertPayloadLimits()` wrapper throws `PayloadValidationError` on violations (line 229-235)
   - Validates individual idea limits (title, description, success criteria)
   - Validates aggregate limits (total ideas count, total payload size in bytes)

2. **Integration Points**:
   - **Document/File Parsing**: `src/domain/ideas-agent.ts:107` - calls `assertPayloadLimits()` which **throws** on violation
   - **Interview Mode**: `src/domain/ideas-interview.ts:266` - calls `assertPayloadLimits()` but **catches errors and returns empty array**

3. **Error Handling** (`src/errors.ts:170-175`):
   - `PayloadValidationError` class defined with error code `PAYLOAD_VALIDATION`
   - Properly integrated into the error handling system

4. **Test Coverage** (`src/__tests__/payload-validation.test.ts`):
   - 415 lines of comprehensive test coverage
   - Tests for all limit types (idea count, title length, description length, success criteria, total size)
   - Tests for boundary conditions (exact limits, one over limit)
   - Tests for multiple violations and edge cases

### Critical Issue: Inconsistent Error Handling

The two ingestion paths handle payload violations differently:

1. **Document/File Path** (`src/domain/ideas-agent.ts:107`):
   ```typescript
   // Validate payload limits before returning
   assertPayloadLimits(capturedIdeas);
   return capturedIdeas;
   ```
   - **Behavior**: Throws `PayloadValidationError` (fail-fast)
   - **Security**: Strong - prevents malformed data from proceeding
   - **User Experience**: Process terminates with clear error

2. **Interview Path** (`src/domain/ideas-interview.ts:264-272`):
   ```typescript
   // Validate payload limits before returning
   try {
     assertPayloadLimits(capturedIdeas);
   } catch (error) {
     const err = error as Error;
     internalLogger.warn(`Warning: ${err.message}`);
     internalLogger.warn("Some ideas may not have been captured correctly.");
     return [];  // Returns empty array instead of throwing
   }
   ```
   - **Behavior**: Logs warning and returns empty array (fail-soft)
   - **Security**: Weaker - silently fails, potentially masking issues
   - **User Experience**: Returns no items but doesn't explain why (warning may be missed)

### Documentation Gap

The spec `specs/001-ideas-ingestion.md:305` incorrectly states:
```
| **Payload size limits** | ❌ Not Implemented | Recommended limits not enforced |
```

This is outdated - the limits are enforced and have comprehensive test coverage.

## Desired End State

### End State Specification

1. **Consistent Error Handling**: Both ingestion paths (document/file and interview) should handle payload violations identically - both should throw `PayloadValidationError` to maintain fail-fast security posture.

2. **Accurate Documentation**: The spec should reflect that payload size limits are implemented and operational.

3. **Downstream Items Review**: Items 055-058 in the dependency chain may need to be updated or closed since the underlying work they depend on is already complete.

### Verification

- [ ] Both ingestion paths throw `PayloadValidationError` on limit violations
- [ ] Test suite passes with updated error handling
- [ ] Spec `specs/001-ideas-ingestion.md:305` shows payload limits as "✅ Implemented"
- [ ] Downstream items (055-058) reviewed and updated

## Key Discoveries

- **Feature Already Implemented**: The core validation logic exists in `src/domain/validation.ts:115-236`
- **Comprehensive Tests**: 415 lines of test coverage in `src/__tests__/payload-validation.test.ts`
- **Integration Complete**: Both ingestion paths already call `assertPayloadLimits()`
- **Inconsistent Behavior**: Only difference is error handling (throw vs catch-and-return-empty)
- **Pattern to Follow**: The document/file path (`src/domain/ideas-agent.ts:107`) demonstrates the correct fail-fast pattern
- **Constraint**: The interview mode's try-catch was likely added to avoid disrupting user sessions, but this creates security inconsistency

## What We're NOT Doing

- **NOT implementing new validation logic** - it already exists
- **NOT adding new tests** - comprehensive test suite already exists
- **NOT changing the payload limits** - the current limits (50 ideas, 120 char titles, etc.) are appropriate
- **NOT making limits configurable** - hard limits are appropriate for security
- **NOT adding validation at MCP tool level** - current separation of concerns (MCP validates schema, business logic validates limits) is appropriate
- **NOT addressing social engineering prevention** - that's a separate milestone (M3)

## Implementation Approach

This is a **minimal fix** focused on consistency and documentation accuracy:

### Phase 1: Fix Error Handling Inconsistency
Remove the try-catch block in interview mode to match the fail-fast behavior of document/file parsing. This ensures uniform security posture across all ingestion modes.

### Phase 2: Update Spec Documentation
Mark the payload size limits as implemented in the spec's implementation status table.

### Phase 3: Review Downstream Dependencies
Evaluate items 055-058 to determine if they should be closed, re-scoped, or updated given that the core work is already complete.

---

## Phase 1: Fix Error Handling Inconsistency

### Overview
Unify error handling by removing the try-catch block in interview mode, making it consistent with document/file parsing. Both paths will now throw `PayloadValidationError` when limits are exceeded.

### Changes Required:

#### 1. Interview Mode Error Handling
**File**: `src/domain/ideas-interview.ts`
**Lines**: 264-272
**Changes**: Remove try-catch block, let `PayloadValidationError` propagate

Current code:
```typescript
  // Validate payload limits before returning
  try {
    assertPayloadLimits(capturedIdeas);
  } catch (error) {
    const err = error as Error;
    internalLogger.warn(`Warning: ${err.message}`);
    internalLogger.warn("Some ideas may not have been captured correctly.");
    return [];
  }
  internalLogger.info(`Captured ${capturedIdeas.length} idea(s)`);
  return capturedIdeas;
```

New code:
```typescript
  // Validate payload limits before returning
  assertPayloadLimits(capturedIdeas);
  internalLogger.info(`Captured ${capturedIdeas.length} idea(s)`);
  return capturedIdeas;
```

**Rationale**: This matches the pattern in `src/domain/ideas-agent.ts:107` and provides consistent security posture. The fail-fast behavior ensures users are immediately aware of payload issues rather than silently receiving empty results.

### Success Criteria:

#### Automated Verification:
- [ ] Tests pass: `npm test -- src/__tests__/payload-validation.test.ts`
- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`
- [ ] No test failures related to interview mode

#### Manual Verification:
- [ ] Run `wreckit ideas` (interactive interview) and provide input that exceeds limits
- [ ] Verify that `PayloadValidationError` is thrown with clear error message
- [ ] Verify that the error message includes specific details about which limits were exceeded
- [ ] Run `wreckit ideas --file test.txt` with a file exceeding limits
- [ ] Verify that both paths now throw the same error type
- [ ] Verify error messages are informative and actionable

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to next phase.

---

## Phase 2: Update Spec Documentation

### Overview
Update the implementation status table in the ideas ingestion spec to accurately reflect that payload size limits are implemented and operational.

### Changes Required:

#### 1. Update Implementation Status Table
**File**: `specs/001-ideas-ingestion.md`
**Lines**: 305
**Changes**: Mark payload size limits as implemented

Current markdown:
```markdown
| **Payload size limits** | ❌ Not Implemented | Recommended limits not enforced |
```

New markdown:
```markdown
| **Payload size limits** | ✅ Implemented | Enforced in `src/domain/validation.ts` |
```

**Rationale**: The feature is fully implemented with comprehensive tests and integration. The spec should reflect reality to avoid confusion.

### Success Criteria:

#### Automated Verification:
- [ ] No automated tests for documentation changes
- [ ] Manual review confirms accuracy

#### Manual Verification:
- [ ] View `specs/001-ideas-ingestion.md` and verify line 305 shows payload limits as "✅ Implemented"
- [ ] Verify the note accurately describes where the implementation lives
- [ ] Verify the spec renders correctly with markdown formatting

**Note**: Complete manual verification, then proceed to final phase.

---

## Phase 3: Review Downstream Dependencies

### Overview
Evaluate items 055-058 in the dependency chain to determine appropriate next steps given that the core validation work is already complete.

### Changes Required:

#### 1. Review and Update Downstream Items
**Files**:
- `.wreckit/items/055-add-validation-max-50-ideas-120-char-titles-2000-c/item.json`
- `.wreckit/items/056-add-informative-error-messages-when-limits-exceede/item.json`
- `.wreckit/items/057-document-limits-in-readmemd-and-cli-help-text/item.json`
- `.wreckit/items/058-add-unit-tests-for-boundary-conditions/item.json`

**Analysis Required**:

**Item 055** - "Add validation: max 50 ideas, 120 char titles, 2000 char descriptions, 20 success criteria, 100 KB total"
- **Status**: Already implemented in `src/domain/validation.ts`
- **Action**: Mark as done or close as redundant

**Item 056** - "Add informative error messages when limits exceeded"
- **Status**: Error messages are already informative (show actual vs expected values)
- **Action**: Review if additional message improvements are needed, or mark as done

**Item 057** - "Document limits in README.md and CLI help text"
- **Status**: Still relevant - limits should be documented in user-facing docs
- **Action**: Keep open, remove dependency on 055-056 if needed

**Item 058** - "Add unit tests for boundary conditions"
- **Status**: 415 lines of comprehensive tests already exist in `src/__tests__/payload-validation.test.ts`
- **Action**: Mark as done or close as redundant

### Success Criteria:

#### Automated Verification:
- [ ] No automated tests for item metadata changes

#### Manual Verification:
- [ ] Review each downstream item (055-058)
- [ ] Update item states or add notes explaining current status
- [ ] Ensure dependency chain is accurate
- [ ] Document decisions for each item

**Note**: This is a planning/documentation phase. No code changes expected.

---

## Testing Strategy

### Unit Tests:
- **No new tests needed** - existing 415-line test suite in `src/__tests__/payload-validation.test.ts` already covers:
  - All limit types (idea count, title length, description length, success criteria, total size)
  - Boundary conditions (exact limits, one over limit)
  - Multiple violations and edge cases
  - `assertPayloadLimits` throwing behavior

### Integration Tests:
- **Test interview mode with oversized payload**: Verify that `PayloadValidationError` is thrown (not caught and silenced)
- **Test document mode with oversized payload**: Verify existing behavior is unchanged (still throws)
- **Test both modes with valid payloads**: Verify normal operation is unaffected

### Manual Testing Steps:

1. **Test interview mode error handling**:
   ```bash
   wreckit ideas
   # Paste a huge description (>2000 chars) or provide >50 ideas
   # Expected: PayloadValidationError thrown with clear error message
   ```

2. **Test document mode error handling**:
   ```bash
   cat > huge-input.txt
   # [Paste content exceeding limits]
   wreckit ideas --file huge-input.txt
   # Expected: PayloadValidationError thrown with clear error message
   ```

3. **Verify error message quality**:
   ```bash
   # Both modes should show errors like:
   # Payload validation failed:
   #   - Idea #1: Description exceeds 2000 characters (2500 characters)
   #   - Too many ideas: maximum 50 ideas per ingestion, got 75
   ```

4. **Test valid payloads still work**:
   ```bash
   wreckit ideas
   # Provide a normal, valid idea
   # Expected: Item created successfully
   ```

## Migration Notes

### No Data Migration Required
This change does not affect item data, schema, or storage. It only affects runtime validation behavior.

### Backward Compatibility
- **Breaking Change**: Interview mode will now throw errors instead of silently returning empty arrays
- **Impact**: Users who relied on silent failure may now see errors
- **Mitigation**: This is a positive change - errors were always happening, but were being hidden. Users will now get clear feedback about what went wrong.

### Rollback Strategy
If issues arise, revert the changes to `src/domain/ideas-interview.ts:264-272` to restore the try-catch block. However, this is not recommended as it reintroduces security inconsistency.

## References

- Research: `/Users/speed/wreckit/.wreckit/items/054-implement-payload-size-limits-in-ideas-ingestion-s/research.md`
- Core Validation: `src/domain/validation.ts:115-236`
- Document Integration: `src/domain/ideas-agent.ts:107`
- Interview Integration: `src/domain/ideas-interview.ts:264-272`
- Error Class: `src/errors.ts:170-175`
- Test Suite: `src/__tests__/payload-validation.test.ts:1-415`
- Spec: `specs/001-ideas-ingestion.md:191-203, 305`
- Roadmap: `ROADMAP.md:17-27`
- Item 055: `.wreckit/items/055-add-validation-max-50-ideas-120-char-titles-2000-c/item.json`
- Item 056: `.wreckit/items/056-add-informative-error-messages-when-limits-exceede/item.json`
- Item 057: `.wreckit/items/057-document-limits-in-readmemd-and-cli-help-text/item.json`
- Item 058: `.wreckit/items/058-add-unit-tests-for-boundary-conditions/item.json`
