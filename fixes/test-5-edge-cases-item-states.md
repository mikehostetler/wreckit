# Fix Group 5: Edge Cases - Item States & Artifacts

## Failing Tests (2 tests)

| Test File                        | Test Name                                                            |
| -------------------------------- | -------------------------------------------------------------------- |
| `edge-cases/item-states.test.ts` | Test 48: Empty PRD or no stories > getNextPhase works with empty PRD |
| `edge-cases/item-states.test.ts` | Test 50: State transitions > implementing state allows pr phase      |

## Root Cause

Same as Group 4 - likely Logger mock or config schema issues affecting the test setup.

## Fix Strategy

1. Update Logger mock to include `json` method
2. Update any config fixtures to use new schema
3. Review `getNextPhase` function signature

## Files to Update

1. `src/__tests__/edge-cases/item-states.test.ts` (or similar)

## Verification

```bash
bun test src/__tests__/edge-cases/
```
