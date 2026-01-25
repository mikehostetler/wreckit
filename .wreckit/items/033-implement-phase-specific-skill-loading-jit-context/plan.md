# Implement Phase-Specific Skill Loading (JIT Context Orchestration) Implementation Plan

## Overview

This implementation adds phase-specific skill loading with Just-In-Time (JIT) context orchestration to the wreckit agent system. The current implementation uses static tool allowlists per phase (`src/agent/toolAllowlist.ts`) but does not support dynamic skill loading or context injection. This feature enables agents to dynamically load capabilities (skills) based on phase-specific needs while maintaining security boundaries, and automatically injects relevant context into agent prompts.

**Key Objectives:**
- Define a skill schema that specifies tools, MCP servers, and context requirements
- Load skills dynamically based on phase configuration
- Aggregate skill tool allowlists with existing phase-based restrictions
- Inject skill-specific context into agent prompts (JIT context orchestration)
- Maintain backward compatibility (no skills config = existing behavior)

## Current State Analysis

### Existing Implementation

**Tool Allowlist System** (`src/agent/toolAllowlist.ts:57-117`):
- Static tool restrictions per phase (idea, research, plan, implement, pr, complete, strategy)
- Defines available tools: Read, Write, Edit, Glob, Grep, Bash, and MCP tools
- Function `getAllowedToolsForPhase(phase: string)` returns allowed tool array
- Enforced at SDK layer when calling agents (`src/workflow/itemWorkflow.ts:285`, `:456`, `:704`)

**Agent Dispatch System** (`src/agent/runner.ts:348-494`):
- Discriminated union supports: process, claude_sdk, amp_sdk, codex_sdk, opencode_sdk
- `runAgentUnion()` dispatches to appropriate SDK runner based on `config.kind`
- All SDK runners accept `allowedTools` parameter for tool restrictions
- MCP servers attached via `mcpServers` parameter (example at `src/workflow/itemWorkflow.ts:437-441`)

**Prompt System** (`src/prompts.ts:55-95`):
- Template loading from `.wreckit/prompts/` or bundled defaults
- Variable substitution with simple conditionals (`{{#if var}}...{{/if}}`)
- Prompt templates for: research, plan, implement, ideas, pr, strategy
- `buildPromptVariables()` assembles context from research, plan, PRD, progress (`src/workflow/itemWorkflow.ts:168-200`)

### What's Missing

**No Skill System:**
- Skills do not exist as a concept
- No way to group tools + MCP servers + context requirements together
- No dynamic loading mechanism
- No JIT context orchestration beyond basic prompt variables

**Limited Context Injection:**
- Current prompt variables are static (id, title, research, plan, prd, progress)
- No way to inject skill-specific instructions or context
- No context loading from files or git state beyond what's already in prompt variables

### Key Constraints

1. **Backward Compatibility**: Existing configs without skills must work unchanged
2. **Security Boundaries**: Skills cannot grant more tools than the phase allows
3. **Agent Abstraction**: Must work with all agent backends (claude_sdk, amp_sdk, codex_sdk, opencode_sdk, process)
4. **MCP Tool Naming**: MCP tools use format `mcp__<server_name>__<tool_name>` (`src/agent/toolAllowlist.ts:15`)
5. **Zod Schemas**: All configuration must use Zod for runtime validation

## Desired End State

### Specification

**1. Skill Schema (`src/schemas.ts`):**
```typescript
export const SkillContextRequirementSchema = z.object({
  type: z.enum(["file", "git_status", "item_metadata", "phase_artifact"]),
  path: z.string().optional(),
  description: z.string().optional(),
}).optional();

export const SkillSchema = z.object({
  id: z.string().describe("Unique skill identifier (e.g., 'code-analysis', 'test-generation')"),
  name: z.string().describe("Human-readable skill name"),
  description: z.string().describe("What this skill does and when to use it"),
  tools: z.array(z.string()).describe("Tools required by this skill"),
  mcp_servers: z.record(z.string(), z.any()).optional().describe("MCP servers to attach"),
  required_context: z.array(SkillContextRequirementSchema).optional().describe("JIT context requirements"),
});

export const SkillConfigSchema = z.object({
  phase_skills: z.record(z.string(), z.array(z.string())).describe("Phase -> skill ID mapping"),
  skills: z.array(SkillSchema).describe("Available skill definitions"),
});
```

**2. Skill Loader (`src/agent/skillLoader.ts`):**
```typescript
export interface SkillLoadResult {
  allowedTools: string[] | undefined;
  mcpServers: Record<string, unknown>;
  contextRequirements: SkillContextRequirement[];
  loadedSkillIds: string[];
}

export function loadSkillsForPhase(
  phase: string,
  skillConfig: SkillConfig | undefined
): SkillLoadResult
```

