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

### Functional Requirements
1. User runs `wreckit summarize --item 037-generate-launchpad-marketing-video`
2. System loads media generation skills (remotion-generation, manim-generation)
3. Agent creates Remotion project in subdirectory (e.g., `remotion-temp/`)
4. Agent generates 30-second Launchpad-style video with:
   - Scene 1 (0-5s): Title card "Wreckit: The Factory is Alive" with kinetic typography
   - Scene 2 (5-15s): Agent loop visualization with code blocks and terminal output
   - Scene 3 (15-25s): Watchdog and media layer with animated diagrams
   - Scene 4 (25-30s): Call to action with GitHub URL
5. Agent outputs video to `.wreckit/media/037-generate-launchpad-marketing-video-summary.mp4`
6. Command validates video exists, is non-empty, and <50MB

### Quality Requirements
- 1080p resolution (1920x1080), 30fps, H.264 codec
- Fast transitions, zoom effects, kinetic typography
- Dark theme with neon accents (Launchpad style)
- Bold, clean typography using Inter or system fonts
- Uses Tailwind CSS utility classes for styling

### Verification
```bash
# After command execution
ls -lh .wreckit/media/037-generate-launchpad-marketing-video-summary.mp4
# Should show file <50MB

ffprobe .wreckit/media/037-generate-launchpad-marketing-video-summary.mp4
# Should show: 1920x1080, 30fps, h264, ~30 seconds duration
```

## What We're NOT Doing

