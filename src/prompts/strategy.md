# Strategy Phase

You are tasked with conducting a strategic analysis of this project. This is a high-level planning exercise that produces a ROADMAP.md with prioritized milestones. Think strategically, not tactically - focus on value, alignment, and gaps, not features.

## Objective

Analyze the project to identify:

1. **Mission vs Reality** - What does the project aim to do vs what it currently does?
2. **Gaps** - Where does the code fall short of specifications?
3. **Discoveries** - What do benchmarks and metrics reveal?
4. **Innovations** - What opportunities exist for improvement?

Then produce a ROADMAP.md with prioritized milestones that guide future development work.

## Analysis Process

### Step 1: Understand the Mission

1. **Read project documentation:**
   - README.md - Project purpose and goals
   - specs/ directory - Formal specifications (if present)
   - package.json / config files - Dependencies and tooling

2. **Understand the domain:**
   - What problem does this project solve?
   - Who are the users/stakeholders?
   - What are the success criteria?

### Step 2: Assess Current Reality

1. **Analyze the codebase:**
   - src/ directory structure and organization
   - Core modules and their responsibilities
   - Test coverage and quality

2. **Review performance data (if available):**
   - benchmark_results.md - Performance metrics
   - Test results and coverage reports
   - Error logs or issue tracking

3. **Identify patterns:**
   - Architectural decisions and their implications
   - Technical debt indicators
   - Code quality signals

### Step 3: Identify Gaps and Opportunities

Compare mission with reality to identify:

1. **Spec Compliance Gaps:**
   - Features specified but not implemented
   - Implementations that diverge from specs
   - Missing tests for specified behavior

2. **Performance Discoveries:**
   - Bottlenecks revealed by benchmarks
   - Scaling concerns
   - Resource utilization issues

3. **Innovation Opportunities:**
   - Missing capabilities that would add value
   - Modernization opportunities
   - Developer experience improvements

### Step 4: Prioritize and Plan

Organize findings into strategic milestones:

1. **Critical** - Blocking issues or compliance gaps
2. **High** - Significant value or risk reduction
3. **Medium** - Meaningful improvements
4. **Low** - Nice-to-have enhancements

## Output

Create a file at the repository root: `ROADMAP.md`

Use this EXACT structure (the format is machine-parseable):

```markdown
# Roadmap

## Active Milestones

### [M1] Milestone Title

**Status:** in-progress
**Target:** [Timeline estimate, e.g., Q1 2026]
**Strategic Goal:** [Why this matters - the value proposition]

#### Objectives

- [ ] Concrete objective that can become a wreckit item
- [ ] Another specific, actionable objective
- [x] Already completed objective (if any)

### [M2] Second Milestone

**Status:** planned
**Target:** [Timeline]
**Strategic Goal:** [Value proposition]

#### Objectives

- [ ] Objective 1
- [ ] Objective 2

## Backlog

### [B1] Future Milestone

**Status:** planned
**Target:** [When this might be addressed]
**Strategic Goal:** [Why this would matter]

#### Objectives

- [ ] Future objective

## Completed

### [DONE-1] Completed Milestone

**Status:** done
**Target:** [Original timeline]
**Strategic Goal:** [Original value proposition]

#### Objectives

- [x] Completed objective
```

## Format Requirements

- **Milestone IDs:** Use `[M1]`, `[M2]` for active, `[B1]`, `[B2]` for backlog, `[DONE-1]` etc. for completed
- **Status:** Must be exactly: `in-progress`, `planned`, or `done`
- **Objectives:** Use checkbox format `- [ ]` or `- [x]`
- Each objective should be specific enough to become a wreckit item

## Important Guidelines

1. **Think Strategically:**
   - Focus on value and impact, not just features
   - Consider the hierarchy: Strategy -> Plan -> Implement
   - Avoid the "Feature Factory" trap

2. **Be Evidence-Based:**
   - Reference actual code and specs
   - Use benchmark data when available
   - Don't assume - verify with the codebase

3. **Be Actionable:**
   - Each objective should be concrete
   - Avoid vague milestones like "improve performance"
   - Make objectives measurable when possible

4. **Consider Dependencies:**
   - Order milestones by dependencies
   - Note blocking relationships in strategic goals

## Working Directory

{{item_path}}

## Completion

When you have completed the strategic analysis and created the `ROADMAP.md` file at the repository root, output the following signal:
{{completion_signal}}
