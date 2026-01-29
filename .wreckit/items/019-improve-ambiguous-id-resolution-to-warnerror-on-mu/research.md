# Research: Improve ambiguous ID resolution to warn/error on multiple matches (spec 009 Gap 3)

**Date**: 2026-01-24
**Item**: 019-improve-ambiguous-id-resolution-to-warnerror-on-mu

## Research Question
From milestone [M3] Robust Error Handling and Recovery

**Motivation:** Strategic milestone: Robust Error Handling and Recovery

## Summary

The current ID resolution system in `src/domain/resolveId.ts` only supports numeric shorthand IDs (e.g., `1`, `2`, `3`) and returns the first match by sequential index. According to spec 009-cli.md, the system should support three ID formats: full ID, numeric prefix, and slug suffix matching. The spec explicitly identifies "Gap 3: Ambiguous ID Resolution" where slug suffix matching can be ambiguous if multiple items share a suffix, potentially selecting the wrong item.

The fix requires implementing the full ID resolution logic as specified (exact match, numeric prefix, slug suffix), adding ambiguity detection when multiple items match a pattern, and either warning the user (for non-critical operations) or erroring (for destructive operations) when ambiguous matches occur. The resolution should list all matching items to help the user disambiguate.

The current implementation is minimal and only handles numeric short IDs by position in the list (1 = first item, 2 = second item), which is documented in the `buildIdMap` and `resolveId` functions. The spec calls for richer matching including exact ID match, numeric prefix match (e.g., `001` or `1` matching items starting with `001-`), and slug suffix match (e.g., `dark-mode` matching items ending with `-dark-mode`).

## Current State Analysis

### Existing Implementation
- **`src/domain/resolveId.ts:20-34`** - The `resolveId` function only handles numeric IDs (1, 2, 3...) by converting them to indexes into the item list
- **`src/domain/resolveId.ts:10-18`** - The `buildIdMap` function creates a sequential mapping from shortId (1-based index) to fullId
- **`src/domain/indexing.ts:48-84`** - The `scanItems` function scans items and sorts them by numeric prefix
- **`src/domain/indexing.ts:15-25`** - The `parseItemId` function parses IDs into number and slug components using the pattern `/^(\d+)-(.+)$/`

### Key Files
- `src/domain/resolveId.ts:1-35` - Core ID resolution logic (currently only supports numeric shorthand)
- `src/__tests__/domain/resolveId.test.ts:1-109` - Test suite for resolveId (only tests numeric resolution)
- `src/domain/indexing.ts:1-117` - Item scanning and indexing utilities
- `src/index.ts:22,187,213,245,277,309,340,368,402` - CLI commands that use `resolveId` for ID arguments
- `specs/009-cli.md:99-116` - Specification for ID resolution with three format types
- `specs/009-cli.md:326-333` - Gap 3 documentation describing the ambiguity issue
- `src/errors.ts:1-122` - Error type definitions (may need new error type for ambiguous ID)
- `src/logging.ts:1-121` - Logger interface with warn/error methods

### How resolveId is Used
The `resolveId` function is called from `src/index.ts` in multiple places:
- `show <id>` command (line 187)
- `research <id>` command (line 213)
- `plan <id>` command (line 245)
- `implement <id>` command (line 277)
- `pr <id>` command (line 309)
- `complete <id>` command (line 340)
- `rollback <id>` command (line 368)
- `run <id>` command (line 402)

All these commands follow the pattern:
```typescript
const resolvedId = await resolveId(root, id);
```

## Technical Considerations

### Dependencies
- `src/domain/indexing.ts` - `scanItems` function to enumerate all items
- `src/domain/indexing.ts` - `parseItemId` function to extract number and slug from IDs
- `src/errors.ts` - For creating new error types (if needed)
- `src/logging.ts` - For warning output (if warning rather than error)

### ID Resolution Logic (from spec 009-cli.md:99-116)

| Format | Example | Matches |
|--------|---------|---------|
| Full ID | `001-add-dark-mode` | Exact match |
| Numeric prefix | `1` or `001` | First item starting with `001-` |
| Slug suffix | `add-dark-mode` | First item ending with `-add-dark-mode` |

The resolution order specified is:
1. Try exact match against item IDs
2. Try numeric prefix match (zero-padded)
3. Try slug suffix match
4. Return error if no match or **ambiguous**

### Patterns to Follow

1. **Error pattern from `src/errors.ts`** - Use `WreckitError` with specific error codes:
   ```typescript
   export class WreckitError extends Error {
     constructor(message: string, public code: string) { ... }
   }
   ```

