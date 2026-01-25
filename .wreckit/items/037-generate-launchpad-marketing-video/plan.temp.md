# Generate Launchpad-style Marketing Video with Remotion Implementation Plan

## Overview
Create a high-energy, 30-second product launch video for Wreckit using Remotion that demonstrates "The Factory is Alive" theme. The video will showcase Wreckit's core features (agent loop, watchdog, media layer) with Launchpad-style aesthetics: React components, inline CSS styling, kinetic typography, and fast transitions.

This plan leverages Wreckit's existing `summarize` command infrastructure, skills-based media generation system, and JIT context building to autonomously produce the marketing video.

## Current State Analysis

### Existing Infrastructure
**Media Generation Pipeline (COMPLETE):**
- The `summarize` command is fully implemented (src/commands/summarize.ts:81-209)
- Supports multiple invocation modes: `--item <id>`, `--phase <state>`, `--all`, or default (recent 5 done items)
- Media directory auto-creation and output path handling implemented (src/fs/paths.ts:116-124)
- Video validation includes existence check, file size validation (<50MB), and empty file detection (src/commands/summarize.ts:183-204)

**Skills System (COMPLETE):**
- Phase-specific skill loading via `loadSkillsForPhase()` (src/agent/skillLoader.ts:59-144)
- Media phase configured with "remotion-generation" skill in .wreckit/skills.json:109-125
- Skill defines tools: ["Bash", "Write", "Read", "Glob"]
- Context requirements: package.json check, git status check
- Media phase tool allowlist: Read, Write, Glob, Grep, Bash (src/agent/toolAllowlist.ts:126-133)

**Agent Runner (COMPLETE):**
- Union-based agent configuration (src/commands/summarize.ts:163-172)
- 3x timeout multiplier for video rendering (config.timeout_seconds * 3 = 10,800s default)
- Tool allowlisting enforced for security boundary

**Prompt System (COMPLETE):**
- Media-specific prompt template (src/prompts/media.md:1-43)
- Variables: id, title, section, overview, item_path, branch_name, base_branch, completion_signal, skill_context
- Rendered via `renderPrompt()` with variable substitution (src/prompts.ts:57-98)

**Examples (COMPLETE):**
- Remotion root example: .wreckit/examples/remotion-root.tsx
- Composition example: .wreckit/examples/remotion-composition.tsx

### Missing Components
**Enhanced Media Prompt Template (NOW COMPLETE):**
- Updated src/prompts/media.md with Launchpad-specific guidance
- Added React + inline CSS patterns, kinetic typography, fast transitions
- Added "The Factory is Alive" theme details
- Added scene structure and content suggestions
- Added FFmpeg check instructions
- Added quality/rendering specifications

**Skills Configuration (PRESENT):**
- .wreckit/skills.json exists with "remotion-generation" skill configured
- Phase mapping: "media": ["manim-generation", "remotion-generation"]
- No changes needed

### Key Discoveries
- The `summarize` command uses 3x timeout for video rendering (10,800s default) - sufficient for 30s video (src/commands/summarize.ts:170)
- Media phase tools include Bash for `npx remotion` commands (src/agent/toolAllowlist.ts:126-133)
- JIT context building automatically checks package.json and git status via skill requirements (src/agent/contextBuilder.ts:76-92)
- Output path is predetermined: `.wreckit/media/037-generate-launchpad-marketing-video-summary.mp4` (src/fs/paths.ts:120-124)
- Video must be <50MB for validation to pass (src/commands/summarize.ts:196-200)
- Example Remotion files exist for agent reference (.wreckit/examples/remotion-*.tsx)
- Media prompt template has been enhanced with Launchpad-specific guidance

## Desired End State

### Specification
**Deliverable:** A 30-second MP4 video file (1080p, 30fps, H.264) generated autonomously by Wreckit using Remotion.

**File Location:** `.wreckit/media/037-generate-launchpad-marketing-video-summary.mp4`

**Visual Style (Launchpad):**
- Dark theme with neon accents (blue/purple gradients)
- Bold Inter/Roboto typography with kinetic text animations
- Fast slide-ins, zoom effects, fade transitions (<300ms)
- Code blocks with zoom-in animations
- Modern, high-energy aesthetic matching top-tier open source projects

**Content Structure (30 seconds):**
1. **Scene 1 (0-5s):** Title card - "Wreckit: The Factory is Alive" with kinetic typography
2. **Scene 2 (5-15s):** Agent loop visualization - animated code blocks, terminal output scrolling
3. **Scene 3 (15-25s):** Watchdog and media layer - animated diagrams, flow charts
4. **Scene 4 (25-30s):** Call to action - GitHub URL, "Get Started Today"

**Technical Stack:**
- Remotion (via `npx remotion@latest`)
- React 19.2.3 (already in package.json:63)
- Inline CSS styles (no build step required)
- FFmpeg (required by Remotion for rendering)

### Verification
**Automated:**
- Video file exists at expected path
- File size >0 and <50MB
- Command completes without errors

