# Research: Implement Phase-Specific Skill Loading (JIT Context Orchestration)

**Date**: 2025-01-25
**Item**: 033-implement-phase-specific-skill-loading-jit-context

## Research Question
From milestone [M4] Recursive Evolution & Skill-Based Media Layer

**Motivation:** Strategic milestone: Recursive Evolution & Skill-Based Media Layer

## Summary

This research investigates implementing phase-specific skill loading with Just-In-Time (JIT) context orchestration for the Wreckit autonomous agent system. The goal is to enable agents to dynamically load specialized skills and context based on the current workflow phase, improving efficiency and enabling the M4 milestone's Recursive Evolution & Skill-Based Media Layer.

Based on comprehensive codebase analysis, Wreckit currently implements a sophisticated multi-phase workflow with tool allowlists and agent abstraction, but lacks dynamic skill loading. The system has:

1. **Phase-based tool allowlisting** (`src/agent/toolAllowlist.ts:57-117`): Restricts which tools agents can use in each phase
2. **Discriminated union agent system** (`src/agent/runner.ts:389-494`): Supports Claude, Amp, Codex, OpenCode SDKs and process-based agents
3. **Prompt templating system** (`src/prompts.ts:55-95`): Renders phase-specific prompts with variable substitution
4. **MCP server integration** (`src/agent/mcp/wreckitMcpServer.ts:47-145`): Provides custom tools for structured data capture
5. **Multi-phase workflow execution** (`src/workflow/itemWorkflow.ts:203-1281`): Orchestrates research, plan, implement, critique, pr, and complete phases
6. **Campaign and dependency support** (`src/schemas.ts:129-130`): Items have `depends_on` and `campaign` fields from item 022

The proposed implementation would extend this architecture to support JIT skill loading, where skills (reusable code patterns, domain knowledge, or specialized capabilities like Manim/Remotion for media generation) can be dynamically loaded into the agent's context based on the current phase and item requirements. This is foundational for:
- **Item 034** (`wreckit learn` command): Compiles codebase patterns into reusable skill artifacts
- **Item 035** (autonomous media layer): Integrates Manim and Remotion skills for video generation
- **Item 036** (wreckit summarize): Generates 30-second feature visualizations using media skills

## Current State Analysis

### Existing Implementation

**Phase System Architecture:**

Wreckit implements a linear phase progression system (`src/commands/phase.ts:39-84`):

```typescript
const PHASE_CONFIG: Record<Phase, {
  requiredState: WorkflowState | WorkflowState[];
  targetState: WorkflowState;
  skipIfInTarget: boolean;
  runFn: (itemId: string, options: WorkflowOptions) => Promise<PhaseResult>;
}> = {
  research: { requiredState: "idea", targetState: "researched", ... },
  plan: { requiredState: "researched", targetState: "planned", ... },
  implement: { requiredState: ["planned", "implementing"], targetState: "implementing", ... },
  critique: { requiredState: ["implementing", "critique"], targetState: "critique", ... },
  pr: { requiredState: "critique", targetState: "in_pr", ... },
  complete: { requiredState: "in_pr", targetState: "done", ... },
};
```

**State Machine** (`src/domain/states.ts:12-19`):
```typescript
export const WORKFLOW_STATES: WorkflowState[] = [
  "idea", "researched", "planned", "implementing", "in_pr", "done"
];
```

**Tool Allowlist System** (`src/agent/toolAllowlist.ts:57-117`):

The tool allowlist module implements phase-based tool restrictions using a Record pattern:

```typescript
export const PHASE_TOOL_ALLOWLISTS: Record<string, ToolName[] | undefined> = {
  // Research phase: Read-only tools for codebase exploration + Write for research.md
  research: [
    AVAILABLE_TOOLS.Read,
    AVAILABLE_TOOLS.Write,
    AVAILABLE_TOOLS.Glob,
    AVAILABLE_TOOLS.Grep,
  ],

  // Plan phase: Read + Write for creating plan.md and prd.json
  plan: [
    AVAILABLE_TOOLS.Read,
    AVAILABLE_TOOLS.Write,
    AVAILABLE_TOOLS.Edit,
    AVAILABLE_TOOLS.Glob,
    AVAILABLE_TOOLS.Grep,
    AVAILABLE_TOOLS.wreckit_save_prd,
  ],

  // Implement phase: Full tool access for implementation
  implement: [
    AVAILABLE_TOOLS.Read,
    AVAILABLE_TOOLS.Write,
    AVAILABLE_TOOLS.Edit,
    AVAILABLE_TOOLS.Glob,
    AVAILABLE_TOOLS.Grep,
    AVAILABLE_TOOLS.Bash,
    AVAILABLE_TOOLS.wreckit_update_story_status,
  ],
  // ... pr, complete, strategy phases
};
```

**Agent Dispatch System** (`src/agent/runner.ts:348-494`):

The discriminated union system supports multiple agent backends:

```typescript
export async function runAgentUnion(options: UnionRunAgentOptions): Promise<AgentResult> {
  switch (config.kind) {
    case "process": /* ... */
    case "claude_sdk": { /* ... */ }
    case "amp_sdk": { /* ... */ }
    case "codex_sdk": { /* ... */ }
    case "opencode_sdk": { /* ... */ }
    default: return exhaustiveCheck(config);
  }
}
```

All agents accept `allowedTools` parameter (line 337) and `mcpServers` parameter (line 335).

