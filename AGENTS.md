# Wreckit Agent Guidelines

## Specifications

**IMPORTANT:** Before implementing any feature, consult the specifications in `specs/README.md`.

- **Assume NOT implemented.** Many specs describe planned features that may not yet exist in the codebase.
- **Check the codebase first.** Before concluding something is or isn't implemented, search the actual code. Specs describe intent; code describes reality.
- **Use specs as guidance.** When implementing a feature, follow the design patterns, types, and architecture defined in the relevant spec.
- **Spec index:** `specs/README.md` lists all specifications organized by phase.

## Commands

### Building & Testing

| Command | Does |
|---------|------|
| `bun build` | Build the CLI |
| `bun test` | Run all tests |
| `bun test src/__tests__/foo.test.ts` | Run single test file |
| `bun run typecheck` | Type check the codebase |
| `bun run lint` | Lint the codebase |

### CLI Commands

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
| `wreckit rollback <id>` | Rollback a direct-merge item to pre-merge state |

### Phase Commands (debugging)

| Command | Transition |
|---------|------------|
| `wreckit research <id>` | idea → researched |
| `wreckit plan <id>` | researched → planned |
| `wreckit implement <id>` | planned → implementing |
| `wreckit pr <id>` | implementing → in_pr |
| `wreckit complete <id>` | in_pr → done |

### Flags

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

## Architecture

TypeScript CLI built with Bun. Key directories:

- `src/index.ts` — CLI entry, commands
- `src/domain/` — State machine, item indexing
- `src/commands/` — Phase handlers
- `src/agent/` — Agent subprocess and SDK integration
- `src/agent/mcp/` — MCP server for structured output
- `src/git/` — Git operations
- `src/fs/paths.ts` — Path helpers (items stored in `.wreckit/items/`)
- `specs/` — Feature specifications

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
  "timeout_seconds": 3600,
  "branch_cleanup": {"enabled": true, "delete_remote": true}
}
```

### Environment Variable Resolution

When using `agent.mode: "sdk"`, environment variables are merged from multiple sources with this precedence (highest first):

1. `.wreckit/config.local.json` `agent.env` (project-specific, gitignored)
2. `.wreckit/config.json` `agent.env` (project defaults)
3. `process.env` (shell environment)
4. `~/.claude/settings.json` `env` (Claude user settings)

Example `.wreckit/config.local.json` for custom API routing:
```json
{
  "agent": {
    "env": {
      "ANTHROPIC_BASE_URL": "https://api.z.ai/api/anthropic",
      "ANTHROPIC_AUTH_TOKEN": "your-token-here"
    }
  }
}
```

When `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN` are set, `ANTHROPIC_API_KEY` is automatically blanked to prevent credential fallback.

For complete environment variable documentation including model selection variables and allowed prefixes, see [MIGRATION.md#environment-variables](./MIGRATION.md#environment-variables).

### Merge Modes

- `"pr"` (default): Creates a PR for each item, waits for merge
- `"direct"`: YOLO mode - merges directly to base branch without PRs (good for greenfield projects)

## Exit Codes

- `0` — Success
- `1` — Error
- `130` — Interrupted

## Code Style

- **Formatting:** Use Prettier defaults (run `bun run lint` to check)
- **Errors:** Use custom error classes extending `Error`. Propagate with descriptive messages.
- **Async:** Use async/await. Avoid callbacks.
- **Imports:** Group by external packages, then internal modules.
- **Naming:** camelCase for functions/variables, PascalCase for types/classes, SCREAMING_CASE for constants.
- **No comments** unless code is complex and requires context for future developers.
- **Testing:** Use Bun's built-in test runner. Tests go in `src/__tests__/`.
- **Logging:** Use structured logging. Never log secrets directly.

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

## Design Principles

- When multiple code paths do similar things with slight variations, create a shared service with a request struct that captures the variations, rather than having each caller implement its own logic.
- Prefer composition over inheritance.
- Keep functions small and focused on a single responsibility.
