# Research: Dogfood RLM: Comprehensive Refactor of Agent Runner

**Date**: 2025-01-27
**Item**: 066-dogfood-rlm-comprehensive-refactor

## Research Question

Use the newly implemented Recursive Language Model (RLM) mode to perform a comprehensive refactor of `src/agent/runner.ts` and related files. The goal is to prove RLM's ability to handle large contexts (the entire agent module) and perform complex architectural improvements that standard agents struggle with.

## Summary

This research explores using RLM (Recursive Language Model) mode to refactor the agent runner system. The current `src/agent/runner.ts` file contains 512 lines with multiple responsibilities: process-based agent execution, legacy SDK support, new discriminated union dispatch system, and lifecycle management. RLM's "Prompt-as-Environment" architecture is ideal for this task because it can handle large contexts (the entire agent module) without being constrained by token limits, enabling it to understand complex architectural patterns and perform systematic refactoring.

The refactor should focus on extracting the dispatcher logic from `runner.ts` into a dedicated module, simplifying the type system by removing legacy compatibility layers where safe, and improving code organization while maintaining backward compatibility with existing SDK runners (claude-sdk-runner.ts, amp-sdk-runner.ts, codex-sdk-runner.ts, opencode-sdk-runner.ts, rlm-runner.ts).

## Current State Analysis

### Existing Implementation

The agent module follows a **discriminated union pattern** for agent configuration, introduced in Phase 4 (Item 064). The architecture consists of:

1. **Configuration Schema** (`src/schemas.ts:33-79`):
   - `AgentConfigUnion` is a discriminated union with `kind` as the discriminator
   - Six agent kinds supported: `process`, `claude_sdk`, `amp_sdk`, `codex_sdk`, `opencode_sdk`, `rlm`
   - Each kind has its own schema with specific configuration fields

2. **Runner Module** (`src/agent/runner.ts:512 lines`):
   - **Lines 1-317**: Legacy agent execution system (deprecated but still functional)
   - **Lines 7-54**: Global registries for cleanup (`activeSdkControllers`, `activeProcessAgents`)
   - **Lines 56-126**: Legacy `AgentConfig` interface and `getAgentConfig()` converter
   - **Lines 160-205**: Legacy `runAgent()` with fallback from SDK to process mode
   - **Lines 207-317**: `runProcessAgent()` handling ChildProcess spawn, timeout, stdout/stderr capture
   - **Lines 319-511**: New dispatch system with `runAgentUnion()` and switch on `config.kind`
   - **Lines 348-511**: `runAgentUnion()` dispatches to appropriate SDK runner based on kind

3. **SDK Runner Implementations**:
   - `src/agent/claude-sdk-runner.ts:301 lines` - Claude Agent SDK integration
   - `src/agent/amp-sdk-runner.ts:90 lines` - Amp SDK integration
   - `src/agent/codex-sdk-runner.ts:94 lines` - Codex SDK integration
   - `src/agent/opencode-sdk-runner.ts:110 lines` - OpenCode SDK integration
   - `src/agent/rlm-runner.ts:233 lines` - RLM mode with @ax-llm/ax framework

4. **Index Exports** (`src/agent/index.ts:1-23`):
   - Exports both new API (preferred) and legacy API (deprecated)
   - Clear migration path documented in comments

### Current Patterns and Conventions

1. **Discriminated Union Dispatch** (`src/agent/runner.ts:389-510`):
   ```typescript
   switch (config.kind) {
     case "process": { /* convert to legacy */ }
     case "claude_sdk": { /* convert to legacy */ }
     case "amp_sdk": { /* direct dispatch */ }
     // ... etc
   }
   ```

2. **Legacy Compatibility Layers**:
   - `getAgentConfig()` converts new union format to legacy mode format
   - Some SDK runners still receive legacy `AgentConfig` then convert back
   - `runAgentUnion()` has conversion code for process/claude_sdk cases

3. **Lifecycle Management**:
   - SDK agents use `AbortController` registered in global Set
   - Process agents tracked in `activeProcessAgents` Set
   - `terminateAllAgents()` handles graceful shutdown (lines 19-54)

4. **Error Handling Pattern**:
   - Each SDK runner returns `AgentResult` with success boolean
   - Timeouts handled via `setTimeout` with abort/fallback
   - Authentication errors trigger fallback from SDK to process mode (claude-sdk only)

5. **Streaming Support**:
   - SDK runners use async generators for streaming output
   - Callbacks: `onStdoutChunk`, `onStderrChunk`, `onAgentEvent`
   - `AgentEvent` typed events for tool use, results, errors

### Integration Points