**Manual:**
- Video plays correctly in media player
- Duration is approximately 30 seconds
- Visual quality is acceptable (1080p, smooth animations)
- All scenes render with correct content
- Fast transitions and kinetic typography visible

## What We're NOT Doing

- ❌ Installing Remotion as a devDependency in package.json (will use `npx remotion@latest`)
- ❌ Creating reusable Remotion project template (out of scope, can be future enhancement)
- ❌ Adding audio/soundtrack (keep it simple, video-only for now)
- ❌ Creating multiple video variations (single video is sufficient)
- ❌ Modifying the `summarize` command code (infrastructure is complete)
- ❌ Adding new skills to skills.json (remotion-generation already exists)
- ❌ Changing video validation logic (existing <50MB limit is appropriate)
- ❌ Creating Manim version (Remotion only, per requirements)
- ❌ Deploying or hosting the video (local file generation only)
- ❌ Integrating with external video hosting platforms (out of scope)

## Implementation Approach

### High-Level Strategy

The implementation follows a **prompt-enhancement and execution approach**. Since the `summarize` command, skills system, and media generation infrastructure are already complete, the task is to:

1. **Enhance the media prompt template** with Launchpad-specific guidance (COMPLETED)
2. **Execute the summarize command** to invoke an agent with the enhanced prompt
3. **Let the agent autonomously create** the Remotion project and render the video

This approach demonstrates Wreckit's core value proposition: autonomous generation of high-quality assets through agent-driven workflows.

### Why This Approach

**Pros:**
- ✅ Zero code changes to core infrastructure
- ✅ Leverages existing skills-based media generation system
- ✅ Demonstrates autonomous video generation capability
- ✅ Maintains separation of concerns (prompt vs. code)
- ✅ Reusable for future video generation tasks
- ✅ Testable and iterative (can refine prompt if needed)

**Cons:**
- ⚠️ Agent may struggle with complex Remotion/CSS syntax (mitigation: provide examples in prompt)
- ⚠️ FFmpeg dependency must be present (mitigation: add check to prompt)
- ⚠️ No manual control over video content (mitigation: detailed prompt with scene specifications)

**Alternative Considered:** Manually create Remotion project and commit to repo. Rejected because it doesn't demonstrate autonomous generation capability.

---

## Phase 1: Enhance Media Prompt Template

### Overview
Update `src/prompts/media.md` with Launchpad-specific guidance to enable autonomous generation of high-energy marketing videos. The enhanced prompt provides detailed instructions for Remotion project structure, React component patterns, inline CSS styling, kinetic typography, and scene composition.

**Status**: ✅ COMPLETED

### Changes Applied:

#### 1. Media Prompt Template Enhancement
**File**: `src/prompts/media.md`
**Changes**: Appended Launchpad-specific guidance section with detailed instructions for agent

**Added Sections:**
- Visual Style Requirements (dark theme, neon accents, kinetic typography)
- Technical Specifications (1080p, 30fps, 30s duration, <50MB)
- Project Structure (temporary remotion-temp directory)
- React Component Guidelines (inline styles, Remotion hooks)
- Scene Structure (4 scenes with detailed timing)
- Rendering Workflow (FFmpeg check, project creation, test render, final render)
- Code Examples (Root.tsx and LaunchpadVideo.tsx templates)
- Best Practices (incremental testing, interpolation, cleanup)
- Troubleshooting (FFmpeg, Remotion, file size, animation speed)

### Success Criteria

#### Automated Verification:
- [x] Prompt file exists at `src/prompts/media.md`
- [x] Prompt contains Launchpad-specific section with visual style requirements
- [x] Prompt includes technical specifications (1080p, 30fps, 30s duration)
- [x] Prompt provides scene structure (4 scenes with timing)
- [x] Prompt includes code examples for Root.tsx and composition
- [x] Prompt includes rendering workflow steps
- [x] Prompt mentions FFmpeg prerequisite check

#### Manual Verification:
- [x] Launchpad guidance is clear and actionable for an agent
- [x] Code examples are syntactically correct TypeScript/React
- [x] Scene timing adds up to 30 seconds (900 frames)
- [x] Prompt includes completion signal instruction
- [x] Troubleshooting section covers common issues

**Status**: Phase 1 complete. Proceeding to Phase 2.

---

## Phase 2: Execute Video Generation

### Overview
Run the `wreckit summarize` command to invoke an autonomous agent with the enhanced media prompt. The agent will create a Remotion project, build the Launchpad-style video, and output the final MP4 file to the expected location.

### Changes Required:

**No code changes** - This phase is command execution only.

#### Execution Steps

1. **Verify Prerequisites**
   - Ensure FFmpeg is installed: `ffmpeg -version`
   - Confirm Node.js version >= 18.0.0
   - Verify .wreckit/skills.json exists with remotion-generation skill

2. **Run Summarize Command**
   ```bash
   wreckit summarize --item 037-generate-launchpad-marketing-video
   ```

   **Expected Behavior:**
   - Command loads media phase skills (remotion-generation)
   - JIT context builds: checks package.json, git status
   - Agent receives enhanced prompt with Launchpad guidance
   - Agent creates temporary Remotion project
   - Agent renders video to `.wreckit/media/037-generate-launchpad-marketing-video-summary.mp4`
   - Command validates video exists, non-empty, <50MB
   - Success message logged with file size

