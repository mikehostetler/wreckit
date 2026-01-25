# Implement Autonomous Media Layer (integration with Manim and Remotion Skills) Implementation Plan

## Overview
Implement an autonomous media layer for the Wreckit system by integrating Manim (mathematical animation engine) and Remotion (React-based video framework) as Skills. This enables autonomous agents to generate video content and animations as part of their workflow, laying the foundation for Item 036's `wreckit summarize` command which will create 30-second feature visualization videos.

## Current State Analysis
**What exists now:**
- Complete skill loading infrastructure from Item 033: `loadSkillsForPhase()` (`src/agent/skillLoader.ts:59-144`) dynamically loads skills per phase with tool intersection for security
- Complete skill schema definitions (`src/schemas.ts:82-123`) with `SkillConfigSchema`, `SkillSchema`, and JIT context requirements
- `.wreckit/skills.json` with 6 default skills (code-exploration, context-awareness, documentation-writer, full-capability, git-integration, verification)
- JIT context builder (`src/agent/contextBuilder.ts`) that loads files, git status, item metadata, and phase artifacts for skill requirements
- Tool allowlist system (`src/agent/toolAllowlist.ts:57-124`) with phase-based permissions
- Prompt system (`src/prompts.ts`) with variable substitution and conditional blocks
- Agent runner (`src/agent/runner.ts:348-494`) with discriminated union dispatch supporting multiple SDK backends

**What's missing:**
- No Manim or Remotion skill definitions
- No media generation phase in the workflow
- No media-specific tool allowlist
- No documentation for media skills
- No media phase prompt template
- No integration examples for invoking Manim or Remotion from agent workflows

**Key constraints discovered:**
1. Must follow existing skill definition pattern from `.wreckit/skills.json:1-96`
2. Must create "media" phase with tool permissions: Read, Write, Glob, Grep, Bash (for CLI tools)
3. Skills are intersected with phase tool allowlists - media skills cannot exceed media phase permissions
4. Context loading via `buildJitContext()` supports: file, git_status, item_metadata, phase_artifact
5. Prompt system requires adding "media" to `PromptName` type in `src/prompts.ts:6`
6. Item 034's `wreckit learn` command depends on this item (must work with media skills)
7. Item 036's `wreckit summarize` command depends on this item (uses media skills)

## Desired End State
A fully functional media layer that:

1. **Defines a "media" phase** with tool permissions: Read, Write, Glob, Grep, Bash
2. **Provides two media skill definitions** in `.wreckit/skills.json`:
   - `manim-generation`: Mathematical animation generation using Manim
   - `remotion-generation`: React-based video generation using Remotion
3. **Documents installation prerequisites** for Manim (Python, FFmpeg, LaTeX) and Remotion (Node, FFmpeg)
4. **Provides example templates** for Manim scenes and Remotion compositions
5. **Creates a media phase prompt** that guides agents in media generation tasks
6. **Validates skill loading** ensures media skills work with existing infrastructure
7. **Documents integration patterns** for Item 036 (summarize command)

**Verification:**
- Media phase can be loaded and restricts tools correctly
- Manim and Remotion skills can be loaded for media phase
- Skill context requirements are resolved correctly
- Media skills intersect properly with phase allowlist (no permission violations)
- Example templates work with Manim and Remotion CLIs
- Documentation enables users to set up dependencies and use media skills
- Item 034's `wreckit learn` can extract media skill patterns
- Item 036 can use media skills for video generation

### Key Discoveries:

- **Skill loading pattern** (`src/agent/skillLoader.ts:59-144`): `loadSkillsForPhase()` merges tools from all skills and intersects with phase tools - this ensures media skills cannot exceed media phase permissions
- **Tool allowlist structure** (`src/agent/toolAllowlist.ts:19-36`): `AVAILABLE_TOOLS` uses exact SDK tool names (Read, Write, Bash, etc.) - media phase must use these exact names
- **Context requirement types** (`src/schemas.ts:89-93`): Four types supported (file, git_status, item_metadata, phase_artifact) - media skills can use these to load existing animations or project structure
- **Prompt system** (`src/prompts.ts:6`): `PromptName` is a union type - must add "media" to enable media phase prompts
- **Skill configuration** (`.wreckit/skills.json:1-96`): Default skills don't include media capabilities - must add manim-generation and remotion-generation skills
- **Agent runner** (`src/agent/runner.ts:348-494`): `runAgentUnion()` accepts `allowedTools` parameter - media phase will restrict tools via this parameter
- **M4 dependency chain**: Item 033 (done) → Item 034 (learn command) → **Item 035 (media layer)** → Item 036 (summarize command)