1. **Workflow System** (`src/workflow/itemWorkflow.ts:39`):
   - Imports `runAgentUnion` and `getAgentConfigUnion`
   - Uses agent in all phases: research, plan, implement, pr
   - Passes MCP servers, tool allowlists, skill configurations

2. **Healing Runner** (`src/agent/healingRunner.ts`):
   - Wraps `runAgentUnion` for automatic error recovery
   - Doctor system can retry failed agent runs

3. **MCP Integration** (`src/agent/mcp/`):
   - `wreckitMcpServer.ts` provides structured output tools
   - `mcporterAdapter.ts` adapts Claude SDK MCP to Ax functions

4. **CLI Entry Points**:
   - `src/index.ts:52` - `--rlm` flag sets agent kind
   - `src/commands/orchestrator.ts:92` - `agentKind` override option
   - All commands support `--agent <kind>` flag

## Key Files

### Core Agent Module
- `src/agent/runner.ts:1-512` - Main dispatch and legacy runner with agent lifecycle management, discriminated union dispatch system, and legacy compatibility layers
- `src/agent/index.ts:1-23` - Public API exports separating new (preferred) from legacy (deprecated) interfaces
- `src/schemas.ts:33-79` - Agent configuration types defining discriminated union with 6 agent kinds
- `src/schemas.ts:65-70` - RlmSdkAgentSchema with provider support (anthropic, openai, google, zai)

### SDK Runners
- `src/agent/claude-sdk-runner.ts:1-301` - Claude SDK integration with error handling, streaming support, and fallback to process mode
- `src/agent/amp-sdk-runner.ts:1-90` - Amp SDK integration using execute() from @sourcegraph/amp-sdk
- `src/agent/codex-sdk-runner.ts:1-94` - Codex SDK integration
- `src/agent/opencode-sdk-runner.ts:1-110` - OpenCode SDK integration
- `src/agent/rlm-runner.ts:1-233` - RLM mode with @ax-llm/ax framework, JavaScript runtime for context storage, and tool adaptation

### RLM-Specific Modules
- `src/agent/rlm-tools.ts:1-230` - RLM tool registry with JSRuntime class, RunJS tool for context inspection, and file system tools (Read, Write, Edit, Glob, Grep, Bash)
- `src/agent/env.ts:1-162` - Environment variable resolution for SDK agents with precedence: config.local.json > config.json > process.env > ~/.claude/settings.json
- `src/agent/mcp/mcporterAdapter.ts:1-67` - MCP server to Ax function adapter for RLM agent tool integration

### Supporting Modules
- `src/agent/toolAllowlist.ts` - Phase-based tool restrictions for security
- `src/agent/healingRunner.ts` - Automatic error recovery wrapper for agent runs
- `src/agent/contextBuilder.ts` - JIT context loading for skill-based agents
- `src/agent/skillLoader.ts` - Phase-specific skill loading system

### Configuration and CLI
- `src/config.ts:145-186` - applyOverrides function supporting agent kind override parameter
- `src/config.ts:152-164` - Agent kind override logic with validation
- `src/index.ts:52` - CLI flag definition: --rlm (shorthand for --agent rlm)
- `src/index.ts:69-70` - CLI flag precedence: opts.rlm takes priority over opts.agent
- `src/index.ts:84` - agentKind parameter passed to orchestrateAll

### Workflow Integration
- `src/workflow/itemWorkflow.ts:39` - Import of runAgentUnion for phase execution
- `src/workflow/itemWorkflow.ts:321` - Agent execution with healing wrapper
- `src/workflow/itemWorkflow.ts:500` - Plan phase agent execution with MCP server
- `src/workflow/itemWorkflow.ts:677` - Implement phase agent execution
- `src/workflow/itemWorkflow.ts:763` - PR phase agent execution
- `src/workflow/itemWorkflow.ts:1259` - Complete phase agent execution
- `src/workflow/critique.ts:4` - Critique phase using runAgentUnion
- `src/workflow/critique.ts:121` - Critique agent execution

### Orchestrator
- `src/commands/orchestrator.ts:76-93` - OrchestratorOptions interface with agentKind field
- `src/commands/orchestrator.ts:109-116` - orchestrateAll function with agentKind override
- `src/commands/orchestrator.ts:505-508` - orchestrateNext function with agentKind support

### Tests
- `src/__tests__/agent.test.ts:1-428` - Agent runner tests covering legacy and union modes
- `src/__tests__/workflow.test.ts` - Integration tests for phase workflows
- `src/__tests__/sdk-integration/` - SDK-specific integration tests
- `src/agent/__tests__/rlm-integration.test.ts:1-83` - RLM agent integration tests

## Technical Considerations

### Dependencies

