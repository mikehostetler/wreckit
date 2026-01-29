# Add Troubleshooting Section for Common Migration Issues Implementation Plan

## Implementation Plan Title
Add Troubleshooting Section for Common Migration Issues

## Overview
Expand the existing troubleshooting section in MIGRATION.md with comprehensive documentation for all error scenarios discovered in the codebase.

## Current State
- MIGRATION.md documents 5 issues: Authentication, Rate Limit, Context Window, Network, and SDK Not Available.
- Codebase has additional error categories not yet documented: Fallback, Git Preflight, Doctor Diagnostics, and Phase Failures.

### Key Discoveries
- Fallback is automatic on SDK auth failure.
- Default timeout is 1 hour.
- Doctor defines codes like STATE_FILE_MISMATCH and CIRCULAR_DEPENDENCY.
- Git preflight checks for NOT_GIT_REPO, DETACHED_HEAD, etc.

## Desired End State
MIGRATION.md has a comprehensive troubleshooting section following the symptom → solution format.

## Implementation Approach
Directly edit MIGRATION.md to add new subsections for discovered error categories.

---

## Phases

### Phase 1: Add Troubleshooting Content

#### Overview
Add all new troubleshooting categories to MIGRATION.md.

#### Changes Required:

##### 1. Update MIGRATION.md
**File**: `MIGRATION.md`
**Changes**: Append subsections for Fallback Warning, Config Schema Errors, Git Repository Issues, State/Artifact Mismatches, Phase-Specific Failures, Agent Timeout, PRD Quality, and Remote URL Validation.

#### Success Criteria:

##### Automated Verification:
- [ ] `test -f MIGRATION.md`
- [ ] `bun run build`

##### Manual Verification:
- [ ] Verify all error messages match source code logic.

---

## Testing Strategy
Manual read-through and verification against source code error patterns.

## Migration Notes
Documentation only.

## References
- src/agent/claude-sdk-runner.ts
- src/git/index.ts
- src/doctor.ts