2. **Existing resolution error pattern** - Current throws from `resolveId.ts:23` and `resolveId.ts:30`:
   ```typescript
   throw new Error(`Invalid item ID: ${input}. Use a number...`);
   throw new Error(`Item #${num} not found. Use 'wreckit list'...`);
   ```

3. **CLI error handling pattern from `src/cli-utils.ts:27-42`**:
   ```typescript
   if (isWreckitError(error)) {
     logger.error(`[${error.code}] ${error.message}`);
   }
   ```

4. **Logger warning pattern** - The `Logger` interface in `src/logging.ts:9` has a `warn` method:
   ```typescript
   warn(message: string, ...args: unknown[]): void;
   ```

### Suggested New Error Type
A new error type could be added to `src/errors.ts`:
```typescript
export class AmbiguousIdError extends WreckitError {
  constructor(
    input: string,
    matches: string[],
  ) {
    const matchList = matches.map(id => `  - ${id}`).join('\n');
    super(
      `Ambiguous ID '${input}' matches multiple items:\n${matchList}\nUse the full ID to specify which item.`,
      "AMBIGUOUS_ID"
    );
    this.name = "AmbiguousIdError";
  }
}
```

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking change for users relying on first-match behavior | Medium | Add verbose logging showing which item was selected, consider a config option for "strict" mode |
| Performance impact from scanning all items multiple times | Low | Current `scanItems` already loads all items; cache results within single resolution call |
| Backward compatibility with existing workflows | Medium | Default to error for ambiguous matches (safer), document migration path |
| Test coverage gaps | Low | Add comprehensive tests for all three resolution formats and ambiguity scenarios |

## Recommended Approach

### Phase 1: Implement Full Resolution Logic
1. Update `resolveId` to implement the three-tier matching:
   - Exact match (full ID)
   - Numeric prefix match (with zero-padding normalization)
   - Slug suffix match
2. Collect all matches at each tier before returning

### Phase 2: Add Ambiguity Detection
1. After finding matches, check if more than one item matched
2. For ambiguous matches:
   - Throw `AmbiguousIdError` with list of matching items
   - Include helpful message with full IDs to use

### Phase 3: Update Tests
1. Add tests for exact ID match
2. Add tests for numeric prefix match (with and without zero-padding)
3. Add tests for slug suffix match
4. Add tests for ambiguous match scenarios
5. Add tests for resolution priority order

### Implementation Sketch

```typescript
export interface ResolveResult {
  fullId: string;
  matchType: 'exact' | 'numeric' | 'slug';
  allMatches?: string[]; // For debugging/verbose mode
}

export async function resolveId(root: string, input: string): Promise<string> {
  const items = await scanItems(root);

  // 1. Exact match
  const exactMatch = items.find(i => i.id === input);
  if (exactMatch) return exactMatch.id;

  // 2. Numeric prefix match
  const numericMatches = findByNumericPrefix(items, input);
  if (numericMatches.length === 1) return numericMatches[0].id;
  if (numericMatches.length > 1) {
    throw new AmbiguousIdError(input, numericMatches.map(i => i.id));
  }

  // 3. Slug suffix match
  const slugMatches = findBySlugSuffix(items, input);
  if (slugMatches.length === 1) return slugMatches[0].id;
  if (slugMatches.length > 1) {
    throw new AmbiguousIdError(input, slugMatches.map(i => i.id));
  }

  // No matches
  throw new WreckitError(
    `Item not found: ${input}. Use 'wreckit list' to see available items.`,
    "ITEM_NOT_FOUND"
  );
}
```

## Open Questions

1. **Error vs Warning**: Should ambiguous matches always error, or should some operations (like `show`) just warn and pick the first match? The spec says "Return error if no match or ambiguous" which suggests erroring.

2. **Strict Mode Config**: Should there be a config option to allow first-match behavior for backward compatibility?

3. **Case Sensitivity**: Should slug suffix matching be case-sensitive or case-insensitive? The spec doesn't specify. Recommendation: case-insensitive for better UX.

4. **Partial Matches**: Should numeric prefix `1` match `001-...`, `010-...`, and `100-...`? Or only IDs where the numeric portion equals 1? The spec says "First item starting with `001-`" which suggests `1` should normalize to `001`.

5. **Zero-Padding Normalization**: How many digits to pad to? Current items use 3 digits (`001-`, `002-`). Should support variable-width padding based on existing items.
