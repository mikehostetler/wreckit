# Research: Implement Item Dependencies and Campaign Grouping

**Date**: 2026-01-24
**Item**: 022-implement-item-dependencies-and-campaign-grouping

## Research Question
Race conditions and logical errors occur in autonomous mode when items are executed without respecting their dependencies.

**Motivation:** Prevent race conditions and logical errors in autonomous mode by ensuring items are executed in the correct order based on their dependencies.

**Success criteria:**
- ItemSchema includes 'depends_on' field (array of IDs)
- ItemSchema includes 'campaign' field (string)
- Orchestrator skips items with incomplete dependencies
- execute-roadmap infers dependencies (e.g. tests depend on code)
- Items are grouped by Milestone into Campaigns

**Technical constraints:**
- Update ItemSchema with 'depends_on' (array of IDs) and 'campaign' (string)
- Update Orchestrator to check dependency completion before executing items
- execute-roadmap must infer dependencies automatically (e.g. tests depend on code)

**In scope:**
- ItemSchema updates
- Orchestrator dependency checking
- execute-roadmap dependency inference
- Milestone-based campaign grouping

## Summary

The wreckit codebase currently executes items in a simple sequential order based on their ID (numeric prefix). The orchestrator in `src/commands/orchestrator.ts` iterates through non-done items sorted by ID and processes them one-by-one or in parallel. There is no concept of dependencies between items, which means items that logically depend on others (e.g., test items depending on implementation items) may execute before their prerequisites complete, causing race conditions.

To implement this feature, three main components need modification: (1) The `ItemSchema` in `src/schemas.ts` needs two new optional fields (`depends_on: z.array(z.string()).optional()` and `campaign: z.string().optional()`), (2) The orchestrator must filter items by checking if their dependencies are all in "done" state before execution, and (3) The `execute-roadmap` command must infer dependencies when creating items from ROADMAP.md milestones.

The campaign grouping feature will leverage the existing `RoadmapMilestone` structure in `src/domain/roadmap.ts`. When objectives are extracted from milestones, the milestone ID can be used as the campaign identifier, grouping related items together and enabling the orchestrator to process campaigns in order.

## Current State Analysis

### Existing Implementation

#### ItemSchema (src/schemas.ts:95-127)
The current schema defines item metadata but has no dependency or campaign fields:
```typescript
export const ItemSchema = z.object({
  schema_version: z.number(),
  id: z.string(),
  title: z.string(),
  section: z.string().optional(),
  state: WorkflowStateSchema,
  overview: z.string(),
  branch: z.string().nullable(),
  pr_url: z.string().nullable(),
  pr_number: z.number().nullable(),
  last_error: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  // ... structured context fields
  problem_statement: z.string().optional(),
  motivation: z.string().optional(),
  success_criteria: z.array(z.string()).optional(),
  technical_constraints: z.array(z.string()).optional(),
  scope_in_scope: z.array(z.string()).optional(),
  scope_out_of_scope: z.array(z.string()).optional(),
  priority_hint: PriorityHintSchema.optional(),
  urgency_hint: z.string().optional(),
  // ... completion metadata
  rollback_sha: z.string().nullable().optional(),
  completed_at: z.string().nullable().optional(),
  merged_at: z.string().nullable().optional(),
  merge_commit_sha: z.string().nullable().optional(),
  checks_passed: z.boolean().nullable().optional(),
});
```

#### Orchestrator (src/commands/orchestrator.ts:41-201)
The orchestrator currently uses simple sequential or parallel processing without dependency awareness:

- `orchestrateAll()` (line 41-201): Iterates through `nonDoneItems` and processes them sequentially or in parallel
- `getNextIncompleteItem()` (line 330-335): Simply finds the first non-done item by ID order
- `processItemsParallel()` (line 210-283): Uses a worker pool but no dependency checking

Key code pattern at lines 59-62:
```typescript
const nonDoneItems = items.filter((item) => item.state !== "done");
const doneItems = items.filter((item) => item.state === "done");
```