3. **Monitor Agent Execution**
   - Watch for agent creating `remotion-temp/` directory
   - Check for Root.tsx and composition creation
   - Monitor `npx remotion render` output
   - Verify video file creation

4. **Post-Generation Cleanup**
   - Delete `remotion-temp/` directory if agent didn't clean up
   - Verify video file plays correctly
   - Check file size is reasonable (<50MB)

### Success Criteria

#### Automated Verification:
- [ ] Command exits with code 0 (success)
- [ ] Video file exists at `.wreckit/media/037-generate-launchpad-marketing-video-summary.mp4`
- [ ] Video file size >0 bytes
- [ ] Video file size <50MB
- [ ] Command logs success message with file size

#### Manual Verification:
- [ ] Video plays in media player (VLC, QuickTime, etc.)
- [ ] Video duration is approximately 30 seconds
- [ ] Visual quality is acceptable (1080p resolution)
- [ ] Animations are smooth (no stuttering)
- [ ] All 4 scenes render with correct content
- [ ] Fast transitions and kinetic typography visible
- [ ] Dark theme with neon accents present
- [ ] Text is readable (appropriate font sizes)
- [ ] No rendering artifacts or glitches

**Note**: Manual verification is required to confirm video quality. Open the generated file in a video player and watch it end-to-end.

---

## Testing Strategy

### Automated Testing
**No unit tests needed** - This task is prompt enhancement + command execution, not code changes.

**Integration Test** (optional):
- Create test item with overview requesting simple video
- Run `wreckit summarize --item <test-id>`
- Verify video file generation
- Delete test artifacts

### Manual Testing Steps

#### Phase 1 Testing (Prompt Enhancement)
1. Read `src/prompts/media.md` and verify Launchpad section exists
2. Check that all code examples are valid TypeScript/React
3. Verify scene timing adds up to 900 frames (30 seconds)
4. Confirm FFmpeg check is mentioned in prompt

#### Phase 2 Testing (Execution)
1. Run `wreckit summarize --item 037-generate-launchpad-marketing-video`
2. Monitor console output for agent progress
3. Check for temporary Remotion directory creation
4. Wait for render completion (may take several minutes)
5. Verify video file exists at expected path
6. Open video file in media player
7. Watch full 30 seconds and check quality
8. Verify file size is <50MB

### Edge Cases to Consider

**FFmpeg Missing:**
- Agent should detect and report error clearly
- Prompt provides installation instructions

**Remotion Install Failure:**
- `npx remotion@latest` should auto-install latest version
- Network connectivity required

**Video Exceeds 50MB:**
- Agent may need to reduce quality or resolution
- Add compression settings to render command

**Rendering Timeout:**
- 3x timeout (3 hours default) should be sufficient
- If timeout occurs, investigate Remotion process hanging

**Agent Produces Invalid Code:**
- Remotion compile error will fail render
- Agent should iterate and fix syntax errors
- May need to refine prompt if issues persist

**Cross-Platform Compatibility:**
- FFmpeg installation differs by OS (Mac/Linux/Windows)
- Prompt should provide platform-agnostic instructions
- Test on multiple platforms if possible

## Migration Notes
Not applicable - this task does not modify existing data or systems.

## References

### Research Document
- `/Users/speed/wreckit/.wreckit/items/037-generate-launchpad-marketing-video/research.md`

### Key Implementation Files
- **Summarize Command**: `src/commands/summarize.ts:1-210` - Main command implementation
- **Media Phase Tools**: `src/agent/toolAllowlist.ts:126-133` - Allowed tools for media phase
- **Skills Loader**: `src/agent/skillLoader.ts:59-144` - Phase-specific skill loading
- **Context Builder**: `src/agent/contextBuilder.ts:51-132` - JIT context building
- **Media Paths**: `src/fs/paths.ts:116-124` - Media directory and output paths
- **Media Prompt**: `src/prompts/media.md:1-155` - Enhanced prompt template with Launchpad guidance
- **Config Schema**: `src/schemas.ts:99-138` - Skills configuration schema

### Skills Configuration
- `.wreckit/skills.json:109-125` - remotion-generation skill definition
- Skill tools: ["Bash", "Write", "Read", "Glob"]
- Context requirements: package.json check, git status check

### Example Files
- `.wreckit/examples/remotion-root.tsx:1-18` - Remotion root template
- `.wreckit/examples/remotion-composition.tsx:1-30` - Simple composition example

### External References
- Remotion Docs: https://www.remotion.dev/docs/
- Launchpad Reference: https://github.com/trycua/launchpad
- FFmpeg Download: https://ffmpeg.org/download.html

### Related Items
- Item 035: Implemented autonomous media layer integration
- Item 036: Created summarize command for 30-second feature visualization
- Item 033: Implemented phase-specific skill loading and JIT context
