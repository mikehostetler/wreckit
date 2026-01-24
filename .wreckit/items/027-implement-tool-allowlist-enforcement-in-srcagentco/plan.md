# Implement tool allowlist enforcement in `src/agent/codex-sdk-runner.ts` Implementation Plan

## Overview

This item implements the Codex SDK runner by filling in the TODO stub in `src/agent/codex-sdk-runner.ts` with a working implementation. The file currently has complete scaffolding (interface, `getEffectiveToolAllowlist()` helper, dry-run support) but returns a "not yet implemented" error for actual execution. We will copy the implementation pattern from the completed `amp-sdk-runner.ts` (item 026), which uses the `@anthropic-ai/claude-agent-sdk` package with tool allowlist enforcement via the SDK's `tools` option.

## Current State Analysis

### What Exists

| Component | Status | Location |
|-----------|--------|----------|
| `CodexRunAgentOptions` interface | ✅ Complete | `codex-sdk-runner.ts:7-22` |
| `getEffectiveToolAllowlist()` helper | ✅ Complete | `codex-sdk-runner.ts:35-48` |
| Dry-run support | ✅ Complete | `codex-sdk-runner.ts:55-68` |
| Actual SDK execution | ❌ TODO stub | `codex-sdk-runner.ts:70-83` |

### What's Missing

The main function body (lines 70-83) currently returns an error:
```typescript
logger.error("Codex SDK runner not yet implemented");
return {
  success: false,
  output: "Codex SDK runner is not yet implemented. Use process mode or claude_sdk instead.",
  ...
};
```

### Key Discoveries:

- **Reference implementation**: `amp-sdk-runner.ts:53-184` provides the exact pattern to follow - AbortController, timeout, buildSdkEnv(), SDK query iteration, message formatting, error handling
- **SDK import**: Uses `import { query } from "@anthropic-ai/claude-agent-sdk"` (already in package.json:53)
- **Controller registration**: Uses `registerSdkController()` and `unregisterSdkController()` from `runner.ts:11-17` for cleanup on exit
- **Environment building**: Uses `buildSdkEnv()` from `env.ts:79-108` for credential resolution
- **Tool allowlist enforcement**: Passed to SDK via `tools` option in sdkOptions (see `amp-sdk-runner.ts:113`)
- **Helper functions needed**: `handleSdkError()`, `formatSdkMessage()`, `emitAgentEventsFromSdkMessage()` - can be copied from amp-sdk-runner.ts with Codex-specific naming in error messages
- **Default timeout**: 3600 seconds (1 hour) per `amp-sdk-runner.ts:79`
- **Dispatch integration**: Already wired up in `runner.ts:459-473`
- **Schema**: `CodexSdkAgentSchema` at `schemas.ts:55-58` has `kind: "codex_sdk"` and `model: z.string().default("codex-1")`

## Desired End State

After implementation:
1. `runCodexSdkAgent()` executes prompts via the Claude Agent SDK with proper tool allowlist enforcement
2. Tool restrictions are enforced when `allowedTools` or `phase` is specified
3. Timeout handling aborts execution after 3600 seconds (1 hour) by default
4. Error handling provides helpful messages for auth, rate limit, context, and network errors
5. TUI integration works via `onAgentEvent` callback with structured events
6. Unit tests verify dry-run behavior and tool allowlist resolution

### Verification

- `npm run typecheck` passes
- `npm run lint` passes
- `npm run build` passes
- `npm test` passes (including new tests)
- Dry-run mode: `wreckit research --agent codex_sdk --dry-run` shows "[dry-run] Would run Codex SDK agent"
- With tool restrictions: Debug log shows "Tool restrictions active: ..."

## What We're NOT Doing

1. **No new dependencies**: Using existing `@anthropic-ai/claude-agent-sdk` package
2. **No schema changes**: `CodexSdkAgentSchema` already exists and is correct
3. **No dispatch changes**: `runner.ts:459-473` already calls `runCodexSdkAgent`
4. **No custom endpoint configuration**: Using standard `buildSdkEnv()` like amp-sdk-runner
5. **No model selection logic**: The `model` field in CodexSdkAgentConfig is not passed to the SDK (same as amp-sdk-runner pattern)
6. **No integration tests with real API**: Only dry-run tests to avoid API calls in CI

