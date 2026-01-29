# Research: RLM Mode Implementation with Ax + MCPorter

**Date**: 2025-01-27
**Item**: 064-rlm-mode-implementation-with-ax-mcporter

## Research Question

Wreckit currently supports only Direct execution via various SDK runners. We need to add a more sophisticated reasoning loop mode that can handle complex tasks through iterative think-act-observe cycles.

**Motivation:** Enable Wreckit to solve more complex coding tasks by leveraging a ReAct agent pattern. This provides better tool orchestration and reasoning capabilities compared to direct execution.

**Success criteria:**
- RlmRunner implements the Wreckit Agent interface
- Can load and use built-in tools as AxFunctions
- Can load and proxy MCP servers via mcporter
- Agent can execute tasks using ReAct pattern with configurable max iterations
- CLI can select RlmRunner when requested via command or flag

**Technical constraints:**
- Must use @ax-llm/ax as the ReAct agent framework
- Must use mcporter for MCP server proxying
- Must integrate with existing Wreckit Agent/Runner interface
- Must support multiple AI providers via AxAI configuration
- Must work with bun runtime

**In scope:**
- Create new RlmRunner class in src/agent/rlm-runner.ts
- Implement MCP client adapter using mcporter
- Expose builtin tools for agent use
- Register rlm command/flag in CLI
- Map Wreckit config to AxAI config
- Support both built-in and MCP-provided tools

**Signals:** priority: high, urgency: New feature implementation, no explicit timeline stated

## Summary

Wreckit currently implements a direct execution model where agents are invoked through SDK runners (Claude, Amp, Codex, OpenCode) or process-based execution. The architecture uses a discriminated union pattern for agent configuration (`AgentConfigUnion`) with a dispatcher (`runAgentUnion`) that routes to the appropriate runner based on the `kind` field.

To implement RLM mode, we need to:
1. **Add a new agent kind** (`rlm`) to the `AgentConfigUnion` schema in `src/schemas.ts:65-71`
2. **Create RlmRunner** following the pattern of existing SDK runners (`src/agent/claude-sdk-runner.ts`, `src/agent/amp-sdk-runner.ts`, etc.)
3. **Integrate @ax-llm/ax** as a new dependency and implement the ReAct agent pattern
4. **Use mcporter** to proxy MCP servers, adapting the existing MCP server pattern in `src/agent/mcp/wreckitMcpServer.ts`
5. **Map built-in tools** (Read, Write, Edit, Glob, Grep, Bash) to AxFunctions
6. **Add CLI flag** to select RLM mode (similar to how other agent kinds are selected)
7. **Configure AxAI** to support multiple AI providers through environment variable mapping

The integration should follow the established patterns for environment variable resolution (`src/agent/env.ts`), tool allowlisting (`src/agent/toolAllowlist.ts`), and MCP server management.

## Current State Analysis

### Existing Implementation

**Agent Architecture:**
Wreckit uses a discriminated union pattern for agent configuration with the following structure:

- **Schema Definition** (`src/schemas.ts:37-71`): Defines `AgentConfigUnionSchema` with discriminated union on `kind` field
  - `process`: External CLI process execution
  - `claude_sdk`: Claude Agent SDK (default)
  - `amp_sdk`: Sourcegraph Amp SDK
  - `codex_sdk`: OpenAI Codex SDK
  - `opencode_sdk`: OpenCode SDK

- **Agent Dispatcher** (`src/agent/runner.ts:348-494`): `runAgentUnion()` function routes execution based on `config.kind`
  - Each case imports and calls the appropriate runner function
  - Supports `dryRun`, `mockAgent`, `timeoutSeconds` options
  - Passes `mcpServers` and `allowedTools` to runners

