# Wreckit Mobile MVP

Control Wreckit from Telegram on your phone. Capture notes, synthesize into tickets, execute code changes, and merge PRs — all from chat.

## Prerequisites

- Node.js 18+ or Bun
- Docker (for runner, Milestone 3+)
- Git
- GitHub account with token
- Telegram Bot token (from @BotFather)

## Quick Start

### 1. Install dependencies

```bash
cd WreckitGo
bun install
```

### 2. Configure

Run the onboarding wizard:

```bash
bun run dev onboard
```

Or manually create `~/.wreckit/mobile-config.json`:

```json
{
  "telegram": {
    "botToken": "YOUR_BOT_TOKEN",
    "allowedUserIds": [YOUR_TELEGRAM_USER_ID]
  },
  "github": {
    "token": "ghp_..."
  },
  "llm": {
    "zai": {
      "apiKey": "YOUR_ZAI_KEY",
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
      "owner": "yourname",
      "name": "yourrepo",
      "localPath": "/path/to/repo",
      "defaultBranch": "main"
    }
  ]
}
```

### 3. Start the Gateway

```bash
bun run dev gateway start
```

Or with a specific working directory:

```bash
bun run dev gateway start --cwd /path/to/your/project
```

### 4. Message your bot on Telegram

1. Open Telegram
2. Find your bot
3. Send `/start`
4. Start capturing notes!

## Telegram Commands

### Capturing Notes

Just send any message to capture it:
- Text messages → stored as notes
- Photos/screenshots → saved as attachments
- Voice messages → saved (transcription in Milestone 2)
- Documents → saved as attachments

### Actions

| Message | Action |
|---------|--------|
| `status` | Show session status |
| `new session` | Start a fresh session |
| `synthesize` | Create tickets from notes (M2) |
| `go` / `execute` | Start implementation (M3) |
| `stop` | Stop execution (M6) |
| `merge` | Merge PR (M5) |
| `owner/repo` | Switch to a different repo |
| `help` | Show commands |

## Session Storage

All session data is stored in `.wreckit/sessions/<sessionId>/`:

```
.wreckit/sessions/S-abc123/
├── meta.json         # Session metadata
├── notes.md          # All captured notes
├── events.json       # Raw chat events
├── attachments/      # Screenshots, files
│   └── A-xyz.jpg
└── attachments.json  # Attachment manifest
```

## Milestones

### ✅ Milestone 1 — Telegram + Sessions (CAPTURE)
- [x] Telegram bot with polling
- [x] User allowlist security
- [x] Auto-create sessions
- [x] Capture text notes
- [x] Capture screenshots
- [x] Capture voice messages
- [x] Capture documents
- [x] Session persistence
- [x] STATUS command

### 🔲 Milestone 2 — SYNTHESIZE pipeline
- [ ] Normalizer → Observations
- [ ] Critic → Blocking questions
- [ ] Ticket slicer → tickets.json
- [ ] Spec integrator → spec.md

### 🔲 Milestone 3 — EXECUTE (Wreckit runs + PR)
- [ ] Docker runner
- [ ] Phase execution
- [ ] PR creation
- [ ] Progress streaming

### 🔲 Milestone 4 — Vercel Preview URL
- [ ] GitHub check runs parsing
- [ ] Preview URL extraction
- [ ] Telegram notification

### 🔲 Milestone 5 — Merge via Telegram
- [ ] Check PR status
- [ ] Squash merge
- [ ] Confirmation

### 🔲 Milestone 6 — STOP + Checkpoints
- [ ] Hard-kill runner
- [ ] Checkpoint save
- [ ] Resume support

## Troubleshooting

### "Unauthorized user" error
Your Telegram user ID is not in the allowlist. Check `~/.wreckit/mobile-config.json` and add your ID to `telegram.allowedUserIds`.

To find your Telegram user ID:
1. Message @userinfobot on Telegram
2. It will reply with your user ID

### "Config not found" error
Run `bun run dev onboard` to create the config file.

### Bot not responding
1. Check the console for errors
2. Verify your bot token is correct
3. Make sure the bot is running (`bun run dev gateway start`)

### Photos not saving
Ensure the `.wreckit/sessions/` directory is writable.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Telegram                              │
│                           ↓                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              TelegramAdapter (polling)               │   │
│  │  • User allowlist                                    │   │
│  │  • Intent classification                             │   │
│  │  • Message handling                                  │   │
│  └─────────────────────────────────────────────────────┘   │
│                           ↓                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  Orchestrator                        │   │
│  │  • Session management                                │   │
│  │  • Synthesis pipeline (M2)                           │   │
│  │  • Execution coordination (M3)                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                           ↓                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                 SessionStore                         │   │
│  │  • File-backed persistence                           │   │
│  │  • Notes, attachments, events                        │   │
│  └─────────────────────────────────────────────────────┘   │
│                           ↓                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              .wreckit/sessions/                      │   │
│  │  • meta.json, notes.md, attachments/                 │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```
