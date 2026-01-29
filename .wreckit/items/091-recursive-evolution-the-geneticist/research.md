# Research: Recursive Evolution: The Geneticist

**Date**: 2025-01-28
**Item**: 091-recursive-evolution-the-geneticist

## Research Question
Implement a meta-agent that identifies recurrent failure patterns in healing logs and autonomously optimizes system prompts via PRs.

## Summary

The Geneticist is a meta-agent that analyzes the `.wreckit/healing-log.jsonl` file (created by Item 038's self-healing runtime) to identify recurrent failure patterns and autonomously generates pull requests that optimize system prompts. The current implementation in `src/commands/geneticist.ts` exists as a proof-of-concept but has significant limitations: it only analyzes logs, identifies patterns, and performs a simplified optimization without actually creating branches or PRs. To fully implement this feature, we need to enhance the Geneticist to (1) perform sophisticated pattern analysis across healing logs, (2) intelligently map error patterns to specific system prompts, (3) generate optimized prompt variants using an LLM agent with appropriate tooling, (4) create feature branches following the established branching conventions from `src/git/branch.ts`, and (5) submit PRs using the PR creation workflow from `src/git/pr.ts`. The implementation must integrate with existing configuration systems, respect dry-run modes, and follow the established patterns for agent execution and workflow orchestration used throughout the codebase.

## Current State Analysis

### Existing Implementation

The Geneticist command (`src/commands/geneticist.ts:1-136`) currently provides a basic framework but is incomplete:

1. **Log Analysis**: The `analyzeHealingLogs` function (`src/commands/geneticist.ts:13-44`) successfully parses `healing-log.jsonl` and aggregates error patterns by type and detected pattern, tracking occurrence counts and timestamps. It filters patterns by a minimum occurrence threshold (default 3).

2. **Pattern Detection**: The implementation identifies recurrent patterns by grouping `HealingLogEntry` records (schema defined in `src/agent/healingRunner.ts:28-38`) by `errorType:detectedPattern` keys and sampling up to 3 pattern examples per key.

3. **Simplified Optimization**: The optimization logic (`src/commands/geneticist.ts:95-109`) is overly simplified - it only distinguishes between "plan" and "implement" prompts based on whether the error type contains "PLAN", and doesn't create actual PRs.

4. **Agent Execution**: The code attempts to run an optimization agent using `runAgentUnion` (`src/commands/geneticist.ts:111-122`) but only logs success without persisting changes or creating PRs.

### Key Missing Capabilities

1. **No Branch Creation**: Unlike the Dreamer command (`src/commands/dream.ts:275-317`) which persists items to the roadmap, the Geneticist doesn't create git branches for prompt optimizations.

2. **No PR Submission**: Unlike the PR phase in `src/workflow/itemWorkflow.ts:725-804`, the Geneticist doesn't create or update pull requests.

3. **Limited Prompt Mapping**: The current implementation doesn't intelligently map error types to the appropriate system prompts (research, plan, implement, pr, etc.) stored in `src/prompts/` directory.

4. **No Validation**: There's no validation that the optimized prompts maintain required structure or pass quality checks.

5. **No Rollback Strategy**: If an optimized prompt causes issues, there's no mechanism to revert changes.

### Key Integration Points

1. **Healing Logs**: The `.wreckit/healing-log.jsonl` file contains `HealingLogEntry` records with `initialError.errorType`, `initialError.detectedPattern`, `attempts` array, and `finalOutcome` fields.

2. **System Prompts**: Prompt templates are stored in both bundled locations (`src/prompts/*.md`) and user-customizable locations (`.wreckit/prompts/*.md`), loaded via `loadPromptTemplate` from `src/prompts.ts:37-51`.

3. **Agent Runner**: The `runAgentUnion` function (`src/agent/runner.ts:158-286`) supports multiple agent kinds (claude_sdk, rlm, sprite, etc.) and should be used for the optimization agent.

4. **Git Operations**: Branch creation (`src/git/branch.ts:140-185`), committing (`src/git/branch.ts:187-199`), pushing (`src/git/branch.ts:201-221`), and PR creation (`src/git/pr.ts:68-117`) are well-established patterns.

5. **Configuration**: The Geneticist should respect the wreckit config (`.wreckit/config.json`) including `base_branch`, `branch_prefix`, and agent settings.

## Key Files

### Core Implementation

- `src/commands/geneticist.ts:1-136` - Existing geneticist command with basic log analysis and simplified optimization logic
- `src/agent/healingRunner.ts:28-38` - `HealingLogEntry` type definition defining the structure of healing log records
- `src/agent/healer.ts:14-41` - `HealingResult` and `HealingConfig` types defining healing operation results
- `src/agent/errorDetector.ts:12-23` - `ErrorDiagnosis` type and `ErrorType` union defining recoverable error patterns

### Prompt System

- `src/prompts.ts:1-143` - Prompt loading and rendering system with `loadPromptTemplate`, `renderPrompt`, and `PromptVariables` type
- `src/prompts/research.md` - Research phase prompt template (should be analyzed for optimization targets)
- `src/prompts/plan.md` - Planning phase prompt template with strict header validation requirements
- `src/prompts/implement.md` - Implementation phase prompt template
- `src/prompts/pr.md` - PR description generation prompt template

### Git & Workflow Integration

- `src/git/branch.ts:140-185` - `ensureBranch` function for creating feature branches following `branch_prefix + itemSlug` convention
- `src/git/branch.ts:187-199` - `commitAll` function for committing changes with descriptive messages
- `src/git/branch.ts:201-221` - `pushBranch` function for pushing branches to origin
- `src/git/pr.ts:68-117` - `createOrUpdatePr` function for creating/updating PRs with title and body
- `src/git/pr.ts:119-199` - `checkMergeConflicts` function for validating PR mergeability before submission

### Agent Execution

- `src/agent/runner.ts:158-286` - `runAgentUnion` function supporting multiple agent kinds (claude_sdk, rlm, sprite, process, amp_sdk, codex_sdk, opencode_sdk)
- `src/agent/runner.ts:134-156` - `getAgentConfigUnion` function for extracting agent config from wreckit config
- `src/agent/toolAllowlist.ts` - Phase-specific tool allowlists (should check if "genetic" phase exists or needs to be added)

### Configuration & State

- `src/config.ts:57-83` - `loadConfig` function for loading wreckit configuration with defaults
- `src/config.ts:1-55` - `ConfigResolved` type and `DEFAULT_CONFIG` constant defining base_branch, branch_prefix, agent settings
- `src/schemas.ts` - ConfigSchema and related types for validation

### Related Patterns

- `src/commands/dream.ts:109-149` - Pattern for generating item IDs and persisting to roadmap (useful for naming optimization branches)
- `src/commands/learn.ts:153-236` - Pattern for extracting patterns and writing skills.json (similar meta-agent pattern)
- `src/workflow/itemWorkflow.ts:725-804` - PR phase implementation showing branch creation, pushing, and PR submission workflow

## Technical Considerations

### Dependencies

**Internal Modules:**
- `src/agent/healingRunner` - For `HealingLogEntry` type and log parsing
- `src/agent/errorDetector` - For `ErrorType` definitions and error pattern matching
- `src/prompts` - For `loadPromptTemplate`, `renderPrompt`, and prompt template access
- `src/agent/runner` - For `runAgentUnion` and `getAgentConfigUnion` to execute optimization agent
- `src/git/branch` - For `ensureBranch`, `commitAll`, `pushBranch` operations
- `src/git/pr` - For `createOrUpdatePr`, `checkMergeConflicts` operations
- `src/config` - For `loadConfig` to access base_branch, branch_prefix, agent settings
- `src/fs/paths` - For `getWreckitDir`, `getPromptsDir` to locate files
- `src/logging` - For logger interface

**External Dependencies:**
- Node.js `fs/promises` - For reading healing logs and writing optimized prompts
- Node.js `path` - For path manipulation
- Existing LLM agent (configured in config.json) - For generating optimized prompt variants

### Patterns to Follow

1. **Command Structure**: Follow the pattern established in `src/commands/dream.ts` and `src/commands/learn.ts`:
   - Accept options object with `dryRun`, `cwd`, `verbose` flags
   - Use `findRootFromOptions` to locate wreckit root
   - Load config with `loadConfig`
   - Return early in dry-run mode after logging intentions

2. **Branch Naming**: Use the `branch_prefix` from config (default "wreckit/") with a descriptive slug, e.g., `wreckit/geneticist-optimize-plan-20250128`

3. **Commit Messages**: Follow conventional commit format: `geneticist: optimize [prompt-name] prompt to address [error-pattern]`

4. **PR Titles**: Use descriptive format: `geneticist: Optimize [prompt-name].md prompt - [improvement-summary]`

5. **Error Handling**: Use existing error types from `src/errors.ts` (e.g., `PrCreationError`, `GitError`) for consistent error reporting

6. **Agent Execution**: Use `runAgentUnion` with appropriate tool allowlist. Consider if a new "genetic" phase tool allowlist is needed or if existing phase tools are sufficient

7. **Validation**: Follow the pattern from `src/workflow/itemWorkflow.ts` where phase outputs are validated before proceeding. For optimized prompts, validate:
   - Required {{variable}} placeholders are preserved
   - Markdown structure is intact
   - For plan.md: Required section headers (Implementation Plan Title, Overview, Current State, etc.) are present

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Optimized prompts break existing workflows** | High | Implement validation to ensure required variables and structure are preserved; add dry-run mode for review before applying |
| **Infinite optimization loops** | Medium | Track optimization history in healing logs; require minimum time gap (e.g., 7 days) before re-optimizing the same prompt |
| **Poor quality optimizations** | High | Use a validation agent or quality checks to review optimized prompts before creating PRs; require manual approval in PR |
| **Branch name conflicts** | Low | Use timestamp-based suffixes in branch names; check for existing branches before creating |
| **Git operation failures** | Medium | Wrap git operations in try-catch with proper error logging; use existing error types for consistent handling |
| **Performance issues with large logs** | Low | Implement time-window filtering (already exists via `timeWindowHours` option); consider pagination for very large logs |
| **Accidental overwriting of custom prompts** | High | Check if user has customized prompts in `.wreckit/prompts/` before optimizing; preserve comments or user-specific sections |
| **PR conflicts with active work** | Medium | Check for existing PRs or active branches before creating optimization branches; add warning if conflicts detected |

## Recommended Approach

Based on the research findings, here's the high-level implementation strategy:

### Phase 1: Enhanced Pattern Analysis

1. **Extend Error-to-Prompt Mapping**: Create a sophisticated mapping function that analyzes `errorType` and `detectedPattern` to determine which system prompt(s) need optimization. For example:
   - `git_lock` errors → May indicate unclear instructions in plan/implement prompts about git operations
   - `npm_failure` errors → May indicate missing environment setup instructions in plan prompt
   - JSON corruption patterns → May indicate insufficient validation instructions in implement prompt
   - Plan validation failures → Directly indicate plan.md needs optimization
   - Story validation failures → Indicate plan.md story creation guidance needs improvement

2. **Pattern Clustering**: Group similar error patterns even if exact strings differ, using fuzzy matching or categorization (e.g., all git-related errors, all npm-related errors).

3. **Context Extraction**: For each recurrent pattern, extract representative examples (already done) and the associated item IDs to provide context to the optimization agent.

### Phase 2: Intelligent Prompt Optimization

1. **Optimization Agent Prompt**: Design a specialized prompt that:
   - Receives the current prompt template
   - Receives the error pattern examples and context
   - Is instructed to preserve required {{variables}} and structure
   - Is instructed to make minimal, targeted changes to address the specific error pattern
   - Outputs ONLY the optimized prompt (no extra commentary)

2. **MCP Server for Optimization**: Consider creating an MCP server (similar to `dreamMcpServer` in `src/agent/mcp/dreamMcpServer.ts`) to capture the optimized prompt in a structured way, rather than parsing free-form text.

3. **Validation Layer**: After optimization, validate that:
   - All required {{variables}} from the original template are present
   - Required section headers (for plan.md) are preserved
   - Markdown structure is valid
   - Template still renders correctly with `renderPrompt`

### Phase 3: Branch & PR Workflow

1. **Branch Creation**: For each prompt optimization:
   - Generate a unique branch name: `{branch_prefix}geneticist-optimize-{promptName}-{timestamp}`
   - Use `ensureBranch` from `src/git/branch.ts:140-185`
   - Switch to the new branch

2. **Commit Changes**:
   - Write the optimized prompt to the appropriate location (`.wreckit/prompts/{name}.md` if user-customizable, otherwise only create PR)
   - Use `commitAll` with descriptive commit message following conventional commit format
   - Example: `geneticist: optimize plan.md to address recurrent git lock errors (5 occurrences in 48h)`

3. **PR Creation**:
   - Generate PR title: `geneticist: Optimize {promptName}.md - {summary}`
   - Generate PR body using a template that includes:
     - Error pattern statistics (occurrence count, time window, examples)
     - Specific changes made to the prompt
     - Validation results (what was preserved)
     - Instructions for reviewers on how to test
   - Use `createOrUpdatePr` from `src/git/pr.ts:68-117`

4. **Push & Submit**:
   - Use `pushBranch` to push the branch to origin
   - Log the PR URL for tracking

### Phase 4: Safety & Rollback

1. **Optimization History**: Track all optimizations in a dedicated log (`.wreckit/geneticist-log.jsonl`) to prevent re-optimizing the same prompt too frequently.

2. **Rollback Mechanism**: If an optimized prompt causes issues, provide a command or procedure to revert to the previous version (possibly via `wreckit rollback` command).

3. **Manual Approval**: Always create PRs (never auto-merge to main) to allow human review of prompt changes.

4. **Dry-Run Mode**: Ensure dry-run mode logs exactly what would be done without making changes, following the pattern in other commands.

### Integration with Existing Config

Add geneticist-specific configuration options to `.wreckit/config.json`:

```json
{
  "geneticist": {
    "enabled": true,
    "auto_optimize": false,  // Require manual trigger by default
    "min_error_count": 3,
    "time_window_hours": 48,
    "min_days_between_optimizations": 7,
    "max_prs_per_run": 3
  }
}
```

## Open Questions

1. **Scope of Prompts**: Should the Geneticist optimize ALL prompts (research, plan, implement, pr, strategy, learn, media, interview, critique) or focus on a subset? Starting with plan and implement is recommended.

2. **Custom Prompts**: How should the system handle users' custom prompts in `.wreckit/prompts/`? Should optimizations be applied to custom prompts, or only to bundled prompts? Recommended: Optimize custom prompts if they exist, otherwise create a new custom prompt file.

3. **Optimization Approval**: Should optimized prompts be auto-merged, or always require manual PR approval? Recommended: Always require PR approval for safety.

4. **Multiple Error Patterns**: If the same prompt has multiple recurrent error patterns, should they be addressed in one optimization PR or multiple? Recommended: Group by prompt, address all patterns for that prompt in a single PR.

5. **Testing**: How do we validate that an optimized prompt actually improves outcomes without waiting for new healing logs? This may require A/B testing or simulation, which is complex.

6. **Performance**: For large codebases with many healing log entries, is the current time-window filtering sufficient, or do we need more sophisticated sampling/analysis?

7. **Tool Allowlist**: Should there be a dedicated "genetic" phase tool allowlist, or can we reuse an existing phase's tools? The optimization agent needs Read access to prompts and Write access to create optimized versions.