- **SDK Runner Pattern** (`src/agent/claude-sdk-runner.ts:1-112`): Shows the canonical implementation:
  ```typescript
  export async function runClaudeSdkAgent(
    options: RunAgentOptions,
    config: AgentConfig
  ): Promise<AgentResult>
  ```
  - Takes `RunAgentOptions` with `cwd`, `prompt`, `logger`, `mcpServers`, `allowedTools`
  - Builds SDK environment via `buildSdkEnv({ cwd, logger })`
  - Registers `AbortController` for cleanup
  - Returns `AgentResult` with `success`, `output`, `timedOut`, `exitCode`, `completionDetected`

**MCP Server Integration:**
- **Built-in MCP Server** (`src/agent/mcp/wreckitMcpServer.ts:47-140`): Uses `@anthropic-ai/claude-agent-sdk`'s `createSdkMcpServer()`
  - Defines tools using `tool(name, description, schema, handler)` function
  - Tools: `save_interview_ideas`, `save_parsed_ideas`, `save_prd`, `update_story_status`
  - Passed to agents via `mcpServers` option: `mcpServers: { wreckit: wreckitMcpServer }`

**Tool Allowlisting** (`src/agent/toolAllowlist.ts:58-143`):
- Defines `AVAILABLE_TOOLS` constant with built-in tool names (Read, Write, Edit, Glob, Grep, Bash)
- MCP tools use naming convention: `mcp__<server_name>__<tool_name>`
- `PHASE_TOOL_ALLOWLISTS` maps phases to allowed tools (research, plan, implement, etc.)
- Enforced in workflow via `allowedTools` option

**Configuration System** (`src/config.ts:1-231`):
- `AgentConfigUnion` type inferred from discriminated union schema
- `loadConfig(root)` loads and validates config from `.wreckit/config.json`
- Default agent config: `{ kind: "claude_sdk", model: "claude-sonnet-4-20250514", max_tokens: 4096 }`
- Migration layer supports legacy `mode: "sdk"` format

**Environment Variable Resolution** (`src/agent/env.ts:79-108`):
- Precedence: `.wreckit/config.local.json agent.env` → `.wreckit/config.json agent.env` → `process.env` → `~/.claude/settings.json env`
- Only imports allowed prefixes: `ANTHROPIC_`, `CLAUDE_CODE_`, `API_TIMEOUT`
- Handles custom base URL auth token scenarios

**Usage in Workflow** (`src/workflow/itemWorkflow.ts:323-340`):
```typescript
const result = await agentRunner({
  config: agentConfig,
  cwd: itemDir,
  prompt,
  logger,
  dryRun,
  mockAgent,
  timeoutSeconds: config.timeout_seconds,
  onStdoutChunk: onAgentOutput,
  onStderrChunk: onAgentOutput,
  onAgentEvent,
  mcpServers: {
    ...(skillResult.mcpServers || {}),
  },
  allowedTools: skillResult.allowedTools,
}, healingConfig, itemId);
```

### Key Files

**Agent Core:**
- `src/agent/runner.ts:56-94` - `AgentConfig` interface and `runAgent()` legacy API
- `src/agent/runner.ts:323-494` - `runAgentUnion()` dispatcher function with discriminated union switch
- `src/agent/index.ts:1-23` - Public API exports

**SDK Runners (Pattern to Follow):**
- `src/agent/claude-sdk-runner.ts:1-112` - Claude SDK implementation with query() API
- `src/agent/amp-sdk-runner.ts:34-89` - Amp SDK with execute() API
- `src/agent/codex-sdk-runner.ts:34-93` - Codex SDK with client.thread.run() API
- `src/agent/opencode-sdk-runner.ts:34-109` - OpenCode SDK with client.session.create() API

**Schema & Config:**
- `src/schemas.ts:37-71` - Discriminated union schema definition
- `src/schemas.ts:272-277` - Type exports for agent configs
- `src/config.ts:23-35` - `ConfigResolved` interface with `agent: AgentConfigUnion`
- `src/config.ts:47-70` - `DEFAULT_CONFIG` with Claude SDK as default

