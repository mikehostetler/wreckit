# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added - Telegram Gateway Enhancements
- **Inline Buttons**: Added tap-friendly inline buttons throughout the workflow
  - After capturing 3+ notes: "Synthesize" / "View Notes" buttons
  - After synthesis: "Approve & Execute" / "Regenerate" / "View Notes" buttons
  - During execution: "Stop Execution" button
  - After execution: "Merge PRs" / "View Diff" / "Status" buttons
- **Voice Transcription**: Voice messages are now transcribed using OpenAI Whisper
  - Requires `openai.apiKey` in config (falls back gracefully if not set)
  - Transcribed text is automatically added to session notes

### Removed
- Removed duplicate `idea` CLI command. Use `wreckit ideas` instead.
  - The `idea` command was identical to `ideas` and caused confusion
  - All functionality is preserved in the `ideas` command
  - `ideas` supports file input (`-f`), stdin, and interactive interview mode

## [1.0.0] - 2025-01-13

### Major Changes

### SDK Agent Mode (Default)
- Wreckit now uses the Claude Agent SDK by default for agent execution
- Significantly improved performance with in-process agent execution
- Better error handling with structured error types
- Built-in context management and tool support
- Automatic fallback to process mode if SDK authentication fails

### Configuration
- New `agent.mode` option: "sdk" (default) or "process"
- New `agent.sdk_model` option for model selection
- New `agent.sdk_max_tokens` option for token limits
- New `agent.sdk_tools` option for tool customization
- Backward compatible: existing `agent.command` configs still work

### Migration
- See [MIGRATION.md](./MIGRATION.md) for migration guide
- Process mode remains available via `agent.mode: "process"`
- All existing configurations continue to work

### Fixes
- Fixed timeout handling in SDK mode
- Improved error messages for authentication failures
- Better streaming output handling

### Documentation
- Added MIGRATION.md with detailed migration guide
- Updated README.md with SDK mode documentation
- Added integration testing documentation

## Upgrade Notes

If you have a custom `agent.command` configuration, wreckit will continue using process mode. To migrate to SDK mode:

1. Update `.wreckit/config.json`:
   ```json
   {
     "agent": {
       "mode": "sdk",
       "sdk_model": "claude-sonnet-4-20250514"
     }
   }
   ```

2. Ensure `ANTHROPIC_API_KEY` is set or run `claude` to authenticate

3. Test with `--dry-run` first

See [MIGRATION.md](./MIGRATION.md) for more details.

## [0.9.1] - Previous Release

- Initial release with process-based agent execution
- Support for Amp and Claude CLI agents
- Full workflow: research → plan → implement → PR