**Explicitly Out of Scope:**
- ❌ Modifying `package.json` to add Remotion dependencies (use npx)
- ❌ Creating reusable Remotion template library for other items (future work)
- ❌ Adding audio/soundtrack to video (Launchpad reference has audio, but increases complexity)
- ❌ Supporting custom FFmpeg installation (assumes FFmpeg is available or agent handles it)
- ❌ Creating video editing capabilities (trimming, effects, etc.)
- ❌ Adding video preview/playback commands
- ❌ Supporting multiple video formats (only MP4 output)
- ❌ Internationalization or localization of video text
- ❌ Automated A/B testing of video variations
- ❌ Integrating with video hosting platforms (YouTube, Vimeo, etc.)
- ❌ Fixing the test fixture schema mismatch (that's a separate issue)

## Implementation Approach

### High-Level Strategy
The implementation follows a **configuration-first** approach:
1. Configure skills.json to enable media generation capabilities with correct schema
2. Enhance media.md prompt template with Launchpad-specific guidance
3. Execute summarize command to trigger agent-driven video generation
4. Agent creates Remotion project, renders video, outputs to expected path
5. Validate video quality and clean up temporary files

This approach leverages existing infrastructure rather than modifying core command logic. The agent does the heavy lifting of creating Remotion components and rendering the video.

### Decision Rationale

| Decision | Rationale |
|----------|-----------|
| Use `npx remotion@latest` | Avoids modifying package.json, keeps dependencies isolated for one-off renders |
| Create subdirectory for Remotion project | Prevents polluting repo root, easy cleanup after render |
| Single composition with multiple scenes | Easier for agent to manage timing and transitions in one file |
| Inline assets (SVG, system fonts) | No external asset dependencies, simpler for agent to generate |
| 1080p, 30fps, H.264 | Standard web video format, balances quality and file size |
| 30-second duration | Matches command's "feature visualization" intent, keeps file size manageable |
| Dark theme with neon accents | Matches Launchpad aesthetic, high contrast for code blocks |
| Use correct schema field names | Avoids validation errors from SkillConfigSchema |

---

## Phase 1: Configure Media Generation Skills

### Overview
Create `.wreckit/skills.json` configuration to enable media generation capabilities for the agent. This enables the skills-based loading system to provide specialized knowledge for Remotion and Manim video generation.

### Changes Required:

#### 1. Create skills.json configuration
**File**: `.wreckit/skills.json`
**Changes**: Create new file with media phase skills configuration

```json
{
  "schema_version": 1,
  "phase_skills": {
    "media": ["remotion-generation", "manim-generation"]
  },
  "skills": [
    {
      "id": "remotion-generation",
      "name": "Remotion Video Generation",
      "description": "Generate React-based videos using Remotion with Tailwind CSS styling, kinetic typography, and fast transitions",
      "tools": ["Read", "Write", "Bash", "Glob", "Grep"],
      "required_context": ["git_status", "item_metadata"]
    },
    {
      "id": "manim-generation",
      "name": "Manim Video Generation",
      "description": "Generate mathematical animations using Manim for code visualizations and algorithm animations",
      "tools": ["Read", "Write", "Bash", "Glob", "Grep"],
      "required_context": ["git_status"]
    }
  ]
}
```

**Rationale:**
- Uses correct schema field `phase_skills` per SkillConfigSchema (src/schemas.ts:121)
- Uses `required_context` (not `context_requirements`) per SkillSchema (src/schemas.ts:105)
- Includes both Remotion and Manim skills for future flexibility
- Tools match media phase allowlist: Read, Write, Glob, Grep, Bash (src/agent/toolAllowlist.ts:126-133)
- Git status context provides repo information for brand styling
- Item metadata context provides title, overview, etc. for video content

**Critical Note**: The test fixture at src/__tests__/commands/summarize.test.ts:47 uses `phases` which is incorrect. This implementation uses the correct `phase_skills` field name as defined in the schema.

### Success Criteria

#### Automated Verification:
- [ ] JSON file is valid (can be parsed by `jq .` or Node.js `JSON.parse`)
- [ ] File uses `phase_skills` key (not `phases`)
- [ ] Skills use `required_context` key (not `context_requirements`)
- [ ] `wreckit status` does not show configuration errors
- [ ] Skills are loadable via `loadSkillsForPhase("media", config.skills)` without schema validation errors

#### Manual Verification:
- [ ] Run `wreckit summarize --item 037-generate-launchpad-marketing-video --dry-run`
- [ ] Verify logs show "Loaded media skills: remotion-generation, manim-generation"
- [ ] Confirm no schema validation errors in output
- [ ] Check that git_status and item_metadata context is built

**Note**: Complete automated verification, then pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Enhance Media Prompt Template

### Overview
Update the media prompt template (`src/prompts/media.md`) with Launchpad-specific guidance, Remotion workflow instructions, and "The Factory is Alive" theme specifications. This enables the agent to understand the desired video style and content requirements.

### Changes Required:

#### 1. Update media.md prompt template
**File**: `src/prompts/media.md`
**Changes**: Replace basic template with Launchpad-specific guidance

```markdown
# Media Generation Task - Launchpad Style

You are tasked with generating a 30-second Launchpad-style marketing video for Wreckit using Remotion.

## Item Details
- **ID**: {{id}}
- **Title**: {{title}}
- **Section**: {{section}}
- **Overview**: {{overview}}

{{#if skill_context}}
## Available Skills
You have access to the following skills for media generation:

{{skill_context}}
{{/if}}

## Video Requirements

### Style Guide (Launchpad)
- **Framework**: Use **React** and **Remotion** for video generation
- **Styling**: Use **Tailwind CSS** utility classes for all styling
- **Typography**: Bold, clean, modern fonts (Inter, Roboto, or system fonts)
- **Motion**: Fast transitions (0.3-0.5s), zoom-ins on code blocks, kinetic typography effects
- **Theme**: "The Factory is Alive" - visualize the autonomous agent loop, watchdog monitoring, and media generation
- **Colors**: Dark theme (#0a0a0a background) with neon accents (cyan #00d4ff, purple #a855f7)
- **Resolution**: 1920x1080 (1080p), 30fps, H.264 codec
- **Duration**: Exactly 30 seconds (900 frames @ 30fps)
- **File Size**: Target <50MB for easy sharing

### Video Structure (30 seconds total)

**Scene 1: Title Card (0-5s / frames 0-150)**
- Large kinetic typography: "Wreckit" with scale/fade animation
- Subtitle: "The Factory is Alive" with slide-in effect
- Background: Subtle grid pattern or gradient animation
- Text effects: Letter-by-letter reveal or word-by-word stagger

**Scene 2: Agent Loop (5-15s / frames 150-450)**
- Visualize the agent workflow: Research → Plan → Implement → PR
- Use code block zoom-ins showing key Wreckit concepts
- Animated terminal output with scrolling text
- Transition: Fast slide or zoom between stages

**Scene 3: Watchdog & Media Layer (15-25s / frames 450-750)**
- Animated diagram showing watchdog monitoring agent runs
- Media layer visualization: Remotion/Manim generation pipeline
- Flow arrows, animated icons, or timeline visualization
- Use accent colors to highlight data flow

**Scene 4: Call to Action (25-30s / frames 750-900)**
- Final text: "Autonomous PRs, on autopilot"
- GitHub URL: github.com/mikehostetler/wreckit
- Fade out with logo or tagline

## Technical Implementation

### Step 1: Verify Prerequisites
```bash
# Check FFmpeg is installed (required by Remotion)
ffmpeg -version
# If missing, install via: brew install ffmpeg (Mac), apt install ffmpeg (Linux), choco install ffmpeg (Windows)

# Verify Remotion can be invoked
npx remotion@latest --version
```

### Step 2: Create Remotion Project Structure
```bash
# Create temporary directory for Remotion project
mkdir remotion-temp
cd remotion-temp

# Initialize Remotion project (choose "Blank" template)
npx remotion@latest init

# Or manually create:
# - Root.tsx (registers compositions)
# - compositions/LaunchpadVideo.tsx (main composition)
```

### Step 3: Create React Components

**Root.tsx example:**
```tsx
import { Composition } from "remotion";
import { LaunchpadVideo } from "./compositions/LaunchpadVideo";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Launchpad"
        component={LaunchpadVideo}
        durationInFrames={900} // 30 seconds @ 30fps
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
    </>
  );
};
```

**LaunchpadVideo.tsx structure:**
```tsx
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

