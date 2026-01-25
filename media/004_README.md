# Media Generation for Issue #004

## Overview
Generated media content for Wreckit Issue #004: "Fix plan template to match validator requirements"

## Issue Description
The plan phase prompt template (src/prompts/plan.md) instructs agents to create plan.md files with section headers that do not match what the validator (validatePlanQuality) expects, causing plans to fail validation even when following the template exactly.

### Key Problems
1. Template uses "## Current State Analysis" but validator expects "## Current State"
2. Missing "## Implementation Plan Title" section
3. Phases not wrapped in "## Phases" container section

## Generated Media

### 1. Manim Animations (Python)
Location: `/Users/speed/wreckit/media/004_fix_plan_template.py`

#### Scene 1: PlanTemplateFix
- **Low Quality**: `media/videos/004_fix_plan_template/480p15/PlanTemplateFix.mp4` (304 KB)
- **High Quality**: `media/videos/004_fix_plan_template/1080p60/PlanTemplateFix.mp4` (1.0 MB)

**Content**:
- Introduction showing issue title and subtitle
- Problem visualization: Two columns comparing template vs validator expectations
- Error message showing validation failure
- Fix demonstration: Shows the three required changes
- Success message with file updated confirmation

**Animations**:
- Fade in/out transitions
- Side-by-side comparison of template vs validator
- Color-coded sections (red for wrong, green for correct)
- Clear visual progression from problem → fix → success

#### Scene 2: ValidationFlowDiagram
- **Low Quality**: `media/videos/004_fix_plan_template/480p15/ValidationFlowDiagram.mp4` (111 KB)

**Content**:
- Flow diagram showing validation process
- Highlights where regex matching occurs
- Emphasizes the exact match requirement

### 2. Remotion Composition (TypeScript/React)
Location: `/Users/speed/wreckit/media/004_fix_plan_template.tsx`

**Features**:
- 16-second animation (480 frames at 30fps)
- 1920x1080 resolution
- Four distinct scenes with smooth opacity transitions
- Color-coded section status indicators
- Spring animations for visual appeal

**Scenes**:
1. **Intro** (0-2s): Title and issue number
2. **Problem** (2-8s): Side-by-side comparison of template sections vs validator requirements
3. **Fix** (8-12s): Three specific changes needed with code examples
4. **Success** (12-16s): Confirmation message and file updated

**To Render**:
```bash
npx remotion render PlanTemplateFix out/004_plan_template_fix.mp4
```

## Technical Details

### Validator Requirements (from src/domain/validation.ts)
```typescript
requiredSections: [
  "Header",
  "Implementation Plan Title",  // ❌ Missing in template
  "Overview",
  "Current State",              // ❌ Template has "Current State Analysis"
  "Desired End State",
  "What We're NOT Doing",
  "Implementation Approach",
  "Phases",                     // ❌ Not wrapped in container
  "Testing Strategy"
]
```

### Regex Pattern Used
```javascript
new RegExp(`^#+\\s*${section.toLowerCase()}\\s*$`, "m")
```
This requires exact matching of section names (case-insensitive).

## Usage

### View Manim Videos
```bash
# Low quality (faster rendering, good for preview)
open media/videos/004_fix_plan_template/480p15/PlanTemplateFix.mp4

# High quality (final output)
open media/videos/004_fix_plan_template/1080p60/PlanTemplateFix.mp4
```

### Re-render Manim Scenes
```bash
# Low quality preview
manim render media/004_fix_plan_template.py PlanTemplateFix -pql

# High quality final
manim render media/004_fix_plan_template.py PlanTemplateFix -pqh

# Second scene
manim render media/004_fix_plan_template.py ValidationFlowDiagram -pql
```

### Render Remotion Video
Requires Remotion to be installed and configured with a root file.

## Summary

The generated media successfully visualizes:
1. ✅ The mismatch between template and validator
2. ✅ The specific sections that don't match
3. ✅ The three changes needed to fix the issue
4. ✅ The successful resolution

Both Manim and Remotion provide complementary visualization approaches:
- **Manim**: Mathematical, clean, academic style
- **Remotion**: Modern, web-based, smooth animations with React

The media is ready for documentation, presentations, or educational purposes about this bug fix.
