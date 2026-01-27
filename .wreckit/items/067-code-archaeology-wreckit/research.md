# Research: Code Archaeology - Forensic Analysis of Wreckit

**Date**: 2025-01-21
**Item**: 067-code-archaeology-wreckit

## Research Question

A deep-dive forensic analysis of the Wreckit codebase. Not documentation, but archaeology: tracing the evolution of key modules, identifying hidden technical debt, uncovering copy-pasted patterns, and mapping the 'DNA' of the project from its origins to the new RLM architecture.

## Summary

Wreckit is a sophisticated autonomous agent CLI tool that implements the "Ralph Wiggum Loop" — a workflow that converts raw ideas into researched, planned, implemented, and PR'd code through AI agent automation. The codebase shows clear evolutionary layers:

**Origins (Legacy Layer)**: Originally designed around process-mode agents (spawning external CLI tools like `claude` or `amp` as subprocesses). This architecture required completion signal detection (`<promise>COMPLETE</promise>`), stdout/stderr parsing, and manual timeout handling.

**Migration Layer (SDK Transition)**: The introduction of `AgentConfigUnion` discriminated union schema (`src/schemas.ts:72-79`) created a migration path from process mode to SDK mode. The dispatcher pattern (`src/agent/dispatcher.ts`) abstracts multiple agent backends (Claude SDK, Amp SDK, Codex SDK, OpenCode SDK, and RLM) behind a unified interface.

**RLM Architecture (Newest Layer)**: The Recursive Language Model mode (`src/agent/rlm-runner.ts`) implements "Prompt-as-Environment" — storing prompts in a JavaScript runtime (`CONTEXT_DATA`) instead of the context window, enabling "infinite" context through programmatic inspection via `RunJS` tool.

**Technical Debt Patterns**:
1. **Deprecated Code Accumulation**: 11 `@deprecated` markers found, primarily in agent runner and domain modules, indicating incomplete migration from legacy APIs
2. **Copy-Paste Pattern**: Quality validation logic is duplicated across research/plan/story phases with similar retry loops
3. **Git Mutex**: Global mutex (`src/git/index.ts:71-96`) serializes all git operations to prevent index.lock contention, suggesting historical concurrency issues
4. **State Machine Fragility**: Three separate files maintain the state progression truth (states.ts, phase.ts, itemWorkflow.ts) with manual synchronization warnings

**Hidden Strengths**:
- Comprehensive error type hierarchy (23+ custom error classes with error codes)
- File-based state (`.wreckit/` directory) enables git-trackable, inspectable workflows
- MCP server pattern for structured output capture (wreckitMcpServer, dreamMcpServer, ideasMcpServer)
- Skill loading system (Item 033) for JIT context injection per phase
- Self-healing runtime (Item 038) with automatic retry and repair

## Current State Analysis

### Architecture Layers

#### Layer 1: Core State Machine (src/domain/)

**File**: `src/domain/states.ts:12-19`
```typescript
export const WORKFLOW_STATES: WorkflowState[] = [
  "idea", "researched", "planned", "implementing", "in_pr", "done",
];
```

**DNA Signature**: Linear state progression with strict validation. State transitions are validated in three places (creating synchronization burden):
- `src/domain/states.ts` - Defines canonical ordering
- `src/commands/phase.ts:89-96` - Validates invalid transitions
- `src/workflow/itemWorkflow.ts:607-626` - Maps states to phases

**Technical Debt**: Manual synchronization required. Change in one place requires updates in two others, creating fragility.

#### Layer 2: Agent Abstraction (src/agent/)

**Pattern**: Discriminated Union Dispatch
```typescript
// src/agent/dispatcher.ts:19-171
export async function dispatchAgent(
  config: AgentConfigUnion,  // Union of 6 agent types
  options: CommonRunAgentOptions
): Promise<AgentResult>
```

**Supported Backends**:
1. `process` - Legacy subprocess spawning
2. `claude_sdk` - Claude Agent SDK (recommended, default)
3. `amp_sdk` - Amp SDK (experimental)
4. `codex_sdk` - Codex SDK (experimental)
5. `opencode_sdk` - OpenCode SDK (experimental)
6. `rlm` - Recursive Language Model via @ax-llm/ax

