# Research: [DREAMER] Add proper typing for SDK options in claude-sdk-runner.ts

**Date**: 2025-01-26
**Item**: 046-dreamer-add-proper-typing-for-sdk-options-in-claud

## Research Question
Type 'any' used for sdkOptions in claude-sdk-runner.ts line 32 eliminates type checking for critical SDK configuration, potentially allowing invalid options to pass silently.

**Motivation:** Proper typing ensures compile-time validation of SDK options, better IDE autocomplete, and prevents runtime errors from misspelled or invalid options. Using 'any' defeats TypeScript's primary benefit.

**Success criteria:**
- sdkOptions properly typed using SDK types
- No 'any' types in agent runner files
- Type safety validated with TypeScript strict mode

**Technical constraints:**
- Must identify correct SDK option types from @anthropic-ai/claude-agent-sdk
- Should not break existing functionality
- May need to augment SDK types if incomplete

**In scope:**
- Replace 'any' type with proper SDK types
- Validate all option properties are typed
- Ensure type safety for MCP servers and tools

**Out of scope:**
- Refactoring SDK integration architecture
- Changes to SDK package usage patterns
- Modifying error handling

**Signals:** priority: medium, urgency: Type safety issues can cause runtime errors with SDK options

## Summary

The research confirms that `sdkOptions` in `/Users/speed/wreckit/src/agent/claude-sdk-runner.ts:32` is typed as `any`, which bypasses TypeScript's type checking for critical SDK configuration. The `@anthropic-ai/claude-agent-sdk` package (v0.2.7) provides a comprehensive `Options` type that should be used instead. Additionally, several helper functions in the same file use `any` types for message and error handling that have proper types available in the SDK. Similar `any` usage exists in `/Users/speed/wreckit/src/agent/env.ts:38` and `/Users/speed/wreckit/src/agent/env.ts:61` for error handling.

The fix involves importing the `Options` type from the SDK and applying it to `sdkOptions`, along with using proper SDK message types (`SDKMessage`, `BetaMessage`) for message handling parameters. This is a straightforward, low-risk improvement that enhances type safety and enables better IDE support. The project already uses TypeScript strict mode, making this change consistent with existing type safety goals.

## Current State Analysis

### Existing Implementation

**Primary Issue Location:**
- `/Users/speed/wreckit/src/agent/claude-sdk-runner.ts:32` - `sdkOptions` typed as `any`

```typescript
// Line 32 - Current implementation with 'any' type
const sdkOptions: any = {
  cwd, // Working directory
  permissionMode: "bypassPermissions", // wreckit runs autonomously
  allowDangerouslySkipPermissions: true, // Required for bypassPermissions
  abortController, // Enable cancellation on TUI quit/signals
  env: sdkEnv, // Pass environment to ensure custom endpoints are honored
  // Pass MCP servers if provided
  ...(options.mcpServers && { mcpServers: options.mcpServers }),
  // Restrict tools if allowedTools is specified (guardrail to prevent unwanted actions)
  ...(options.allowedTools && { tools: options.allowedTools }),
};
```

**Additional `any` Type Issues in Same File:**
- `/Users/speed/wreckit/src/agent/claude-sdk-runner.ts:114` - `handleSdkError(error: any, ...)` - Error parameter typed as `any`
- `/Users/speed/wreckit/src/agent/claude-sdk-runner.ts:224` - `formatSdkMessage(message: any): string` - Message parameter typed as `any`
- `/Users/speed/wreckit/src/agent/claude-sdk-runner.ts:228` - `content.map((block: any) => ...)` - Content block typed as `any`
- `/Users/speed/wreckit/src/agent/claude-sdk-runner.ts:259` - `emitAgentEventsFromSdkMessage(message: any, ...)` - Message parameter typed as `any`

**Error Handling in env.ts:**
- `/Users/speed/wreckit/src/agent/env.ts:38` - `catch (e: any)` in `readClaudeUserEnv()` function
- `/Users/speed/wreckit/src/agent/env.ts:61` - `catch (e: any)` in `readWreckitEnv()` function

**Other SDK Runners:**
The other SDK runners (amp-sdk-runner, codex-sdk-runner, opencode-sdk-runner) also have some `any` type usage:
- `/Users/speed/wreckit/src/agent/codex-sdk-runner.ts:70` - Uses `(result as any).text` type assertion
- `/Users/speed/wreckit/src/agent/opencode-sdk-runner.ts:79` - Uses `(session as any).prompt` type assertion
- `/Users/speed/wreckit/src/agent/opencode-sdk-runner.ts:85` - Uses `(response as any).content` type assertion

