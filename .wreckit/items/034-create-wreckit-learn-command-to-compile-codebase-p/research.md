# Research: Create `wreckit learn` command to compile codebase patterns into reusable Skill artifacts

**Date**: 2025-01-25
**Item**: 034-create-wreckit-learn-command-to-compile-codebase-p

## Research Question
From milestone [M4] Recursive Evolution & Skill-Based Media Layer

**Motivation:** Strategic milestone: Recursive Evolution & Skill-Based Media Layer

## Summary

This research investigates creating a `wreckit learn` command that analyzes a codebase to extract and compile reusable patterns into Skill artifacts (stored in `.wreckit/skills.json`). The command enables the "Recursive Evolution" aspect of M4 by allowing the system to learn from its own implementations and create reusable skills that can be loaded for future items.

Based on comprehensive codebase analysis, Wreckit now has:

1. **Skill loading infrastructure** (Item 033 - completed): `src/agent/skillLoader.ts:59-144` implements `loadSkillsForPhase()` which loads phase-specific skills, merges tool allowlists (intersection of phase tools ∩ skill tools), aggregates MCP servers, and collects JIT context requirements
2. **JIT context builder**: `src/agent/contextBuilder.ts:51-132` implements `buildJitContext()` which loads files, git status, item metadata, and phase artifacts based on skill requirements
3. **Skill schema**: `SkillConfigSchema` in `src/schemas.ts:82-123` defines the structure with `phase_skills` mapping (phase → skill IDs) and `skills` array (with id, name, description, tools, mcp_servers, required_context)
4. **Default skills**: `.wreckit/skills.json` provides example skills like `code-exploration`, `context-awareness`, `documentation-writer`, `full-capability`, `git-integration`, `verification`
5. **Strategy command pattern**: `src/commands/strategy.ts:35-143` provides a nearly identical template for an agent-based analysis command that produces a single output file with git status enforcement

The proposed `wreckit learn` command would automate the discovery and extraction of patterns from completed work (research.md, plan.md, implemented code) and compile them into reusable skill definitions. This enables:
- **Recursive learning**: The system improves its own capabilities by learning from what it builds
- **Pattern reuse**: Successful implementation patterns can be packaged as skills for similar future tasks
- **Milestone M4 foundation**: Provides the skill artifacts needed for media layer integration (Item 035 will add Manim/Remotion skills, Item 036 will use them for summarize command)

## Current State Analysis

### Existing Implementation

**Skill System Architecture (Item 033 - Completed):**

The skill loading system (`src/agent/skillLoader.ts:59-144`) provides the foundation:

```typescript
export function loadSkillsForPhase(
  phase: string,
  skillConfig: SkillConfig | undefined
): SkillLoadResult {
  // 1. Get skill IDs for this phase from phase_skills mapping
  // 2. Resolve skill definitions from skill library
  // 3. Merge skill tools (union of all skill tools)
  // 4. Calculate allowed tools: intersection of phase tools and skill tools
  // 5. Aggregate MCP servers from all skills
  // 6. Collect context requirements from all skills
  return {
    allowedTools,      // Intersection: phase ∩ skills
    mcpServers,        // Union: all skill MCPs
    contextRequirements, // All skill context requirements
    loadedSkillIds     // Successfully loaded skill IDs
  };
}
```

**JIT Context Builder** (`src/agent/contextBuilder.ts:51-132`):

Skills can specify context requirements that are automatically loaded:

```typescript
export async function buildJitContext(
  contextRequirements: SkillContextRequirement[],
  item: Item,
  config: ConfigResolved,
  root: string
): Promise<BuiltContext> {
  // Supports:
  // - type="file": reads file at path
  // - type="git_status": runs git status
  // - type="item_metadata": serializes item metadata
  // - type="phase_artifact": loads research.md, plan.md, prd.json
}
```

**Skill Configuration Schema** (`src/schemas.ts:82-123`):

```typescript
export const SkillConfigSchema = z.object({
  phase_skills: z.record(z.string(), z.array(z.string())), // phase -> skill IDs
  skills: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    tools: z.array(z.string()),
    mcp_servers: z.record(z.string(), z.any()).optional(),
    required_context: z.array(SkillContextRequirementSchema).optional(),
  }))
});
```

