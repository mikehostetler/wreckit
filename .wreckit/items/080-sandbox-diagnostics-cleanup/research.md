# Research: Implement Sandbox Diagnostics & Cleanup (Doctor Integration)

**Date**: 2025-01-28
**Item**: 080-sandbox-diagnostics-cleanup

## Research Question
Integrate Sprite/Sandbox health checks into `wreckit doctor` and add automated cleanup for orphaned VMs. This ensures the sandbox environment is healthy and prevents resource leaks from crashed sessions.

## Summary

The implementation requires adding three new diagnostic checks to the existing doctor system:

1. **Sprite CLI availability check** - Verify that the Sprite CLI (`wispPath` from config) is installed and executable
2. **Sprite authentication check** - Verify that a valid `SPRITES_TOKEN` is available (from config, environment, or ~/.claude/settings.json)
3. **Orphaned VM detection and cleanup** - Identify and optionally clean up `wreckit-sandbox-*` VMs that are no longer associated with active sessions

The current doctor architecture in `src/doctor.ts` already provides a robust framework for diagnostics with fixable issues. The new sandbox checks will follow the existing pattern: diagnostic functions return `Diagnostic[]` objects, and the `applyFixes()` function handles cleanup operations with backup support.

For orphaned VM cleanup, we need to query the Sprite CLI for all running VMs, filter for those matching the `wreckit-sandbox-*` pattern, and verify they're orphaned (no corresponding `currentEphemeralVM` tracking in memory). The cleanup will use the existing `killSprite()` function from `src/agent/sprite-runner.ts`.

Key insight from `src/agent/sprite-runner.ts:64-71`: Ephemeral VMs are tracked in-memory via `currentEphemeralVM`, which only persists during a single Wreckit process. After a crash (power loss, OOM), this tracking is lost but the VM continues running, consuming resources and billing. The doctor check will identify these orphaned VMs by querying the Sprite CLI directly.

## Current State Analysis

### Existing Implementation

**Doctor Architecture** (`src/doctor.ts`):
- Line 610-653: `diagnose()` function orchestrates all diagnostic checks
- Line 655-843: `applyFixes()` function handles automatic fixes with backup support
- Line 175-183: Diagnostic interface with severity levels (error, warning, info) and fixable flag
- Line 845-862: `runDoctor()` function is the main entry point
- Pattern: Each diagnostic concern has a dedicated `diagnose*()` function (e.g., `diagnoseConfig()`, `diagnoseIndex()`, `diagnoseBatchProgress()`)
- Pattern: Fixable diagnostics have corresponding case handlers in `applyFixes()` with switch statements

**Doctor CLI Integration** (`src/commands/doctor.ts`):
- Line 32-110: `doctorCommand()` function handles CLI presentation
- Line 14-24: `DoctorOptions` interface with `fix` and `cwd` options
- Line 15-24: Severity ordering and diagnostic formatting helpers
- Line 38: Calls `runDoctor()` from doctor module
- Line 42-97: Groups diagnostics by severity and displays with appropriate symbols (✗, ⚠, ℹ)
- Line 73-97: Shows fix results when `--fix` is used, including backup session info

**Sprite/Sandbox System** (`src/agent/sprite-runner.ts`):
- Line 64-71: `currentEphemeralVM` tracks the currently running ephemeral VM (in-memory only, lost on crash)
- Line 76-101: `ensureSpriteRunning()` checks if a VM is running before starting it
- Line 276-292: `listSprites()` function queries Sprite CLI for all VMs
- Line 294-317: `killSprite()` function terminates a VM by name
- Line 142-147: VM naming convention: `wreckit-sandbox-${itemId}-${timestamp}` for ephemeral VMs
- Line 340-360: Cleanup logic in `runSpriteAgent()` finally block kills ephemeral VMs after execution

**Sprite Configuration** (`src/schemas.ts`):
- Line 74-107: `SpriteAgentSchema` defines configuration structure
- Line 76-79: `wispPath` field defaults to "sprite", can be overridden in config
- Line 80-85: `token` field for Sprites.dev authentication (optional, uses SPRITES_TOKEN env var)
- Line 373: `SpriteAgentConfig` type exported

**Environment Handling** (`src/agent/env.ts`):
- Line 185-214: `buildSpriteEnv()` function constructs environment for Sprite CLI
- Line 200-206: Token resolution logic: config token → process.env.SPRITES_TOKEN → ~/.claude/settings.json
- Line 23: "SPRITES_" prefix is in ALLOWED_PREFIXES for environment variable passthrough

**Error Handling** (`src/errors.ts`):
- Line 416-424: `WispNotFoundError` thrown when Sprite CLI not found
- Line 429-440: `SpriteStartError` thrown when VM start fails
- Line 461-472: `SpriteKillError` thrown when VM termination fails

