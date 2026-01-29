# 008 - Agent Runtime

## Overview

**Purpose:** Define how AI agents are executed, including execution modes, tool restrictions, MCP integration, and completion detection.

**Scope:** Agent dispatch, SDK vs process modes, MCP tool contracts, tool allowlisting, prompt rendering, completion signals.

**Out of scope:** Phase-specific prompts (covered in 001-006), CLI commands, item storage.

### Where This Applies

- Ideas phase (extraction-only agent)
- Research, Plan, Implement phases (full agent access)
- PR phase (PR description generation)
- Primary components: `src/agent/`, `src/prompts.ts`

---

## Security Model: Controlled Execution

### Core Principle

Agent capabilities must be scoped to the current phase. The ideas phase requires strict extraction-only access. Implementation phases require full codebase access but should respect story scope.

### Guardrails Required

| Guardrail                | Purpose                                     |
| ------------------------ | ------------------------------------------- |
| **Tool Allowlisting**    | Restrict available tools per phase          |
| **Working Directory**    | Agent runs in item directory, not repo root |
| **Timeout Enforcement**  | Prevent runaway agents                      |
| **Completion Detection** | Verify agent finished successfully          |
| **MCP Tool Validation**  | Schema-validate all tool call payloads      |

### Current Gap

Tool allowlisting is implemented for ideas phase but relies on agent cooperation. There is no enforcement at the execution layer for other phases.

---

## Execution Modes

Wreckit supports multiple agent backends via a discriminated union config.

### Agent Kinds

| Kind           | Description                      | Status       |
| -------------- | -------------------------------- | ------------ |
| `process`      | Spawn external CLI (amp, claude) | Stable       |
| `claude_sdk`   | Claude Agent SDK direct          | Stable       |
| `amp_sdk`      | Amp SDK                          | Experimental |
| `codex_sdk`    | OpenAI Codex SDK                 | Experimental |
| `opencode_sdk` | OpenCode SDK                     | Experimental |

### Process Mode

Spawns an external agent CLI as a subprocess.

**Configuration:**

```json
{
  "agent": {
    "kind": "process",
    "command": "amp",
    "args": ["--dangerously-allow-all"],
    "completion_signal": "<promise>COMPLETE</promise>"
  }
}
```

**Behavior:**

1. Spawn process with `stdio: ["pipe", "pipe", "pipe"]`
2. Write prompt to stdin, close stdin
3. Stream stdout/stderr
4. Detect completion signal in output
5. Wait for process exit

### SDK Mode

Uses Claude Agent SDK directly for better integration.

**Configuration:**

```json
{
  "agent": {
    "kind": "claude_sdk",
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 4096
  }
}
```

**Behavior:**

1. Create SDK client with environment credentials
2. Execute query with prompt and MCP servers
3. Stream events to TUI
4. Handle tool calls via MCP
5. Detect completion via SDK events

### Fallback Behavior

If SDK mode fails (auth error, network), falls back to process mode automatically.

---

## MCP Tools

Custom MCP tools provide structured data capture from agents.

### Available Tools

| Tool                   | Phase             | Purpose                                    |
| ---------------------- | ----------------- | ------------------------------------------ |
| `save_interview_ideas` | Ideas (interview) | Capture structured ideas from conversation |
| `save_parsed_ideas`    | Ideas (document)  | Parse ideas from piped input               |
| `save_prd`             | Plan              | Save PRD with user stories                 |
| `update_story_status`  | Implement         | Mark a story as done                       |

### Tool Schemas

**save_interview_ideas / save_parsed_ideas:**

```typescript
{
  ideas: Array<{
    title: string; // Required, <60 chars
    description: string; // Required
    problemStatement?: string;
    motivation?: string;
    successCriteria?: string[];
    technicalConstraints?: string[];
    scope?: { inScope?: string[]; outOfScope?: string[] };
    priorityHint?: "low" | "medium" | "high" | "critical";
    urgencyHint?: string;
    suggestedSection?: string;
  }>;
}
```

**save_prd:**

