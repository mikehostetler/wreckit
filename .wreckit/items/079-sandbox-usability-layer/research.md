# Research: Sandbox Usability Layer (CLI Flag & Ephemeral Mode)

**Date**: 2025-01-28
**Item**: 079-sandbox-usability-layer

## Research Question

Implement a seamless user experience for sandboxed execution via a `--sandbox` CLI flag. This abstracts away the complexity of configuring the Sprite agent, managing VM lifecycles, and handling synchronization, making safe remote execution accessible with a single command.

## Summary

The Sandbox Usability Layer aims to transform the Sprite integration from a "power user feature" into a safe, default option for running risky tasks in isolated Firecracker microVMs. Currently, users must manually configure `agent.kind: "sprite"`, set `vmName`, and manage bi-directional sync settings in `config.json`, plus manually start/kill VMs which can lead to orphaned resources.

The implementation requires:
1. **CLI Flag Integration**: Add `--sandbox` flag to global options and individual commands
2. **Config Override**: When `--sandbox` is active, override file-based config with Sprite agent settings
3. **Ephemeral VM Management**: Auto-generate VM names, ensure VM lifecycle cleanup (start → use → kill)
4. **Bi-directional Sync**: Enable syncOnSuccess by default in ephemeral mode
5. **Interrupt Safety**: Handle Ctrl+C gracefully to guarantee VM cleanup

The codebase already has a robust Sprite foundation (`src/agent/sprite-runner.ts`, `src/agent/sprite-core.ts`) and CLI infrastructure (`src/index.ts` with commander). The config system supports overrides via `ConfigOverrides` interface and `applyOverrides()` function. The key integration points are the agent runner dispatch system and the command-level option handling.

## Current State Analysis

### Existing Implementation

**Sprite Agent Infrastructure** (Already implemented):
- `src/agent/sprite-runner.ts:87-266` - `runSpriteAgent()` function with VM initialization, sync, and execution
- `src/agent/sprite-core.ts:208-242` - `startSprite()` for VM creation
- `src/agent/sprite-core.ts:287-310` - `killSprite()` for VM termination
- `src/fs/sync.ts:244-300` - `syncProjectToVM()` for push sync
- `src/fs/sync.ts:440-482` - `syncProjectFromVM()` for pull sync
- `src/commands/sprite.ts` - Manual Sprite management commands (start, list, kill, attach, exec, pull)

**Config System** (Supports overrides):
- `src/config.ts:41-50` - `ConfigOverrides` interface (has `agentKind` but no sandbox-specific fields)
- `src/config.ts:162-221` - `applyOverrides()` function to merge CLI flags with file config
- `src/schemas.ts:74-117` - `SpriteAgentSchema` with all Sprite configuration options
- `src/schemas.ts:119-127` - `AgentConfigUnion` discriminated union with sprite kind

**Agent Runner Dispatch** (Type-safe multi-agent support):
- `src/agent/runner.ts:130-311` - `runAgentUnion()` dispatch function
- `src/agent/runner.ts:293-306` - Sprite case that imports and calls `runSpriteAgent()`

**CLI Infrastructure** (Commander-based):
- `src/index.ts:36-64` - Global options definition with `--agent` flag pattern
- `src/index.ts:630-658` - `run` command example of option passing
- `src/cli-utils.ts:44-55` - `setupInterruptHandler()` for Ctrl+C handling

### Key Patterns

1. **Agent Kind Override Pattern** (line `src/index.ts:60-63`):
   ```typescript
   .option("--agent <kind>", "Agent kind to use (claude_sdk, amp_sdk, codex_sdk, opencode_sdk, rlm)")
   .option("--rlm", "Shorthand for --agent rlm");
   ```
   Then in action handler: `const agentKind = opts.rlm ? "rlm" : opts.agent;`

2. **Config Override Pattern** (`src/config.ts:162-221`):
   - `loadConfig(root, overrides?)` accepts `ConfigOverrides`
   - `applyOverrides()` merges overrides with resolved config
   - Agent kind override validation against allowed kinds

