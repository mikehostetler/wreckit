# Implement 'wreckit strategy' command (Strategy Layer) Implementation Plan

## Implementation Plan Title
Implement 'wreckit strategy' command (Strategy Layer)

## Overview
This implementation introduces a new "Strategy Layer" above the existing wreckit workflow to prevent "Feature Factory" anti-patterns. The strategy layer establishes a **Hierarchical Control Loop: Strategy -> Plan -> Implement**, ensuring development work aligns with high-value strategic milestones rather than ad-hoc feature requests.

The implementation consists of two new CLI commands:
1. **`wreckit strategy`** - Analyzes the codebase (src/, specs/, benchmark_results.md) and produces/updates ROADMAP.md
2. **`wreckit execute-roadmap`** - Converts active ROADMAP milestones into wreckit Items

## Current State
The wreckit CLI has a mature command structure in `src/index.ts:23-554` using Commander.js. Commands follow a consistent pattern:
1. Register with `.command()` and `.action()` handler
2. Call `executeCommand()` wrapper for error handling
3. Delegate to a dedicated module in `src/commands/`

The agent execution infrastructure in `src/agent/runner.ts:348-494` supports multiple backends (claude_sdk, process, amp_sdk, etc.) via discriminated union config. Each workflow phase uses prompt templates from `src/prompts/` with variable substitution.

Tool restrictions are enforced per-phase via `src/agent/toolAllowlist.ts:56-107`, which defines which tools agents can use (Read, Write, Glob, Grep, Bash, MCP tools).

### Key Discoveries:
- `src/commands/ideas.ts:88-176` - Model for agent-driven command with MCP capture
- `src/workflow/itemWorkflow.ts:173-315` - Research phase pattern (read-only agent)
- `src/prompts.ts:6` - PromptName type needs extension for "strategy"
- `src/agent/toolAllowlist.ts:56-107` - Phase tool allowlists to extend
- `src/domain/ideas.ts:266-297` - `persistItems()` for creating items
- `src/fs/paths.ts:44-90` - Path helpers (need to add `getRoadmapPath`)

## Desired End State
After implementation:

1. **`wreckit strategy`** command that:
   - Reads src/, specs/, and benchmark_results.md (when available)
   - Runs an agent with read-only tools + Write (for ROADMAP.md only)
   - Creates/updates ROADMAP.md at repository root
   - Validates ROADMAP.md format

2. **`wreckit execute-roadmap`** command that:
   - Parses ROADMAP.md
   - Extracts unchecked objectives from "Active Milestones"
   - Converts objectives to ParsedIdea format
   - Creates wreckit Items using existing `persistItems()`
   - Deduplicates against existing items by slug

3. **Verification:**
   - `wreckit strategy --dry-run` shows what would be analyzed
   - `wreckit strategy` creates valid ROADMAP.md
   - `wreckit execute-roadmap --dry-run` shows items that would be created
   - `wreckit execute-roadmap` creates items from active milestones
   - Items flow through normal workflow: research -> plan -> implement -> PR

