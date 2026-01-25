# Research: Generate Launchpad-style Marketing Video with Remotion

**Date**: 2025-01-25
**Item**: 037-generate-launchpad-marketing-video

## Research Question
Create a high-energy, 30-second product launch video for Wreckit using Remotion.

**Style Guide (Launchpad):**
- Use **React** and **Tailwind CSS** for styling.
- **Typography:** Bold, clean, modern (Inter/Roboto).
- **Motion:** Fast transitions, zoom-ins on code blocks, kinetic typography.
- **Theme:** "The Factory is Alive". Visualize the agent loop, the watchdog, and the media layer.

**Reference:** https://github.com/trycua/launchpad

**Goal:** Demonstrate that Wreckit can autonomously produce high-quality marketing assets in the style of top-tier open source projects.

## Summary

This research reveals that Wreckit has a sophisticated media generation infrastructure through the `summarize` command and "media" phase. The system supports both Manim and Remotion for video generation, with skills-based loading, JIT context building, and agent-driven rendering. The task involves creating a Remotion project that produces a Launchpad-style marketing video demonstrating Wreckit's core features (agent loop, watchdog, media layer) with high-energy visuals, kinetic typography, and modern aesthetics.

**Key Findings:**
1. Wreckit has a complete media generation pipeline via `wreckit summarize` command (src/commands/summarize.ts:1-210)
2. The media phase supports skills-based loading with "remotion-generation" and "manim-generation" skills (src/__tests__/commands/summarize.test.ts:48-64)
3. Media prompt template provides guidance for Remotion usage (src/prompts/media.md:1-43)
4. Output is expected at `.wreckit/media/{item-id}-summary.mp4` (src/fs/paths.ts:120-124)
5. The system allows 3x timeout for video rendering (src/commands/summarize.ts:170)

**Implementation Approach:**
- The `summarize` command will invoke an agent with media phase tools (Read, Write, Bash, Glob, Grep) (src/agent/toolAllowlist.ts:126-133)
- Agent should create a Remotion project with React components, compositions, and render configuration
- The agent will use `npx remotion render` to generate the final video (src/prompts/media.md:29)
- Video will be validated for existence and reasonable file size (<50MB) (src/commands/summarize.ts:196-200)

## Current State Analysis

### Existing Implementation

**Media Generation Infrastructure:**
- The `summarize` command is fully implemented and supports generating 30-second feature visualization videos (src/commands/summarize.ts:81-209)
- Command supports multiple modes: `--item <id>`, `--phase <state>`, `--all`, or default (recent 5 done items) (src/commands/summarize.ts:30-72)
- Media directory creation and output path handling are implemented (src/commands/summarize.ts:112-116, src/fs/paths.ts:116-124)
- Video validation includes existence check, file size validation, and empty file detection (src/commands/summarize.ts:183-204)

**Skills System:**
- Phase-specific skill loading via `loadSkillsForPhase()` (src/agent/skillLoader.ts:59-144)
- Skills define tools, MCP servers, and JIT context requirements (src/schemas.ts:99-123)
- Media phase allows: Read, Write, Glob, Grep, Bash tools (src/agent/toolAllowlist.ts:126-133)
- JIT context building for file loading, git status, item metadata, and phase artifacts (src/agent/contextBuilder.ts:51-132)

**Agent Runner:**
- Union-based agent configuration supporting Claude SDK, AMP SDK, Codex SDK, OpenCode SDK, and process modes (src/schemas.ts:37-71)
- Tool allowlisting system for security boundaries (src/agent/toolAllowlist.ts:57-144)
- Timeout multiplier (3x) for video rendering operations (src/commands/summarize.ts:170)

**Prompt System:**
- Media-specific prompt template with Remotion guidance (src/prompts/media.md:1-43)
- Template variables for item details, completion signals, and skill context (src/prompts.ts:8-24)
- Prompt rendering with conditional blocks and variable substitution (src/prompts.ts:57-98)

### Key Files

**Core Command:**
- `src/commands/summarize.ts:1-210` - Main summarize command implementation with item selection, skill loading, agent execution, and video validation

**Configuration:**
- `src/config.ts:179-222` - Config loading with defaults for agent kind (claude_sdk), timeout (3600s), and skills
- `src/schemas.ts:125-138` - ConfigSchema with optional skills configuration
- `src/schemas.ts:99-123` - SkillSchema defining tools, MCP servers, and context requirements

**Skills System:**
- `src/agent/skillLoader.ts:59-144` - Phase-specific skill loading with tool intersection and MCP aggregation
- `src/agent/toolAllowlist.ts:126-133` - Media phase tool allowlist (Read, Write, Glob, Grep, Bash)
- `src/agent/contextBuilder.ts:51-132` - JIT context building for files, git status, metadata, artifacts

