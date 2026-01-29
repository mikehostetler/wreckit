# Fix Group 4: Workflow Phase Tests

## Failing Tests (14 tests)

| Test File          | Test Name                                                    |
| ------------------ | ------------------------------------------------------------ |
| `workflow.test.ts` | runPhaseImplement > transitions from planned to implementing |
| `workflow.test.ts` | runPhasePr > fails when not all stories done                 |
| `workflow.test.ts` | runPhasePr > succeeds when all stories done (stubbed)        |
| `workflow.test.ts` | runPhasePr > preflight/commit ordering bug (Gap 1) - 3 tests |
| `workflow.test.ts` | getNextPhase > implementing -> 'pr'                          |
| `workflow.test.ts` | runPhasePr - direct mode safeguards (Gap 4) - 5 tests        |

## Specific Direct Mode Safeguard Tests

- fails when direct mode enabled without explicit opt-in
- succeeds when direct mode enabled with explicit opt-in
- logs warning when direct mode is enabled with opt-in
- creates rollback anchor before direct merge
- cleans up branch after direct merge when cleanup enabled

## Root Cause

Multiple issues:

1. **Logger mock missing `json` method** - The mocked logger doesn't include the required `json` property
2. **Config schema changes** - Tests use old config format
3. **Workflow function signature changes** - Functions may have different parameters

## Fix Strategy

### 4a. Update Logger Mock

```typescript
const mockLogger: Logger = {
  info: mock(() => {}),
  warn: mock(() => {}),
  error: mock(() => {}),
  debug: mock(() => {}),
  json: mock(() => {}), // ADD THIS
};
```

### 4b. Update Config Fixtures

Use new discriminated union agent config (see test-3-config-schema.md)

### 4c. Check Function Signatures

Review `runPhaseImplement`, `runPhasePr`, and `getNextPhase` signatures for changes.

## Files to Update

1. `src/__tests__/workflow.test.ts`

## Verification

```bash
bun test src/__tests__/workflow.test.ts
```