## What We're NOT Doing
To prevent scope creep, this implementation explicitly excludes:

1. **MCP server for media tools** - No custom MCP server wrapping Manim/Remotion (skills use Bash CLI directly)
2. **Video playback/preview** - No built-in video player or preview functionality
3. **Media asset management** - No asset library or versioning for generated videos
4. **Progressive rendering** - No low-quality preview or progressive quality levels
5. **Async rendering with status polling** - No background rendering or job queue
6. **Docker containerization** - No containerized environments for Manim/Remotion (documented as future work)
7. **Automatic dependency detection** - No runtime checking if Manim/Remotion are installed (documented in prerequisites)
8. **Skill deprecation/versioning** - No version numbers or migration system for media skills
9. **Interactive mode** - No "ask user for approval" during video generation
10. **Quality preset system** - No configurable quality settings (use defaults in examples)

## Implementation Approach
**High-level strategy:** Implement Manim and Remotion as specialized Skills within the existing skill loading infrastructure (Item 033). Create a dedicated "media" phase with appropriate tool permissions, define skill configurations that can be loaded for media generation tasks, and provide comprehensive documentation with example templates.

**Phasing:** Break into 5 independently testable phases:
1. Define media phase and tool allowlist (infrastructure)
2. Create Manim skill definition and template (first media skill)
3. Create Remotion skill definition and template (second media skill)
4. Add media phase prompt and documentation (user-facing)
5. Testing and validation (quality assurance)

**Risk mitigation:**
- Skills use intersection with phase allowlists - no permission violations possible
- Context loading has error handling - missing files don't crash the system
- Prompt system falls back to bundled templates - missing media.md uses default
- Documentation includes prerequisites - users know dependencies upfront
- Example templates are tested - Manim/Remotion CLIs work as documented
- Schema validation prevents invalid skills - SkillConfigSchema enforces structure
- Dry-run mode in workflow - users can preview before actual video generation

---

## Phase 1: Define Media Phase and Tool Allowlist

### Overview
Add "media" phase to the tool allowlist system with appropriate permissions for video generation. This phase enables agents to use Bash (for Manim/Remotion CLIs), Write (for creating scripts), Read (for accessing source code), and Glob/Grep (for project exploration).

### Changes Required:

#### 1. Add Media Phase to Tool Allowlists
**File**: `src/agent/toolAllowlist.ts`
**Changes**: Add "media" phase to `PHASE_TOOL_ALLOWLISTS` after line 124

```typescript
export const PHASE_TOOL_ALLOWLISTS: Record<string, ToolName[] | undefined> = {
  // ... existing phases (idea, research, plan, implement, pr, complete, strategy, learn) ...

  // Media phase: Bash for CLI tools, Write for scripts, Read for source, Glob/Grep for exploration
  media: [
    AVAILABLE_TOOLS.Read,
    AVAILABLE_TOOLS.Write,
    AVAILABLE_TOOLS.Glob,
    AVAILABLE_TOOLS.Grep,
    AVAILABLE_TOOLS.Bash,
  ],
} as const;
```

**Why**: Media generation needs Bash to run Manim/Remotion CLIs, Write to create animation scripts, Read to access existing code, and Glob/Grep to explore project structure. This is a new phase, not part of the main workflow (research → plan → implement → critique → pr → complete), but can be used explicitly by commands like Item 036's `wreckit summarize`.

### Success Criteria:

#### Automated Verification:
- [ ] Type checking passes: `npm run build` (no TS errors)
- [ ] Tool allowlist exports correctly: `getAllowedToolsForPhase("media")` returns expected tools
- [ ] Tool names are valid: all tools in media allowlist exist in `AVAILABLE_TOOLS`