**Evolution Evidence**:
- `src/agent/runner.ts:30-175` contains 11 `@deprecated` markers for legacy agent config APIs
- Old `mode: "sdk" | "process"` format migrated to `kind: "claude_sdk" | "process"` discriminated union
- Fallback behavior: SDK authentication failures automatically fall back to process mode (migration safety net)

#### Layer 3: RLM Architecture (Newest)

**File**: `src/agent/rlm-runner.ts:58-232`

**Key Innovation**: Prompt-as-Environment pattern
```typescript
// Store prompt in JavaScript runtime instead of context window
const jsRuntime = new JSRuntime({
  CONTEXT_DATA: prompt,  // "Infinite" context
  cwd: cwd,
});

// Agent must "pull" prompt via RunJS tool
const rlmTrigger = "The user's request is in CONTEXT_DATA. Use RunJS to inspect it.";
```

**Why This Matters**: Solves context window limitations for large tasks. The agent uses `RunJS` tool to programmatically inspect instructions in chunks rather than receiving everything in the prompt.

**Provider Support**:
- Anthropic (default)
- Zai (maps to Anthropic client)
- OpenAI
- Google Gemini

### Existing Implementation

#### Workflow Phase Pattern (src/workflow/itemWorkflow.ts)

Each phase (research, plan, implement, pr, complete) follows a consistent template:

**Copy-Paste Evidence** (lines 256-668):
```typescript
// Research Phase (256-451)
let attempt = 0;
const maxAttempts = 3;
let validationError: string | null = null;

while (attempt < maxAttempts) {
  // 1. Load prompt template
  // 2. Render with variables
  // 3. Run agent (with self-healing if enabled)
  // 4. Validate output
  // 5. Enforce git scope (read-only, design-only, etc.)
  // 6. Retry on validation failure
}
```

This pattern is duplicated with variations across:
- Research: Validates `research.md` quality, enforces read-only (no file modifications)
- Plan: Validates `plan.md` + `prd.json`, enforces design-only (only those two files)
- Implement: Validates story completion, enforces scope tracking (warns on system file modifications)

**Technical Debt**: The retry-with-validation logic could be extracted into a shared service with a request struct (violates AGENTS.md principle: "When multiple code paths do similar things... create a shared service").

#### Git Operations Layer (src/git/index.ts)

**Pattern**: Mutex-serialized command execution
```typescript
// src/git/index.ts:71-98
class Mutex {
  private mutex = Promise.resolve();
  lock(): Promise<() => void> { /* ... */ }
  async dispatch<T>(fn): Promise<T> { /* ... */ }
}

const gitMutex = new Mutex();
```

**Why This Exists**: Prevents `.git/index.lock` contention when running multiple wreckit instances in parallel (multi-actor parallelism design goal).

**Operations**: 40+ git operations including:
- Branch creation/deletion/cleanup
- PR creation/update/mergeability check
- Quality gates (pre-push commands, secret scanning)
- Remote URL validation
- Merge conflict detection
- Status comparison (for scope enforcement)

**Hidden Complexity**: `src/git/index.ts` is 1200+ lines, suggesting it could be split into:
- `git/branch.ts` - Branch operations
- `git/pr.ts` - PR operations
- `git/validation.ts` - Preflight, quality gates, remote validation
- `git/status.ts` - Status comparison and scope enforcement

#### Error Handling Hierarchy (src/errors.ts)

**DNA Signature**: Comprehensive error type system
```typescript
// Base class with error codes
export class WreckitError extends Error {
  constructor(message: string, public code: string) { /* ... */ }
}

// 23+ specialized error classes:
export class RepoNotFoundError extends WreckitError { /* ... */ }
export class InvalidJsonError extends WreckitError { /* ... */ }
export class PhaseFailedError extends WreckitError { /* ... */ }
export class ResearchQualityError extends WreckitError { /* ... */ }
export class BranchError extends WreckitError { /* ... */ }
// ... and 18 more
```

**Strengths**:
- Error codes enable programmatic error handling
- Phase-specific errors (PhaseFailedError, ArtifactNotCreatedError)
- Quality validation errors (ResearchQualityError, StoryQualityError)
- Git operation errors (BranchError, MergeConflictError)

**Usage Pattern**: `src/workflow/itemWorkflow.ts:427` shows errors attached to items:
```typescript
item = { ...item, last_error: error };
await saveItem(root, item);
return { success: false, item, error };
```

