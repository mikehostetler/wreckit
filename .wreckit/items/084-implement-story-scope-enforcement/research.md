# Research: Implement Story Scope Enforcement (Spec 004)

**Date**: 2025-01-21
**Item**: 084-implement-story-scope-enforcement

## Research Question

Implement diff-size heuristics to enforce story scope boundaries and prevent runaway token costs.

## Summary

Story scope enforcement is a critical infrastructure feature to prevent runaway token costs and maintain focused implementation work. Currently, wreckit has git status comparison mechanisms for read-only phases (research, plan) but lacks enforcement for the implement phase to detect scope creep. The implementation needs to add git diff size analysis before/after story execution, with configurable thresholds and clear error messaging.

The architecture already has several relevant building blocks:
- **Git status tracking** (`src/git/status.ts`) with `compareGitStatus()` and `getGitStatus()` functions
- **File change detection** via `GitFileChange` interface and status comparison
- **Quality validation patterns** in `src/domain/validation.ts` with existing validators for research, plan, and story quality
- **Workflow integration points** in `src/workflow/itemWorkflow.ts` where stories are executed

The implementation should follow existing patterns: add configuration options to the config schema, create a validation function similar to existing quality checks, integrate it into the implement phase workflow, and provide clear error messages to users when scope violations are detected.

## Current State Analysis

### Existing Implementation

**Git Status and Change Detection (src/git/status.ts):**
- `src/git/status.ts:1-283` - Complete git status tracking infrastructure
- `src/git/status.ts:17-24` - `GitFileChange` interface defines file change representation with path and statusCode
- `src/git/status.ts:27-33` - `GitStatusComparisonResult` interface compares before/after states with violations array
- `src/git/status.ts:82-122` - `getGitStatus()` function captures current repository state
- `src/git/status.ts:135-197` - `compareGitStatus()` compares snapshots and detects violations against allowed paths
- `src/git/status.ts:218-262` - `formatViolations()` creates human-readable error messages for violations

**Quality Validation Patterns (src/domain/validation.ts):**
- `src/domain/validation.ts:269-316` - Payload size limits example showing pattern: MAX constants, validation functions, detailed error messages
- `src/domain/validation.ts:449-530` - Research quality validation showing section extraction, length counting, error aggregation pattern
- `src/domain/validation.ts:725-828` - Story quality validation demonstrating per-story error tracking with detailed feedback

**Workflow Integration (src/workflow/itemWorkflow.ts):**
- `src/workflow/itemWorkflow.ts:586-653` - Research phase shows git status capture before/after pattern for enforcing read-only behavior
- `src/workflow/itemWorkflow.ts:713-780` - Plan phase demonstrates allowedPaths validation with `compareGitStatus()` and `formatViolations()`
- `src/workflow/itemWorkflow.ts:795-1100` - Implement phase executes stories but currently lacks scope enforcement (gap to fill)

**Configuration Schema (src/schemas.ts):**
- `src/schemas.ts:1-500` - Zod schemas for all configuration objects
- `src/schemas.ts:60-68` - `PrChecksSchema` example of boolean configuration flags (secret_scan, commands array)
- `src/schemas.ts:245-262` - `DoctorConfigSchema` shows validation config pattern with enabled flag, timeout, numeric thresholds

### Integration Points

1. **Config Schema** (`src/schemas.ts`): Add scope enforcement configuration to `PrChecksSchema` or create new `StoryScopeConfigSchema`
2. **Validation Module** (`src/domain/validation.ts`): Add `validateStoryScope()` function following existing quality check patterns
3. **Git Module** (`src/git/quality.ts` or `src/git/status.ts`): Add diff size calculation utilities
4. **Workflow** (`src/workflow/itemWorkflow.ts`): Integrate validation into `runPhaseImplement()` after each story execution
5. **Prompts** (`src/prompts/implement.md`): May need updates to include scope thresholds in agent instructions

## Key Files

