# RLM Mode Implementation with Ax + MCPorter Implementation Plan

## Overview

This implementation adds a new agent kind (`rlm`) to Wreckit that implements a ReAct (Reasoning + Acting) agent pattern using the `@ax-llm/ax` framework and `mcporter` for MCP server proxying. This enables more sophisticated task execution through iterative think-act-observe cycles, providing better tool orchestration for complex coding tasks compared to direct SDK execution.

**Key Deliverable:** A fully functional `RlmRunner` that integrates with Wreckit's existing agent architecture while supporting built-in tools, MCP servers, and multi-provider AI configuration.

## Current State Analysis

Wreckit currently uses a discriminated union pattern for agent configuration in `src/schemas.ts:65-71` with five agent kinds:

1. **process**: External CLI process execution
2. **claude_sdk**: Claude Agent SDK (default)
3. **amp_sdk**: Sourcegraph Amp SDK
4. **codex_sdk**: OpenAI Codex SDK
5. **opencode_sdk**: OpenCode SDK

The `runAgentUnion()` function in `src/agent/runner.ts:389-493` dispatches to the appropriate SDK runner based on the `config.kind` field. Each SDK runner follows a consistent pattern:

- Takes a typed options object with `config`, `cwd`, `prompt`, `logger`, `dryRun`, `onStdoutChunk`, `onStderrChunk`, `onAgentEvent`, `mcpServers`, and `allowedTools`
- Registers an `AbortController` for cleanup
- Builds SDK environment via `buildSdkEnv()` from `src/agent/env.ts`
- Returns `AgentResult` with `success`, `output`, `timedOut`, `exitCode`, and `completionDetected`
- Handles errors with detailed, user-friendly messages

**Key Constraints Discovered:**
- Wreckit uses the Claude Agent SDK's MCP server format (`createSdkMcpServer()` from `@anthropic-ai/claude-agent-sdk`)
- Built-in tools use specific names: "Read", "Write", "Edit", "Glob", "Grep", "Bash"
- MCP tools follow the naming convention: `mcp__<server_name>__<tool_name>`
- Tool allowlists are enforced via `allowedTools` option from `src/agent/toolAllowlist.ts`
- Environment variables are resolved from multiple sources with precedence: `.wreckit/config.local.json` → `.wreckit/config.json` → `process.env` → `~/.claude/settings.json`
- The system uses Bun runtime, which may have compatibility considerations for npm packages

**What's Missing:**
- No ReAct loop implementation
- No `@ax-llm/ax` or `mcporter` dependencies
- No tool registry for mapping Wreckit tools to AxFunctions
- No MCP adapter for converting Claude SDK servers to mcporter format
- No CLI flag for selecting RLM mode

### Key Discoveries

- **Pattern to Follow:** `src/agent/claude-sdk-runner.ts:1-112` shows the canonical SDK runner implementation with query() API
- **Schema Extension Point:** `src/schemas.ts:65-71` is where new agent kind schemas are added to the discriminated union
- **Dispatcher Pattern:** `src/agent/runner.ts:389-493` uses a switch statement on `config.kind` to route to appropriate runner
- **Tool Allowlists:** `src/agent/toolAllowlist.ts:58-143` defines PHASE_TOOL_ALLOWLISTS that restrict tools per phase
- **MCP Integration:** `src/agent/mcp/wreckitMcpServer.ts:47-140` shows how to create MCP servers using Claude SDK's `createSdkMcpServer()`
- **Environment Resolution:** `src/agent/env.ts:79-108` has `buildSdkEnv()` that merges env vars from multiple sources

## Desired End State

After implementation, Wreckit will support a new agent configuration:

```json
{
  "agent": {
    "kind": "rlm",
    "model": "claude-sonnet-4-20250514",
    "maxIterations": 100,
    "aiProvider": "anthropic"
  }
}
```

The RLM agent will:
1. Execute tasks using a ReAct pattern (think-act-observe cycles)
2. Support all built-in Wreckit tools (Read, Write, Edit, Glob, Grep, Bash)
3. Proxy MCP servers via mcporter adapter
4. Respect tool allowlists for each phase
5. Emit progress events via `onStdoutChunk` and `onAgentEvent` callbacks
6. Support multiple AI providers (Anthropic, OpenAI, Google) via AxAI configuration
7. Be selectable via CLI flag `--agent rlm` or `wreckit --rlm`

**Verification:**
- Config validation passes for `kind: "rlm"`
- `runAgentUnion()` dispatches to `runRlmAgent()`
- ReAct loop executes with configurable max iterations
- Tools can be called and return correct results
- MCP servers are proxied correctly
- Agent completes tasks and returns proper `AgentResult`

## What We're NOT Doing

To prevent scope creep, the following is explicitly out of scope:

1. **Custom ReAct strategies:** Only implementing standard ReAct pattern, not custom reasoning strategies or tree-of-thought
2. **Tool abstraction layer:** Not creating a generic tool adapter system - mapping Wreckit tools to AxFunctions directly
3. **Multi-agent collaboration:** Not implementing agent swarms or collaborative reasoning
4. **State persistence:** Not saving/resuming ReAct loop state across executions
5. **Performance optimization:** Not implementing caching or parallel tool execution
6. **Custom MCP server format:** Only supporting Claude SDK MCP server format via mcporter adapter
7. **Provider-specific features:** Only using generic AxAI interfaces, not provider-specific capabilities
8. **New workflow phases:** Not modifying the existing phase structure (idea → researched → planned → implementing → in_pr → done)
9. **UI changes:** Not modifying the TUI or adding new visualizations for ReAct reasoning
10. **Breaking changes:** Not modifying existing agent kinds or their behavior

