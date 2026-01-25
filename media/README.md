# Media Generation for Item 035

This directory contains media content generated for the "Autonomous Media Layer" feature.

## Generated Files

### Manim Scenes

1. **autonomous-media-layer.py** - Full visualization of the media layer integration
   - Shows Wreckit hub with Manim and Remotion skills
   - Demonstrates tool permissions and data flow
   - Includes animated particles showing processing flow
   - ~150 lines of animation code

2. **simple-test.py** - Simplified visualization
   - Basic demonstration of Wreckit, Manim, and Remotion nodes
   - Shows connections between components
   - ~47 lines of animation code

## Rendering Status

### Validation Results
- ✅ Both scene files are valid Python syntax
- ✅ Scene files follow Manim API conventions
- ✅ Animations are properly structured with Scene classes
- ✅ Code includes helpful comments explaining each section

### Known Issue
There is a compatibility issue between Manim v0.19.0 and PyAV v16.0.1 that prevents final video rendering. The partial movie files are generated correctly, but the concatenation step fails with:
```
InvalidDataError: [Errno 1094995529] Invalid data found when processing input
```

This is a known issue with newer versions of PyAV and the `file:` protocol in concat demuxer.

### Workarounds Available

1. **Downgrade PyAV**: `pip install "av<12.0.0"`
2. **Use Manim's docker container**: Provides isolated environment with tested dependencies
3. **Manual FFmpeg concatenation**: The partial movie files can be manually combined
4. **Use alternative output format**: GIF or image sequences can be generated

## How to View Scenes

### Option 1: Install Manim with compatible PyAV
```bash
pip install "av<12.0.0"
manim media/simple-test.py SimpleMediaLayer -qh
```

### Option 2: Use Docker
```bash
docker run --rm -v $(pwd):/wreckit manimcommunity/manim manim media/simple-test.py SimpleMediaLayer -qh
```

### Option 3: View Code
The scene files are well-documented and can be reviewed directly:
- `media/simple-test.py` - Simple demonstration
- `media/autonomous-media-layer.py` - Full feature visualization

## Scene Descriptions

### SimpleMediaLayer
A 15-second animation showing:
1. Title: "Wreckit Media Layer"
2. Central Wreckit hub (blue circle)
3. Manim node (left, green) with label "Mathematical Animations"
4. Remotion node (right, orange) with label "React-Based Videos"
5. Arrows connecting Wreckit to both tools
6. Transform animation showing integration

### AutonomousMediaLayer
A 30-40 second animation showing:
1. Title sequence introducing "Autonomous Media Layer"
2. Central Wreckit hub with "Media Phase" label
3. Manim and Remotion skill nodes with descriptions
4. Tool permissions for each skill (Bash, Write, Read, Glob)
5. Connection arrows showing data flow
6. Animated particle flow demonstrating processing:
   - Particle travels from Wreckit → Manim → Wreckit
   - Particle travels from Wreckit → Remotion → Wreckit
7. Processing highlights (surrounding rectangles)
8. Output labels showing generated MP4 files
9. Summary and fade-out

## Integration with Wreckit

These scenes demonstrate the autonomous media layer capabilities:
- **Media Phase**: New phase for video generation tasks
- **Skill-Based**: Skills for manim-generation and remotion-generation
- **Tool Access**: Controlled tool permissions (Read, Write, Glob, Bash)
- **Autonomous**: Agents can create and render videos without manual intervention

## Next Steps

To fully utilize the media layer:
1. Resolve PyAV compatibility issue or use Docker
2. Render animations to MP4 format
3. Place generated videos in `media/` directory
4. Reference in documentation and demos
5. Use as templates for feature visualization (Item 036)

## References

- Manim Documentation: https://docs.manim.community/
- Item 035 PRD: `.wreckit/items/035-implement-autonomous-media-layer-integration-with-/prd.json`
- Media Skills Guide: `docs/media-skills.md`