#### Manual Verification:
- [ ] Media phase allows: Read, Write, Glob, Grep, Bash (verified via console.log or test)
- [ ] Media phase does NOT allow: Edit (not in allowlist, prevents accidental edits)
- [ ] Other phases unchanged: research, plan, implement phases still work correctly

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to next phase.

---

## Phase 2: Create Manim Skill Definition and Template

### Overview
Define the `manim-generation` skill in `.wreckit/skills.json` with appropriate tools, context requirements, and documentation. Create an example Manim scene template that agents can use as a starting point.

### Changes Required:

#### 1. Add Manim Skill to skills.json
**File**: `.wreckit/skills.json`
**Changes**: Add `manim-generation` skill to the `skills` array (after line 93, before closing `]`)

```json
{
  "id": "manim-generation",
  "name": "Manim Animation Generation",
  "description": "Generate mathematical animations using Manim engine (Python-based). Requires: Python 3.8+, FFmpeg, LaTeX. CLI: manim render scene.py SceneName -pqh. Output: MP4 files in media/videos/",
  "tools": ["Bash", "Write", "Read", "Glob"],
  "required_context": [
    {
      "type": "git_status",
      "description": "Check for existing Manim project files"
    }
  ],
  "mcp_servers": {}
}
```

**Why**: Manim needs Bash to run `manim render` CLI, Write to create scene `.py` files, Read to access existing scenes, and Glob to find Manim project files. Context requirement loads git status to detect existing `manim.cfg` or scene files.

#### 2. Add Media Phase Skills Mapping
**File**: `.wreckit/skills.json`
**Changes**: Add media phase to `phase_skills` object (after line 7, in the existing object)

```json
{
  "phase_skills": {
    "research": ["code-exploration", "context-awareness"],
    "plan": ["documentation-writer"],
    "implement": ["full-capability"],
    "pr": ["git-integration"],
    "complete": ["verification"],
    "media": ["manim-generation", "remotion-generation"]
  },
  // ... rest of skills.json ...
}
```

**Note**: Add both manim-generation and remotion-generation to media phase (remotion-generation will be defined in Phase 3).

#### 3. Create Manim Example Template
**File**: `.wreckit/examples/manim-scene.py` (new file)
**Changes**: Create example Manim scene template

```python
from manim import *

class ExampleScene(Scene):
    def construct(self):
        # Create a title
        title = Text("Wreckit Media Layer", font_size=48)
        self.play(Write(title))
        self.wait(1)

        # Create a circle
        circle = Circle(radius=2, color=BLUE)
        self.play(Create(circle))
        self.wait(1)

        # Transform the circle
        square = Square(side_length=4, color=RED)
        self.play(Transform(circle, square))
        self.wait(1)

        # Fade out
        self.play(FadeOut(circle), FadeOut(title))
```

**Why**: Provides agents with a working example they can adapt. Demonstrates basic Manim API: Scene class, animations (Write, Create, Transform, FadeOut), and timing (wait).

### Success Criteria:

#### Automated Verification:
- [ ] Schema validation passes: `.wreckit/skills.json` conforms to `SkillConfigSchema`
- [ ] Tool intersection works: `loadSkillsForPhase("media", skillConfig)` returns allowedTools that are subset of phase tools
- [ ] Context loading works: `buildJitContext()` with manim skill loads git_status

#### Manual Verification:
- [ ] Manim skill loads correctly: `loadSkillsForPhase("media", skillConfig).loadedSkillIds` includes "manim-generation"
- [ ] Tools intersect properly: manim tools (Bash, Write, Read, Glob) are all in media phase allowlist
- [ ] Example template is valid Python: file syntax is correct (can be parsed)
- [ ] Manim CLI works (if installed): `manim render .wreckit/examples/manim-scene.py ExampleScene -pql` produces video

**Note**: Manim installation is optional for this phase - template is valid even if Manim isn't installed. Document that users need Manim installed to actually render videos.

---

## Phase 3: Create Remotion Skill Definition and Template