## Implementation Approach

**Strategy:** Incremental, testable phases following existing patterns. Each phase builds on the previous one and can be independently verified. The approach prioritizes integration with existing architecture over novel patterns.

**Key Decisions:**

1. **Follow SDK runner pattern:** RlmRunner will match the signature and behavior of `claude-sdk-runner.ts`, `amp-sdk-runner.ts`, etc.
2. **Direct tool mapping:** Create explicit AxFunction wrappers for each built-in tool rather than a generic adapter
3. **mcporter as bridge:** Use mcporter to proxy Claude SDK MCP servers without modifying their implementation
4. **Environment variable mapping:** Extend existing `buildSdkEnv()` to support AxAI provider configuration
5. **Opt-in by default:** RLM mode must be explicitly selected, Claude SDK remains the default

---

## Phase 1: Schema and Minimal Runner

### Overview
Add the RLM agent kind to the type system and create a minimal runner that can be dispatched to, establishing the foundation for tool and MCP integration.

### Success Criteria
- Config with `kind: "rlm"` passes validation
- `runAgentUnion()` routes to `runRlmAgent()`
- Runner handles dryRun and mockAgent correctly
- Returns proper `AgentResult` structure
- Can be executed end-to-end (with dummy implementation)

### Changes Required

#### 1. Add RLM Schema to Type System
**File:** `src/schemas.ts`
**Location:** After line 63 (after `OpenCodeSdkAgentSchema`)

**Add new schema:**
```typescript
export const RlmSdkAgentSchema = z.object({
  kind: z.literal("rlm"),
  model: z.string().default("claude-sonnet-4-20250514"),
  maxIterations: z.number().default(100),
  aiProvider: z.enum(["anthropic", "openai", "google"]).default("anthropic"),
});
```

**Update `AgentConfigUnionSchema` at line 65:**
```typescript
export const AgentConfigUnionSchema = z.discriminatedUnion("kind", [
  ProcessAgentSchema,
  ClaudeSdkAgentSchema,
  AmpSdkAgentSchema,
  CodexSdkAgentSchema,
  OpenCodeSdkAgentSchema,
  RlmSdkAgentSchema,  // ADD THIS LINE
]);
```

**Add type export at line 277:**
```typescript
export type RlmSdkAgentConfig = z.infer<typeof RlmSdkAgentSchema>;
```

#### 2. Create Minimal RlmRunner
**File:** `src/agent/rlm-runner.ts` (NEW FILE)

**Create basic runner structure:**
```typescript
import type { Logger } from "../logging";
import type { AgentResult } from "./runner";
import { registerSdkController, unregisterSdkController } from "./runner.js";
import type { RlmSdkAgentConfig } from "../schemas";
import type { AgentEvent } from "../tui/agentEvents";

export interface RlmRunAgentOptions {
  config: RlmSdkAgentConfig;
  cwd: string;
  prompt: string;
  logger: Logger;
  dryRun?: boolean;
  onStdoutChunk?: (chunk: string) => void;
  onStderrChunk?: (chunk: string) => void;
  onAgentEvent?: (event: AgentEvent) => void;
  mcpServers?: Record<string, unknown>;
  allowedTools?: string[];
  phase?: string;
}

export async function runRlmAgent(
  options: RlmRunAgentOptions
): Promise<AgentResult> {
  const { cwd, prompt, logger, dryRun, config, onStdoutChunk } = options;

  if (dryRun) {
    logger.info("[dry-run] Would run RLM agent");
    return {
      success: true,
      output: "[dry-run] RLM agent not executed",
      timedOut: false,
      exitCode: 0,
      completionDetected: true,
    };
  }

  const abortController = new AbortController();
  registerSdkController(abortController);

  try {
    let output = "";
    const maxIterations = config.maxIterations ?? 100;

    logger.info(`Starting RLM agent with max ${maxIterations} iterations`);

    // TODO: Implement ReAct loop in Phase 2
    // For now, return a simple response
    output = "RLM agent executed (placeholder implementation)";

    if (onStdoutChunk) {
      onStdoutChunk(output);
    }

    return {
      success: true,
      output,
      timedOut: false,
      exitCode: 0,
      completionDetected: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`RLM agent error: ${errorMessage}`);

    return {
      success: false,
      output: `Error: ${errorMessage}`,
      timedOut: false,
      exitCode: 1,
      completionDetected: false,
    };
  } finally {
    unregisterSdkController(abortController);
  }
}
```

#### 3. Add RLM Case to Dispatcher
**File:** `src/agent/runner.ts`
**Location:** After line 489 (inside the switch statement in `runAgentUnion()`)

**Add new case:**
```typescript
case "rlm": {
  const { runRlmAgent } = await import("./rlm-runner.js");
  return runRlmAgent({
    config,
    cwd: options.cwd,
    prompt: options.prompt,
    logger: options.logger,
    dryRun: options.dryRun,
    onStdoutChunk: options.onStdoutChunk,
    onStderrChunk: options.onStderrChunk,
    onAgentEvent: options.onAgentEvent,
    mcpServers: options.mcpServers,
    allowedTools: options.allowedTools,
  });
}
```

### Success Verification

#### Automated Verification:
- [ ] Type checking passes: `bun run typecheck`
- [ ] Build succeeds: `bun run build`
- [ ] Test with valid config: Create `.wreckit/config.json` with `kind: "rlm"` and run `wreckit status`
- [ ] Test dry-run: `wreckit --dry-run run <id>` with RLM config
- [ ] Test mock agent: `wreckit --mock-agent run <id>` with RLM config

