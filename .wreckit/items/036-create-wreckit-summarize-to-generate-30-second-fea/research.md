# Research: Create `wreckit summarize` to generate 30-second feature visualization videos autonomously

**Date**: 2025-01-25
**Item**: 036-create-wreckit-summarize-to-generate-30-second-fea

## Research Question
From milestone [M4] Recursive Evolution & Skill-Based Media Layer

**Motivation:** Strategic milestone: Recursive Evolution & Skill-Based Media Layer

## Summary

This research investigates creating a `wreckit summarize` command that autonomously generates 30-second feature visualization videos. The command will leverage the media layer infrastructure implemented in Item 035, which provides Manim (mathematical animations) and Remotion (React-based videos) skills. The summarize command will load completed items, extract their key features, and use autonomous agents with media skills to generate concise visual summaries saved to `.wreckit/media/<item-id>-summary.mp4`.

**Key Findings:**
1. **Media infrastructure is complete** - Item 035 implemented media phase, tool permissions, and two media skills (manim-generation, remotion-generation) in `.wreckit/skills.json:95-125`
2. **Command pattern is well-established** - Commands follow a consistent pattern (strategy, learn, show) with options interface, root finding, config loading, agent execution, and validation
3. **Skill loading pattern exists** - `src/agent/skillLoader.ts:59-144` provides `loadSkillsForPhase()` for loading media skills with JIT context building
4. **No existing examples or templates** - Despite documentation references, `.wreckit/examples/` directory doesn't exist yet - need to create example templates for agents
5. **Integration points clear** - Command must use media phase prompts (`src/prompts/media.md`), load skills dynamically, and handle video output paths

## Current State Analysis

### Existing Implementation

**Media Layer Infrastructure (Item 035 - DONE):**
- Media phase added to tool allowlists: `src/agent/toolAllowlist.ts:126-134` allows Read, Write, Glob, Grep, Bash for media generation
- Media skills defined: `.wreckit/skills.json:95-125` includes manim-generation and remotion-generation with tools and context requirements
- Media phase prompt: `src/prompts/media.md` provides guidelines for Manim and Remotion usage with 30-second target
- Documentation: `docs/media-skills.md` covers prerequisites, usage examples, troubleshooting, and Item 036 integration

**Command Infrastructure:**
- Command registration: `src/index.ts:26-663` shows pattern for registering commands with global options (verbose, quiet, dryRun, cwd, mockAgent)
- Command structure: Commands in `src/commands/` follow pattern: options interface, findRootFromOptions, loadConfig, executeCommand wrapper, logging
- Example commands:
  - `src/commands/strategy.ts:35-143` - Single-pass agent execution with validation
  - `src/commands/learn.ts:180-297` - Multi-step with skill loading, context building, and validation
  - `src/commands/show.ts:51-122` - Item loading and display

**Skill Loading System (Item 033):**
- Phase-specific loading: `src/agent/skillLoader.ts:59-144` - `loadSkillsForPhase()` merges tools, intersects with phase allowlists
- JIT context building: `src/agent/contextBuilder.ts:51-201` - `buildJitContext()` loads files, git status, item metadata, phase artifacts
- Context formatting: `src/agent/contextBuilder.ts:158-201` - `formatContextForPrompt()` creates markdown from built context
- Workflow integration: `src/workflow/itemWorkflow.ts:170-232` - `buildPromptVariables()` loads skills and builds context for phases

### Key Files

**Media Infrastructure:**
- `src/agent/toolAllowlist.ts:126-134` - Media phase tool permissions (Read, Write, Glob, Grep, Bash)
- `.wreckit/skills.json:8, 95-125` - Media phase skills mapping and skill definitions
- `src/prompts/media.md` - Media generation guidelines for agents
- `docs/media-skills.md:109-117` - Item 036 integration documentation