**External Dependencies**:
- `@anthropic-ai/claude-agent-sdk` - Claude Agent SDK (claude_sdk runner)
- `@sourcegraph/amp-sdk` - Amp SDK (amp_sdk runner)
- `@openai/codex-sdk` - Codex SDK (codex_sdk runner)
- `@opencode-ai/sdk` - OpenCode SDK (opencode_sdk runner)
- `@ax-llm/ax` - AxAgent framework (rlm runner)
- Node.js: `vm` module (RLM JSRuntime), `child_process` (process spawn)

**Internal Modules**:
- `src/schemas.ts` - Type definitions (`AgentConfigUnion`, `AgentResult`)
- `src/config.ts` - Config resolution with agent migration
- `src/logging.ts` - Logger interface for all runners
- `src/tui/agentEvents.ts` - Event types for streaming
- `src/agent/env.ts` - Environment building for SDKs
- `src/agent/toolAllowlist.ts` - Phase-based tool restrictions
- `src/agent/mcp/mcporterAdapter.ts` - MCP to Ax function adapter
- `src/agent/rlm-tools.ts` - RLM tool registry (Read, Write, Edit, Glob, Grep, Bash, RunJS)

### Patterns to Follow

1. **Discriminated Union Over Type Switching**:
   - Current switch statement is appropriate for discriminated union
   - Each case should be self-contained with no fallthrough
   - `exhaustiveCheck()` function ensures all cases handled (line 340-342)

2. **Separation of Concerns**:
   - Runner execution vs. configuration management
   - Lifecycle management (terminateAllAgents) vs. dispatch logic
   - Legacy compatibility should be isolated, not mixed with new code

3. **Type Safety**:
   - Use `AgentConfigUnion` directly, not legacy `AgentConfig`
   - Remove `getAgentConfig()` and legacy interfaces where safe
   - Each SDK runner should accept union config, not convert

4. **Error Handling**:
   - SDK runners return standardized `AgentResult`
   - Authentication errors logged with helpful recovery instructions
   - Timeout handling consistent across all runners

5. **Testing Patterns** (from `src/__tests__/agent.test.ts`):
   - Test both success and failure cases
   - Mock stdout/stderr callbacks
   - Verify timeout, dry-run, mock-agent modes
   - Test completion signal detection

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Breaking existing SDK runners** | High | Run full test suite (`bun test`) after refactor; verify all agent kinds still work |
| **Removing legacy compatibility too early** | Medium | Keep legacy `runAgent()` and `getAgentConfig()` exported but mark `@deprecated`; check usages in codebase first |
| **RLM token limit or context window issues** | Low | RLM uses "Prompt-as-Environment" (CONTEXT_DATA in JSRuntime), not token window; can handle arbitrarily large contexts |
| **Type system complexity increases** | Medium | Ensure new types are simpler than old; use TypeScript strict mode to catch issues |
| **Public API changes break downstream code** | High | Do not change exported signatures without migration path; check `src/agent/index.ts` exports |
| **Regression in timeout/abort handling** | Medium | Keep `terminateAllAgents()` logic intact; test with long-running agents |
| **MCP server integration breaks** | Low | Ensure `mcpServers` parameter still passed through dispatch; test with wreckit MCP server |

## Recommended Approach

### Phase 1: Preparation (RLM Agent Setup)

1. **Run RLM in dogfood mode**:
   ```bash
   wreckit run 066 --rlm
   ```
   This will invoke the RLM agent with the full agent module as context.

2. **Context preparation**:
   - RLM agent should read entire `src/agent/` directory
   - Use `Glob` and `Read` tools to understand current structure
   - Identify pain points: code duplication, conversion logic, mixed responsibilities

3. **Refactoring strategy generation**:
   - RLM agent should propose a modular architecture
   - Extract dispatcher into `src/agent/dispatcher.ts`
   - Simplify runner.ts to only handle lifecycle and legacy compatibility
   - Each SDK runner should accept `AgentConfigUnion` directly

### Phase 2: Target Refactoring Goals

Based on code analysis, the refactor should address:

1. **Extract Dispatch Logic** (`src/agent/runner.ts:348-511`):
   - Move to `src/agent/dispatcher.ts`
   - Pure function: `(config: AgentConfigUnion, options: DispatcherOptions) => Promise<AgentResult>`
   - No conversion to legacy formats in dispatcher

2. **Simplify Type Definitions**:
   - Remove `AgentConfig` interface if no external usages
   - Remove `RunAgentOptions` if no external usages
   - Keep `AgentResult` (shared by all runners)
   - Add `DispatcherOptions` for common dispatch parameters

3. **SDK Runner Standardization**:
   - Each runner accepts: `config: TheirConfigKind, options: RunAgentOptions`
   - All return `AgentResult`
   - All register AbortControllers for cleanup
   - Consistent error handling patterns