This filtering only checks state, not dependencies.

#### Execute-roadmap Command (src/commands/execute-roadmap.ts:34-106)
Creates items from ROADMAP.md but does not capture milestone grouping or infer dependencies:

- Line 67-72: Converts objectives to `ParsedIdea[]` but only includes milestone title in description
- No campaign field assignment
- No dependency inference between objectives

```typescript
const ideas: ParsedIdea[] = objectives.map((obj) => ({
  title: obj.objective,
  description: `From milestone [${obj.milestoneId}] ${obj.milestoneTitle}`,
  motivation: `Strategic milestone: ${obj.milestoneTitle}`,
  suggestedSection: "roadmap",
}));
```

#### Roadmap Domain (src/domain/roadmap.ts)
Already has milestone structure that can be used for campaigns:
- `RoadmapMilestone` interface (line 35-42) has `id` field
- `extractPendingObjectives()` (line 352-378) returns objectives with `milestoneId` context
- Objectives have implicit ordering within a milestone

### Key Files

- `src/schemas.ts:95-127` - ItemSchema definition (needs `depends_on` and `campaign` fields)
- `src/commands/orchestrator.ts:41-201` - Main orchestration logic (needs dependency checking)
- `src/commands/orchestrator.ts:210-283` - Parallel processing (needs dependency-aware queueing)
- `src/commands/orchestrator.ts:330-335` - Next item selection (needs dependency filter)
- `src/commands/execute-roadmap.ts:34-106` - Roadmap to items conversion (needs campaign and dependency assignment)
- `src/domain/roadmap.ts:30-48` - Milestone and objective types (source for campaigns)
- `src/domain/ideas.ts:215-246` - `createItemFromIdea()` function (needs to accept new fields)
- `src/fs/json.ts:85-93` - Item read/write functions
- `src/commands/status.ts:16-49` - `scanItems()` returns IndexItem[] used by orchestrator
- `src/__tests__/schemas.test.ts` - Schema tests (needs tests for new fields)
- `src/__tests__/commands/orchestrator.test.ts` - Orchestrator tests (needs dependency tests)
- `src/__tests__/commands/execute-roadmap.test.ts` - Execute-roadmap tests

## Technical Considerations

### Dependencies

**Internal modules to modify:**
- `src/schemas.ts` - Add new fields to ItemSchema
- `src/domain/ideas.ts` - Update `ParsedIdea` and `createItemFromIdea()` to handle new fields
- `src/commands/orchestrator.ts` - Add dependency checking logic
- `src/commands/execute-roadmap.ts` - Add campaign assignment and dependency inference
- `src/domain/roadmap.ts` - May need helper for ordering objectives within milestone

**No external dependencies required** - This is purely internal logic changes.

### Patterns to Follow

1. **Zod Schema Pattern** (src/schemas.ts):
   - Optional fields use `.optional()` suffix
   - Arrays use `z.array(z.string())`
   - Export type via `z.infer<typeof Schema>`

2. **Item Creation Pattern** (src/domain/ideas.ts:215-246):
   - `createItemFromIdea()` constructs full Item from ParsedIdea
   - New fields should be added to both ParsedIdea and the created Item

3. **Orchestrator Filtering Pattern** (src/commands/orchestrator.ts):
   - Items are filtered using array methods before processing
   - Use `scanItems()` to get current item states

4. **Test Pattern** (src/__tests__/):
   - Tests use `bun:test`
   - Create temp directories for file-based tests
   - Mock logger with `vi.fn()`

### Dependency Checking Algorithm

The orchestrator should implement this logic for selecting runnable items:

```typescript
function isItemRunnable(item: IndexItem, allItems: Item[]): boolean {
  const fullItem = /* load full item with depends_on */;
  if (!fullItem.depends_on || fullItem.depends_on.length === 0) {
    return true; // No dependencies, always runnable
  }

  return fullItem.depends_on.every(depId => {
    const dep = allItems.find(i => i.id === depId);
    return dep && dep.state === "done";
  });
}
```

