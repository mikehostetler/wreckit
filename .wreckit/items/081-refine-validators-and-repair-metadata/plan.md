# Refine Validators & Implement Metadata Auto-Repair Implementation Plan

## Overview
Update story ID validation and implement automated repair for PRD schema violations.

## Current State
*   **Validator:** `STORY_ID_PATTERN` regex is too strict (`US-\d+`), rejecting valid scoped IDs.
*   **Doctor:** Reports `INVALID_PRD` and `POOR_STORY_QUALITY` but offers no fixes.
*   **Data:** Production PRDs use scoped IDs (`US-073-001`) and legacy ones use simple IDs (`US-001`).

## Phases

### Phase 1: Update Story ID Validation Pattern
*   Update `STORY_ID_PATTERN` regex in `src/domain/validation.ts`.
*   Update error message.
*   Add unit tests.

### Phase 2: Add Fixable PRD Diagnostics
*   Add `diagnoseItem` checks for missing `id` and `branch_name`.
*   Add check for invalid priorities.
*   Push fixable diagnostics.

### Phase 3: Implement PRD Auto-Repair
*   Add `applyFixes` handlers for new diagnostic codes.
*   Implement backup logic.
*   Implement inference logic (id from directory, branch from id).
*   Implement priority clamping.

### Phase 4: Add Test Coverage
*   Add unit tests for validation regex.
*   Add integration tests for auto-repair.