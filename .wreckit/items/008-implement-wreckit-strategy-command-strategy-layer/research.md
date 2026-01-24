# Research: Implement 'wreckit strategy' command (Strategy Layer)

**Date**: 2026-01-24
**Item**: 008-implement-wreckit-strategy-command-strategy-layer

## Research Question
Prevent 'Feature Factory' issues by introducing strategic planning into the development workflow.

**Motivation:** Creates a Hierarchical Control Loop (Strategy -> Plan -> Implement) to ensure development work aligns with high-value strategic milestones rather than ad-hoc feature requests.

**Success criteria:**
- 'wreckit strategy' command analyzes src/, specs/, and benchmark_results.md
- ROADMAP.md is managed as the strategic state artifact
- 'wreckit execute-roadmap' converts active Roadmap milestones into Wreckit Items
- Hierarchical Control Loop is established: Strategy -> Plan -> Implement

**Technical constraints:**
- Must analyze 'src/' directory
- Must analyze 'specs/' directory
- Must analyze 'benchmark_results.md'
- Must manage 'ROADMAP.md' as the strategic state artifact

## Summary

This feature introduces a new "Strategy Layer" above the existing wreckit workflow to prevent "Feature Factory" anti-patterns where teams ship ad-hoc features without strategic alignment. The implementation requires two new commands: `wreckit strategy` (analyzes codebase and produces/updates ROADMAP.md) and `wreckit execute-roadmap` (converts ROADMAP milestones into wreckit Items).

The codebase already has a well-established pattern for CLI commands (using Commander.js), phase execution via agent-driven workflows, and artifact persistence using JSON/Markdown files in `.wreckit/`. The strategy layer will follow these patterns, using an agent to analyze the codebase context (src/, specs/, benchmark_results.md) and generate/update a ROADMAP.md file as the "strategic state artifact." The execute-roadmap command will parse ROADMAP.md and create wreckit Items for active milestones.

The key architectural decisions include: (1) treating ROADMAP.md as a root-level file (not in .wreckit/) for visibility and version control; (2) using the existing agent infrastructure with appropriate tool restrictions; (3) extending the prompt system with a new "strategy" prompt template; and (4) creating a new domain module for roadmap parsing/manipulation.

## Current State Analysis

### Existing Implementation

The wreckit codebase has a mature CLI structure with command dispatch in `src/index.ts:23-554` using Commander.js. Each command follows a pattern of:
1. Register command with `.command()` and `.action()` handler
2. Call `executeCommand()` wrapper for error handling
3. Delegate to a dedicated command module in `src/commands/`

The existing workflow phases (`research`, `plan`, `implement`, `pr`, `complete`) are defined in `src/commands/phase.ts:38-77` with a `PHASE_CONFIG` mapping that links states to runner functions. The workflow runs via `src/workflow/itemWorkflow.ts` which handles agent execution, artifact validation, and state transitions.

Agent execution is handled by `src/agent/runner.ts:348-494` with the `runAgentUnion()` function that supports multiple agent backends (claude_sdk, process, amp_sdk, etc.). Each phase uses prompt templates from `src/prompts/` with variable substitution via `src/prompts.ts:55-95`.

### Key Files

- `src/index.ts:23-554` - CLI entry point, command registration pattern
- `src/commands/index.ts:1-21` - Command exports barrel file
- `src/commands/ideas.ts:88-176` - Example of agent-driven command with MCP tool capture
- `src/commands/phase.ts:38-77` - PHASE_CONFIG pattern for state transitions
- `src/workflow/itemWorkflow.ts:173-315` - Research phase implementation (model for strategy)
- `src/agent/runner.ts:348-494` - `runAgentUnion()` agent dispatch
- `src/agent/mcp/wreckitMcpServer.ts:47-140` - MCP tool pattern for structured data capture
- `src/domain/ideas.ts:184-213` - `allocateItemId()` for ID generation
- `src/domain/ideas.ts:266-297` - `persistItems()` for item creation
- `src/prompts.ts:38-53` - `loadPromptTemplate()` for prompt loading
- `src/prompts.ts:97-112` - `initPromptTemplates()` for template initialization
- `src/schemas.ts:95-127` - Item schema definition
- `src/fs/paths.ts:44-90` - Path helper functions
- `src/config.ts:45-68` - DEFAULT_CONFIG and resolved config structure
- `benchmark_results.md:1-63` - Example of benchmark data format
- `specs/README.md:1-44` - Specification index format

### Integration Points

1. **CLI Registration** - New commands must be added to `src/index.ts` following the existing pattern
2. **Config Schema** - May need new config fields for strategy settings (e.g., `strategy.analyze_dirs`)
3. **Prompt Templates** - New `strategy.md` prompt template needed in `src/prompts/`
4. **MCP Tools** - New tool for structured roadmap capture if using agent-driven approach
5. **Domain Logic** - New module for ROADMAP.md parsing and milestone-to-item conversion

## Technical Considerations

### Dependencies

**External Dependencies:**
- None required - can use existing dependencies (zod, commander, agent SDK)

**Internal Modules to Integrate:**
- `src/agent/runner.ts` - For agent execution
- `src/agent/mcp/wreckitMcpServer.ts` - For new MCP tools (if needed)
- `src/prompts.ts` - For prompt template loading
- `src/domain/ideas.ts` - For item creation logic
- `src/fs/json.ts` - For reading/writing JSON artifacts
- `src/logging.ts` - For consistent logging
- `src/config.ts` - For configuration loading

### Patterns to Follow

1. **Command Pattern** (`src/commands/ideas.ts:88-176`):
   - Use `findRootFromOptions()` to get repository root
   - Use `loadConfig()` for configuration
   - Use agent with MCP server for structured output
   - Handle dry-run mode appropriately