#### Manual Verification:
- [ ] Config validation accepts `kind: "rlm"`
- [ ] Invalid config (missing required fields) is rejected
- [ ] Dispatcher routes to RlmRunner correctly
- [ ] dryRun flag returns success without execution
- [ ] mockAgent returns simulated output
- [ ] No regressions in existing agent kinds

**Note:** Complete all automated verification, then pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Tool Integration

### Overview
Implement tool registry that maps Wreckit's built-in tools to AxFunctions, enabling the RLM agent to use Read, Write, Edit, Glob, Grep, and Bash tools.

### Success Criteria
- All built-in tools are registered as AxFunctions
- Tools can be invoked by the agent
- Tool allowlists filter available tools correctly
- Progress callbacks emit tool usage events
- Error messages are clear and actionable

### Changes Required

#### 1. Install @ax-llm/ax Dependency
**File:** `package.json`
**Location:** dependencies section

**Run command:**
```bash
bun add @ax-llm/ax
```

**Verify in package.json:**
```json
"@ax-llm/ax": "^<version>"
```

#### 2. Create Tool Registry
**File:** `src/agent/rlm-tools.ts` (NEW FILE)

**Implement tool mapping:**
```typescript
import { createAxFunction } from "@ax-llm/ax";
import { z } from "zod";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Glob } from "./glob.js";
import { Grep } from "./grep.js";

// Tool: Read
export const readTool = createAxFunction({
  name: "Read",
  description: "Read the contents of a file from the filesystem",
  parameters: z.object({
    path: z.string().describe("Absolute or relative path to the file to read"),
  }),
  handler: async ({ path: filePath }, context) => {
    const resolvedPath = path.resolve(context.cwd, filePath);
    const content = await fs.readFile(resolvedPath, "utf-8");
    return { content };
  },
});

// Tool: Write
export const writeTool = createAxFunction({
  name: "Write",
  description: "Write content to a file, creating it if it doesn't exist",
  parameters: z.object({
    path: z.string().describe("Absolute or relative path to the file"),
    content: z.string().describe("Content to write to the file"),
  }),
  handler: async ({ path: filePath, content }, context) => {
    const resolvedPath = path.resolve(context.cwd, filePath);
    await fs.writeFile(resolvedPath, content, "utf-8");
    return { success: true, path: resolvedPath };
  },
});

// Tool: Edit
export const editTool = createAxFunction({
  name: "Edit",
  description: "Make specific edits to a file by replacing old_string with new_string",
  parameters: z.object({
    path: z.string().describe("Absolute or relative path to the file"),
    old_string: z.string().describe("Exact string to replace"),
    new_string: z.string().describe("Replacement string"),
  }),
  handler: async ({ path: filePath, old_string, new_string }, context) => {
    const resolvedPath = path.resolve(context.cwd, filePath);
    const content = await fs.readFile(resolvedPath, "utf-8");

    if (!content.includes(old_string)) {
      throw new Error(`old_string not found in file: ${filePath}`);
    }

    const newContent = content.replace(old_string, new_string);
    await fs.writeFile(resolvedPath, newContent, "utf-8");
    return { success: true, path: resolvedPath };
  },
});

// Tool: Glob
export const globTool = createAxFunction({
  name: "Glob",
  description: "Find files matching a pattern in the codebase",
  parameters: z.object({
    pattern: z.string().describe("Glob pattern (e.g., '**/*.ts', 'src/**/*.tsx')"),
    path: z.string().optional().describe("Directory to search in (default: cwd)"),
  }),
  handler: async ({ pattern, path: searchPath }, context) => {
    const resolvedPath = searchPath
      ? path.resolve(context.cwd, searchPath)
      : context.cwd;

    const glob = new Glob(pattern, resolvedPath);
    const files = await glob.find();

    return { files };
  },
});

// Tool: Grep
export const grepTool = createAxFunction({
  name: "Grep",
  description: "Search for text patterns in files using ripgrep",
  parameters: z.object({
    pattern: z.string().describe("Regular expression pattern to search for"),
    path: z.string().optional().describe("File or directory to search in (default: cwd)"),
  }),
  handler: async ({ pattern, path: searchPath }, context) => {
    const resolvedPath = searchPath
      ? path.resolve(context.cwd, searchPath)
      : context.cwd;

    const grep = new Grep(pattern, resolvedPath);
    const results = await grep.search();

    return { matches: results };
  },
});

// Tool: Bash
export const bashTool = createAxFunction({
  name: "Bash",
  description: "Execute shell commands (use with caution)",
  parameters: z.object({
    command: z.string().describe("Shell command to execute"),
  }),
  handler: async ({ command }) => {
    const { exec } = require("child_process");
    const util = require("util");
    const execAsync = util.promisify(exec);

    const { stdout, stderr } = await execAsync(command);

    return {
      stdout,
      stderr: stderr || undefined,
      exitCode: 0,
    };
  },
});

// Tool registry
export const BUILTIN_TOOLS = {
  Read: readTool,
  Write: writeTool,
  Edit: editTool,
  Glob: globTool,
  Grep: grepTool,
  Bash: bashTool,
} as const;

export type BuiltinToolName = keyof typeof BUILTIN_TOOLS;

/**
 * Build tool registry filtered by allowlist
 */
export function buildToolRegistry(
  allowedTools?: string[]
): typeof BUILTIN_TOOLS[BuiltinToolName][] {
  if (!allowedTools) {
    // No restrictions, return all tools
    return Object.values(BUILTIN_TOOLS);
  }

  // Filter tools by allowlist
  return allowedTools
    .map((name) => BUILTIN_TOOLS[name as BuiltinToolName])
    .filter((tool): tool is typeof BUILTIN_TOOLS[BuiltinToolName] => tool !== undefined);
}
```

