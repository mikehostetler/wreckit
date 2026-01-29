# Integrate Wisp/Sprites Go Stack Implementation Plan

## Overview

This implementation integrates Wreckit with the Wisp/Sprites Go stack to enable "Sandbox Mode" where agents run in isolated Firecracker microVMs. The integration provides CLI commands for manual Sprite management and RLM tools for automated agent-controlled Sprite lifecycle operations.

**Key Constraint**: Wreckit must shell out to the `wisp` binary using `child_process.spawn` (not rewriting Go logic, not using `execa` which is not in dependencies).

## Current State Analysis

### What Exists Now

1. **Agent Runner Architecture** (`src/agent/runner.ts:172-276`):
   - Discriminated union-based dispatch system with 6 agent kinds
   - Each agent kind has dedicated runner module (e.g., `process-runner.ts`, `claude-sdk-runner.ts`)
   - Clean separation: runner exports function returning `Promise<AgentResult>`

2. **Configuration System** (`src/schemas.ts:37-79`, `src/config.ts:48-71`):
   - Agent configs use Zod discriminated unions
   - Default config in `DEFAULT_CONFIG` constant
   - Migration logic from legacy mode-based to new kind-based format
   - Override system for CLI flags

3. **Command Pattern** (`src/commands/init.ts`, `src/index.ts:115-756`):
   - Commands export `Options` interface and command function
   - Use `findRootFromOptions` for cwd resolution
   - Support `--json` output flag where applicable
   - Return `Promise<void>`

4. **RLM Tools** (`src/agent/rlm-tools.ts:46-229`):
   - Tools use `AxFunction` interface with JSON Schema parameters
   - Registered in `buildToolRegistry` function
   - Can be restricted via `allowedTools` array

5. **Subprocess Handling** (`src/agent/process-runner.ts:68-182`):
   - Uses `spawn` from `node:child_process` (line 1)
   - Timeout enforcement with SIGTERM→SIGKILL escalation (lines 103-122)
   - Stdout/stderr capture with streaming callbacks (lines 124-148)
   - Lifecycle registration for cleanup (lines 90, 151, 164)

### What's Missing

1. **Sprite Agent Schema**: No `SpriteAgentSchema` in discriminated union
2. **Sprite Runner**: No implementation for shelling out to Wisp CLI
3. **Sprite Commands**: No CLI commands for Sprite management
4. **Sprite RLM Tools**: No tools for agent-controlled Sprite operations
5. **Sprite Configuration**: No defaults for Wisp binary path, VM resources, etc.
6. **Sprite-Specific Errors**: No error types for Wisp failures
7. **Sprite Tests**: No integration tests for Sprite functionality

### Key Constraints Discovered

1. **Agent Kind Validation**: When adding `sprite` agent kind, must update `validKinds` array in `src/config.ts:154`
2. **Runner Location**: Based on codebase, runners live in `src/agent/` directory (not `src/runners/`)
3. **Timeout Logic**: Must reuse SIGTERM→SIGKILL escalation pattern from `process-runner.ts:103-122`
4. **Testing Mocks**: Use Bun's `spyOn` for mocking child_process, not `mock.module`
5. **No execa**: Package.json does not include execa, must use `child_process.spawn`

## Desired End State

### Functional Requirements

1. **CLI Commands Available**:
   ```bash
   wreckit sprite start <name>      # Start new Sprite VM
   wreckit sprite attach <name>     # Attach to running VM
   wreckit sprite list              # List active Sprites
   wreckit sprite kill <name>       # Terminate Sprite
   ```

2. **RLM Tools Available** (to agents in RLM mode):
   - `spawn_sprite`: Start new VM, returns connection info
   - `attach_sprite`: Attach to existing VM
   - `list_sprites`: List active VMs
   - `kill_sprite`: Terminate VM

3. **Agent Kind Support**:
   - Can configure `agent.kind: "sprite"` in `.wreckit/config.json`
   - Respects sprite-specific options (wispPath, maxVMs, defaultMemory, defaultCPUs, timeout)

