# Implement Item Dependencies and Campaign Grouping Implementation Plan

## Implementation Plan Title
Implement Item Dependencies and Campaign Grouping

## Overview
This implementation adds two new capabilities to prevent race conditions and logical errors in autonomous mode:
1. **Item Dependencies**: Items can declare dependencies on other items via a `depends_on` array. The orchestrator will only execute items whose dependencies are all in "done" state.
2. **Campaign Grouping**: Items can be grouped into campaigns (typically based on ROADMAP milestones). This enables logical grouping and milestone-based ordering.

## Current State
The orchestrator (`src/commands/orchestrator.ts:41-201`) currently processes items in simple ID order without dependency awareness.
ItemSchema (`src/schemas.ts:95-127`) has no `depends_on` or `campaign` fields.
ParsedIdea interface (`src/domain/ideas.ts:7-60`) needs update.
scanItems (`src/commands/status.ts:16-49`) returns `IndexItem[]` which needs `depends_on`.

### Key Discoveries
1. **ItemSchema**: Needs `depends_on` (array of strings) and `campaign` (string).
2. **IndexItemSchema**: Needs `depends_on` for fast scanning.
3. **Orchestrator**: Currently filters only by state. Needs dependency graph logic.
4. **Execute-roadmap**: Creates items without context. Needs to infer dependencies from milestone structure.

## Desired End State
### Schema Changes
- `depends_on: z.array(z.string()).optional()`
- `campaign: z.string().optional()`

### Orchestrator Behavior
- Check dependencies before execution.
- Skip items with unsatisfied dependencies.
- Parallel execution respects dependencies.

### Execute-roadmap Behavior
- Set `campaign` from milestone ID.
- Infer linear dependencies within a milestone.

### Doctor Validation
- Detect circular dependencies.
- Warn on missing dependency references.

## What We're NOT Doing
1. **Cross-milestone dependency inference** - Only within milestone.
2. **Campaign-level blocking** - Blocking is via item dependencies only.
3. **CLI for managing dependencies** - No `wreckit depends` command yet.
4. **Pattern-based inference** - Simple linear chain only.
5. **Visualization** - No graph UI.

## Implementation Approach
The implementation follows a bottom-up approach:
1. Update schemas (foundation).
2. Update data layer (ideas domain).
3. Update business logic (orchestrator).
4. Update high-level commands (execute-roadmap).
5. Add validation (doctor).

---

## Phases

### Phase 1: Schema Updates

#### Overview
Add `depends_on` and `campaign` fields to ItemSchema and IndexItemSchema.

#### Changes Required:

##### 1. ItemSchema
**File**: `src/schemas.ts`
**Changes**: Add new optional fields.

```typescript
depends_on: z.array(z.string()).optional(),
campaign: z.string().optional(),
```

##### 2. IndexItemSchema
**File**: `src/schemas.ts`
**Changes**: Add `depends_on`.

##### 3. Schema Tests
**File**: `src/__tests__/schemas.test.ts`
**Changes**: Add tests for new fields.

#### Success Criteria:
##### Automated Verification:
- [ ] Tests pass: `bun test src/__tests__/schemas.test.ts`
- [ ] Type checking passes: `bun run typecheck`

##### Manual Verification:
- [ ] Existing items parse correctly.

---

### Phase 2: Update Data Layer (Ideas Domain)

#### Overview
Update `ParsedIdea`, `createItemFromIdea`, and `toIndexItem` to handle new fields.

#### Changes Required:

##### 1. ParsedIdea Interface
**File**: `src/domain/ideas.ts`
**Changes**: Add `dependsOn` and `campaign`.

##### 2. createItemFromIdea
**File**: `src/domain/ideas.ts`
**Changes**: Map fields to Item.

##### 3. toIndexItem & scanItems
**File**: `src/domain/indexing.ts`, `src/commands/status.ts`
**Changes**: Include `depends_on`.

#### Success Criteria:
##### Automated Verification:
- [ ] Tests pass: `bun test`

##### Manual Verification:
- [ ] Create item with dependencies, verify fields.

---

### Phase 3: Orchestrator Dependency Checking

#### Overview
Modify orchestrator to check dependencies before execution.

#### Changes Required:

##### 1. Dependency Helpers
**File**: `src/commands/orchestrator.ts`
**Changes**: `areDependenciesSatisfied`, `filterRunnableItems`.

##### 2. Update orchestrateAll
**File**: `src/commands/orchestrator.ts`
**Changes**: Filter by runnable status.

##### 3. Update getNextIncompleteItem
**File**: `src/commands/orchestrator.ts`
**Changes**: Respect dependencies.

#### Success Criteria:
##### Automated Verification:
- [ ] Tests pass: `bun test`

##### Manual Verification:
- [ ] Verify blocked items don't run.
- [ ] Verify items run after deps complete.

---

### Phase 4: Execute-roadmap Dependency Inference

#### Overview
Update execute-roadmap to set campaign and infer dependencies.

#### Changes Required:

##### 1. Update Objective Extraction
**File**: `src/domain/roadmap.ts`
**Changes**: Add `index` to extracted objectives.

##### 2. Update executeRoadmapCommand
**File**: `src/commands/execute-roadmap.ts`
**Changes**: Set campaign, infer dependencies.

##### 3. Update persistItems
**File**: `src/domain/ideas.ts`
**Changes**: Resolve dependencies during creation.

#### Success Criteria:
##### Automated Verification:
- [ ] Tests pass: `bun test`

##### Manual Verification:
- [ ] Verify items created from roadmap have dependencies set correctly.

---

### Phase 5: Doctor Validation

#### Overview
Add cycle detection and missing reference checks.

#### Changes Required:

##### 1. Validation Functions
**File**: `src/doctor.ts`
**Changes**: `detectCycles`, `findMissingDependencies`.

#### Success Criteria:
##### Automated Verification:
- [ ] Tests pass: `bun test`

##### Manual Verification:
- [ ] Verify circular dependency error.

---

## Testing Strategy
### Unit Tests
- Schema tests for new fields.
- Orchestrator dependency logic tests.
- Doctor cycle detection tests.

### Integration Tests
- Verify items execute in order.
- Verify execute-roadmap creates dependent items.

## Migration Notes
- Backwards compatible (fields are optional).
- No migration script needed.

## References
- ItemSchema: `src/schemas.ts`
- Orchestrator: `src/commands/orchestrator.ts`