export const LaunchpadVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Calculate scene boundaries (in frames)
  const scene1End = 5 * fps;      // 150 frames
  const scene2End = 15 * fps;     // 450 frames
  const scene3End = 25 * fps;     // 750 frames

  const currentScene = frame < scene1End ? "title" :
                       frame < scene2End ? "agent-loop" :
                       frame < scene3End ? "watchdog" : "cta";

  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0a0a" }}>
      {currentScene === "title" && <TitleScene />}
      {currentScene === "agent-loop" && <AgentLoopScene />}
      {currentScene === "watchdog" && <WatchdogScene />}
      {currentScene === "cta" && <CTAScene />}
    </AbsoluteFill>
  );
};
```

### Step 4: Use Tailwind CSS for Styling
```tsx
// Install Tailwind CSS in Remotion project
npm install -D tailwindcss

// Example styled component
<div className="flex items-center justify-center bg-gradient-to-br from-cyan-500/20 to-purple-500/20">
  <h1 className="text-9xl font-bold text-white animate-scale-in">
    Wreckit
  </h1>
</div>
```

### Step 5: Test Render (Low Quality)
```bash
# Render first 3 seconds at low quality for quick testing
npx remotion@latest render Launchpad out/test.mp4 \
  --frames=0-90 \
  --jpeg-quality=50 \
  --overwrite
```

### Step 6: Final Render
```bash
# Render full video to expected output path
npx remotion@latest render Launchpad ../.wreckit/media/{{id}}-summary.mp4 \
  --overwrite \
  --jpeg-quality=80

# Expected output path: .wreckit/media/{{id}}-summary.mp4
```

### Step 7: Cleanup
```bash
# Remove temporary Remotion directory after successful render
cd ..
rm -rf remotion-temp
```

## Best Practices

1. **Start Simple**: Create basic composition first, test render, then add animations
2. **Use Interpolate**: Leverage Remotion's `interpolate()` for smooth animations
3. **Test Incrementally**: Render 3-second clips at low quality before full render
4. **Keep Duration Short**: Target exactly 30 seconds (900 frames @ 30fps)
5. **Optimize File Size**: Use moderate JPEG quality (70-80) to stay under 50MB
6. **Use System Fonts**: Avoid loading external fonts to keep project self-contained
7. **Inline Assets**: Use SVG strings or CSS shapes instead of external images
8. **Check Console**: Watch for FFmpeg errors during render
9. **Verify Output**: Always check video file exists and is non-empty before completing

## Completion Signal

When you have successfully generated the video at the expected output path (`.wreckit/media/{{id}}-summary.mp4`), output:
DONE
```

**Rationale:**
- Provides detailed scene-by-scene guidance matching requirements
- Includes code examples for Remotion component structure
- Specifies exact timing (30 seconds = 900 frames @ 30fps)
- Uses correct relative output path `../.wreckit/media/{{id}}-summary.mp4` for agent in remotion-temp directory
- Adds FFmpeg prerequisite check (critical for Remotion)
- Includes cleanup step to remove temporary directory
- Uses "DONE" completion signal for clarity

### Success Criteria