Behavior:
- Loads skills specified for the phase from `phase_skills` mapping
- Aggregates tool lists from all skills
- Merges skill tool lists with phase allowlist (intersection = skills can't exceed phase permissions)
- Combines MCP servers from all skills
- Collects context requirements from all skills

**3. Context Builder (`src/agent/contextBuilder.ts`):**
```typescript
export interface BuiltContext {
  files: Record<string, string>;
  gitStatus?: string;
  itemMetadata?: string;
  artifacts: Record<string, string>;
  errors: string[];
}

export async function buildJitContext(
  contextRequirements: SkillContextRequirement[],
  item: Item,
  config: ConfigResolved,
  root: string
): Promise<BuiltContext>

export function formatContextForPrompt(context: BuiltContext): string
```

Behavior:
- Takes context requirements from skills
- Loads files, git status, item metadata, phase artifacts
- Formats as markdown for prompt injection
- Handles errors gracefully (collects but continues)

**4. Extended Prompt Variables (`src/prompts.ts`):**
Add `skill_context` variable to `PromptVariables`:
```typescript
export interface PromptVariables {
  // ... existing fields
  skill_context?: string;  // NEW: JIT context from skills
}
```

**5. Config Integration (`src/config.ts`, `src/schemas.ts`):**
- Add optional `skills` field to `ConfigSchema`
- Load from `.wreckit/skills.json` if present
- Default to `undefined` (no skills = backward compatible)

**6. Phase Integration (`src/workflow/itemWorkflow.ts`):**
- Load skills before each phase
- Merge skill MCP servers with wreckit MCP server
- Build JIT context from skill requirements
- Inject skill context into prompt variables
- Pass aggregated tool allowlist to agent

### Verification

**Automated:**
- Unit tests for skill loader (tool merging, security boundary enforcement)
- Unit tests for context builder (pattern matching, file loading)
- Integration tests for phase execution with skills
- Backward compatibility tests (no skills config = existing behavior)

**Manual:**
- Create `.wreckit/skills.json` with test skills
- Run `wreckit research <id>` and verify skill tools are available
- Verify skill context is injected into prompts
- Verify security boundaries (skills can't exceed phase permissions)
- Test with multiple skills per phase

## What We're NOT Doing

**Out of Scope:**
1. **Skill Composition/Dependencies**: Skills cannot depend on or compose other skills (future enhancement)
2. **Skill Versioning**: No versioning scheme for skills (future enhancement)
3. **Skill Discovery/Listing**: No `wreckit skills list` command (future enhancement)
4. **Context Caching**: JIT context is rebuilt each phase (future optimization)
5. **Skill-Specific Agent Configs**: All skills use the same agent backend (future enhancement)
6. **Dynamic Skill Loading**: Skills must be defined in config, not discovered at runtime (security decision)
7. **Multi-Agent Coordination**: Skills don't spawn sub-agents (future enhancement)
8. **Skill Marketplace/Distribution**: No remote skill loading (security decision)

## Implementation Approach

The implementation follows a phased approach to ensure each component can be tested independently before integration. We start with data structures (schemas), add the skill loader logic, build context orchestration, and finally integrate with phases.

**Design Philosophy:**
- **Incremental**: Each phase is independently testable
- **Backward Compatible**: No breaking changes to existing configs
- **Security First**: Skills cannot exceed phase tool permissions
- **Explicit**: Skills must be explicitly configured per phase
- **Composable**: Skills can be combined (tool lists merge, MCP servers merge)

---

## Phase 1: Skill Schema and Configuration

### Overview
Define the data structures for skills and integrate with the config system. This phase establishes the foundation for all subsequent work.

### Changes Required:

#### 1. Extended Schemas (`src/schemas.ts`)

**File**: `src/schemas.ts` (after line 70, after `AgentConfigUnionSchema`)

**Changes**: Add skill schemas

```typescript
// ============================================================
// Skill Configuration Schema (Item 033 - Phase-Specific Skill Loading)
// ============================================================

/**
 * Context requirement for a skill.
 * Specifies what context the skill needs for JIT loading.
 */
export const SkillContextRequirementSchema = z.object({
  type: z.enum(["file", "git_status", "item_metadata", "phase_artifact"]),
  path: z.string().optional(), // For type="file" or type="phase_artifact"
  description: z.string().optional(),
}).optional();

/**
 * A skill defines reusable capabilities (tools, MCP servers, context)
 * that can be loaded for specific phases.
 */
export const SkillSchema = z.object({
  id: z.string().describe("Unique skill identifier (e.g., 'code-analysis', 'test-generation')"),
  name: z.string().describe("Human-readable skill name"),
  description: z.string().describe("What this skill provides and when to use it"),
  tools: z.array(z.string()).describe("Tool names required by this skill"),
  mcp_servers: z.record(z.string(), z.any()).optional().describe("MCP servers to attach (advanced usage)"),
  required_context: z.array(SkillContextRequirementSchema).optional().describe("JIT context requirements"),
}).strict();

/**
 * Maps phase names to skill IDs that should be loaded for that phase.
 */
export const PhaseSkillsMappingSchema = z.record(
  z.string(), // phase name (e.g., "research", "implement")
  z.array(z.string()) // array of skill IDs
);

/**
 * Skill configuration for wreckit.
 * Maps phases to skills and defines the skill library.
 */
export const SkillConfigSchema = z.object({
  phase_skills: PhaseSkillsMappingSchema.describe("Phase -> skill IDs mapping"),
  skills: z.array(SkillSchema).describe("Available skill definitions"),
}).strict();

// Type exports
export type SkillContextRequirement = z.infer<typeof SkillContextRequirementSchema>;
export type Skill = z.infer<typeof SkillSchema>;
export type PhaseSkillsMapping = z.infer<typeof PhaseSkillsMappingSchema>;
export type SkillConfig = z.infer<typeof SkillConfigSchema>;
```

#### 2. Extend Config Schema (`src/schemas.ts`)

**File**: `src/schemas.ts:80-91` (ConfigSchema)

**Changes**: Add optional skills field

```typescript
export const ConfigSchema = z.object({
  schema_version: z.number().default(1),
  base_branch: z.string().default("main"),
  branch_prefix: z.string().default("wreckit/"),
  merge_mode: MergeModeSchema.default("pr"),
  // Accept either legacy mode-based format or new kind-based union format
  agent: z.union([LegacyAgentConfigSchema, AgentConfigUnionSchema]),
  max_iterations: z.number().default(100),
  timeout_seconds: z.number().default(3600),
  pr_checks: PrChecksSchema.optional(),
  branch_cleanup: BranchCleanupSchema.optional(),
  // Add optional skills configuration (Item 033)
  skills: SkillConfigSchema.optional(),
});
```

#### 3. Update ConfigResolved (`src/config.ts`)

**File**: `src/config.ts:23-33` (ConfigResolved interface)

**Changes**: Add skills field

```typescript
export interface ConfigResolved {
  schema_version: number;
  base_branch: string;
  branch_prefix: string;
  merge_mode: "pr" | "direct";
  agent: AgentConfigUnion;
  max_iterations: number;
  timeout_seconds: number;
  pr_checks: PrChecksResolved;
  branch_cleanup: BranchCleanupResolved;
  // Add optional skills (Item 033)
  skills?: SkillConfig;
}
```

#### 4. Update Imports (`src/config.ts`)

**File**: `src/config.ts:1-3` (imports)

**Changes**: Import SkillConfig type

```typescript
import { ConfigSchema, PrChecksSchema, BranchCleanupSchema, type Config, type AgentConfigUnion, type SkillConfig } from "./schemas";
```

### Success Criteria:

#### Automated Verification:
- [ ] `npm run typecheck` passes (no type errors in schemas)
- [ ] Config with `skills` field loads successfully
- [ ] Config without `skills` field loads successfully (backward compatibility)
- [ ] Zod validation catches invalid skill definitions

#### Manual Verification:
- [ ] Create `.wreckit/config.json` with skills field and verify it loads
- [ ] Create `.wreckit/config.json` without skills field and verify it still works

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Skill Loader Implementation

### Overview
Implement the skill loading logic that aggregates tools, MCP servers, and context requirements from skills for a given phase. Enforces security boundaries by intersecting skill tools with phase allowlists.

### Changes Required:

#### 1. Create Skill Loader (`src/agent/skillLoader.ts`)

**File**: New file `src/agent/skillLoader.ts`

**Changes**: Create new module

```typescript
/**
 * Phase-Specific Skill Loading (Item 033)
 *
 * This module implements dynamic skill loading per phase with JIT context orchestration.
 * Skills define reusable capabilities (tools, MCP servers, context) that can be
 * composed for specific phases while respecting security boundaries.
 */

import type { SkillConfig, Skill, SkillContextRequirement } from "../schemas";
import { PHASE_TOOL_ALLOWLISTS } from "./toolAllowlist";

/**
 * Result of loading skills for a phase.
 * Contains merged tool allowlist, MCP servers, and context requirements.
 */
export interface SkillLoadResult {
  /**
   * Merged tool allowlist for the phase.
   * Intersection of phase tools and skill tools.
   * If undefined, no tool restrictions (all tools allowed).
   */
  allowedTools: string[] | undefined;

  /**
   * MCP servers to attach from skills.
   * Merged from all skills loaded for the phase.
   */
  mcpServers: Record<string, unknown>;

  /**
   * JIT context requirements from loaded skills.
   * These will be used to build context for prompts.
   */
  contextRequirements: SkillContextRequirement[];

  /**
   * IDs of skills that were successfully loaded for this phase.
   */
  loadedSkillIds: string[];
}

/**
 * Load skills for a specific phase.
 *
 * This function:
 * 1. Looks up skill IDs for the phase from config
 * 2. Resolves skill definitions from skill library
 * 3. Merges tool allowlists (intersection with phase tools)
 * 4. Aggregates MCP servers from all skills
 * 5. Collects context requirements for JIT loading
 *
 * Security: Skills cannot exceed phase tool permissions. The resulting
 * allowedTools is the intersection of phase tools and skill tools.
 *
 * @param phase - The workflow phase (e.g., "research", "implement")
 * @param skillConfig - Optional skill configuration from wreckit config
 * @returns Skill load result with merged tools, MCP servers, and context requirements
 */
export function loadSkillsForPhase(
  phase: string,
  skillConfig: SkillConfig | undefined
): SkillLoadResult {
  // Default result if no skills configured
  if (!skillConfig) {
    return {
      allowedTools: PHASE_TOOL_ALLOWLISTS[phase],
      mcpServers: {},
      contextRequirements: [],
      loadedSkillIds: [],
    };
  }

  // Get skill IDs for this phase
  const skillIds = skillConfig.phase_skills[phase];
  if (!skillIds || skillIds.length === 0) {
    return {
      allowedTools: PHASE_TOOL_ALLOWLISTS[phase],
      mcpServers: {},
      contextRequirements: [],
      loadedSkillIds: [],
    };
  }

  // Resolve skill definitions
  const skills: Skill[] = [];
  for (const skillId of skillIds) {
    const skill = skillConfig.skills.find((s) => s.id === skillId);
    if (!skill) {
      // Unknown skill ID - skip with warning (could log here)
      continue;
    }
    skills.push(skill);
  }

  // Get phase tool allowlist (security boundary)
  const phaseTools = PHASE_TOOL_ALLOWLISTS[phase];

  // Merge skill tools (union of all skill tools)
  const skillTools = new Set<string>();
  for (const skill of skills) {
    for (const tool of skill.tools) {
      skillTools.add(tool);
    }
  }

  // Calculate allowed tools: intersection of phase tools and skill tools
  let allowedTools: string[] | undefined;
  if (phaseTools) {
    // Phase has restrictions: intersect with skill tools
    allowedTools = phaseTools.filter((tool) => skillTools.has(tool));
  } else {
    // Phase has no restrictions: use all skill tools
    // If no skills define tools, this is empty array (no tools allowed)
    // If no skills loaded, use undefined (no restrictions)
    if (skills.length > 0 && skillTools.size > 0) {
      allowedTools = Array.from(skillTools);
    } else {
      allowedTools = undefined; // No restrictions
    }
  }

  // Aggregate MCP servers from all skills
  const mcpServers: Record<string, unknown> = {};
  for (const skill of skills) {
    if (skill.mcp_servers) {
      Object.assign(mcpServers, skill.mcp_servers);
    }
  }

  // Collect context requirements from all skills
  const contextRequirements: SkillContextRequirement[] = [];
  for (const skill of skills) {
    if (skill.required_context) {
      contextRequirements.push(...skill.required_context);
    }
  }

  return {
    allowedTools,
    mcpServers,
    contextRequirements,
    loadedSkillIds: skills.map((s) => s.id),
  };
}
```

### Success Criteria:

#### Automated Verification:
- [ ] `npm run typecheck` passes
- [ ] Test: No skill config returns phase allowlist unchanged
- [ ] Test: Skills with tools intersect with phase allowlist correctly
- [ ] Test: Skills without phase config return phase allowlist
- [ ] Test: Multiple skills aggregate tools correctly
- [ ] Test: Multiple skills merge MCP servers correctly
- [ ] Test: Multiple skills collect context requirements correctly
- [ ] Test: Invalid skill IDs are skipped gracefully

#### Manual Verification:
- [ ] Create test skill config with tools exceeding phase permissions
- [ ] Verify tools are intersected (security boundary enforced)
- [ ] Verify MCP servers from skills are aggregated

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to Phase 3.

---

## Phase 3: JIT Context Orchestration

### Overview
Implement the context builder that loads files, git state, metadata, and artifacts based on skill requirements. This enables skills to specify what context they need and have that context automatically available.

### Changes Required:

#### 1. Create Context Builder (`src/agent/contextBuilder.ts`)

**File**: New file `src/agent/contextBuilder.ts`

**Changes**: Create new module

```typescript
/**
 * JIT Context Orchestration (Item 033)
 *
 * This module implements Just-In-Time context building based on skill requirements.
 * It collects files, git state, item metadata, and phase artifacts as needed.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { SkillContextRequirement } from "../schemas";
import type { Item } from "../schemas";
import type { ConfigResolved } from "../config";
import { getGitStatus, type GitFileChange } from "../git/status";

/**
 * Built context from skill requirements.
 * Maps requirement types to their collected content.
 */
export interface BuiltContext {
  /** Collected file contents by path */
  files: Record<string, string>;

  /** Git status summary */
  gitStatus?: string;

  /** Item metadata as JSON string */
  itemMetadata?: string;

  /** Phase artifact contents by artifact name */
  artifacts: Record<string, string>;

  /** Errors encountered during context collection */
  errors: string[];
}

/**
 * Build JIT context from skill requirements.
 *
 * This function collects context based on skill requirements:
 * - type="file": reads file at path
 * - type="git_status": runs git status
 * - type="item_metadata": serializes item metadata
 * - type="phase_artifact": loads specific phase artifact (research.md, plan.md, etc.)
 *
 * @param contextRequirements - Context requirements from loaded skills
 * @param item - Item metadata for serialization
 * @param config - Resolved config for paths
 * @param root - Repository root directory
 * @returns Built context with collected content
 */
export async function buildJitContext(
  contextRequirements: SkillContextRequirement[],
  item: Item,
  config: ConfigResolved,
  root: string
): Promise<BuiltContext> {
  const context: BuiltContext = {
    files: {},
    artifacts: {},
    errors: [],
  };

  if (contextRequirements.length === 0) {
    return context;
  }

  const itemDir = path.join(root, ".wreckit", "items", item.id);

  for (const req of contextRequirements) {
    if (!req) {
      continue;
    }

    try {
      switch (req.type) {
        case "file": {
          if (!req.path) {
            context.errors.push(`File requirement missing path`);
            continue;
          }
          const filePath = path.isAbsolute(req.path)
            ? req.path
            : path.join(root, req.path);
          const content = await fs.readFile(filePath, "utf-8");
          context.files[req.path] = content;
          break;
        }

        case "git_status": {
          const status: GitFileChange[] = await getGitStatus({ cwd: root, logger: console });
          context.gitStatus = formatGitStatus(status);
          break;
        }

        case "item_metadata": {
          const metadata = {
            id: item.id,
            title: item.title,
            section: item.section,
            state: item.state,
            overview: item.overview,
            branch: item.branch,
            pr_url: item.pr_url,
            created_at: item.created_at,
            updated_at: item.updated_at,
          };
          context.itemMetadata = JSON.stringify(metadata, null, 2);
          break;
        }

        case "phase_artifact": {
          if (!req.path) {
            context.errors.push(`Phase artifact requirement missing artifact name`);
            continue;
          }
          const artifactPath = path.join(itemDir, req.path);
          const content = await fs.readFile(artifactPath, "utf-8");
          context.artifacts[req.path] = content;
          break;
        }

        default:
          context.errors.push(`Unknown context requirement type: ${(req as any).type}`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      context.errors.push(`Failed to load context for ${req.type}${req.path ? ` (${req.path})` : ""}: ${errorMsg}`);
    }
  }

  return context;
}

/**
 * Format git status for context injection.
 */
function formatGitStatus(status: GitFileChange[]): string {
  if (status.length === 0) {
    return "No changes";
  }

  const lines = status.map((s) => {
    const statusChar = s.status === "A" ? "A" // Added
      : s.status === "D" ? "D" // Deleted
      : s.status === "M" ? "M" // Modified
      : s.status === "R" ? "R" // Renamed
      : "?"; // Untracked
    return `${statusChar} ${s.path}`;
  });

  return lines.join("\n");
}

/**
 * Format built context as markdown for prompt injection.
 * This creates a human-readable summary of collected context.
 */
export function formatContextForPrompt(context: BuiltContext): string {
  const sections: string[] = [];

  if (Object.keys(context.files).length > 0) {
    sections.push("## Files\n");
    for (const [filePath, content] of Object.entries(context.files)) {
      sections.push(`### ${filePath}\n`);
      sections.push(content.trim());
      sections.push("\n");
    }
  }

  if (context.gitStatus) {
    sections.push("## Git Status\n");
    sections.push(context.gitStatus);
    sections.push("\n");
  }

  if (context.itemMetadata) {
    sections.push("## Item Metadata\n");
    sections.push("```json");
    sections.push(context.itemMetadata);
    sections.push("```\n");
  }

  if (Object.keys(context.artifacts).length > 0) {
    sections.push("## Phase Artifacts\n");
    for (const [artifactName, content] of Object.entries(context.artifacts)) {
      sections.push(`### ${artifactName}\n`);
      sections.push(content.trim());
      sections.push("\n");
    }
  }

  if (context.errors.length > 0) {
    sections.push("## Context Loading Errors\n");
    sections.push("Some context could not be loaded:\n");
    for (const error of context.errors) {
      sections.push(`- ${error}\n`);
    }
  }

  return sections.join("\n");
}
```

#### 2. Extend Prompt Variables (`src/prompts.ts`)

**File**: `src/prompts.ts:8-22` (PromptVariables interface)

**Changes**: Add skill_context field

```typescript
export interface PromptVariables {
  id: string;
  title: string;
  section: string;
  overview: string;
  item_path: string;
  branch_name: string;
  base_branch: string;
  completion_signal: string;
  sdk_mode?: boolean;
  research?: string;
  plan?: string;
  prd?: string;
  progress?: string;
  // Add skill context for JIT loading (Item 033)
  skill_context?: string;
}
```

#### 3. Update Prompt Render (`src/prompts.ts`)

**File**: `src/prompts.ts:73-87` (variable map in renderPrompt)

**Changes**: Add skill_context to variable map

```typescript
  const varMap: Record<string, string | undefined> = {
    id: variables.id,
    title: variables.title,
    section: variables.section,
    overview: variables.overview,
    item_path: variables.item_path,
    branch_name: variables.branch_name,
    base_branch: variables.base_branch,
    completion_signal: variables.completion_signal,
    sdk_mode: variables.sdk_mode ? "true" : "",
    research: variables.research,
    plan: variables.plan,
    prd: variables.prd,
    progress: variables.progress,
    skill_context: variables.skill_context, // Add skill context
  };
