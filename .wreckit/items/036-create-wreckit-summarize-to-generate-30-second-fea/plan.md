# Create `wreckit summarize` to generate 30-second feature visualization videos autonomously - Implementation Plan

## Overview
Implement a `wreckit summarize` command that autonomously generates 30-second feature visualization videos for completed items. The command leverages the media layer infrastructure (Item 035), loading completed items, using media generation skills (manim-generation, remotion-generation) with JIT context building, and creating concise visual summaries saved to `.wreckit/media/<item-id>-summary.mp4`.

This implementation plan covers the complete development of the summarize command, including path utilities, command structure, skill loading integration, agent execution, output validation, CLI registration, and comprehensive testing.

## Current State Analysis

### Existing Infrastructure (COMPLETE)
**Media Layer (Item 035 - DONE):**
- Media phase tool permissions: `src/agent/toolAllowlist.ts:126-134` allows Read, Write, Glob, Grep, Bash
- Media skills defined: `.wreckit/skills.json:8, 95-125` includes manim-generation and remotion-generation skills
- Media phase prompt: `src/prompts/media.md` provides Manim/Remotion guidelines with 30-second target
- Example templates exist: `.wreckit/examples/` contains manim-scene.py, remotion-composition.tsx, remotion-root.tsx

**Command Infrastructure:**
- Command pattern: `src/commands/strategy.ts:35-143`, `src/commands/learn.ts:180-297` show consistent structure
- Item loading: `src/commands/show.ts:23-49` provides `loadItemDetails()` pattern
- Agent execution: `src/agent/runner.ts:348-399` provides `runAgentUnion()` with allowedTools

**Skill Loading (Item 033 - DONE):**
- Phase-specific loading: `src/agent/skillLoader.ts:59-144` - `loadSkillsForPhase()` merges tools, intersects with phase allowlists
- JIT context building: `src/agent/contextBuilder.ts:51-201` - `buildJitContext()`, `formatContextForPrompt()`

**Missing Components:**
- `.wreckit/media/` directory - doesn't exist yet, needs on-demand creation
- `src/fs/paths.ts` - missing `getMediaDir()` and `getMediaOutputPath()` utilities
- `src/commands/summarize.ts` - command doesn't exist yet
- Command registration in `src/index.ts` - not registered yet

### Key Discoveries:
1. **Example templates ALREADY exist** - `.wreckit/examples/` directory was created with Item 035, containing working Manim and Remotion templates
2. **Media skills are properly configured** - Both manim-generation and remotion-generation skills are defined with correct tool permissions and context requirements
3. **Learn command provides perfect pattern** - `src/commands/learn.ts:34-76` shows `determineSourceItems()` for filtering items by state
4. **Skill loading integrates with phase tools** - `loadSkillsForPhase()` returns intersection of phase tools and skill tools, which is critical for media phase
5. **Media prompt needs item context** - `src/prompts/media.md` uses template variables (id, title, section, overview, skill_context) that must be populated

## Desired End State

### Functional Requirements:
1. **`wreckit summarize` command** generates 30-second feature visualization videos
2. **Item selection**: Supports `--item <id>`, `--phase <state>`, `--all` flags (defaults to most recent 5 done items)
3. **Media output**: Videos saved to `.wreckit/media/<item-id>-summary.mp4` (sanitized ID)
4. **Skill-based generation**: Agent uses manim-generation or remotion-generation skills based on content type
5. **Validation**: Command validates output video exists and is non-empty MP4 file
6. **Error handling**: Graceful handling of missing items, invalid states, missing tools, rendering failures

### Non-Functional Requirements:
1. **Timeout**: Use 3x config timeout (10800 seconds default) for video rendering
2. **Dry-run**: Full dry-run support for testing without actual generation
3. **Logging**: Verbose logging of item selection, skill loading, context building, output validation
4. **Path utilities**: Centralized path management for media directory and output files

### Verification:
- Command runs successfully with `--item` flag on completed item
- Command defaults to recent 5 completed items when no flags provided
- Generated video files exist in `.wreckit/media/` with correct naming
- Videos are valid MP4 format with reasonable file size (< 50MB)
- Dry-run mode works without errors
- Error messages are helpful for missing dependencies/tools

## What We're NOT Doing

