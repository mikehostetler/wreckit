# WreckitGo Agent Guidelines

## Project Overview

WreckitGo is a **Telegram-first mobile gateway** for Wreckit that lets users drive AI coding workflows from mobile. The architecture follows: **CAPTURE → SYNTHESIZE → EXECUTE**.

## Quick Commands

| Command | Does |
|---------|------|
| `bun install` | Install dependencies |
| `bun run build` | Build the CLI |
| `bun run dev` | Run in dev mode |
| `bun test` | Run all tests |
| `bun run typecheck` | Type check the codebase |
| `wreckit gateway start` | Start Telegram bot + orchestrator |
| `wreckit onboard` | Run setup wizard |

## Architecture

```
packages/
├── shared/           # Shared types & contracts
│   └── contracts.ts  # Session, Ticket, Run types
├── gateway/          # Telegram gateway + orchestrator
│   ├── telegram.ts   # Telegram bot adapter (polling)
│   ├── orchestrator.ts   # Session/run orchestration
│   ├── session-store.ts  # File-backed session store
│   └── prompts/      # Prompt templates for synthesis
├── providers/        # External service integrations
│   ├── llm.ts        # LLM abstraction (z.ai, OpenAI, Anthropic, Google)
│   └── github.ts     # GitHub PR, checks, merge, preview URL
├── runner/           # Execution sandbox
│   └── docker-runner.ts  # Docker-based safe runner
├── cli/              # CLI commands
│   ├── gateway.ts    # `wreckit gateway start`
│   └── onboard.ts    # `wreckit onboard`
└── licensing/        # License validation
    └── license.ts    # File-based license check
```

## Session Storage

All session data lives in `.wreckit/sessions/<sessionId>/`:
```
.wreckit/sessions/<sessionId>/
├── meta.json         # Session metadata (mode, repo, timestamps)
├── notes.md          # Raw captured notes
├── attachments/      # Screenshots, voice, files
├── observations.json # Normalized observations
├── tickets.json      # Sliced tickets
├── spec.md           # Generated spec
├── prompt.md         # Generated implementation prompt
└── runs/
    └── <runId>/
        ├── run.json  # Run metadata + events
        ├── logs/     # Phase logs
        └── checkpoint.json  # If stopped early
```

## Config Files

### ~/.wreckit/mobile-config.json
```json
{
  "telegram": {
    "botToken": "env:TELEGRAM_BOT_TOKEN",
    "allowedUserIds": [1630993666]
  },
  "github": {
    "token": "env:GITHUB_TOKEN"
  },
  "llm": {
    "zai": {
      "apiKey": "env:ZAI_API_KEY",
      "baseUrl": "https://api.z.ai/api/paas/v4/chat/completions",
      "model": "glm-4.7"
    },
    "roles": {
      "synthesizer": "zai",
      "implementer": "zai",
      "reviewer": "zai"
    }
  },
  "repos": [
    {
      "owner": "noahchristian",
      "name": "polymarket-aggregator",
      "localPath": "/Users/noahchristian/polymarket-aggregator",
      "defaultBranch": "main"
    }
  ]
}
```

### ~/.wreckit/license.json
```json
{
  "licenseKey": "...",
  "issuedAt": "2025-01-27T00:00:00Z"
}
```

## Intent Routing

| Intent | Triggers | Action |
|--------|----------|--------|
| `START_SESSION` | "start session", "new session" | Create new session |
| `CAPTURE_NOTE` | (default) | Append to notes.md |
| `SYNTHESIZE` | "synthesize", "make tickets", "write spec" | Run synthesis pipeline |
| `EXECUTE` | "go", "implement", "execute" | Run Wreckit phases |
| `STATUS` | "status", "where are we" | Show session status |
| `STOP` | "stop", "pause", "kill" | Hard-kill runner |
| `MERGE` | "merge", "ship it" | Merge PR if checks pass |
| `SWITCH_REPO` | exact "owner/repo" match | Switch active repo |

## Milestones

1. **Telegram + Sessions (CAPTURE)** - Bot connects, captures notes, session persistence
2. **SYNTHESIZE pipeline** - Normalizer → Critic → Slicer → Integrator
3. **EXECUTE (Wreckit runs + PR)** - Docker runner, phase execution, PR creation
4. **Vercel Preview URL detection** - Extract from GitHub checks/deployments
5. **Merge via Telegram** - Check status, squash merge
6. **STOP hard-kill + checkpoints** - Immediate stop, checkpoint save

## Code Style

- **TypeScript/ESM** with strict mode
- **Bun** for runtime and testing
- **Zod** for all schema validation
- **No comments** unless complex logic requires context
- **camelCase** for functions/variables, **PascalCase** for types
- **Async/await** everywhere, no callbacks
- **Structured logging** via pino - NEVER log secrets
- **JSON-only LLM outputs** - always validate/extract JSON from responses

## LLM Provider Priority (MVP)

1. **z.ai** (glm-4.7) - Primary for all roles initially
2. After Milestone 3: Add multi-provider support for role-based selection

## Security Rules

- NEVER log API keys, tokens, or secrets
- Secrets loaded from env vars or config only
- Telegram allowlist enforced - reject unknown user IDs
- Docker runner sandboxes execution
- Command allowlist for runner (no rm -rf, etc.)

## Testing

```bash
bun test                           # All tests
bun test src/__tests__/gateway/    # Gateway tests only
bun test --watch                   # Watch mode
```

## Environment Variables

```bash
TELEGRAM_BOT_TOKEN=...
GITHUB_TOKEN=...
ZAI_API_KEY=...
OPENAI_API_KEY=...      # Optional, for multi-provider
ANTHROPIC_API_KEY=...   # Optional, for multi-provider
GOOGLE_API_KEY=...      # Optional, for multi-provider
```

## Prompt Templates

Store in `packages/gateway/prompts/`:
- `intent_classifier.txt` - Route user messages
- `session_normalizer.txt` - Notes → Observations
- `critic_gap_finder.txt` - Find blocking questions
- `ticket_slicer.txt` - Observations → Tickets
- `spec_integrator.txt` - Generate spec/prompt
- `pr_summary_writer.txt` - Mobile-friendly PR summary

All prompts MUST request **strict JSON output** where applicable.

## Design Principles

- **Idempotent operations** - Re-running is safe
- **File-based state** - No database, git-trackable
- **Progressive enhancement** - Each milestone is shippable
- **Mobile-first UX** - Short messages, inline buttons
- **Fail gracefully** - Always respond to user, even on errors
