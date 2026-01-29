# Create `wreckit learn` command to compile codebase patterns into reusable Skill artifacts Implementation Plan

## Overview
Implement a `wreckit learn` command that analyzes completed work to extract and compile reusable patterns into Skill artifacts (stored in `.wreckit/skills.json`). This enables the "Recursive Evolution" aspect of milestone M4 by allowing the system to learn from its own implementations and create reusable skills for future items.

The command will use an agent-based approach similar to `wreckit strategy`, with tool restrictions (Read + Write + Glob + Grep) to analyze source items and generate skill definitions.

## Current State Analysis
**What exists now:**
- Complete skill loading infrastructure from Item 033: `loadSkillsForPhase()`, `buildJitContext()`, skill schema
- `.wreckit/skills.json` with 6 default skills (code-exploration, context-awareness, documentation-writer, full-capability, git-integration, verification)
- Tool allowlist system with phase-based permissions
- Agent runner with tool restrictions (`runAgentUnion()`)
- Command pattern established by `strategy.ts`, `ideas.ts`, and other commands

**What's missing:**
- No automated way to extract patterns from completed work
- No command to generate/update `.wreckit/skills.json`
- No pattern recognition or skill compilation logic
- No merge strategies for handling existing skills

**Key constraints discovered:**
1. Must follow existing command pattern (strategy.ts is the best template)
2. Must validate against `SkillConfigSchema` before writing
3. Must respect tool allowlists (learn phase needs Read + Write + Glob + Grep)
4. Must handle missing `.wreckit/skills.json` gracefully (create new file)
5. Must support merge strategies (append, replace) for existing skills
6. Source items should be selectable (single item, phase state, all completed)

## Desired End State
A fully functional `wreckit learn` command that:

1. **Selects source items** based on flags (`--item <id>`, `--phase <state>`, `--all`)
2. **Loads existing skills** from `.wreckit/skills.json` (if exists)
3. **Runs an agent** with Read + Write + Glob + Grep tools to analyze source items
4. **Extracts patterns** and compiles them into skill definitions
5. **Validates output** against `SkillConfigSchema`
6. **Merges skills** using specified strategy (append by default)
7. **Writes final skills** to `.wreckit/skills.json` (or custom path via `--output`)
8. **Supports dry-run** mode for preview without writing
9. **Supports review** mode for interactive approval

**Verification:**
- Command executes successfully and produces valid `.wreckit/skills.json`
- Extracted skills conform to `SkillConfigSchema`
- Tool permissions are validated against phase allowlists
- Merge strategies work correctly (append adds new skills, replace overwrites)
- Dry-run mode shows output without writing
- Existing workflows continue to work with new skills

### Key Discoveries:

- **Strategy command pattern** (`src/commands/strategy.ts:35-143`): Perfect template for learn command - both analyze codebase and produce a single output file with git status enforcement
- **Skill loading** (`src/agent/skillLoader.ts:59-144`): `loadSkillsForPhase()` shows how skills are merged (intersection of phase tools ∩ skill tools) - we must validate extracted skills don't violate phase boundaries
- **Prompt system** (`src/prompts.ts:6-115`): `PromptName` type needs to include "learn", and `loadPromptTemplate()` already handles missing templates by falling back to bundled defaults
- **Item resolution** (`src/domain/resolveId.ts:73-108`): Three-tier resolution (exact → numeric prefix → slug suffix) for `--item` flag
- **Atomic writes** (`src/fs/atomic.ts:14-39`): `safeWriteJson()` prevents corruption during write operations
- **Path helpers** (`src/fs/paths.ts`): Need to add `getSkillsPath()` helper for consistency
- **Tool allowlists** (`src/agent/toolAllowlist.ts:57-117`): Must add "learn" phase with Read + Write + Glob + Grep tools

## What We're NOT Doing
To prevent scope creep, this implementation explicitly excludes:

1. **Skill testing/validation** - No automatic testing that extracted skills work correctly (deferred to future work)
2. **Skill deprecation/pruning** - No automatic removal of outdated skills (can be manual edit)
3. **Cross-repo skill sharing** - No import/export for portability (skills are repo-specific)
4. **Confidence scoring** - No quantitative pattern quality metrics
5. **Interactive merge** - No "ask" strategy for conflict resolution (only append/replace)
6. **Pattern clustering** - No automatic grouping of similar patterns (agent handles this)
7. **MCP server auto-detection** - Agent must explicitly specify MCP servers in skill definitions
8. **Skill versioning** - No version numbers or migration system for skill schema changes