#### Automated Verification:
- [ ] Prompt template is valid Markdown
- [ ] Template variables (`{{id}}`, `{{title}}`, `{{overview}}`) are correctly formatted
- [ ] Handlebars conditional block (`{{#if skill_context}}`) is properly closed with `{{/if}}`
- [ ] Output path uses correct relative path: `../.wreckit/media/{{id}}-summary.mp4`

#### Manual Verification:
- [ ] Review prompt for clarity and completeness
- [ ] Verify Launchpad style requirements are well-documented
- [ ] Confirm Remotion workflow steps are logically ordered
- [ ] Check that scene timing is explicitly stated in both seconds and frames
- [ ] Verify Tailwind CSS examples are provided
- [ ] Confirm FFmpeg check is included

**Note**: Complete automated verification, then pause for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Execute Summarize Command

### Overview
Run the `wreckit summarize` command to trigger agent-driven video generation. The agent will receive the enhanced prompt, create a Remotion project, generate the Launchpad-style video, and output it to the expected path.

### Changes Required:

#### 1. Run summarize command
**Command**: Terminal execution from Wreckit repo root
**Execute**:
```bash
wreckit summarize --item 037-generate-launchpad-marketing-video --verbose
```

**Expected Behavior:**
1. Command loads media skills from `.wreckit/skills.json`
2. Command builds JIT context with git_status and item_metadata
3. Command renders media.md prompt with variables (id, title, overview, skill_context)
4. Agent receives prompt with Launchpad requirements
5. Agent creates `remotion-temp/` directory
6. Agent initializes Remotion project using `npx remotion@latest init`
7. Agent creates Root.tsx and composition files
8. Agent runs test render (first 3 seconds)
9. Agent runs final render to output path
10. Agent outputs "DONE" completion signal
11. Command validates video exists and is <50MB

#### 2. Monitor agent progress
**Observation Points:**
- Watch for "Loaded media skills: remotion-generation, manim-generation"
- Monitor agent's Bash tool usage (npx commands, FFmpeg checks)
- Check for Remotion render progress logs
- Verify "DONE" signal is output
- Confirm validation logs show file size <50MB

**Expected Timeline:**
- FFmpeg check: <5 seconds
- Remotion installation (first run): 30-60 seconds
- Project setup: 1-2 minutes
- Test render (3 seconds): 30-60 seconds
- Final render (30 seconds): 2-5 minutes (hardware dependent)
- **Total expected time**: 5-10 minutes

### Success Criteria

#### Automated Verification:
- [ ] Command exits with success (exit code 0)
- [ ] Video file exists at `.wreckit/media/037-generate-launchpad-marketing-video-summary.mp4`
- [ ] File is non-empty (size > 0 bytes)
- [ ] File size is <50MB (use `ls -lh` to check)
- [ ] File is valid MP4 format (can be opened with ffprobe or video player)

#### Manual Verification:
- [ ] Play video and verify approximately 30-second duration
- [ ] Confirm 1080p resolution (1920x1080) using ffprobe
- [ ] Check visual quality: fast transitions, kinetic typography, dark theme
- [ ] Verify all 4 scenes are present: title, agent loop, watchdog/media, CTA
- [ ] Ensure Wreckit branding is visible throughout
- [ ] Confirm no visual glitches or rendering artifacts

**Verification Commands:**
```bash
# Check file exists and size
ls -lh .wreckit/media/037-generate-launchpad-marketing-video-summary.mp4

# Verify video properties
ffprobe -v error -show_entries stream=width,height,codec_name,r_frame_rate -show_entries format=duration .wreckit/media/037-generate-launchpad-marketing-video-summary.mp4

# Expected output:
# Stream 0: width=1920, height=1080, codec_name=h264, r_frame_rate=30/1
# Format: duration=30.0 (approximately)
```

**Note**: Complete all verification steps to confirm successful video generation before proceeding to Phase 4.

---

## Phase 4: Validation & Cleanup

### Overview
Validate the generated video meets all quality requirements, verify it plays correctly in media players, and clean up temporary files created during the generation process. Document the outcome for future reference.

### Changes Required:

#### 1. Validate Video File
**File**: Manual verification with media tools
**Changes**: Use FFprobe and media player to validate video properties

```bash
# Check video metadata
ffprobe .wreckit/media/037-generate-launchpad-marketing-video-summary.mp4

# Expected output includes:
# - Duration: 00:00:30.00 (approximately 30 seconds, allow ±2s tolerance)
# - Video: h264 (High), yuv420p, 1920x1080
# - FPS: 30
# - File size: < 52428800 bytes (50MB)
```