**MCP Integration:**
- `src/agent/mcp/wreckitMcpServer.ts:47-140` - MCP server creation pattern
- `src/agent/mcp/wreckitMcpServer.ts:1-46` - Handler interfaces and schemas

**Tool Management:**
- `src/agent/toolAllowlist.ts:19-38` - `AVAILABLE_TOOLS` constant with tool names
- `src/agent/toolAllowlist.ts:58-143` - `PHASE_TOOL_ALLOWLISTS` for each phase
- `src/agent/toolAllowlist.ts:151-169` - `getAllowedToolsForPhase()` function

**Environment & Configuration:**
- `src/agent/env.ts:79-108` - `buildSdkEnv()` for environment variable resolution
- `src/agent/env.ts:16-44` - `readClaudeUserEnv()` for ~/.claude/settings.json

**Workflow Integration:**
- `src/workflow/itemWorkflow.ts:78-92` - `WorkflowOptions` interface with agent options
- `src/workflow/itemWorkflow.ts:323-340` - Agent invocation with all options

**CLI Integration:**
- `src/index.ts:1-768` - CLI commands and flags (no current agent selection flags)

## Technical Considerations

### Dependencies

**New Dependencies Required:**
1. **@ax-llm/ax** - ReAct agent framework (not currently in package.json)
2. **mcporter** - MCP server proxying library (not currently in package.json)

**Existing Dependencies to Leverage:**
- `@anthropic-ai/claude-agent-sdk: ^0.2.7` - For MCP server patterns and tool definitions
- `zod: ^4.3.5` - For schema validation (already used extensively)
- `commander: ^14.0.2` - For CLI flag registration
- `pino: ^10.1.1` - For logging

### Integration Points

**1. Schema Extension** (`src/schemas.ts`):
Add new discriminated union member after `OpenCodeSdkAgentSchema`:
```typescript
export const RlmSdkAgentSchema = z.object({
  kind: z.literal("rlm"),
  model: z.string().default("claude-sonnet-4-20250514"),
  maxIterations: z.number().default(100),
  aiProvider: z.enum(["anthropic", "openai", "google"]).default("anthropic"),
});
```
Update `AgentConfigUnionSchema` to include `RlmSdkAgentSchema`.

**2. Runner Implementation** (new file `src/agent/rlm-runner.ts`):
Follow the pattern of `claude-sdk-runner.ts`:
```typescript
export async function runRlmAgent(options: RlmRunAgentOptions): Promise<AgentResult>
```
Key differences:
- Use @ax-llm/ax framework instead of direct SDK calls
- Implement ReAct loop with think-act-observe cycles
- Use mcporter to proxy MCP servers
- Map Wreckit built-in tools to AxFunctions

**3. CLI Integration** (`src/index.ts`):
- Add global flag: `--agent <kind>` (options: claude_sdk, amp_sdk, codex_sdk, opencode_sdk, rlm)
- Or add phase-specific: `wreckit --rlm <id>` for explicit RLM mode
- Default behavior controlled by config file `agent.kind`

**4. Environment Mapping** (`src/agent/env.ts`):
Extend to support AxAI configuration:
```typescript
// Map ANTHROPIC_API_KEY to AxAI provider config
// Map OPENAI_API_KEY to AxAI provider config
// Map GOOGLE_API_KEY to AxAI provider config
```

**5. MCP Server Proxying** (new module in `src/agent/mcp/`):
Create adapter to convert Claude SDK MCP servers to mcporter format:
```typescript
// src/agent/mcp/mcporterAdapter.ts
export function adaptMcp ServersToMcporter(
  mcpServers: Record<string, any>
): McporterServerConfig[]
```

### Patterns to Follow

**1. SDK Runner Structure:**
All runners follow this signature:
```typescript
export async function runXxxAgent(
  options: XxxRunAgentOptions
): Promise<AgentResult>
```

