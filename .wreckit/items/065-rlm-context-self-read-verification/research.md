# Research: RLM context self-read verification

**Date**: 2025-01-27
**Item**: 065-rlm-context-self-read-verification

## Research Question

Need to confirm whether the RLM architecture is capable of reading its own context data.

**Success criteria:**
- RLM successfully reads CONTEXT_DATA
- RLM outputs 'I SEE YOU' message upon reading context data

## Summary

The RLM (ReAct Loop Mode) architecture has been successfully implemented in item 064 and uses an innovative **context offloading pattern** to manage large prompts. Instead of passing the full prompt to the AI model through the standard context window, RLM stores the prompt in a JavaScript runtime environment as a global variable called `CONTEXT_DATA`. The agent must then use the `RunJS` tool to "pull" this context, which allows for more efficient token usage and enables verification that the agent can access its own context.

The key innovation is at `src/agent/rlm-runner.ts:119-124` where a `JSRuntime` instance is created with the prompt stored as `CONTEXT_DATA`. The agent is then instructed to use the `RunJS` tool (defined in `src/agent/rlm-tools.ts:47-62`) to inspect this variable. The success criteria for this item require creating a test that verifies the agent can successfully read `CONTEXT_DATA` and output a specific "I SEE YOU" message, proving the context offloading architecture works correctly.

## Current State Analysis

### Existing Implementation

**RLM Context Offloading Architecture:**

The RLM implementation uses a three-layer approach to context management:

1. **Context Storage Layer** (`src/agent/rlm-runner.ts:119-124`):
   ```typescript
   const jsRuntime = new JSRuntime({
     CONTEXT_DATA: prompt,
     cwd: cwd,
   });
   ```
   The user's prompt is stored in a JavaScript VM context as a global variable instead of being passed directly to the AI model.

2. **Tool Access Layer** (`src/agent/rlm-tools.ts:47-62`):
   ```typescript
   export function createRunJSTool(runtime: JSRuntime): AxFunction {
     return {
       name: "RunJS",
       description: "Execute JavaScript code to process data. Access the global variable 'CONTEXT_DATA' to see the user's input.",
       parameters: {
         type: "object",
         properties: {
           code: { type: "string", description: "JavaScript code to execute" },
         },
         required: ["code"],
       } as AxFunctionJSONSchema,
       func: async ({ code }: { code: string }) => {
         return runtime.run(code);
       },
     };
   }
   ```
   The `RunJS` tool provides the agent with access to the JavaScript runtime where `CONTEXT_DATA` lives.

3. **Agent Instruction Layer** (`src/agent/rlm-runner.ts:145-151`):
   ```typescript
   const agent = new AxAgent({
     ai,
     name: "Wreckit Agent",
     description: `
       You are an expert software engineer.
       The user's request is stored in the global variable 'CONTEXT_DATA' within your JavaScript runtime.
       DO NOT assume you know the request. You MUST inspect 'CONTEXT_DATA' using the RunJS tool.
       You have access to file system tools and shell.
       Follow the instructions carefully and validate your work.
     `,
   ```
   The agent is explicitly instructed that it must use `RunJS` to access the task instructions.

**Trigger Message Pattern** (`src/agent/rlm-runner.ts:171`):
```typescript
const rlmTrigger = "The user's request has been loaded into the global variable `CONTEXT_DATA`. Use the `RunJS` tool to inspect it and begin the task.";
```
Instead of passing the full prompt, only a trigger message is sent to the agent, forcing it to pull the context.

**JavaScript Runtime Implementation** (`src/agent/rlm-tools.ts:12-44`):
The `JSRuntime` class uses Node.js's `vm` module to create an isolated JavaScript context:
```typescript
export class JSRuntime {
  private context: vm.Context;

  constructor(initialContext: Record<string, any> = {}) {
    this.context = vm.createContext({
      console: {
        log: (...args: any[]) => this.log("log", ...args),
        error: (...args: any[]) => this.log("error", ...args),
        warn: (...args: any[]) => this.log("warn", ...args),
      },
      ...initialContext,
    });
  }

  run(code: string): string {
    this.logs = [];
    try {
      const result = vm.runInContext(code, this.context);
      const output = this.logs.join("\n");
      return output ? `${output}\nResult: ${String(result)}` : String(result);
    } catch (error: any) {
      return `Runtime Error: ${error.message}`;
    }
  }
}
```