**Explicitly Out of Scope:**
1. **Video playback/viewing** - Not implementing video playback commands or viewers
2. **Video editing** - Not implementing post-processing, trimming, or effects
3. **Batch processing** - Not implementing parallel video generation (sequential only)
4. **Alternative formats** - MP4 only (no GIF, WebM, animated GIF support)
5. **Quality presets** - Not implementing `--quality` flag (agent chooses based on duration)
6. **Custom durations** - Not implementing `--duration` flag (hardcoded 30 seconds)
7. **Format selection** - Not implementing `--format` flag (agent auto-selects Manim vs Remotion)
8. **Media directory init** - Not adding media dir creation to `wreckit init` command (on-demand only)
9. **Preflight checks** - Not checking for Manim/Remotion installation (let agent discover)
10. **Video hosting** - Not implementing upload or sharing functionality

## Implementation Approach

**High-level Strategy:** Implement summarize as a standalone command (not a workflow phase) following the established command pattern. Load completed items, use media generation skills with JIT context, run agent with media phase tools, and validate video output.

**Key Design Decisions:**
1. **Default to recent 5 done items** - Matches `learn` command behavior (`src/commands/learn.ts:67-75`)
2. **Auto-select format** - Let agent choose Manim for math/concepts, Remotion for UI/UX (documented in media.md)
3. **3x timeout multiplier** - Video rendering is slow (30s video takes 5-10 minutes)
4. **On-demand media directory** - Create `.wreckit/media/` in summarize command, simpler than init command
5. **No preflight checks** - Agent discovers missing tools and reports errors (keeps command simple)
6. **Path sanitization** - Replace `/` with `-` in item IDs for filenames (prevent nested directories)

---

## Phase 1: Path Utilities & Command Structure

### Overview
Add media directory path utilities to `src/fs/paths.ts` and create the `summarize.ts` command file with options interface and basic structure.

### Changes Required:

#### 1. Add path utilities to `src/fs/paths.ts`
**File**: `src/fs/paths.ts`
**Changes**: Add two new functions after line 102

```typescript
export function getMediaDir(root: string): string {
  return path.join(getWreckitDir(root), "media");
}

export function getMediaOutputPath(root: string, itemId: string): string {
  // Sanitize item ID for filename (replace slashes with dashes)
  const sanitizedId = itemId.replace(/\//g, "-");
  return path.join(getMediaDir(root), `${sanitizedId}-summary.mp4`);
}
```

**Reasoning**: Centralized path management follows existing pattern. Sanitization prevents nested directories from item IDs with slashes.

#### 2. Create command file `src/commands/summarize.ts`
**File**: `src/commands/summarize.ts` (new file)
**Changes**: Create new file with following structure