#### Configuration System (src/config.ts)

**Evolution**: Migration from legacy mode-based to kind-based agent config
```typescript
// src/config.ts:77-109
function migrateAgentConfig(agent: any): AgentConfigUnion {
  if ("kind" in agent) return agent;  // New format
  if ("mode" in agent) {  // Legacy format
    if (agent.mode === "sdk") {
      return { kind: "claude_sdk", model: "claude-sonnet-4-20250514", ... };
    } else {
      return { kind: "process", command: agent.command, ... };
    }
  }
  return DEFAULT_CONFIG.agent;
}
```

**Default Configuration** (`src/config.ts:48-71`):
```typescript
{
  schema_version: 1,
  base_branch: "main",
  branch_prefix: "wreckit/",
  merge_mode: "pr",  // PR mode (default) or direct mode
  agent: {
    kind: "claude_sdk",  // SDK mode is now default
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
  },
  max_iterations: 100,
  timeout_seconds: 3600,
  pr_checks: {
    commands: [],
    secret_scan: false,
    require_all_stories_done: true,
    allow_unsafe_direct_merge: false,
    allowed_remote_patterns: [],
  },
  branch_cleanup: {
    enabled: true,
    delete_remote: true,
  },
}
```

**Optional Features** (Items 033, 038):
- Skills configuration (Item 033): Phase-specific skill loading with JIT context
- Doctor configuration (Item 038): Self-healing runtime with auto-repair modes

#### MCP Server Pattern (src/agent/mcp/)

**Purpose**: Capture structured output from agents via tool calls instead of parsing JSON or text output.

**Servers**:
1. `wreckitMcpServer.ts` - Core workflow tools:
   - `save_interview_ideas` - Capture ideas from conversational interview
   - `save_parsed_ideas` - Parse ideas from piped document
   - `save_prd` - Save PRD with user stories (plan phase)
   - `update_story_status` - Mark story done (implement phase)

2. `dreamMcpServer.ts` - Dream command (autonomous ideation):
   - `save_dream_ideas` - Save generated roadmap items

3. `ideasMcpServer.ts` - Ideas command:
   - `save_structured_ideas` - Save parsed ideas

**Adapter Pattern**: `src/agent/mcp/mcporterAdapter.ts:7-45`
```typescript
export function adaptMcpServersToAxTools(
  mcpServers: Record<string, unknown>,
  allowedTools?: string[]
): AxFunction[] {
  // Converts MCP servers to Ax RLM tools
  // Enables RLM mode to use MCP servers
}
```

### Key Files

| File | Lines | Purpose | Debt/Notes |
|------|-------|---------|------------|
| `src/index.ts` | 797 | CLI entry point, command definitions | Commander.js setup, 20+ commands |
| `src/schemas.ts` | 359 | Zod schemas for all data structures | AgentConfigUnion, Item, Prd, SkillConfig |
| `src/config.ts` | 248 | Config loading with migration | migrateAgentConfig() handles legacy format |
| `src/workflow/itemWorkflow.ts` | 1638 | All phase implementations | Duplicated retry-validation pattern |
| `src/agent/dispatcher.ts` | 172 | Agent backend dispatch | Clean union-based dispatch |
| `src/agent/rlm-runner.ts` | 233 | RLM mode implementation | Prompt-as-Environment, JSRuntime |
| `src/agent/claude-sdk-runner.ts` | ~300 | Claude SDK integration | Session → Query pipelining for MCP |
| `src/git/index.ts` | 1200+ | Git operations | Could split into 4 modules |
| `src/errors.ts` | 400 | Error type hierarchy | 23+ error classes, well-structured |
| `src/domain/states.ts` | 59 | State machine definition | Synchronization burden (3 files) |
| `src/doctor.ts` | ~800 | Validation and repair | Invariant checking, auto-repair |

## Technical Considerations

### Dependencies

**Runtime**:
- `@anthropic-ai/claude-agent-sdk` ^0.2.7 - Primary SDK mode
- `@ax-llm/ax` ^16.0.11 - RLM mode (ReAct loop, JSRuntime)
- `commander` ^14.0.2 - CLI framework
- `ink` ^6.6.0 - React-based TUI
- `pino` ^10.1.1 - Structured logging
- `zod` ^4.3.5 - Schema validation

