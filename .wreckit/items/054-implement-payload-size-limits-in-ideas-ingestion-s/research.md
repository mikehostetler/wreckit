# Research: Implement payload size limits in ideas ingestion (spec 001 gap)

**Date**: 2025-01-26
**Item**: 054-implement-payload-size-limits-in-ideas-ingestion-s

## Research Question
From milestone [M2] Payload Size Limits Enforcement

**Motivation:** Strategic milestone: Payload Size Limits Enforcement

## Summary

The implementation of payload size limits in ideas ingestion is **already complete** in the codebase. The validation logic, error handling, and test coverage are fully implemented in `/Users/speed/wreckit/src/domain/validation.ts` (lines 115-236) and integrated into the ideas ingestion workflow via `parseIdeasWithAgent()` in `/Users/speed/wreckit/src/domain/ideas-agent.ts:107` and `runIdeaInterview()` in `/Users/speed/wreckit/src/domain/ideas-interview.ts:266`.

The implementation follows the specification in `specs/001-ideas-ingestion.md` (lines 191-203) which defines the recommended limits as a gap that should be enforced. The limits are: maximum 50 ideas per ingestion, 120 character titles, 2000 character descriptions, 20 success criteria items, and 100 KB total payload size.

However, there's a critical difference in how violations are handled between the two ingestion paths. The document/file parsing path (`parseIdeasWithAgent`) **throws** a `PayloadValidationError` when limits are exceeded (fail-fast behavior), while the interview path (`runIdeaInterview`) only logs warnings and returns an empty array (fail-soft behavior). This inconsistency should be addressed to ensure uniform security posture across all ingestion modes.

## Current State Analysis

### Existing Implementation

The payload size limits are **already fully implemented** with comprehensive validation:

1. **Validation Logic** (`src/domain/validation.ts:115-236`):
   - `PAYLOAD_LIMITS` constant defines all limits (line 119-125)
   - `validatePayloadLimits()` function performs comprehensive validation (line 189-220)
   - `assertPayloadLimits()` wrapper throws `PayloadValidationError` on violations (line 229-235)
   - Validates individual idea limits (title, description, success criteria)
   - Validates aggregate limits (total ideas count, total payload size in bytes)

2. **Integration Points**:
   - **Document/File Parsing**: `src/domain/ideas-agent.ts:107` - calls `assertPayloadLimits()` which throws on violation
   - **Interview Mode**: `src/domain/ideas-interview.ts:266` - calls `assertPayloadLimits()` but catches errors and returns empty array

3. **Error Handling** (`src/errors.ts:170-175`):
   - `PayloadValidationError` class defined with error code `PAYLOAD_VALIDATION`
   - Properly integrated into the error handling system

4. **Test Coverage** (`src/__tests__/payload-validation.test.ts`):
   - 415 lines of comprehensive test coverage
   - Tests for all limit types (idea count, title length, description length, success criteria, total size)
   - Tests for boundary conditions (exact limits, one over limit)
   - Tests for multiple violations and edge cases

### Current Patterns and Conventions

1. **Validation Pattern**: The codebase uses a two-tier validation approach:
   - `validatePayloadLimits()` - returns validation result object (non-throwing)
   - `assertPayloadLimits()` - throws exception on failure (convenience wrapper)

2. **Error Handling Pattern**:
   - Custom error classes extend `WreckitError` with error codes
   - Error messages are formatted with bullet points for readability
   - Error codes are defined in `ErrorCodes` constant

3. **Integration Pattern**:
   - Validation happens **after** agent parsing but **before** persistence
   - This ensures malformed payloads are rejected early in the pipeline
   - Follows the principle of failing fast on invalid input

### Integration Points

1. **Direct Integration**:
   - `src/domain/ideas-agent.ts:107` - Document/file ingestion path
   - `src/domain/ideas-interview.ts:266` - Interview ingestion path

2. **Transitive Dependencies**:
   - `src/commands/ideas.ts:88-188` - Main CLI command orchestrator
   - `src/agent/mcp/ideasMcpServer.ts` - MCP server that captures ideas
   - `src/domain/ideas.ts:299-358` - Persistence layer