- **src/git/status.ts:17-33** - Core interfaces for git change tracking (`GitFileChange`, `GitStatusComparisonResult`)
- **src/git/status.ts:135-197** - `compareGitStatus()` function compares before/after git states
- **src/git/status.ts:218-262** - `formatViolations()` creates human-readable violation messages
- **src/git/index.ts:82-120** - `runGitCommand()` wrapper for executing git diff operations
- **src/git/quality.ts:1-350** - Quality check patterns (commands, secret scanning) showing validation approach
- **src/domain/validation.ts:269-316** - Payload size limits pattern showing constant definitions and validation structure
- **src/domain/validation.ts:449-530** - Research quality validation demonstrating text analysis and error aggregation
- **src/domain/validation.ts:725-828** - Story quality validation showing per-item error tracking
- **src/workflow/itemWorkflow.ts:586-653** - Research phase git status capture and comparison pattern
- **src/workflow/itemWorkflow.ts:713-780** - Plan phase allowedPaths enforcement example
- **src/workflow/itemWorkflow.ts:795-1100** - Implement phase where scope enforcement should be integrated
- **src/config.ts:1-500** - Configuration loading and merging logic
- **src/schemas.ts:60-68** - `PrChecksSchema` for adding configuration flags
- **src/agent/types.ts:1-50** - Common agent options interface for error callbacks
- **src/agent/runner.ts:1-200** - Agent runner API showing how errors are propagated

## Technical Considerations

### Dependencies

**External Dependencies:**
- No new external dependencies required (git operations use existing `spawn` from Node.js)
- Existing Zod validation library sufficient for schema definitions

**Internal Modules:**
- `src/git/status.ts` - Reuse `getGitStatus()`, `compareGitStatus()`, add new diff size functions
- `src/git/index.ts` - Use `runGitCommand()` for `git diff --stat` or `git diff --shortstat`
- `src/domain/validation.ts` - Add `validateStoryScope()` following existing patterns
- `src/config.ts` - Add scope config to `ConfigResolved` type and loading logic
- `src/schemas.ts` - Define `StoryScopeConfigSchema` with Zod
- `src/workflow/itemWorkflow.ts` - Integrate validation into `runPhaseImplement()`

### Patterns to Follow

**Configuration Pattern:**
```typescript
// From src/schemas.ts PrChecksSchema
export const StoryScopeConfigSchema = z.object({
  enabled: z.boolean().default(true),
  max_diff_lines: z.number().default(1000),
  max_diff_files: z.number().default(50),
  max_diff_bytes: z.number().default(100000), // 100KB
  exclude_patterns: z.array(z.string()).default(["*.lock", "package-lock.json"]),
});
```

**Validation Pattern:**
```typescript
// From src/domain/validation.ts validateResearchQuality
export interface StoryScopeResult {
  valid: boolean;
  violations: string[];
  diffStats: {
    totalLines: number;
    totalFiles: number;
    totalBytes: number;
  };
}

export function validateStoryScope(
  beforeStatus: GitFileChange[],
  afterStatus: GitFileChange[],
  options: StoryScopeOptions
): StoryScopeResult
```

**Error Messaging Pattern:**
```typescript
// From src/git/status.ts formatViolations
function formatScopeViolations(result: StoryScopeResult, storyId: string): string {
  const lines = [`Story ${storyId} exceeded scope limits:`];
  lines.push(`  Diff: ${result.diffStats.totalLines} lines (max: ${options.max_diff_lines})`);
  lines.push(`  Files changed: ${result.diffStats.totalFiles} (max: ${options.max_diff_files})`);
  return lines.join("\n");
}
```