### Overview
Define the `remotion-generation` skill in `.wreckit/skills.json` with appropriate tools, context requirements, and documentation. Create an example Remotion composition template that agents can use as a starting point.

### Changes Required:

#### 1. Add Remotion Skill to skills.json
**File**: `.wreckit/skills.json`
**Changes**: Add `remotion-generation` skill to the `skills` array (after manim-generation skill)

```json
{
  "id": "remotion-generation",
  "name": "Remotion Video Generation",
  "description": "Generate React-based videos using Remotion framework. Requires: Node.js 16+, FFmpeg. CLI: npx remotion render HelloWorld out/video.mp4. Output: MP4 files.",
  "tools": ["Bash", "Write", "Read", "Glob"],
  "required_context": [
    {
      "type": "file",
      "path": "package.json",
      "description": "Check for Remotion in dependencies"
    },
    {
      "type": "git_status",
      "description": "Check for existing Remotion project structure"
    }
  ],
  "mcp_servers": {}
}
```

**Why**: Remotion needs Bash to run `npx remotion render` CLI, Write to create composition `.tsx` files, Read to access existing compositions, and Glob to find Remotion project files. Context requirements check for Remotion in package.json and existing project structure via git status.

#### 2. Create Remotion Example Template
**File**: `.wreckit/examples/remotion-composition.tsx` (new file)
**Changes**: Create example Remotion composition template

```tsx
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

export const WreckitExampleComposition = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Animate opacity from 0 to 1 over first 30 frames
  const opacity = interpolate(frame, [0, 30], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "white" }}>
      <div
        style={{
          opacity,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 80,
          fontWeight: "bold",
          color: "#333",
        }}
      >
        Wreckit Media Layer
      </div>
    </AbsoluteFill>
  );
};
```

**Why**: Provides agents with a working example they can adapt. Demonstrates basic Remotion API: composition component, hooks (useCurrentFrame, useVideoConfig), animation (interpolate), and styling.

#### 3. Create Remotion Project Config Example
**File**: `.wreckit/examples/remotion-root.tsx` (new file)
**Changes**: Create example Remotion root configuration

```tsx
import { Composition } from "remotion";
import { WreckitExampleComposition } from "./remotion-composition";

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="WreckitExample"
        component={WreckitExampleComposition}
        durationInFrames={120}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
```

**Why**: Shows how to register compositions with specific parameters (duration, fps, dimensions). Required for Remotion to discover and render compositions.

### Success Criteria:

#### Automated Verification:
- [ ] Schema validation passes: `.wreckit/skills.json` conforms to `SkillConfigSchema`
- [ ] Tool intersection works: `loadSkillsForPhase("media", skillConfig)` returns allowedTools that are subset of phase tools
- [ ] Context loading works: `buildJitContext()` with remotion skill loads package.json and git_status

#### Manual Verification:
- [ ] Remotion skill loads correctly: `loadSkillsForPhase("media", skillConfig).loadedSkillIds` includes "remotion-generation"
- [ ] Tools intersect properly: remotion tools (Bash, Write, Read, Glob) are all in media phase allowlist
- [ ] Both skills load together: media phase loads both manim-generation and remotion-generation
- [ ] Example templates are valid TypeScript/TSX: file syntax is correct (can be parsed)
- [ ] Remotion CLI works (if installed): `npx remotion render` in example project produces video

**Note**: Remotion installation is optional for this phase - templates are valid even if Remotion isn't installed. Document that users need Remotion installed to actually render videos.

---

## Phase 4: Add Media Phase Prompt and Documentation

### Overview
Create a media phase prompt template that guides agents in media generation tasks. Add comprehensive documentation for media skills, including installation prerequisites, usage examples, and integration patterns for Item 036.

### Changes Required:

#### 1. Add "media" to PromptName Type
**File**: `src/prompts.ts`
**Changes**: Update `PromptName` type on line 6 to include "media"

```typescript
export type PromptName = "research" | "plan" | "implement" | "ideas" | "pr" | "strategy" | "learn" | "media";
```

**Why**: Enables prompt loading system to recognize "media" as a valid phase name. Required for `loadPromptTemplate(root, "media")` to work.