## Implementation Approach
**High-level strategy:** Follow the proven strategy command pattern, adapting it for skill extraction. The learn command will be a standalone analysis phase (not part of the main workflow) that users run explicitly to compile patterns into reusable skills.

**Phasing:** Break into 4 independently testable phases:
1. Core command infrastructure (CLI definition, basic command flow)
2. Source item selection and skills loading
3. Pattern extraction and merging
4. Testing and documentation

**Risk mitigation:**
- Schema validation prevents invalid skills from being written
- Tool validation warns about permission violations before writing
- Dry-run mode allows preview without committing changes
- Review mode enables manual approval for sensitive changes
- Atomic writes prevent corruption if process crashes

---

## Phase 1: Core Command Infrastructure

### Overview
Implement the basic `wreckit learn` command structure following the strategy command pattern. This phase establishes the CLI interface, command routing, and basic execution flow with dry-run support.

### Changes Required:

#### 1. Add Learn Phase to Tool Allowlists
**File**: `src/agent/toolAllowlist.ts`
**Changes**: Add "learn" phase to `PHASE_TOOL_ALLOWLISTS` after line 116

```typescript
export const PHASE_TOOL_ALLOWLISTS: Record<string, ToolName[] | undefined> = {
  // ... existing phases ...

  // Strategy phase: Read + Write for codebase analysis and ROADMAP.md creation
  strategy: [
    AVAILABLE_TOOLS.Read,
    AVAILABLE_TOOLS.Write,
    AVAILABLE_TOOLS.Glob,
    AVAILABLE_TOOLS.Grep,
  ],

  // Learn phase: Read + Write + Glob + Grep for pattern extraction and skills.json creation
  learn: [
    AVAILABLE_TOOLS.Read,
    AVAILABLE_TOOLS.Write,
    AVAILABLE_TOOLS.Glob,
    AVAILABLE_TOOLS.Grep,
  ],
} as const;
```

#### 2. Add Skills Path Helper
**File**: `src/fs/paths.ts`
**Changes**: Add `getSkillsPath()` function after line 97

```typescript
export function getRoadmapPath(root: string): string {
  return path.join(root, "ROADMAP.md");
}

export function getSkillsPath(root: string): string {
  return path.join(getWreckitDir(root), "skills.json");
}
```

Also update the export in `src/fs/index.ts` to include `getSkillsPath`.

#### 3. Add "learn" to PromptName Type
**File**: `src/prompts.ts`
**Changes**: Update `PromptName` type on line 6 to include "learn"

```typescript
export type PromptName = "research" | "plan" | "implement" | "ideas" | "pr" | "strategy" | "learn";
```

#### 4. Create Learn Command Module
**File**: `src/commands/learn.ts` (new file)
**Changes**: Implement basic command structure following strategy.ts pattern