2. **Agent Execution Pattern** (`src/workflow/itemWorkflow.ts:173-260`):
   - Load prompt template with `loadPromptTemplate()`
   - Build variables with context
   - Use `runAgentUnion()` with appropriate options
   - Capture structured output via MCP tools or file parsing

3. **Artifact Pattern** (from specs):
   - Use Markdown for human-readable artifacts (ROADMAP.md)
   - Use JSON for machine-readable data (if needed for milestone tracking)
   - Validate content quality before accepting

4. **Tool Allowlist Pattern** (`src/agent/toolAllowlist.ts`):
   - Strategy phase should be read-only like research
   - Allow: Read, Glob, Grep for codebase analysis
   - Block: Write, Edit, Bash (except for ROADMAP.md output)

5. **Prompt Variable Pattern** (`src/prompts.ts:73-87`):
   - Support `{{#if var}}` conditionals
   - Use clear variable names matching item schema

### ROADMAP.md Format

Based on analysis of project conventions and the need for both human readability and machine parseability, the ROADMAP.md should follow this structure:

```markdown
# Roadmap

## Active Milestones

### [M1] Milestone Title
**Status:** in-progress | planned | done
**Target:** Q1 2026
**Strategic Goal:** Why this matters

#### Objectives
- [ ] Objective 1 (maps to potential item)
- [ ] Objective 2
- [x] Completed objective

### [M2] Next Milestone
...

## Backlog

### [B1] Future Milestone
...

## Completed

### [DONE-1] Past Milestone
...
```

This format:
- Is human-readable in GitHub/markdown viewers
- Has parseable structure (## sections, ### milestones, - [ ] items)
- Distinguishes Active, Backlog, and Completed sections
- Uses checkbox syntax for objective completion tracking

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Agent modifies codebase during strategy analysis | High | Enforce read-only tool allowlist (Read, Glob, Grep only) |
| ROADMAP.md format becomes inconsistent | Medium | Implement validation function, provide format guidance in prompt |
| Strategy phase takes too long due to large codebase | Medium | Add configurable analysis scope, timeout settings |
| Duplicate items created from execute-roadmap | Medium | Implement deduplication by matching milestone objective to existing item slugs |
| ROADMAP.md conflicts with user edits | Medium | Design for merge-friendly format, document manual edit guidelines |
| Benchmark data not available | Low | Make benchmark analysis optional, provide graceful degradation |

## Recommended Approach

### Phase 1: Core Infrastructure

1. **Create `src/commands/strategy.ts`** - New command module with:
   - `strategyCommand()` function
   - Options: `--dry-run`, `--force`, `--analyze-dirs`
   - Read-only agent execution with strategy prompt

2. **Create `src/prompts/strategy.md`** - Strategy prompt template:
   - Instructions to analyze src/, specs/, benchmark_results.md
   - Output structured ROADMAP.md format
   - Emphasis on strategic thinking, not tactical features

3. **Create `src/domain/roadmap.ts`** - Roadmap domain logic:
   - `parseRoadmap(content: string)` - Parse ROADMAP.md into structured data
   - `serializeRoadmap(roadmap: Roadmap)` - Convert structure back to Markdown
   - `validateRoadmap(roadmap: Roadmap)` - Validate structure and content

4. **Add tool allowlist for strategy phase** in `src/agent/toolAllowlist.ts`:
   - Allow: Read, Glob, Grep, Write (only for ROADMAP.md)
   - Block: Edit, Bash, all other tools

### Phase 2: Execute-Roadmap Command

5. **Create `src/commands/execute-roadmap.ts`**:
   - Parse ROADMAP.md using domain logic
   - Extract active milestone objectives
   - Convert objectives to ParsedIdea format
   - Use existing `persistItems()` to create items
   - Handle deduplication via slug matching

6. **Update CLI registration** in `src/index.ts`:
   - Register `wreckit strategy` command
   - Register `wreckit execute-roadmap` command

### Phase 3: Integration & Polish

7. **Update `src/prompts.ts`** with PromptName type extension
8. **Add tests** following existing patterns
9. **Document in specs/** as new spec file (011-strategy-phase.md)
10. **Update README.md** with new commands

## Open Questions

1. **ROADMAP.md Location**: Should it be at repository root (preferred for visibility) or in `.wreckit/` (for consistency with other artifacts)?
   - Recommendation: Root level, similar to README.md

2. **Milestone ID Format**: Should we use `[M1]`, `[MS-001]`, or another format?
   - Recommendation: `[M1]`, `[B1]` for brevity - can evolve if needed

3. **Strategy Agent Scope**: Should the agent always analyze the full codebase or have configurable scope?
   - Recommendation: Start with configurable `--analyze-dirs` flag, default to `src/,specs/`

4. **Benchmark Integration**: Should missing benchmark_results.md cause failure or be handled gracefully?
   - Recommendation: Graceful degradation - log warning, continue without benchmark data

5. **Item Linking**: Should items created from milestones reference back to the milestone?
   - Recommendation: Add optional `milestone_id` field to Item schema for traceability

6. **Execute-Roadmap Scope**: Should it create all objectives as items, or only unchecked ones?
   - Recommendation: Only unchecked (incomplete) objectives, with `--include-done` flag for override

7. **Hierarchical Control Loop**: Is the loop "Strategy -> Plan -> Implement" or does Strategy produce ROADMAP which is then executed via items that go through the normal "idea -> research -> plan -> implement" loop?
   - Recommendation: Strategy operates at a higher level - it produces ROADMAP.md, execute-roadmap creates Items, then normal wreckit workflow handles research/plan/implement per item
