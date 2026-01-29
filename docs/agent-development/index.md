# Agent Development Guidelines

Guidelines and patterns for developing Wreckit agents.

## Overview

This section covers everything you need to know about developing and customizing Wreckit agents, from code style to SDK patterns to MCP tools.

## Specifications

**IMPORTANT:** Before implementing any feature, consult the specifications in `specs/README.md`.

- **Assume NOT implemented.** Many specs describe planned features that may not yet exist in the codebase.
- **Check the codebase first.** Before concluding something is or isn't implemented, search the actual code. Specs describe intent; code describes reality.
- **Use specs as guidance.** When implementing a feature, follow the design patterns, types, and architecture defined in the relevant spec.
- **Spec index:** `specs/README.md` lists all specifications organized by phase.

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

## Code Style

- **Formatting:** Use Prettier defaults (run `bun run lint` to check)
- **Errors:** Use custom error classes extending `Error`. Propagate with descriptive messages.
- **Async:** Use async/await. Avoid callbacks.
- **Imports:** Group by external packages, then internal modules.
- **Naming:** camelCase for functions/variables, PascalCase for types/classes, SCREAMING_CASE for constants.
- **No comments** unless code is complex and requires context for future developers.
- **Testing:** Use Bun's built-in test runner. Tests go in `src/__tests__/`.
- **Logging:** Use structured logging. Never log secrets directly.

## Design Principles

- When multiple code paths do similar things with slight variations, create a shared service with a request struct that captures the variations, rather than having each caller implement its own logic.
- Prefer composition over inheritance.
- Keep functions small and focused on a single responsibility.

## Building & Testing

```bash
bun build          # Build the CLI
bun test           # Run all tests
bun test src/__tests__/foo.test.ts  # Run single test file
bun run typecheck  # Type check the codebase
bun run lint       # Lint the codebase
```

## Sections

- [SDK Patterns](/agent-development/sdk-patterns) - Session API vs Query API patterns
- [MCP Tools](/agent-development/mcp-tools) - Available MCP tools and best practices
- [Customization](/agent-development/customization) - Custom prompts and templates