#### 3. Update RlmRunner to Use Tools
**File:** `src/agent/rlm-runner.ts`
**Location:** Replace the placeholder implementation in `runRlmAgent()`

**Add imports:**
```typescript
import { buildToolRegistry } from "./rlm-tools.js";
import { getAllowedToolsForPhase } from "./toolAllowlist";
```

**Update function body:**
```typescript
export async function runRlmAgent(
  options: RlmRunAgentOptions
): Promise<AgentResult> {
  const { cwd, prompt, logger, dryRun, config, onStdoutChunk, onAgentEvent, phase, allowedTools } = options;

  if (dryRun) {
    logger.info("[dry-run] Would run RLM agent");
    return {
      success: true,
      output: "[dry-run] RLM agent not executed",
      timedOut: false,
      exitCode: 0,
      completionDetected: true,
    };
  }

  const abortController = new AbortController();
  registerSdkController(abortController);

  try {
    let output = "";
    const maxIterations = config.maxIterations ?? 100;

    // Get effective tool allowlist
    const effectiveTools = allowedTools ?? (phase ? getAllowedToolsForPhase(phase) : undefined);
    const tools = buildToolRegistry(effectiveTools);

    logger.info(`Starting RLM agent with ${tools.length} tools, max ${maxIterations} iterations`);

    // TODO: Implement ReAct loop with Ax in Phase 3
    // For now, demonstrate tool availability
    output = `RLM agent with tools: ${tools.map(t => t.name).join(", ")}\n`;
    output += `Prompt: ${prompt}\n`;

    if (onStdoutChunk) {
      onStdoutChunk(output);
    }

    return {
      success: true,
      output,
      timedOut: false,
      exitCode: 0,
      completionDetected: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`RLM agent error: ${errorMessage}`);

    return {
      success: false,
      output: `Error: ${errorMessage}`,
      timedOut: false,
      exitCode: 1,
      completionDetected: false,
    };
  } finally {
    unregisterSdkController(abortController);
  }
}
```

### Success Verification

#### Automated Verification:
- [ ] Type checking passes: `bun run typecheck`
- [ ] Build succeeds: `bun run build`
- [ ] Tool registry exports are correct
- [ ] Tool allowlist filtering works

#### Manual Verification:
- [ ] Tools are registered with correct names and descriptions
- [ ] Tools can be invoked individually (unit test)
- [ ] Tool allowlists filter tools correctly for each phase
- [ ] Error messages are clear when tool invocation fails
- [ ] No regressions in existing functionality

**Note:** Complete all verification before proceeding to Phase 3.

---

## Phase 3: ReAct Loop Implementation

### Overview
Implement the core ReAct loop using @ax-llm/ax framework, enabling the agent to reason, act, and observe iteratively until task completion or max iterations.

### Success Criteria
- ReAct loop executes think-act-observe cycles
- Agent can call tools and observe results
- Loop terminates on completion or max iterations
- Progress is streamed via `onStdoutChunk`
- Agent events are emitted via `onAgentEvent`
- Timeout and cancellation work correctly

### Changes Required

#### 1. Install Additional Dependencies
**File:** `package.json`

**Run command:**
```bash
bun add mcporter
```

#### 2. Implement ReAct Loop in RlmRunner
**File:** `src/agent/rlm-runner.ts`
**Location:** Replace the placeholder implementation in `runRlmAgent()`

**Add imports:**
```typescript
import { AxAgent, type AxAgentOptions } from "@ax-llm/ax";
import { buildToolRegistry } from "./rlm-tools.js";
import { getAllowedToolsForPhase } from "./toolAllowlist";
import type { RlmSdkAgentConfig } from "../schemas";
```