```typescript
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Logger } from "../logging";
import type { Item } from "../schemas";
import { findRootFromOptions, getMediaDir, getMediaOutputPath } from "../fs/paths";
import { loadConfig } from "../config";
import { loadPromptTemplate, renderPrompt } from "../prompts";
import { runAgentUnion, getAgentConfigUnion } from "../agent/runner";
import { getAllowedToolsForPhase } from "../agent/toolAllowlist";
import { loadSkillsForPhase } from "../agent/skillLoader";
import { buildJitContext, formatContextForPrompt } from "../agent/contextBuilder";
import { pathExists } from "../fs/util";
import { scanItems } from "../domain/indexing";
import { resolveId } from "../domain/resolveId";
import { getItemDir, readItem } from "../fs";

export interface SummarizeOptions {
  item?: string;
  phase?: string;
  all?: boolean;
  dryRun?: boolean;
  cwd?: string;
  verbose?: boolean;
}

/**
 * Determine which items to generate videos for based on command options.
 * Pattern from learn.ts:34-76
 */
async function determineSourceItems(
  root: string,
  options: SummarizeOptions,
  logger: Logger
): Promise<{ items: Item[]; context: string }> {
  const allItems = await scanItems(root);

  // --item <id>: Generate video for specific item
  if (options.item) {
    const resolvedId = await resolveId(root, options.item);
    const itemDir = getItemDir(root, resolvedId);
    const item = await readItem(itemDir);
    logger.info(`Generating video for item: ${resolvedId}`);
    const context = `Source item: ${item.id} - ${item.title}\nState: ${item.state}`;
    return { items: [item], context };
  }

  // --phase <state>: Generate videos for items in specific state
  if (options.phase) {
    const filteredItems = allItems.filter(i => i.state === options.phase);
    logger.info(`Generating videos for ${filteredItems.length} items in state: ${options.phase}`);
    const context = `Source items: ${filteredItems.length} items in state '${options.phase}'`;
    return { items: filteredItems, context };
  }

  // --all: Generate videos for all completed items
  if (options.all) {
    const completedItems = allItems.filter(i => i.state === "done");
    logger.info(`Generating videos for ${completedItems.length} completed items`);
    const context = `Source items: ${completedItems.length} completed items`;
    return { items: completedItems, context };
  }

  // Default: generate videos for most recent 5 completed items
  const completedItems = allItems
    .filter(i => i.state === "done")
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  const recentItems = completedItems.slice(0, 5);
  logger.info(`Generating videos for ${recentItems.length} recent completed items (default)`);
  const context = `Source items: ${recentItems.length} recent completed items`;
  return { items: recentItems, context };
}

/**
 * Run the summarize command to generate 30-second feature visualization videos.
 *
 * The summarize command loads completed items, uses media generation skills
 * (manim-generation, remotion-generation) with JIT context building, and
 * autonomously creates concise visual summaries.
 */
export async function summarizeCommand(
  options: SummarizeOptions,
  logger: Logger
): Promise<void> {
  const root = findRootFromOptions(options);
  const config = await loadConfig(root);

  // Determine source items
  const { items: sourceItems, context: sourceContext } = await determineSourceItems(root, options, logger);

  if (sourceItems.length === 0) {
    logger.warn("No source items found for video generation");
    return;
  }

  // Load media phase skills
  const skillResult = loadSkillsForPhase("media", config.skills);

  if (skillResult.loadedSkillIds.length > 0) {
    logger.info(`Loaded media skills: ${skillResult.loadedSkillIds.join(", ")}`);
  } else {
    logger.warn("No media skills loaded - agent will have basic media capabilities");
  }

  // Build prompt variables (will be updated per item)
  const completionSignal =
    config.agent.kind === "process"
      ? config.agent.completion_signal
      : "<promise>COMPLETE</promise>";

  // Create media directory if it doesn't exist
  const mediaDir = getMediaDir(root);
  if (!(await pathExists(mediaDir))) {
    logger.info(`Creating media directory: ${mediaDir}`);
    await fs.mkdir(mediaDir, { recursive: true });
  }

  // Process each item
  for (const item of sourceItems) {
    logger.info(`\n${"=".repeat(60)}`);
    logger.info(`Processing item: ${item.id} - ${item.title}`);
    logger.info(`${"=".repeat(60)}`);

    // Build JIT context for this item
    const context = await buildJitContext(
      skillResult.contextRequirements,
      item,
      config,
      root
    );
    const skillContext = formatContextForPrompt(context);

    // Build prompt variables for this item
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

    // Load media prompt template
    const template = await loadPromptTemplate(root, "media");
    const prompt = renderPrompt(template, variables);

    // Expected output path for validation
    const expectedOutputPath = getMediaOutputPath(root, item.id);

    if (options.dryRun) {
      logger.info("[dry-run] Would generate video for item");
      logger.info(`  ID: ${item.id}`);
      logger.info(`  Title: ${item.title}`);
      logger.info(`  Expected output: ${expectedOutputPath}`);
      logger.info(`  Skills: ${skillResult.loadedSkillIds.join(", ") || "none"}`);
      continue;
    }

    // Run agent with media phase tools (3x timeout for video rendering)
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

    if (!result.success) {
      const error = result.timedOut
        ? "Agent timed out during video generation"
        : `Agent failed with exit code ${result.exitCode}`;
      logger.error(`  Failed to generate video for ${item.id}: ${error}`);
      continue;
    }

    // Validate output video exists
    if (!(await pathExists(expectedOutputPath))) {
      logger.warn(`  Agent completed but no video found at ${expectedOutputPath}`);
      logger.warn(`  Agent may have created video at different location`);
      continue;
    }

    // Check file is non-empty
    const stats = await fs.stat(expectedOutputPath);
    if (stats.size === 0) {
      logger.error(`  Video file is empty: ${expectedOutputPath}`);
      continue;
    }

    // Validate file size is reasonable (< 50MB for 30s video)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (stats.size > maxSize) {
      logger.warn(`  Video file is very large: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
    }

    logger.info(`  ✓ Video generated: ${expectedOutputPath}`);
    logger.info(`    Size: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
  }

  logger.info(`\n${"=".repeat(60)}`);
  logger.info("Video generation complete");
  logger.info(`${"=".repeat(60)}`);
}
```

**Reasoning**: Follows established patterns from `learn.ts` and `strategy.ts`. Implements item selection, skill loading, context building, agent execution, and output validation.

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compilation passes: `npm run typecheck`
- [ ] No import errors in new file
- [ ] Path utilities return correct paths
- [ ] Command file has no syntax errors

#### Manual Verification:
- [ ] File created at `src/commands/summarize.ts`
- [ ] Path utilities added to `src/fs/paths.ts`
- [ ] Code follows existing patterns from learn/strategy commands

**Note**: Complete automated verification, then pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Command Registration

### Overview
Register the `summarize` command in `src/index.ts` following the established pattern for other commands.

### Changes Required:

#### 1. Import command in `src/index.ts`
**File**: `src/index.ts`
**Changes**: Add import after other command imports (around line 50-60)

Find the section with command imports:
```typescript
import { strategyCommand } from "./commands/strategy";
import { learnCommand } from "./commands/learn";
```

Add after line with learn import:
```typescript
import { summarizeCommand } from "./commands/summarize";
```

#### 2. Register command in CLI
**File**: `src/index.ts`
**Changes**: Add command registration after learn command (after line 659)

```typescript
program
  .command("summarize")
  .description("Generate 30-second feature visualization videos for completed items")
  .option("--item <id>", "Generate video for specific item")
  .option("--phase <state>", "Generate videos for items in specific state")
  .option("--all", "Generate videos for all completed items")
  .action(async (options, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    await executeCommand(
      async () => {
        await summarizeCommand(
          {
            item: options.item,
            phase: options.phase,
            all: options.all,
            dryRun: globalOpts.dryRun,
            cwd: resolveCwd(globalOpts.cwd),
            verbose: globalOpts.verbose,
          },
          logger
        );
      },
      logger,
      {
        verbose: globalOpts.verbose,
        quiet: globalOpts.quiet,
        dryRun: globalOpts.dryRun,
        cwd: resolveCwd(globalOpts.cwd),
      }
    );
  });
```

**Reasoning**: Follows exact pattern from `learn` command registration (`src/index.ts:625-659`). Uses executeCommand wrapper for consistent error handling.

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compilation passes: `npm run typecheck`
- [ ] Build succeeds: `npm run build`
- [ ] No import errors

#### Manual Verification:
- [ ] Run `wreckit --help` shows summarize command
- [ ] Run `wreckit summarize --help` shows all options
- [ ] Command description is clear and accurate

**Note**: Complete automated verification, then pause for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Testing & Validation

### Overview
Test the summarize command with various scenarios including dry-run, specific items, default behavior, and error handling.

### Testing Steps:

#### 1. Unit Testing (Automated)
**Test path utilities:**
- Test `getMediaDir()` returns correct path
- Test `getMediaOutputPath()` sanitizes item IDs (replaces `/` with `-`)
- Test `getMediaOutputPath()` creates correct filename format

**Test item selection:**
- Test `--item <id>` loads specific item
- Test `--phase <state>` filters items correctly
- Test `--all` loads all completed items
- Test default behavior loads recent 5 completed items

#### 2. Integration Testing (Dry-run)
**Test dry-run mode:**
```bash
# Test with specific item
wreckit summarize --item 001-init --dry-run

# Test with phase filter
wreckit summarize --phase done --dry-run

# Test with all completed items
wreckit summarize --all --dry-run

# Test default behavior (recent 5)
wreckit summarize --dry-run --verbose
```

**Expected output:**
- Command completes without errors
- Logs show which items are being processed
- Logs show expected output paths
- No actual video files created

#### 3. Manual Testing (With Manim/Remotion)
**Prerequisites:**
- Install Manim: `pip install manim` (optional)
- Or install Remotion: `npm install remotion` (optional)

**Test with real video generation:**
```bash
# Test with single completed item
wreckit summarize --item 001-init

# Verify output
ls -lh .wreckit/media/
```

**Expected output:**
- Video file created at `.wreckit/media/<item-id>-summary.mp4`
- File is non-empty MP4 format
- File size is reasonable (< 50MB for 30s video)
- Duration is approximately 30 seconds

**Test error handling:**
```bash
# Test with non-existent item
wreckit summarize --item 999-nonexistent

# Test with item in wrong state
wreckit summarize --phase idea  # Should have no items
```

**Expected output:**
- Helpful error messages
- No crashes or uncaught exceptions
- Graceful handling of missing items

#### 4. Edge Case Testing
**Test with no completed items:**
```bash
# Empty repository or no done items
wreckit summarize
```
Expected: Warning "No source items found for video generation"

**Test with media directory missing:**
```bash
# Remove media directory if it exists
rm -rf .wreckit/media/
wreckit summarize --item 001-init --dry-run
```
Expected: Creates media directory automatically

**Test with malformed item ID:**
```bash
wreckit summarize --item "invalid/id"
```
Expected: Helpful error message about invalid ID format

### Success Criteria:

#### Automated Verification:
- [ ] All unit tests pass
- [ ] Dry-run tests complete without errors
- [ ] TypeScript compilation passes
- [ ] Build succeeds

#### Manual Verification:
- [ ] Dry-run mode works correctly
- [ ] Command handles edge cases gracefully
- [ ] Error messages are helpful and actionable
- [ ] Logging provides clear visibility into process
- [ ] Media directory created on-demand
- [ ] (If Manim/Remotion installed) Video files generated successfully

**Note**: Complete all testing steps. Manual testing with actual video generation is optional but recommended.

---

## Testing Strategy

### Unit Tests:
**File**: `src/commands/summarize.test.ts` (new file)
- Test `determineSourceItems()` with various options
- Test path utilities with various item IDs
- Test item ID sanitization (slashes, special chars)

**Key edge cases:**
- No completed items available
- Item ID with slashes (e.g., "036/feature-name")
- Empty items directory
- Items without plan.md or prd.json

### Integration Tests:
**Scenario 1: Dry-run with specific item**
```bash
wreckit summarize --item 001-init --dry-run --verbose
```
Expected: Logs item details, expected output path, no video created

**Scenario 2: Dry-run with phase filter**
```bash
wreckit summarize --phase done --dry-run
```
Expected: Lists all done items, no videos created

**Scenario 3: Default behavior**
```bash
wreckit summarize --dry-run
```
Expected: Processes recent 5 completed items

### Manual Testing Steps:

#### Step 1: Verify command registration
```bash
wreckit --help | grep summarize
wreckit summarize --help
```

#### Step 2: Test dry-run mode
```bash
wreckit summarize --dry-run
wreckit summarize --item 001-init --dry-run --verbose
```

#### Step 3: Test with real video generation (optional)
```bash
# Install Manim (skip if already installed)
pip3 install manim

# Or install Remotion (skip if already installed)
npm install -g remotion

# Generate video
wreckit summarize --item 001-init

# Verify output
ls -lh .wreckit/media/
ffprobe .wreckit/media/001-init-summary.mp4  # Check metadata
```

#### Step 4: Verify video quality
```bash
# Check file size (should be < 50MB for 30s video)
du -h .wreckit/media/*.mp4

# Check video duration
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 .wreckit/media/001-init-summary.mp4
```

Expected: Duration approximately 30 seconds (± 5 seconds tolerance)

#### Step 5: Test error handling
```bash
# Test with non-existent item
wreckit summarize --item 999-nonexistent

# Test with no completed items
cd /tmp/empty-repo
wreckit summarize
```

## Migration Notes
No migration needed - this is a new command with no backward compatibility concerns.

## References
- Research: `/Users/speed/wreckit/.wreckit/items/036-create-wreckit-summarize-to-generate-30-second-fea/research.md`
- Command pattern: `src/commands/strategy.ts:35-143`, `src/commands/learn.ts:180-297`
- Skill loading: `src/agent/skillLoader.ts:59-144`
- Context building: `src/agent/contextBuilder.ts:51-201`
- Media tools: `src/agent/toolAllowlist.ts:126-134`
- Media skills: `.wreckit/skills.json:95-125`
- Media prompt: `src/prompts/media.md`
- Example templates: `.wreckit/examples/manim-scene.py`, `.wreckit/examples/remotion-composition.tsx`, `.wreckit/examples/remotion-root.tsx`
- Item loading: `src/commands/show.ts:23-49`, `src/domain/indexing.ts:53-60`
