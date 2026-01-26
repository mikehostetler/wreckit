# SDK Patterns

Session API vs Query API patterns for agent development.

## Claude Agent SDK Overview

Wreckit uses the Claude Agent SDK for agent interactions. Understanding when to use each API is crucial for building effective agents.

## Session API vs Query API

| API | Use Case | MCP Support | Description |
|-----|----------|-------------|-------------|
| `unstable_v2_createSession()` | Interactive multi-turn conversations | ❌ No | Use for conversational interfaces where human interaction is expected |
| `query()` | Autonomous agent tasks with tools | ✅ Yes | Use for autonomous tasks that need tool access |

### Session API

**Use when:** You need interactive, conversational interactions with the agent.

**Characteristics:**
- Multi-turn conversations
- Streaming responses
- No MCP tool support
- Better for interview-style interactions
- Agent can ask clarifying questions

**Example:**
```typescript
const session = unstable_v2_createSession({
  model: "claude-sonnet-4-20250514",
  maxTokens: 8192
});

for await (const msg of session.stream()) {
  console.log(msg.content);
}
```

### Query API

**Use when:** You need autonomous task execution with tool access.

**Characteristics:**
- Single request/response
- MCP tool support
- Better for autonomous agents
- Structured output via tools
- No conversation state

**Example:**
```typescript
const result = query({
  prompt: "Analyze this codebase and create a plan",
  options: {
    model: "claude-sonnet-4-20250514",
    maxTokens: 8192,
    mcpServers: {
      wreckit: wreckitMcpServer
    }
  }
});
```

## Piping Session → Query with MCP

A common pattern is to start with a conversational session, then continue with an autonomous query that has MCP tool access.

### Use Case

You want to:
1. Interview the user to gather requirements (Session API)
2. Then autonomously process those requirements with tools (Query API)

### Implementation

**1. Capture session ID during streaming:**

```typescript
let sessionId: string | undefined;

const session = unstable_v2_createSession({
  model: "claude-sonnet-4-20250514",
  maxTokens: 8192
});

for await (const msg of session.stream()) {
  if (msg.session_id) {
    sessionId = msg.session_id;
  }
  // Handle streaming content
}
```

**2. Resume with query() to access MCP:**

```typescript
const result = query({
  prompt: "Extract structured data from our conversation",
  options: {
    resume: sessionId,  // Continues with full context
    mcpServers: {
      wreckit: wreckitMcpServer
    }
  }
});
```

### Benefits

- User gets conversational experience during requirements gathering
- Agent gets tool access for autonomous processing
- Full conversation context is preserved
- Best of both APIs

## When to Use Each Pattern

### Use Session API when:
- Building interactive CLI interfaces
- User needs to provide iterative feedback
- Requirements gathering phase
- Clarifying questions are expected
- Human-in-the-loop workflow

### Use Query API when:
- Running autonomous phases (research, plan, implement)
- Need structured output via MCP tools
- Single-shot tasks
- Batch processing
- No user interaction expected

### Use Session → Query pattern when:
- Start conversational, then autonomous
- Need both user interaction AND tool access
- Interview phase followed by processing
- Converting unstructured conversation to structured data

[Back to Agent Development](/agent-development/)