**Prompts:**
- `src/prompts.ts:6` - PromptName type includes "media" phase
- `src/prompts/media.md:27-31` - Remotion usage guidelines with `npx remotion render` command
- `src/prompts/media.md:34-38` - Best practices for templates, testing, and 30-second duration

**Paths:**
- `src/fs/paths.ts:116-124` - Media directory and output path functions
- `src/fs/paths.ts:120-124` - `getMediaOutputPath()` generates `.wreckit/media/{sanitized-id}-summary.mp4`

**Tests:**
- `src/__tests__/commands/summarize.test.ts:1-318` - Comprehensive test coverage for item selection, dry-run mode, and media directory creation
- `src/__tests__/commands/summarize.test.ts:44-70` - Skills configuration test data with "manim-generation" and "remotion-generation" skills

## Technical Considerations

### Dependencies

**Required for Remotion:**
- `remotion` - Core Remotion package for React-based video generation
- `react` and `react-dom` - Already in package.json (v19.2.3) (package.json:63)
- `@remotion/cli` - CLI for rendering videos
- Tailwind CSS - For styling (mentioned in style guide)

**Existing Dependencies:**
- `@types/react` - Already installed (v19.2.8) (package.json:58)
- `react` - Already installed (v19.2.3) (package.json:63)
- TypeScript - Already configured (package.json:50)

**Internal Modules:**
- `src/commands/summarize.ts` - Main command to invoke
- `src/agent/skillLoader.ts` - Load media generation skills
- `src/prompts/media.md` - Prompt template with Remotion guidance
- `src/agent/toolAllowlist.ts` - Media phase tool permissions

### Patterns to Follow

**1. Skills-Based Media Generation:**
```typescript
// From summarize.ts:97-103
const skillResult = loadSkillsForPhase("media", config.skills);
if (skillResult.loadedSkillIds.length > 0) {
  logger.info(`Loaded media skills: ${skillResult.loadedSkillIds.join(", ")}`);
} else {
  logger.warn("No media skills loaded - agent will have basic media capabilities");
}
```

**2. JIT Context Building:**
```typescript
// From summarize.ts:125-131
const context = await buildJitContext(
  skillResult.contextRequirements,
  item,
  config,
  root
);
const skillContext = formatContextForPrompt(context);
```

**3. Prompt Rendering with Variables:**
```typescript
// From summarize.ts:134-148
const variables = {
  id: item.id,
  title: item.title,
  section: item.section,
  overview: item.overview || "No overview provided",
  item_path: getItemDir(root, item.id),
  branch_name: item.branch || "",
  base_branch: config.base_branch,
  completion_signal: completionSignal,
  skill_context: skillContext,
};
const template = await loadPromptTemplate(root, "media");
const prompt = renderPrompt(template, variables);
```

**4. Agent Execution with Extended Timeout:**
```typescript
// From summarize.ts:163-172
const result = await runAgentUnion({
  config: getAgentConfigUnion(config),
  cwd: root,
  prompt,
  logger,
  dryRun: options.dryRun,
  mockAgent: false,
  timeoutSeconds: config.timeout_seconds * 3, // 3x timeout for video rendering
  allowedTools: getAllowedToolsForPhase("media"),
});
```

