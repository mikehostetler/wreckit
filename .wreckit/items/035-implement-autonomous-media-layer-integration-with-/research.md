# Research: Implement Autonomous Media Layer (integration with Manim and Remotion Skills)

**Date**: 2025-01-25
**Item**: 035-implement-autonomous-media-layer-integration-with-

## Research Question
From milestone [M4] Recursive Evolution & Skill-Based Media Layer

**Motivation:** Strategic milestone: Recursive Evolution & Skill-Based Media Layer

## Summary

This research investigates implementing an autonomous media layer for the Wreckit system that integrates with Manim (mathematical animation engine) and Remotion (React-based video framework) as Skills. The media layer will enable autonomous agents to generate video content and animations as part of their workflow, laying the foundation for Item 036's `wreckit summarize` command which will create 30-second feature visualization videos.

**Key Finding**: Wreckit already has a complete Skills infrastructure from Item 033, which provides the perfect framework for integrating media generation capabilities. Manim and Remotion should be implemented as specialized Skills that can be dynamically loaded during the implementation phase, with appropriate tool permissions (Bash for running commands, Write for creating scripts, Read for accessing source code).

**Implementation Approach**:
1. Define two new Skills in `.wreckit/skills.json`: `manim-generation` and `remotion-generation`
2. Create a new "media" phase with appropriate tool allowlist (Read, Write, Bash, Glob, Grep)
3. Implement skill-specific context requirements (e.g., loading existing animations, Remotion project structure)
4. Document integration patterns and dependencies
5. Provide example skill definitions that can be extracted via `wreckit learn` (Item 034)

## Current State Analysis

### Existing Implementation

**Skills Infrastructure (Item 033 - COMPLETE)**:
- `src/agent/skillLoader.ts:59-144` - `loadSkillsForPhase()` function dynamically loads skills per phase
- `src/schemas.ts:82-123` - Complete skill schema definitions (`SkillConfigSchema`, `SkillSchema`)
- `.wreckit/skills.json` - 6 default skills defined (code-exploration, context-awareness, documentation-writer, full-capability, git-integration, verification)
- `src/agent/contextBuilder.ts` - JIT context loading for skill requirements
- Skills are intersected with phase tool allowlists for security (skills cannot exceed phase permissions)

**Skill Configuration Pattern** (from `.wreckit/skills.json:1-96`):
```json
{
  "phase_skills": {
    "implement": ["full-capability"]
  },
  "skills": [
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
        }
      ]
    }
  ]
}
```

**Tool Allowlist System** (`src/agent/toolAllowlist.ts:1-120`):
- Phase-based tool restrictions enforce security boundaries
- Implement phase allows: Read, Write, Edit, Glob, Grep, Bash, mcp__wreckit__update_story_status
- Media generation would need: Bash (for running manim/remotion CLI), Write (for creating scripts), Read (for accessing source)

