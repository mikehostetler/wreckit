# CLI Reference

Complete reference for all Wreckit CLI commands.

## Quick Reference

### Essential Commands

| Command | Description |
|---------|-------------|
| `wreckit` | Run all incomplete items (research → plan → implement → PR) |
| `wreckit init` | Initialize `.wreckit/` in repo |
| `wreckit ideas < FILE` | Ingest ideas (create idea items) |
| `wreckit status` | List all items + state |
| `wreckit run <id>` | Run single item through all phases (id: `1`, `2`, or `001-slug`) |
| `wreckit next` | Run next incomplete item |
| `wreckit doctor` | Validate items, fix broken state |

### Additional Commands

| Command | Description |
|---------|-------------|
| `wreckit list` | List items (with optional `--state` filtering) |
| `wreckit show <id>` | Show item details |
| `wreckit learn` | Extract patterns and compile into reusable skills |
| `wreckit rollback <id>` | Rollback a direct-merge item to pre-merge state |

### Phase Commands (Debugging)

| Command | Transition |
|---------|------------|
| `wreckit research <id>` | raw → researched |
| `wreckit plan <id>` | researched → planned |
| `wreckit implement <id>` | planned → implementing |
| `wreckit pr <id>` | implementing → in_pr |
| `wreckit complete <id>` | in_pr → done |

## Sections

- [Essential Commands](/cli/essentials) - Core commands you'll use every day
- [Phase Commands](/cli/phases) - Commands for each workflow phase (debugging)
- [Flags](/cli/flags) - Global and command-specific flags
- [Exit Codes](/cli/exit-codes) - Understanding exit codes for scripting