**Command Pattern Examples:**
- `src/commands/strategy.ts:35-143` - Agent execution with prompt loading, git status validation, output verification
- `src/commands/learn.ts:180-297` - Skill loading, context building, agent execution, JSON validation, merging
- `src/commands/show.ts:51-122` - Item loading and details display
- `src/index.ts:567-595` - Command registration pattern with global options

**Skill Loading & Context:**
- `src/agent/skillLoader.ts:59-144` - `loadSkillsForPhase()` for dynamic skill loading
- `src/agent/contextBuilder.ts:51-201` - `buildJitContext()` and `formatContextForPrompt()`
- `src/workflow/itemWorkflow.ts:170-232` - `buildPromptVariables()` skill loading integration

**Paths & Utilities:**
- `src/fs/paths.ts:44-115` - Path utilities (getWreckitDir, getItemsDir, getItemDir, etc.)
- `src/agent/runner.ts:348-499` - `runAgentUnion()` for agent execution with allowedTools
- `src/commands/phase.ts:19-84` - Phase configuration pattern (though summarize is not a workflow phase)

**Missing Components:**
- `.wreckit/examples/manim-scene.py` - Referenced in docs but doesn't exist
- `.wreckit/examples/remotion-composition.tsx` - Referenced in docs but doesn't exist
- `.wreckit/examples/remotion-root.tsx` - Referenced in docs but doesn't exist
- `.wreckit/media/` directory - No media output directory exists yet

## Technical Considerations

### Dependencies

**External Dependencies (Optional - for end-to-end testing):**
- Manim: Python 3.8+, FFmpeg, LaTeX (optional)
- Remotion: Node.js 16+, FFmpeg
- These are NOT required for the command to work - agents will use Bash to run CLIs if installed

**Internal Dependencies:**
- Item 035 (media layer) - DONE - provides media phase and skills
- Item 034 (learn command) - DONE - provides skill loading pattern
- Item 033 (skill loading infrastructure) - DONE - provides loadSkillsForPhase, buildJitContext
- `src/agent/toolAllowlist.ts` - getAllowedToolsForPhase("media")
- `src/agent/skillLoader.ts` - loadSkillsForPhase("media", config.skills)
- `src/agent/contextBuilder.ts` - buildJitContext(), formatContextForPrompt()
- `src/agent/runner.ts` - runAgentUnion() with allowedTools
- `src/prompts.ts` - loadPromptTemplate(root, "media"), renderPrompt()
- `src/fs/paths.ts` - Need to add getMediaDir(), getMediaOutputPath()

### Patterns to Follow

**Command Structure Pattern (from strategy.ts):**
```typescript
export interface SummarizeOptions {
  item?: string;
  phase?: string;
  all?: boolean;
  output?: string;
  format?: "manim" | "remotion" | "auto";
  duration?: number;
  dryRun?: boolean;
  cwd?: string;
  verbose?: boolean;
}

export async function summarizeCommand(
  options: SummarizeOptions,
  logger: Logger
): Promise<void> {
  const root = findRootFromOptions(options);
  const config = await loadConfig(root);

  // Determine source items (similar to learn.ts:34-76)
  const { items: sourceItems, context: sourceContext } = await determineSourceItems(root, options, logger);

  // Load media phase skills
  const skillResult = loadSkillsForPhase("media", config.skills);
  const context = await buildJitContext(skillResult.contextRequirements, item, config, root);
  const skillContext = formatContextForPrompt(context);

  // Build prompt variables
  const variables = {
    id: "summarize",
    title: "Feature Visualization",
    section: "media",
    overview: "Generate 30-second feature visualization video",
    item_path: root,
    branch_name: "",
    base_branch: config.base_branch,
    completion_signal: "<promise>COMPLETE</promise>",
    skill_context: skillContext,
  };

  // Load media prompt template
  const template = await loadPromptTemplate(root, "media");
  const prompt = renderPrompt(template, variables);

  // Run agent with media phase tools
  const result = await runAgentUnion({
    config: getAgentConfigUnion(config),
    cwd: root,
    prompt,
    logger,
    dryRun: options.dryRun,
    mockAgent: false,
    timeoutSeconds: config.timeout_seconds,
    allowedTools: getAllowedToolsForPhase("media"),
  });

  // Validate output video exists
  // ...
}
```