**Rationale**: Validates technical correctness of video output. Ensures it meets format and size requirements.

#### 2. Test Video Playback
**File**: Manual verification in media player
**Changes**: Open video in standard media player and watch full content

**Verification Checklist:**
- [ ] Video opens in VLC, QuickTime, or similar player
- [ ] Video plays smoothly without stuttering or artifacts
- [ ] Scene 1 (0-5s): Title card "Wreckit: The Factory is Alive" with kinetic typography
- [ ] Scene 2 (5-15s): Agent loop visualization with code blocks and/or terminal output
- [ ] Scene 3 (15-25s): Watchdog and media layer with animated diagrams or flow charts
- [ ] Scene 4 (25-30s): Call to action with GitHub URL
- [ ] Transitions between scenes are smooth and fast
- [ ] Text is readable (not too small, good contrast)
- [ ] Colors are vibrant and match Launchpad style
- [ ] Motion effects are dynamic but not jarring
- [ ] Total duration is 28-32 seconds (allow ±2s variance)

**Rationale**: Ensures video is visually acceptable for marketing use and meets quality standards.

#### 3. Clean Up Temporary Files
**File**: Manual cleanup step
**Changes**: Remove temporary Remotion project directory if it exists

```bash
# Check if temporary directory was created
ls -la remotion-temp/

# If present and video is valid, remove it
rm -rf remotion-temp/

# Verify cleanup
ls -la | grep remotion
# Should return empty (no matches)

# Check git status (should show no Remotion files)
git status
# Should only show changes to .wreckit/ directory
```

**Rationale**: Temporary Remotion project directory is not needed after successful render. Cleanup keeps repository clean.

#### 4. Document Outcome
**File**: Update item state or add completion notes to research.md
**Changes**: Record success or issues for future reference

**If Successful:**
```markdown
## Video Generation Complete

✓ Generated Launchpad-style marketing video for Wreckit
✓ Output: .wreckit/media/037-generate-launchpad-marketing-video-summary.mp4
✓ Duration: 30 seconds, 1080p, 30fps, H.264
✓ File size: XX MB
✓ Demonstrates Wreckit's autonomous media generation capabilities

**Video Content:**
- Scene 1 (0-5s): Title card with kinetic typography
- Scene 2 (5-15s): Agent loop visualization
- Scene 3 (15-25s): Watchdog and media layer
- Scene 4 (25-30s): Call to action

**Technical Details:**
- Framework: Remotion with React
- Styling: Tailwind CSS utility classes
- Dependencies: npx remotion@latest (one-off)
- Render time: ~X minutes on [hardware specs]
```

**If Issues Encountered:**
```markdown
## Video Generation Issues

**Issue:** [Description of problem]
**Attempted:** [What was tried to fix]
**Resolution:** [How it was resolved or next steps]
**Lessons Learned:** [What to do differently next time]
```

**Rationale**: Documentation helps with future video generation tasks and provides a record of what worked.

### Success Criteria

#### Automated Verification:
- [ ] Video file exists and is non-zero size
- [ ] Video file size is <50MB
- [ ] Video metadata shows correct resolution (1920x1080) and frame rate (30fps)
- [ ] Video duration is within acceptable range (28-32 seconds)
- [ ] Temporary files removed (remotion-temp/ directory does not exist)
- [ ] Git status shows no uncommitted Remotion-related files

#### Manual Verification:
- [ ] Video plays correctly in standard media player (VLC, QuickTime, etc.)
- [ ] Visual style matches Launchpad reference (fast transitions, kinetic typography, dark theme)
- [ ] All 4 scenes are present with appropriate content
- [ ] Text is readable and colors are vibrant
- [ ] Video is suitable for marketing use (professional quality)
- [ ] No obvious visual artifacts or rendering issues

**Note**: This is the final phase. All criteria must be met for task completion.

---

## Testing Strategy

### Unit Tests:
No new unit tests required for this item. The implementation leverages existing tested infrastructure:
- `summarizeCommand` logic is tested in `src/__tests__/commands/summarize.test.ts`
- Skills loading is tested in existing skill loader tests
- Prompt rendering is tested in existing prompt tests

**Note**: The test fixture at src/__tests__/commands/summarize.test.ts:44-70 uses outdated schema (`phases` instead of `phase_skills`). This is a separate issue and does not affect this implementation.

