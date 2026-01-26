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
- Item 033 (Skill Loading): Phase-specific skill loading infrastructure
- Item 034 (wreckit learn): Pattern extraction command
- Item 036 (wreckit summarize): Feature visualization command
