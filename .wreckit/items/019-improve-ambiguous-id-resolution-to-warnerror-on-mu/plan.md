# Improve Ambiguous ID Resolution Implementation Plan

## Implementation Plan Title
Improve Ambiguous ID Resolution with Warn/Error on Multiple Matches

## Overview
This item implements the full ID resolution logic specified in spec 009-cli.md, addressing "Gap 3: Ambiguous ID Resolution". The current implementation only supports numeric shorthand. The new implementation will support exact match, numeric prefix match, and slug suffix match, while detecting and erroring on ambiguous inputs.

## Current State
- `resolveId` only supports numeric shorthand (1-based index).
- No support for full ID or slug suffix matching.
- No detection of ambiguous matches (first match wins).
- `scanItems` and `parseItemId` are available in `indexing.ts`.

### Key Discoveries
- `src/domain/resolveId.ts` needs a complete rewrite.
- `src/errors.ts` needs a new `AmbiguousIdError` class.
- Resolution order: Exact -> Numeric -> Slug.
- Ambiguity should trigger an error with a list of matches.

## Desired End State
- `resolveId` supports full ID, numeric prefix, and slug suffix.
- Ambiguous inputs throw an `AmbiguousIdError` listing all matches.
- Users receive clear feedback on how to disambiguate.

## What We're NOT Doing
- Implementing fuzzy matching or Levenshtein distance.
- Changing the CLI command interface (signatures remain the same).
- Implementing interactive selection (TUI prompts) for ambiguous IDs in this phase.

## Implementation Approach
1.  Define `AmbiguousIdError` in `src/errors.ts`.
2.  Rewrite `resolveId` in `src/domain/resolveId.ts` to use `scanItems` and implement the three-tier matching logic.
3.  Add helper functions for numeric prefix and slug suffix matching.
4.  Implement ambiguity checks at each tier.
5.  Update tests in `src/__tests__/domain/resolveId.test.ts` to cover all scenarios.

---

## Phases

### Phase 1: Error Type and Core Logic

#### Overview
Define the new error type and implement the resolution logic with ambiguity detection.

#### Changes Required:

##### 1. New Error Type
**File**: `src/errors.ts`
**Changes**: Add `AmbiguousIdError` class extending `WreckitError`.

```typescript
export class AmbiguousIdError extends WreckitError {
  constructor(input: string, matches: string[]) {
    // ...
  }
}
```

##### 2. ID Resolution Logic
**File**: `src/domain/resolveId.ts`
**Changes**: Rewrite `resolveId` to use `scanItems` and implement matching tiers.

```typescript
export async function resolveId(root: string, input: string): Promise<string> {
  // ... implementation ...
}
```

#### Success Criteria:

##### Automated Verification:
- [ ] `bun run build` succeeds.
- [ ] New tests in `src/__tests__/domain/resolveId.test.ts` pass.

##### Manual Verification:
- [ ] `wreckit show <ambiguous-slug>` prints error with candidates.
- [ ] `wreckit show <numeric-prefix>` works for unique prefix.

---

### Phase 2: Testing and Refinement

#### Overview
Add comprehensive tests to ensure robust resolution and proper error handling.

#### Changes Required:

##### 1. Update Tests
**File**: `src/__tests__/domain/resolveId.test.ts`
**Changes**: Add test cases for:
- Exact match
- Unique numeric match
- Ambiguous numeric match
- Unique slug match
- Ambiguous slug match
- No match

#### Success Criteria:

##### Automated Verification:
- [ ] All tests pass: `bun test src/__tests__/domain/resolveId.test.ts`

---

## Testing Strategy
### Unit Tests
- Test exact ID matching.
- Test numeric prefix matching (single and multiple matches).
- Test slug suffix matching (single and multiple matches).
- Test ambiguity error reporting.
- Test "not found" error.

### Integration Tests
- Verify CLI commands use the new resolution logic correctly (via manual verification or existing integration tests).

## Migration Notes
- This is a logic update; no data migration is required.
- Users relying on the undocumented "index-based" behavior (e.g., `wreckit show 1` meaning the first item in the list regardless of ID) might see changes if `1` now strictly matches `001-` prefix. The numeric prefix behavior is generally consistent but stricter.

## References
- `specs/009-cli.md`
- `src/domain/resolveId.ts`
- `src/errors.ts`