**Dev**:
- `@types/bun`, `@types/node` - Type definitions
- `prettier` ^3.8.1 - Code formatting
- `tsup` ^8.3.5 - Bundling
- `vitepress` ^1.6.4 - Documentation
- `fast-check` ^4.5.3 - Property-based testing

**External SDKs** (Experimental):
- `@openai/codex-sdk` ^0.89.0
- `@sourcegraph/amp-sdk` ^0.1.0
- `@opencode-ai/sdk` ^1.1.35

### Patterns to Follow

**From AGENTS.md**:
1. **Shared Services**: "When multiple code paths do similar things with slight variations, create a shared service with a request struct that captures the variations, rather than having each caller implement its own logic."
2. **Composition Over Inheritance**: Prefer composition patterns
3. **Small Focused Functions**: Single responsibility principle

**Observed Patterns**:
1. **Discriminated Unions**: AgentConfigUnion, WorkflowState - clean type-safe variant handling
2. **Result Objects**: `{ success: boolean, item?: Item, error?: string | WreckitError }`
3. **MCP Tool Capture**: Instead of parsing output, provide tools for agent to call
4. **File-Based State**: Everything in `.wreckit/` is git-trackable JSON/Markdown
5. **Validation Context**: Build context object, validate against it, transition state

**Anti-Patterns to Avoid**:
1. **Copy-Paste Retry Logic**: Extract to shared service
2. **Manual Synchronization**: State machine logic in 3 files
3. **God Objects**: `src/git/index.ts` at 1200+ lines
4. **Deprecated Code Accumulation**: 11 markers indicate incomplete migration

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **State Machine Desynchronization** | High - Invalid transitions, broken workflows | Single source of truth in states.ts, generate phase config from it |
| **Deprecated Code Accumulation** | Medium - Confusion, maintenance burden | Complete migration to union-based APIs, remove legacy codepaths |
| **Git Mutex Bottleneck** | Low - Serializes all git operations | Already mitigated by mutex design, consider per-repo mutex for multi-repo workflows |
| **Copy-Paste Validation Logic** | Medium - Inconsistent behavior, bugs | Extract `executePhaseWithRetry(item, phaseConfig, validators)` shared service |
| **RLM Mode Complexity** | High - New architecture, different mental model | Comprehensive documentation, example prompts, migration guide |
| **MCP Server Fragmentation** | Low - 3 separate servers with similar patterns | Consider unified wreckit MCP server with tool categories |
| **Direct Mode Safety** | Critical - Bypasses PR review | Explicit opt-in required (`allow_unsafe_direct_merge`), warnings, rollback anchors |
| **Secret Scanning False Positives** | Low - Could block legitimate work | Configurable patterns, allow-list for known-safe strings |

## Recommended Approach

### Phase 1: Consolidate State Machine (1-2 days)

**Goal**: Single source of truth for workflow state progression.

**Actions**:
1. Keep `src/domain/states.ts` as the authoritative source
2. Generate phase configuration programmatically:
   ```typescript
   // Auto-generate from WORKFLOW_STATES
   export const PHASE_CONFIG = generatePhaseConfig(WORKFLOW_STATES);
   ```
3. Update `src/commands/phase.ts` to use generated config
4. Add synchronization test: fails if states, phases, and workflow get out of sync

**Benefits**:
- Eliminates manual synchronization burden
- Single place to add/remove states
- Type-safe phase transitions

### Phase 2: Extract Phase Execution Service (2-3 days)

**Goal**: Eliminate copy-paste retry-validation pattern.

**Actions**:
1. Create `src/workflow/phaseExecutor.ts`:
   ```typescript
   interface PhaseConfig<TInput, TOutput> {
     phase: string;
     targetState: WorkflowState;
     templateName: PromptName;
     validateOutput: (output: TOutput) => ValidationResult;
     enforceScope?: (before: GitStatus) => ScopeCheck;
   }

   async function executePhaseWithRetry<T>(
     item: Item,
     config: PhaseConfig<T>,
     options: WorkflowOptions
   ): Promise<PhaseResult>
   ```
2. Refactor `runPhaseResearch`, `runPhasePlan`, `runPhaseImplement` to use service
3. Move phase-specific logic into config objects