**5. Video Validation:**
```typescript
// From summarize.ts:183-204
if (!(await pathExists(expectedOutputPath))) {
  logger.warn(`Agent completed but no video found at ${expectedOutputPath}`);
  continue;
}
const stats = await fs.stat(expectedOutputPath);
if (stats.size === 0) {
  logger.error(`Video file is empty: ${expectedOutputPath}`);
  continue;
}
const maxSize = 50 * 1024 * 1024; // 50MB
if (stats.size > maxSize) {
  logger.warn(`Video file is very large: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
}
```

**Conventions Observed:**
- Media phase uses tool allowlist for security (Read, Write, Glob, Grep, Bash only)
- Skills define context requirements (git_status, file, item_metadata, phase_artifact)
- Output files follow naming convention: `{sanitized-item-id}-summary.mp4`
- Timeout is tripled for video rendering (3x config.timeout_seconds)
- Videos are validated for existence, non-zero size, and reasonable file size

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Remotion not installed** | High - Agent cannot render videos | Agent should use Bash tool to run `npx remotion@latest` for auto-installation, or include installation in skill setup |
| **FFmpeg not available** | High - Remotion requires FFmpeg for rendering | Check for FFmpeg via `which ffmpeg` and provide clear error message if missing |
| **Video rendering timeout** | Medium - Video rendering can exceed 3x timeout | Start with low-quality render (`-pql`) for testing, use progress logging to detect hangs |
| **File size too large** | Low - 50MB limit may be exceeded for high-quality video | Use appropriate resolution (1080p), compression settings, and keep duration to 30 seconds |
| **Agent produces invalid Remotion code** | Medium - Syntax errors prevent rendering | Agent should test incrementally: create composition → test low-quality render → full render |
| **Missing media skills configuration** | Low - Agent has basic capabilities but no specialized knowledge | Provide default skills.json with "remotion-generation" skill in test setup |
| **Launchpad reference not accessible** | Low - Agent cannot see reference implementation | Describe Launchpad style in prompt: fast transitions, zoom-ins, kinetic typography |
| **React/Tailwind CSS complexity** | Medium - Agent may struggle with styling | Provide template examples and encourage use of Tailwind utility classes |
| **Cross-platform compatibility** | Low - FFmpeg/Remotion may behave differently on Windows/Mac/Linux | Test rendering on multiple platforms, use platform-agnostic commands |

## Recommended Approach

**High-Level Strategy:**

1. **Configure Media Skills** (if not already present)
   - Create `.wreckit/skills.json` with "remotion-generation" skill
   - Define tools: ["Read", "Write", "Bash", "Glob", "Grep"]
   - Add context_requirements: ["git_status", "item_metadata"]
   - Reference: src/__tests__/commands/summarize.test.ts:44-70

2. **Enhance Media Prompt Template**
   - Update `.wreckit/prompts/media.md` with Launchpad-specific guidance
   - Include: React component structure, Tailwind CSS usage, composition patterns
   - Add example: "The Factory is Alive" theme with agent loop visualization
   - Specify: 30-second duration, 1080p resolution, fast transitions

3. **Execute Summarize Command**
   ```bash
   wreckit summarize --item 037-generate-launchpad-marketing-video
   ```
   - Command loads media skills and builds JIT context
   - Agent receives prompt with Launchpad style requirements
   - Agent creates Remotion project with Root.tsx and compositions

4. **Agent Workflow**
   - **Step 1:** Create directory structure (`remotion/` or similar)
   - **Step 2:** Initialize Remotion project (`npx remotion init` or manual setup)
   - **Step 3:** Create React components with Tailwind styling
   - **Step 4:** Define composition(s) with 30-second duration
   - **Step 5:** Test with low quality: `npx remotion render <Composition> out/test.mp4 --jpeg-quality=50`
   - **Step 6:** Final render: `npx remotion render <Composition> .wreckit/media/037-generate-launchpad-marketing-video-summary.mp4`
   - **Step 7:** Output completion signal: `<promise>COMPLETE</promise>`

5. **Validation**
   - Command checks video exists at expected path
   - Validates file is non-empty and <50MB
   - Logs success with file size

**Video Content Suggestions (for Agent):**
- **Scene 1 (0-5s):** Title card "Wreckit: The Factory is Alive" with kinetic typography
- **Scene 2 (5-15s):** Agent loop visualization - code blocks zooming in, terminal output scrolling
- **Scene 3 (15-25s):** Watchdog and media layer - animated diagrams, flow charts
- **Scene 4 (25-30s):** Call to action - GitHub URL, "Get Started Today"

**Styling Guidelines:**
- Use Tailwind CSS for layout and typography
- Font: Inter or Roboto (via Google Fonts or system fonts)
- Colors: Wreckit brand colors (if defined) or modern gradient (blue/purple)
- Transitions: Fast slide-ins, zoom effects, fade transitions
- Background: Dark theme with neon accents (Launchpad style)

## Open Questions

1. **Remotion Project Structure:** Should the agent create a standalone Remotion project in a subdirectory (e.g., `remotion/`) or inline the composition in the repo root?
   - **Recommendation:** Create subdirectory to avoid polluting root, can be cleaned up after rendering

2. **Dependencies Installation:** Should Remotion be a devDependency in package.json or installed via npx?
   - **Recommendation:** Use `npx remotion@latest` for one-off renders to avoid modifying package.json

3. **FFmpeg Availability:** Is FFmpeg guaranteed to be available in the environment?
   - **Recommendation:** Add check in prompt: "Verify FFmpeg is installed with `ffmpeg -version`, install via apt/brew/choco if missing"

4. **Launchpad Reference Access:** Can the agent access https://github.com/trycua/launchpad for reference?
   - **Recommendation:** Describe Launchpad style in prompt text since agent may not have web access

5. **Quality Settings:** What quality/settings should be used for final render?
   - **Recommendation:** 1080p (1920x1080), 30fps, H.264 codec, moderate compression for <50MB file size

6. **Multiple Compositions:** Should the video be a single composition or multiple scenes edited together?
   - **Recommendation:** Single composition with sequence of scenes (easier for agent to manage)

7. **Asset Management:** Where should static assets (fonts, images, audio) be stored?
   - **Recommendation:** Use inline assets (SVG icons, system fonts) to avoid external dependencies

8. **Testing Strategy:** How to test video generation without waiting for full render?
   - **Recommendation:** Add `--test` flag to summarize command that renders only first 3 seconds at low quality
