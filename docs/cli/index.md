# CLI Reference

Complete reference for all Wreckit CLI commands.

## Quick Reference

| Command | Purpose |
|---------|---------|
| `wreckit` | Run everything. TUI shows progress. |
| `wreckit init` | Initialize `.wreckit/` in repo |
| `wreckit ideas < FILE` | Ingest ideas (create idea items) |
| `wreckit status` | List all items + state |
| `wreckit run <id>` | Run single item through all phases (id: `1`, `2`, or `001-slug`) |
| `wreckit next` | Run next incomplete item |
| `wreckit doctor` | Validate items, fix broken state |

### Autonomous Runtime

For fully autonomous, self-healing, and self-improving operation, use the Watchdog script.

| Script | Purpose |
|--------|---------|
| `./watchdog.sh` | **The Sovereign Entry Point.** Runs Wreckit in a persistent, self-compiling loop. |

---

## Sections

- [Essential Commands](/cli/essentials) - Core commands you'll use every day
- [Phase Commands](/cli/phases) - Commands for each workflow phase (debugging)
- [Flags](/cli/flags) - Global and command-specific flags
- [Exit Codes](/cli/exit-codes) - Understanding exit codes for scripting
