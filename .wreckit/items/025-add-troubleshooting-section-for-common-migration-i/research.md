# Research: Add troubleshooting section for common migration issues

**Date**: 2026-01-24
**Item**: 025-add-troubleshooting-section-for-common-migration-i

## Research Question
From milestone [M1] Complete Missing Documentation

**Motivation:** Strategic milestone: Complete Missing Documentation

## Summary
The MIGRATION.md file already contains a troubleshooting section (lines 371-455) that covers five common migration issues: Authentication Errors, Rate Limits, Context Window Errors, Network Errors, and SDK Not Available. This item will expand the existing troubleshooting section with additional issues discovered from error handling code, workflow failures, and test cases that reveal edge cases.

## Key Files
- `src/agent/claude-sdk-runner.ts` - categorized error handling
- `src/agent/runner.ts` - fallback behavior
- `src/errors.ts` - custom error types
- `src/doctor.ts` - diagnostic codes
- `src/workflow/itemWorkflow.ts` - phase-specific error handling
- `MIGRATION.md` - existing troubleshooting content

## Current State Analysis
### Existing Troubleshooting Content
MIGRATION.md lines 371-455 documents five issues: Authentication, Rate Limit, Context Window, Network, and SDK Not Available.

### Error Categories to Add
1. **Config Migration Issues**: Schema validation failures, kind vs mode confusion.
2. **Fallback to Process Mode**: Documenting the automatic fallback warning.
3. **Git/Branch Issues**: Dirty state, wrong branch checked out.
4. **State/Artifact Mismatches**: Doctor diagnostic codes.
5. **Phase-Specific Failures**: Research/Plan/Implement/PR phase common errors.
6. **Timeout Issues**: Default 1 hour timeout.

## Technical Considerations
- Symptom → Solutions format matching existing docs.
- Use code blocks for exact error messages.
- Suggest `wreckit sdk-info` or `wreckit doctor` for diagnostics.
- Cross-reference existing MIGRATION.md sections.

## Recommended Approach
Expand the Troubleshooting section in MIGRATION.md with new subsections for Fallback Behavior, Config Migration, State Issues, Git Issues, and Phase Failures. Reference diagnostic commands throughout.