**Default Skills** (`.wreckit/skills.json`):

Example skills demonstrate the pattern:
- `code-exploration`: Read-only analysis with Read, Glob, Grep tools, requires git_status and item_metadata context
- `documentation-writer`: Creates plans with Read, Write, Edit, Glob, Grep tools, requires research.md artifact
- `full-capability`: Implementation with all tools plus update_story_status MCP tool, requires plan.md and prd.json artifacts
- `git-integration`: Git operations with Read, Glob, Grep, Bash tools, requires git_status context

**Strategy Command Template** (`src/commands/strategy.ts:35-143`):

This command is nearly identical to what we need for `wreckit learn`:
- Runs an agent with Read + Write + Glob + Grep tools
- Analyzes codebase (src/ directory by default, configurable via --analyze-dirs)
- Produces a single output file (ROADMAP.md) with git status enforcement
- Validates output format with schema validation
- Enforces read-only/design-only behavior via git status comparison
- Supports --force flag to regenerate existing output
- Supports --dry-run flag for preview

**Command Pattern** (`src/index.ts:104-130`):

Commands follow a consistent pattern using Commander.js:
```typescript
program
  .command("ideas")
  .description("Ingest ideas from stdin, file, or interactive interview")
  .option("-f, --file <path>", "Read ideas from file instead of stdin")
  .action(async (options, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    await executeCommand(
      async () => {
        await ideasCommand(
          {
            file: options.file,
            dryRun: globalOpts.dryRun,
            cwd: resolveCwd(globalOpts.cwd),
            verbose: globalOpts.verbose,
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

**M4 Campaign Structure**:

Item dependencies form a clear chain (visible in `item.json:15-18` for each M4 item):
- **Item 033** (done): Phase-specific skill loading - foundational infrastructure
- **Item 034** (this item): `wreckit learn` command - extracts patterns into skills
- **Item 035**: Media layer integration - Manim/Remotion skill definitions
- **Item 036**: `wreckit summarize` command - uses media skills

All M4 items have `campaign: "M4"` field in `item.json`.

### Key Files

**Core Skill System:**
- `src/schemas.ts:82-123` - SkillConfigSchema, SkillSchema, SkillContextRequirementSchema
- `src/agent/skillLoader.ts:59-144` - loadSkillsForPhase() function with tool intersection logic
- `src/agent/contextBuilder.ts:51-132` - buildJitContext() and formatContextForPrompt()
- `src/config.ts:140` - ConfigResolved includes optional skills field
- `.wreckit/skills.json` - Default skill definitions

**Command Infrastructure:**
- `src/index.ts:104-622` - CLI command definitions and routing
- `src/commands/strategy.ts:35-143` - **Primary template** for learn command (agent-based analysis with git status enforcement)
- `src/commands/ideas.ts` - Ideas ingestion command (pattern reference for --item flag)
- `src/commands/list.ts:26-73` - List command with filtering (useful for item selection)
- `src/commands/show.ts:51-122` - Shows item details including artifacts

**Agent Runtime:**
- `src/agent/runner.ts:348-494` - runAgentUnion() with allowedTools and mcpServers parameters
- `src/agent/toolAllowlist.ts:57-117` - PHASE_TOOL_ALLOWLISTS for phase permissions (needs "learn" phase added)
- `src/workflow/itemWorkflow.ts:100-150` - Phase execution with skill loading integration

**Domain and Validation:**
- `src/domain/indexing.ts` - scanItems() for listing all items
- `src/domain/resolveId.ts` - Three-tier ID resolution (exact → numeric prefix → slug suffix) for --item flag
- `src/fs/paths.ts` - Path helpers for .wreckit/ structure (needs getSkillsPath() added)
- `src/fs/atomic.ts:14-39` - safeWriteJson() for atomic file writes
- `src/prompts.ts:55-95` - Prompt variable rendering (needs "learn" added to PromptName type)

**Documentation:**
- `docs/skills.md` - Complete skills documentation
- `AGENTS.md:1-217` - Agent guidelines and MCP patterns
- `.wreckit/items/033-implement-phase-specific-skill-loading-jit-context/research.md` - Item 033 research (dependency)
- `.wreckit/items/033-implement-phase-specific-skill-loading-jit-context/plan.md` - Item 033 implementation plan

## Technical Considerations

### Dependencies

**Internal Dependencies:**
- `src/agent/skillLoader.ts` - loadSkillsForPhase() for testing loaded skills
- `src/agent/contextBuilder.ts` - buildJitContext() for context requirements
- `src/schemas.ts` - SkillConfigSchema for validation
- `src/agent/runner.ts` - runAgentUnion() for agent-based pattern extraction
- `src/commands/strategy.ts` - **Primary template** for learn command structure
- `src/domain/resolveId.ts` - For --item flag to target specific items
- `src/domain/indexing.ts` - For scanItems() to list all items
- `src/fs/paths.ts` - For accessing .wreckit/items/ directories
- `src/fs/atomic.ts` - For safeWriteJson() to prevent corruption
- `src/prompts.ts` - For creating learn-specific prompt template
- `src/agent/toolAllowlist.ts` - For adding "learn" phase with Read + Write + Glob + Grep tools

**External Dependencies:**
- `commander` (^14.0.2) - CLI command framework (already in package.json:59)
- `zod` (^4.3.5) - Schema validation (already in package.json:64)
- `@anthropic-ai/claude-agent-sdk` (^0.2.7) - Agent SDK (already in package.json:53)

### Patterns to Follow

**1. Command Structure** (from `src/index.ts:104-130`):
- Use Commander.js for CLI definition
- Extract global options with `cmd.optsWithGlobals()`
- Wrap execution in `executeCommand()` for error handling and logging
- Support `--dry-run`, `--verbose`, `--cwd` options consistently
- Pass specific options object to command function

**2. Agent-Based Analysis** (from `src/commands/strategy.ts:35-143`):
- Load phase-specific prompt template with `loadPromptTemplate(root, "learn")`
- Build prompt variables with item context and completion_signal
- Capture git status before agent run for enforcement
- Run agent with tool restrictions via `getAllowedToolsForPhase("learn")`
- Verify expected outputs created (skills.json)
- Validate output format with Zod schema
- Enforce git status boundaries (only skills.json should be modified)

**3. Output File Management** (from `.wreckit/skills.json`):
- Maintain SkillConfigSchema structure with phase_skills and skills fields
- Use phase_skills mapping for phase→skill IDs (e.g., "research": ["code-exploration"])
- Define skills array with tool lists and context requirements
- Support optional MCP servers (usually empty for basic skills)
- Support required_context array for JIT loading

**4. File System Operations** (from `src/fs/`):
- Use atomic writes for JSON files (`safeWriteJson()` from `src/fs/atomic.ts`)
- Use path helpers for .wreckit/ structure (`getSkillsPath()` to be added)
- Use error-aware file checks (`pathExists()` from `src/fs/util.ts`)
- Handle ENOENT errors gracefully for missing skills.json

**5. Logging and User Feedback** (from all commands):
- Use `logger.info()` for progress updates (e.g., "Running pattern extraction...")
- Use `logger.warn()` for non-critical issues (e.g., tool permission violations)
- Use `logger.error()` for failures
- Support `--verbose` for detailed logs (item counts, skill IDs, file paths)

**6. Item Selection Pattern** (from `src/domain/resolveId.ts`):
- Three-tier resolution: exact match → numeric prefix (e.g., "33" → "033-*") → slug suffix
- Use `scanItems()` to get all items, then filter by state or sort by updated_at
- Handle missing items gracefully with error messages

**7. Merge Strategy Pattern** (from skill loading logic):
- Append: Merge phase_skills (keep existing, add new), merge skills by ID (keep existing, add new)
- Replace: Overwrite entire skills.json
- Ask: Interactive prompting (not yet implemented, can defer)

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Agent extracts poor-quality patterns** | High | Validate against SkillConfigSchema before writing. Support --review flag for manual approval. Include example usage in skill description. Document that manual editing may be needed. |
| **Skills conflict with existing .wreckit/skills.json** | Medium | Implement merge strategy that preserves existing skills but adds new ones (append by default). Use --merge=replace to overwrite. Support --output to write to alternative path. |
| **Tool permissions violated** | High | Validate extracted skill tools against phase tool allowlists (PHASE_TOOL_ALLOWLISTS). Enforce security intersection (skills ∩ phase = final_allowlist). Warn if skill requests tools not allowed in phase via validateSkillTools(). |
| **Agent fails to create valid skills.json** | High | Schema validation with SkillConfigSchema.safeParse(). Clear error messages on validation failure. Retry loop (up to 3 attempts) with feedback like research phase. |
| **Circular dependencies in skill learning** | Low | Document that learn command should not create skills that reference itself. Add validation to detect self-referential skills (skill.id in required_context). |
| **Context requirements point to non-existent files** | Medium | Validate all context requirement paths during extraction. Warn about missing files but continue (graceful degradation). Use conditional context loading pattern from contextBuilder.ts. |
| **M4 milestone coupling** | Medium | Design skill extraction to be extensible beyond M4 media skills. Support custom skill types via template system. Document extensibility points for future skill types. |
| **Overwhelming number of extracted skills** | Low | Default to extracting from last 5 completed items (not all). Support --all flag for full extraction. Agent should cluster similar patterns into focused skills. |
| **Backward compatibility** | High | Ensure command works without .wreckit/skills.json (creates new file). Support existing .wreckit/skills.json (merge strategy). Validate SkillConfigSchema before writing. No breaking changes to existing workflow. |
| **Git status enforcement complexity** | Medium | Strategy command has similar enforcement (only ROADMAP.md). Adapt pattern: only skills.json should be modified. Use compareGitStatus() with allowedPaths pattern. |

## Recommended Approach

Based on research findings, implement `wreckit learn` command in 4 incremental phases:

### Phase 1: Core Command Infrastructure

**1.1 Add Learn Phase to Tool Allowlists** (`src/agent/toolAllowlist.ts:117`):

```typescript
export const PHASE_TOOL_ALLOWLISTS: Record<string, ToolName[] | undefined> = {
  // ... existing phases ...

  // Strategy phase: Read + Write for codebase analysis and ROADMAP.md creation
  strategy: [/* ... */],

  // Learn phase: Read + Write + Glob + Grep for pattern extraction and skills.json creation
  learn: [
    AVAILABLE_TOOLS.Read,
    AVAILABLE_TOOLS.Write,
    AVAILABLE_TOOLS.Glob,
    AVAILABLE_TOOLS.Grep,
  ],
} as const;
```

**1.2 Add Skills Path Helper** (`src/fs/paths.ts:98`):

```typescript
export function getRoadmapPath(root: string): string {
  return path.join(root, "ROADMAP.md");
}

