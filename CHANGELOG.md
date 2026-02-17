# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Critique Phase** — Adversarial self-review phase (`implementing` → `critique`) that runs tests, checks types, and verifies end-to-end behavior before merging. New `wreckit critique <id>` command.
- **Sandbox Mode** — Run agents in isolated Firecracker microVMs via Sprite/Wisp integration. Use `--sandbox` flag for ephemeral VMs with automatic cleanup, or `wreckit sprite` subcommands for manual VM management. Includes push/pull file sync, exec, attach, and doctor integration.
- **RLM Mode** — Recursive Language Model architecture (`--rlm` or `--agent rlm`) using @ax-llm/ax. Offloads prompts to a persistent JS runtime (`CONTEXT_DATA`), enabling infinite context via `RunJS` tool. Supports Anthropic, Z.AI, OpenAI, and Google providers.
- **Meta-Agents**:
  - `wreckit dream` — Autonomous ideation: scans codebase for TODOs, gaps, and tech debt to generate new items
  - `wreckit strategy` — Analyzes project state and generates/updates ROADMAP.md
  - `wreckit geneticist` — Recursive prompt optimization from healing logs
  - `wreckit learn` — Extracts reusable patterns into skills.json with append/replace/ask merge strategies
- **Utility Commands**:
  - `wreckit execute-roadmap` — Converts ROADMAP.md milestones into wreckit items
  - `wreckit shell <id> <command>` — Execute shell commands on an item's branch
  - `wreckit summarize` — Generate feature visualization summaries
  - `wreckit check-integrity` — Verify dist/ is in sync with src/
  - `wreckit watchdog` — Watch source files and rebuild on changes
  - `wreckit rollback <id>` — Undo a direct-merge item
- **Direct Merge Mode** — YOLO mode (`merge_mode: "direct"`) merges directly to base branch without PRs. Includes anti-clobber protection, stash-on-switch, merge conflict recovery, and rollback support. Works without a GitHub remote.
- **Parallel Execution** — `--parallel <n>` flag to process multiple items simultaneously
- **Batch Resume** — `--no-resume` and `--retry-failed` flags for controlling batch run behavior
- **Self-Healing** — Automatic error recovery with `--no-healing` flag to disable
- **Agent Backend Override** — `--agent <kind>` flag to override configured agent backend at runtime
- **Mock Agent** — `--mock-agent` flag for testing workflows without API calls
- **Experimental SDK Modes** — `amp_sdk`, `codex_sdk`, `opencode_sdk` agent backends sharing auth/env resolution with `claude_sdk`
- **Interactive Ideas Interview** — `wreckit ideas` supports conversational interview mode via MCP tools
- **No-Remote Git Support** — Direct merge mode works on repos without a GitHub remote
- **Sprite Subcommands** — `sprite status`, `sprite resume`, `sprite destroy` for session management
- **Story Scope Enforcement** — Agent implementation bounded to planned story scope
- **MIGRATION.md** — Comprehensive migration guide for process → SDK mode transition

### Changed

- State terminology: `raw` → `idea` as initial state
- Config format: `agent.mode` → `agent.kind` (backward compatible)
- Phase flow now includes critique: `idea → researched → planned → implementing → critique → in_pr → done`
- CLI version now matches package.json (was hardcoded as `0.0.1`)
- `bun build` → `bun run build` in documentation (correct invocation for tsup script)
- Refactored git monolith into focused modules
- Removed deprecated legacy agent APIs

### Fixed

- Direct merge: commit done state after merge to prevent anti-clobber regression
- Git: skip pull when no remote configured for direct merge
- Doctor: repair PRD schemas and orphaned item states
- Tests: replace mockRejectedValue with mockImplementation for Bun compatibility
- Resolved all open GitHub issues (#43-#52): git operations, critique phase fixes

### Removed

- Duplicate `idea` CLI command (use `wreckit ideas` instead)
- `wreckit sdk-info` command (commented out, use `wreckit doctor` instead)

## [1.0.0] - 2025-01-13

### Added

- **SDK Agent Mode** (default) using Claude Agent SDK for in-process agent execution
- Structured error types and built-in context management
- New config options: `agent.kind`, `agent.model`, `agent.max_tokens`
- Automatic fallback to process mode if SDK authentication fails
- CHANGELOG.md and initial documentation

### Fixed

- Timeout handling in SDK mode
- Error messages for authentication failures
- Streaming output handling

## [0.9.1] - 2024-12-01

### Added

- Initial release with process-based agent execution
- Support for Amp and Claude CLI agents
- Full workflow: research → plan → implement → PR
- TUI progress interface
- File-based state management in `.wreckit/`