However, these are less critical as they either don't pass complex option objects to their SDKs or are simpler implementations.

### Current Patterns and Conventions

**TypeScript Configuration:**
- Project uses strict mode: `"strict": true` in tsconfig.json
- Target: ES2022, Module: ESNext
- This makes the use of `any` types particularly problematic as they bypass strict type checking

**SDK Usage Pattern:**
The SDK's `query` function at `/Users/speed/wreckit/src/agent/claude-sdk-runner.ts:45` expects:
```typescript
query({
  prompt: string | AsyncIterable<SDKUserMessage>,
  options?: Options
})
```

**Environment Variable Handling:**
- `/Users/speed/wreckit/src/agent/env.ts:79` - `buildSdkEnv()` returns `Record<string, string>` (properly typed)
- Environment is properly constructed from multiple sources with precedence

**MCP Servers and Tools:**
- `/Users/speed/wreckit/src/agent/runner.ts:83` - `mcpServers?: Record<string, unknown>` in `RunAgentOptions`
- `/Users/speed/wreckit/src/agent/runner.ts:85` - `allowedTools?: string[]` in `RunAgentOptions`
- These are passed through from `RunAgentOptions` to the SDK options

### Integration Points

**Agent Runner System:**
- `/Users/speed/wreckit/src/agent/runner.ts:1-495` - Core runner interfaces and dispatch logic
- `/Users/speed/wreckit/src/agent/claude-sdk-runner.ts:1-301` - Claude SDK implementation
- `/Users/speed/wreckit/src/agent/amp-sdk-runner.ts:1-90` - Amp SDK implementation
- `/Users/speed/wreckit/src/agent/codex-sdk-runner.ts:1-94` - Codex SDK implementation
- `/Users/speed/wreckit/src/agent/opencode-sdk-runner.ts:1-110` - OpenCode SDK implementation

**Configuration System:**
- `/Users/speed/wreckit/src/schemas.ts:44-49` - `ClaudeSdkAgentSchema` Zod schema
- Defines `model`, `max_tokens`, and `tools` properties for Claude SDK configuration
- Supports discriminated union for different agent types

**Type Definitions:**
- `/Users/speed/wreckit/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:395-726` - `Options` type definition
- `/Users/speed/wreckit/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:1179` - `SDKMessage` union type
- `/Users/speed/wreckit/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:1014-1021` - `SDKAssistantMessage` type

**Testing:**
- `/Users/speed/wreckit/src/__tests__/agent.test.ts:1-428` - Agent runner tests including SDK mode tests
- Tests verify dry-run and mock-agent modes work correctly

## Key Files

### `/Users/speed/wreckit/src/agent/claude-sdk-runner.ts`
**Lines 8-112:** Main `runClaudeSdkAgent` function
- **Line 32:** PRIMARY ISSUE - `sdkOptions: any` should be `sdkOptions: Options`
- Line 45: `query({ prompt, options: sdkOptions })` - Passes options to SDK
- Lines 32-42: Constructs SDK options object with various properties

**Lines 114-222:** `handleSdkError` function
- **Line 114:** `error: any` should be `error: unknown` or `Error`
- Handles authentication, rate limit, context, network, and generic errors

**Lines 224-257:** `formatSdkMessage` function
- **Line 224:** `message: any` should be `message: SDKMessage`
- **Line 228:** `block: any` should be typed based on content structure
- Formats SDK messages for output

**Lines 259-300:** `emitAgentEventsFromSdkMessage` function
- **Line 259:** `message: any` should be `message: SDKMessage`
- Converts SDK messages to agent events

### `/Users/speed/wreckit/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`
**Lines 395-726:** `Options` type definition
- Complete type definition for SDK query options
- Includes all properties used in the codebase: `cwd`, `permissionMode`, `allowDangerouslySkipPermissions`, `abortController`, `env`, `mcpServers`, `tools`

**Lines 1014-1021:** `SDKAssistantMessage` type
- Proper type for assistant messages from SDK

**Lines 1179:** `SDKMessage` type
- Union type of all possible SDK messages (assistant, user, result, system, etc.)

**Lines 592:** `PermissionMode` type
- Defines valid permission modes including 'bypassPermissions'

**Lines 561:** `mcpServers` property type
- Typed as `Record<string, McpServerConfig>`

### `/Users/speed/wreckit/src/agent/runner.ts`
**Lines 73-86:** `RunAgentOptions` interface
- Defines options passed to agent runners
- **Line 83:** `mcpServers?: Record<string, unknown>`
- **Line 85:** `allowedTools?: string[]`

