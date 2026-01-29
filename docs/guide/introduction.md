# Introduction to Wreckit

> *"I'm gonna wreck it!"* — Wreck-It Ralph
> *"I'm in danger."* — Ralph Wiggum, also your codebase

**Wreckit is your AI agent, unsupervised, wrecking through your backlog while you sleep.**

## What Is This

A CLI that runs a **Ralph Wiggum Loop** over your roadmap:

\`\`\`
ideas → research → plan → implement → PR → done
       └──────────────────────────────────┘
         "I'm helping!" — the agent, probably
\`\`\`

You dump a text file of half-baked ideas. Wreckit turns them into researched, planned, implemented, and PR'd code. You review. Merge. Ship.

## Design Principles

1. **Files are truth** — JSON + Markdown, git-trackable
2. **Idempotent** — Re-run anything safely
3. **Resumable** — Ctrl-C and pick up where you left off
4. **Transparent** — Every prompt is inspectable and editable
5. **Recoverable** — \`wreckit doctor --fix\` repairs broken state

## What's Next

- [Installation](/guide/installation) — Get Wreckit running on your machine
- [Quick Start](/guide/quick-start) — See Wreckit in action with an example session
- [Configuration](/guide/configuration) — Set up your agent and workflow preferences
- [CLI Reference](/cli/) — Explore all available commands
