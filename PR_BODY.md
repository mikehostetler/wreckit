## Summary

This PR upgrades Wreckit from a CLI tool into an **Autonomous Software Engineering Agent**. It implements the **Recursive Evolution** milestone, allowing the system to dream of tasks, implement code, heal its environment, and optimize its own cognitive prompts.

## Key Features

### 1. The Dreamer (Autonomous Ideation)
- Scans codebase for technical debt and TODOs.
- Generates roadmap items without human input (`wreckit dream`).

### 2. The Doctor (Self-Healing Immune System)
- Diagnoses and fixes corrupted JSON data and git blockers.
- Automatically stashes changes to unblock branch checkouts (`wreckit doctor --fix`).
- **New**: Automatically repairs PRD metadata schema violations.

### 3. The Geneticist (Cognitive Evolution)
- Analyzes failure logs to identify recurring patterns.
- Autonomously rewrites system prompts (`src/prompts/*.md`) to improve reasoning over time.

### 4. Cloud Sandboxing (Inception Mode)
- **Isolated Execution**: Full integration with **Sprites.dev** (Firecracker microVMs) via the `sprite` CLI.
- **Bi-directional Sync**: High-performance project synchronization using native CLI streaming (no `E2BIG` errors).
- **Identity Propagation**: Automatically forwards host Git identity (name/email) to sandboxes for attributed commits.
- **Zero-Config Flag**: The `--sandbox` flag enables instant, ephemeral isolation for any command.

### 5. Universal LLM Protocol
- **Provider Agnostic**: Unified Sprite and RLM runners on the **Official SDK**, verified with **Z.AI** and **GLM-4.7**.
- **Hallucination Handling**: Implemented a **Universal Protocol Loop** that parses both native tool calls and model-specific XML hallucinations.

### 6. The Navigator (Strategic Planning)
- **Goal-Driven Logic**: New `wreckit strategy` command that analyzes `ROADMAP.md` and active items to recommend the next high-leverage move.

### 7. Industry Standard Documentation
- Integrated **VitePress** documentation site.
- Integrated **TypeDoc** for automated API reference from source code.
- Deployed to GitHub Pages via automated Actions.

### 8. End-to-End Verification
- Includes the `wreckit joke` command, which was researched, planned, and implemented autonomously by the system to prove its capabilities.

## Technical Quality
- Comprehensive test coverage for new commands.
- Adheres to established dependency injection and logger patterns.
- 100% backwards compatible with existing SDK/Process modes.