**Prompt Rendering System** (`src/prompts.ts:55-95`):

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
}
```

Each phase loads a template from `.wreckit/prompts/<phase>.md` and renders it with item-specific context.

**MCP Server Pattern** (`src/agent/mcp/wreckitMcpServer.ts:47-145`):

Custom MCP tools provide structured data capture:
- `save_interview_ideas`: Captures ideas from interview sessions
- `save_parsed_ideas`: Saves parsed ideas from documents
- `save_prd`: Saves PRD with user stories during planning phase
- `update_story_status`: Updates story status during implementation
- `complete`: Marks workflow complete

**Phase Execution Example** (`src/workflow/itemWorkflow.ts:203-366`):

The research phase demonstrates the pattern:
1. Load item and check preconditions (lines 218-238)
2. Load prompt template and build variables (lines 245-246)
3. Capture git status for read-only enforcement (lines 252-254)
4. Run agent with tool allowlist (lines 273-286)
5. Validate output quality with retry loop (lines 256-359)
6. Enforce read-only behavior via git status comparison (lines 328-343)
7. Update item state (lines 345-358)

### Key Files

**Core Phase and Tool System:**
- `src/commands/phase.ts:39-84` - PHASE_CONFIG mapping phases to state transitions and execution functions
- `src/domain/states.ts:12-19` - WORKFLOW_STATES array defining linear state progression
- `src/agent/toolAllowlist.ts:57-117` - PHASE_TOOL_ALLOWLISTS defining per-phase tool access
- `src/agent/toolAllowlist.ts:125-127` - getAllowedToolsForPhase() function for querying tool restrictions

**Agent Execution:**
- `src/agent/runner.ts:348-494` - runAgentUnion() dispatch system for multiple SDK backends
- `src/agent/runner.ts:389-493` - Switch statement handling each agent kind (process, claude_sdk, amp_sdk, codex_sdk, opencode_sdk)
- `src/agent/runner.ts:56-86` - RunAgentOptions interface showing allowedTools and mcpServers parameters

**Workflow Implementation:**
- `src/workflow/itemWorkflow.ts:203-366` - runPhaseResearch() with tool allowlist enforcement and validation
- `src/workflow/itemWorkflow.ts:368-573` - runPhasePlan() with MCP server for PRD capture
- `src/workflow/itemWorkflow.ts:168-201` - buildPromptVariables() function for context assembly
- `src/workflow/itemWorkflow.ts:256-359` - Multi-retry validation pattern with feedback loop

**Prompt System:**
- `src/prompts.ts:8-22` - PromptVariables interface defining available template variables
- `src/prompts.ts:55-95` - renderPrompt() function for variable substitution and conditionals
- `src/prompts/implement.md:1-42` - Example prompt template showing variable usage

**MCP Integration:**
- `src/agent/mcp/wreckitMcpServer.ts:47-145` - createWreckitMcpServer() function with tool definitions
- `src/agent/mcp/wreckitMcpServer.ts:7-37` - Zod schemas for structured data (ParsedIdeaSchema, StorySchema, PrdDataSchema)
- `src/agent/mcp/wreckitMcpServer.ts:39-45` - WreckitMcpHandlers interface for tool callbacks

**Schema and Configuration:**
- `src/schemas.ts:64-70` - AgentConfigUnionSchema discriminated union for agent kinds
- `src/schemas.ts:95-131` - ItemSchema with campaign and depends_on fields (from item 022)
- `src/schemas.ts:133-147` - StorySchema and PrdSchema for structured user stories

**Related M4 Items:**
- `.wreckit/items/034-create-wreckit-learn-command-to-compile-codebase-p/item.json:15-18` - Depends on item 033 (this item)
- `.wreckit/items/035-implement-autonomous-media-layer-integration-with-/item.json:15-18` - Depends on item 034
- `.wreckit/items/036-create-wreckit-summarize-to-generate-30-second-fea/item.json:15-18` - Depends on item 035

## Technical Considerations

### Dependencies

**External Dependencies:**
- `@anthropic-ai/claude-agent-sdk` (^0.2.7) - Agent execution, tool allowlists, and MCP server creation
- `zod` (^4.3.5) - Schema validation for skill artifacts and configuration
- Existing MCP infrastructure for tool creation and structured data capture

**Internal Modules to Integrate With:**
- `src/agent/toolAllowlist.ts` - Extend with skill loading logic and skill-tool merging
- `src/prompts.ts` - Add skill context to PromptVariables interface
- `src/workflow/itemWorkflow.ts` - Inject skill loading into phase execution flow
- `src/agent/mcp/wreckitMcpServer.ts` - Add skill management MCP tools (load_skill, list_skills)
- `src/schemas.ts` - Add SkillSchema for skill artifact validation
- `src/commands/phase.ts` - No changes needed (phase system is stable)

### Patterns to Follow

**1. Phase-Based Record Pattern (from toolAllowlist.ts:57):**

```typescript
export const PHASE_TOOL_ALLOWLISTS: Record<string, ToolName[] | undefined> = {
  research: [/* tools */],
  plan: [/* tools */],
  implement: [/* tools */],
};
```

Apply similar pattern for skills:
```typescript
export const PHASE_SKILL_REQUIREMENTS: Record<string, string[] | undefined> = {
  research: ["codebase-exploration", "pattern-detection", "dependency-analysis"],
  plan: ["architecture-design", "user-story-breakdown", "estimation"],
  implement: ["test-driven-development", "error-handling", "code-organization"],
};
```

**2. Prompt Variable Extension Pattern (from prompts.ts:8-22):**

PromptVariables are built in `buildPromptVariables` (itemWorkflow.ts:168-201). Extend to include skill context:
```typescript
export interface PromptVariables {
  // ... existing fields
  skills?: string;        // Concatenated skill content
  skills_metadata?: string; // JSON string of skill dependencies
}
```

**3. MCP Tool Pattern (from wreckitMcpServer.ts:52-67):**

For skill management, add MCP tools following existing pattern:
```typescript
tool(
  "load_skill",
  "Load a skill artifact into the agent context",
  {
    skill_name: z.string(),
    phase: z.string(),
  },
  async (args) => {
    // Load skill and return content
  }
)
```

**4. Dependency and Campaign Pattern (from item 022):**

Items have `depends_on` and `campaign` fields. M4 items form a dependency chain:
- Item 033 (this item): Foundation, no dependencies in M4
- Item 034: Depends on 033 for skill loading API
- Item 035: Depends on 034 for skill compilation + media skills
- Item 036: Depends on 035 for media generation capabilities

Skills should follow similar pattern:
- Skills have `depends_on_skills` field for skill dependencies
- Skills are grouped by campaign (e.g., "M4-media-skills")
- Skill registry enables discovery and dependency resolution

**5. Multi-Retry Validation Pattern (from itemWorkflow.ts:256-359):**

Research phase uses retry loop with validation feedback:
```typescript
let attempt = 0;
const maxAttempts = 3;
while (attempt < maxAttempts) {
  // Run agent
  // Validate output
  if (!validation.valid) {
    validationError = validation.errors.join("\n");
    continue; // Retry with feedback
  }
  break; // Success
}
```

Apply similar pattern for skill loading:
- Validate skill artifact exists and has correct schema
- Retry with degraded context if skill load fails
- Log warnings but don't fail hard (graceful degradation)

**6. Schema Validation Pattern (from schemas.ts:1-70):**

All config/data uses Zod for runtime validation:
```typescript
export const SkillSchema = z.object({
  schema_version: z.literal(1),
  name: z.string(),
  phase: z.enum(["research", "plan", "implement", "critique", "pr", "complete"]),
  description: z.string(),
  content: z.string(), // Markdown instructions/patterns
  required_tools: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  depends_on_skills: z.array(z.string()).optional(),
});
```

### Conventions Observed in the Codebase

- **TypeScript with Zod schemas** - All configuration and data structures use Zod for runtime validation
- **File-based truth** - State stored in `.wreckit/` directory as JSON and Markdown files
- **Agent abstraction via union types** - Multiple backends (Claude, Amp, Codex, OpenCode) behind single interface
- **Security via tool allowlisting** - Phase-specific tool restrictions enforced at SDK layer
- **MCP for structured data** - Custom tools for validated data capture (PRD, ideas, story status)
- **Template-based prompts** - User-overridable prompt templates in `.wreckit/prompts/`
- **Linear phase progression** - Strict state machine with defined transitions
- **Retry with validation** - Phases validate output and retry with feedback on failure

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Context window overflow** - Loading too many skills may exceed agent token limits | High | Implement skill priority system, compress skill content, selective loading based on item metadata (campaign, section, tags), and context budget management |
| **Skill version conflicts** - Skills may conflict with each other or project code | Medium | Implement skill validation sandbox, conflict detection via `depends_on_skills`, allow skill override declarations, and semantic versioning |
| **Backward compatibility** - Existing items without skills may break | Medium | Make skill loading opt-in via item metadata, provide graceful degradation if skills missing, never fail hard on missing skills |
| **Skill discovery** - Agents may not know which skills to load | Medium | Implement skill registry with metadata (phase, tags, dependencies), auto-loading based on item campaign/section, and `wreckit skills list` command |
| **Performance degradation** - Loading skills on every phase execution may slow workflow | Medium | Implement skill caching with LRU eviction, lazy loading of skill content, and parallel async skill artifact reads |
| **M4 milestone coupling** - This item blocks items 034 and 035 | High | Ensure API is extensible for future skill types (media skills, analysis skills), not just code patterns. Design for skill composition and dependency graphs |
| **Tool allowlist conflicts** - Skills may require tools not allowed in current phase | Medium | Validate skill requirements against phase tool allowlist at load time, fail fast with clear error messages, and restrict skills to phase tool subsets |
| **MCP server complexity** - Skills may require custom MCP servers | Medium | Support skill-defined MCP servers merged with wreckit server, validate MCP tool naming conflicts, and document MCP server composition pattern |
| **Skill quality validation** - Poorly written skills could degrade agent performance | High | Implement skill quality checks (length, structure, examples), user feedback mechanism, and skill rating/review system |
| **Multi-SDK compatibility** - Different SDKs may handle tools/MCP differently | Medium | Test skill loading across all SDK backends, provide fallback for incompatible backends, document SDK-specific limitations |

## Recommended Approach

Based on research findings, implement phase-specific skill loading in five incremental phases:

### Phase 1: Skill Artifact Infrastructure

**1.1 Define Skill Schema** (`src/schemas.ts`):

```typescript
export const SkillSchema = z.object({
  schema_version: z.literal(1),
  name: z.string(),
  phase: z.enum(["research", "plan", "implement", "critique", "pr", "complete"]),
  description: z.string(),
  content: z.string().describe("Markdown content with patterns, examples, instructions"),
  required_tools: z.array(z.string()).optional().describe("Tools this skill needs"),
  tags: z.array(z.string()).optional().describe("Discovery tags: 'testing', 'media', 'analysis'"),
  depends_on_skills: z.array(z.string()).optional().describe("Skill dependency graph"),
  version: z.string().optional().describe("Semantic version for evolution"),
});