3. **VM Lifecycle in Sprite Runner** (`src/agent/sprite-runner.ts:109-122`):
   - Auto-generates VM name: `const vmName = config.vmName || \`wreckit-agent-${Date.now()}\`;`
   - Calls `ensureSpriteRunning()` to start if needed
   - **CRITICAL GAP**: No automatic cleanup - VMs persist after agent completes

4. **Interrupt Handler** (`src/cli-utils.ts:44-55`):
   - Single SIGINT handler with double-tap to force exit
   - **GAP**: No cleanup hooks for VM termination on interrupt

## Key Files

### Core Implementation Files

- **`src/agent/sprite-runner.ts:87-266`**
  - Main Sprite agent execution function
  - Lines 109-122: VM initialization with auto-generated name
  - Lines 124-147: Project sync to VM (push)
  - Lines 223-244: Project sync from VM (pull) - conditional on `config.syncOnSuccess`
  - **Gap**: No VM cleanup in finally block or on completion

- **`src/agent/sprite-core.ts:208-242, 287-310`**
  - `startSprite()` - Creates new Firecracker VM
  - `killSprite()` - Terminates VM
  - Both return `WispResult` with success/error status

- **`src/config.ts:41-50, 162-221`**
  - `ConfigOverrides` interface - needs `sandbox?: boolean` field
  - `applyOverrides()` - needs sandbox→sprite config transformation logic
  - `loadConfig()` - entry point for override application

- **`src/index.ts:36-64, 630-658`**
  - Global options section - add `--sandbox` flag
  - Command action handlers - pass sandbox flag through to workflow
  - Pattern to follow: `--agent` and `--rlm` flags

- **`src/commands/run.ts:29-41, 66-205`**
  - `RunOptions` interface - needs `sandbox?: boolean` field
  - `runCommand()` - needs to pass sandbox to config loading
  - Phase execution loop - VM cleanup should happen after completion

- **`src/workflow/itemWorkflow.ts`**
  - Phase functions receive `WorkflowOptions` which includes config
  - Config is loaded at command level, passed through to phases
  - Agent execution via `runAgentUnion()` at line 308 (research phase example)

### Supporting Files

- **`src/schemas.ts:74-117`** - `SpriteAgentSchema` defines all Sprite config fields
- **`src/fs/sync.ts`** - Bi-directional sync functions (already integrated in sprite-runner)
- **`src/cli-utils.ts:44-55`** - Interrupt handler (needs enhancement for VM cleanup)

## Technical Considerations

### Dependencies

**External Dependencies** (already present):
- `@ax-llm/ax` - AxAgent for Sprite tool execution (in sprite-runner.ts)
- `commander` - CLI flag parsing (in index.ts)

**Internal Modules to Integrate**:
- `src/config.ts` - Config override system
- `src/agent/sprite-runner.ts` - VM lifecycle management
- `src/agent/sprite-core.ts` - Low-level Sprite CLI wrapper
- `src/commands/run.ts` - Primary entry point for sandbox mode
- `src/cli-utils.ts` - Interrupt handler enhancement

### Patterns to Follow

1. **Override Pattern** (`src/config.ts:162-221`):
   - Extend `ConfigOverrides` interface with `sandbox?: boolean`
   - In `applyOverrides()`, detect `sandbox: true` and force agent config to Sprite with sensible defaults
   - Preserve other config fields (base_branch, etc.)

2. **Ephemeral VM Naming** (`src/agent/sprite-runner.ts:110`):
   - Auto-generate: `wreckit-sandbox-${Date.now()}` or `wreckit-sandbox-${itemId}-${timestamp}`
   - Include item ID for better debugging when multiple items run

3. **Cleanup Guarantee Pattern** (needs implementation):
   ```typescript
   let vmName: string | null = null;
   try {
     vmName = autoGenerateName();
     await startSprite(vmName, config, logger);
     // ... agent execution ...
   } finally {
     if (vmName) {
       await killSprite(vmName, config, logger);
     }
   }
   ```