Where `XxxRunAgentOptions` extends:
```typescript
{
  config: XxxSdkAgentConfig;
  cwd: string;
  prompt: string;
  logger: Logger;
  dryRun?: boolean;
  onStdoutChunk?: (chunk: string) => void;
  onStderrChunk?: (chunk: string) => void;
  onAgentEvent?: (event: AgentEvent) => void;
  mcpServers?: Record<string, unknown>;
  allowedTools?: string[];
}
```

**2. AbortController Pattern:**
```typescript
const abortController = new AbortController();
registerSdkController(abortController);
try {
  // ... agent execution
} finally {
  unregisterSdkController(abortController);
}
```

**3. DryRun and MockAgent Checks:**
```typescript
if (dryRun) {
  logger.info("[dry-run] Would run Xxx SDK agent");
  return { success: true, output: "[dry-run]", ... };
}
```

**4. Error Handling Pattern:**
```typescript
catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  logger.error(`Xxx SDK error: ${errorMessage}`);
  return {
    success: false,
    output: output + `\nError: ${errorMessage}`,
    timedOut: false,
    exitCode: 1,
    completionDetected: false,
  };
}
```

**5. Tool Allowlist Integration:**
```typescript
const effectiveTools = options.allowedTools ?? getAllowedToolsForPhase(phase);
// Pass to agent as tool restriction
```

**6. MCP Server Merging:**
```typescript
mcpServers: {
  wreckit: createWreckitMcpServer(handlers),
  ...(skillResult.mcpServers || {}),
}
```

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **@ax-llm/ax API stability** | High | The library may be unstable or have breaking changes. Pin to specific version, create abstraction layer, implement feature detection, have fallback to Claude SDK. |
| **mcporter compatibility** | High | mcporter may not support Claude SDK MCP server format. Build adapter layer, test with wreckit MCP servers early, have manual MCP fallback. |
| **Bun runtime compatibility** | Medium | @ax-llm/ax may not be tested with Bun. Test early in Bun environment, check for Node-specific APIs, report issues if found. |
| **Performance overhead** | Medium | ReAct loop adds latency vs direct execution. Benchmark against Claude SDK, make RLM opt-in, add progress indicators, consider caching. |
| **Tool mapping complexity** | Medium | Built-in tools may not map cleanly to AxFunctions. Create comprehensive tool registry, validate all tools, document limitations, provide examples. |
| **Configuration drift** | Low | AxAI config may diverge from Wreckit config. Centralize config mapping, document schema changes, add validation warnings. |
| **Testing coverage** | Medium | New code path needs testing. Add unit tests for RlmRunner, integration tests for ReAct loop, isospec tests for config validation, test with mock agent. |
| **Error handling** | Medium | ReAct failures may be complex. Handle agent errors gracefully, provide clear error messages, implement retry logic, log debugging info. |

## Recommended Approach

Based on the research findings, here's the recommended implementation strategy:

### Phase 1: Foundation (Week 1)

1. **Add Dependencies**
   ```bash
   bun add @ax-llm/ax mcporter
   ```

2. **Schema Extension** (`src/schemas.ts`)
   - Add `RlmSdkAgentSchema` discriminated union member
   - Update `AgentConfigUnionSchema` to include RLM
   - Export `RlmSdkAgentConfig` type
   - Update default config to document RLM option

3. **Minimal RlmRunner** (`src/agent/rlm-runner.ts`)
   - Create `runRlmAgent()` function following SDK runner pattern
   - Implement basic ReAct loop with @ax-llm/ax
   - Add dryRun and mockAgent support
   - Return `AgentResult` in correct format
   - Don't implement tools or MCP yet

4. **Dispatcher Integration** (`src/agent/runner.ts`)
   - Add `case "rlm":` to `runAgentUnion()` switch
   - Import and call `runRlmAgent()`
   - Test with minimal config

### Phase 2: Tool Integration (Week 2)

5. **Built-in Tool Mapping** (`src/agent/rlm-tools.ts`)
   - Create registry mapping Wreckit tools to AxFunctions
   - Implement Read, Write, Edit, Glob, Grep as AxFunctions
   - Implement Bash as AxFunction with safety checks
   - Validate tool outputs match expected formats

