# Media Content - ID Resolution Improvement

## Overview
This directory contains animated visualizations for item **019-improve-ambiguous-id-resolution-to-warnerror-on-mu**, which demonstrates the improved ID resolution system for Wreckit.

## Rendered Videos

### 1. IDResolutionOverview.mp4
**Duration**: ~25 seconds
**Size**: 837 KB
**Resolution**: 1080p60 (1920x1080, 60fps)

A comprehensive overview showing:
- The problem with the current limited ID resolution (numeric-only)
- The solution: Three-tier matching system (exact → numeric prefix → slug suffix)
- Ambiguity detection feature
- Key benefits of the new system

### 2. AmbiguityDetectionScene.mp4
**Duration**: ~20 seconds
**Size**: 523 KB
**Resolution**: 1080p60 (1920x1080, 60fps)

A focused demonstration of the ambiguity detection feature showing:
- Example items with similar slugs
- An ambiguous input ("dark-mode")
- The error response listing all matching items
- How users can disambiguate using full IDs

## Source File

**File**: `id-resolution-animation.py`

### Scenes

1. **CurrentStateScene** - Shows the limitations of the current numeric-only system
2. **NewSystemScene** - Demonstrates the three-tier matching approach
3. **AmbiguityDetectionScene** - Shows how ambiguous inputs are detected and reported
4. **SuccessCaseScene** - Examples of successful ID resolution
5. **IDResolutionOverview** - Complete overview of the improvement

## Rendering Instructions

### Render all scenes in high quality:
```bash
cd /Users/speed/wreckit/.wreckit/items/019-improve-ambiguous-id-resolution-to-warnerror-on-mu
python -m manim id-resolution-animation.py <SceneName> -pqh
```

### Render in low quality (faster for testing):
```bash
python -m manim id-resolution-animation.py <SceneName> -pql
```

### Available Scene Names:
- `IDResolutionOverview` (recommended main overview)
- `AmbiguityDetectionScene` (focus on ambiguity feature)
- `CurrentStateScene` (problem statement)
- `NewSystemScene` (solution overview)
- `SuccessCaseScene` (success examples)

## Technical Details

- **Engine**: Manim Community v0.19.0
- **Python**: 3.10.14
- **Output Format**: MP4 (H.264)
- **Audio**: None (visual-only animations)

## Usage in Documentation

These videos can be embedded in:
- Pull request descriptions
- Documentation pages
- Feature presentations
- Onboarding materials for new contributors

## Key Visualizations

### Three-Tier Matching System
1. **Exact Match**: Full ID like "001-add-dark-mode"
2. **Numeric Prefix**: Short numbers like "1" → "001-add-dark-mode"
3. **Slug Suffix**: Text like "dark-mode" → "*-dark-mode"

### Ambiguity Detection
When multiple items match (e.g., "dark-mode" matches both "001-add-dark-mode" and "003-add-dark-mode-preview"), the system:
- Throws an `AmbiguousIdError`
- Lists all matching items
- Guides users to use full IDs for disambiguation

### Benefits Visualized
- ✓ Full ID support
- ✓ Numeric shorthand
- ✓ Slug-based matching
- ✓ Clear error messages
- ✓ Prevents accidental wrong-item operations

## Related Files
- Research: `research.md` - Detailed technical analysis
- Plan: `plan.md` - Implementation strategy
- Item: `item.json` - Metadata and status
