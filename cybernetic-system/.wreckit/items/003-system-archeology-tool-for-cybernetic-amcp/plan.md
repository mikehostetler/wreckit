# System Archeology Tool for Cybernetic AMCP

## Implementation Plan Title
System Archeology Tool for Cybernetic AMCP

## Overview
Build an automated tool to trace and analyze the architecture of the Cybernetic AMCP system through static code analysis.

## Current State
The system has 199 Elixir source files organized around a VSM architecture, but lacks automated architecture analysis.

## Desired End State
A Mix task `mix cyb.archeology` that produces structured data containing entry points, execution traces, shared modules, and orphan functions.

## Phases

### Phase 1: AST Parser and Function Catalog
Build the foundation for static analysis.

### Phase 2: Entry Point Discovery
Implement heuristics to discover all external entry points.

### Phase 3: Execution Trace Generation
Implement depth-first search traversal from each entry point.

### Phase 4: Shared Module Analysis
Compute module overlap across all execution traces.

### Phase 5: Orphan Function Detection
Identify public functions with zero trace references.

### Phase 6: Structured Output Generation
Generate structured data output (Elixir terms and JSON).

## What We're NOT Doing
- Runtime tracing
- Dynamic analysis
- Human-readable reports

## Implementation Approach
Static AST analysis using Elixir's `Code.string_to_quoted/1`.

## Testing Strategy
Unit tests for each module and manual testing of the full pipeline.

## References
- Research: `.wreckit/items/003-system-archeology-tool-for-cybernetic-amcp/research.md`