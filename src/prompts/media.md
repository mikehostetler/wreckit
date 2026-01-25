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

## Completion Signal
When you have successfully generated the media content, output the signal:
DONE
