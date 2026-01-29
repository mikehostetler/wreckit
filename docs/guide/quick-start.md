# Quick Start

See Wreckit in action with an example session.

## Mode 1: Interactive (The Tool)

Use this when you want to run one specific task or watch the output.

```bash
# 1. Initialize
wreckit init

# 2. Add an idea
echo "Add dark mode" | wreckit ideas

# 3. Run it
wreckit run 1
```

## Mode 2: Autonomous (The Sovereign)

Use this when you want Wreckit to work indefinitely, self-healing and self-improving.

```bash
# 1. Make the supervisor executable
chmod +x watchdog.sh

# 2. Unleash the beast
./watchdog.sh
```

**What Watchdog does:**
1.  **Checks Hygiene:** Runs `wreckit doctor --fix` to repair git/json issues.
2.  **Checks Evolution:** Runs `wreckit geneticist` to optimize prompts.
3.  **Runs Work:** Picks the next item and implements it.
4.  **Rebuilds:** If the agent modified the source code, Watchdog recompiles the binary automatically.

## Example Session (Interactive)

```bash
$ cat IDEAS.md
Add dark mode toggle
Fix the login timeout bug

$ wreckit ideas < IDEAS.md
Created 2 items.

$ wreckit
# TUI runs, agent researches, plans, implements...
```

## What Just Happened?

1. **ideas** - Ingested your ideas into `.wreckit/`
2. **research** - Analyzed codebase, wrote `research.md`
3. **plan** - Created `plan.md` + `prd.json`
4. **implement** - Coded stories, committed as it went
5. **pr** - Opened pull requests

You just did nothing while Ralph did everything.

Previous: [Installation](/guide/installation) | Next: [Configuration](/guide/configuration)