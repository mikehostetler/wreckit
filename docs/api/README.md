# API Reference

Welcome to the Wreckit API reference. This documentation is automatically generated from the TypeScript source code using [Typedoc](https://typedoc.org/).

## Modules

The Wreckit codebase is organized into several key modules:

- **[Agent](./agent/)**: Core agent runtime and SDK adapters (Claude, Amp, Codex, OpenCode).
- **[Commands](./commands/)**: CLI command implementations (run, phase, status, list, etc.).
- **[Doctor](./doctor/)**: System validation and self-healing logic.
- **[Index](./index/)**: Main entry point and orchestration logic.

## Regenerating Documentation

If you've made changes to the code and want to update the API documentation, run:

```bash
bun run docs:api
```

This will extract the latest docstrings and generate markdown files in `docs/api/`.