4. **Interrupt Handler Registration** (enhance `src/cli-utils.ts:44-55`):
   - Accept cleanup callback: `setupInterruptHandler(logger, cleanupFn)`
   - Register at startup of sandbox session
   - Execute cleanup on SIGINT before exit

5. **CLI Flag Propagation** (`src/index.ts:60-63` pattern):
   - Add `--sandbox` to global options
   - Add to individual commands (research, plan, implement, run)
   - Pass through to `runCommand()` / phase commands

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **VM orphaning on crash** | High - leaked resources, cost accumulation | Use try/finally block in sprite-runner, register interrupt handler, add cleanup on process exit events |
| **Interrupt during sync** | Medium - partial sync, data loss | Wrap sync calls in try/catch, log warnings, don't fail entire operation on sync errors |
| **Sprite CLI not installed** | Low - graceful degradation | Check in dry-run mode, provide clear error message with installation instructions |
| **Concurrent sandbox runs** | Low - VM name collision | Include item ID and timestamp in VM name, or use UUID |
| **Config override complexity** | Medium - user confusion | Document clearly that --sandbox overrides agent.kind, warn if config already has sprite agent |
| **syncOnSuccess default** | Low - unexpected file overwrites | Make it opt-in via config, but default to true for --sandbox (ephemeral mode) |
| **Permission issues on VM kill** | Medium - orphaned VMs if kill fails | Log errors prominently, provide manual cleanup command (wreckit sprite kill <name>) |

## Recommended Approach

### High-Level Strategy

1. **Phase 1: Config Override Layer** (Foundation)
   - Extend `ConfigOverrides` interface with `sandbox?: boolean`
   - Implement `applySandboxMode()` helper that transforms config to Sprite agent with:
     - `kind: "sprite"`
     - `vmName: undefined` (auto-generate)
     - `syncEnabled: true`
     - `syncOnSuccess: true` (pull changes back after success)
     - Sensible defaults for memory, CPUs, timeout
   - Integrate into `applyOverrides()` or call explicitly after `loadConfig()`

2. **Phase 2: CLI Flag Integration** (User Interface)
   - Add `--sandbox` global option to `src/index.ts:44-63`
   - Add `--sandbox` to `run` command and phase commands (research, plan, implement)
   - Pass `sandbox` flag through command handlers to config loading
   - Follow existing pattern of `--agent` flag

3. **Phase 3: Ephemeral VM Lifecycle** (Core Functionality)
   - Refactor `runSpriteAgent()` in `src/agent/sprite-runner.ts`:
     - Add `ephemeral?: boolean` parameter
     - Wrap VM initialization in try/finally
     - In finally block: if ephemeral and vmName exists, call `killSprite()`
     - Log cleanup actions prominently
   - Update agent config to pass `ephemeral: true` when in sandbox mode

4. **Phase 4: Interrupt Safety** (Reliability)
   - Enhance `setupInterruptHandler()` in `src/cli-utils.ts`:
     - Accept optional `cleanup: () => Promise<void>` callback
     - Execute cleanup before exit on SIGINT
     - Set timeout for cleanup (e.g., 10 seconds) before force exit
   - Register cleanup function that kills the ephemeral VM
   - Store VM name in accessible context for cleanup callback

5. **Phase 5: Testing & Documentation** (Validation)
   - Test scenarios:
     - Normal execution (start → run → kill)
     - Interrupt during agent execution (Ctrl+C)
     - Interrupt during sync
     - Crash/exception during execution
     - Concurrent sandbox runs
   - Document usage: `wreckit run <id> --sandbox`
   - Document behavior: VM auto-naming, bi-directional sync, cleanup guarantee

### Implementation Order

**Step 1: Config Infrastructure** (Low risk, foundational)
- Modify `src/config.ts` to support sandbox overrides
- Add tests for config transformation