### Campaign-Based Ordering

When campaigns are implemented:
1. Group items by campaign
2. Sort campaigns (e.g., by milestone ID like M1, M2, M3)
3. Within each campaign, respect depends_on ordering
4. Only start next campaign when previous is complete (or allow parallel if no deps)

### Dependency Inference Rules for execute-roadmap

Potential inference rules:
- Test items depend on corresponding implementation items (e.g., "Add tests for X" depends on "Implement X")
- Documentation items depend on implementation items
- Items with "after" or "following" in title depend on previous items
- Within a milestone, later objectives may depend on earlier ones

Simple heuristic for MVP: Within a milestone, create a linear dependency chain where each objective depends on the previous one.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Circular dependencies | High - Deadlock, no items can run | Add validation in doctor to detect cycles; reject circular deps during creation |
| Missing dependency items | Medium - Items blocked forever | Validate depends_on IDs exist; warn/error on missing deps |
| Performance with many items | Low - Need to load all items to check deps | Cache dependency graph; only reload on state changes |
| Breaking existing items | Medium - Old items lack new fields | Fields are optional; undefined/empty means no deps |
| Campaign ordering conflicts | Low - Ambiguous execution order | Use milestone ID as campaign; M1 < M2 by natural sort |
| Parallel execution race conditions | Medium - Two workers claim same item | Check deps before processing in worker, not just in queue |

## Recommended Approach

### Phase 1: Schema Updates
1. Add `depends_on: z.array(z.string()).optional()` to ItemSchema
2. Add `campaign: z.string().optional()` to ItemSchema
3. Update `ParsedIdea` interface to include `dependsOn?: string[]` and `campaign?: string`
4. Update `createItemFromIdea()` to map new fields
5. Add schema tests for new fields

### Phase 2: Orchestrator Dependency Checking
1. Create helper function `loadItemDependencies(root: string, itemId: string): Promise<Item>`
2. Create helper function `areDependenciesSatisfied(item: Item, doneItems: Set<string>): boolean`
3. Modify `orchestrateAll()` to filter items by runnable status
4. Modify `getNextIncompleteItem()` to respect dependencies
5. Update parallel processing to check deps before each item
6. Add orchestrator tests for dependency scenarios

### Phase 3: Execute-roadmap Dependency Inference
1. Update `executeRoadmapCommand()` to pass campaign (milestone ID) to items
2. Implement simple dependency inference: within a milestone, create linear chain
3. Add option for more sophisticated inference (test depends on implementation)
4. Add tests for campaign and dependency assignment

### Phase 4: Doctor Validation
1. Add cycle detection for dependencies
2. Add validation for missing dependency references
3. Add warning for orphaned dependencies (pointing to non-existent items)

## Open Questions

1. **Dependency Reference Format**: Should `depends_on` use full item IDs (e.g., `001-add-feature`) or short IDs (e.g., `1`)? Full IDs are more explicit but harder to manage. Recommendation: Use full IDs for clarity.

2. **Campaign Completion Semantics**: Should the orchestrator wait for all items in a campaign to complete before starting the next campaign? Or allow parallel campaigns if dependencies allow? Recommendation: Allow parallel unless explicitly blocked by dependencies.

3. **Dependency Inference Sophistication**: How sophisticated should the execute-roadmap inference be? Simple linear chain vs. pattern-based (test depends on code)? Recommendation: Start with linear chain within milestone, add pattern-based later as enhancement.

4. **Manual Dependency Specification**: Should there be a CLI command to add/remove dependencies on existing items? (e.g., `wreckit depends 003 --on 001,002`) Recommendation: Defer to future enhancement.

5. **Cross-Milestone Dependencies**: Can items in one milestone depend on items in another? Recommendation: Yes, allow it - the campaign field is orthogonal to depends_on.
