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

---

## Launchpad-Style Video Generation Guide

### Visual Style Requirements

- **Theme**: "The Factory is Alive" - showcase Wreckit's autonomous capabilities
- **Aesthetic**: Dark background (#0a0a0a) with neon blue/purple gradients
- **Typography**: Bold, modern fonts (system-ui, -apple-system, Inter, Roboto)
- **Motion**: Fast transitions (<300ms), kinetic typography, zoom effects
- **Duration**: Exactly 30 seconds (900 frames at 30fps)

### Technical Specifications

- **Resolution**: 1920x1080 (Full HD)
- **Frame Rate**: 30 fps
- **Codec**: H.264 (default Remotion output)
- **Max File Size**: 50MB (use appropriate compression settings)
- **Composition Duration**: 900 frames (30 seconds \* 30 fps)

### Project Structure

Create a temporary Remotion project in a subdirectory (e.g., `remotion-temp/`):

1. **Root File**: `remotion-temp/Root.tsx` - Register composition
2. **Composition**: `remotion-temp/LaunchpadVideo.tsx` - Main video component
3. **Render Command**: `npx remotion@latest render LaunchpadVideo .wreckit/media/{{id}}-summary.mp4`

### React Component Guidelines

#### Use Inline Styles (No Tailwind Build Step)

```tsx
// Use inline styles for simplicity - no Tailwind CSS build required
<div
  style={{
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    fontFamily: "system-ui, -apple-system, sans-serif",
    fontWeight: 700,
    fontSize: 80,
    color: "#ffffff",
  }}
>
  Wreckit
</div>
```

#### Remotion Hooks for Animation

```tsx
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  spring,
} from "remotion";

// Kinetic typography with spring animation
const frame = useCurrentFrame();
const scale = spring({
  frame,
  fps: 30,
  config: {
    damping: 10,
    stiffness: 100,
  },
});

// Fade in/out
const opacity = interpolate(frame, [0, 30, 870, 900], [0, 1, 1, 0], {
  extrapolateRight: "clamp",
});
```

### Scene Structure (30 seconds total)

#### Scene 1: Title Card (0-5s, frames 0-150)

**Content**: "Wreckit: The Factory is Alive"
**Animation**:

- Text zooms in from scale 0 to 1 using spring
- Gradient background pulses
- Kinetic typography: letters stagger in
- Fade out at frame 150

#### Scene 2: Agent Loop (5-15s, frames 150-450)

**Content**: Visualize Wreckit's autonomous agent loop
**Animation**:

- Code block zooms in from right side
- Terminal output scrolls vertically
- "Research → Plan → Implement" cycle repeats
- Fast transitions between states

#### Scene 3: Watchdog & Media Layer (15-25s, frames 450-750)

**Content**: Demonstrate watchdog monitoring and media generation
**Animation**:

- Diagram elements slide in from edges
- Flow chart arrows animate
- Video thumbnail appears with play icon
- Checkmarks animate for successful tasks

#### Scene 4: Call to Action (25-30s, frames 750-900)

**Content**: "Get Started Today" + GitHub URL
**Animation**:

- Text slides up from bottom
- GitHub URL fades in
- Final logo pulse
- Fade to black

### Rendering Workflow

#### Step 1: Verify Prerequisites

```bash
# Check FFmpeg availability
ffmpeg -version
# If missing, install via: brew install ffmpeg (Mac), apt install ffmpeg (Linux), choco install ffmpeg (Windows)
```

#### Step 2: Create Remotion Project

```bash
# Create temporary directory
mkdir remotion-temp
cd remotion-temp

# Create Root.tsx with composition registration
# Create LaunchpadVideo.tsx with main component
```

#### Step 3: Test Render (Low Quality)

```bash
# Render first 3 seconds at low quality for quick testing
npx remotion@latest render LaunchpadVideo out/test.mp4 --frames=0-90 --jpeg-quality=50
```

#### Step 4: Final Render

```bash
# Render full video at expected output path
npx remotion@latest render LaunchpadVideo .wreckit/media/{{id}}-summary.mp4
```

### Code Examples

#### Root.tsx Template

```tsx
import { Composition } from "remotion";
import { LaunchpadVideo } from "./LaunchpadVideo";

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="LaunchpadVideo"
        component={LaunchpadVideo}
        durationInFrames={900}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
```

#### LaunchpadVideo.tsx Template

```tsx
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  spring,
} from "remotion";

export const LaunchpadVideo = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Determine which scene to show based on frame number
  const getScene = (frame: number) => {
    if (frame < 150) return "title";
    if (frame < 450) return "agentLoop";
    if (frame < 750) return "watchdog";
    return "cta";
  };

  const scene = getScene(frame);

  // Scene-specific content and animations
  const renderTitleCard = () => (
    <AbsoluteFill
      style={{
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
      }}
    >
      <h1
        style={{
          fontFamily: "system-ui, sans-serif",
          fontWeight: 700,
          fontSize: 100,
          color: "#ffffff",
          textAlign: "center",
          transform: `scale(${spring({ frame, fps, config: { damping: 10, stiffness: 100 } })})`,
        }}
      >
        Wreckit
      </h1>
      <p
        style={{
          fontFamily: "system-ui, sans-serif",
          fontSize: 60,
          color: "#ffffff",
          marginTop: 40,
          opacity: interpolate(frame, [0, 30], [0, 1]),
        }}
      >
        The Factory is Alive
      </p>
    </AbsoluteFill>
  );

  // Add other scene render functions...

  return (
    <AbsoluteFill>
      {scene === "title" && renderTitleCard()}
      {scene === "agentLoop" && renderAgentLoop()}
      {scene === "watchdog" && renderWatchdog()}
      {scene === "cta" && renderCTA()}
    </AbsoluteFill>
  );
};
```

### Best Practices

1. **Start Simple**: Create basic composition first, test rendering, then add animations
2. **Use Interpolation**: Smooth transitions using `interpolate()` for fades, slides, zooms
3. **Test Incrementally**: Render first few seconds before full render
4. **Check File Size**: Ensure output is <50MB by adjusting compression if needed
5. **Clean Up**: Delete remotion-temp directory after successful render
6. **Output Completion Signal**: Print `<promise>COMPLETE</promise>` after successful render

### Troubleshooting

- **FFmpeg not found**: Install via package manager (brew/apt/choco)
- **Remotion install fails**: Use `npx remotion@latest` for latest version
- **Video too large**: Reduce resolution or increase compression
- **Animation too slow**: Decrease interpolation ranges or increase spring stiffness
- **Render timeout**: The command has 3x timeout (3 hours) - should be sufficient

## Completion Signal

When you have successfully generated the media content, output the signal:
<promise>COMPLETE</promise>
