---
layout: home

hero:
  name: Wreckit
  text: Your AI agent, unsupervised, wrecking through your backlog while you sleep
  tagline: A CLI tool for turning ideas into automated PRs through an autonomous agent loop
  actions:
    - theme: brand
      text: Get Started
      link: /guide/introduction
    - theme: alt
      text: View on GitHub
      link: https://github.com/jmanhype/wreckit

features:
  - icon: ⚡
    title: Idea to PR
    details: Dump a text file of half-baked ideas. Wreckit turns them into researched, planned, implemented, and PR'd code.
  - icon: 🔄
    title: Ralph Wiggum Loop
    details: The Research → Plan → Implement workflow, fully automated. Go do literally anything else while Ralph works.
  - icon: 📁
    title: Files are Truth
    details: Everything lives in .wreckit/ as JSON and Markdown. Git-trackable. Inspectable. Resumable. No magic.
  - icon: 🔧
    title: Agent SDK
    details: Uses Claude Agent SDK for best performance. Supports multiple backends (Amp, Codex, OpenCode).
  - icon: ☁️
    title: Cloud Sandboxes
    details: Designed for multi-actor parallelism. Spin up a fleet of Ralphs, let them wreck in parallel.
  - icon: 🎯
    title: Idempotent & Resumable
    details: Re-run anything safely. Ctrl-C and pick up where you left off. Every prompt is inspectable.
---

## How It Works

Each item progresses through states:

```
raw → researched → planned → implementing → in_pr → done
```

### The Workflow

1. **Research** — Agent reads your codebase thoroughly. Finds patterns. Documents file paths, conventions, integration points.
2. **Plan** — Agent designs the solution. Breaks it into phases with success criteria. Creates user stories with acceptance criteria.
3. **Implement** — Agent picks the highest priority story, implements it, runs tests, commits, marks it done. Repeats until all stories complete.
4. **PR** — Agent opens a pull request. You review. You merge. You ship.

## Quick Start

\`\`\`bash
# Install the chaos
npm install -g wreckit

# Initialize in your repo
cd my-project
wreckit init

# Feed it ideas
wreckit ideas < IDEAS.md

# Let Ralph loose
wreckit

# Go do something else. Come back to PRs.
\`\`\`

---

**What is this?** — A CLI that runs a Ralph Wiggum Loop over your roadmap.

Built on the [HumanLayer](https://github.com/humanlayer/humanlayer) Research → Plan → Implement workflow.
