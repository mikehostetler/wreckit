# MCP Tools

Available MCP tools and best practices.

## Overview

Wreckit uses a custom MCP (Model Context Protocol) server to provide structured output capabilities to the agent. Instead of having the agent output JSON directly or edit files, we provide MCP tools that the agent can call.

## Benefits of MCP Tools

- **Structured output:** Guaranteed valid JSON/structured data
- **Type safety:** Tool schemas define expected input/output
- **Better prompting:** Agent is told to call tools, not format output
- **Easier debugging:** Tool calls are logged and inspectable
- **Composability:** Tools can be combined in complex workflows

## MCP Server Pattern

Custom MCP tools are defined in `src/agent/mcp/wreckitMcpServer.ts`:

```typescript
const server = createWreckitMcpServer({
  onInterviewIdeas: (ideas) => { capturedIdeas = ideas; },
  onParsedIdeas: (ideas) => { /* from ideas command */ },
  onSavePrd: (prd) => { /* from plan phase */ },
  onUpdateStoryStatus: (storyId, status) => { /* from implement phase */ },
});
```

## Available MCP Tools

### save_interview_ideas

**Phase:** Interview
**Purpose:** Capture structured ideas from conversational interview

**Input:** Ideas array with title, description, etc.
**Output:** Confirmation of saved ideas
**Use when:** Agent conducted interview with user and needs to save results

**Example prompt:**
> "Use the save_interview_ideas tool to save the ideas we discussed."

---

### save_parsed_ideas

**Phase:** Ideas ingestion
**Purpose:** Parse ideas from piped document input (stdin or file)

**Input:** Raw text from ideas file
**Output:** Structured ideas array
**Use when:** Ingesting ideas from `wreckit ideas < FILE` command

**Example prompt:**
> "Use the save_parsed_ideas tool to process these ideas from the input."

---

### save_prd

**Phase:** Plan
**Purpose:** Save PRD with user stories (replaces writing prd.json directly)

**Input:** PRD object with schema_version, user_stories array
**Output:** Confirmation of saved PRD
**Use when:** Agent has created user stories and needs to persist them

**Example prompt:**
> "Use the save_prd tool to save the product requirements document with your user stories."

**PRD Schema:**
```typescript
{
  schema_version: 1,
  user_stories: [
    {
      id: "US-001",
      title: "Story title",
      acceptance_criteria: ["criteria 1", "criteria 2"],
      priority: 1,
      status: "pending" | "done",
      notes: "optional notes"
    }
  ]
}
```

---

### update_story_status

**Phase:** Implement
**Purpose:** Mark a story as done (replaces editing prd.json directly)

**Input:** storyId (string), status ("pending" | "done")
**Output:** Confirmation of updated status
**Use when:** Agent completed a user story and needs to mark it done

**Example prompt:**
> "Use the update_story_status tool to mark story US-001 as done."

---

## Best Practices

### 1. Prompt the Agent to Use Tools

Instead of asking the agent to output JSON or edit files, prompt it to call MCP tools:

**❌ Don't do this:**
> "Output your PRD as JSON in a code block."

**✅ Do this:**
> "Use the save_prd tool to save your product requirements document."

### 2. Leverage Tool Schemas

MCP tools have defined input/output schemas. The agent knows what to provide. You don't need to specify exact JSON structure in your prompt.

### 3. Combine Tools

Tools can be called in sequence. For example:

1. `save_parsed_ideas` - Parse ideas from input
2. `save_prd` - Create PRD for each idea
3. `update_story_status` - Mark stories done as implemented

### 4. Inspect Tool Calls

Tool calls are logged. You can see exactly what the agent passed to each tool in the logs.

### 5. Test Tool Handlers

Tool handlers are TypeScript functions. Write unit tests for them like any other code.

```typescript
// Example test
test('save_prd writes valid PRD', async () => {
  const mockHandler = jest.fn();
  const server = createWreckitMcpServer({
    onSavePrd: mockHandler
  });

  const prd = { schema_version: 1, user_stories: [...] };
  await server.handleToolCall('save_prd', prd);

  expect(mockHandler).toHaveBeenCalledWith(prd);
});
```

## Adding New MCP Tools

To add a new MCP tool:

1. **Define tool schema** in `src/agent/mcp/wreckitMcpServer.ts`
2. **Implement handler** function
3. **Register tool** in the server
4. **Update prompts** to tell agent when to use it
5. **Write tests** for the handler

**Example:**
```typescript
const server = createWreckitMcpServer({
  // Existing handlers...
  onMyNewTool: (input) => {
    // Handle the tool call
    return { success: true, data: ... };
  }
});

// Register the tool
server.registerTool({
  name: 'my_new_tool',
  description: 'What the tool does',
  inputSchema: {
    type: 'object',
    properties: {
      // Define input properties
    }
  }
});
```

[Back to Agent Development](/agent-development/)