**Update function body with ReAct loop:**
```typescript
export async function runRlmAgent(
  options: RlmRunAgentOptions
): Promise<AgentResult> {
  const {
    cwd,
    prompt,
    logger,
    dryRun,
    config,
    onStdoutChunk,
    onStderrChunk,
    onAgentEvent,
    phase,
    allowedTools,
    timeoutSeconds,
  } = options;

  if (dryRun) {
    logger.info("[dry-run] Would run RLM agent");
    return {
      success: true,
      output: "[dry-run] RLM agent not executed",
      timedOut: false,
      exitCode: 0,
      completionDetected: true,
    };
  }

  const abortController = new AbortController();
  registerSdkController(abortController);

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;

  try {
    const maxIterations = config.maxIterations ?? 100;

    // Get effective tool allowlist
    const effectiveTools = allowedTools ?? (phase ? getAllowedToolsForPhase(phase) : undefined);
    const tools = buildToolRegistry(effectiveTools);

    logger.info(`Starting RLM agent with ${tools.length} tools, max ${maxIterations} iterations`);

    // Set up timeout
    if (timeoutSeconds && timeoutSeconds > 0) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        logger.warn(`RLM agent timed out after ${timeoutSeconds} seconds`);
        abortController.abort();
      }, timeoutSeconds * 1000);
    }

    // Initialize Ax agent
    const axConfig: AxAgentOptions = {
      provider: config.aiProvider || "anthropic",
      model: config.model,
      tools,
      signal: abortController.signal,
    };

    const agent = new AxAgent(axConfig);

    let output = "";
    let iterations = 0;
    let currentState = `Task: ${prompt}\n\n`;

    // ReAct loop
    while (iterations < maxIterations && !timedOut) {
      iterations++;

      // Emit progress
      if (onAgentEvent) {
        onAgentEvent({
          type: "iteration",
          iteration: iterations,
          maxIterations,
        });
      }

      // Agent reasons about the task
      const thought = await agent.think(currentState);
      output += `Thought ${iterations}: ${thought}\n`;
      if (onStdoutChunk) {
        onStdoutChunk(`[Thought ${iterations}] ${thought}\n`);
      }

      // Agent decides on action
      const action = await agent.act(thought);

      // Check if agent wants to complete
      if (action.type === "complete") {
        output += `\nFinal Answer: ${action.result}\n`;
        if (onStdoutChunk) {
          onStdoutChunk(`\n[Complete] ${action.result}\n`);
        }

        if (onAgentEvent) {
          onAgentEvent({ type: "complete", result: action.result });
        }

        break;
      }

      // Agent wants to use a tool
      if (action.type === "tool_use") {
        const { toolName, input } = action;

        if (onAgentEvent) {
          onAgentEvent({
            type: "tool_started",
            toolUseId: `iter-${iterations}`,
            toolName,
            input,
          });
        }

        if (onStdoutChunk) {
          onStdoutChunk(`[Action] ${toolName}(${JSON.stringify(input)})\n`);
        }

        // Execute tool
        try {
          const tool = tools.find(t => t.name === toolName);
          if (!tool) {
            throw new Error(`Tool not found: ${toolName}`);
          }

          const result = await tool.handler(input, { cwd });
          const observation = JSON.stringify(result);

          output += `Observation: ${observation}\n`;
          currentState += `Thought ${iterations}: ${thought}\nAction: ${toolName}\nObservation: ${observation}\n`;

          if (onStdoutChunk) {
            onStdoutChunk(`[Observation] ${observation}\n`);
          }

          if (onAgentEvent) {
            onAgentEvent({
              type: "tool_result",
              toolUseId: `iter-${iterations}`,
              result: observation,
            });
          }
        } catch (toolError) {
          const errorMessage = toolError instanceof Error ? toolError.message : String(toolError);
          output += `Error: ${errorMessage}\n`;
          currentState += `Thought ${iterations}: ${thought}\nAction: ${toolName}\nError: ${errorMessage}\n`;

          if (onStderrChunk) {
            onStderrChunk(`[Tool Error] ${errorMessage}\n`);
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

    if (iterations >= maxIterations) {
      output += `\nStopped after reaching max iterations (${maxIterations})\n`;
      if (onStdoutChunk) {
        onStdoutChunk(`\n[Stopped] Max iterations reached\n`);
      }

      return {
        success: false,
        output,
        timedOut: false,
        exitCode: 1,
        completionDetected: false,
      };
    }

    return {
      success: true,
      output,
      timedOut: false,
      exitCode: 0,
      completionDetected: true,
    };
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);

    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`RLM agent error: ${errorMessage}`);

    return {
      success: false,
      output: `Error: ${errorMessage}`,
      timedOut: false,
      exitCode: 1,
      completionDetected: false,
    };
  } finally {
    unregisterSdkController(abortController);
  }
}
```

#### 3. Update RlmRunAgentOptions Interface
**File:** `src/agent/rlm-runner.ts`
**Location:** Update the interface to include timeoutSeconds

```typescript
export interface RlmRunAgentOptions {
  config: RlmSdkAgentConfig;
  cwd: string;
  prompt: string;
  logger: Logger;
  dryRun?: boolean;
  onStdoutChunk?: (chunk: string) => void;
  onStderrChunk?: (chunk: string) => void;
  onAgentEvent?: (event: AgentEvent) => void;
  mcpServers?: Record<string, unknown>;
  allowedTools?: string[];
  phase?: string;
  timeoutSeconds?: number;  // ADD THIS
}
```

#### 4. Update Dispatcher to Pass timeoutSeconds
**File:** `src/agent/runner.ts`
**Location:** In the `case "rlm":` block

```typescript
case "rlm": {
  const { runRlmAgent } = await import("./rlm-runner.js");
  return runRlmAgent({
    config,
    cwd: options.cwd,
    prompt: options.prompt,
    logger: options.logger,
    dryRun: options.dryRun,
    onStdoutChunk: options.onStdoutChunk,
    onStderrChunk: options.onStderrChunk,
    onAgentEvent: options.onAgentEvent,
    mcpServers: options.mcpServers,
    allowedTools: options.allowedTools,
    timeoutSeconds: options.timeoutSeconds,  // ADD THIS
  });
}
```

### Success Verification

#### Automated Verification:
- [ ] Type checking passes: `bun run typecheck`
- [ ] Build succeeds: `bun run build`
- [ ] ReAct loop executes for simple tasks
- [ ] Timeout works correctly
- [ ] Max iterations limit is enforced

#### Manual Verification:
- [ ] Agent can complete a simple file reading task
- [ ] Agent can handle tool errors gracefully
- [ ] Progress output is streamed correctly
- [ ] Agent events are emitted properly
- [ ] Cancellation via Ctrl+C works
- [ ] No regressions in existing agent kinds

**Note:** Complete all verification before proceeding to Phase 4.

---

## Phase 4: MCP Integration

### Overview
Integrate MCP server support using mcporter to proxy Claude SDK MCP servers, enabling the RLM agent to use Wreckit's built-in MCP tools (save_interview_ideas, save_parsed_ideas, save_prd, update_story_status).

### Success Criteria
- MCP servers can be loaded and proxied
- MCP tools are available to the agent
- Tool name translation works (mcp__ prefix)
- MCP tool invocation succeeds
- Error handling for unsupported features

