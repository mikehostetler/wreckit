# Implement Sandbox Diagnostics & Cleanup (Doctor Integration) Implementation Plan

## Overview
Add Sprite/Sandbox health checks to `wreckit doctor` and implement automated cleanup for orphaned VMs.

## Current State Analysis
*   **Doctor:** Existing architecture supports custom diagnostics and fixes.
*   **Sprite:** VM tracking is ephemeral; no persistent tracking of orphans.
*   **Missing:** Diagnostics for CLI presence, Auth, and Orphaned VMs.

## Phases

### Phase 1: Core Diagnostics (CLI & Auth Checks)
*   Add `diagnoseSpriteCLI` to check `wispPath`.
*   Add `diagnoseSpriteAuth` to check token presence.
*   Integrate into `diagnose()`.

### Phase 2: Orphaned VM Detection
*   Add `diagnoseOrphanedVMs`.
*   List VMs, filter by name pattern and age (> 1 hour).
*   Report warnings.

### Phase 3: Automated VM Cleanup
*   Add case handler for `ORPHANED_VM_DETECTED` in `applyFixes`.
*   Call `killSprite` to cleanup.

### Phase 4: Test Coverage
*   Add unit tests in `src/__tests__/doctor.test.ts`.