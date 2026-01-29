# Test Fixes

This directory contains documentation for fixing the 144 failing tests.

## Summary

| Fix Group                                                       | Tests | Priority | Effort |
| --------------------------------------------------------------- | ----- | -------- | ------ |
| [1. BatchProgress Schema](test-1-batch-progress-schema.md)      | 8     | High     | Low    |
| [2. SDK Integration Mocking](test-2-sdk-integration-mocking.md) | 54    | Medium   | High   |
| [3. Config Schema](test-3-config-schema.md)                     | 18    | High     | Medium |
| [4. Workflow Phase](test-4-workflow-phase.md)                   | 14    | High     | Medium |
| [5. Edge Cases - Item States](test-5-edge-cases-item-states.md) | 2     | Low      | Low    |
| [6. Agent Dry-Run](test-6-agent-dry-run.md)                     | 9     | Medium   | Medium |
| [7. resolveId/buildIdMap](test-7-resolve-id.md)                 | 10    | Medium   | Low    |
| [8. Dream Command](test-8-dream-command.md)                     | 3     | Low      | Low    |
| [9. Schema Export](test-9-schemas-export.md)                    | 1     | High     | Low    |

**Total: 144 failing tests + 1 error**

## Common Patterns

### Pattern A: Logger Mock Missing `json`

Many tests fail because the Logger mock is missing the `json` method.

**Fix:** Add `json: mock(() => {})` to all Logger mocks.

**Affects:** Groups 4, 5, 6, 7

### Pattern B: BatchProgress Schema Updated

New required fields `healing_attempts` and `last_healing_at`.

**Fix:** Add these fields to all BatchProgress test fixtures.

**Affects:** Group 1

### Pattern C: AgentConfig Union Type

Changed from `{ mode, command, args }` to discriminated union by `kind`.

**Fix:** Update config fixtures to use new schema.

**Affects:** Groups 3, 4, 5

### Pattern D: SDK Mock Not Applied

Bun's `mock.module()` not intercepting SDK imports.

**Fix:** Review mock setup, import order, or use alternative mocking approach.

**Affects:** Group 2

## Recommended Fix Order

1. **Group 9** - Schema export (1 test, blocks other tests from loading)
2. **Group 1** - BatchProgress schema (easy fix, unblocks many tests)
3. **Pattern A** - Logger mock (affects multiple groups)
4. **Group 3** - Config schema (affects multiple groups)
5. **Group 4** - Workflow tests
6. **Group 6** - Agent dry-run tests
7. **Group 7** - resolveId tests
8. **Group 8** - Dream command tests
9. **Group 2** - SDK integration (largest, most complex)
