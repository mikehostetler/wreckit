# Fix Group 2: SDK Integration Tests - Mock Not Working

## Failing Tests (54 tests)

| Test Suite                         | Count    |
| ---------------------------------- | -------- |
| `amp-sdk.integration.test.ts`      | 18 tests |
| `codex-sdk.integration.test.ts`    | 18 tests |
| `opencode-sdk.integration.test.ts` | 18 tests |

## Categories of Failures

### 2a. Message Formatting (15 tests)

- formats assistant text messages correctly
- formats assistant tool_use messages correctly
- formats tool_result messages correctly
- formats result messages correctly
- formats error messages correctly

### 2b. Event Emission (15 tests)

- emits assistant_text events for text blocks
- emits tool_started events for tool_use blocks
- emits tool_result events
- emits run_result events
- emits error events

### 2c. Error Handling (27 tests)

- handles authentication errors with helpful message
- handles 401 errors as authentication errors
- handles rate limit errors
- handles 429 errors as rate limit errors
- handles context window errors
- handles token limit errors as context errors
- handles network errors
- handles DNS errors as network errors
- handles generic errors with error message

### 2d. Callback Routing (6 tests)

- calls stdout callback for non-error messages
- calls stderr callback for error messages

### 2e. Successful Completion (9 tests)

- returns success with accumulated output
- passes prompt to SDK query
- passes cwd to SDK options

### 2f. SDK Options (9 tests)

- passes mcpServers option to SDK
- passes tools option when allowedTools specified
- sets bypassPermissions mode

## Root Cause

The mock for `@anthropic-ai/sdk` (and similar SDKs) is not being applied correctly. Tests show:

- `mockedQuery.mock.calls[0][0]` is undefined
- `expect(mockedQuery).toHaveBeenCalled()` fails

This indicates the mock is not intercepting the actual SDK calls.

## Fix Strategy

1. **Check mock setup** - Verify `mock.module()` is correctly mocking the SDK
2. **Check import order** - Mocks must be set up before the module under test is imported
3. **Check mock factory** - The mock factory function must return the correct structure
4. **Consider using spyOn** - May need to use `spyOn` instead of module mocking

## Files to Update

1. `src/__tests__/sdk-integration/amp-sdk.integration.test.ts`
2. `src/__tests__/sdk-integration/codex-sdk.integration.test.ts`
3. `src/__tests__/sdk-integration/opencode-sdk.integration.test.ts`

## Verification

```bash
bun test src/__tests__/sdk-integration/
```