**Test Coverage** (`src/__tests__/doctor.test.ts`):
- Comprehensive test suite for all existing diagnostics
- Line 450-678: Tests for `applyFixes()` with backup integration
- Line 803-1082: Tests for backup session creation and cleanup
- Pattern: Tests use temporary directories with `fs.mkdtemp()` and `createMockLogger()`

### Key Files

- `src/doctor.ts:610-862` - Core doctor diagnostics engine with diagnostic collection and fix application
- `src/commands/doctor.ts:32-110` - CLI command handler for `wreckit doctor`
- `src/agent/sprite-runner.ts:276-317` - `listSprites()` and `killSprite()` functions for VM management
- `src/agent/sprite-runner.ts:64-71` - In-memory ephemeral VM tracking (lost on crash)
- `src/agent/sprite-runner.ts:142-147` - Ephemeral VM naming convention
- `src/schemas.ts:74-107` - SpriteAgentSchema configuration structure
- `src/agent/env.ts:185-214` - `buildSpriteEnv()` for token resolution
- `src/config.ts:274-317` - `loadConfig()` function for reading config.json
- `src/errors.ts:416-505` - Sprite-related error classes

## Technical Considerations

### Dependencies

**External Dependencies:**
- Sprite CLI (sprites.dev) - must be installed and available at `wispPath`
- `SPRITES_TOKEN` environment variable or config token - for authentication

**Internal Modules to Integrate:**
- `src/doctor.ts` - Add new diagnostic functions: `diagnoseSpriteCLI()`, `diagnoseSpriteAuth()`, `diagnoseOrphanedVMs()`
- `src/agent/sprite-runner.ts` - Use `listSprites()`, `killSprite()`, `parseWispJson()`
- `src/agent/env.ts` - Use `buildSpriteEnv()` to check token availability
- `src/config.ts` - Use `loadConfig()` to read Sprite configuration
- `src/errors.ts` - Catch `WispNotFoundError` and other Sprite errors

### Patterns to Follow

**Diagnostic Function Pattern** (from `src/doctor.ts`):
```typescript
async function diagnoseSomething(root: string): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  // Check conditions
  if (problem) {
    diagnostics.push({
      itemId: null,
      severity: "error" | "warning" | "info",
      code: "UNIQUE_CODE",
      message: "Human-readable description",
      fixable: boolean,
    });
  }
  return diagnostics;
}
```

**Fix Application Pattern** (from `src/doctor.ts:655-843`):
```typescript
case "UNIQUE_CODE": {
  try {
    // Perform fix
    fixed = true;
    message = "Success message";
  } catch (err) {
    message = `Failed: ${err}`;
  }
  break;
}
```

**VM Naming Convention** (from `src/agent/sprite-runner.ts:142-147`):
- Ephemeral VMs: `wreckit-sandbox-${itemId}-${timestamp}`
- Pattern: Use regex `/^wreckit-sandbox-\d{3}-/` to identify Wreckit-managed VMs

**Token Resolution Priority** (from `src/agent/env.ts:185-214`):
1. Config token (`agent.token` in config.json)
2. Environment variable (`SPRITES_TOKEN`)
3. User settings (`~/.claude/settings.json`)

**Error Handling Pattern**:
- Catch `WispNotFoundError` when checking CLI availability
- Use try-catch around Sprite CLI commands
- Return non-fixable diagnostics for authentication failures (user must configure manually)

### Integration Points

1. **diagnose() function** (`src/doctor.ts:610`): Add calls to new diagnostic functions
2. **applyFixes() function** (`src/doctor.ts:655`): Add case handlers for new diagnostic codes
3. **doctorCommand()** (`src/commands/doctor.ts:32`): No changes needed (uses generic formatting)
4. **runDoctor() function** (`src/doctor.ts:845`): No changes needed (orchestrator)

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Killing active VMs** - Cleanup might terminate VMs that are actually in use by another Wreckit process | High | Only clean up VMs with `wreckit-sandbox-*` prefix AND check if no process is using them (verify PID doesn't exist or process doesn't own the VM). Add a safety warning in diagnostic message. |
| **False positives for orphaned VMs** - Race condition where a VM appears orphaned but is actually starting up | Medium | Add age threshold (e.g., VMs older than 1 hour) to avoid killing recently started VMs. Display creation time in diagnostic message. |
| **Sprite CLI not installed** - User runs doctor without Sprite, gets confusing errors | Low | Make Sprite diagnostics conditional: only run if `agent.kind === "sprite"` in config, or run as info-level checks (not errors) when Sprite is not configured. |
| **Network dependency** - Querying Sprite CLI requires network/cloud API connection | Low | Add timeout to `listSprites()` call (already has 300s timeout in `sprite-core.ts:36`). Catch network errors and return warning diagnostic instead of error. |
| **Token validation** - Checking if token is valid requires making an API call | Low | For MVP, only check token presence (not validity). Token validation can be added later by testing `listSprites()` call success. |
| **Platform differences** - Sprite CLI may behave differently on macOS/Linux/Windows | Low | Sprite CLI is currently Linux-only (microVMs). Add platform check and skip VM diagnostics on unsupported platforms with info message. |