### Changes Required

#### 1. Create mcporter Adapter
**File:** `src/agent/mcp/mcporterAdapter.ts` (NEW FILE)

**Implement adapter:**
```typescript
import type { McpServer } from "@anthropic-ai/claude-agent-sdk";
import type { McporterServerConfig } from "mcporter";

/**
 * Convert Claude SDK MCP server to mcporter format
 *
 * The Claude SDK uses in-process MCP servers created via createSdkMcpServer().
 * mcporter expects server configurations with transport details (stdio, SSE, etc.).
 *
 * Since wreckit's MCP servers are in-process, we need to spawn a subprocess
 * that runs the server. This adapter creates a wrapper script for that purpose.
 */
export function adaptMcpServerToMcporter(
  name: string,
  server: McpServer
): McporterServerConfig {
  // For in-process servers, we need to create a stdio bridge
  // This is a simplified approach - in production, you'd want a more robust solution

  return {
    name,
    transport: {
      type: "stdio",
      command: "node",
      args: [
        "--eval",
        `
          const { createSdkMcpServer } = require('@anthropic-ai/claude-agent-sdk');
          const server = ${JSON.stringify(server)};
          const mcpServer = createSdkMcpServer(server);
          mcpServer.start();
        `
      ],
    },
  };
}

/**
 * Adapt multiple MCP servers
 */
export function adaptMcpServersToMcporter(
  mcpServers: Record<string, McpServer>
): McporterServerConfig[] {
  return Object.entries(mcpServers).map(([name, server]) =>
    adaptMcpServerToMcporter(name, server)
  );
}
```

**Note:** The above is a simplified approach. A more robust solution might involve:
- Creating a separate MCP bridge process
- Using IPC for communication
- Implementing proper lifecycle management

#### 2. Update RlmRunner to Support MCP
**File:** `src/agent/rlm-runner.ts`
**Location:** Add MCP support to the ReAct loop

**Add imports:**
```typescript
import { adaptMcpServersToMcporter } from "./mcp/mcporterAdapter.js";
import { createMcporterProxy } from "mcporter";
```

**Update agent initialization:**
```typescript
// After building tool registry, add MCP tools
let allTools = [...tools];

if (options.mcpServers && Object.keys(options.mcpServers).length > 0) {
  try {
    const mcporterConfigs = adaptMcpServersToMcporter(options.mcpServers);
    const mcpProxy = await createMcporterProxy(mcporterConfigs);

    // Convert MCP tools to AxFunctions
    const mcpTools = await mcpProxy.getTools();
    const mcpAxFunctions = mcpTools.map(tool =>
      createAxFunction({
        name: tool.name,
        description: tool.description,
        parameters: z.object(tool.inputSchema),
        handler: async (input) => {
          return await mcpProxy.callTool(tool.name, input);
        },
      })
    );

    allTools = [...allTools, ...mcpAxFunctions];
    logger.info(`Loaded ${mcpTools.length} MCP tools from ${mcporterConfigs.length} servers`);
  } catch (mcpError) {
    logger.warn(`Failed to load MCP servers: ${mcpError}`);
    // Continue without MCP tools
  }
}

// Initialize Ax agent with all tools
const axConfig: AxAgentOptions = {
  provider: config.aiProvider || "anthropic",
  model: config.model,
  tools: allTools,
  signal: abortController.signal,
};
```

#### 3. Update AgentEvent Type
**File:** `src/tui/agentEvents.ts`
**Location:** Add event types for ReAct loop

**Add new event types:**
```typescript
export type AgentEvent =
  // ... existing types ...
  | { type: "iteration"; iteration: number; maxIterations: number }
  | { type: "complete"; result: string };
```

### Success Verification

#### Automated Verification:
- [ ] Type checking passes: `bun run typecheck`
- [ ] Build succeeds: `bun run build`
- [ ] MCP adapter converts servers correctly
- [ ] MCP tools are registered with agent

#### Manual Verification:
- [ ] Wreckit MCP tools are accessible to agent
- [ ] Agent can call save_prd tool
- [ ] Agent can call update_story_status tool
- [ ] Tool name translation works (mcp__ prefix)
- [ ] Error handling works for MCP failures
- [ ] No regressions in existing MCP functionality

**Note:** Complete all verification before proceeding to Phase 5.

---

## Phase 5: CLI Integration and Documentation

### Overview
Add CLI flags for selecting RLM mode and update documentation to describe the new agent kind.

### Success Criteria
- `--agent rlm` flag works
- `wreckit --rlm` shorthand works
- AGENTS.md documents RLM mode
- Examples are provided
- Help text is updated

### Changes Required

#### 1. Add Global Agent Flag
**File:** `src/index.ts`
**Location:** After line 50 (in global options section)

**Add option:**
```typescript
program
  // ... existing options ...
  .option("--cwd <path>", "Override the working directory")
  .option("--agent <kind>", "Agent kind to use (claude_sdk, amp_sdk, codex_sdk, opencode_sdk, rlm)")
  .option("--rlm", "Shorthand for --agent rlm");
```

#### 2. Update Config Loading to Use Agent Flag
**File:** `src/config.ts`
**Location:** Update `loadConfig()` function to accept agent kind override