export const SkillIndexSchema = z.object({
  schema_version: z.literal(1),
  skills: z.array(z.object({
    name: z.string(),
    phase: z.string(),
    path: z.string(),
    tags: z.array(z.string()),
    version: z.string().optional(),
  })),
  last_updated: z.string(),
});
```

**1.2 Create Skill Storage Structure**:

```
.wreckit/
  skills/
    research/
      codebase-analysis.md
      codebase-analysis.json (metadata)
      pattern-detection.md
      pattern-detection.json
    plan/
      architecture-design.md
      architecture-design.json
    implement/
      test-driven-development.md
      test-driven-development.json
      media-generation.md (for M4)
      media-generation.json
    index.json (skill registry)
```

**1.3 Add Skill Loading Utilities** (`src/skills/loader.ts`):

```typescript
export async function loadSkill(
  root: string,
  phase: string,
  skillName: string
): Promise<Skill | null> {
  const skillPath = path.join(root, ".wreckit", "skills", phase, `${skillName}.json`);
  try {
    const content = await fs.readFile(skillPath, "utf-8");
    const skill = SkillSchema.parse(JSON.parse(content));
    return skill;
  } catch (err) {
    return null; // Graceful degradation
  }
}

export async function loadSkillsForPhase(
  root: string,
  phase: string,
  item: Item
): Promise<Skill[]> {
  // Auto-load based on campaign, section, tags
  // Resolve dependency graph
  // Validate against tool allowlist
  // Return ordered skill array
}