**Agent Execution Pattern (from learn.ts:247-262):**
- Use `runAgentUnion()` with `allowedTools: getAllowedToolsForPhase("media")`
- Media phase allows: Read, Write, Glob, Grep, Bash (no Edit tool)
- Skills intersect with phase tools - final tools are intersection
- Include `skill_context` in prompt variables for JIT context

**Prompt Variable Pattern (from workflow/itemWorkflow.ts:170-232):**
- Build skillContext by loading skills and building JIT context
- Include skill_context in prompt variables
- Log loaded skills and context for transparency

**Validation Pattern (from strategy.ts:132-142):**
- Capture git status before agent execution
- Verify only expected files were created/modified
- Use `compareGitStatus()` for validation
- Format violations with `formatViolations()`

**Path Utilities (need to add to src/fs/paths.ts):**
```typescript
export function getMediaDir(root: string): string {
  return path.join(getWreckitDir(root), "media");
}

export function getMediaOutputPath(root: string, itemId: string): string {
  return path.join(getMediaDir(root), `${itemId.replace(/\//g, "-")}-summary.mp4`);
}
```

### Media Generation Workflow

**Agent Workflow:**
1. Load media phase skills (manim-generation, remotion-generation)
2. Build JIT context from skill requirements (git_status, file checks)
3. Render media.md prompt with item details (overview, plan, PRD)
4. Instruct agent to:
   - Choose appropriate tool (Manim for math/concepts, Remotion for UI/UX)
   - Create animation script from templates
   - Render video using CLI (manim render or npx remotion render)
   - Save output to `.wreckit/media/<item-id>-summary.mp4`
5. Validate video file exists
6. Report success with file path

**Media.md Prompt Guidelines (src/prompts/media.md:19-39):**
- Start with example templates from `.wreckit/examples/`
- Test with low quality first (`-pql` for Manim)
- Use descriptive scene/composition names
- Add comments explaining animation logic
- **Keep animations short (30 seconds max for feature visualizations)**
- Output files to `media/videos/<scene_file>/<SceneName>.mp4` for Manim
- Output to custom path for Remotion

**Skill Context (from media skills):**
- manim-generation: Requires git_status to check for existing Manim files
- remotion-generation: Requires file (package.json) and git_status to check for Remotion
- Both skills provide Bash, Write, Read, Glob tools

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Missing example templates** | High | Agents may fail to create valid animations. Mitigation: Create `.wreckit/examples/` with manim-scene.py, remotion-composition.tsx, remotion-root.tsx as part of this item |
| **Manim/Remotion not installed** | Medium | Command will fail when agent tries to run CLIs. Mitigation: Document prerequisites clearly, check for installations in preflight, provide helpful error messages |
| **Video generation timeout** | Medium | Rendering 30s video can take 5-10 minutes. Mitigation: Increase timeout for summarize command, document expected rendering times |
| **Agent creates wrong output format** | Low | Agent might create image or wrong video format. Mitigation: Validate output is .mp4 file, check file exists and is non-empty |
| **Video file too large** | Low | Agent might create high-quality large file. Mitigation: Instruct agent to use quality presets (medium for 30s viz), validate file size < 50MB |
| **No skill context loaded** | Low | Context building might fail. Mitigation: Handle empty context gracefully, provide default instructions in prompt |
| **Item has no plan/PRD** | Medium | Agent lacks content to visualize. Mitigation: Allow summarizing from overview only, skip items in "idea" state |
| **Media phase not in skills.json** | Low | User might have old skills.json. Mitigation: Check for media phase in config, provide helpful error to run Item 035 |

## Recommended Approach

**High-level Strategy:** Implement `wreckit summarize` as a standalone command (not a workflow phase) that loads completed items, uses media generation skills with JIT context, and autonomously creates 30-second feature visualization videos.

### Implementation Phases

**Phase 1: Command Structure & Path Utilities**
1. Create `src/commands/summarize.ts` with SummarizeOptions interface
2. Add path utilities to `src/fs/paths.ts`: `getMediaDir()`, `getMediaOutputPath()`
3. Register command in `src/index.ts` following pattern of strategy/learn commands
4. Add dry-run support and logging

**Phase 2: Source Item Determination**
1. Implement `determineSourceItems()` function (similar to learn.ts:34-76)
2. Support options: --item <id>, --phase <state>, --all (default: most recent 5 done items)
3. Filter items with state "done" (completed features only)
4. Validate items have required artifacts (plan.md, prd.json)

**Phase 3: Skill Loading & Context Building**
1. Load media phase skills: `loadSkillsForPhase("media", config.skills)`
2. Build JIT context: `buildJitContext(contextRequirements, item, config, root)`
3. Format context for prompt: `formatContextForPrompt(context)`
4. Include skill_context in prompt variables

**Phase 4: Agent Execution**
1. Load media.md prompt template
2. Render prompt with item details (id, title, overview, plan, prd)
3. Run agent with media phase tools: `getAllowedToolsForPhase("media")`
4. Use `runAgentUnion()` with timeout increased for video rendering

**Phase 5: Output Validation**
1. Create `.wreckit/media/` directory if it doesn't exist
2. Verify output video exists at expected path
3. Validate file is MP4 format and non-empty
4. Report success with file path
5. Handle errors gracefully (timeout, missing tools, rendering failures)

**Phase 6: Example Templates**
1. Create `.wreckit/examples/manim-scene.py` with basic Manim scene
2. Create `.wreckit/examples/remotion-composition.tsx` with basic Remotion composition
3. Create `.wreckit/examples/remotion-root.tsx` with Remotion root configuration
4. Validate templates are syntactically correct
5. Document template usage in command help

### Testing Strategy

**Unit Tests:**
- Test `determineSourceItems()` with various options
- Test path utilities return correct paths
- Test skill loading with media phase
- Test context building with skill requirements

**Integration Tests:**
- Test dry-run mode (no actual video generation)
- Test command with mock agent (simulated output)
- Test error handling (missing items, invalid states)
- Test output validation (file exists, format check)

**Manual Testing (requires Manim/Remotion):**
- Test with real Manim installation
- Test with real Remotion installation
- Test video output quality and duration
- Test error messages for missing dependencies

## Open Questions

1. **Default item selection**: Should summarize default to most recent completed item, most recent 5 items, or require explicit --item flag? Recommendation: Default to most recent 5 completed items (same as learn command)

2. **Format selection**: Should --format option allow forcing manim or remotion, or auto-select based on content? Recommendation: Default "auto" - let agent choose based on item type (math/concepts → manim, UI/UX → remotion)

3. **Duration target**: Should --duration option be exposed or hardcode 30 seconds? Recommendation: Hardcode 30s in prompt, allow --duration for advanced users

4. **Timeout configuration**: Should summarize command use longer timeout than config.timeout_seconds? Recommendation: Multiply timeout by 3x for video rendering (3600 → 10800 seconds)

5. **Output format**: Should output be just MP4 or support other formats (GIF, WebM)? Recommendation: MP4 only for simplicity, match documentation

6. **Template creation**: Should example templates be created in this item or separate? Recommendation: Create as part of this item, required for agents to work effectively

7. **Preflight checks**: Should command check for Manim/Remotion installation before running agent? Recommendation: Skip preflight checks - let agent discover and report missing tools, keeps command simple

8. **Media directory**: Should `.wreckit/media/` be created by init command or on-demand by summarize? Recommendation: On-demand creation in summarize command, simpler and follows pattern of other directories