```typescript
{
  prd: {
    schema_version: 1,          // Literal 1
    id: string,                 // Item ID
    branch_name: string,        // Git branch
    user_stories: Array<{
      id: string,               // e.g., "US-001"
      title: string,
      acceptance_criteria: string[],
      priority: number,         // 1 = highest
      status: "pending" | "done",
      notes: string
    }>
  }
}
```

**update_story_status:**

```typescript
{
  story_id: string,             // e.g., "US-001"
  status: "pending" | "done"
}
```

### MCP Tool Handlers

The MCP server is created with callback handlers:

```typescript
createWreckitMcpServer({
  onInterviewIdeas: (ideas) => {
    /* capture ideas */
  },
  onParsedIdeas: (ideas) => {
    /* capture ideas */
  },
  onSavePrd: (prd) => {
    /* save prd.json */
  },
  onUpdateStoryStatus: (storyId, status) => {
    /* update prd.json */
  },
});
```

---

## Tool Allowlisting

### Ideas Phase (Extraction-Only)

The ideas phase uses strict tool restrictions:

| Allowed                | Blocked                    |
| ---------------------- | -------------------------- |
| `save_interview_ideas` | Read, Write, Edit          |
| `save_parsed_ideas`    | Bash, Shell                |
|                        | Grep, Glob, Search         |
|                        | All other filesystem tools |

**Enforcement:** The `allowedTools` option restricts which tools the agent can call. Tool calls outside the allowlist are blocked.

### Other Phases

Research, Plan, Implement, and PR phases allow full tool access. The agent is trusted to follow prompt instructions about scope.

---

## Prompt Rendering

### Template Resolution

1. Check `.wreckit/prompts/<phase>.md` for project override
2. Fall back to bundled default prompt
3. Replace template variables
4. Evaluate conditionals

### Template Variables

| Variable                | Description                     |
| ----------------------- | ------------------------------- |
| `{{id}}`                | Item ID                         |
| `{{title}}`             | Item title                      |
| `{{section}}`           | Item section/category           |
| `{{overview}}`          | Item description                |
| `{{item_path}}`         | Absolute path to item directory |
| `{{branch_name}}`       | Git branch name                 |
| `{{base_branch}}`       | Base branch (e.g., `main`)      |
| `{{completion_signal}}` | Agent completion signal         |
| `{{research}}`          | Contents of research.md         |
| `{{plan}}`              | Contents of plan.md             |
| `{{prd}}`               | Contents of prd.json            |
| `{{progress}}`          | Contents of progress.log        |
| `{{sdk_mode}}`          | Whether running in SDK mode     |

### Conditionals

```markdown
{{#if research}}

## Research Findings

{{research}}
{{/if}}
```

---

## Completion Detection

### Process Mode

The agent must print a completion signal to indicate successful completion:

```
<promise>COMPLETE</promise>
```

The signal is configurable via `agent.completion_signal`.

**Detection:** Output is buffered and checked for signal substring.

### SDK Mode

Completion is determined by SDK event stream ending without error.

### Failure Modes

| Condition            | Behavior                       |
| -------------------- | ------------------------------ |
| Signal not detected  | Phase fails                    |
| Agent times out      | Phase fails with timeout error |
| Agent exits non-zero | Phase fails                    |
| SDK error            | Falls back to process mode     |

---

## Timeout and Limits

| Setting           | Default | Description                            |
| ----------------- | ------- | -------------------------------------- |
| `timeout_seconds` | 3600    | Per-phase agent timeout                |
| `max_iterations`  | 100     | Max story iterations (implement phase) |

### Timeout Behavior

1. After `timeout_seconds`, send SIGTERM
2. Wait 5 seconds
3. Send SIGKILL if still running
4. Phase fails with "Agent timed out"

---

## Error Handling

| Error Condition             | Behavior                    | Recovery                           |
| --------------------------- | --------------------------- | ---------------------------------- |
| Agent spawn fails           | Phase fails immediately     | Check command path                 |
| Agent timeout               | Phase fails, process killed | Increase timeout or simplify task  |
| Tool call rejected          | Error surfaced to agent     | Agent may retry                    |
| MCP schema validation fails | Tool call fails             | Agent may retry with valid payload |
| SDK auth failure            | Falls back to process mode  | Check ANTHROPIC_API_KEY            |

