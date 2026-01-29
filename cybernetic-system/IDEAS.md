# Implement System Overlay Tool

## Overview
Create a tool to overlay static analysis (Item 003) with dynamic traces (Item 004/005) to generate actionable insights about code usage, coverage, and "ghost" dependencies.

## Goals
1.  **Identify Dead Code**: Find public functions that exist in the static catalog but never appear in dynamic traces (candidates for deletion).
2.  **Reveal Ghost Code**: Identify call paths that appear in dynamic traces but were missed by static analysis (dynamic dispatch, `apply/3`).
3.  **Map Hot Paths**: Visualize which static paths are most frequently traversed at runtime.

## Phases

### Phase 1: Ingest & Normalize
- Create `Mix.Tasks.Cyb.Overlay`.
- Read `archeology-results.json` (Static) and `dynamic-traces.json` (Dynamic).
- Normalize data structures into a unified graph format.

### Phase 2: Diff Analysis
- **Dead Code Detection**: `Static Functions - Dynamic Spans`. Filter out known test/callback patterns.
- **Ghost Detection**: `Dynamic Spans - Static Calls`. Identify edges that exist only at runtime.
- **Coverage Metrics**: Calculate % of static code exercised by dynamic traces per module.

### Phase 3: Reporting
- Generate `overlay-report.json` with structured findings.
- Output a human-readable summary to console:
    - 📉 Dead Code Candidates (high confidence)
    - 👻 Ghost Paths Discovered
    - 🔥 Hot Modules

## Output
A comprehensive report enabling safe dead code removal and architectural hardening.