export function validateSkill(
  skill: Skill,
  allowedTools: string[]
): ValidationResult {
  // Check skill schema
  // Verify required_tools subset of allowedTools
  // Resolve depends_on_skills graph
  // Detect cycles
}
```

### Phase 2: JIT Context Orchestration

**2.1 Extend PromptVariables** (`src/prompts.ts`):

```typescript
export interface PromptVariables {
  // ... existing fields
  skills?: string;        // Concatenated skill content (Markdown)
  skills_metadata?: string; // JSON string of skill info
}
```

**2.2 Modify buildPromptVariables** (`src/workflow/itemWorkflow.ts:168-201`):

```typescript
async function buildPromptVariables(
  root: string,
  item: Item,
  config: ConfigResolved
): Promise<PromptVariables> {
  // ... existing code

  // NEW: Load skills for inferred phase
  // (Phase will be determined by caller: research, plan, implement, etc.)
  const phase = inferPhaseFromItemState(item.state);
  const skills = await loadSkillsForPhase(root, phase, item);

  // Concatenate skill content
  const skillsContent = skills
    .map(s => `## Skill: ${s.name}\n\n${s.content}`)
    .join("\n\n");

  const skillsMetadata = JSON.stringify({
    count: skills.length,
    names: skills.map(s => s.name),
    dependencies: skills.flatMap(s => s.depends_on_skills ?? []),
  });

  return {
    // ... existing fields
    skills: skillsContent,
    skills_metadata: skillsMetadata,
  };
}
```

**2.3 Update Phase Templates** (`.wreckit/prompts/*.md`):

Add skills section to relevant templates:

```markdown
## Available Skills
{{#if skills}}
The following skills and patterns are available for this phase:

{{skills}}

Skill Metadata: {{skills_metadata}}
{{/if}}
```

### Phase 3: Skill Registry and Discovery

**3.1 Create Skill Index** (`src/skills/registry.ts`):

```typescript
export async function indexSkills(root: string): Promise<void> {
  // Scan .wreckit/skills/<phase>/*.json
  // Build index.json with metadata
  // Resolve dependency graph
  // Detect conflicts and cycles
}

export async function findSkills(
  root: string,
  phase: string,
  tags?: string[]
): Promise<Skill[]> {
  // Query skill index
  // Filter by phase and tags
  // Return matching skills
}

export async function validateSkillDependencies(
  root: string,
  skill: Skill
): Promise<boolean> {
  // Check depends_on_skills exist
  // Detect circular dependencies
  // Return validation result
}
```

**3.2 Add Skill Management CLI** (`src/commands/skills.ts`):

```typescript
export async function skillsList(root: string, options: { phase?: string }): Promise<void> {
  // List available skills, optionally filtered by phase
}

export async function skillsValidate(root: string): Promise<void> {
  // Validate all skill artifacts
  // Check schema, dependencies, tool conflicts
  // Report errors
}

export async function skillsIndex(root: string): Promise<void> {
  // Rebuild skill index
  // Scan skills directory
  // Update index.json
}
```

**3.3 Implement Auto-Loading**:

```typescript
// In loadSkillsForPhase()
async function autoLoadSkills(root: string, phase: string, item: Item): Promise<Skill[]> {
  const skills: Skill[] = [];

  // 1. Load based on campaign (e.g., M4 loads media skills)
  if (item.campaign === "M4" && phase === "implement") {
    const mediaSkill = await loadSkill(root, phase, "media-generation");
    if (mediaSkill) skills.push(mediaSkill);
  }

  // 2. Load based on section (e.g., features/ loads UI skills)
  const sectionSkills = await findSkills(root, phase, [item.section ?? "items"]);
  skills.push(...sectionSkills);

  // 3. Load based on item tags (if added to schema)
  // if (item.tags) { ... }

  // 4. Resolve dependencies
  const resolved = await resolveSkillDependencies(root, skills);

  // 5. Validate tool requirements
  const allowedTools = getAllowedToolsForPhase(phase);
  const valid = resolved.filter(s => validateSkill(s, allowedTools ?? []).valid);

  return valid;
}
```

### Phase 4: MCP Integration

**4.1 Add Skill MCP Tools** (`src/agent/mcp/wreckitMcpServer.ts`):

```typescript
export function createWreckitMcpServer(handlers: WreckitMcpHandlers = {}) {
  return createSdkMcpServer({
    name: "wreckit",
    version: "1.0.0",
    tools: [
      // ... existing tools
      tool(
        "load_skill",
        "Load a skill artifact into the agent context",
        {
          skill_name: z.string(),
          phase: z.string(),
        },
        async (args) => {
          const skill = await handlers.onLoadSkill?.(args.skill_name, args.phase);
          if (!skill) {
            return {
              content: [{
                type: "text",
                text: `Skill '${args.skill_name}' not found for phase '${args.phase}'`,
              }],
            };
          }
          return {
            content: [{
              type: "text",
              text: `Loaded skill: ${skill.name}\n\n${skill.content}`,
            }],
          };
        }
      ),
      tool(
        "list_skills",
        "List available skills for a phase",
        {
          phase: z.string(),
        },
        async (args) => {
          const skills = await handlers.onListSkills?.(args.phase);
          return {
            content: [{
              type: "text",
              text: `Available skills for phase '${args.phase}':\n${skills?.map(s => `- ${s.name}: ${s.description}`).join("\n")}`,
            }],
          };
        }
      ),
    ],
  });
}
```

**4.2 Extend WreckitMcpHandlers**:

```typescript
export interface WreckitMcpHandlers {
  // ... existing handlers
  onLoadSkill?: (skillName: string, phase: string) => Promise<Skill | null>;
  onListSkills?: (phase: string) => Promise<Skill[]>;
}
```

### Phase 5: Integration and Testing

**5.1 Update Phase Execution** (`src/workflow/itemWorkflow.ts`):

In each phase function (research, plan, implement, etc.), after building prompt variables:

```typescript
// After buildPromptVariables()
const variables = await buildPromptVariables(root, item, config);
// variables.skills and variables.skills_metadata are now populated

// Load skill MCP server if skills exist
let skillMcpServer;
if (variables.skills) {
  skillMcpServer = createSkillMcpServer({
    onLoadSkill: async (name, phase) => loadSkill(root, phase, name),
    onListSkills: async (phase) => findSkills(root, phase),
  });
}

// Merge MCP servers
const mcpServers = {
  wreckit: wreckitServer,
  ...(skillMcpServer ? { skills: skillMcpServer } : {}),
};

// Run agent with skills in prompt and MCP
const result = await runAgentUnion({
  config: agentConfig,
  cwd: itemDir,
  prompt: renderPrompt(template, variables),
  logger,
  mcpServers, // Includes skill MCP server
  allowedTools: getAllowedToolsForPhase(phase),
});
```

**5.2 Add Tests** (`src/__tests__/skills/`):

- `loader.test.ts` - Test skill loading, validation, dependency resolution
- `registry.test.ts` - Test skill indexing, discovery, querying
- `integration.test.ts` - Test end-to-end skill loading in phases
- `mcp.test.ts` - Test skill MCP tools

### Integration Points

**For Item 034 (wreckit learn command):**

Skill loader API will be used to compile codebase patterns into skill artifacts:

```typescript
// In wreckit learn command
const patterns = await analyzeCodebase(root);
const skill = SkillSchema.parse({
  schema_version: 1,
  name: "codebase-patterns",
  phase: "research",
  description: "Learned patterns from codebase analysis",
  content: patterns.markdown,
  tags: ["learned", "codebase"],
});
await writeSkill(root, "research", "codebase-patterns", skill);
await indexSkills(root); // Update skill index
```

**For Item 035 (media layer integration):**

Media skills (Manim, Remotion) will be loaded as phase-specific skills:

```typescript
// .wreckit/skills/implement/media-generation.json
{
  "schema_version": 1,
  "name": "media-generation",
  "phase": "implement",
  "description": "Generate video content using Manim and Remotion",
  "content": "# Media Generation Skill\n\n## Manim Animation\n...\n\n## Remotion Video\n...",
  "required_tools": ["Bash", "Write", "Read"],
  "tags": ["media", "M4", "video"],
}
```

Items with `campaign: "M4"` will auto-load this skill in implement phase.

**For Item 036 (wreckit summarize):`

Summarize command will use media-generation skill to create 30-second feature visualizations:

```typescript
// In wreckit summarize command
const mediaSkill = await loadSkill(root, "implement", "media-generation");
if (mediaSkill) {
  // Use skill content to guide video generation
  await generateVideo(item, mediaSkill.content);
}
```

## Open Questions

1. **Skill format standardization**: Should skills use Markdown (like research.md), JSON, or hybrid? **Recommendation**: Markdown content + JSON metadata (similar to item structure with item.json + research.md).

2. **Skill scope**: Per-project (`.wreckit/skills/`) or globally shareable? **Recommendation**: Per-project for version control, with ability to publish/share skill libraries via npm or git.

3. **Skill validation**: How to validate skill quality? **Recommendation**: Multi-retry pattern from research phase (itemWorkflow.ts:256-359) with schema validation, content length checks, and example verification.

4. **Skill-tool compatibility**: Should skills declare required tools and validate against phase allowlist? **Yes**, add `required_tools` to SkillSchema and validate in loader before loading.

5. **Backward compatibility**: Handle items created before skill system? **Recommendation**: Make skill loading opt-in, log warnings for missing skills, never fail hard. Default to current behavior if no skills found.

6. **Performance**: Cache skills in memory or load on-demand? **Recommendation**: Lazy load with LRU cache (max 20 skills), invalidate on item state changes, cache keyed by (phase, item.campaign, item.section).

7. **MCP vs file-based**: Skills as MCP tools or file-based context? **Recommendation**: File-based for large content (like research.md), MCP for structured operations (like load_skill, list_skills). Hybrid approach.

8. **Skill composition**: Can skills depend on or compose other skills? **Recommendation**: Yes, support `depends_on_skills` array, define dependency graph, detect cycles, topological sort for loading order.

9. **Multi-phase skills**: Can a skill apply to multiple phases? **Recommendation**: Yes, allow `phase: ["research", "plan"]` array or `phase: "*"` wildcard, with phase-specific overrides.

10. **Skill versioning**: How to handle skill evolution? **Recommendation**: Semantic versioning, config specifies skill ID + version range, fallback to latest if unspecified.

## References

**Core Architecture:**
- `src/commands/phase.ts:39-84` - Phase configuration and state transitions
- `src/domain/states.ts:12-19` - WORKFLOW_STATES array (linear progression)
- `src/agent/toolAllowlist.ts:57-117` - Phase-based tool restrictions (pattern to follow for skills)
- `src/agent/runner.ts:348-494` - Agent dispatch system with multi-SDK support

**Workflow Implementation:**
- `src/workflow/itemWorkflow.ts:168-201` - buildPromptVariables function (integration point for skill loading)
- `src/workflow/itemWorkflow.ts:203-366` - runPhaseResearch with tool allowlist and validation
- `src/workflow/itemWorkflow.ts:256-359` - Multi-retry validation pattern (apply to skill loading)
- `src/workflow/itemWorkflow.ts:368-573` - runPhasePlan with MCP server integration

**Prompt and MCP System:**
- `src/prompts.ts:8-22` - PromptVariables interface (extend with skills field)
- `src/prompts.ts:55-95` - renderPrompt function for variable substitution
- `src/agent/mcp/wreckitMcpServer.ts:47-145` - MCP tool creation pattern (for skill management tools)
- `src/agent/mcp/wreckitMcpServer.ts:7-37` - Zod schemas for structured data (pattern for SkillSchema)

**Schema and Configuration:**
- `src/schemas.ts:95-131` - ItemSchema with campaign/depends_on (skill metadata similar structure)
- `src/schemas.ts:64-70` - Agent discriminated union schema (pattern for skill configs)
- `src/config.ts:45-68` - Default config showing agent structure

**M4 Dependency Chain:**
- `.wreckit/items/033-*/item.json` - This item (foundation for skill loading)
- `.wreckit/items/034-*/item.json:15-18` - Depends on 033 (wreckit learn command)
- `.wreckit/items/035-*/item.json:15-18` - Depends on 034 (media layer integration)
- `.wreckit/items/036-*/item.json:15-18` - Depends on 035 (wreckit summarize)

**Testing and Validation:**
- `src/__tests__/research-quality.test.ts` - Research quality validation pattern (apply to skill validation)
- `src/__tests__/domain/validation.test.ts` - Validation context and transition tests
- `src/domain/validation.ts` - Validation utilities (extend for skill validation)
