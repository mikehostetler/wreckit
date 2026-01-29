# Add Integration Tests for Each Experimental SDK Implementation Plan

## Overview

This item adds integration tests for the three experimental SDK runners (Amp, Codex, OpenCode) to verify their behavior beyond the existing unit tests that only cover dry-run mode. Integration tests are needed to verify message streaming, event emission, error handling, tool allowlist enforcement, and SDK option passing without requiring actual API credentials.

## Current State Analysis

### Integration Tests Already Implemented

The integration tests for all three experimental SDK runners **have been fully implemented**:

| Test File | Location | Lines | Status |
|-----------|----------|-------|--------|
| Amp SDK Integration | `src/__tests__/sdk-integration/amp-sdk.integration.test.ts` | 669 | Complete |
| Codex SDK Integration | `src/__tests__/sdk-integration/codex-sdk.integration.test.ts` | 681 | Complete |
| OpenCode SDK Integration | `src/__tests__/sdk-integration/opencode-sdk.integration.test.ts` | 687 | Complete |

### Test Coverage Summary

Each integration test file covers:

1. **Message Formatting** (5 tests)
   - Assistant text messages
   - Assistant tool_use messages
   - Tool result messages
   - Result messages
   - Error messages

2. **Event Emission** (5 tests)
   - `assistant_text` events
   - `tool_started` events
   - `tool_result` events
   - `run_result` events
   - `error` events

3. **Error Handling** (9 tests)
   - Authentication errors (401, Invalid API key)
   - Rate limit errors (429)
   - Context window errors (token limits)
   - Network errors (ECONNREFUSED, ENOTFOUND)
   - Generic errors

4. **Stdout/Stderr Callback Routing** (2 tests)
   - Non-error messages to stdout
   - Error messages to stderr

5. **Successful Completion** (3 tests)
   - Accumulated output
   - Prompt passing
   - cwd option passing

6. **SDK Options** (3 tests)
   - mcpServers option
   - tools option (allowedTools)
   - bypassPermissions mode

### Test Infrastructure

The tests use Bun's test framework with:
- `mock.module()` to mock `@anthropic-ai/claude-agent-sdk`
- `mock.module()` to mock `buildSdkEnv` for filesystem isolation
- `vi.fn()` for mock query implementations
- Async generators for controlled message sequences

### Package.json Test Script

The test script at `package.json:30` already includes the integration tests:
```bash
bun test ./src/__tests__/sdk-integration/*.integration.test.ts
```

### Key Discoveries

- **Already Complete**: All integration test files exist and are fully implemented with comprehensive test coverage
- **Pattern Followed**: Tests follow the established mock pattern from research recommendations (mock SDK at query level)
- **No API Required**: Tests mock the SDK entirely, requiring no API credentials
- **ROADMAP Outdated**: The ROADMAP.md line 25 still shows `[ ]` instead of `[x]` for this objective

## Desired End State

The milestone objective should be marked complete in ROADMAP.md after verifying:

1. All integration tests pass: `bun test ./src/__tests__/sdk-integration/*.integration.test.ts`
2. Tests cover the required scenarios per research recommendations
3. ROADMAP.md is updated to reflect completion

### Success Verification

Run the integration test suite:
```bash
bun test ./src/__tests__/sdk-integration/*.integration.test.ts
```

Expected: All 27 tests per SDK (81 total) should pass.

## What We're NOT Doing

1. **NOT adding new tests** - Tests are already implemented and comprehensive
2. **NOT adding live/API tests** - The mock-based approach is sufficient for CI
3. **NOT creating shared test utilities** - Each file is self-contained (acceptable duplication for test isolation)
4. **NOT modifying SDK runners** - Runners are already complete from previous items (026, 027, 028)

---

## Phase 1: Verify Test Execution

### Overview

Run the existing integration tests to confirm they pass and provide adequate coverage.

### Changes Required:

No code changes required. This phase is verification only.

### Success Criteria:

#### Automated Verification:
- [ ] Integration tests pass: `bun test ./src/__tests__/sdk-integration/*.integration.test.ts`
- [ ] No test failures or skipped tests
- [ ] All three SDK runners tested (amp, codex, opencode)

#### Manual Verification:
- [ ] Review test output to confirm all test suites run
- [ ] Confirm tests cover: message formatting, event emission, error handling, callback routing, SDK options

**Note**: Complete automated verification, then pause for manual confirmation before proceeding.

---

## Phase 2: Update ROADMAP

### Overview

Mark the integration test objective as complete in ROADMAP.md.

### Changes Required:

#### 1. ROADMAP.md
**File**: `ROADMAP.md`
**Line**: 25
**Changes**: Change checkbox from `[ ]` to `[x]`

```markdown
# Before
- [ ] Add integration tests for each experimental SDK

# After
- [x] Add integration tests for each experimental SDK
```

### Success Criteria:

#### Automated Verification:
- [ ] ROADMAP.md contains `[x] Add integration tests for each experimental SDK`
- [ ] Git diff shows only the checkbox change

#### Manual Verification:
- [ ] Review ROADMAP.md to confirm milestone status is accurate
- [ ] Confirm no other changes were made accidentally

**Note**: Complete automated verification, then pause for manual confirmation before proceeding.

---

## Phase 3: Update Integration README

### Overview

Update the integration test documentation to reflect that SDK integration tests are now available.

### Changes Required:

#### 1. Integration README
**File**: `src/__tests__/integration/README.md`
**Changes**: Add section documenting SDK integration tests

Add after line 67 (after "SDK mode uses mock implementations to avoid API calls"):

```markdown
3. **SDK Integration tests** (`src/__tests__/sdk-integration/*.integration.test.ts`):
   - Tests for Amp, Codex, and OpenCode experimental SDK runners
   - Mock-based testing (no API credentials required)
   - Covers: message formatting, event emission, error handling, SDK options
   - Run with: `bun test ./src/__tests__/sdk-integration/*.integration.test.ts`
```

### Success Criteria:

#### Automated Verification:
- [ ] README.md contains documentation for SDK integration tests
- [ ] File path `./src/__tests__/sdk-integration/` is mentioned

#### Manual Verification:
- [ ] Documentation is clear and accurate
- [ ] Instructions match actual test execution

---

## Testing Strategy

### Unit Tests
- Existing: `src/__tests__/{amp,codex,opencode}-sdk-runner.test.ts`
- Coverage: Dry-run mode, getEffectiveToolAllowlist resolution

### Integration Tests
- Location: `src/__tests__/sdk-integration/*.integration.test.ts`
- Coverage: SDK message handling, event emission, error categories, SDK option passing
- Approach: Mock SDK at query level, no API credentials required

### Manual Testing Steps

1. Run the full test suite:
   ```bash
   bun test
   ```

2. Run only SDK integration tests:
   ```bash
   bun test ./src/__tests__/sdk-integration/*.integration.test.ts
   ```

3. Verify test count matches expectations:
   - Amp SDK: ~27 tests
   - Codex SDK: ~27 tests
   - OpenCode SDK: ~27 tests
   - Total: ~81 tests

## Migration Notes

None required. This item is verification and documentation only.

## References

- Research: `/Users/speed/wreckit/.wreckit/items/029-add-integration-tests-for-each-experimental-sdk/research.md`
- Integration tests: `src/__tests__/sdk-integration/amp-sdk.integration.test.ts:1-669`
- Integration tests: `src/__tests__/sdk-integration/codex-sdk.integration.test.ts:1-681`
- Integration tests: `src/__tests__/sdk-integration/opencode-sdk.integration.test.ts:1-687`
- ROADMAP milestone: `ROADMAP.md:16-26` ([M2] Finish Experimental SDK Integrations)
- Package.json test script: `package.json:30`
- SDK runners: `src/agent/{amp,codex,opencode}-sdk-runner.ts`