export function getSkillsPath(root: string): string {
  return path.join(getWreckitDir(root), "skills.json");
}
```

**1.3 Add "learn" to PromptName Type** (`src/prompts.ts:6`):

```typescript
export type PromptName = "research" | "plan" | "implement" | "ideas" | "pr" | "strategy" | "learn";
```

**1.4 Create Learn Command Module** (`src/commands/learn.ts` - new file):

Following the strategy.ts pattern:
- Import dependencies (fs, path, schemas, config, prompts, agent runner, tool allowlist)
- Define LearnOptions interface with patterns, item, phase, all, output, merge, review, dryRun, cwd, verbose
- Implement learnCommand() function
  - Find root and load config
  - Determine output path (default: getSkillsPath(root))
  - Handle dry-run mode with preview
  - Build prompt variables (id, title, section, overview, item_path, branch_name, base_branch, completion_signal, output_path, merge_strategy)
  - Load learn prompt template
  - Capture git status before agent run
  - Run agent with learn phase tools (Read + Write + Glob + Grep)
  - Verify skills.json was created
  - Validate skills.json format with SkillConfigSchema
  - Log success

**1.5 Add CLI Command Definition** (`src/index.ts:622`):

```typescript
import { learnCommand, type LearnOptions } from "./commands/learn";