#### 2. Create Media Phase Prompt Template
**File**: `src/prompts/media.md` (new file)
**Changes**: Create media phase prompt template

```markdown
# Media Generation Task

You are tasked with generating media content (videos or animations) for the Wreckit project.

## Item Details
- **ID**: {{id}}
- **Title**: {{title}}
- **Section**: {{section}}
- **Overview**: {{overview}}

## Your Task
{{#if skill_context}}
## Available Skills
You have access to the following skills for media generation:

{{skill_context}}
{{/if}}

## Media Generation Guidelines

### Manim (Mathematical Animations)
- Create `.py` scene files using Manim API
- Use `manim render <scene_file> <SceneName> -pqh` to render high-quality video
- Output files are in `media/videos/<scene_file>/<SceneName>.mp4`
- Reference: https://docs.manim.community/

### Remotion (React-based Videos)
- Create `.tsx` composition files using Remotion API
- Use `npx remotion render <CompositionId> out/video.mp4` to render
- Requires a root file that registers compositions
- Reference: https://www.remotion.dev/docs/

### Best Practices
1. Start with example templates from `.wreckit/examples/`
2. Test with low quality first (`-pql` for Manim, lower resolution for Remotion)
3. Use descriptive scene/composition names
4. Add comments explaining animation logic
5. Keep animations short (30 seconds max for feature visualizations)

## Completion Signal
When you have successfully generated the media content, output the signal:
DONE
```

**Why**: Provides agents with clear guidance on media generation tasks. Includes skill context injection, Manim/Remotion usage patterns, best practices, and completion signal.

#### 3. Create Media Skills Documentation
**File**: `docs/media-skills.md` (new file)
**Changes**: Create comprehensive documentation for media skills