4. **Lifecycle Management**:
   - Keep `registerSdkController()`, `unregisterSdkController()`, `terminateAllAgents()` in `runner.ts`
   - Or move to `src/agent/lifecycle.ts` for better organization

5. **Backward Compatibility**:
   - Keep `runAgent()` and `getAgentConfig()` as deprecated wrappers
   - Check usages: `grep -r "runAgent\|getAgentConfig" src/` (excluding `runner.ts`)
   - If usages exist, migrate to `runAgentUnion` / `getAgentConfigUnion`

### Phase 3: RLM Execution Pattern

RLM agent should follow this workflow:

1. **Context Loading** (RunJS):
   ```javascript
   // Inspect the full agent module structure
   const files = glob("src/agent/*.ts");
   const structure = files.map(f => ({ name: f, exports: read(f) }));
   ```

2. **Analysis** (RunJS):
   - Identify duplicated code patterns
   - Find conversion logic (legacy ← → union)
   - Map dependencies between modules

3. **Refactoring** (tools):
   - Create new files: `dispatcher.ts`, `lifecycle.ts`
   - Edit `runner.ts` to use new modules
   - Update SDK runners to accept union configs directly
   - Update `index.ts` exports

4. **Verification**:
   - Run `bun test` to verify all tests pass
   - Run `bun run typecheck` for type safety
   - Test each agent kind individually: `wreckit --agent <kind> run <test-item>`

### Phase 4: Validation

1. **Test Coverage**:
   - `src/__tests__/agent.test.ts` - Legacy runner tests
   - `src/__tests__/workflow.test.ts` - Integration tests
   - `src/__tests__/sdk-integration/` - SDK-specific tests
   - All must pass after refactor

2. **Manual Testing**:
   ```bash
   # Test each agent kind
   wreckit --agent claude_sdk run 001
   wreckit --agent amp_sdk run 001
   wreckit --agent codex_sdk run 001
   wreckit --agent opencode_sdk run 001
   wreckit --rlm run 001
   ```

3. **Regression Checks**:
   - Verify MCP server integration still works
   - Verify tool allowlist enforcement
   - Verify timeout/abort handling
   - Verify dry-run and mock-agent modes

## Open Questions

1. **Legacy API Usage**: Are there any remaining usages of `runAgent()` or `getAgentConfig()` outside of `runner.ts`? If yes, they should be migrated before removing.

2. **Backward Compatibility**: Should we maintain full backward compatibility with legacy config format (mode-based) or require users to migrate to kind-based? Current code supports both via `migrateAgentConfig()` in `config.ts`.

3. **Dispatcher Granularity**: Should the dispatcher be a simple switch statement, or a registry-based plugin system? A registry would allow dynamic agent kind registration (useful for testing and extensions).

4. **Lifecycle Management**: Should lifecycle functions (`registerSdkController`, etc.) stay in `runner.ts` or move to `lifecycle.ts`? Moving them would improve modularity but adds another file.

5. **RLM Context Window**: While RLM uses "Prompt-as-Environment" to avoid token limits, does the underlying model (claude-sonnet-4) have sufficient reasoning capacity for complex architectural refactoring? This is a validation of RLM's core premise.

6. **Testing Strategy**: Should we add integration tests specifically for the refactored dispatcher? Or rely on existing workflow tests to validate end-to-end functionality?

## Success Criteria Checklist

- [ ] Successfully run `wreckit run 066 --rlm`
- [ ] RLM agent reads the entire `src/agent` directory as context
- [ ] RLM agent proposes a refactoring plan
- [ ] Dispatcher logic extracted from `runner.ts` to `dispatcher.ts`
- [ ] Legacy compatibility layers simplified or removed where safe
- [ ] All tests pass after refactor (`bun test`)
- [ ] No regression in existing agent modes (test each kind)
- [ ] Type safety maintained (`bun run typecheck`)
- [ ] Public API unchanged (check `src/agent/index.ts` exports)
- [ ] MCP integration still functional
- [ ] Documentation updated if needed

## Next Steps

1. **Execute RLM Run**: Start with `wreckit run 066 --rlm` to let RLM agent analyze the codebase
2. **Review Plan**: RLM will generate a plan.md with proposed refactoring
3. **Implement**: RLM will implement the refactor during the implement phase
4. **Validate**: Run tests and manual validation for each agent kind
5. **Document**: Update this research.md with findings and lessons learned

This research document provides a comprehensive foundation for the RLM agent to understand the current architecture, identify refactoring opportunities, and execute a systematic refactor while maintaining backward compatibility and test coverage.