```

### Success Criteria:

#### Automated Verification:
- [ ] `npm run typecheck` passes
- [ ] Test: Empty requirements returns empty context
- [ ] Test: File context loads correctly
- [ ] Test: Git status loads and formats correctly
- [ ] Test: Item metadata serializes correctly
- [ ] Test: Phase artifacts load correctly
- [ ] Test: Errors are collected but don't stop processing
- [ ] Test: Context formatting produces valid markdown

#### Manual Verification:
- [ ] Create skill with `required_context` for various types
- [ ] Verify context is built and injected into prompt

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to Phase 4.

---

## Phase 4: Phase Integration

### Overview
Integrate the skill loader and context builder into the workflow phase execution. This is the "glue" phase that connects all previous components and makes the feature functional end-to-end.

### Changes Required:

#### 1. Update buildPromptVariables (`src/workflow/itemWorkflow.ts`)

**File**: `src/workflow/itemWorkflow.ts:168-201` (buildPromptVariables function)

**Changes**: Add skill context building

First, add imports at top of file (around line 1-20):

```typescript
import { loadSkillsForPhase } from "../agent/skillLoader";
import { buildJitContext, formatContextForPrompt } from "../agent/contextBuilder";
```

Then modify the function signature and implementation:

```typescript
async function buildPromptVariables(
  root: string,
  item: Item,
  config: ConfigResolved,
  phase?: string, // Add optional phase parameter for skill loading
): Promise<PromptVariables> {
  const itemDir = getItemDir(root, item.id);
  const branchName = `${config.branch_prefix}${item.id.replace("/", "-")}`;

  const research = await readFileIfExists(getResearchPath(root, item.id));
  const plan = await readFileIfExists(getPlanPath(root, item.id));
  const prdContent = await readFileIfExists(getPrdPath(root, item.id));
  const progress = await readFileIfExists(getProgressLogPath(root, item.id));

  // Determine completion_signal and sdk_mode based on agent kind
  const agent = config.agent;
  const isProcessMode = agent.kind === "process";
  const completionSignal = isProcessMode ? agent.completion_signal : "<promise>COMPLETE</promise>";

  // Build skill context if phase specified and skills configured (Item 033)
  let skillContext: string | undefined;
  if (phase && config.skills) {
    const skillResult = loadSkillsForPhase(phase, config.skills);

    if (skillResult.contextRequirements.length > 0) {
      const context = await buildJitContext(
        skillResult.contextRequirements,
        item,
        config,
        root
      );
      skillContext = formatContextForPrompt(context);

      // Log context loading for transparency
      if (skillResult.loadedSkillIds.length > 0) {
        console.log(`Loaded skills for phase '${phase}': ${skillResult.loadedSkillIds.join(", ")}`);
      }
      if (Object.keys(context.files).length > 0 || Object.keys(context.artifacts).length > 0) {
        console.log(`JIT context: ${Object.keys(context.files).length} file(s), ${Object.keys(context.artifacts).length} artifact(s)`);
      }
      if (context.errors.length > 0) {
        console.warn(`Context loading errors: ${context.errors.join("; ")}`);
      }
    }
  }

  return {
    id: item.id,
    title: item.title,
    section: item.section ?? "items",
    overview: item.overview,
    item_path: itemDir,
    branch_name: branchName,
    base_branch: config.base_branch,
    completion_signal: completionSignal,
    sdk_mode: !isProcessMode,
    research,
    plan,
    prd: prdContent,
    progress,
    skill_context: skillContext, // Add skill context
  };
}
```

#### 2. Update Research Phase (`src/workflow/itemWorkflow.ts`)

**File**: `src/workflow/itemWorkflow.ts:246` (runPhaseResearch)

**Changes**: Load skills and integrate

```typescript
  const template = await loadPromptTemplate(root, "research");
  const baseVariables = await buildPromptVariables(root, item, config, "research"); // Add phase

  const itemDir = getItemDir(root, item.id);
  const agentConfig = getAgentConfigUnion(config);

  // Load skills for research phase (Item 033)
  const skillResult = loadSkillsForPhase("research", config.skills);

  // ... (existing validation loop)

    const result = await runAgentUnion({
      config: agentConfig,
      cwd: itemDir,
      prompt,
      logger,
      dryRun,
      mockAgent,
      timeoutSeconds: config.timeout_seconds,
      onStdoutChunk: onAgentOutput,
      onStderrChunk: onAgentOutput,
      onAgentEvent,
      // Merge skill MCP servers (Item 033)
      mcpServers: {
        ...(skillResult.mcpServers || {}),
      },
      // Use skill-merged tool allowlist (or phase tools if no skills)
      allowedTools: skillResult.allowedTools,
    });