```typescript
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Logger } from "../logging";
import type { SkillConfig } from "../schemas";
import { SkillConfigSchema } from "../schemas";
import { findRootFromOptions, getSkillsPath } from "../fs/paths";
import { loadConfig, type ConfigResolved } from "../config";
import { loadPromptTemplate, renderPrompt, type PromptName } from "../prompts";
import { runAgentUnion, getAgentConfigUnion } from "../agent/runner";
import { getAllowedToolsForPhase } from "../agent/toolAllowlist";
import { pathExists } from "../fs/util";

export interface LearnOptions {
  patterns?: string[];
  item?: string;
  phase?: string;
  all?: boolean;
  output?: string;
  merge?: "append" | "replace" | "ask";
  review?: boolean;
  dryRun?: boolean;
  cwd?: string;
  verbose?: boolean;
}

export async function learnCommand(
  options: LearnOptions,
  logger: Logger
): Promise<void> {
  const root = findRootFromOptions(options);
  const config = await loadConfig(root);

  // Determine output path
  const outputPath = options.output
    ? path.resolve(root, options.output)
    : getSkillsPath(root);

  if (options.dryRun) {
    logger.info("[dry-run] Would extract patterns and write to skills.json");
    logger.info(`  Root: ${root}`);
    logger.info(`  Output: ${outputPath}`);
    logger.info(`  Merge strategy: ${options.merge || "append"}`);
    return;
  }

  // Build prompt variables for learn phase
  const completionSignal =
    config.agent.kind === "process"
      ? config.agent.completion_signal
      : "<promise>COMPLETE</promise>";

  const variables = {
    id: "learn",
    title: "Pattern Extraction",
    section: "skills",
    overview: "Extract and compile codebase patterns into reusable Skill artifacts",
    item_path: root,
    branch_name: "",
    base_branch: config.base_branch,
    completion_signal: completionSignal,
    output_path: outputPath,
    merge_strategy: options.merge || "append",
  };

  // Load learn prompt template
  const template = await loadPromptTemplate(root, "learn" as PromptName);
  const prompt = renderPrompt(template, variables);

  const agentConfig = getAgentConfigUnion(config);

  logger.info("Running pattern extraction...");

  // Run agent with learn phase tools
  const result = await runAgentUnion({
    config: agentConfig,
    cwd: root,
    prompt,
    logger,
    dryRun: options.dryRun,
    mockAgent: false,
    timeoutSeconds: config.timeout_seconds,
    allowedTools: getAllowedToolsForPhase("learn"),
  });

  if (!result.success) {
    const error = result.timedOut
      ? "Agent timed out during pattern extraction"
      : `Agent failed with exit code ${result.exitCode}`;
    throw new Error(error);
  }

  // Verify skills.json was created
  if (!(await pathExists(outputPath))) {
    throw new Error("Agent did not create skills.json");
  }

  // Validate skills.json format
  const skillsContent = await fs.readFile(outputPath, "utf-8");
  const validation = SkillConfigSchema.safeParse(JSON.parse(skillsContent));

  if (!validation.success) {
    const errorMsg = `skills.json format validation failed:\n${validation.error.message}`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  logger.info(`Pattern extraction complete. Extracted ${validation.data.skills.length} skills to ${outputPath}`);
}
```

#### 5. Add CLI Command Definition
**File**: `src/index.ts`
**Changes**: Add learn command after execute-roadmap command (around line 622)

```typescript
import { learnCommand, type LearnOptions } from "./commands/learn";

// ... after execute-roadmap command ...

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

### Success Criteria:

#### Automated Verification:
- [ ] Tests pass: `npm test` (or `bun test`)
- [ ] Type checking passes: `npm run typecheck` (or `bun run typecheck`)
- [ ] Linting passes: `npm run lint` (or `bun run lint`)
- [ ] Build succeeds: `npm run build` (or `bun build`)

#### Manual Verification:
- [ ] `wreckit learn --help` displays command usage
- [ ] `wreckit learn --dry-run` runs without errors and shows preview
- [ ] Learn phase is recognized by tool allowlist system
- [ ] `getSkillsPath()` helper returns correct path

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Source Item Selection and Skills Loading

### Overview
Implement logic to select source items for pattern extraction based on command flags, and load existing skills for merging. This enables the command to analyze specific items or aggregate patterns from multiple completed items.

### Changes Required:

#### 1. Add Item Selection Utilities
**File**: `src/commands/learn.ts`
**Changes**: Add helper functions to determine source items

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

#### 2. Add Skills Loading
**File**: `src/commands/learn.ts`
**Changes**: Add function to load existing skills

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

#### 3. Update Command to Use Selection Logic
**File**: `src/commands/learn.ts`
**Changes**: Update `learnCommand()` to use selection utilities

```typescript
export async function learnCommand(
  options: LearnOptions,
  logger: Logger
): Promise<void> {
  const root = findRootFromOptions(options);
  const config = await loadConfig(root);

  // Determine source items
  const { items: sourceItems, context: sourceContext } = await determineSourceItems(root, options, logger);

  if (sourceItems.length === 0) {
    logger.warn("No source items found for pattern extraction");
    return;
  }

  // Load existing skills
  const existingSkills = await loadExistingSkills(root);
  const existingSkillsContext = existingSkills
    ? `\nExisting skills: ${existingSkills.skills.length} skills defined\n` +
      `Existing phases: ${Object.keys(existingSkills.phase_skills).join(", ")}`
    : "\nNo existing skills.json (will create new file)";

  // Determine output path
  const outputPath = options.output
    ? path.resolve(root, options.output)
    : getSkillsPath(root);

  if (options.dryRun) {
    logger.info("[dry-run] Would extract patterns and write to skills.json");
    logger.info(`  Root: ${root}`);
    logger.info(`  Source items: ${sourceItems.length}`);
    logger.info(sourceContext);
    logger.info(`  Existing skills: ${existingSkills?.skills.length || 0}`);
    logger.info(`  Output: ${outputPath}`);
    logger.info(`  Merge strategy: ${options.merge || "append"}`);
    return;
  }

  // Build prompt variables with source items context
  const completionSignal =
    config.agent.kind === "process"
      ? config.agent.completion_signal
      : "<promise>COMPLETE</promise>";

  const variables = {
    id: "learn",
    title: "Pattern Extraction",
    section: "skills",
    overview: "Extract and compile codebase patterns into reusable Skill artifacts",
    item_path: root,
    branch_name: "",
    base_branch: config.base_branch,
    completion_signal: completionSignal,
    output_path: outputPath,
    merge_strategy: options.merge || "append",
    source_items_context: sourceContext + existingSkillsContext,
  };

  // ... rest of command unchanged ...
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Tests pass: `npm test`
- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] `wreckit learn --item 33` extracts from specific item
- [ ] `wreckit learn --phase done` finds all completed items
- [ ] `wreckit learn --all` extracts from all completed items
- [ ] Default behavior uses recent 5 completed items
- [ ] Command handles missing `.wreckit/skills.json` correctly
- [ ] Existing skills are loaded and counted in logs

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Pattern Extraction and Merging