## Recommended Approach

### Phase 1: Core Diagnostics (Non-Invasive)

1. **Add `diagnoseSpriteCLI()` function**:
   - Check if `wispPath` from config exists and is executable
   - Use `fs.access()` with `X_OK` flag
   - Return `SPRITE_CLI_MISSING` error if not found (non-fixable, user must install)
   - Return `SPRITE_CLI_NOT_EXECUTABLE` error if exists but not executable (non-fixable)

2. **Add `diagnoseSpriteAuth()` function**:
   - Use `buildSpriteEnv()` from `src/agent/env.ts` to resolve token
   - Check if `SPRITES_TOKEN` is present in resolved environment
   - Return `SPRITE_TOKEN_MISSING` warning if not found (non-fixable, user must configure)
   - For MVP, only check presence (not validity - API call required)

3. **Integrate into `diagnose()` function**:
   - Add calls to new functions after existing diagnostics
   - Only run if `agent.kind === "sprite"` in config
   - Return info diagnostic "Sprite not configured" if not using Sprite agent

### Phase 2: Orphaned VM Detection

4. **Add `diagnoseOrphanedVMs()` function**:
   - Call `listSprites()` to get all running VMs
   - Parse JSON output with `parseWispJson()`
   - Filter for VMs matching pattern `/^wreckit-sandbox-/`
   - Check VM creation time (add age threshold: >1 hour old)
   - Return `ORPHANED_VM_DETECTED` warning for each orphan (fixable)

5. **Add fix handler in `applyFixes()`**:
   - Case `ORPHANED_VM_DETECTED`:
     - Call `killSprite()` with VM name
     - Set `fixed = true` on success
     - Include VM name in result message
   - No backup needed (VMs are ephemeral by design)

### Phase 3: Testing and Refinement

6. **Add test coverage** in `src/__tests__/doctor.test.ts`:
   - Mock `listSprites()` to return test data
   - Mock `killSprite()` to verify cleanup calls
   - Test age threshold logic
   - Test VM name pattern matching
   - Test error handling (CLI not found, network errors)

7. **Add integration tests** (optional):
   - Spin up actual ephemeral VM in test environment
   - Verify detection and cleanup
   - Requires Sprite CLI installed in CI environment

### Implementation Notes

**VM Orphan Detection Algorithm:**
```typescript
const AGE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour
const now = Date.now();

for (const vm of sprites) {
  if (!vm.name.startsWith("wreckit-sandbox-")) continue;

  const vmAge = now - new Date(vm.created_at).getTime();
  if (vmAge < AGE_THRESHOLD_MS) continue; // Too recent, might be starting

  // Check if any wreckit process is running
  // (Optional: Check /proc for parent process, or just rely on age threshold)

  diagnostics.push({
    itemId: null,
    severity: "warning",
    code: "ORPHANED_VM_DETECTED",
    message: `Orphaned VM '${vm.name}' (${Math.floor(vmAge / 60000)} minutes old)`,
    fixable: true,
  });
}
```

**Diagnostic Codes to Add:**
- `SPRITE_CLI_MISSING` - Sprite CLI not installed
- `SPRITE_CLI_NOT_EXECUTABLE` - Sprite CLI exists but not executable
- `SPRITE_TOKEN_MISSING` - No SPRITES_TOKEN configured
- `ORPHANED_VM_DETECTED` - Ephemeral VM left running after crash

**Severity Levels:**
- Errors: CLI missing/not executable (blocking)
- Warnings: Token missing, orphaned VMs (non-blocking but actionable)
- Info: Sprite not configured (informative)

## Open Questions

1. **Should we validate token validity or just presence?**
   - MVP: Check presence only (simpler, no API call)
   - Future: Add optional validation by testing `listSprites()` call

2. **Should orphaned VM cleanup be enabled by default with `--fix`?**
   - Recommendation: Yes, but add age threshold (>1 hour) to avoid race conditions
   - Alternative: Require explicit `--fix-orphaned-vms` flag

3. **How to handle VMs that might be in use by another process?**
   - Simple approach: Use age threshold only (assumes VMs orphaned after >1 hour are safe to kill)
   - Complex approach: Check process table to see if another `wreckit` process is running (more reliable but platform-specific)

4. **Should we display VM details (creation time, resources) in diagnostic message?**
   - Recommendation: Yes, show age in human-readable format (e.g., "2 hours old")
   - Helps user understand the scope of the resource leak

5. **Platform support?**
   - Sprite CLI currently targets Linux microVMs
   - Should we skip VM diagnostics on macOS/Windows with an info message?
   - Or assume users on non-Linux don't have Sprite installed anyway?

6. **Backup strategy for VM cleanup?**
   - VMs are ephemeral by design, no backup needed
   - But should we log the VM name/state before killing for audit trail?
