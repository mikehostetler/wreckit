# Implementation Plan: [DREAMER] Remove empty catch blocks in critique.ts JSON parsing

## Current State
The `parseCritiqueJson` function in `src/workflow/critique.ts` has three empty catch blocks that silently swallow errors.

## Phases

### Phase 1: Logging Integration
1.  Update `parseCritiqueJson` to accept `logger?: Logger`.
2.  Add debug logs to the three catch blocks.
3.  Update the call site in `runPhaseCritique`.