```markdown
# Media Skills Guide

This guide covers using Manim and Remotion skills for autonomous media generation in Wreckit.

## Overview

Wreckit supports autonomous video generation through two media skills:
- **manim-generation**: Mathematical animations using Manim (Python)
- **remotion-generation**: React-based videos using Remotion (Node.js)

These skills can be loaded in the "media" phase to enable agents to generate videos as part of their workflow.

## Installation Prerequisites

### Manim
1. Install Python 3.8 or later: https://www.python.org/downloads/
2. Install FFmpeg: https://ffmpeg.org/download.html
3. Install LaTeX (optional, for math rendering): https://www.latex-project.org/get/
4. Install Manim: `pip install manim`
5. Verify installation: `manim --version`

### Remotion
1. Install Node.js 16 or later: https://nodejs.org/
2. Install FFmpeg: https://ffmpeg.org/download.html
3. Initialize Remotion project: `npx create-video@latest`
4. Verify installation: `npx remotion --version`

**Note**: FFmpeg is required by both tools. Install it first.

## Configuration

### Enable Media Skills

Add media skills to `.wreckit/skills.json`:

```json
{
  "phase_skills": {
    "media": ["manim-generation", "remotion-generation"]
  },
  "skills": [
    {
      "id": "manim-generation",
      "name": "Manim Animation Generation",
      "description": "Generate mathematical animations using Manim engine",
      "tools": ["Bash", "Write", "Read", "Glob"],
      "required_context": [
        {
          "type": "git_status",
          "description": "Check for existing Manim project files"
        }
      ]
    },
    {
      "id": "remotion-generation",
      "name": "Remotion Video Generation",
      "description": "Generate React-based videos using Remotion framework",
      "tools": ["Bash", "Write", "Read", "Glob"],
      "required_context": [
        {
          "type": "file",
          "path": "package.json",
          "description": "Check for Remotion in dependencies"
        }
      ]
    }
  ]
}
```

### Media Phase Tool Permissions

The media phase allows the following tools:
- **Read**: Access existing code and templates
- **Write**: Create animation scripts
- **Glob**: Find project files
- **Grep**: Search codebase
- **Bash**: Run Manim/Remotion CLIs

## Usage Examples

### Example 1: Generate Manim Animation

Agent prompt:
```
Generate a 10-second animation showing the Wreckit workflow phases.
Use Manim and save the output to videos/workflow.mp4
```

Agent actions:
1. Create `scenes/workflow.py` using Manim API
2. Run `manim render scenes/workflow.py WorkflowPhases -pqh`
3. Output video: `media/videos/workflow/WorkflowPhases.mp4`

### Example 2: Generate Remotion Video

Agent prompt:
```
Create a 30-second feature visualization for the new skill loading system.
Use Remotion and save to feature-viz.mp4
```

Agent actions:
1. Create `compositions/FeatureViz.tsx` using Remotion API
2. Update `root.tsx` to register composition
3. Run `npx remotion render FeatureViz feature-viz.mp4`
4. Output video: `feature-viz.mp4`

## Integration with Item 036 (summarize command)

Item 036's `wreckit summarize` command will use media skills to generate 30-second feature visualization videos. The command will:

1. Load media phase with manim-generation and remotion-generation skills
2. Provide agent with item details (overview, plan, PRD)
3. Instruct agent to create a visualization of the implemented feature
4. Render video using appropriate tool (Manim for math/animations, Remotion for UI/UX)
5. Save output to `.wreckit/media/<item-id>-summary.mp4`

## Templates

Wreckit provides example templates to help agents get started:

- **Manim**: `.wreckit/examples/manim-scene.py` - Basic scene with animations
- **Remotion**: `.wreckit/examples/remotion-composition.tsx` - Basic composition with hooks
- **Remotion Root**: `.wreckit/examples/remotion-root.tsx` - Root configuration

Agents can copy and adapt these templates for their specific tasks.

## Troubleshooting

### Manim Issues

**Problem**: `manim: command not found`
**Solution**: Install Manim via `pip install manim` and verify PATH

**Problem**: LaTeX errors
**Solution**: Install LaTeX or use `--disable_linting` flag

**Problem**: Video rendering fails
**Solution**: Check that scene file is valid Python and SceneName matches class name

### Remotion Issues

**Problem**: `npx remotion: command not found`
**Solution**: Install Remotion via `npm install remotion` or use `npx`

**Problem**: Composition not found
**Solution**: Verify composition is registered in root file and ID matches

**Problem**: Video rendering fails
**Solution**: Check that TypeScript/TSX files are valid and dependencies are installed

## Best Practices

1. **Start with examples**: Copy templates from `.wreckit/examples/` and adapt
2. **Test with low quality**: Use `-pql` for Manim (low quality, fast render)
3. **Keep it short**: 30 seconds is ideal for feature visualizations
4. **Use descriptive names**: Scene/composition names should be self-explanatory
5. **Add comments**: Explain animation logic in code comments
6. **Version control**: Commit scene files and generated videos
7. **Document dependencies**: Note Manim/Remotion versions in README

## Future Enhancements

Potential improvements to media skills:
- Docker containerization for consistent environments
- Progressive rendering (low-quality preview → full render)
- Async rendering with status polling
- Quality preset system (low/medium/high)
- Automatic dependency detection
- MCP server wrapping Manim/Remotion APIs
- Asset library for reusable animations/compositions

## References

- Manim Documentation: https://docs.manim.community/
- Remotion Documentation: https://www.remotion.dev/docs/
- Item 033 (Skill Loading): `/Users/speed/wreckit/.wreckit/items/033-implement-phase-specific-skill-loading-jit-context/plan.md`
- Item 034 (wreckit learn): `/Users/speed/wreckit/.wreckit/items/034-create-wreckit-learn-command-to-compile-codebase-p/plan.md`
- Item 036 (wreckit summarize): Depends on this item
```

**Why**: Provides comprehensive documentation for users to set up and use media skills. Includes installation prerequisites, configuration examples, usage patterns, troubleshooting, and integration guidance for Item 036.

### Success Criteria:

#### Automated Verification:
- [ ] Prompt type includes "media": `PromptName` type accepts "media" string
- [ ] Prompt loads correctly: `loadPromptTemplate(root, "media")` returns media.md content
- [ ] Documentation is valid Markdown: `docs/media-skills.md` can be read and parsed