6. **Tool Allowlist Support**
   - Integrate `allowedTools` option in RlmRunner
   - Filter available tools based on phase
   - Log tool restrictions clearly

7. **Progress Callbacks**
   - Implement `onStdoutChunk` for ReAct reasoning output
   - Implement `onAgentEvent` for tool usage tracking
   - Emit events for think/act/observe cycles

### Phase 3: MCP Integration (Week 3)

8. **mcporter Adapter** (`src/agent/mcp/mcporterAdapter.ts`)
   - Create adapter to convert Claude SDK MCP servers to mcporter format
   - Test with wreckit MCP server
   - Handle tool name translation (mcp__ prefix)
   - Implement error handling for unsupported features

9. **MCP Server Loading** (`src/agent/rlm-mcp.ts`)
   - Load MCP servers from `mcpServers` option
   - Pass through mcporter adapter
   - Merge with built-in tools
   - Test with wreckit MCP tools

10. **Environment Configuration** (`src/agent/env.ts`)
    - Extend `buildSdkEnv()` to support AxAI providers
    - Map ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY
    - Add validation for provider-specific settings
    - Document AxAI configuration options

### Phase 4: CLI & Polish (Week 4)

11. **CLI Integration** (`src/index.ts`)
    - Add `--agent <kind>` global flag
    - Add `wreckit --rlm` shorthand
    - Update help text
    - Add examples to AGENTS.md

12. **Testing**
    - Unit tests for RlmRunner core logic
    - Integration tests for ReAct loop
    - IsoSpec tests for config validation
    - Test with mock agent
    - Test MCP tool invocation

13. **Documentation**
    - Update AGENTS.md with RLM mode section
    - Document AxAI configuration
    - Add troubleshooting guide
    - Document tool mapping
    - Provide example configs

### Implementation Details

**ReAct Loop Structure:**
```typescript
// Pseudo-code for ReAct implementation
async function runRlmAgent(options: RlmRunAgentOptions): Promise<AgentResult> {
  const { prompt, config, cwd, logger } = options;
  let output = "";
  let iterations = 0;
  const maxIterations = config.maxIterations || 100;

  // Initialize Ax agent
  const agent = new AxAgent({
    provider: config.aiProvider || "anthropic",
    model: config.model,
    tools: buildToolRegistry(options.allowedTools),
    mcpServers: adaptMcpServers(options.mcpServers),
  });

  // ReAct loop
  while (iterations < maxIterations) {
    iterations++;

    // Think: Agent reasons about next action
    const thought = await agent.think(prompt + output);
    output += `Thought: ${thought}\n`;

    // Act: Agent decides on tool use or completion
    const action = await agent.act(thought);

    if (action.type === "complete") {
      return { success: true, output, ... };
    }

    // Observe: Execute tool and observe result
    const result = await executeTool(action.tool, action.input);
    output += `Observation: ${result}\n`;
  }

  return { success: false, output, error: "Max iterations exceeded" };
}
```

**Tool Registry Pattern:**
```typescript
// src/agent/rlm-tools.ts
export function buildToolRegistry(allowedTools?: string[]): AxFunction[] {
  const allTools = {
    Read: createAxFunction({
      name: "Read",
      description: "Read file contents",
      parameters: z.object({ path: z.string() }),
      handler: async ({ path }) => {
        return await fs.readFile(path, "utf-8");
      },
    }),
    Write: createAxFunction({ /* ... */ }),
    // ... other tools
  };

  if (!allowedTools) return Object.values(allTools);

  return allowedTools.map(name => allTools[name]).filter(Boolean);
}
```

