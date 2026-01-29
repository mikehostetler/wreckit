# RLM Context Self-Read Verification Implementation Plan

## Overview

This item verifies that the RLM (ReAct Loop Mode) architecture can successfully read its own context data stored in the `CONTEXT_DATA` global variable. The test will confirm that the agent uses the `RunJS` tool to pull the prompt from the JavaScript runtime and outputs a specific "I SEE YOU" message, proving the context offloading pattern works correctly.

## Current State Analysis

### Existing Implementation (from Item 064)

The RLM architecture is fully implemented with the following key components:

1. **Context Storage Layer** (`src/agent/rlm-runner.ts:119-124`):
   - `JSRuntime` instance stores the prompt as `CONTEXT_DATA` global variable
   - Prompt is NOT passed to the model through the context window

2. **Tool Access Layer** (`src/agent/rlm-tools.ts:47-62`):
   - `RunJS` tool provides access to the JavaScript runtime
   - Agent can execute JavaScript code to inspect `CONTEXT_DATA`

3. **Agent Instruction Layer** (`src/agent/rlm-runner.ts:145-151`):
   - Agent description explicitly instructs to use `RunJS` to access `CONTEXT_DATA`
   - Trigger message (`rlm-runner.ts:171`) reinforces this instruction

4. **Existing Tests**:
   - `src/agent/__tests__/rlm-real.test.ts:24-65` - Tests context offloading with secret code
   - `src/agent/__tests__/rlm-integration.test.ts:29-81` - Tests basic file operations
   - `src/agent/__tests__/rlm-runner.test.ts` - Unit tests for runner

### What's Missing

While the existing `rlm-real.test.ts` verifies context offloading by having the agent create a file with a secret code, the success criteria for **item 065** specifically require:
- A test where the agent outputs "I SEE YOU" message upon reading context data
- Direct verification of the agent's output (not just side effects)

## Desired End State

A new test case in `src/agent/__tests__/rlm-real.test.ts` that:
1. Stores a prompt in `CONTEXT_DATA` instructing the agent to output "I SEE YOU"
2. Restricts tools to only `RunJS` to force context reading
3. Verifies the agent's final output contains the "I SEE YOU" message
4. Confirms the agent successfully read the offloaded context

### Key Discoveries

- **Pattern to Follow**: The existing test at `rlm-real.test.ts:24-65` provides the template for real API execution tests
- **Test Location**: Add to existing `rlm-real.test.ts` since it requires real API keys and follows the same pattern
- **Model Selection**: Use `claude-3-haiku-20240307` for fast execution (consistent with existing tests)
- **Provider Support**: Use ZAI provider (already configured in real tests with fallback to Anthropic)
- **Tool Restriction**: Only allow `RunJS` tool to force the agent to use context offloading

## What We're NOT Doing

- **NOT creating a new test file**: The test fits naturally in the existing `rlm-real.test.ts` file
- **NOT modifying RLM architecture**: The architecture is already working; we're only adding a verification test
- **NOT testing multiple providers**: Starting with ZAI provider (already configured), can add others later if needed
- **NOT adding instrumentation**: We're checking final output only, not detailed tool usage logs
- **NOT changing the agent description or trigger message**: The existing instructions are sufficient

## Implementation Approach

### Strategy

Add a single, focused test case to `src/agent/__tests__/rlm-real.test.ts` that directly validates the success criteria. The test will:

1. Create a prompt that instructs the agent to output "I SEE YOU" after reading `CONTEXT_DATA`
2. Configure RLM with only `RunJS` tool (no file system tools)
3. Run the agent and capture its output
4. Verify the output contains the expected "I SEE YOU" message

This approach is minimal, targeted, and follows existing patterns. It provides clear evidence that the RLM architecture can read its own context.

---

## Phase 1: Add Context Self-Read Verification Test

### Overview

Add a new test case to the existing `rlm-real.test.ts` file that verifies the agent can read `CONTEXT_DATA` and output the "I SEE YOU" message.

### Changes Required:

#### 1. Test File: `src/agent/__tests__/rlm-real.test.ts`

**Location**: After line 65 (after the existing "should access offloaded context" test)

**Add new test case**:

```typescript
it("should read CONTEXT_DATA and output 'I SEE YOU' message", async () => {
  // Detect environment using the real tool
  const env = await buildAxAIEnv({ cwd: process.cwd(), logger, provider: "zai" });

  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log("Skipping: No API key found in env or settings.");
    return;
  }

  // 1. Prompt stored in CONTEXT_DATA (not sent to model directly)
  const secretMessage = "I SEE YOU";
  const hiddenPrompt = `Read the global variable CONTEXT_DATA and output exactly "${secretMessage}" as your final answer.`;

  // 2. Config - use fast model for quick execution
  const config: RlmSdkAgentConfig = {
    kind: "rlm",
    model: "claude-3-haiku-20240307",
    maxIterations: 10,
    aiProvider: "zai",
  };

  console.log(`Running RLM context self-read verification with Z.AI (Base: ${env.ANTHROPIC_BASE_URL})`);

  // 3. Run the Agent with ONLY RunJS tool to force context reading
  const result = await runRlmAgent({
    config,
    cwd: tempDir,
    prompt: hiddenPrompt,
    logger,
    allowedTools: ["RunJS"], // Only tool available is RunJS
  });

  // 4. Verification - check agent's output contains the message
  expect(result.success).toBe(true);
  expect(result.output).toContain(secretMessage);

  console.log(`✓ Agent successfully read CONTEXT_DATA and confirmed with '${secretMessage}'`);
}, 60000);
```

### Success Criteria:

#### Automated Verification:
- [ ] Test passes: `bun test src/agent/__tests__/rlm-real.test.ts`
- [ ] Agent outputs "I SEE YOU" message in `result.output`
- [ ] Test completes without timeout (60s limit)
- [ ] Agent returns `success: true`

#### Manual Verification:
1. Ensure API key is available (ANTHROPIC_API_KEY or ZAI_API_KEY)
2. Run the test: `bun test src/agent/__tests__/rlm-real.test.ts`
3. Observe console output shows the agent using RunJS to inspect CONTEXT_DATA
4. Confirm test passes with "✓ Agent successfully read CONTEXT_DATA and confirmed with 'I SEE YOU'"
5. Verify no errors in JavaScript runtime execution

**Note**: This is a single-phase implementation. Once automated verification passes, the item is complete.

---

## Testing Strategy

### Unit Tests:

No unit tests required - this is purely an integration test that verifies the end-to-end behavior.

### Integration Tests:

The new test case **is** the integration test. It verifies:
- Agent can access `CONTEXT_DATA` through `RunJS` tool
- Agent follows instructions to output a specific message
- Context offloading pattern works as designed
- Agent can complete tasks with only the `RunJS` tool available

### Test Execution Flow:

1. **Setup**: Test detects API key availability, skips if missing
2. **Context Storage**: Prompt is stored in `CONTEXT_DATA` global variable (line 122 in `rlm-runner.ts`)
3. **Agent Initialization**: Agent receives trigger message (line 171 in `rlm-runner.ts`)
4. **Context Reading**: Agent calls `RunJS({ code: "CONTEXT_DATA" })` to retrieve the prompt
5. **Instruction Following**: Agent sees instruction to output "I SEE YOU"
6. **Output Verification**: Test checks `result.output` contains the expected message

### Expected Agent Behavior:

```
[Thought] I need to inspect CONTEXT_DATA to see the user's request
[Action] RunJS({ code: "CONTEXT_DATA" })
[Observation] "Read the global variable CONTEXT_DATA and output exactly 'I SEE YOU' as your final answer."
[Thought] The user wants me to output 'I SEE YOU'
[Complete] I SEE YOU
```

### Manual Testing Steps:

1. **Prerequisites**: Set `ANTHROPIC_API_KEY` or `ZAI_API_KEY` environment variable
2. **Run Test**: `bun test src/agent/__tests__/rlm-real.test.ts`
3. **Verify Output**: Look for "✓ Agent successfully read CONTEXT_DATA and confirmed with 'I SEE YOU'"
4. **Check Duration**: Test should complete in < 30 seconds
5. **Validate Success**: Test should pass with green checkmark

## Migration Notes

No migration required. This is a new test case that doesn't change any existing behavior or APIs.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Test flakiness with real API** | Medium | Use 60s timeout; skip if no API key; use fast model (haiku); deterministic message |
| **Agent doesn't use RunJS** | Low | Agent description explicitly instructs to use RunJS; trigger message reinforces this; only tool available |
| **CONTEXT_DATA not accessible** | Low | Existing test already proves accessibility; JSRuntime uses Node.js vm module correctly |
| **Message not in output** | Low | Clear prompt instructions; agent is completing task (not creating files); output check is straightforward |

## References

- Research: `/Users/speed/wreckit/.wreckit/items/065-rlm-context-self-read-verification/research.md`
- Item 064 Research: `/Users/speed/wreckit/.wreckit/items/064-rlm-mode-implementation-with-ax-mcporter/research.md`
- Item 064 Plan: `/Users/speed/wreckit/.wreckit/items/064-rlm-mode-implementation-with-ax-mcporter/plan.md`
- RLM Runner: `src/agent/rlm-runner.ts:119-171` (JSRuntime initialization and trigger message)
- JS Runtime: `src/agent/rlm-tools.ts:12-62` (RunJS tool implementation)
- Real Test: `src/agent/__tests__/rlm-real.test.ts:24-65` (existing context offloading test)
- Schema: `src/schemas.ts:65-70` (RlmSdkAgentSchema definition)
