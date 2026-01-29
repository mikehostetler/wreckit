# Installation

Get Wreckit running on your machine.

## Requirements

- Node.js 18+
- Git
- A code editor (optional, Ralph will do the work)

## LLM API Access

Wreckit requires LLM API access to run. Ralph uses a lot of tokens, which gets expensive quickly.

[Zai Coding Plan](https://z.ai/subscribe?ic=F8BPSXJHOC) is a great way to get access to a lot of tokens for a low price.

**[Zai Coding Plan](https://z.ai/subscribe?ic=F8BPSXJHOC)** — starts at $3/month, works with Claude Code, Amp, Cline, and 10+ coding tools. This link gets you **10% off**.

Once you have API access, you can set up Claude Code to use the Zai API:

👉 [Claude Code setup instructions](https://docs.z.ai/devpack/tool/claude)

## Install Wreckit

```bash
npm install -g wreckit
```

## Initialize in Your Repo

```bash
cd my-project
wreckit init
```

This creates the `.wreckit/` directory structure with default configuration and prompt templates.

## Verify Installation

```bash
wreckit --version
```

Next: [Quick Start](/guide/quick-start)