### Existing Tests

**Real Execution Test** (`src/agent/__tests__/rlm-real.test.ts:24-65`):
This test verifies that the agent can access offloaded context by:
1. Creating a secret code stored in `CONTEXT_DATA`
2. Instructing the agent to create a file with this code
3. Verifying the file contains the correct secret code

```typescript
it("should access offloaded context via RunJS tool (Real Execution)", async () => {
  const secretCode = `CODE_${Date.now()}`;
  const hiddenPrompt = `The secret code is "${secretCode}". Create a file named 'secret.txt' containing ONLY this code.`;

  const result = await runRlmAgent({
    config,
    cwd: tempDir,
    prompt: hiddenPrompt,  // This becomes CONTEXT_DATA
    logger,
    allowedTools: ["RunJS", "Write"],
  });

  expect(result.success).toBe(true);
  const secretFile = path.join(tempDir, "secret.txt");
  const content = await fs.readFile(secretFile, "utf-8");
  expect(content.trim()).toBe(secretCode);
}, 60000);
```

**Integration Test** (`src/agent/__tests__/rlm-integration.test.ts:29-53`):
Tests basic file operations using RLM mode, confirming the agent can complete tasks with restricted tools.

### Key Files

**Core RLM Implementation:**
- `src/agent/rlm-runner.ts:119-124` - JSRuntime initialization with CONTEXT_DATA
- `src/agent/rlm-runner.ts:128` - Tool registry building with runtime binding
- `src/agent/rlm-runner.ts:145-171` - Agent description and trigger message
- `src/agent/rlm-tools.ts:12-44` - JSRuntime class implementation
- `src/agent/rlm-tools.ts:47-62` - createRunJSTool function
- `src/agent/rlm-tools.ts:212-229` - buildToolRegistry with RunJS injection

**Schema:**
- `src/schemas.ts:65-70` - RlmSdkAgentSchema definition
- `src/schemas.ts:72-79` - AgentConfigUnionSchema including RLM

**Tests:**
- `src/agent/__tests__/rlm-real.test.ts:24-65` - Context offloading verification test
- `src/agent/__tests__/rlm-integration.test.ts:29-81` - Basic integration tests
- `src/agent/__tests__/rlm-runner.test.ts` - Unit tests for runner

**Workflow Integration:**
- `src/workflow/itemWorkflow.ts:323-340` - Agent invocation with prompt
- `src/agent/runner.ts:389-493` - Agent dispatcher with RLM case

## Technical Considerations

### Dependencies

**RLM-Specific Dependencies:**
- `@ax-llm/ax: ^16.0.11` - ReAct agent framework (from package.json:61)
- `mcporter: ^0.7.3` - MCP server proxying (from package.json:69)
- `vm` (Node.js built-in) - JavaScript VM for context isolation

**Existing Dependencies Used:**
- `@anthropic-ai/claude-agent-sdk: ^0.2.7` - MCP server patterns
- `zod: ^4.3.5` - Schema validation
- `pino: ^10.1.1` - Logging

### Patterns to Follow

**1. Context Offloading Pattern:**
Store prompts in JavaScript runtime instead of model context window to:
- Reduce token usage for large prompts
- Enable context inspection verification
- Allow dynamic context manipulation

**2. Tool Registry Pattern:**
```typescript
export function buildToolRegistry(allowedTools?: string[], jsRuntime?: JSRuntime): AxFunction[] {
  let tools = allowedTools
    ? allowedTools.map((name) => ALL_TOOLS[name]).filter(Boolean)
    : Object.values(ALL_TOOLS);

  // Always add RunJS if runtime provided (it's the core RLM mechanic)
  if (jsRuntime) {
     const runJsTool = createRunJSTool(jsRuntime);
     if (!allowedTools || allowedTools.includes("RunJS")) {
        tools.push(runJsTool);
     }
  }

  return tools;
}
```