**Add parameter:**
```typescript
export async function loadConfig(
  root: string,
  overrides?: ConfigOverrides & { agentKind?: string }  // ADD THIS
): Promise<ConfigResolved> {
  // ... existing code ...

  // Apply agent kind override if specified
  if (overrides?.agentKind) {
    // Validate the agent kind
    const validKinds = ["process", "claude_sdk", "amp_sdk", "codex_sdk", "opencode_sdk", "rlm"];
    if (!validKinds.includes(overrides.agentKind)) {
      throw new Error(`Invalid agent kind: ${overrides.agentKind}`);
    }

    // Override the agent kind
    if (resolved.agent.kind !== overrides.agentKind) {
      logger.info(`Overriding agent kind from ${resolved.agent.kind} to ${overrides.agentKind}`);
      resolved.agent = {
        ...resolved.agent,
        kind: overrides.agentKind as any,
      };
    }
  }

  return resolved;
}
```

#### 3. Pass Agent Flag to Config Loading
**File:** `src/index.ts`
**Location:** Update orchestrateAll call to pass agent kind

**Update:**
```typescript
program.action(async () => {
  const opts = program.opts();
  await executeCommand(
    async () => {
      const onboarding = await runOnboardingIfNeeded(logger, {
        noTui: opts.noTui,
        cwd: resolveCwd(opts.cwd),
      });
      if (!onboarding.proceed) {
        if (onboarding.reason === "noninteractive") {
          process.exit(1);
        }
        return;
      }

      // Determine agent kind from flags
      const agentKind = opts.rlm ? "rlm" : opts.agent;

      const result = await orchestrateAll(
        {
          force: false,
          dryRun: opts.dryRun,
          noTui: opts.noTui,
          tuiDebug: opts.tuiDebug,
          cwd: resolveCwd(opts.cwd),
          mockAgent: opts.mockAgent,
          parallel: parseInt(opts.parallel, 10) || 1,
          noResume: opts.noResume,
          retryFailed: opts.retryFailed,
          noHealing: opts.noHealing,
          agentKind,  // ADD THIS
        },
        logger
      );

      // ... rest of the code ...
    },
    logger,
    {
      verbose: opts.verbose,
      quiet: opts.quiet,
      debug: opts.debug,
    }
  );
});
```

#### 4. Update orchestrateAll to Pass Agent Kind
**File:** `src/commands/orchestrator.ts`
**Location:** Update function signature and pass to config loading

**Update signature:**
```typescript
export interface OrchestratorOptions {
  // ... existing fields ...
  agentKind?: string;  // ADD THIS
}

export async function orchestrateAll(
  options: OrchestratorOptions,
  logger: Logger
): Promise<OrchestrationResult> {
  // ... existing code ...

  // Load config with agent kind override
  const config = await loadConfig(repoRoot, {
    agentKind: options.agentKind,  // ADD THIS
  });

  // ... rest of the code ...
}
```

#### 5. Update AGENTS.md Documentation
**File:** `AGENTS.md`
**Location:** After line 107 (in Agent Kind Options section)

**Add RLM entry:**
```markdown
| `rlm` | ReAct Loop Mode with Ax framework (experimental) |
```

**Add section after line 109:**
```markdown
### RLM Mode (ReAct Loop)

The RLM mode uses the `@ax-llm/ax` framework to implement a ReAct (Reasoning + Acting) agent pattern. This enables iterative think-act-observe cycles for complex task solving.

**Configuration:**
```json
{
  "agent": {
    "kind": "rlm",
    "model": "claude-sonnet-4-20250514",
    "maxIterations": 100,
    "aiProvider": "anthropic"
  }
}
```

**Options:**
- `model`: AI model to use (default: `claude-sonnet-4-20250514`)
- `maxIterations`: Maximum number of ReAct iterations (default: 100)
- `aiProvider`: AI provider - `anthropic`, `openai`, or `google` (default: `anthropic`)

**Usage:**
```bash
# Use RLM mode for specific item
wreckit --agent rlm run 001

# Use RLM mode for all items
wreckit --agent rlm

# Shorthand
wreckit --rlm
```

**Tool Support:**
- Built-in tools: Read, Write, Edit, Glob, Grep, Bash
- MCP tools: All wreckit MCP tools (save_prd, update_story_status, etc.)
- Tool allowlists are respected per phase

**How it Works:**
1. Agent thinks about the task and decides on an action
2. Agent executes a tool (or completes the task)
3. Agent observes the result and updates its understanding
4. Loop repeats until completion or max iterations

**When to Use:**
- Complex tasks requiring multi-step reasoning
- Tasks where tool orchestration is critical
- Exploratory tasks where the agent needs to adapt its approach

**When NOT to Use:**
- Simple, straightforward tasks (use claude_sdk instead)
- Tasks requiring tight integration with Claude-specific features
- Performance-critical workflows (ReAct adds overhead)
```

### Success Verification

#### Automated Verification:
- [ ] Type checking passes: `bun run typecheck`
- [ ] Build succeeds: `bun run build`
- [ ] CLI flags parse correctly
- [ ] Agent kind override works

#### Manual Verification:
- [ ] `wreckit --agent rlm` uses RLM mode
- [ ] `wreckit --rlm` uses RLM mode
- [ ] `wreckit --agent claude_sdk` uses Claude SDK (no regression)
- [ ] Help text shows new flags correctly
- [ ] Invalid agent kind is rejected with clear error
- [ ] Documentation is clear and accurate

**Note:** Complete all verification to finish implementation.

---

## Testing Strategy

### Unit Tests

**File:** `src/__tests__/agent/rlm-runner.test.ts` (NEW FILE)

Test cases:
- [ ] `runRlmAgent()` returns correct structure
- [ ] dryRun flag returns early without execution
- [ ] Tool registry filters by allowlist
- [ ] ReAct loop terminates on completion
- [ ] ReAct loop stops at max iterations
- [ ] Timeout aborts execution
- [ ] AbortController cleanup works
- [ ] Error handling returns proper error result