## Key Files

### Core Implementation
- `src/domain/validation.ts:115-236` - **Complete implementation** of payload size limits including:
  - `PAYLOAD_LIMITS` constant (lines 119-125)
  - `validateSingleIdea()` helper (lines 145-173)
  - `validatePayloadLimits()` main validation (lines 189-220)
  - `assertPayloadLimits()` throwing wrapper (lines 229-235)

### Integration Points
- `src/domain/ideas-agent.ts:107` - Calls `assertPayloadLimits()` for document/file parsing
- `src/domain/ideas-interview.ts:264-272` - Calls `assertPayloadLimits()` for interview mode with try-catch

### Error Handling
- `src/errors.ts:170-175` - `PayloadValidationError` class definition
- `src/errors.ts:26` - Error code `PAYLOAD_VALIDATION` in ErrorCodes enum

### Testing
- `src/__tests__/payload-validation.test.ts:1-415` - **Comprehensive test suite** covering:
  - Valid payloads (lines 12-107)
  - Idea count violations (lines 109-130)
  - Title length violations (lines 132-159)
  - Description length violations (lines 161-188)
  - Success criteria violations (lines 190-218)
  - Total payload size violations (lines 220-260)
  - Multiple violations (lines 262-294)
  - Edge cases (lines 296-343)
  - `assertPayloadLimits` behavior (lines 345-414)

### Specification
- `specs/001-ideas-ingestion.md:191-203` - **Spec defines this as a gap**: "Payload Size Limits (Recommended)" section lists limits as "should be enforced"
- `specs/001-ideas-ingestion.md:305` - Implementation status table shows: "Payload size limits" as "❌ Not Implemented" with note "Recommended limits not enforced"

### Milestone Context
- `ROADMAP.md:17-27` - **Milestone [M2] Payload Size Limits Enforcement** objectives:
  - "Implement payload size limits in ideas ingestion (spec 001 gap)" ← **This item**
  - "Add validation: max 50 ideas, 120 char titles, 2000 char descriptions, 20 success criteria, 100 KB total" ← Already implemented
  - "Add informative error messages when limits exceeded" ← Item 056 (depends on this)
  - "Document limits in README.md and CLI help text" ← Item 057 (depends on 056)
  - "Add unit tests for boundary conditions" ← Item 058 (depends on 057)

### Related Items (Dependency Chain)
- `.wreckit/items/055-add-validation-max-50-ideas-120-char-titles-2000-c/item.json` - **Depends on item 054** (this item)
- `.wreckit/items/056-add-informative-error-messages-when-limits-exceede/item.json` - Depends on item 055
- `.wreckit/items/057-document-limits-in-readmemd-and-cli-help-text/item.json` - Depends on item 056
- `.wreckit/items/058-add-unit-tests-for-boundary-conditions/item.json` - Depends on item 057

## Technical Considerations

### Dependencies
- **External**: None - uses only standard library (JSON.stringify for size calculation)
- **Internal**:
  - `src/schemas.ts` - `ParsedIdea` type for validation
  - `src/errors.ts` - `PayloadValidationError` for error handling

### Patterns to Follow
1. **Fail-Fast Validation**: Validate early in the pipeline before expensive operations
2. **Comprehensive Error Messages**: Include actual vs expected values in error messages
3. **Two-Tier API**: Provide both throwing (`assert*`) and non-throwing (`validate*`) variants
4. **Const-Based Limits**: Define limits as constants for easy modification and testing
5. **Byte Size Calculation**: Use `JSON.stringify().length` for accurate size measurement

### Critical Finding: Inconsistent Error Handling

**Issue**: The two ingestion paths handle payload violations differently:

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