**3. Agent Instruction Pattern:**
The agent's system description MUST explicitly instruct it to use `RunJS` to access `CONTEXT_DATA`. This is critical because the agent won't know about the offloaded context otherwise.

**4. Trigger Message Pattern:**
Don't pass the full prompt to the agent. Instead, pass a minimal trigger that instructs the agent to pull context from `CONTEXT_DATA`.

### Integration Points

**1. Workflow Prompt Rendering** (`src/workflow/itemWorkflow.ts:306-309`):
Prompts are rendered from templates using `renderPrompt()`, then passed to `runAgentUnion()` as the `prompt` parameter. This becomes `CONTEXT_DATA` in RLM mode.

**2. Tool Allowlist Enforcement** (`src/workflow/itemWorkflow.ts:339`):
The `allowedTools` parameter from skills or phase defaults is passed to the agent. The `RunJS` tool must be included (it is by default when runtime is provided).

**3. Agent Selection** (`src/agent/runner.ts:389-493`):
The `runAgentUnion()` dispatcher routes to `runRlmAgent()` when `config.kind === "rlm"`.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Agent doesn't use RunJS** | High | Agent system description explicitly instructs to use RunJS; trigger message reinforces this; test verifies compliance |
| **CONTEXT_DATA not accessible** | High | JSRuntime uses Node.js vm module for isolation; test with real API keys confirms accessibility; error handling in runtime.run() |
| **Token counting issues** | Medium | Context offloading reduces token usage; still need to monitor model context limits; implement timeout enforcement |
| **Test flakiness with real API** | Medium | Use fast model (claude-3-haiku) for tests; 60s timeout; skip if no API key present; deterministic secret code generation |
| **JavaScript execution security** | Low | vm module provides isolation; no file system access from runtime; only evals user-provided code in agent context |

## Recommended Approach

### Test Implementation Strategy

Based on the research, here's the recommended approach for item 065:

**Option 1: Extend Existing Real Test**
Modify `src/agent/__tests__/rlm-real.test.ts` to add a specific test case for the "I SEE YOU" verification:

```typescript
it("should read CONTEXT_DATA and output 'I SEE YOU' message", async () => {
  const env = await buildAxAIEnv({ cwd: process.cwd(), logger, provider: "zai" });
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log("Skipping: No API key found in env or settings.");
    return;
  }

  const secretMessage = `I SEE YOU`;
  const prompt = `Your task: Read CONTEXT_DATA and output exactly "${secretMessage}" as your final answer.`;

  const config: RlmSdkAgentConfig = {
    kind: "rlm",
    model: "claude-3-haiku-20240307",
    maxIterations: 10,
    aiProvider: "zai",
  };

  const result = await runRlmAgent({
    config,
    cwd: tempDir,
    prompt,
    logger,
    allowedTools: ["RunJS"],  // Only allow RunJS to force context reading
  });

  expect(result.success).toBe(true);
  expect(result.output).toContain(secretMessage);
  console.log("✓ Agent successfully read CONTEXT_DATA and confirmed with 'I SEE YOU'");
}, 60000);
```

**Option 2: Create Dedicated Test File**
Create `src/agent/__tests__/rlm-context-verification.test.ts` with comprehensive context reading tests.

### Success Verification

**Automated Checks:**
1. Test executes successfully with API key
2. Agent output contains "I SEE YOU" message
3. Test confirms agent used RunJS tool (via tool usage logs)
4. No errors in JavaScript runtime execution

**Manual Verification:**
1. Run test with `bun test src/agent/__tests__/rlm-context-verification.test.ts`
2. Observe agent output shows context inspection steps
3. Confirm "I SEE YOU" appears in final response
4. Verify no fallback to direct prompt reading

### Implementation Details

**Key Test Components:**

