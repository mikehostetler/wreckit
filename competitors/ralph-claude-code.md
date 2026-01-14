# ralph-claude-code (frankbria)

**Repository:** https://github.com/frankbria/ralph-claude-code  
**Author:** Frank Bria  
**Language:** Shell (100%)  
**Stars:** Not specified  
**Version:** v0.9.9

## Overview

A shell-based Ralph implementation focused specifically on Claude Code with extensive testing, intelligent exit detection, and tmux integration for live monitoring. Aiming for v1.0 release.

## Key Features

### Intelligent Exit Detection
- **Dual-condition exit gate:** Requires BOTH completion indicators AND explicit `EXIT_SIGNAL`
- Prevents premature exits when Claude reports work in progress
- Response analyzer with semantic understanding and two-stage error filtering
- Multi-line error matching for accurate stuck loop detection

### Session Management
- **Session continuity** with `--continue` flag for context preservation
- **Session expiration** with configurable timeout (default: 24 hours)
- Session auto-reset on: circuit breaker open, manual interrupt, project completion
- Session history tracking (last 50 transitions)

### Rate Limiting & Error Handling
- Built-in API call management with hourly limits (100 calls/hour, configurable)
- 5-hour API limit handling with user prompts (wait/exit options)
- Circuit breaker with advanced error detection
- Automatic retry with exponential backoff

### tmux Integration
Live monitoring dashboard showing:
- Current loop count and status
- API calls used vs. limit
- Recent log entries
- Rate limit countdown

**tmux Controls:**
- `Ctrl+B` then `D` - Detach (keeps Ralph running)
- `Ctrl+B` then `←/→` - Switch panes
- `tmux attach -t <session-name>` - Reattach

### CLI Flags
```bash
./ralph.sh                    # Start loop
./ralph.sh --continue         # Resume with session context
./ralph.sh --timeout 60       # Set execution timeout (1-120 min)
./ralph.sh --verbose          # Detailed progress updates
./ralph.sh --reset-session    # Manual session reset
./ralph.sh --output-format json  # JSON output mode
./ralph.sh --allowed-tools    # Specify allowed tools
```

### Testing
- **308 tests** across 11 test files
- **100% pass rate**
- Unit tests: 164 (CLI parsing, JSON, exit detection, rate limiting)
- Integration tests: 144 (loop execution, edge cases, installation)

### PRD Import
```bash
./ralph_import.sh input.md    # Convert PRD to Ralph format
```
- JSON output format support with automatic fallback
- Enhanced error handling with structured JSON messages
- Session tracking for interrupted conversions

### Project Structure
```
.
├── ralph.sh           # Main loop
├── ralph_import.sh    # PRD converter
├── setup.sh           # Project initialization
├── install.sh         # Global installation
├── uninstall.sh       # Clean removal
└── PROMPT.md          # Project requirements
```

### Roadmap to v1.0 (~4 weeks)
- [ ] Log rotation functionality
- [ ] Dry-run mode
- [ ] Configuration file support (.ralphrc)
- [ ] Metrics and analytics tracking
- [ ] Desktop notifications
- [ ] Git backup and rollback system

## Differentiators
- **Claude Code focused** (no multi-agent)
- **Extensive shell-based testing** (308 tests)
- **tmux live monitoring** dashboard
- **Dual-condition exit detection** (completion + EXIT_SIGNAL)
- **Session lifecycle management** with expiration
- **CI/CD pipeline** with GitHub Actions

## Installation
```bash
git clone https://github.com/frankbria/ralph-claude-code.git
cd ralph-claude-code
./install.sh
```

## Requirements
- Bash 4.0+
- Claude Code CLI (`npm install -g @anthropic-ai/claude-code`)
- tmux (recommended)
- jq
- Git