## What We're NOT Doing
1. **NOT modifying existing workflow phases** - Strategy is a new layer above, not integrated into the existing idea -> done flow
2. **NOT adding milestone tracking to items** - No `milestone_id` field on Item schema initially (can be added later)
3. **NOT implementing strategy phase as a workflow state** - Strategy operates outside item workflow
4. **NOT implementing automatic strategy refresh** - Manual `wreckit strategy` invocation only
5. **NOT adding specs/** directory analysis by default - Config option only (default: src/ only)
6. **NOT blocking on missing benchmark_results.md** - Graceful degradation

## Implementation Approach
The implementation follows existing patterns closely:

1. **Phase 1: Core Infrastructure** - Create roadmap domain module, strategy prompt, tool allowlist
2. **Phase 2: Strategy Command** - Implement `wreckit strategy` command with agent execution
3. **Phase 3: Execute-Roadmap Command** - Implement `wreckit execute-roadmap` for milestone-to-item conversion
4. **Phase 4: Testing & Integration** - Add tests, update CLI exports

---

## Phases

### Phase 1: Core Infrastructure

#### Overview
Create the foundational modules for roadmap parsing/serialization, strategy prompt template, and tool allowlist configuration.

#### Changes Required:

##### 1. Roadmap Domain Module
**File**: `src/domain/roadmap.ts`
**Changes**: Create new module for ROADMAP.md parsing and serialization

```typescript
// Types for Roadmap structure
export interface RoadmapObjective {
  text: string;
  completed: boolean;
}

export interface RoadmapMilestone {
  id: string;
  title: string;
  status: "in-progress" | "planned" | "done";
  target?: string;
  strategicGoal?: string;
  objectives: RoadmapObjective[];
}

export interface Roadmap {
  activeMilestones: RoadmapMilestone[];
  backlog: RoadmapMilestone[];
  completed: RoadmapMilestone[];
}

// Parser function
export function parseRoadmap(content: string): Roadmap;

// Serializer function
export function serializeRoadmap(roadmap: Roadmap): string;

// Validation function
export function validateRoadmap(content: string): { valid: boolean; errors: string[] };

// Extract pending objectives from active milestones
export function extractPendingObjectives(roadmap: Roadmap): Array<{
  milestoneId: string;
  milestoneTitle: string;
  objective: string;
}>;
```

##### 2. Strategy Prompt Template
**File**: `src/prompts/strategy.md`
**Changes**: Create new prompt template for strategic analysis

The prompt will instruct the agent to:
- Analyze src/ directory structure and codebase health
- Review specs/ for existing specifications
- Analyze benchmark_results.md for performance data
- Produce ROADMAP.md following the defined format

##### 3. Tool Allowlist for Strategy Phase
**File**: `src/agent/toolAllowlist.ts`
**Changes**: Add strategy phase configuration

```typescript
// Add to PHASE_TOOL_ALLOWLISTS
strategy: [
  AVAILABLE_TOOLS.Read,
  AVAILABLE_TOOLS.Write,  // For ROADMAP.md only - enforced by git status check
  AVAILABLE_TOOLS.Glob,
  AVAILABLE_TOOLS.Grep,
],
```

##### 4. Prompt Types Extension
**File**: `src/prompts.ts`
**Changes**: Add "strategy" to PromptName type

```typescript
export type PromptName = "research" | "plan" | "implement" | "ideas" | "pr" | "strategy";
```

##### 5. Path Helper for Roadmap
**File**: `src/fs/paths.ts`
**Changes**: Add function to get ROADMAP.md path

```typescript
export function getRoadmapPath(root: string): string {
  return path.join(root, "ROADMAP.md");
}
```

#### Success Criteria:

##### Automated Verification:
- [ ] Type checking passes: `bun run typecheck`
- [ ] Linting passes: `bun run lint`
- [ ] Build succeeds: `bun run build`

##### Manual Verification:
- [ ] `src/domain/roadmap.ts` exports all required functions
- [ ] `src/prompts/strategy.md` exists and contains proper template structure
- [ ] `src/agent/toolAllowlist.ts` includes strategy phase
- [ ] Types compile without errors

---

### Phase 2: Strategy Command Implementation

#### Overview
Implement the `wreckit strategy` CLI command that runs an agent to analyze the codebase and generate ROADMAP.md.

#### Changes Required:

##### 1. Strategy Command Module
**File**: `src/commands/strategy.ts`
**Changes**: Create new command implementation

```typescript
export interface StrategyOptions {
  force?: boolean;
  dryRun?: boolean;
  cwd?: string;
  verbose?: boolean;
  analyzeDirs?: string[];  // Default: ["src"]
}

export async function strategyCommand(
  options: StrategyOptions,
  logger: Logger
): Promise<void>;
```

The implementation will:
1. Find repo root using `findRootFromOptions()`
2. Load config with `loadConfig()`
3. Check for existing ROADMAP.md (skip if exists unless --force)
4. Capture git status before agent run
5. Load strategy prompt template
6. Run agent with read + write tools
7. Validate agent only wrote to ROADMAP.md
8. Validate ROADMAP.md format

##### 2. CLI Registration
**File**: `src/index.ts`
**Changes**: Register the strategy command

```typescript
import { strategyCommand } from "./commands/strategy";

program
  .command("strategy")
  .description("Analyze codebase and generate/update ROADMAP.md")
  .option("--force", "Regenerate ROADMAP.md even if it exists")
  .option("--analyze-dirs <dirs...>", "Directories to analyze (default: src)")
  .action(async (options, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    await executeCommand(
      async () => {
        await strategyCommand(
          {
            force: options.force,
            dryRun: globalOpts.dryRun,
            cwd: resolveCwd(globalOpts.cwd),
            verbose: globalOpts.verbose,
            analyzeDirs: options.analyzeDirs,
          },
          logger
        );
      },
      logger,
      {
        verbose: globalOpts.verbose,
        quiet: globalOpts.quiet,
        dryRun: globalOpts.dryRun,
        cwd: resolveCwd(globalOpts.cwd),
      }
    );
  });
```

##### 3. Commands Index Export
**File**: `src/commands/index.ts`
**Changes**: Export strategy command

```typescript
export { strategyCommand, type StrategyOptions } from "./strategy";
```

#### Success Criteria:

##### Automated Verification:
- [ ] Type checking passes: `bun run typecheck`
- [ ] Linting passes: `bun run lint`
- [ ] Build succeeds: `bun run build`

##### Manual Verification:
- [ ] `wreckit strategy --help` shows command help
- [ ] `wreckit strategy --dry-run` shows what would be done
- [ ] Agent runs with correct tool restrictions
- [ ] ROADMAP.md is created at repository root

---

### Phase 3: Execute-Roadmap Command Implementation

#### Overview
Implement the `wreckit execute-roadmap` command that converts ROADMAP.md milestones into wreckit Items.

#### Changes Required:

##### 1. Execute-Roadmap Command Module
**File**: `src/commands/execute-roadmap.ts`
**Changes**: Create new command implementation

```typescript
export interface ExecuteRoadmapOptions {
  dryRun?: boolean;
  cwd?: string;
  verbose?: boolean;
  includeDone?: boolean;  // Include completed objectives (default: false)
}

export async function executeRoadmapCommand(
  options: ExecuteRoadmapOptions,
  logger: Logger
): Promise<void>;
```

The implementation will:
1. Find repo root using `findRootFromOptions()`
2. Read ROADMAP.md from repo root
3. Parse with `parseRoadmap()`
4. Extract pending objectives from active milestones
5. Convert to ParsedIdea format
6. Use `persistItems()` to create items (handles deduplication)
7. Report created/skipped items

##### 2. CLI Registration
**File**: `src/index.ts`
**Changes**: Register the execute-roadmap command

```typescript
import { executeRoadmapCommand } from "./commands/execute-roadmap";

program
  .command("execute-roadmap")
  .description("Convert active ROADMAP milestones into wreckit Items")
  .option("--include-done", "Include completed objectives")
  .action(async (options, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    await executeCommand(
      async () => {
        await executeRoadmapCommand(
          {
            dryRun: globalOpts.dryRun,
            cwd: resolveCwd(globalOpts.cwd),
            verbose: globalOpts.verbose,
            includeDone: options.includeDone,
          },
          logger
        );
      },
      logger,
      {
        verbose: globalOpts.verbose,
        quiet: globalOpts.quiet,
        dryRun: globalOpts.dryRun,
        cwd: resolveCwd(globalOpts.cwd),
      }
    );
  });
```

##### 3. Commands Index Export
**File**: `src/commands/index.ts`
**Changes**: Export execute-roadmap command

```typescript
export { executeRoadmapCommand, type ExecuteRoadmapOptions } from "./execute-roadmap";
```

#### Success Criteria:

##### Automated Verification:
- [ ] Type checking passes: `bun run typecheck`
- [ ] Linting passes: `bun run lint`
- [ ] Build succeeds: `bun run build`

##### Manual Verification:
- [ ] `wreckit execute-roadmap --help` shows command help
- [ ] `wreckit execute-roadmap --dry-run` shows what items would be created
- [ ] Items are created in `.wreckit/items/` with correct IDs
- [ ] Existing items with matching slugs are skipped (idempotent)

---

### Phase 4: Testing & Integration

#### Overview
Add comprehensive tests for all new modules and verify end-to-end workflow.

#### Changes Required:

##### 1. Roadmap Domain Tests
**File**: `src/__tests__/domain/roadmap.test.ts`
**Changes**: Create tests for roadmap parsing/serialization

Test cases:
- Parse valid ROADMAP.md with all sections
- Parse ROADMAP.md with only active milestones
- Handle empty ROADMAP.md gracefully
- Serialize roundtrip (parse -> serialize -> parse)
- Extract only pending objectives
- Handle malformed markdown gracefully

##### 2. Strategy Command Tests
**File**: `src/__tests__/commands/strategy.test.ts`
**Changes**: Create tests for strategy command

Test cases:
- Dry-run mode doesn't create files
- Skips when ROADMAP.md exists (without --force)
- Creates ROADMAP.md with --force
- Handles missing specs/ and benchmark_results.md gracefully
- Validates ROADMAP.md format after creation

##### 3. Execute-Roadmap Command Tests
**File**: `src/__tests__/commands/execute-roadmap.test.ts`
**Changes**: Create tests for execute-roadmap command

Test cases:
- Creates items from pending objectives
- Skips completed objectives (without --include-done)
- Includes completed objectives with --include-done
- Dry-run mode shows what would be created
- Deduplicates against existing items
- Handles missing ROADMAP.md with error

##### 4. Prompt Template Test
**File**: `src/__tests__/prompts.test.ts`
**Changes**: Add test for strategy prompt loading

Test case:
- `loadPromptTemplate("strategy")` returns valid template

#### Success Criteria:

##### Automated Verification:
- [ ] All tests pass: `bun test`
- [ ] Type checking passes: `bun run typecheck`
- [ ] Linting passes: `bun run lint`
- [ ] Build succeeds: `bun run build`

##### Manual Verification:
- [ ] End-to-end workflow: `wreckit strategy && wreckit execute-roadmap && wreckit status`
- [ ] Items created from milestones appear in status
- [ ] Items can proceed through normal workflow

---

## Testing Strategy

### Unit Tests:
- Roadmap parsing with various input formats
- Roadmap serialization roundtrip
- Objective extraction logic
- Slug generation for milestone objectives

### Integration Tests:
- Strategy command creates valid ROADMAP.md
- Execute-roadmap creates items in filesystem
- Idempotent behavior (re-running doesn't duplicate)

### Manual Testing Steps:
1. Initialize a test repo: `wreckit init`
2. Run strategy: `wreckit strategy`
3. Verify ROADMAP.md created at repo root
4. Run execute-roadmap: `wreckit execute-roadmap`
5. Verify items created: `wreckit status`
6. Run workflow on item: `wreckit research <id>`
7. Verify normal workflow continues

## Migration Notes
No migration needed - this is a new feature addition that doesn't modify existing data structures or workflows.

## References
- Research: `.wreckit/items/008-implement-wreckit-strategy-command-strategy-layer/research.md`
- CLI Pattern: `src/index.ts:98-124`
- Command Module Pattern: `src/commands/ideas.ts:88-176`
- Workflow Pattern: `src/workflow/itemWorkflow.ts:173-315`
- Tool Allowlist: `src/agent/toolAllowlist.ts:56-107`
- Item Persistence: `src/domain/ideas.ts:266-297`