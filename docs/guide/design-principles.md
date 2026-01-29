# Design Principles

Core principles behind Wreckit's design.

## 1. Files are Truth

**JSON + Markdown, git-trackable.**

Everything lives in `.wreckit/` as plain text files. No magic databases. No cloud sync. Just files.

This means:
- **Inspectable** - You can read everything Ralph does
- **Git-trackable** - All state is version controlled
- **Editable** - You can fix Ralph's mistakes manually
- **Resumable** - Ctrl-C and pick up where you left off

No hidden state. No proprietary formats. Just Markdown and JSON.

## 2. Idempotent

**Re-run anything safely.**

Run `wreckit` multiple times. It won't redo work that's already done. States are checked before transitions. Items in `done` stay `done`.

If something fails, fix it and run again. Wreckit will skip completed items and continue where it left off.

## 3. Resumable

**Ctrl-C and pick up where you left off.**

Interrupt any operation with `Ctrl-C`. The state is saved. Run `wreckit` again and it continues from the last checkpoint.

No progress is lost. No corrupted state. Just run it again.

## 4. Transparent

**Every prompt is inspectable and editable.**

Want to see what Ralph is thinking? Check `.wreckit/<section>/<item>/prompt.md`.

Want to change the plan? Edit `.wreckit/<section>/<item>/plan.md`.

Want to add a user story? Edit `.wreckit/<section>/<item>/prd.json`.

You're in control. Ralph is just doing the work.

## 5. Recoverable

**`wreckit doctor --fix` repairs broken state.**

Something went wrong? Run `wreckit doctor` to validate your items. Run `wreckit doctor --fix` to automatically repair common issues.

- Invalid states get reset
- Missing artifacts get regenerated
- Orphaned git branches get cleaned up

You don't need to understand the internals. Ralph can fix itself.

Previous: [Folder Structure](/guide/folder-structure)