#### Manual Verification:
- [ ] Media prompt renders correctly: `renderPrompt(mediaTemplate, variables)` substitutes variables
- [ ] Documentation is comprehensive: Covers prerequisites, usage, troubleshooting
- [ ] Documentation links work: References to other items and external docs are correct
- [ ] Example templates work: Manim scene and Remotion composition are valid and renderable

**Note**: Complete all automated verification, then pause for manual confirmation before proceeding to final phase.

---

## Phase 5: Testing and Validation

### Overview
Comprehensive testing of media skills integration. Verify that skills load correctly, tools intersect properly, context requirements resolve, and the system is ready for Item 034 (wreckit learn) and Item 036 (wreckit summarize).

### Changes Required:

#### 1. Create Integration Test (Optional)
**File**: `src/__tests__/integration/media-skills.test.ts` (new file, optional)
**Changes**: Create test suite for media skills

```typescript
import { describe, it, expect } from "bun:test";
import { loadSkillsForPhase } from "../../agent/skillLoader";
import type { SkillConfig } from "../../schemas";
import { getAllowedToolsForPhase } from "../../agent/toolAllowlist";

describe("Media Skills Integration", () => {
  const mockSkillConfig: SkillConfig = {
    phase_skills: {
      media: ["manim-generation", "remotion-generation"],
    },
    skills: [
      {
        id: "manim-generation",
        name: "Manim Animation Generation",
        description: "Generate mathematical animations",
        tools: ["Bash", "Write", "Read", "Glob"],
      },
      {
        id: "remotion-generation",
        name": "Remotion Video Generation",
        description: "Generate React-based videos",
        tools: ["Bash", "Write", "Read", "Glob"],
      },
    ],
  };

  it("should load both media skills for media phase", () => {
    const result = loadSkillsForPhase("media", mockSkillConfig);
    expect(result.loadedSkillIds).toEqual(["manim-generation", "remotion-generation"]);
  });

  it("should intersect skill tools with phase allowlist", () => {
    const result = loadSkillsForPhase("media", mockSkillConfig);
    const phaseTools = getAllowedToolsForPhase("media");

    // All allowed tools should be in phase allowlist
    for (const tool of result.allowedTools ?? []) {
      expect(phaseTools).toContain(tool);
    }
  });

  it("should load context requirements for skills", () => {
    const result = loadSkillsForPhase("media", mockSkillConfig);
    expect(result.contextRequirements.length).toBeGreaterThan(0);
  });
});
```

**Why**: Optional but recommended - validates that media skills integrate correctly with skill loading infrastructure. Can be run automatically to catch regressions.

#### 2. Manual Validation Checklist

Create a validation checklist document:
**File**: `.wreckit/items/035-implement-autonomous-media-layer-integration-with-/validation.md` (new file)
**Changes**: Document validation steps

```markdown
# Media Layer Validation Checklist

## Infrastructure Validation

- [ ] Media phase added to tool allowlists
- [ ] Media phase tools: Read, Write, Glob, Grep, Bash
- [ ] "media" added to PromptName type
- [ ] Media prompt template exists (src/prompts/media.md)
- [ ] Media documentation exists (docs/media-skills.md)

## Skill Definition Validation

- [ ] manim-generation skill defined in skills.json
- [ ] remotion-generation skill defined in skills.json
- [ ] Both skills mapped to media phase in phase_skills
- [ ] Skill tools intersect with media phase allowlist (no violations)
- [ ] Skill context requirements are valid (file, git_status)
- [ ] Skills validate against SkillConfigSchema

## Template Validation

- [ ] Manim template exists (.wreckit/examples/manim-scene.py)
- [ ] Manim template is valid Python syntax
- [ ] Remotion template exists (.wreckit/examples/remotion-composition.tsx)
- [ ] Remotion template is valid TypeScript/TSX syntax
- [ ] Remotion root template exists (.wreckit/examples/remotion-root.tsx)

## Integration Validation

- [ ] loadSkillsForPhase("media", config) loads both skills
- [ ] allowedTools is intersection of skill tools and phase tools
- [ ] contextRequirements includes git_status and file requirements
- [ ] buildJitContext() resolves context requirements successfully

## Documentation Validation

- [ ] docs/media-skills.md covers Manim installation
- [ ] docs/media-skills.md covers Remotion installation
- [ ] docs/media-skills.md includes usage examples
- [ ] docs/media-skills.md includes troubleshooting
- [ ] docs/media-skills.md references Item 033, 034, 036

## Dependency Chain Validation

- [ ] Item 033 infrastructure is complete and working
- [ ] Item 034 can extract media skill patterns (if 034 is implemented)
- [ ] Item 036 dependencies are documented (even if not implemented)

## End-to-End Validation (Optional)

- [ ] Manim renders example scene (if Manim installed)
- [ ] Remotion renders example composition (if Remotion installed)
- [ ] Agent can create animation using media skills
- [ ] Generated videos are playable
```