```

#### 3. Update Plan Phase (`src/workflow/itemWorkflow.ts`)

**File**: `src/workflow/itemWorkflow.ts:408` (runPhasePlan)

**Changes**: Load skills and merge MCP servers

```typescript
  const template = await loadPromptTemplate(root, "plan");
  const baseVariables = await buildPromptVariables(root, item, config, "plan"); // Add phase

  const itemDir = getItemDir(root, item.id);
  const agentConfig = getAgentConfigUnion(config);

  // ... (existing validation loop)

    // Create MCP server to capture PRD via tool call
    let capturedPrd: Prd | null = null;
    const wreckitServer = createWreckitMcpServer({
      onSavePrd: (prd) => {
        capturedPrd = prd;
      },
    });

    // Load skills for plan phase (Item 033)
    const skillResult = loadSkillsForPhase("plan", config.skills);

    const result = await runAgentUnion({
      config: agentConfig,
      cwd: itemDir,
      prompt,
      logger,
      dryRun,
      mockAgent,
      timeoutSeconds: config.timeout_seconds,
      onStdoutChunk: onAgentOutput,
      onStderrChunk: onAgentOutput,
      onAgentEvent,
      // Merge wreckit MCP server with skill MCP servers (Item 033)
      mcpServers: {
        wreckit: wreckitServer,
        ...(skillResult.mcpServers || {}),
      },
      // Use skill-merged tool allowlist (or phase tools if no skills)
      allowedTools: skillResult.allowedTools,
    });