program
  .command("learn [patterns...]")
  .description("Extract and compile codebase patterns into reusable Skill artifacts")
  .option("--item <id>", "Extract patterns from specific item")
  .option("--phase <state>", "Extract patterns from items in specific phase state")
  .option("--all", "Extract patterns from all completed items")
  .option("--output <path>", "Output path for skills.json (default: .wreckit/skills.json)")
  .option("--merge <strategy>", "Merge strategy: append|replace|ask (default: append)")
  .option("--review", "Review extracted skills before saving")
  .action(async (patterns, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    await executeCommand(
      async () => {
        await learnCommand(
          {
            patterns: patterns.length > 0 ? patterns : undefined,
            item: cmd.opts().item,
            phase: cmd.opts().phase,
            all: cmd.opts().all,
            output: cmd.opts().output,
            merge: cmd.opts().merge,
            review: cmd.opts().review,
            dryRun: globalOpts.dryRun,
            cwd: resolveCwd(globalOpts.cwd),
            verbose: globalOpts.verbose,
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

### Phase 2: Source Item Selection and Skills Loading

**2.1 Add Item Selection Utilities** (`src/commands/learn.ts`):

```typescript
import { scanItems } from "../domain/indexing";
import { resolveId } from "../domain/resolveId";
import { readItem, getItemDir } from "../fs";

async function determineSourceItems(
  root: string,
  options: LearnOptions,
  logger: Logger
): Promise<{ items: any[]; context: string }> {
  const allItems = await scanItems(root);

  // --item <id>: Extract from specific item
  if (options.item) {
    const resolvedId = await resolveId(root, options.item);
    const itemDir = getItemDir(root, resolvedId);
    const item = await readItem(itemDir);
    logger.info(`Extracting patterns from item: ${resolvedId}`);
    const context = `Source item: ${item.id} - ${item.title}\nState: ${item.state}`;
    return { items: [item], context };
  }

  // --phase <state>: Extract from items in specific state
  if (options.phase) {
    const filteredItems = allItems.filter(i => i.state === options.phase);
    logger.info(`Extracting patterns from ${filteredItems.length} items in state: ${options.phase}`);
    const context = `Source items: ${filteredItems.length} items in state '${options.phase}'`;
    return { items: filteredItems, context };
  }

  // --all: Extract from all completed items
  if (options.all) {
    const completedItems = allItems.filter(i => i.state === "done");
    logger.info(`Extracting patterns from ${completedItems.length} completed items`);
    const context = `Source items: ${completedItems.length} completed items`;
    return { items: completedItems, context };
  }

  // Default: extract from most recent 5 completed items
  const completedItems = allItems
    .filter(i => i.state === "done")
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  const recentItems = completedItems.slice(0, 5);
  logger.info(`Extracting patterns from ${recentItems.length} recent completed items (default)`);
  const context = `Source items: ${recentItems.length} recent completed items`;
  return { items: recentItems, context };
}
```

**2.2 Add Skills Loading** (`src/commands/learn.ts`):

```typescript
async function loadExistingSkills(root: string): Promise<SkillConfig | null> {
  const skillsPath = getSkillsPath(root);
  try {
    const content = await fs.readFile(skillsPath, "utf-8");
    const result = SkillConfigSchema.safeParse(JSON.parse(content));
    if (result.success) {
      return result.data;
    } else {
      throw new Error(`Invalid skills.json: ${result.error.message}`);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;  // No existing skills.json
    }
    throw err;
  }
}
```

**2.3 Update Command to Use Selection Logic** (`src/commands/learn.ts`):

Modify learnCommand() to:
- Call determineSourceItems() to get source items and context
- Call loadExistingSkills() to get existing skills
- Update prompt variables with source_items_context and existing_skills_context
- Pass context to agent for analysis

### Phase 3: Pattern Extraction and Merging

**3.1 Create Learn Prompt Template** (`.wreckit/prompts/learn.md` - new file):

```markdown
# Learn Phase - Pattern Extraction

You are tasked with analyzing completed work to extract reusable patterns that can be compiled into Skill artifacts for the Wreckit autonomous agent system.

## Objective

Analyze the source items and extract patterns that can be packaged as reusable skills. Skills define:
- **Tools**: Which tools (Read, Write, Edit, Glob, Grep, Bash, MCP tools) are typically used together
- **Context requirements**: What files, git state, or artifacts are needed (optional)
- **Phase applicability**: Which workflow phase this pattern supports

## Source Context

{{source_items_context}}

## Current Skills

{{existing_skills_context}}

## Extraction Process

[Detailed instructions for pattern identification, clustering, skill definition, and phase mapping - see plan.md for full template]

## Output

Write the complete skills configuration to `{{output_path}}`:

```json
{
  "phase_skills": {
    "research": ["skill-id-1", "skill-id-2"],
    "plan": ["skill-id-3"],
    "implement": ["skill-id-4"]
  },
  "skills": [
    {
      "id": "skill-id-1",
      "name": "Skill Name",
      "description": "What this skill does",
      "tools": ["Read", "Grep"],
      "required_context": [],
      "mcp_servers": {}
    }
  ]
}
```

## Completion

When you have extracted and written the skills configuration, output:

{{completion_signal}}
```

**3.2 Add Skills Merging Logic** (`src/commands/learn.ts`):

```typescript
function mergeSkillConfigs(
  existing: SkillConfig | null,
  extracted: SkillConfig,
  strategy: "append" | "replace" | "ask"
): SkillConfig {
  if (!existing) {
    return extracted;  // No existing skills, use extracted
  }

  switch (strategy) {
    case "replace":
      return extracted;  // Replace entirely

    case "append":
      // Merge phase_skills: keep existing, add new
      const phaseSkills = { ...existing.phase_skills };
      for (const [phase, skillIds] of Object.entries(extracted.phase_skills)) {
        const existingIds = phaseSkills[phase] || [];
        const newIds = skillIds.filter(id => !existingIds.includes(id));
        phaseSkills[phase] = [...existingIds, ...newIds];
      }

      // Merge skills: keep existing, add new (by ID)
      const existingSkillsMap = new Map(
        existing.skills.map(s => [s.id, s])
      );
      for (const skill of extracted.skills) {
        if (!existingSkillsMap.has(skill.id)) {
          existingSkillsMap.set(skill.id, skill);
        }
      }

      return {
        phase_skills: phaseSkills,
        skills: Array.from(existingSkillsMap.values())
      };

    case "ask":
      throw new Error("Interactive 'ask' merge strategy not yet implemented. Use 'append' or 'replace'.");
  }
}
```

**3.3 Add Tool Validation** (`src/commands/learn.ts`):

```typescript
import { PHASE_TOOL_ALLOWLISTS } from "../agent/toolAllowlist";
import type { ToolName } from "../agent/toolAllowlist";

function validateSkillTools(
  skillConfig: SkillConfig,
  logger: Logger
): void {
  for (const skill of skillConfig.skills) {
    for (const [phase, skillIds] of Object.entries(skillConfig.phase_skills)) {
      if (skillIds.includes(skill.id)) {
        const phaseTools = PHASE_TOOL_ALLOWLISTS[phase];
        if (phaseTools) {
          const invalidTools = skill.tools.filter(
            t => !phaseTools.includes(t as ToolName)
          );
          if (invalidTools.length > 0) {
            logger.warn(
              `Skill '${skill.id}' requests tools not allowed in '${phase}' phase: ` +
              invalidTools.join(", ")
            );
          }
        }
      }
    }
  }
}
```

**3.4 Update Command to Use Merging and Validation** (`src/commands/learn.ts`):

After agent run and skills.json verification:
- Parse extracted skills with SkillConfigSchema.safeParse()
- Call mergeSkillConfigs() to merge with existing skills
- Call validateSkillTools() to check tool permissions
- Write final skills.json with safeWriteJson()

### Phase 4: Testing and Documentation

**4.1 Create Unit Tests** (`src/__tests__/commands/learn.test.ts`):

Test scenarios:
- Extract from single item with --item flag
- Extract from phase state with --phase flag
- Extract from all completed with --all flag
- Merge strategies (append, replace)
- Validation of tool permissions
- Dry-run mode (no files written)

**4.2 Create Integration Test** (`src/__tests__/integration/learn.integration.test.ts`):

End-to-end test:
- Create test repo with completed items
- Run wreckit learn --all
- Verify .wreckit/skills.json created
- Validate schema with SkillConfigSchema
- Test loaded skills in subsequent workflow phases

**4.3 Create Documentation** (`docs/learn-command.md`):

Document:
- Command usage and flags
- Pattern extraction process
- Merge strategies (append vs replace)
- Skill validation (schema + tool permissions)
- Examples for common use cases
- Troubleshooting guide

**4.4 Update AGENTS.md**:

Add learn command to command reference table (around line 37):
```markdown
| `wreckit learn` | Extract patterns and compile into reusable skills |
```

## Open Questions

1. **Skill granularity**: How fine-grained should extracted skills be? The agent should cluster similar patterns (e.g., multiple file read patterns → single "code-exploration" skill) rather than creating many tiny skills.

2. **Context requirement inference**: How should the agent infer which context requirements (files, git status, artifacts) are needed? The learn prompt should explicitly guide the agent to analyze what context each pattern requires.

3. **Skill deprecation**: If `.wreckit/skills.json` becomes cluttered with outdated skills, how should users manage them? Manual editing is sufficient for now. Future enhancement could add `wreckit learn --prune` command.

4. **Cross-repo skills**: Should skills be shareable across repositories? For now, skills are repo-specific (stored in .wreckit/skills.json). Future enhancement could add `--import` and `--export` flags.

5. **Skill testing**: How to validate that extracted skills actually work? Manual testing is sufficient for now. Future enhancement could add `wreckit learn --test` flag that runs test workflows.

6. **Pattern confidence scores**: Should the agent assign confidence scores to extracted patterns? Not needed for initial implementation. The agent should focus on clear, high-confidence patterns.

7. **MCP server detection**: How should the agent detect when MCP servers are needed? The agent should analyze wreckit MCP tool usage (mcp__wreckit__*) in source items and include those tools in skill definitions.

8. **Interactive merge (--merge ask)**: Should this be implemented initially? Defer to future work. Start with append (default) and replace strategies.

## References

**Core Architecture:**
- `src/commands/strategy.ts:35-143` - Strategy command (primary template for learn command)
- `src/agent/skillLoader.ts:59-144` - Skill loading with tool intersection logic
- `src/agent/contextBuilder.ts:51-132` - JIT context building for skill requirements
- `src/schemas.ts:82-123` - SkillConfigSchema, SkillSchema, SkillContextRequirementSchema

**Command Infrastructure:**
- `src/index.ts:104-622` - CLI command definitions and routing
- `src/commands/ideas.ts` - Ideas command (pattern for --item flag)
- `src/domain/resolveId.ts` - ID resolution for --item flag
- `src/domain/indexing.ts` - scanItems() for listing all items
- `src/fs/paths.ts` - Path helpers (needs getSkillsPath())
- `src/fs/atomic.ts:14-39` - safeWriteJson() for atomic writes

**Agent Runtime:**
- `src/agent/runner.ts:348-494` - runAgentUnion() with allowedTools and mcpServers
- `src/agent/toolAllowlist.ts:57-117` - PHASE_TOOL_ALLOWLISTS (needs "learn" phase)
- `src/workflow/itemWorkflow.ts:100-150` - Phase execution with skill loading

**Documentation:**
- `docs/skills.md` - Complete skills documentation
- `AGENTS.md` - Agent guidelines and MCP patterns
- `.wreckit/items/033-implement-phase-specific-skill-loading-jit-context/research.md` - Item 033 research (dependency)
- `.wreckit/items/033-implement-phase-specific-skill-loading-jit-context/plan.md` - Item 033 implementation plan

**M4 Dependency Chain:**
- `.wreckit/items/033-*/item.json` - Item 033 (foundation, completed)
- `.wreckit/items/034-*/item.json` - This item (learn command)
- `.wreckit/items/035-*/item.json` - Item 035 (media layer, depends on 034)
- `.wreckit/items/036-*/item.json` - Item 036 (summarize command, depends on 035)
