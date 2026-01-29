# System Overlay Tool for Static-Dynamic Analysis Implementation Plan

## Implementation Plan Title
System Overlay Tool for Static-Dynamic Analysis

## Overview
We will create a static-dynamic overlay analysis tool that correlates two existing datasets: static analysis results from `mix cyb.archeology` and dynamic execution traces from `mix cyb.trace`.

## Current State
The system has archeology results (7,475 lines, 725 orphans) and dynamic traces (224 lines, 8 traces), but lacks a tool to correlate them.

## Desired End State
A Mix task `mix cyb.overlay` that produces `overlay-report.json` with dead code, ghost paths, and coverage metrics.

## What We're NOT Doing
- Not modifying existing data sources
- Not implementing new tracing
- Not analyzing private functions

## Implementation Approach
Create two new modules following existing patterns: `Mix.Tasks.Cyb.Overlay` (CLI) and `Cybernetic.Archeology.Overlay` (Core logic).

## Phases

### Phase 1: Data Ingestion and Normalization
Load and normalize both JSON datasets into a unified format for efficient comparison.

### Phase 2: Diff Analysis
Implement the core analysis algorithms to identify dead code, ghost paths, and calculate coverage metrics.

### Phase 3: Report Generation and CLI Interface
Create the Mix task CLI interface and implement report generation (JSON + console output).

## Testing Strategy
Unit tests for core logic, integration tests for CLI, and manual testing with existing data files.

## References
- Research: `.wreckit/items/006-system-overlay-tool-for-static-dynamic-analysis/research.md`