### Overview
Implement the learn prompt template, skill merging logic, and validation. This phase enables the agent to extract patterns and merge them with existing skills according to the specified strategy.

### Changes Required:

#### 1. Create Learn Prompt Template
**File**: `.wreckit/prompts/learn.md` (new file)
**Changes**: Create prompt template for pattern extraction

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

The system may have existing skills defined. Your task is to identify NEW patterns or improve upon existing ones. Do not duplicate skills that already exist unless you have a compelling reason to replace them.

## Extraction Process

### Step 1: Identify Patterns

For each source item, analyze:
1. **What tools were used?** Look at the artifacts (research.md, plan.md, implemented code)
2. **What context was needed?** Git status? Item metadata? Previous artifacts?
3. **What phase was this work in?** Research, plan, implement, PR, complete?

### Step 2: Cluster Similar Patterns

Group similar patterns into skills:
- **Code exploration**: Read-only analysis with Read, Glob, Grep
- **Documentation**: Creating plans with Read, Write, Edit
- **Implementation**: Full capability with all tools
- **Git operations**: Version control with Read, Glob, Grep, Bash
- **Verification**: Read-only checks and validation

### Step 3: Define Skills

For each skill, provide:

```json
{
  "id": "skill-unique-id",
  "name": "Human-Readable Skill Name",
  "description": "What this skill provides and when to use it. Be specific.",
  "tools": ["Read", "Grep"],
  "required_context": [
    {
      "type": "git_status",
      "description": "Current repository state"
    }
  ],
  "mcp_servers": {}
}
```

**Skill fields:**
- `id`: Unique identifier (kebab-case, e.g., "code-analysis", "test-generation")
- `name`: Human-readable name (e.g., "Code Analysis", "Test Generation")
- `description`: Clear explanation of what the skill does and when to use it
- `tools`: Array of tool names (Read, Write, Edit, Glob, Grep, Bash, mcp__wreckit__*)
- `required_context` (optional): Context requirements for JIT loading
  - `type`: "file", "git_status", "item_metadata", "phase_artifact"
  - `path`: (for file/phase_artifact) file path
  - `description`: What this context provides
- `mcp_servers` (optional): MCP server configuration (usually empty)

### Step 4: Map Skills to Phases

Create the `phase_skills` mapping:

```json
{
  "phase_skills": {
    "research": ["skill-id-1", "skill-id-2"],
    "plan": ["skill-id-3"],
    "implement": ["skill-id-4"],
    "pr": ["skill-id-5"],
    "complete": ["skill-id-6"]
  }
}
```

## Output

Write the complete skills configuration to `{{output_path}}`:

