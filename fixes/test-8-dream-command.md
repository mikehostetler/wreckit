# Fix Group 8: Dream Command Tests

## Failing Tests (3 tests)

| Test File                     | Test Name                                 |
| ----------------------------- | ----------------------------------------- |
| `dream.test.ts`               | should ignore case and special characters |
| `dream.test.ts` (integration) | should run the agent and save ideas       |
| `dream.test.ts` (integration) | should enforce [DREAMER] prefix           |

## Root Cause

### Similarity Detection Test

```typescript
expect(calculateSimilarity("[DREAMER] Fix bug", "fix bug")).toBeGreaterThan(
  0.9,
);
// Expected: > 0.9
// Received: 0
```

The `calculateSimilarity` function returns 0 for strings that should be similar after normalization. The normalization may not be stripping `[DREAMER]` prefix correctly.

### Integration Tests

Agent mock or setup issues - similar to other agent tests.

## Fix Strategy

### 8a. Fix Similarity Calculation

The `calculateSimilarity` function needs to properly normalize strings:

1. Strip `[DREAMER]` prefix
2. Lowercase
3. Remove special characters

Check implementation in `src/commands/dream.ts` or similar.

### 8b. Fix Integration Tests

Update mocks/fixtures for agent integration.

## Files to Update

1. `src/commands/__tests__/dream.test.ts`
2. Possibly `src/commands/dream.ts` if the implementation is buggy

## Verification

```bash
bun test src/commands/__tests__/dream.test.ts
```
