# AGENTS.md – Wreckit CLI

## Commands

| Command | Does |
|---------|------|
| `wreckit` | Run all incomplete items (research → plan → implement → PR) |
| `wreckit next` | Run next incomplete item |
| `wreckit run <id>` | Run single item through all phases (id: `1`, `2`, or `001-slug`) |
| `wreckit ideas < FILE` | Ingest ideas (create raw items) |
| `wreckit status` | List all items + state |
| `wreckit list` | List items (with optional `--state` filtering) |
| `wreckit show <id>` | Show item details |
| `wreckit init` | Initialize `.wreckit/` in repo |
| `wreckit doctor` | Validate items, fix broken state |

### Phase Commands (debugging)

| Command | Transition |
|---------|------------|
| `wreckit research <id>` | raw → researched |
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
raw → researched → planned → implementing → in_pr → done
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
  "agent": {"command": "amp", "args": ["--dangerously-allow-all"]},
  "max_iterations": 100,
  "timeout_seconds": 3600
}
```

## Exit Codes

- `0` — Success
- `1` — Error
- `130` — Interrupted