```

#### 4. Update Implement and PR Phases

**File**: `src/workflow/itemWorkflow.ts` (runPhaseImplement, runPhasePr)

**Changes**: Similar pattern - load skills, merge MCP servers, use skill tools

### Success Criteria:

#### Automated Verification:
- [ ] `npm run typecheck` passes
- [ ] Integration test: Research phase with skills
- [ ] Integration test: Plan phase with skills
- [ ] Integration test: Implement phase with skills
- [ ] Backward compatibility test: All phases work without skills config

#### Manual Verification:
- [ ] Create `.wreckit/skills.json` with phase_skills mapping
- [ ] Run `wreckit research <id>` and verify skills are loaded
- [ ] Verify skill context is injected into prompts
- [ ] Verify skill MCP servers are available to agent
- [ ] Verify skill tools are restricted by phase allowlist
- [ ] Remove `.wreckit/skills.json` and verify backward compatibility

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to Phase 5.

---

## Phase 5: Configuration and Documentation

### Overview
Create default skill definitions, update documentation, and add examples. This phase makes the feature discoverable and usable by end users.

### Changes Required:

#### 1. Create Default Skills (`.wreckit/skills.json`)

**File**: `.wreckit/skills.json` (in repository root)

**Changes**: Create example skills configuration

```json
{
  "phase_skills": {
    "research": ["code-exploration", "context-awareness"],
    "plan": ["documentation-writer"],
    "implement": ["full-capability"],
    "pr": ["git-integration"],
    "complete": ["verification"]
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
          "description": "Current repository state for context"
        },
        {
          "type": "item_metadata",
          "description": "Item metadata for context"
        }
      ]
    },
    {
      "id": "context-awareness",
      "name": "Context Awareness",
      "description": "Loads existing research and plan for context",
      "tools": [],
      "required_context": [
        {
          "type": "phase_artifact",
          "path": "research.md",
          "description": "Existing research document"
        }
      ]
    },
    {
      "id": "documentation-writer",
      "name": "Documentation Writer",
      "description": "Read and write tools for creating plan and PRD documents",
      "tools": ["Read", "Write", "Edit", "Glob", "Grep"],
      "required_context": [
        {
          "type": "phase_artifact",
          "path": "research.md",
          "description": "Research as input for planning"
        }
      ]
    },
    {
      "id": "full-capability",
      "name": "Full Implementation Capability",
      "description": "All tools available for implementation phase",
      "tools": ["Read", "Write", "Edit", "Glob", "Grep", "Bash", "mcp__wreckit__update_story_status"],
      "required_context": [
        {
          "type": "phase_artifact",
          "path": "plan.md",
          "description": "Implementation plan"
        },
        {
          "type": "phase_artifact",
          "path": "prd.json",
          "description": "User stories to implement"
        }
      ]
    },
    {
      "id": "git-integration",
      "name": "Git Integration",
      "description": "Read tools for verification and bash for git operations",
      "tools": ["Read", "Glob", "Grep", "Bash"],
      "required_context": [
        {
          "type": "git_status",
          "description": "Git status for PR creation"
        }
      ]
    },
    {
      "id": "verification",
      "name": "Verification",
      "description": "Read-only tools for final verification",
      "tools": ["Read", "Glob", "Grep"],
      "required_context": [
        {
          "type": "git_status",
          "description": "Final git state verification"
        }
      ]
    }
  ]
}
```

#### 2. Create Documentation (`docs/skills.md`)

**File**: `docs/skills.md`

**Changes**: Create comprehensive documentation covering:
- Overview and motivation
- Configuration format
- Skill schema reference
- Context requirement types
- Security model (intersection with phase permissions)
- Tool names reference
- Examples (code-analysis, test-generation, refactoring)
- Best practices
- Troubleshooting guide

See full documentation in research.md or create comprehensive guide.

### Success Criteria:

#### Automated Verification:
- [ ] `.wreckit/skills.json` validates against SkillConfigSchema
- [ ] Documentation is clear and complete

#### Manual Verification:
- [ ] Example skills work when tested
- [ ] Documentation is understandable

**Note**: This is the final phase. Complete all verification, then confirm full end-to-end functionality.

---

## Testing Strategy

### Unit Tests

**Skill Loader Tests** (`src/__tests__/skillLoader.test.ts`):
- Test loading with no skill config (returns phase tools)
- Test loading with empty phase_skills (returns phase tools)
- Test loading with valid skills (merges tools correctly)
- Test tool intersection with phase permissions
- Test MCP server aggregation from multiple skills
- Test context requirement collection
- Test unknown skill IDs (gracefully skipped)

**Context Builder Tests** (`src/__tests__/contextBuilder.test.ts`):
- Test empty requirements (returns empty context)
- Test file context loading
- Test git status loading
- Test item metadata serialization
- Test phase artifact loading
- Test error handling (missing files, permission errors)
- Test context formatting for prompts

### Integration Tests

**End-to-End Phase Execution with Skills**:
1. Create test wreckit config with skills
2. Run research phase with code-exploration skill
3. Verify tools restricted to skill tools
4. Verify context injected into prompt
5. Run plan phase with documentation-writer skill
6. Verify MCP servers available
7. Verify artifacts accessible in context

**Backward Compatibility Tests**:
1. Run wreckit without skills config
2. Verify behavior matches pre-skill implementation
3. Verify all phases work unchanged
4. Verify tool allowlists respected

### Manual Testing Steps

1. **Test basic skill loading:**
   ```bash
   cd /path/to/test/repo
   wreckit init
   # Create .wreckit/skills.json with example skills
   wreckit item create --title "Test Skill Loading"
   wreckit phase research --dry-run
   # Check logs for "Loaded skills for phase 'research': ..."
   ```

2. **Test tool restrictions:**
   ```bash
   wreckit phase research
   # Agent should only have tools from skill ∩ phase allowlist
   ```

3. **Test context injection:**
   ```bash
   wreckit phase research
   # Check that {{skill_context}} appears in prompt
   ```

4. **Test backward compatibility:**
   ```bash
   rm .wreckit/skills.json
   wreckit phase research
   # Should work exactly as before
   ```

## Migration Notes

**For existing wreckit users:**

This change is **fully backward compatible**. Existing configs without skills will continue to work unchanged using static tool allowlists.

**To adopt skills (optional):**

1. Create `.wreckit/skills.json` in your repo root
2. Define skills for the phases you want to customize
3. Map phases to skill IDs in `phase_skills`
4. Test with `--dry-run` first

**Rollback:**

If skills cause issues, simply delete `.wreckit/skills.json` to revert to static tool allowlists.

## References

- Research: `/Users/speed/wreckit/.wreckit/items/033-implement-phase-specific-skill-loading-jit-context/research.md`
- Tool allowlists: `src/agent/toolAllowlist.ts:57-117`
- Agent runner: `src/agent/runner.ts:348-494`
- Phase execution: `src/workflow/itemWorkflow.ts:203-366` (research), `:368-573` (plan), `:575-796` (implement)
- Schemas: `src/schemas.ts:64-70` (agent config), `:80-91` (config schema)
- Prompts: `src/prompts.ts:55-95` (rendering), `src/prompts/*.md` (templates)
- MCP server: `src/agent/mcp/wreckitMcpServer.ts`