**Recommendation**: Unify the error handling to make interview mode also throw `PayloadValidationError`. This provides consistent security posture and clearer user feedback.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Spec is outdated** - Spec says "not implemented" but feature exists | Low | The spec implementation status table (`specs/001-ideas-ingestion.md:305`) should be updated to reflect reality. This is a documentation gap, not a code gap. |
| **Inconsistent error handling** between ingestion paths | Medium | Unify the error handling approach. Make interview mode throw errors like document mode does, or document why the difference exists. |
| **Test coverage may not reflect current limits** | Low | Tests are comprehensive and match the limits in `PAYLOAD_LIMITS` constant. No action needed. |
| **Byte size calculation accuracy** | Low | Using `JSON.stringify().length` is accurate for the serialized representation that matters for storage/transmission. |
| **Limits may be too restrictive** for legitimate use cases | Medium | The limits are configurable via the `PAYLOAD_LIMITS` constant. Could make them configurable via config.json in future if needed. |
| **No validation at MCP tool level** | Medium | The Zod schema in `ideasMcpServer.ts:9-23` validates individual fields but not aggregate limits (total count, total size). The MCP tool accepts any array, then validation happens after. This is acceptable design (separation of concerns). |

## Recommended Approach

### Status: Feature Already Implemented

**Finding**: The core payload size limit validation is **fully implemented and operational**. The item description "Implement payload size limits in ideas ingestion (spec 001 gap)" appears to be outdated - the gap has been filled.

### Recommended Actions

1. **Update Implementation Status in Spec**:
   - Update `specs/001-ideas-ingestion.md:305` to mark "Payload size limits" as "✅ Implemented"
   - Change note from "Recommended limits not enforced" to "Enforced in `src/domain/validation.ts`"

2. **Address Error Handling Inconsistency**:
   - Remove the try-catch block in `src/domain/ideas-interview.ts:264-272`
   - Let interview mode throw `PayloadValidationError` like document mode does
   - This provides consistent security and user experience

3. **Verify Downstream Dependencies**:
   - Item 055 "Add validation..." may need to be updated or marked as done
   - Check if items 056-058 in the dependency chain are still relevant

4. **Consider Enhanced Validation** (optional future work):
   - Add validation at MCP tool level for earlier rejection
   - Make limits configurable via `config.json`
   - Add metrics/monitoring for how often limits are hit

### Implementation Verification Checklist

- [x] Validation logic exists (`src/domain/validation.ts:115-236`)
- [x] Limits defined as constants (`PAYLOAD_LIMITS`)
- [x] Integration in document path (`src/domain/ideas-agent.ts:107`)
- [x] Integration in interview path (`src/domain/ideas-interview.ts:266`)
- [x] Error class defined (`PayloadValidationError`)
- [x] Comprehensive test suite (`src/__tests__/payload-validation.test.ts`)
- [ ] **Consistent error handling** (interview path should throw, not catch)
- [ ] **Updated spec status** (mark as implemented)

## Open Questions

1. **Why the error handling inconsistency?**
   - Was the try-catch in interview mode intentional (to avoid disrupting user interviews)?
   - Or was it an oversight that should be fixed?
   - **Recommendation**: Ask stakeholders if interview mode should fail-fast like document mode

2. **Are downstream items still relevant?**
   - Item 055 "Add validation..." - validation already exists
   - Item 056 "Add informative error messages" - current messages are already informative
   - Item 057 "Document limits" - this is still needed
   - Item 058 "Add unit tests" - tests already exist
   - **Recommendation**: Review items 055-058 and update scope or close as appropriate

3. **Should limits be configurable?**
   - Current implementation hardcodes limits in `PAYLOAD_LIMITS` constant
   - Could add to `config.json` for flexibility
   - **Recommendation**: Defer - hard limits are appropriate for security; make configurable only if users request it

4. **Should we validate at MCP tool level?**
   - Current: MCP tool accepts any array, validation happens after
   - Alternative: Add aggregate validation to Zod schema at tool level
   - **Recommendation**: Current approach is fine (separation of concerns); MCP validates schema, business logic validates limits

## Conclusion

The payload size limits feature is **already implemented and operational** in the codebase. The validation logic, error handling, and test coverage are comprehensive. The primary work remaining is:

1. **Documentation**: Update the spec to reflect current implementation status
2. **Consistency**: Unify error handling between document and interview ingestion paths
3. **Dependency Chain**: Review and update downstream items (055-058) to account for completed work

This item (054) should either be:
- **Closed** as "already implemented" with documentation updates
- **Re-scoped** to focus on the error handling consistency issue and spec updates