## Implementation Approach

Copy the proven pattern from `amp-sdk-runner.ts`, adapting only the type names and error message branding from "Amp" to "Codex". The implementation is nearly identical because both use the same underlying SDK infrastructure.

---

## Phase 1: Implement Core Codex SDK Runner

### Overview

Replace the TODO stub in `codex-sdk-runner.ts` with a working implementation that follows the amp-sdk-runner.ts pattern exactly.

### Changes Required:

#### 1. Add Required Imports

**File**: `src/agent/codex-sdk-runner.ts`
**Changes**: Add imports for SDK query function, controller registration, and environment builder at the top of the file

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";
import { registerSdkController, unregisterSdkController } from "./runner.js";
import { buildSdkEnv } from "./env.js";
```

#### 2. Replace TODO Stub with Implementation

**File**: `src/agent/codex-sdk-runner.ts`
**Changes**: Replace lines 70-83 (the TODO stub) with the full implementation copied from amp-sdk-runner.ts:53-184

The implementation includes:
- AbortController creation and registration for cleanup
- Timeout setup with setTimeout (3600 seconds default)
- Environment building via `buildSdkEnv()`
- SDK options construction with `tools` for allowlist enforcement
- Async iteration over `query()` messages
- Message formatting and event emission via callbacks
- Proper cleanup in finally block

```typescript
  let output = "";
  let timedOut = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const abortController = new AbortController();

  // Default timeout: 3600 seconds (1 hour)
  const timeoutSeconds = 3600;

  // Register for cleanup on exit
  registerSdkController(abortController);

  try {
    // Set up timeout
    if (timeoutSeconds > 0) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        logger.warn(`Codex SDK agent timed out after ${timeoutSeconds} seconds`);
        abortController.abort();
      }, timeoutSeconds * 1000);
    }

    // Build environment from ~/.claude/settings.json, process.env, and .wreckit/config*.json
    const sdkEnv = await buildSdkEnv({ cwd, logger });

    // Get effective tool allowlist
    const effectiveTools = getEffectiveToolAllowlist(options);
    if (effectiveTools) {
      logger.info(`Tool restrictions active: ${effectiveTools.join(", ")}`);
    }

    // Build SDK options
    const sdkOptions: any = {
      cwd, // Working directory
      permissionMode: "bypassPermissions", // wreckit runs autonomously
      allowDangerouslySkipPermissions: true, // Required for bypassPermissions
      abortController, // Enable cancellation on TUI quit/signals
      env: sdkEnv, // Pass environment to ensure custom endpoints are honored
      // Pass MCP servers if provided
      ...(options.mcpServers && { mcpServers: options.mcpServers }),
      // Restrict tools if effectiveTools is specified (guardrail to prevent unwanted actions)
      ...(effectiveTools && { tools: effectiveTools }),
    };

    // Run the agent via SDK
    for await (const message of query({ prompt, options: sdkOptions })) {
      if (timedOut) break;

      // Convert SDK message to output string
      const messageText = formatSdkMessage(message);
      output += messageText;

      // Emit structured agent events if callback is provided
      if (onAgentEvent) {
        emitAgentEventsFromSdkMessage(message, onAgentEvent);
      }

      // Route to appropriate callback based on message type
      const isError = message.type === "error" || message.constructor?.name === "ErrorMessage";

      if (messageText) {
        if (isError) {
          if (onStderrChunk) {
            onStderrChunk(messageText);
          } else {
            process.stderr.write(messageText);
          }
        } else {
          if (onStdoutChunk) {
            onStdoutChunk(messageText);
          } else {
            process.stdout.write(messageText);
          }
        }
      }
    }

    if (timeoutId) clearTimeout(timeoutId);

    if (timedOut) {
      return {
        success: false,
        output,
        timedOut: true,
        exitCode: null,
        completionDetected: false,
      };
    }

    // SDK always completes successfully unless it throws
    return {
      success: true,
      output,
      timedOut: false,
      exitCode: 0,
      completionDetected: true,
    };
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);

    const errorResult = handleSdkError(error, output, logger);

    return {
      success: errorResult.success,
      output: errorResult.output,
      timedOut: false,
      exitCode: errorResult.exitCode,
      completionDetected: false,
    };
  } finally {
    unregisterSdkController(abortController);
  }