```json
{
  "phase_skills": {
    "research": ["skill-id-1", "skill-id-2"],
    "plan": ["skill-id-3"],
    "implement": ["skill-id-4"],
    "pr": ["skill-id-5"],
    "complete": ["skill-id-6"]
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

## Guidelines

1. **Be Specific**: Skills should be focused and reusable. Avoid overly broad "do-everything" skills.
2. **Avoid Duplication**: Don't recreate skills that already exist unless improving them significantly.
3. **Respect Tool Boundaries**: Only use tools that are allowed in the target phase:
   - research: Read, Write, Glob, Grep
   - plan: Read, Write, Edit, Glob, Grep, mcp__wreckit__save_prd
   - implement: Read, Write, Edit, Glob, Grep, Bash, mcp__wreckit__update_story_status
   - pr: Read, Glob, Grep, Bash
   - complete: Read, Glob, Grep, mcp__wreckit__complete
4. **Document Clearly**: Descriptions should explain when to use the skill and what it provides.
5. **Test Reasonably**: Consider how the skill would be loaded and used in a workflow.

## Merge Strategy

The merge strategy is: **{{merge_strategy}}**

- **append**: Add new skills to existing skills, keep both phase_skills and skills merged
- **replace**: Replace entire skills.json with new definitions

## Completion

When you have extracted and written the skills configuration, output:

{{completion_signal}}
```

#### 2. Add Skills Merging Logic
**File**: `src/commands/learn.ts`
**Changes**: Add merge strategy implementation

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

#### 3. Add Tool Validation
**File**: `src/commands/learn.ts`
**Changes**: Add validation to warn about tool permission violations

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

#### 4. Update Command to Use Merging and Validation
**File**: `src/commands/learn.ts`
**Changes**: Update `learnCommand()` to merge and validate

```typescript
  // ... after agent run and skills.json verification ...

  // Validate skills.json format
  const skillsContent = await fs.readFile(outputPath, "utf-8");
  const extractedValidation = SkillConfigSchema.safeParse(JSON.parse(skillsContent));

  if (!extractedValidation.success) {
    const errorMsg = `Extracted skills.json format validation failed:\n${extractedValidation.error.message}`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  // Merge with existing skills based on strategy
  const finalSkills = mergeSkillConfigs(
    existingSkills,
    extractedValidation.data,
    options.merge || "append"
  );

  // Validate tool permissions
  validateSkillTools(finalSkills, logger);

  // Write final skills.json
  await safeWriteJson(outputPath, finalSkills);

  logger.info(`Pattern extraction complete.`);
  logger.info(`  Extracted: ${extractedValidation.data.skills.length} skills`);
  logger.info(`  Final total: ${finalSkills.skills.length} skills`);
  logger.info(`  Written to: ${outputPath}`);
}
```

Add import for `safeWriteJson`:
```typescript
import { safeWriteJson } from "../fs/atomic";
```

### Success Criteria:

#### Automated Verification:
- [ ] Tests pass: `npm test`
- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] `wreckit learn` creates valid `.wreckit/skills.json`
- [ ] `wreckit learn --merge append` adds new skills to existing ones
- [ ] `wreckit learn --merge replace` overwrites existing skills
- [ ] Tool validation warns about permission violations
- [ ] Extracted skills conform to `SkillConfigSchema`
- [ ] Prompt template guides agent effectively

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to Phase 4.

---

## Phase 4: Testing and Documentation

### Overview
Test the learn command comprehensively and document usage. This phase ensures reliability and provides clear guidance for users.

### Changes Required:

#### 1. Create Unit Tests
**File**: `src/__tests__/commands/learn.test.ts` (new file)
**Changes**: Test core functionality

```typescript
import { describe, it, expect, beforeEach } from "bun:test";
import { learnCommand } from "../../commands/learn";
import { SkillConfigSchema } from "../../schemas";
import type { SkillConfig } from "../../schemas";
import * as fs from "node:fs/promises";

describe("learn command", () => {
  // Test source item selection
  it("should select specific item with --item flag", async () => {
    // Test implementation
  });

  it("should filter by phase state with --phase flag", async () => {
    // Test implementation
  });

  it("should extract from all completed items with --all flag", async () => {
    // Test implementation
  });

  // Test merge strategies
  it("should append new skills to existing skills", async () => {
    const existing: SkillConfig = {
      phase_skills: { research: ["existing-skill"] },
      skills: [{ id: "existing-skill", name: "Existing", description: "Test", tools: ["Read"] }]
    };

    const extracted: SkillConfig = {
      phase_skills: { research: ["new-skill"] },
      skills: [{ id: "new-skill", name: "New", description: "Test", tools: ["Grep"] }]
    };

    // Test merge logic
  });

  it("should replace all skills with --merge replace", async () => {
    // Test implementation
  });

  // Test validation
  it("should validate against SkillConfigSchema", async () => {
    // Test implementation
  });

  it("should warn about tool permission violations", async () => {
    // Test implementation
  });

  // Test dry-run mode
  it("should not write files in dry-run mode", async () => {
    // Test implementation
  });
});
```

