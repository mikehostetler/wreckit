# AGENTS.md – Wreckit CLI

## Commands

| Command | Does |
|---------|------|
| `wreckit` | Run all incomplete items (research → plan → implement → PR) |
| `wreckit next` | Run next incomplete item |
| `wreckit run <id>` | Run single item through all phases (id: `1`, `2`, or `001-slug`) |
| `wreckit ideas < FILE` | Ingest ideas (create idea items) |
| `wreckit status` | List all items + state |
| `wreckit list` | List items (with optional `--state` filtering) |
| `wreckit show <id>` | Show item details |
| `wreckit init` | Initialize `.wreckit/` in repo |
| `wreckit doctor` | Validate items, fix broken state |

### Phase Commands (debugging)

| Command | Transition |
|---------|------------|
| `wreckit research <id>` | idea → researched |
| `wreckit plan <id>` | researched → planned |
| `wreckit implement <id>` | planned → implementing |
| `wreckit pr <id>` | implementing → in_pr |
| `wreckit complete <id>` | in_pr → done |

## Flags

- `--verbose` — More logs
- `--quiet` — Errors only
- `--debug` — JSON output (ndjson)
- `--no-tui` — Disable UI (CI mode)
- `--dry-run` — Preview, don't execute
- `--force` — Regenerate artifacts
- `--cwd <path>` — Override working directory
- `--fix` — Auto-repair (doctor only)

## State Flow

```
idea → researched → planned → implementing → in_pr → done
```

## Testing

```bash
bun test                           # All tests
bun test src/__tests__/foo.test.ts # Single file
```

## Key Files

- `src/index.ts` — CLI entry, commands
- `src/domain/` — State machine, item indexing
- `src/commands/` — Phase handlers
- `src/agent/` — Agent subprocess
- `src/git/` — Git ops
- `src/fs/paths.ts` — Path helpers (items stored in `.wreckit/items/`)

## Config

`.wreckit/config.json`:
```json
{
  "schema_version": 1,
  "base_branch": "main",
  "branch_prefix": "wreckit/",
  "merge_mode": "pr",
  "agent": {"command": "amp", "args": ["--dangerously-allow-all"]},
  "max_iterations": 100,
  "timeout_seconds": 3600
}
```

### Merge Modes

- `"pr"` (default): Creates a PR for each item, waits for merge
- `"direct"`: YOLO mode - merges directly to base branch without PRs (good for greenfield projects)

## Exit Codes

- `0` — Success
- `1` — Error
- `130` — Interrupted

## Claude Agent SDK Patterns

### Session API vs Query API

| API | Use Case | MCP Support |
|-----|----------|-------------|
| `unstable_v2_createSession()` | Interactive multi-turn conversations | ❌ No |
| `query()` | Autonomous agent tasks with tools | ✅ Yes |

### Piping Session → Query with MCP

To use MCP tools after a conversational session:

1. **Capture session ID** during streaming:
   ```typescript
   for await (const msg of session.stream()) {
     if (msg.session_id) sessionId = msg.session_id;
   }
   ```

2. **Resume with query()** to access MCP:
   ```typescript
   const result = query({
     prompt: "Extract structured data from our conversation",
     options: {
       resume: sessionId,  // Continues with full context
       mcpServers: { wreckit: wreckitMcpServer }
     }
   });
   ```

### MCP Server Pattern

Custom MCP tools for structured output (see `src/agent/mcp/wreckitMcpServer.ts`):

```typescript
const server = createWreckitMcpServer({
  onInterviewIdeas: (ideas) => { capturedIdeas = ideas; },
  onParsedIdeas: (ideas) => { /* from ideas command */ },
  onSavePrd: (prd) => { /* from plan phase */ },
  onUpdateStoryStatus: (storyId, status) => { /* from implement phase */ },
});
```

### Available MCP Tools

| Tool | Phase | Purpose |
|------|-------|---------|
| `save_interview_ideas` | Interview | Capture structured ideas from conversational interview |
| `save_parsed_ideas` | Ideas ingestion | Parse ideas from piped document input |
| `save_prd` | Plan | Save PRD with user stories (replaces writing prd.json directly) |
| `update_story_status` | Implement | Mark a story as done (replaces editing prd.json directly) |

Prompt the agent to call MCP tools instead of outputting JSON directly or editing JSON files.