```

#### 3. Add Helper Functions

**File**: `src/agent/codex-sdk-runner.ts`
**Changes**: Add helper functions after the main function, copied from amp-sdk-runner.ts with "Amp" replaced by "Codex" in error messages

```typescript
function handleSdkError(error: any, output: string, logger: Logger): { success: boolean; output: string; exitCode: number | null } {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  // Log the error for debugging
  logger.error(`Codex SDK error: ${errorMessage}`);
  if (errorStack) {
    logger.debug(errorStack);
  }

  // Authentication errors
  if (
    errorMessage.includes("API key") ||
    errorMessage.includes("401") ||
    errorMessage.includes("authentication") ||
    errorMessage.includes("Unauthorized") ||
    errorMessage.includes("anthropic-api-key") ||
    errorMessage.includes("Invalid API key") ||
    errorMessage.includes("/login")
  ) {
    const authHelp = `
❌ Authentication Error: ${errorMessage}

The Codex SDK requires explicit API credentials.

To fix this, set credentials in one of these locations (in order of precedence):

  1. .wreckit/config.local.json (recommended, gitignored):
     {
       "agent": {
         "env": {
           "ANTHROPIC_BASE_URL": "https://your-endpoint.example.com",
           "ANTHROPIC_AUTH_TOKEN": "your-token"
         }
       }
     }

  2. Shell environment:
     export ANTHROPIC_BASE_URL=https://your-endpoint.example.com
     export ANTHROPIC_AUTH_TOKEN=your-token

  3. ~/.claude/settings.json:
     {
       "env": {
         "ANTHROPIC_BASE_URL": "https://your-endpoint.example.com",
         "ANTHROPIC_AUTH_TOKEN": "your-token"
       }
     }

  For direct Anthropic API access, use ANTHROPIC_API_KEY instead.

Run 'wreckit sdk-info' to diagnose your current credential configuration.
`;
    return {
      success: false,
      output: output + authHelp,
      exitCode: 1,
    };
  }

  // Rate limit errors
  if (
    errorMessage.includes("rate limit") ||
    errorMessage.includes("429") ||
    errorMessage.includes("too many requests")
  ) {
    return {
      success: false,
      output: output + `\n⚠️ Rate limit exceeded: ${errorMessage}\n\nPlease try again later.\n`,
      exitCode: 1,
    };
  }

  // Context window errors
  if (
    errorMessage.includes("context") ||
    errorMessage.includes("tokens") ||
    errorMessage.includes("too large") ||
    errorMessage.includes("maximum context length")
  ) {
    return {
      success: false,
      output: output + `\n❌ Context error: ${errorMessage}\n\nTry breaking down the task into smaller pieces or reducing the scope.\n`,
      exitCode: 1,
    };
  }

  // Network/connection errors
  if (
    errorMessage.includes("ECONNREFUSED") ||
    errorMessage.includes("ENOTFOUND") ||
    errorMessage.includes("network") ||
    errorMessage.includes("connection")
  ) {
    return {
      success: false,
      output: output + `\n❌ Network error: ${errorMessage}\n\nPlease check your internet connection and try again.\n`,
      exitCode: 1,
    };
  }

  // Generic error
  return {
    success: false,
    output: output + `\n❌ Error: ${errorMessage}\n`,
    exitCode: 1,
  };
}

function formatSdkMessage(message: any): string {
  // Handle assistant messages (Claude's reasoning and tool calls)
  if (message.type === "assistant") {
    const content = message.message?.content || message.content || [];
    return content.map((block: any) => {
      if (block.type === "text") return block.text;
      if (block.type === "tool_use") {
        const toolName = block.name;
        const toolInput = JSON.stringify(block.input, null, 2);
        return `\n\`\`\`tool\n${toolName}\n${toolInput}\n\`\`\`\n`;
      }
      return "";
    }).join("\n") || "";
  }

  // Handle tool result messages
  if (message.type === "tool_result") {
    const result = message.result || message.content || "";
    return `\n\`\`\`result\n${result}\n\`\`\`\n`;
  }

  // Handle final result messages - capture the actual result text
  if (message.type === "result") {
    // The 'result' field contains the final text output
    return message.result || "";
  }

  // Handle error messages
  if (message.type === "error") {
    return `\n❌ Error: ${message.message || String(message)}\n`;
  }

  return "";
}