1. **Minimal Tool Allowlist**: Only provide `RunJS` tool to force the agent to use it
2. **Clear Instructions**: Prompt must explicitly tell agent to read `CONTEXT_DATA` and output "I SEE YOU"
3. **Fast Model**: Use `claude-3-haiku-20240307` for quick test execution
4. **Sufficient Iterations**: Set `maxIterations: 10` to allow for think-act-observe cycles
5. **Output Validation**: Check that `result.output` contains the expected message

**Expected Test Flow:**
1. Test creates RLM config with ZAI provider
2. Prompt is stored in `CONTEXT_DATA` (not sent to model directly)
3. Agent receives trigger message instructing to use RunJS
4. Agent calls `RunJS` with code like `CONTEXT_DATA`
5. Runtime returns the prompt content
6. Agent sees the instruction to output "I SEE YOU"
7. Agent completes with the message in its response
8. Test validates the message appears in output

## Open Questions

1. **Test Location**: Should this be a new test file or an addition to `rlm-real.test.ts`?
   - **Recommendation**: Add to existing `rlm-real.test.ts` since it requires real API execution

2. **Model Selection**: Should the test use a specific model or respect config?
   - **Recommendation**: Use `claude-3-haiku-20240307` for speed, but make it configurable

3. **Tool Allowlist**: Should we test with only RunJS or include other tools?
   - **Recommendation**: Test with only RunJS first to force context reading, then test with additional tools

4. **Error Handling**: What if the agent fails to read CONTEXT_DATA?
   - **Recommendation**: Test should fail explicitly if message not found; add helpful error message

5. **Provider Support**: Should we test multiple AI providers (zai, anthropic, openai)?
   - **Recommendation**: Start with zai (already configured in real tests), add others if needed

6. **Verification Method**: Should we check tool usage logs or just final output?
   - **Recommendation**: Final output is sufficient; tool logs would require additional instrumentation

## Appendix: Code Examples

**Example Test Case:**
```typescript
describe("RLM Context Self-Read Verification", () => {
  it("should read CONTEXT_DATA and output 'I SEE YOU'", async () => {
    const prompt = "Read CONTEXT_DATA and output 'I SEE YOU'";
    const result = await runRlmAgent({
      config: { kind: "rlm", model: "claude-3-haiku-20240307", aiProvider: "zai" },
      cwd: tempDir,
      prompt,
      logger,
      allowedTools: ["RunJS"],
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain("I SEE YOU");
  });
});
```

**Example Agent Interaction:**
```
Agent receives: "The user's request has been loaded into CONTEXT_DATA. Use RunJS to inspect it."

Agent thinks: I need to use RunJS to see what the user wants.

Agent acts: RunJS({ code: "CONTEXT_DATA" })

Runtime returns: "Read CONTEXT_DATA and output 'I SEE YOU'"

Agent thinks: The user wants me to output 'I SEE YOU'. I can do that.

Agent completes: "I SEE YOU"
```

**Expected Console Output:**
```
Starting RLM agent (model: claude-3-haiku-20240307)
[Thought] I need to inspect CONTEXT_DATA to see the user's request
[Action] RunJS({ code: "CONTEXT_DATA" })
[Observation] Read CONTEXT_DATA and output 'I SEE YOU'
[Complete] I SEE YOU

✓ Agent successfully read CONTEXT_DATA and confirmed with 'I SEE YOU'
```

## References

- Item 064 Research: `/Users/speed/wreckit/.wreckit/items/064-rlm-mode-implementation-with-ax-mcporter/research.md`
- Item 064 Plan: `/Users/speed/wreckit/.wreckit/items/064-rlm-mode-implementation-with-ax-mcporter/plan.md`
- RLM Runner: `src/agent/rlm-runner.ts:119-171`
- JS Runtime: `src/agent/rlm-tools.ts:12-62`
- Real Test: `src/agent/__tests__/rlm-real.test.ts:24-65`
- Schema: `src/schemas.ts:65-70`
- Workflow: `src/workflow/itemWorkflow.ts:323-340`
