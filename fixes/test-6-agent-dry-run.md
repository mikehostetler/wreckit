# Fix Group 6: Agent Dry-Run Mode Tests

## Failing Tests (9 tests)

| Test File                     | Test Name                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------- |
| `runCodexSdkAgent.test.ts`    | dry-run mode > logs tool restrictions when allowedTools provided                |
| `runCodexSdkAgent.test.ts`    | getEffectiveToolAllowlist resolution > prefers explicit allowedTools over phase |
| `runCodexSdkAgent.test.ts`    | getEffectiveToolAllowlist resolution > falls back to phase-based allowlist      |
| `runAmpSdkAgent.test.ts`      | dry-run mode > logs tool restrictions when allowedTools provided                |
| `runAmpSdkAgent.test.ts`      | getEffectiveToolAllowlist resolution > prefers explicit allowedTools over phase |
| `runAmpSdkAgent.test.ts`      | getEffectiveToolAllowlist resolution > falls back to phase-based allowlist      |
| `runOpenCodeSdkAgent.test.ts` | dry-run mode > logs tool restrictions when allowedTools provided                |
| `runOpenCodeSdkAgent.test.ts` | getEffectiveToolAllowlist resolution > prefers explicit allowedTools over phase |
| `runOpenCodeSdkAgent.test.ts` | getEffectiveToolAllowlist resolution > falls back to phase-based allowlist      |

## Root Cause

1. Logger mock missing `json` method
2. Function signature or behavior changes for `getEffectiveToolAllowlist`
3. Possible changes to how dry-run mode logs information

## Fix Strategy

1. Update Logger mock with `json` method
2. Review `getEffectiveToolAllowlist` implementation for changes
3. Update test expectations to match current behavior

## Files to Update

1. `src/__tests__/runCodexSdkAgent.test.ts` (or similar path)
2. `src/__tests__/runAmpSdkAgent.test.ts`
3. `src/__tests__/runOpenCodeSdkAgent.test.ts`

## Verification

```bash
bun test --grep "dry-run mode"
bun test --grep "getEffectiveToolAllowlist"
```
