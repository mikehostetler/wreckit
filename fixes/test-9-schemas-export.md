# Fix Group 9: Schema Export Error

## Error

```
SyntaxError: Export named 'WorkflowStateSchema' not found in module '/Users/mhostetler/Source/Wreckit/jmanhype-wreckit/src/schemas.ts'.
```

This is listed as an "unhandled error between tests" which means `src/__tests__/schemas.test.ts` fails to even load.

## Root Cause

The test imports `WorkflowStateSchema` from `src/schemas.ts`, but this export no longer exists.

Possible causes:

1. The schema was renamed
2. The schema was moved to a different file
3. The schema was removed

## Fix Strategy

1. Check what's exported from `src/schemas.ts`
2. Update the import in the test file to use the correct export name
3. Or remove the test if the schema no longer exists

## Files to Update

1. `src/__tests__/schemas.test.ts`

## Verification

```bash
bun test src/__tests__/schemas.test.ts
```