#### 2. Create Integration Test
**File**: `src/__tests__/integration/learn.test.ts` (new file)
**Changes**: End-to-end test

```typescript
import { describe, it, expect } from "bun:test";
import { execSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { SkillConfigSchema } from "../../schemas";

describe("learn command integration", () => {
  const testRepo = path.join(process.cwd(), "test-repo-learn");

  it("should extract patterns and create skills.json", async () => {
    // Setup: Create test repo with completed items
    // Run: wreckit learn --all
    // Verify: skills.json exists and validates
  });

  it("should merge with existing skills.json", async () => {
    // Setup: Create test repo with existing skills.json
    // Run: wreckit learn --merge append
    // Verify: Both old and new skills present
  });
});
```

#### 3. Create Documentation
**File**: `docs/learn-command.md` (new file)
**Changes**: Document command usage

```markdown
# `wreckit learn` Command

Extract and compile codebase patterns into reusable Skill artifacts.

## Overview

The `wreckit learn` command analyzes completed work to identify reusable patterns and compiles them into Skill artifacts (stored in `.wreckit/skills.json`). This enables the system to learn from its own implementations and improve over time.

## Usage

```bash
wreckit learn [options]
wreckit learn [patterns...] [options]
```

## Options

| Option | Description |
|--------|-------------|
| `--item <id>` | Extract patterns from specific item (by ID, number, or slug) |
| `--phase <state>` | Extract patterns from items in specific state (e.g., `done`, `researched`) |
| `--all` | Extract patterns from all completed items |
| `--output <path>` | Custom output path for skills.json (default: `.wreckit/skills.json`) |
| `--merge <strategy>` | Merge strategy: `append` (default) or `replace` |
| `--review` | Review extracted skills before saving (not yet implemented) |
| `--dry-run` | Preview without writing files |
| `--verbose` | Detailed logging |
| `--quiet` | Errors only |

## Examples

### Extract from most recent completed items (default)
```bash
wreckit learn
```

### Extract from specific item
```bash
wreckit learn --item 033
wreckit learn --item phase-specific-skill-loading
```

### Extract from all completed items
```bash
wreckit learn --all
```

### Extract from items in specific state
```bash
wreckit learn --phase done
```

### Replace existing skills instead of merging
```bash
wreckit learn --all --merge replace
```

### Dry-run to preview changes
```bash
wreckit learn --all --dry-run
```

### Write to custom output path
```bash
wreckit learn --all --output .wreckit/custom-skills.json
```

## How It Works

1. **Select source items**: Based on flags, selects which items to analyze
2. **Load existing skills**: Reads `.wreckit/skills.json` if it exists
3. **Run extraction agent**: Analyzes source items with Read + Write + Glob + Grep tools
4. **Validate output**: Ensures extracted skills conform to schema
5. **Merge skills**: Combines new skills with existing ones (append or replace)
6. **Validate permissions**: Warns if skills request tools not allowed in target phases
7. **Write skills.json**: Atomically writes final configuration

## Merge Strategies

### Append (default)
Preserves existing skills and adds new ones. If a skill with the same ID exists in both configs, the existing one is kept.

```bash
wreckit learn --merge append
```

### Replace
Overwrites entire `.wreckit/skills.json` with newly extracted skills.

```bash
wreckit learn --merge replace
```

## Skill Validation

The command validates extracted skills in two ways:

1. **Schema validation**: Ensures skills conform to `SkillConfigSchema`
2. **Tool validation**: Warns if skills request tools not allowed in target phases

Example warning:
```
Warning: Skill 'test-generation' requests tools not allowed in 'research' phase: Bash
```

## Output

The command creates or updates `.wreckit/skills.json`:

```json
{
  "phase_skills": {
    "research": ["code-exploration", "context-awareness"],
    "plan": ["documentation-writer"],
    "implement": ["full-capability"]
  },
  "skills": [
    {
      "id": "code-exploration",
      "name": "Code Exploration",
      "description": "Read-only codebase analysis with grep and glob tools",
      "tools": ["Read", "Glob", "Grep"],
      "required_context": [
        {
          "type": "git_status",
          "description": "Current repository state"
        }
      ]
    }
  ]
}
```

## Tips

- Run with `--dry-run` first to preview what will be extracted
- Use `--item` to learn from a particularly successful implementation
- Use `--all` periodically to aggregate patterns from all completed work
- Check tool validation warnings to ensure skills respect phase boundaries
- Manually edit `.wreckit/skills.json` to refine extracted skills if needed

## Troubleshooting

### No source items found
```
Warning: No source items found for pattern extraction
```
**Solution**: Ensure you have completed items, or use `--all` to include all completed work.

### Validation failed
```
Error: skills.json format validation failed: ...
```
**Solution**: The agent produced invalid output. Try running again or manually review the learn prompt.

### Tool permission violations
```
Warning: Skill '...' requests tools not allowed in '...' phase: ...
```
**Solution**: Either adjust the skill definition manually or ensure the skill is only used in phases that allow the requested tools.
```