**Command Pattern** (from Item 034's plan):
- `src/commands/strategy.ts:35-143` - Template for agent-based analysis commands
- `src/commands/learn.ts` - Recently implemented for pattern extraction (depends on this item)
- Both use `runAgentUnion()` with tool allowlists and phase-specific prompts

**M4 Campaign Structure**:
- Item 033 (done): Phase-specific skill loading infrastructure
- Item 034 (planned): `wreckit learn` command - extracts patterns into skills
- **Item 035** (this item): Media layer integration - Manim/Remotion skill definitions
- Item 036 (blocked by 035): `wreckit summarize` command - uses media skills

### What's Missing

1. **No Manim/Remotion skill definitions** - Skills exist only as code pattern examples, not media generation capabilities
2. **No media generation phase** - Current phases (idea, research, plan, implement, pr, complete) don't include a media generation phase
3. **No media-specific tool allowlist** - No phase with tools optimized for video/animation generation
4. **No documentation for media skills** - No guidance on how to create or use Manim/Remotion skills
5. **No integration examples** - No examples of invoking Manim or Remotion from agent workflows

## Technical Considerations

### Dependencies

**External Dependencies**:
- **Manim** (https://www.manim.community/) - Python-based mathematical animation engine
  - Requires: Python 3.8+, FFmpeg, LaTeX (for math rendering)
  - Installation: `pip install manim`
  - CLI: `manim render scene.py SceneName -pqh` (quality high)
  - Output: MP4 video files in `media/videos/`

- **Remotion** (https://www.remotion.dev/) - React-based video framework
  - Requires: Node.js 16+, FFmpeg, npm/yarn
  - Installation: `npm install remotion` or `npx create-video`
  - CLI: `npx remotion render HelloWorld out/video.mp4`
  - Output: MP4 video files

**Internal Modules**:
- `src/agent/skillLoader.ts` - Load Manim/Remotion skills for media phase
- `src/agent/toolAllowlist.ts` - Define "media" phase tool permissions
- `src/schemas.ts` - SkillConfigSchema already supports media skills
- `.wreckit/skills.json` - Add manim-generation and remotion-generation skill definitions

### Patterns to Follow

**1. Skill Definition Pattern** (from `.wreckit/skills.json:52-69`):
```json
{
  "id": "manim-generation",
  "name": "Manim Animation Generation",
  "description": "Generate mathematical animations using Manim engine",
  "tools": ["Bash", "Write", "Read", "Glob"],
  "required_context": [
    {
      "type": "file",
      "path": "manim.config.json",
      "description": "Manim project configuration"
    }
  ],
  "mcp_servers": {}
}
```

**2. Phase-Specific Loading Pattern** (from `src/agent/skillLoader.ts:59-83`):
```typescript
export function loadSkillsForPhase(
  phase: string,
  skillConfig: SkillConfig | undefined
): SkillLoadResult {
  if (!skillConfig) {
    return {
      allowedTools: PHASE_TOOL_ALLOWLISTS[phase],
      mcpServers: {},
      contextRequirements: [],
      loadedSkillIds: [],
    };
  }

  const skillIds = skillConfig.phase_skills[phase];
  // ... resolve skill definitions, merge tools, aggregate MCP servers
}
```

**3. Tool Allowlist Pattern** (from `src/agent/toolAllowlist.ts:57-117`):
```typescript
export const PHASE_TOOL_ALLOWLISTS: Record<string, ToolName[] | undefined> = {
  // ... existing phases ...

  // Media generation phase: Bash for CLI tools, Write for scripts, Read for source
  media: [
    AVAILABLE_TOOLS.Read,
    AVAILABLE_TOOLS.Write,
    AVAILABLE_TOOLS.Glob,
    AVAILABLE_TOOLS.Grep,
    AVAILABLE_TOOLS.Bash,
  ],
};
```

**4. Context Loading Pattern** (from `src/agent/contextBuilder.ts`):
- Skills can require context via `required_context` array
- Context types: `file`, `git_status`, `item_metadata`, `phase_artifact`
- Media skills could load:
  - Existing animation scripts (file)
  - Remotion project structure (Glob pattern)
  - Previous render outputs (git_status to check media/videos/)

## Key Files

- **`src/agent/skillLoader.ts:59-144`** - Core skill loading logic, will load Manim/Remotion skills
- **`src/agent/toolAllowlist.ts:57-117`** - Tool allowlists, needs "media" phase added
- **`src/schemas.ts:82-123`** - Skill schema definitions, already supports media skills
- **`.wreckit/skills.json:1-96`** - Default skill definitions, needs manim/remotion skills added
- **`src/agent/contextBuilder.ts`** - JIT context loading, will handle media skill context requirements
- **`src/workflow/itemWorkflow.ts:41-42`** - Skills integration point in workflow execution
- **`src/commands/learn.ts`** - Pattern extraction command (Item 034), can extract media skills

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **External dependency availability** - Manim requires Python/FFmpeg/LaTeX, Remotion requires Node/FFmpeg | High | Document installation prerequisites clearly, add detection/validation in skill loading, provide graceful fallback if dependencies missing |
| **Cross-platform compatibility** - FFmpeg paths differ on Windows/macOS/Linux | Medium | Use `npx` for Remotion (cross-platform), document OS-specific Manim setup, consider Docker containerization for consistent environment |
| **Tool permission conflicts** - Media generation needs Bash which may be restricted in some phases | Low | Create dedicated "media" phase with appropriate permissions, ensure skills are intersection-compliant with phase allowlists |
| **File size/complexity** - Video files can be large, long render times | Medium | Add timeout configuration for media generation, document quality/space tradeoffs, support progressive/low-quality previews |
| **M4 milestone coupling** - This item blocks Item 036 (summarize command) | Medium | Ensure skill API is extensible for future media types, design for composition with other skills, provide clear examples for Item 036 integration |
| **Agent learning curve** - Agents may not know how to write Manim/Remotion scripts | Medium | Provide example templates in skill context, include Manim/Remotion documentation in required_context, design skill with "tutorial mode" for first-time use |

## Recommended Approach

**High-level strategy**: Implement Manim and Remotion as specialized Skills within the existing skill loading infrastructure (Item 033). Create a dedicated "media" phase with appropriate tool permissions, and define skill configurations that can be loaded for media generation tasks.

**Phasing**:

**Phase 1: Define Media Phase and Tool Allowlist**
1. Add "media" phase to `PHASE_TOOL_ALLOWLISTS` in `src/agent/toolAllowlist.ts`
2. Define tool permissions: Read, Write, Glob, Grep, Bash (for CLI tools)
3. Document phase semantics and when to use it
4. Update prompt templates to support media phase

**Phase 2: Create Manim Skill Definition**
1. Add `manim-generation` skill to `.wreckit/skills.json`
2. Define skill metadata:
   - `tools`: ["Bash", "Write", "Read", "Glob"]
   - `required_context`: Manim config file, existing scene files
   - `description`: Mathematical animation generation
3. Create example Manim scene template
4. Document Manim CLI invocation patterns
5. Test skill loading in media phase

**Phase 3: Create Remotion Skill Definition**
1. Add `remotion-generation` skill to `.wreckit/skills.json`
2. Define skill metadata:
   - `tools`: ["Bash", "Write", "Read", "Glob"]
   - `required_context`: Remotion project structure, package.json
   - `description`: React-based video generation
3. Create example Remotion composition template
4. Document Remotion CLI invocation patterns
5. Test skill loading in media phase

**Phase 4: Update Phase Skills Mapping**
1. Map media phase to load manim-generation and remotion-generation skills
2. Test skill intersection with phase tool allowlist
3. Verify context loading for both skills
4. Document skill composition (can both be loaded together?)

**Phase 5: Documentation and Examples**
1. Create `docs/media-skills.md` with:
   - Installation prerequisites (Python, FFmpeg, Node)
   - Skill configuration guide
   - Example Manim scene
   - Example Remotion composition
   - CLI invocation patterns
   - Troubleshooting common issues
2. Add media skills to `docs/skills.md` examples section
3. Update AGENTS.md with media phase command reference
4. Create integration example for Item 036 (summarize command)

**Risk mitigation**:
- Start with read-only skill definitions (no actual video generation in Phase 1-3)
- Validate skill loading and context requirements before adding Bash execution
- Use timeouts and dry-run mode for testing video generation
- Document all prerequisites and platform-specific setup steps
- Provide clear error messages if dependencies (FFmpeg, Python, Node) are missing

## Open Questions

1. **Should media generation be a separate phase or part of implementation phase?**
   - **Pros of separate phase**: Clear separation of concerns, dedicated tool permissions, easier to schedule/monitor
   - **Pros of part of implement**: Simpler workflow, media generation is just another implementation task
   - **Recommendation**: Start as separate "media" phase for clarity, can merge into implement later if needed

2. **How should agents learn to write Manim/Remotion scripts?**
   - **Option A**: Include Manim/Remotion documentation in skill context (large context window)
   - **Option B**: Provide example templates and let agents generalize (smaller context, more creative)
   - **Option C**: Create MCP server with Manim/Remotion "code generation" tools (complex, most powerful)
   - **Recommendation**: Start with Option B (templates), evaluate Option A if agents struggle, defer Option C to future work

3. **Should Manim and Remotion be separate skills or one "media-generation" skill?**
   - **Pros of separate**: Clearer responsibility, can load independently, different dependencies
   - **Pros of combined**: Simpler configuration, unified "media" concept
   - **Recommendation**: Separate skills (manim-generation, remotion-generation) for flexibility, but both loadable in media phase

4. **How to handle long-running video renders in agent workflow?**
   - **Option A**: Add timeout configuration to media phase (e.g., 5 minutes max)
   - **Option B**: Implement async rendering with status polling (complex, non-blocking)
   - **Option C**: Progressive rendering (low-quality preview first, then full render)
   - **Recommendation**: Start with Option A (timeout), document tradeoffs, evaluate Option B/C for Item 036

5. **Should media skills be available in all repos or opt-in?**
   - **Opt-in**: Only load if `.wreckit/skills.json` explicitly defines them (current behavior)
   - **Opt-out**: Include in default skills.json, remove if not needed
   - **Recommendation**: Opt-in (document how to add them), don't include in default skills.json to avoid dependency errors for repos that don't need media generation

6. **What about other media tools (FFmpeg directly, Blender, etc.)?**
   - **Scope**: This item focuses on Manim and Remotion as representative examples
   - **Extensibility**: Skill infrastructure supports adding more media skills later
   - **Recommendation**: Implement Manim/Remotion as proof-of-concept, document pattern for future media skills

## M4 Dependency Chain

This item is part of the M4 campaign dependency chain:

```
Item 033 (done)
  └─> Item 034 (wreckit learn command)
        └─> Item 035 (media layer - THIS ITEM)
              └─> Item 036 (summarize command)
```

**Item 033** provides the skill loading infrastructure that this item will use.
**Item 034** provides the `wreckit learn` command that can extract Manim/Remotion patterns from successful implementations.
**Item 036** (blocked by this item) will use the media skills to generate 30-second feature visualizations.

All M4 items have `campaign: "M4"` in their `item.json` and depend on the previous item in the chain.

## References

- **Item 033 research**: `/Users/speed/wreckit/.wreckit/items/033-implement-phase-specific-skill-loading-jit-context/research.md`
- **Item 034 plan**: `/Users/speed/wreckit/.wreckit/items/034-create-wreckit-learn-command-to-compile-codebase-p/plan.md`
- **Skill schema**: `src/schemas.ts:82-123`
- **Skill loader**: `src/agent/skillLoader.ts:59-144`
- **Tool allowlists**: `src/agent/toolAllowlist.ts:57-117`
- **Skills documentation**: `docs/skills.md`
- **Manim documentation**: https://docs.manim.community/
- **Remotion documentation**: https://www.remotion.dev/docs/