### Integration Tests:
Manual integration testing is performed during Phase 3 execution:
1. Skills configuration loading with correct schema
2. Prompt template rendering with variable substitution
3. Agent video generation workflow end-to-end
4. Video file validation (existence, size, format)

### Manual Testing Steps:

**Pre-Execution Checklist:**
1. [ ] Verify FFmpeg is installed: `ffmpeg -version`
2. [ ] Confirm `.wreckit/skills.json` exists and is valid JSON with correct schema
3. [ ] Check item 037 state is "planned" or higher
4. [ ] Ensure Node.js version >=18.0.0: `node --version`

**Execution Testing:**
1. [ ] Run `wreckit summarize --item 037-generate-launchpad-marketing-video --verbose`
2. [ ] Monitor logs for skill loading confirmation
3. [ ] Watch agent progress (should take 5-10 minutes for video render)
4. [ ] Verify "DONE" completion signal is output
5. [ ] Check for validation logs showing file size

**Post-Execution Validation:**
1. [ ] Check video file exists at expected path
2. [ ] Verify file size is reasonable (5-50MB range)
3. [ ] Play video in video player (VLC, QuickTime, etc.)
4. [ ] Confirm visual quality meets Launchpad style criteria
5. [ ] Check all scenes are present and correctly timed
6. [ ] Verify no rendering artifacts or glitches
7. [ ] Confirm temporary files are cleaned up

**Edge Cases to Test:**
- [ ] **Agent timeout**: If render exceeds 3x timeout (3 hours), investigate FFmpeg issues or reduce video complexity
- [ ] **Missing FFmpeg**: Agent should detect and provide clear error message in bash output
- [ ] **File size >50MB**: Re-render with lower JPEG quality (e.g., --jpeg-quality=70)
- [ ] **Remotion installation failure**: Agent should retry with `npx remotion@latest`
- [ ] **Syntax errors in React code**: Agent should catch errors during test render phase and fix
- [ ] **Wrong output path**: Agent must use correct relative path from remotion-temp directory

---

## Migration Notes

### No Data Migration Required
This item does not involve database migrations or breaking changes to existing functionality.

### Configuration Migration
After implementing this item, users can optionally:
1. Create their own `.wreckit/skills.json` with custom media generation skills
2. Override `src/prompts/media.md` by creating `.wreckit/prompts/media.md` (future enhancement)
3. Customize video style by modifying the prompt template

### Cleanup After Successful Render
The agent should automatically clean up temporary files:
```bash
# Agent should remove after successful render
rm -rf remotion-temp/
```

Users can manually clean up if agent fails:
```bash
# Manual cleanup if needed
rm -rf remotion-temp/
git status  # Verify no Remotion files remain
```

### Known Issues

**Test Fixture Schema Mismatch:**
The test fixture at `src/__tests__/commands/summarize.test.ts:44-70` uses `phases` and `context_requirements` which do not match the actual schema (`phase_skills` and `required_context`). This should be fixed in a separate item to avoid confusion. The current implementation uses the correct schema as defined in `src/schemas.ts:111-123`.

---

## References

### Source Files Referenced:
- **Command Implementation**: `src/commands/summarize.ts:1-210`
- **Tool Allowlist**: `src/agent/toolAllowlist.ts:126-133`
- **Skills Loader**: `src/agent/skillLoader.ts:59-144`
- **Prompt System**: `src/prompts.ts:1-98`, `src/prompts/media.md:1-43`
- **Paths**: `src/fs/paths.ts:116-124`
- **Schemas**: `src/schemas.ts:99-138` (SkillConfigSchema, SkillSchema)
- **Context Builder**: `src/agent/contextBuilder.ts:51-132`
- **Test Pattern (outdated)**: `src/__tests__/commands/summarize.test.ts:44-70`

### External References:
- **Remotion Documentation**: https://www.remotion.dev/docs/
- **Launchpad Reference**: https://github.com/trycua/launchpad
- **FFmpeg Documentation**: https://ffmpeg.org/documentation.html
- **Tailwind CSS**: https://tailwindcss.com/docs

### Related Items:
- **Item 033**: Skills system and JIT context loading (enables this work)
- **Item 036**: Media generation infrastructure (provides summarize command)

### Research Document:
- **Research**: `/Users/speed/wreckit/.wreckit/items/037-generate-launchpad-marketing-video/research.md`