#### 4. Update AGENTS.md
**File**: `AGENTS.md`
**Changes**: Add learn command to command reference table (around line 37)

```markdown
### CLI Commands

| Command | Does |
|---------|------|
| `wreckit` | Run all incomplete items (research → plan → implement → PR) |
| `wreckit next` | Run next incomplete item |
| `wreckit run <id>` | Run single item through all phases (id: `1`, `2`, or `001-slug`) |
| `wreckit ideas < FILE` | Ingest ideas (create idea items) |
| `wreckit learn` | Extract patterns and compile into reusable skills |
| `wreckit status` | List all items + state |
| `wreckit list` | List items (with optional `--state` filtering) |
| `wreckit show <id>` | Show item details |
| `wreckit init` | Initialize `.wreckit/` in repo |
| `wreckit doctor` | Validate items, fix broken state |
| `wreckit rollback <id>` | Rollback a direct-merge item to pre-merge state |
```

### Success Criteria:

#### Automated Verification:
- [ ] Tests pass: `npm test`
- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`
- [ ] Integration tests pass
- [ ] Code coverage > 80% for learn command

#### Manual Verification:
- [ ] `wreckit learn --help` shows updated documentation
- [ ] Command successfully extracts patterns from real items
- [ ] Generated `.wreckit/skills.json` is valid and usable
- [ ] Merge strategies work as expected
- [ ] Documentation is clear and complete
- [ ] AGENTS.md includes learn command reference

**Note**: Complete all verification. This is the final phase.

---

## Testing Strategy

### Unit Tests:
- **Source item selection**: Test `--item`, `--phase`, `--all` flags with mock data
- **Skills loading**: Test loading existing skills, handling missing files
- **Merge strategies**: Test append and replace logic with various skill configurations
- **Validation**: Test schema validation and tool permission checks
- **Dry-run mode**: Verify no files are written in dry-run

### Integration Tests:
- **End-to-end extraction**: Run `wreckit learn` on test repo with completed items
- **Merge scenarios**: Test appending to and replacing existing skills.json
- **Error handling**: Test behavior with invalid source data, permission errors

### Manual Testing Steps:
1. **Basic extraction**: Run `wreckit learn --dry-run` to preview
2. **Single item**: Run `wreckit learn --item 033` and verify output
3. **All items**: Run `wreckit learn --all` and check skill quality
4. **Merge append**: Run twice, verify skills accumulate
5. **Merge replace**: Run `wreckit learn --all --merge replace` and verify complete replacement
6. **Validation**: Create a skill with invalid tools, verify warning appears
7. **Custom output**: Run `wreckit learn --output /tmp/test-skills.json` and verify path

## Migration Notes
No data migration required. `.wreckit/skills.json` is optional (created if missing). Existing workflows continue to work unchanged.

## References
- Research: `/Users/speed/wreckit/.wreckit/items/034-create-wreckit-learn-command-to-compile-codebase-p/research.md`
- Item 033 (skill loading): `/Users/speed/wreckit/.wreckit/items/033-implement-phase-specific-skill-loading-jit-context/`
- Skill schema: `src/schemas.ts:82-123`
- Skill loader: `src/agent/skillLoader.ts:59-144`
- Context builder: `src/agent/contextBuilder.ts:51-132`
- Strategy command (template): `src/commands/strategy.ts:35-143`
- Tool allowlists: `src/agent/toolAllowlist.ts:57-117`
- Skills documentation: `docs/skills.md`