### Integration Tests

**File:** `src/__tests__/agent/rlm-integration.test.ts` (NEW FILE)

Test cases:
- [ ] Agent can read a file
- [ ] Agent can write a file
- [ ] Agent can edit a file
- [ ] Agent can search with glob
- [ ] Agent can search with grep
- [ ] Agent can execute bash commands
- [ ] Agent can call MCP tools
- [ ] Tool allowlist enforcement works
- [ ] Multi-step task execution works

### IsoSpec Tests

**File:** `src/__tests__/edge-cases/rlm-config.isospec.ts` (NEW FILE)

Test cases:
- [ ] Valid RLM config passes validation
- [ ] Invalid maxIterations is rejected
- [ ] Invalid aiProvider is rejected
- [ ] Missing optional fields use defaults
- [ ] Config migration works (if needed)

### Manual Testing Steps

1. **Test basic execution:**
   ```bash
   wreckit --agent rlm run 001
   ```

2. **Test with timeout:**
   ```bash
   wreckit --agent rlm --timeout 60 run 001
   ```

3. **Test with dry-run:**
   ```bash
   wreckit --agent rlm --dry-run run 001
   ```

4. **Test with mock agent:**
   ```bash
   wreckit --agent rlm --mock-agent run 001
   ```

5. **Test shorthand:**
   ```bash
   wreckit --rlm run 001
   ```

6. **Test MCP tools:**
   - Create a plan phase item
   - Verify agent can call save_prd tool
   - Check that prd.json is created correctly

7. **Test tool allowlists:**
   - Run idea phase (should only have MCP tools)
   - Run research phase (should have Read, Write, Glob, Grep)
   - Run implement phase (should have all tools)

8. **Test error handling:**
   - Give agent an invalid file path
   - Verify error is reported clearly
   - Verify agent continues or stops appropriately

---

## Migration Notes

No data migration is required for this feature. The RLM agent kind is additive and does not modify existing configurations or behaviors.

**For users who want to adopt RLM mode:**

1. Update `.wreckit/config.json`:
   ```json
   {
     "agent": {
       "kind": "rlm",
       "model": "claude-sonnet-4-20250514",
       "maxIterations": 100
     }
   }
   ```

2. Or use CLI flag:
   ```bash
   wreckit --agent rlm
   ```

3. Configure AI provider if needed:
   ```bash
   export ANTHROPIC_API_KEY=your-key
   export OPENAI_API_KEY=your-key
   export GOOGLE_API_KEY=your-key
   ```

---

## References

- Research: `/Users/speed/wreckit/.wreckit/items/064-rlm-mode-implementation-with-ax-mcporter/research.md`
- Schemas: `src/schemas.ts:37-71` (AgentConfigUnionSchema)
- Dispatcher: `src/agent/runner.ts:389-493` (runAgentUnion function)
- Claude SDK Runner: `src/agent/claude-sdk-runner.ts:1-112` (Pattern to follow)
- AMP SDK Runner: `src/agent/amp-sdk-runner.ts:34-89` (Alternative pattern)
- MCP Server: `src/agent/mcp/wreckitMcpServer.ts:47-140` (MCP tool definitions)
- Tool Allowlists: `src/agent/toolAllowlist.ts:58-143` (Phase-based restrictions)
- Environment: `src/agent/env.ts:79-108` (buildSdkEnv function)
- Config: `src/config.ts:47-70` (DEFAULT_CONFIG)
- CLI: `src/index.ts:30-51` (Global options)
- Documentation: `AGENTS.md:99-135` (Agent configuration)

---

## Dependencies

**New packages to install:**
```bash
bun add @ax-llm/ax mcporter
```

**Version notes:**
- Pin `@ax-llm/ax` to specific version after testing
- Pin `mcporter` to specific version after testing
- Verify Bun runtime compatibility before finalizing versions

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| @ax-llm/ax API instability | Pin to specific version, create abstraction layer |
| mcporter compatibility issues | Build adapter, test early, have fallback |
| Bun runtime incompatibility | Test immediately after adding dependencies |
| Performance overhead | Make RLM opt-in, add progress indicators |
| Tool mapping bugs | Comprehensive testing, clear error messages |
| MCP proxy failures | Graceful degradation, continue without MCP |
| ReAct loop infinite loops | Max iterations limit, timeout enforcement |
| Breaking existing agents | No changes to existing agent kinds |

---

## Success Metrics

- [ ] All 5 phases completed and verified
- [ ] Unit tests pass (100% coverage of new code)
- [ ] Integration tests pass (all test scenarios)
- [ ] IsoSpec tests pass (config validation)
- [ ] Manual testing successful (all test steps)
- [ ] Documentation complete (AGENTS.md updated)
- [ ] No regressions in existing functionality
- [ ] CLI flags work as documented
- [ ] MCP tools accessible to agent
- [ ] Tool allowlists enforced correctly

---

## Post-Implementation Tasks (Out of Scope)

These tasks are identified but not part of this implementation:

1. **Performance benchmarking:** Compare RLM vs Claude SDK performance
2. **Caching layer:** Cache tool results for repeated operations
3. **Parallel tool execution:** Execute independent tools concurrently
4. **Advanced ReAct strategies:** Tree-of-thought, self-consistency
5. **State persistence:** Save/resume ReAct loop state
6. **Tool usage analytics:** Track which tools are used most
7. **Custom ReAct prompts:** Allow users to customize reasoning prompts
8. **Multi-modal support:** Handle images and other media types
