# Research: Integrate Wisp/Sprites Go Stack

**Date**: 2025-01-21
**Item**: 073-integrate-wisp-go-stack

## Research Question

Integrate with Wisp (Sprite session manager), WebTmux, and the Sprites Firecracker platform. This allows Wreckit to orchestrate isolated microVM environments, spawning agents inside them for secure, sandboxed execution.

## Summary

This item requires integrating Wreckit with the Wisp/Sprites Go stack to enable "Sandbox Mode" where agents run in isolated Firecracker microVMs. The integration involves:

1. **CLI Command Group**: Creating a new `wreckit sprite` command with subcommands (`start`, `attach`, `list`, `kill`) to manage Sprite lifecycle
2. **Sprite Runner**: Implementing a `SpriteRunner` wrapper that shells out to the `wisp` CLI binary (not rewriting Go logic)
3. **RLM Tools**: Exposing sprite management tools (`spawn_sprite`, `attach_sprite`, `list_sprites`, `kill_sprite`) to RLM agents
4. **Configuration**: Adding sprite-specific configuration to `.wreckitrc`/`config.json`
5. **Testing**: Creating integration tests that mock the Wisp CLI

The key constraint is that Wreckit must **shell out to the `wisp` binary** using `child_process` (not `execa` - it's not in dependencies). The integration should follow the existing patterns for agent runners, command structure, and configuration management.

## Current State Analysis

### Existing Implementation

**Agent Runner Architecture**: Wreckit uses a discriminated union-based agent dispatch system in `src/agent/runner.ts:126-277`. The `runAgentUnion` function dispatches to different agent kinds:
- `process`: External process-based agent (`src/agent/process-runner.ts:68-182`)
- `claude_sdk`: Claude Agent SDK (`src/agent/claude-sdk-runner.ts`)
- `amp_sdk`: Sourcegraph Amp SDK (`src/agent/amp-sdk-runner.ts`)
- `codex_sdk`: OpenAI Codex SDK (`src/agent/codex-sdk-runner.ts`)
- `opencode_sdk`: OpenCode SDK (`src/agent/opencode-sdk-runner.ts`)
- `rlm`: Recursive Language Model mode (`src/agent/rlm-runner.ts:58-232`)

**Configuration System**: Agent configuration uses a discriminated union schema in `src/schemas.ts:37-79`:
```typescript
export const AgentConfigUnionSchema = z.discriminatedUnion("kind", [
  ProcessAgentSchema,
  ClaudeSdkAgentSchema,
  AmpSdkAgentSchema,
  CodexSdkAgentSchema,
  OpenCodeSdkAgentSchema,
  RlmSdkAgentSchema,
]);
```

**Command Pattern**: Commands follow a consistent pattern:
- Export `Options` interface (e.g., `InitOptions` in `src/commands/init.ts:9-12`)
- Export command function (e.g., `initCommand` in `src/commands/init.ts:48-116`)
- Use `findRootFromOptions` for cwd resolution
- Return `Promise<void>`
- Support `--json` output flag where applicable

**RLM Tools Pattern**: Tools are defined in `src/agent/rlm-tools.ts:46-231` using the `AxFunction` interface:
```typescript
const ToolName: AxFunction = {
  name: "ToolName",
  description: "Tool description",
  parameters: { /* JSON Schema */ },
  func: async (params) => { /* implementation */ }
};
```

### Key Files

- **`src/index.ts:1-797`** - Main CLI entry point with Commander.js setup. New commands must be registered here following the existing pattern (lines 115-756)
- **`src/agent/runner.ts:126-277`** - Agent dispatch system. Add new `sprite` case here
- **`src/agent/process-runner.ts:68-182`** - Reference for subprocess execution. Uses `spawn` from `node:child_process` (line 1)
- **`src/schemas.ts:37-79`** - Agent config schemas. Need to add `SpriteAgentSchema` to the union
- **`src/config.ts:48-71`** - Default configuration. Add sprite defaults here
- **`src/agent/rlm-tools.ts:46-231`** - RLM tool definitions. Add sprite tools here
- **`src/commands/init.ts:48-116`** - Example command implementation pattern
- **`src/__tests__/commands/init.test.ts:1-100`** - Example test structure

## Technical Considerations

### Dependencies

**External Dependencies** (assumed present, not installed by Wreckit):
- `wisp` CLI binary - Must be available in PATH
- Go stack (Wisp, Sprites, Firecracker, WebTmux) - User-managed

**Internal Modules** to integrate with:
- `src/agent/runner.ts` - Agent dispatch system
- `src/agent/rlm-tools.ts` - RLM tool registry
- `src/schemas.ts` - Configuration schemas
- `src/config.ts` - Configuration loading and defaults
- `src/commands/` - CLI command infrastructure

**Node.js Built-ins**:
- `node:child_process` - Use `spawn` (already imported in `src/agent/process-runner.ts:1`)
- Do NOT use `execa` - not in dependencies (verified in package.json)

### Patterns to Follow

1. **Agent Runner Pattern**:
   - Create `src/runners/sprite-runner.ts` (note: runners live in `src/agent/` directory based on codebase)
   - Export `SpriteRunAgentOptions` interface
   - Export `runSpriteAgent` function returning `Promise<AgentResult>`
   - Follow `src/agent/rlm-runner.ts:18-31` for signature pattern

2. **Schema Pattern**:
   - Add `SpriteAgentSchema` to `src/schemas.ts` after line 70
   - Include in `AgentConfigUnionSchema` array (line 72-79)
   - Export `SpriteAgentConfig` type after line 325

3. **Command Pattern**:
   - Create `src/commands/sprite.ts`
   - Export options interfaces for each subcommand
   - Export command functions: `spriteStartCommand`, `spriteAttachCommand`, etc.
   - Register in `src/index.ts` after line 756

4. **RLM Tools Pattern**:
   - Add tools to `src/agent/rlm-tools.ts` after line 231
   - Use `AxFunction` interface with JSON Schema parameters
   - Register in `buildToolRegistry` function

5. **Configuration Pattern**:
   - Add sprite config to `DEFAULT_CONFIG` in `src/config.ts:48-71`
   - Schema validation in `src/schemas.ts:192-207`
   - Support `.wreckitrc` overrides

6. **Testing Pattern**:
   - Create `src/__tests__/commands/sprite.test.ts`
   - Mock `wisp` CLI calls using ` spyOn(global, 'spawn')` or similar
   - Follow `src/__tests__/commands/init.test.ts:21-31` for mock logger pattern
   - Test success/error paths for each subcommand

### Integration Points

1. **Agent Dispatch**: Add `sprite` case to `runAgentUnion` switch in `src/agent/runner.ts:172-276`
2. **Config Resolution**: Add sprite config migration/override logic in `src/config.ts:145-194`
3. **CLI Registration**: Register sprite subcommands in `src/index.ts:28-113` program setup
4. **Tool Registry**: Register sprite tools in `buildToolRegistry` function in `src/agent/rlm-tools.ts`

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Wisp binary not installed** | High - Feature unusable | Clear error messages with installation instructions; feature check on startup |
| **Wisp CLI version incompatibility** | Medium - Breaking changes | Document minimum Wisp version; validate CLI output format |
| **Firecracker VM resource exhaustion** | Medium - System instability | Add configurable limits (max VMs, memory, CPU); cleanup on crash |
| **Subprocess hanging/timeouts** | High - Wreckit hangs | Reuse timeout logic from `process-runner.ts:103-122`; implement SIGTERM/SIGKILL escalation |
| **Mocking Wisp CLI in tests** | Low - Test complexity | Use Bun's `mock.module` for `node:child_process`; fixture Wisp responses |
| **Path resolution for Wisp binary** | Medium - Command not found | Support both PATH lookup and explicit path via config; validate on startup |
| **WebTmux integration complexity** | Medium - Scope creep | Focus on CLI wrapper first; WebTmux as separate enhancement |

## Recommended Approach

### Phase 1: Core Infrastructure (Foundation)

1. **Schema & Types**
   - Add `SpriteAgentConfig` schema to `src/schemas.ts`
   - Define configuration fields: `wispPath`, `maxVMs`, `defaultMemory`, `defaultCPUs`, `timeout`
   - Export TypeScript types
   - Add to `AgentConfigUnion` discriminated union

2. **Configuration Support**
   - Add sprite defaults to `DEFAULT_CONFIG` in `src/config.ts`
   - Implement merge logic in `mergeWithDefaults` (line 111)
   - Add override handling in `applyOverrides` (line 145)

3. **Wisp CLI Wrapper**
   - Create `src/agent/sprite-runner.ts`
   - Implement `runWispCommand` helper using `child_process.spawn`
   - Add output parsing for Wisp JSON responses
   - Implement timeout and signal handling (SIGTERM/SIGKILL)
   - Create `SpriteRunner` class with methods: `start()`, `attach()`, `list()`, `kill()`

### Phase 2: RLM Tools (Agent Access)

4. **RLM Tool Integration**
   - Add tools to `src/agent/rlm-tools.ts`:
     - `spawn_sprite`: Start new VM, returns connection info
     - `attach_sprite`: Attach to existing VM
     - `list_sprites`: List active VMs
     - `kill_sprite`: Terminate VM
   - Use `AxFunction` interface with proper JSON Schema
   - Register tools in `buildToolRegistry`
   - Add error handling for Wisp CLI failures

5. **Agent Dispatch**
   - Add `sprite` case to `runAgentUnion` in `src/agent/runner.ts`
   - Import and call `runSpriteAgent`
   - Handle sprite-specific options

### Phase 3: CLI Commands (User Interface)

6. **Command Implementation**
   - Create `src/commands/sprite.ts`
   - Implement subcommands:
     - `sprite start <name>`: Start new Sprite VM
     - `sprite attach <name>`: Attach to running VM
     - `sprite list`: List active Sprites
     - `sprite kill <name>`: Terminate Sprite
   - Support `--json` output flag
   - Add proper error messages and exit codes

7. **CLI Registration**
   - Register `sprite` command in `src/index.ts`
   - Add subcommands using `program.command()`
   - Wire up option parsing and global opts

### Phase 4: Testing & Polish (Quality Assurance)

8. **Integration Tests**
   - Create `src/__tests__/commands/sprite.test.ts`
   - Mock `node:child_process` to simulate Wisp CLI
   - Test success/error paths for each subcommand
   - Verify JSON output format

9. **Error Handling**
   - Define custom error types: `WispNotFoundError`, `SpriteStartError`, etc.
   - Add to `src/errors.ts`
   - Provide actionable error messages

10. **Documentation**
    - Add usage examples to CLI help text
    - Document configuration options
    - Create troubleshooting guide for common issues

## Open Questions

1. **Wisp CLI Interface**: What is the exact command syntax and JSON output format for Wisp? Need documentation or example CLI sessions to implement accurate parsing.

2. **WebTmux Integration**: The item mentions WebTmux but doesn't specify integration depth. Should this be:
   - Just a passthrough to Wisp's WebTmux features?
   - Direct WebSocket connection management?
   - CLI commands to open WebTmux sessions?

3. **Configuration Scope**: What sprite-specific settings should be configurable?
   - Wisp binary path (for non-PATH installations)
   - Default VM resources (CPU, memory, disk)
   - Maximum concurrent VMs
   - Timeout defaults
   - Firecracker kernel/image paths

4. **Agent spawning semantics**: When an agent uses `spawn_sprite`:
   - Does the agent run INSIDE the VM, or does Wreckit orchestrate from outside?
   - How is the agent prompt/code transferred into the VM?
   - How are results extracted from the VM?

5. **State Management**: Should Sprite state be tracked:
   - In `.wreckit/` directory (persistent across restarts)?
   - Only in runtime (clean slate on restart)?
   - Via Wisp's own state management?

6. **Security Model**: What isolation guarantees are expected?
   - Network access per VM?
   - Filesystem mounting (read-only vs read-write)?
   - Secret/credential passing into VMs?

7. **Backward Compatibility**: Should items work transparently in Sprites without modification, or do they need explicit opt-in (e.g., `"sandbox": true` in PRD)?

## Implementation Notes

- **Use `child_process.spawn`** (not `exec`) for subprocess management - already imported in `src/agent/process-runner.ts:1`
- **Reuse timeout logic** from `process-runner.ts:103-122` for reliability
- **Follow TypeScript strict mode** - all schemas and types must be properly defined
- **Mock Wisp CLI in tests** using Bun's mocking capabilities - do not require actual Wisp installation for tests
- **Add to agent kind validation** in `src/config.ts:154` when implementing new agent kind