function emitAgentEventsFromSdkMessage(message: any, emit: (event: AgentEvent) => void): void {
  // Handle assistant messages (Claude's reasoning and tool calls)
  if (message.type === "assistant") {
    const content = message.message?.content || message.content || [];
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === "text" && block.text) {
          emit({ type: "assistant_text", text: block.text });
        }
        if (block.type === "tool_use") {
          emit({
            type: "tool_started",
            toolUseId: block.id || "",
            toolName: block.name || "",
            input: block.input || {},
          });
        }
      }
    }
    return;
  }

  // Handle tool result messages
  if (message.type === "tool_result" || message.constructor?.name === "ToolResultMessage") {
    const result = message.result ?? message.content ?? "";
    const toolUseId = message.tool_use_id || "";
    emit({ type: "tool_result", toolUseId, result });
    return;
  }

  // Handle final result messages
  if (message.type === "result" || message.constructor?.name === "ResultMessage") {
    emit({ type: "run_result", subtype: message.subtype });
    return;
  }

  // Handle error messages
  if (message.type === "error" || message.constructor?.name === "ErrorMessage") {
    emit({ type: "error", message: message.message || String(message) });
    return;
  }
}
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] Dry-run works: `wreckit research 027 --agent codex_sdk --dry-run` shows "[dry-run] Would run Codex SDK agent"
- [ ] Dry-run with tools shows restrictions in debug log

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Add Unit Tests

### Overview

Create unit tests for the Codex SDK runner following the pattern established in `amp-sdk-runner.test.ts`. Tests focus on dry-run mode and tool allowlist resolution to avoid actual API calls.

### Changes Required:

#### 1. Create Test File

**File**: `src/__tests__/codex-sdk-runner.test.ts`
**Changes**: Create new test file with tests for dry-run mode and getEffectiveToolAllowlist resolution

```typescript
import { describe, it, expect, mock, beforeEach } from "bun:test";
import type { Logger } from "../logging";
import type { CodexSdkAgentConfig } from "../schemas";

// Test helper to create mock logger
function createMockLogger(): Logger {
  return {
    debug: mock(() => {}),
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
    json: mock(() => {}),
  };
}

function createDefaultConfig(): CodexSdkAgentConfig {
  return {
    kind: "codex_sdk",
    model: "codex-1",
  };
}

describe("runCodexSdkAgent", () => {
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = createMockLogger();
  });

  describe("dry-run mode", () => {
    it("returns success without calling SDK", async () => {
      const { runCodexSdkAgent } = await import("../agent/codex-sdk-runner");
      const result = await runCodexSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain("[dry-run]");
      expect(result.completionDetected).toBe(true);
    });

    it("logs tool restrictions when allowedTools provided", async () => {
      const { runCodexSdkAgent } = await import("../agent/codex-sdk-runner");
      const result = await runCodexSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
        dryRun: true,
        allowedTools: ["Read", "Glob"],
      });

      expect(result.success).toBe(true);
      const debugCalls = (mockLogger.debug as any).mock.calls;
      const hasToolRestrictions = debugCalls.some((call: any[]) =>
        call[0]?.includes?.("Tool restrictions")
      );
      expect(hasToolRestrictions).toBe(true);
    });
  });

  describe("getEffectiveToolAllowlist resolution", () => {
    it("prefers explicit allowedTools over phase", async () => {
      const { runCodexSdkAgent } = await import("../agent/codex-sdk-runner");
      const result = await runCodexSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
        dryRun: true,
        allowedTools: ["Read"],
        phase: "implement", // Would give more tools, but explicit wins
      });

      expect(result.success).toBe(true);
      // Debug should show only "Read", not the implement phase tools
      const debugCalls = (mockLogger.debug as any).mock.calls;
      const toolRestrictionCall = debugCalls.find((call: any[]) =>
        call[0]?.includes?.("Tool restrictions")
      );
      expect(toolRestrictionCall).toBeDefined();
      expect(toolRestrictionCall[0]).toContain("Read");
      // Should NOT contain tools from implement phase like "Bash"
      expect(toolRestrictionCall[0]).not.toContain("Bash");
    });

    it("falls back to phase-based allowlist when no explicit tools", async () => {
      const { runCodexSdkAgent } = await import("../agent/codex-sdk-runner");
      const result = await runCodexSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
        dryRun: true,
        phase: "research",
      });

      expect(result.success).toBe(true);
      // Research phase allows Read, Write, Glob, Grep
      const debugCalls = (mockLogger.debug as any).mock.calls;
      const toolRestrictionCall = debugCalls.find((call: any[]) =>
        call[0]?.includes?.("Tool restrictions")
      );
      expect(toolRestrictionCall).toBeDefined();
      expect(toolRestrictionCall[0]).toContain("Glob");
      expect(toolRestrictionCall[0]).toContain("Read");
    });

    it("has no restrictions when neither allowedTools nor phase specified", async () => {
      const { runCodexSdkAgent } = await import("../agent/codex-sdk-runner");
      const result = await runCodexSdkAgent({
        config: createDefaultConfig(),
        cwd: "/tmp/test",
        prompt: "test prompt",
        logger: mockLogger,
        dryRun: true,
      });

      expect(result.success).toBe(true);
      // Should not log tool restrictions
      const debugCalls = (mockLogger.debug as any).mock.calls;
      const hasToolRestrictions = debugCalls.some((call: any[]) =>
        call[0]?.includes?.("Tool restrictions")
      );
      expect(hasToolRestrictions).toBe(false);
    });
  });
});
```