**Why**: Provides a clear checklist for validating that all components of the media layer are working correctly. Can be used for manual testing or as a basis for automated tests.

### Success Criteria:

#### Automated Verification:
- [ ] Type checking passes: `npm run build` (no TS errors)
- [ ] Linting passes: `npm run lint` (if configured)
- [ ] Schema validation passes: `.wreckit/skills.json` is valid
- [ ] Integration tests pass: `bun test src/__tests__/integration/media-skills.test.ts` (if created)

#### Manual Verification:
- [ ] All validation checklist items pass
- [ ] Media skills load correctly in media phase
- [ ] Tools intersect properly (no permission violations)
- [ ] Context requirements resolve successfully
- [ ] Example templates are valid and renderable (if tools installed)
- [ ] Documentation is comprehensive and accurate
- [ ] System is ready for Item 034 (wreckit learn) and Item 036 (wreckit summarize)

**Note**: This is the final phase. After completion, the media layer is ready for use by downstream items in the M4 campaign.

---

## Testing Strategy

### Unit Tests:
- **Tool allowlist validation**: Verify media phase allows correct tools
- **Skill loading**: Verify media skills load and intersect with phase tools
- **Context resolution**: Verify context requirements resolve correctly
- **Prompt rendering**: Verify media prompt template renders with variables

### Integration Tests:
- **Skill loading**: `loadSkillsForPhase("media", config)` returns expected skills
- **Tool intersection**: allowedTools is subset of phase tools
- **Context building**: `buildJitContext()` loads git_status and files
- **End-to-end**: Agent can use media skills to generate animations (optional, requires Manim/Remotion)

### Manual Testing Steps:
1. Verify `.wreckit/skills.json` is valid and includes media skills
2. Run `loadSkillsForPhase("media", skillConfig)` and check loadedSkillIds
3. Verify allowedTools includes Bash, Write, Read, Glob (all in phase allowlist)
4. Check that `buildJitContext()` with media skill context requirements works
5. Verify example templates are valid Python/TypeScript
6. (Optional) Install Manim and render example scene
7. (Optional) Install Remotion and render example composition
8. Review documentation for completeness and accuracy

## Migration Notes
No migration required - this is a new feature. Existing workflows are unaffected. Media skills are opt-in (must be explicitly added to `.wreckit/skills.json`).

## References
- Research: `/Users/speed/wreckit/.wreckit/items/035-implement-autonomous-media-layer-integration-with-/research.md`
- Item 033 (Skill Loading): `src/agent/skillLoader.ts:59-144`
- Item 033 (Context Builder): `src/agent/contextBuilder.ts:51-132`
- Tool Allowlists: `src/agent/toolAllowlist.ts:57-125`
- Skill Schema: `src/schemas.ts:82-123`
- Skills Config: `.wreckit/skills.json:1-96`
- Prompt System: `src/prompts.ts:1-116`
- Agent Runner: `src/agent/runner.ts:348-494`
- Item 034 Plan: `/Users/speed/wreckit/.wreckit/items/034-create-wreckit-learn-command-to-compile-codebase-p/plan.md`
- Item 033 Research: `/Users/speed/wreckit/.wreckit/items/033-implement-phase-specific-skill-loading-jit-context/research.md`
- Manim Docs: https://docs.manim.community/
- Remotion Docs: https://www.remotion.dev/docs/