**Workflow Integration Pattern:**
```typescript
// From src/workflow/itemWorkflow.ts runPhaseResearch (line 586-653)
const beforeStatus = await getGitStatus({ cwd: root, logger });
// ... run agent ...
const comparison = await compareGitStatus(beforeStatus, options);
if (!comparison.valid) {
  const error = formatViolations(comparison);
  // handle error
}
```

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **False positives on legitimate refactors** | High - Blocks valid work | Add `exclude_patterns` config for generated files, locks, migrations; make thresholds configurable; add warning mode before strict enforcement |
| **Binary file size inaccuracy** | Medium - Diff stats may not accurately reflect binary changes | Use `--shortstat` for byte estimates, add special handling for binary files, document limitations |
| **Git diff performance on large repos** | Medium - Slow validation on each story | Cache git status, use `--stat` for faster output, consider incremental validation (every N stories vs every story) |
| **Config complexity overload** | Low - Too many options to configure | Provide sensible defaults, document recommended values, add presets (small/medium/large scope) |
| **Agent bypass attempts** | Low - Agent could try to split work | Enforce at workflow level (not agent-level), validate cumulative diff across all stories, detect patterns suggesting scope splitting |
| **Merge conflicts with base branch** | High - Rebase may change diff | Calculate diff against story branch start (not base), use `git diff HEAD~1` or track branch start SHA |
| **Test file generation inflation** | Medium - Tests may legitimately add many files | Add test file patterns to default exclude, provide separate `max_test_files` threshold |

## Recommended Approach

**Phase 1: Core Diff Size Calculation**
1. Add `getDiffStats()` function to `src/git/status.ts` that runs `git diff --stat` and parses output
2. Create `DiffStats` interface with `{ totalLines, totalFiles, totalBytes, changedFiles }`
3. Add unit tests for parsing git --stat output format

**Phase 2: Configuration and Validation**
1. Create `StoryScopeConfigSchema` in `src/schemas.ts` with configurable thresholds
2. Add to `PrChecksSchema` or top-level config under `story_scope` key
3. Implement `validateStoryScope()` in `src/domain/validation.ts`
4. Follow pattern from `validateResearchQuality()` returning detailed results

**Phase 3: Workflow Integration**
1. In `src/workflow/itemWorkflow.ts`, modify `runPhaseImplement()`
2. Capture git status before story execution (after `runAgentUnion()` call)
3. After story completion, run `compareGitStatus()` and `getDiffStats()` on changes
4. Call `validateStoryScope()` with stats and config thresholds
5. If validation fails, format error with `formatScopeViolations()` and fail the story
6. Log warnings when approaching thresholds (e.g., > 80% of max)

**Phase 4: User Experience Enhancements**
1. Add detailed error messages showing which files caused scope exceedance
2. Provide suggestions (e.g., "Consider splitting into multiple stories", "Check if generated files should be excluded")
3. Add `--skip-scope-check` flag for edge cases (with warning)
4. Update documentation with recommended thresholds by project type

**Phase 5: Testing and Validation**
1. Add integration test in `src/__tests__/workflow.test.ts` for scope enforcement
2. Create test scenarios: small valid change, large refactor, test file generation, binary file changes
3. Verify error messages are clear and actionable
4. Benchmark performance impact on story execution

## Open Questions

1. **Threshold Defaults**: What are appropriate default values for `max_diff_lines`, `max_diff_files`, and `max_diff_bytes`? Should these vary by project size or type? (Recommendation: Start with 1000 lines, 50 files, 100KB as conservative defaults)

2. **Cumulative vs Per-Story**: Should scope limits be enforced per-story or cumulative across all stories in an item? (Recommendation: Per-story for immediate feedback, add cumulative check at end of implement phase)

3. **Baseline Calculation**: Should diff be calculated against branch start SHA or base branch? Using base branch may include unrelated changes. (Recommendation: Track branch start SHA when creating feature branch, diff against that)

4. **Test File Handling**: Should test files be counted against scope limits or have separate thresholds? (Recommendation: Exclude from main count, track separately, allow higher limits for test files)

5. **Generated Files**: How to handle auto-generated files (lock files, build artifacts, migrations)? (Recommendation: Configurable exclude_patterns with defaults for common patterns)

6. **Opt-out Mechanism**: Should users be able to disable scope checks per-story or globally? What's the right balance? (Recommendation: Global config flag `enabled`, add `--skip-scope-check` CLI override with logged warning)

7. **Error Recovery**: When scope is exceeded, should the workflow fail immediately or allow manual override? (Recommendation: Fail immediately in CI, prompt for override in interactive mode, document in story notes)

8. **Metrics and Reporting**: Should scope statistics be tracked and reported (e.g., average diff size per story, violations per item)? (Recommendation: Add to progress.log, optional telemetry for insights)