**Benefits**:
- DRY principle, consistent behavior
- Easier to add new phases
- Testable retry/validation logic

### Phase 3: Complete SDK Migration (2-3 days)

**Goal**: Remove all deprecated APIs.

**Actions**:
1. Audit usages of `@deprecated` functions (11 markers)
2. Replace with union-based APIs
3. Remove legacy `mode` format support from `migrateAgentConfig()`
4. Update tests to use new APIs
5. Update MIGRATION.md to reflect final state

**Benefits**:
- Cleaner codebase
- Reduced confusion
- Smaller bundle size

### Phase 4: Split Git Module (1-2 days)

**Goal**: Improve organization of git operations.

**Actions**:
1. Create `src/git/branch.ts` - Branch operations (~300 lines)
2. Create `src/git/pr.ts` - PR operations (~400 lines)
3. Create `src/git/validation.ts` - Preflight, quality gates, remote validation (~300 lines)
4. Create `src/git/status.ts` - Status comparison, scope enforcement (~200 lines)
5. Keep `src/git/index.ts` as re-exports (~100 lines)

**Benefits**:
- Easier to navigate
- Clearer responsibilities
- Better testability

### Phase 5: RLM Mode Documentation (1-2 days)

**Goal**: Comprehensive guide for Prompt-as-Environment architecture.

**Actions**:
1. Add RLM section to AGENTS.md (already started at lines 148-212)
2. Create example prompts showing RunJS usage
3. Document CONTEXT_DATA access patterns
4. Migration guide: When to use RLM vs Claude SDK
5. Best practices for tool design in RLM mode

**Benefits**:
- Lower barrier to entry
- Clear use cases
- Better adoption

### Phase 6: Unify MCP Servers (Optional, 2-3 days)

**Goal**: Consolidate MCP tool definitions.

**Actions**:
1. Audit tools across 3 MCP servers
2. Design unified tool categorization:
   - Workflow tools (save_prd, update_story_status)
   - Ideas tools (save_interview_ideas, save_parsed_ideas)
   - Dream tools (save_dream_ideas)
3. Create single `wreckitMcpServer.ts` with tool categories
4. Update phase runners to use appropriate tool category

**Benefits**:
- Less code duplication
- Easier to add new tools
- Consistent tool patterns

## Open Questions

1. **RLM Mode Adoption**: What percentage of users prefer RLM mode vs Claude SDK? Should RLM become the default?
   - **Recommendation**: Gather usage metrics, survey power users

2. **Direct Mode Safety**: Is `allow_unsafe_direct_merge` sufficient safety? Should we add more guardrails?
   - **Recommendation**: Consider requiring `--dangerous-direct-mode` flag for first-time use

3. **Git Mutex Granularity**: Current mutex serializes all git operations globally. Should we use per-repo mutexes?
   - **Recommendation**: Not urgent. Current design works for multi-actor single-repo workflows.

4. **Phase 5 (Critique)**: `src/workflow/itemWorkflow.ts:926` shows auto-transition to critique after implement. Is this adversarial gate implemented?
   - **Recommendation**: Audit `runPhaseCritique` in `src/workflow/critique.ts`, verify it's called in main workflow

5. **Skills System (Item 033)**: Is the JIT context loading system working as intended? Are users defining custom skills?
   - **Recommendation**: Check for `.wreckit/skills.json` in wild, survey users

6. **Self-Healing (Item 038)**: Is the Agent Doctor successfully repairing common failures? What's the retry success rate?
   - **Recommendation**: Add metrics to track healing attempts, success/failure rates

## Appendix: File Tree (Key Modules)