---

## Environment Variables

### SDK Mode

| Variable               | Purpose                         |
| ---------------------- | ------------------------------- |
| `ANTHROPIC_API_KEY`    | API authentication              |
| `ANTHROPIC_BASE_URL`   | Custom API endpoint (e.g., Zai) |
| `ANTHROPIC_AUTH_TOKEN` | Alternative auth for proxy      |

### Resolution Order

1. `.wreckit/config.local.json` `agent.env`
2. `.wreckit/config.json` `agent.env`
3. `process.env`
4. `~/.claude/settings.json` `env`

---

## Mock Agent

For testing, `--mock-agent` simulates agent responses:

1. Prints simulated progress messages
2. Includes completion signal
3. Returns success without calling real agent

---

## Implementation Status

| Feature                             | Status          | Notes                                         |
| ----------------------------------- | --------------- | --------------------------------------------- |
| **Process mode**                    | ✅ Implemented  | See `src/agent/runner.ts`                     |
| **Claude SDK mode**                 | ✅ Implemented  | See `src/agent/claude-sdk-runner.ts`          |
| **Amp SDK mode**                    | ✅ Implemented  | See `src/agent/amp-sdk-runner.ts`             |
| **Codex SDK mode**                  | 🔶 Experimental | See `src/agent/codex-sdk-runner.ts`           |
| **OpenCode SDK mode**               | 🔶 Experimental | See `src/agent/opencode-sdk-runner.ts`        |
| **MCP server**                      | ✅ Implemented  | See `src/agent/mcp/wreckitMcpServer.ts`       |
| **Tool: save_interview_ideas**      | ✅ Implemented  | Ideas phase                                   |
| **Tool: save_parsed_ideas**         | ✅ Implemented  | Ideas phase                                   |
| **Tool: save_prd**                  | ✅ Implemented  | Plan phase                                    |
| **Tool: update_story_status**       | ✅ Implemented  | Implement phase                               |
| **Tool allowlisting**               | ✅ Implemented  | See `src/agent/toolAllowlist.ts`              |
| **Per-phase tool restrictions**     | ✅ Implemented  | All phases have allowlists                    |
| **Prompt rendering**                | ✅ Implemented  | See `src/prompts.ts`                          |
| **Template variables**              | ✅ Implemented  | All variables in spec                         |
| **Conditionals**                    | ✅ Implemented  | `{{#if var}}...{{/if}}` syntax                |
| **Completion detection**            | ✅ Implemented  | Signal-based for process, event-based for SDK |
| **Timeout enforcement**             | ✅ Implemented  | Configurable `timeout_seconds`                |
| **Environment variable resolution** | ✅ Implemented  | See `src/agent/env.ts`                        |
| **Mock agent**                      | ✅ Implemented  | `--mock-agent` flag                           |

---

## Known Gaps

### Gap 1: No Enforcement for Non-Ideas Phases ✅ FIXED

~~Tool allowlisting is only enforced for the ideas phase.~~

**Status:** Fixed - All phases now have tool allowlists. See `src/agent/toolAllowlist.ts`:

- `idea`: MCP tools only
- `research`: Read, Glob, Grep (read-only)
- `plan`: Read, Write, Edit, Glob, Grep, save_prd
- `implement`: Full access + update_story_status
- `pr`: Read, Glob, Grep, Bash
- `complete`: Read, Glob, Grep, wreckit_complete

### Gap 2: Extra MCP Tools Registered ✅ FIXED

~~The MCP server registers all tools even when only a subset should be available.~~

**Status:** Fixed - Ideas phase uses dedicated `ideasMcpServer.ts`. Tool allowlist enforcement at SDK layer blocks unauthorized tools.

### Gap 3: No Structured Completion Verification

Completion is based on signal/exit code, not verification that expected work was done.

**Impact:** Agent can signal completion without producing artifacts.

**Status:** Open - Phase-level artifact validation exists but is separate from completion detection.

---

## See Also

- [001-ideas-ingestion.md](./001-ideas-ingestion.md) — Extraction-only security model
- [004-implement-phase.md](./004-implement-phase.md) — Story-scoped implementation