**Step 2: CLI Flags** (Medium risk, user-visible)
- Add `--sandbox` flag to `src/index.ts`
- Update command handlers to pass flag through
- Test with dry-run mode

**Step 3: Ephemeral Mode** (High risk, core logic)
- Modify `runSpriteAgent()` to support ephemeral parameter
- Add try/finally cleanup
- Test VM lifecycle thoroughly

**Step 4: Interrupt Handling** (High risk, reliability-critical)
- Enhance interrupt handler with cleanup callback
- Test interrupt scenarios
- Verify no orphaned VMs

**Step 5: Integration Testing** (Validation)
- End-to-end tests with real Sprite CLI (if available)
- Mock tests for CI environments
- Documentation updates

## Open Questions

1. **VM Naming Strategy**:
   - Should VM names include item ID for debugging? (`wreckit-sandbox-${itemId}-${timestamp}`)
   - Or simple timestamps? (`wreckit-sandbox-${Date.now()}`)
   - **Recommendation**: Include item ID for better observability

2. **Cleanup Timeout**:
   - How long should we wait for VM kill before force exiting? (5 seconds? 10 seconds?)
   - **Recommendation**: 10 seconds with warning log

3. **Sync on Failure**:
   - Should we pull changes back even if agent fails? (Useful for debugging)
   - **Recommendation**: No - only sync on success as current design, but add `--sandbox-sync-on-failure` flag for advanced users

4. **Concurrent Sandbox Sessions**:
   - Should we support multiple concurrent sandbox VMs?
   - **Recommendation**: Yes, auto-generated names will prevent collisions

5. **Sprite CLI Validation**:
   - Should we check for Sprite CLI availability at startup or on first use?
   - **Recommendation**: Check on first use (lazy), provide clear error message

6. **Persistent vs Ephemeral**:
   - Should `--sandbox` imply ephemeral-only, or allow persistent VMs with `--sandbox --keep-vm`?
   - **Recommendation**: Ephemeral-only for v1, add `--keep-vm` flag later if needed

7. **Config File Interaction**:
   - If config.json already has `agent.kind: "sprite"`, should `--sandbox` warn or override?
   - **Recommendation**: Log info message "Sandbox mode: Using Sprite agent with ephemeral VM" and proceed with override

8. **Error Handling**:
   - If VM start fails, should we fallback to regular agent or fail fast?
   - **Recommendation**: Fail fast with clear error - sandbox mode is explicit opt-in for safety

## File References Summary

**Configuration System**:
- `src/config.ts:41-50` - ConfigOverrides interface (needs sandbox field)
- `src/config.ts:162-221` - applyOverrides() function (needs sandbox logic)
- `src/schemas.ts:74-117` - SpriteAgentSchema (already complete)

**Agent Execution**:
- `src/agent/sprite-runner.ts:87-266` - runSpriteAgent() (needs ephemeral cleanup)
- `src/agent/sprite-core.ts:208-242` - startSprite() (used for VM creation)
- `src/agent/sprite-core.ts:287-310` - killSprite() (used for VM cleanup)
- `src/agent/runner.ts:293-306` - Sprite case in runAgentUnion() (integration point)

**CLI Layer**:
- `src/index.ts:36-64` - Global options (add --sandbox flag)
- `src/index.ts:630-658` - run command (pass sandbox through)
- `src/commands/run.ts:29-41` - RunOptions interface (needs sandbox field)
- `src/commands/run.ts:66-205` - runCommand() function (apply config override)

**Sync & Lifecycle**:
- `src/fs/sync.ts:244-300` - syncProjectToVM() (already integrated)
- `src/fs/sync.ts:440-482` - syncProjectFromVM() (already integrated)
- `src/cli-utils.ts:44-55` - setupInterruptHandler() (needs cleanup callback)

**Workflow Integration**:
- `src/workflow/itemWorkflow.ts` - Phase functions (receive config with overrides applied)