**MCP Adapter Pattern:**
```typescript
// src/agent/mcp/mcporterAdapter.ts
export function adaptMcpServersToMcporter(
  mcpServers: Record<string, any>
): McporterServerConfig[] {
  return Object.entries(mcpServers).map(([name, server]) => {
    // Convert Claude SDK server to mcporter format
    return {
      name,
      transport: {
        type: "stdio",
        command: "node",
        args: ["--eval", `require('@anthropic-ai/claude-agent-sdk').startMcpServer(${JSON.stringify(server)})`],
      },
    };
  });
}
```

## Open Questions

1. **@ax-llm/ax API Specifics**: What is the exact API for creating ReAct agents? Need to review documentation and examples to understand:
   - How to create an AxAgent instance
   - How to register tools as AxFunctions
   - How to implement the ReAct loop (think-act-observe)
   - How to handle streaming responses
   - Error handling patterns

2. **mcporter Integration**: How does mcporter work with existing MCP servers?
   - Can it proxy Claude SDK MCP servers directly?
   - What adapter layer is needed?
   - How to handle tool name translation?
   - What are the performance implications?

3. **AxAI Configuration**: How to map Wreckit's multi-provider config to AxAI?
   - What environment variables does AxAI expect?
   - How to switch between Anthropic, OpenAI, Google?
   - Are there provider-specific settings needed?
   - How to handle API key resolution?

4. **Tool Mapping Granularity**: Should tools be mapped individually or use a generic adapter?
   - Individual mapping: More control, more maintenance
   - Generic adapter: Less control, less maintenance
   - Hybrid approach for best of both?

5. **ReAct Loop Control**: How to detect completion vs. continued iteration?
   - What signal does Ax use to indicate task completion?
   - How to handle max iterations limit?
   - What to do if agent gets stuck in a loop?
   - How to implement early stopping criteria?

6. **Testing Strategy**: How to test the ReAct loop effectively?
   - Unit tests for individual components?
   - Integration tests with mock tools?
   - End-to-end tests with real tools?
   - Performance benchmarks vs. direct SDK?

7. **Backward Compatibility**: How to ensure existing configs don't break?
   - Default to existing agent kind if RLM not specified?
   - Migration guide for users wanting to adopt RLM?
   - Deprecation warnings or silent upgrades?

8. **Error Recovery**: What happens when ReAct loop fails mid-execution?
   - How to report partial progress?
   - Can the loop be resumed?
   - What state needs to be persisted?
   - How to handle tool execution failures?

## Appendix: Code Examples

**Example Config with RLM:**
```json
{
  "schema_version": 1,
  "base_branch": "main",
  "agent": {
    "kind": "rlm",
    "model": "claude-sonnet-4-20250514",
    "maxIterations": 100,
    "aiProvider": "anthropic"
  },
  "max_iterations": 100,
  "timeout_seconds": 3600
}
```

**Example CLI Usage:**
```bash
# Use RLM mode for specific item
wreckit --agent rlm run 001

# Use RLM mode for all items
wreckit --agent rlm

# Shorthand
wreckit --rlm
```

**Example Tool Registration:**
```typescript
import { createAxFunction } from "@ax-llm/ax";

export const readTool = createAxFunction({
  name: "Read",
  description: "Read the contents of a file",
  parameters: z.object({
    path: z.string().describe("File path to read"),
  }),
  handler: async ({ path }) => {
    const content = await fs.readFile(path, "utf-8");
    return { content };
  },
});
```

**Example ReAct Loop:**
```typescript
for (let i = 0; i < maxIterations; i++) {
  // Agent thinks about what to do
  const thought = await agent.think(currentState);
  logger.debug(`[Iteration ${i}] Thought: ${thought}`);

  // Agent decides on action
  const action = await agent.decide(thought);

  if (action.type === "complete") {
    logger.info("Agent completed task");
    return { success: true, output: action.result };
  }

  // Execute tool
  const result = await executeAction(action);
  logger.debug(`[Iteration ${i}] Action: ${action.toolName} -> ${result}`);

  // Update state with observation
  currentState += `\nObservation: ${result}\n`;
}
```