4. **Error Handling**:
   - Clear error messages when Wisp binary not found
   - Actionable errors for common failure scenarios
   - Proper exit codes for CLI commands

### Verification Criteria

- [ ] Commands execute and exit with proper codes (0 success, 1 failure)
- [ ] JSON output mode returns valid JSON for all subcommands
- [ ] RLM tools callable from agents and return structured results
- [ ] Error messages reference Wisp installation instructions
- [ ] Tests mock Wisp CLI (no actual Wisp required for test suite)
- [ ] Configuration supports all documented sprite settings
- [ ] Agent dispatch recognizes `"sprite"` agent kind

## Phases

### Phase 1: Schema & Configuration

**Overview**: Add the `SpriteAgentConfig` schema to the type system and configuration defaults. This phase establishes the data model that all other phases depend on.

#### Changes Required

1. **Add Sprite Agent Schema** in `src/schemas.ts`:
   - Define `SpriteAgentSchema` with required fields
   - Add to `AgentConfigUnionSchema` discriminated union
   - Export `SpriteAgentConfig` type

2. **Add Configuration Defaults** in `src/config.ts`:
   - No changes to `DEFAULT_CONFIG` (schema defaults used)
   - Add "sprite" to `validKinds` array in `applyOverrides`

#### Success Criteria
- Type checking passes
- Schema validation tests pass
- Can create `SpriteAgentConfig` objects without errors

---

### Phase 2: Sprite Runner (Wisp CLI Wrapper)

**Overview**: Implement the core `SpriteRunner` class that wraps the `wisp` CLI binary. This runner handles subprocess spawning, timeout enforcement, output parsing, and signal handling.

#### Changes Required

1. **Create Sprite Runner Module** in `src/agent/sprite-runner.ts`:
   - Implement `runWispCommand` using `child_process.spawn`
   - Implement `start`, `attach`, `list`, `kill` methods
   - Implement JSON output parsing
   - Add timeout logic

2. **Add Error Types** in `src/errors.ts`:
   - Add `WispNotFoundError`, `SpriteStartError`, etc.
   - Add corresponding error codes

#### Success Criteria
- Unit tests for SpriteRunner pass
- Error handling works correctly
- Mocks verify correct CLI arguments

---

### Phase 3: RLM Tools (Agent Access)

**Overview**: Expose Sprite operations as RLM tools so agents can spawn and manage Sprites autonomously.

#### Changes Required

1. **Add Sprite Tools** in `src/agent/rlm-tools.ts`:
   - `spawn_sprite`, `attach_sprite`, `list_sprites`, `kill_sprite` tools
   - Proper JSON Schema parameters
   - Return JSON results

2. **Add Sprite Agent Dispatch** in `src/agent/runner.ts`:
   - Add `sprite` case to `runAgentUnion`
   - Route to `runSpriteAgent`

#### Success Criteria
- Tools are registered in `ALL_TOOLS`
- Agent dispatch routes correctly
- RLM tests pass

---

### Phase 4: CLI Commands (User Interface)

**Overview**: Implement CLI commands for manual Sprite management.

#### Changes Required

1. **Create Sprite Command Module** in `src/commands/sprite.ts`:
   - Implement `start`, `attach`, `list`, `kill` command functions
   - Handle CLI options (--json, --memory, etc.)
   - Use `SpriteRunner` internally

2. **Register Commands** in `src/index.ts`:
   - Register `sprite` command group
   - Wire up subcommands and options

#### Success Criteria
- `wreckit sprite --help` works
- Commands execute correctly (mocked)
- JSON output works

---

### Phase 5: Testing & Polish

**Overview**: Create comprehensive integration tests and user documentation.

#### Changes Required

1. **Create Integration Tests** in `src/__tests__/commands/sprite.test.ts`:
   - Mock Wisp CLI using `spyOn(global, 'spawn')`
   - Test all commands
   - Verify error handling

2. **Create Documentation**:
   - `SPRITE_USAGE.md` with installation and usage guide

#### Success Criteria
- All tests pass
- Documentation is complete