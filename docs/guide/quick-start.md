# Quick Start

See Wreckit in action with an example session.

## Basic Workflow

```bash
# Install the chaos
npm install -g wreckit

# Initialize in your repo
cd my-project
wreckit init

# Feed it ideas (literally anything)
wreckit ideas < IDEAS.md
# or: echo "add dark mode" | wreckit ideas
# or: wreckit ideas --file ROADMAP.md

# Let Ralph loose
wreckit

# Go do something else. Come back to PRs.
```

## Example Session

```bash
$ cat IDEAS.md
Add dark mode toggle
Fix the login timeout bug
Migrate auth to OAuth2

$ wreckit ideas < IDEAS.md
Created 3 items:
  features/001-dark-mode-toggle
  bugs/001-login-timeout
  infra/001-oauth2-migration

$ wreckit status
ID                              STATE
features/001-dark-mode-toggle   raw
bugs/001-login-timeout          raw
infra/001-oauth2-migration      raw

$ wreckit
# TUI runs, agent researches, plans, implements...
# You go do literally anything else

$ wreckit status
ID                              STATE     PR
features/001-dark-mode-toggle   in_pr     #42
bugs/001-login-timeout          in_pr     #43
infra/001-oauth2-migration      implementing

$ # Review PRs, merge, done
```

## What Just Happened

1. **ideas** - Ingested your ideas into `.wreckit/` as items
2. **research** - Agent analyzed your codebase, wrote `research.md` for each item
3. **plan** - Agent created `plan.md` + `prd.json` with user stories
4. **implement** - Agent coded stories, committed as it went
5. **pr** - Agent opened pull requests for your review

You just did nothing while Ralph did everything.

Previous: [Installation](/guide/installation) | Next: [Configuration](/guide/configuration)