```
src/
├── index.ts                          # CLI entry (797 lines)
├── schemas.ts                        # Zod schemas (359 lines)
├── config.ts                         # Config + migration (248 lines)
├── errors.ts                         # Error types (400 lines)
├── logging.ts                        # Structured logging
├── cli-utils.ts                      # Shared CLI utilities
│
├── domain/                           # State machine, items, indexing
│   ├── states.ts                     # Workflow states (59 lines)
│   ├── roadmap.ts                    # ROADMAP.md parsing
│   ├── ideas.ts                      # Ideas parsing
│   ├── indexing.ts                   # Item registry
│   ├── validation.ts                 # State transitions, quality checks
│   └── resolveId.ts                  # ID resolution
│
├── workflow/                         # Phase implementations
│   ├── itemWorkflow.ts               # All phases (1638 lines)
│   ├── critique.ts                   # Adversarial gate
│   └── index.ts
│
├── agent/                            # Agent abstraction
│   ├── dispatcher.ts                 # Union dispatch (172 lines)
│   ├── runner.ts                     # Legacy APIs (@deprecated)
│   ├── claude-sdk-runner.ts          # Claude SDK
│   ├── amp-sdk-runner.ts             # Amp SDK (experimental)
│   ├── codex-sdk-runner.ts           # Codex SDK (experimental)
│   ├── opencode-sdk-runner.ts        # OpenCode SDK (experimental)
│   ├── rlm-runner.ts                 # RLM mode (233 lines)
│   ├── process-runner.ts             # Subprocess spawning
│   ├── healingRunner.ts              # Self-healing (Item 038)
│   ├── skillLoader.ts                # Skill loading (Item 033)
│   ├── contextBuilder.ts             # JIT context
│   ├── toolAllowlist.ts              # Phase-specific tools
│   ├── lifecycle.ts                  # SDK abort controllers
│   ├── env.ts                        # AI provider env resolution
│   ├── types.ts                      # Agent types
│   ├── result.ts                     # Agent result type
│   ├── errorDetector.ts              # Error pattern detection
│   ├── mcp/                          # MCP servers
│   │   ├── wreckitMcpServer.ts       # Core workflow tools
│   │   ├── dreamMcpServer.ts         # Dream command
│   │   ├── ideasMcpServer.ts         # Ideas command
│   │   └── mcporterAdapter.ts        # MCP → Ax adapter
│   └── index.ts
│
├── commands/                         # CLI commands
│   ├── ideas.ts                      # Ideas ingestion
│   ├── status.ts                     # List items
│   ├── show.ts                       # Show item details
│   ├── phase.ts                      # Phase commands (debug)
│   ├── run.ts                        # Run single item
│   ├── orchestrator.ts               # Batch orchestration
│   ├── doctor.ts                     # Validation + repair
│   ├── init.ts                       # Initialize .wreckit/
│   ├── rollback.ts                   # Rollback direct merges
│   ├── strategy.ts                   # Generate ROADMAP.md
│   ├── dream.ts                      # Autonomous ideation
│   ├── learn.ts                      # Extract skills
│   └── index.ts
│
├── git/                              # Git operations
│   ├── index.ts                      # All git ops (1200+ lines) ⚠️
│   ├── quality.ts                    # Quality gates, secret scan
│   └── lock.ts                       # File locking
│
├── fs/                               # File system utilities
│   ├── paths.ts                      # Path resolution
│   ├── json.ts                       # JSON read/write
│   ├── atomic.ts                     # Atomic writes
│   ├── backup.ts                     # Backups (doctor --fix)
│   ├── lock.ts                       # File locking
│   ├── util.ts                       # File utilities
│   └── index.ts
│
├── tui/                              # Terminal UI
│   ├── dashboard.ts                  # TUI main
│   ├── runner.ts                     # TUI runner
│   ├── components/                   # React components
│   ├── agentEvents.ts                # Event streaming
│   └── colors.ts
│
├── views/                            # View adapters
│   ├── ViewAdapter.ts
│   └── TuiViewAdapter.ts
│
├── doctor.ts                         # Doctor command
├── onboarding.ts                     # First-run setup
├── prompts.ts                        # Prompt templates
├── prompts/                          # Bundled prompts
│   ├── research.md
│   ├── plan.md
│   ├── implement.md
│   ├── ideas.md
│   ├── pr.md
│   ├── strategy.md
│   ├── learn.md
│   ├── dream.md
│   ├── interview.md
│   ├── critique.md
│   └── media.md
│
└── __tests__/                        # Test suites
    ├── commands/
    ├── agent/
    ├── domain/
    ├── git/
    ├── edge-cases/
    └── integration/
```

---

**Conclusion**: Wreckit is a mature, well-architected codebase with clear evolutionary layers. The primary technical debt stems from incomplete migration (deprecated code) and copy-paste patterns (retry-validation logic). The RLM architecture represents a significant innovation in prompt engineering, solving context window limitations through programmatic inspection. Consolidating the state machine, extracting shared services, and completing the SDK migration would significantly improve maintainability.
