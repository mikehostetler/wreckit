# Fix Group 7: resolveId & buildIdMap Tests

## Failing Tests (10 tests)

| Category                | Test Name                                                          |
| ----------------------- | ------------------------------------------------------------------ |
| Exact match (Tier 1)    | resolves exact full ID match                                       |
| Numeric prefix (Tier 2) | resolves numeric ID to full ID                                     |
| Numeric prefix (Tier 2) | resolves zero-padded numeric ID to full ID                         |
| Slug suffix (Tier 3)    | resolves slug suffix to full ID                                    |
| Slug suffix (Tier 3)    | resolves slug suffix case-insensitively                            |
| Ambiguity detection     | throws AmbiguousIdError when numeric prefix matches multiple items |
| Ambiguity detection     | throws AmbiguousIdError when slug suffix matches multiple items    |
| Resolution priority     | prefers exact match over numeric prefix                            |
| Resolution priority     | prefers numeric prefix over slug suffix when both could match      |
| buildIdMap              | builds map with sequential short IDs                               |

## Root Cause

The tests are in a test file that likely has setup issues (Logger mock, etc.) or the `resolveId`/`buildIdMap` implementation changed.

## Fix Strategy

1. Check test file for mock setup issues
2. Verify `resolveId` and `buildIdMap` function signatures haven't changed
3. Update test fixtures as needed

## Files to Update

1. Locate test file (likely `src/__tests__/domain/` or `src/__tests__/resolveId.test.ts`)

## Verification

```bash
bun test --grep "resolveId"
bun test --grep "buildIdMap"
```