**Lines 56-71:** `AgentConfig` and `AgentResult` interfaces
- Core agent configuration and result types

**Lines 416-441:** `claude_sdk` case in `runAgentUnion` switch statement
- Shows how Claude SDK runner is called in the union dispatch system

### `/Users/speed/wreckit/src/agent/env.ts`
**Lines 79-108:** `buildSdkEnv` function
- Returns properly typed `Record<string, string>`
- **Line 38:** `catch (e: any)` - Error handling in `readClaudeUserEnv`
- **Line 61:** `catch (e: any)` - Error handling in `readWreckitEnv`

### `/Users/speed/wreckit/src/schemas.ts`
**Lines 44-49:** `ClaudeSdkAgentSchema`
- Zod schema for Claude SDK agent configuration
- Defines `model`, `max_tokens`, and optional `tools` properties

**Lines 265-277:** Agent config type exports
- `ClaudeSdkAgentConfig`, `AmpSdkAgentConfig`, `CodexSdkAgentConfig`, `OpenCodeSdkAgentConfig`

### `/Users/speed/wreckit/src/__tests__/agent.test.ts`
**Lines 332-362:** SDK mode dry-run test
- Verifies SDK agent works correctly in dry-run mode

**Lines 364-391:** SDK mode mock-agent test
- Verifies SDK agent works correctly in mock-agent mode

## Technical Considerations

### Dependencies

**External Dependencies:**
- `@anthropic-ai/claude-agent-sdk: ^0.2.7` - Provides comprehensive TypeScript types
- The SDK's `Options` type is well-maintained and covers all use cases in the codebase

**Internal Modules:**
- `/Users/speed/wreckit/src/logging.ts` - Logger interface for logging
- `/Users/speed/wreckit/src/agent/runner.ts` - Agent runner interfaces and utilities
- `/Users/speed/wreckit/src/agent/env.ts` - Environment variable resolution
- `/Users/speed/wreckit/src/tui/agentEvents.ts` - Agent event types

### Patterns to Follow

**1. Import SDK Types:**
```typescript
import { query, type Options, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { BetaMessage } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs';
```

**2. Use Proper Type for Options:**
```typescript
const sdkOptions: Options = {
  cwd,
  permissionMode: "bypassPermissions",
  allowDangerouslySkipPermissions: true,
  abortController,
  env: sdkEnv,
  ...(options.mcpServers && { mcpServers: options.mcpServers }),
  ...(options.allowedTools && { tools: options.allowedTools }),
};
```

**3. Type Error Handling:**
```typescript
function handleSdkError(error: unknown, output: string, logger: Logger): { ... } {
  const errorMessage = error instanceof Error ? error.message : String(error);
  // ... rest of implementation
}
```

**4. Type Message Handling:**
```typescript
function formatSdkMessage(message: SDKMessage): string {
  // Type narrowing based on message.type
  if (message.type === "assistant") {
    // TypeScript now knows this is SDKAssistantMessage
    const content = message.message?.content || message.content || [];
    // ...
  }
  // ...
}
```

**5. MCP Servers Type Handling:**
The current code uses `Record<string, unknown>` for `mcpServers` in `RunAgentOptions`, but the SDK expects `Record<string, McpServerConfig>`. Options:
- Update the interface to use the proper SDK type
- Add a type assertion/cast when passing to SDK options
- The SDK type is more specific and provides better type safety

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Type mismatch breaking existing functionality** | High | The `Options` type from the SDK is comprehensive and includes all properties currently being used. The fix should be a straightforward type replacement without logic changes. |
| **SDK types may be incomplete or incorrect** | Medium | The SDK is officially maintained by Anthropic (v0.2.7). Types are actively maintained and match the SDK implementation. All properties used in the codebase are properly typed. |
| **MCP servers type incompatibility** | Medium | Current code uses `Record<string, unknown>` but SDK expects `Record<string, McpServerConfig>`. Need to verify that the data being passed conforms to the SDK type or use type assertion. |
| **Message type narrowing issues** | Low | TypeScript's type narrowing works well with discriminated unions like `SDKMessage`. The code already checks `message.type` before accessing type-specific properties. |
| **Runtime errors after type changes** | Low | Types are compile-time only. If the code works now, adding proper types won't change runtime behavior - it will only catch potential errors at compile time. |
| **Other SDK runners also have 'any' types** | Low | While other runners (amp, codex, opencode) also use `any`, they are less critical. Can be addressed in follow-up work. Focus on Claude SDK runner first. |
| **Error handling changes** | Low | Changing `error: any` to `error: unknown` is a best practice. The code already uses proper type narrowing with `instanceof Error` checks. |