### Success Criteria:

#### Automated Verification:
- [ ] Tests pass: `npm test src/__tests__/codex-sdk-runner.test.ts`
- [ ] All tests pass: `npm test`
- [ ] No regressions in existing tests

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Update Documentation

### Overview

Mark the objective complete in ROADMAP.md to reflect that the Codex SDK runner implementation is finished.

### Changes Required:

#### 1. Update ROADMAP.md

**File**: `ROADMAP.md`
**Changes**: Mark the objective as complete (change `[ ]` to `[x]`)

Find line containing:
```markdown
- [ ] Implement tool allowlist enforcement in `src/agent/codex-sdk-runner.ts`
```

Change to:
```markdown
- [x] Implement tool allowlist enforcement in `src/agent/codex-sdk-runner.ts`
```

### Success Criteria:

#### Automated Verification:
- [ ] File is valid Markdown (no syntax errors)

#### Manual Verification:
- [ ] ROADMAP.md shows objective as complete
- [ ] Milestone [M2] progress is updated (if applicable)

---

## Testing Strategy

### Unit Tests

1. **Dry-run mode tests**:
   - Returns success without calling SDK
   - Logs tool restrictions when allowedTools provided

2. **Tool allowlist resolution tests**:
   - Explicit allowedTools takes precedence over phase
   - Falls back to phase-based allowlist when no explicit tools
   - No restrictions when neither allowedTools nor phase specified

### Integration Tests

Not implemented - would require actual API credentials. The SDK integration is already tested by amp-sdk-runner which uses the same underlying SDK.

### Manual Testing Steps

1. Run dry-run mode:
   ```bash
   wreckit research 027 --agent codex_sdk --dry-run
   ```
   Expected: Shows "[dry-run] Would run Codex SDK agent"

2. Run with tool restrictions (dry-run):
   ```bash
   WRECKIT_LOG_LEVEL=debug wreckit research 027 --agent codex_sdk --dry-run
   ```
   Expected: Debug log shows "Tool restrictions active: ..." if phase has restrictions

3. Verify dispatch works:
   - Config with `agent.kind: "codex_sdk"` should invoke the new runner

## Migration Notes

No migration needed - this is a new feature implementation. The dispatch code in `runner.ts:459-473` already exists and will work once the runner returns success.

## References

- Research: `/Users/speed/wreckit/.wreckit/items/027-implement-tool-allowlist-enforcement-in-srcagentco/research.md`
- Reference implementation: `src/agent/amp-sdk-runner.ts:53-184` (main function), `186-293` (error handling), `295-371` (helpers)
- Current stub: `src/agent/codex-sdk-runner.ts:70-83`
- Dispatch code: `src/agent/runner.ts:459-473`
- Tool allowlist definitions: `src/agent/toolAllowlist.ts:57-117`
- Environment builder: `src/agent/env.ts:79-108`
- Test pattern: `src/__tests__/amp-sdk-runner.test.ts:1-132`
- Schema: `src/schemas.ts:55-58`