## Recommended Approach

### High-Level Strategy

1. **Phase 1: Fix Primary Issue (sdkOptions) - CRITICAL**
   - Import `Options` type from SDK
   - Replace `const sdkOptions: any` with `const sdkOptions: Options`
   - Verify TypeScript compiles without errors
   - Run tests to ensure no behavior change

2. **Phase 2: Fix Message Type Issues - HIGH PRIORITY**
   - Import `SDKMessage` and related message types
   - Update `formatSdkMessage` and `emitAgentEventsFromSdkMessage` signatures
   - Use type narrowing based on discriminated unions

3. **Phase 3: Fix Error Handling - MEDIUM PRIORITY**
   - Change `error: any` to `error: unknown` in error handlers
   - Use proper type guards for error handling (already in place)

4. **Phase 4: Improve MCP Servers Type Safety - LOW PRIORITY**
   - Evaluate changing `mcpServers?: Record<string, unknown>` to proper SDK type
   - Add type validation or assertions if needed

5. **Phase 5: Address env.ts Error Handling - OPTIONAL**
   - Change `catch (e: any)` to `catch (e: unknown)` in env.ts
   - Lower priority as it's in catch blocks where `unknown` is standard

### Implementation Steps

**Step 1: Update Imports (Line 1)**
```typescript
import { query, type Options, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
```

**Step 2: Replace sdkOptions Type (Line 32)**
```typescript
// Before:
const sdkOptions: any = { ... };

// After:
const sdkOptions: Options = { ... };
```

**Step 3: Update Message Handling Functions (Lines 224, 259)**
```typescript
// Before:
function formatSdkMessage(message: any): string { ... }
function emitAgentEventsFromSdkMessage(message: any, emit: (event: AgentEvent) => void): void { ... }

// After:
function formatSdkMessage(message: SDKMessage): string { ... }
function emitAgentEventsFromSdkMessage(message: SDKMessage, emit: (event: AgentEvent) => void): void { ... }
```

**Step 4: Update Error Handling (Line 114)**
```typescript
// Before:
function handleSdkError(error: any, output: string, logger: Logger): { ... } { ... }

// After:
function handleSdkError(error: unknown, output: string, logger: Logger): { ... } {
  const errorMessage = error instanceof Error ? error.message : String(error);
  // ... rest of implementation
}
```

**Step 5: Verify Type Safety**
- Run `bun run build` to ensure TypeScript compilation succeeds
- Run `bun test` to ensure all tests pass
- Check for any new type errors introduced by the changes

**Step 6: Consider MCP Servers Type Enhancement (Optional)**
- If feasible, update `RunAgentOptions.mcpServers` to use proper SDK type
- This may require changes in multiple files and could be done as a follow-up

### Validation Checklist

- [ ] TypeScript compiles without errors
- [ ] All existing tests pass
- [ ] IDE autocomplete now works for SDK options
- [ ] Invalid option names would be caught at compile time
- [ ] No runtime behavior changes
- [ ] Type strict mode still satisfied
- [ ] MCP servers configuration still works correctly

## Open Questions

1. **MCP Servers Type Compatibility**
   - Should we update `RunAgentOptions.mcpServers` from `Record<string, unknown>` to `Record<string, McpServerConfig>`?
   - This would be more type-safe but may require changes in multiple files
   - **Recommendation:** Start with type assertion in the SDK options, consider broader change as follow-up

2. **Other SDK Runners**
   - Should amp-sdk-runner, codex-sdk-runner, and opencode-sdk-runner also be fixed?
   - They have similar `any` type usage but are less critical
   - **Recommendation:** Focus on Claude SDK runner first, address others in separate items if needed

3. **SDK Version Stability**
   - The SDK is at version 0.2.7 - are the types stable?
   - **Recommendation:** The types appear stable and well-maintained. Using them is safe.

4. **Build Process Compatibility**
   - Will the build process need any changes?
   - **Recommendation:** No changes expected - types are compile-time only

5. **Test Coverage**
   - Are there existing tests that validate SDK option passing?
   - **Recommendation:** Review tests in `/Users/speed/wreckit/src/__tests__/agent.test.ts` to ensure they still pass

## Conclusion

The research confirms that adding proper typing to `sdkOptions` and related parameters in `claude-sdk-runner.ts` is a straightforward, low-risk improvement that will enhance type safety and developer experience. The SDK provides comprehensive, well-maintained types that should be used instead of `any`. The fix aligns with the project's TypeScript strict mode and will enable better IDE support and compile-time error detection. The primary change is on line 32, with related improvements on lines 114, 224, and 259 for consistency and completeness.
