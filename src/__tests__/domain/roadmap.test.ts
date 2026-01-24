import { describe, expect, it } from "bun:test";
import {
  parseRoadmap,
  serializeRoadmap,
  validateRoadmap,
  extractPendingObjectives,
  extractAllObjectives,
  type Roadmap,
  type RoadmapMilestone,
} from "../../domain/roadmap";

const SAMPLE_ROADMAP = `# Roadmap

## Active Milestones

### [M1] Improve Performance
**Status:** in-progress
**Target:** Q1 2026
**Strategic Goal:** Reduce API response times by 50%

#### Objectives
- [ ] Optimize database queries
- [x] Add caching layer
- [ ] Implement connection pooling

### [M2] Add Authentication
**Status:** planned
**Target:** Q2 2026
**Strategic Goal:** Enable secure user access

#### Objectives
- [ ] Implement OAuth2 flow
- [ ] Add JWT token validation

## Backlog

### [B1] Mobile Support
**Status:** planned
**Target:** Q3 2026
**Strategic Goal:** Expand to mobile platforms

#### Objectives
- [ ] Create React Native app
- [ ] Implement offline mode

## Completed

### [DONE-1] Initial Setup
**Status:** done
**Target:** Q4 2025
**Strategic Goal:** Establish project foundation

#### Objectives
- [x] Set up CI/CD pipeline
- [x] Configure linting
`;

describe("parseRoadmap", () => {
  it("parses a complete ROADMAP.md with all sections", () => {
    const roadmap = parseRoadmap(SAMPLE_ROADMAP);

    expect(roadmap.activeMilestones).toHaveLength(2);
    expect(roadmap.backlog).toHaveLength(1);
    expect(roadmap.completed).toHaveLength(1);
  });

  it("parses milestone metadata correctly", () => {
    const roadmap = parseRoadmap(SAMPLE_ROADMAP);
    const m1 = roadmap.activeMilestones[0];

    expect(m1.id).toBe("M1");
    expect(m1.title).toBe("Improve Performance");
    expect(m1.status).toBe("in-progress");
    expect(m1.target).toBe("Q1 2026");
    expect(m1.strategicGoal).toBe("Reduce API response times by 50%");
  });

  it("parses objectives with completion status", () => {
    const roadmap = parseRoadmap(SAMPLE_ROADMAP);
    const m1 = roadmap.activeMilestones[0];

    expect(m1.objectives).toHaveLength(3);
    expect(m1.objectives[0]).toEqual({
      text: "Optimize database queries",
      completed: false,
    });
    expect(m1.objectives[1]).toEqual({
      text: "Add caching layer",
      completed: true,
    });
    expect(m1.objectives[2]).toEqual({
      text: "Implement connection pooling",
      completed: false,
    });
  });

  it("parses ROADMAP.md with only active milestones", () => {
    const content = `# Roadmap

## Active Milestones

### [M1] First Milestone
**Status:** in-progress

#### Objectives
- [ ] Do something
`;

    const roadmap = parseRoadmap(content);

    expect(roadmap.activeMilestones).toHaveLength(1);
    expect(roadmap.backlog).toHaveLength(0);
    expect(roadmap.completed).toHaveLength(0);
    expect(roadmap.activeMilestones[0].id).toBe("M1");
  });

  it("handles empty content gracefully", () => {
    const roadmap = parseRoadmap("");

    expect(roadmap.activeMilestones).toHaveLength(0);
    expect(roadmap.backlog).toHaveLength(0);
    expect(roadmap.completed).toHaveLength(0);
  });

  it("handles milestones without objectives", () => {
    const content = `# Roadmap

## Active Milestones

### [M1] Empty Milestone
**Status:** planned
`;

    const roadmap = parseRoadmap(content);

    expect(roadmap.activeMilestones).toHaveLength(1);
    expect(roadmap.activeMilestones[0].objectives).toHaveLength(0);
  });

  it("defaults to 'planned' status when not specified", () => {
    const content = `# Roadmap

## Active Milestones

### [M1] No Status
#### Objectives
- [ ] Task
`;

    const roadmap = parseRoadmap(content);

    expect(roadmap.activeMilestones[0].status).toBe("planned");
  });
});

describe("serializeRoadmap", () => {
  it("serializes a roadmap back to markdown", () => {
    const roadmap: Roadmap = {
      activeMilestones: [
        {
          id: "M1",
          title: "Test Milestone",
          status: "in-progress",
          target: "Q1 2026",
          strategicGoal: "Testing serialization",
          objectives: [
            { text: "Task 1", completed: false },
            { text: "Task 2", completed: true },
          ],
        },
      ],
      backlog: [],
      completed: [],
    };

    const markdown = serializeRoadmap(roadmap);

    expect(markdown).toContain("# Roadmap");
    expect(markdown).toContain("## Active Milestones");
    expect(markdown).toContain("### [M1] Test Milestone");
    expect(markdown).toContain("**Status:** in-progress");
    expect(markdown).toContain("**Target:** Q1 2026");
    expect(markdown).toContain("**Strategic Goal:** Testing serialization");
    expect(markdown).toContain("- [ ] Task 1");
    expect(markdown).toContain("- [x] Task 2");
  });

  it("roundtrip parse/serialize maintains data integrity", () => {
    const roadmap = parseRoadmap(SAMPLE_ROADMAP);
    const serialized = serializeRoadmap(roadmap);
    const reparsed = parseRoadmap(serialized);

    expect(reparsed.activeMilestones).toHaveLength(roadmap.activeMilestones.length);
    expect(reparsed.backlog).toHaveLength(roadmap.backlog.length);
    expect(reparsed.completed).toHaveLength(roadmap.completed.length);

    // Check first milestone
    const original = roadmap.activeMilestones[0];
    const roundtripped = reparsed.activeMilestones[0];

    expect(roundtripped.id).toBe(original.id);
    expect(roundtripped.title).toBe(original.title);
    expect(roundtripped.status).toBe(original.status);
    expect(roundtripped.objectives).toHaveLength(original.objectives.length);
  });

  it("omits empty sections", () => {
    const roadmap: Roadmap = {
      activeMilestones: [
        {
          id: "M1",
          title: "Only Active",
          status: "in-progress",
          objectives: [],
        },
      ],
      backlog: [],
      completed: [],
    };

    const markdown = serializeRoadmap(roadmap);

    expect(markdown).toContain("## Active Milestones");
    expect(markdown).not.toContain("## Backlog");
    expect(markdown).not.toContain("## Completed");
  });
});

describe("validateRoadmap", () => {
  it("validates a correct ROADMAP.md", () => {
    const result = validateRoadmap(SAMPLE_ROADMAP);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects empty content", () => {
    const result = validateRoadmap("");

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("ROADMAP.md is empty");
  });

  it("requires at least one section", () => {
    const content = `# Roadmap

Some text but no sections.
`;

    const result = validateRoadmap(content);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("at least one section"))).toBe(true);
  });

  it("requires at least one milestone", () => {
    const content = `# Roadmap

## Active Milestones

No milestones here.
`;

    const result = validateRoadmap(content);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("at least one milestone"))).toBe(true);
  });

  it("detects duplicate milestone IDs", () => {
    const content = `# Roadmap

## Active Milestones

### [M1] First
**Status:** planned

### [M1] Duplicate
**Status:** planned
`;

    const result = validateRoadmap(content);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Duplicate milestone ID"))).toBe(true);
  });
});

describe("extractPendingObjectives", () => {
  it("returns only unchecked objectives from active milestones", () => {
    const roadmap = parseRoadmap(SAMPLE_ROADMAP);
    const pending = extractPendingObjectives(roadmap);

    // M1 has 2 pending, M2 has 2 pending = 4 total
    expect(pending).toHaveLength(4);

    // Check first objective
    expect(pending[0]).toEqual({
      milestoneId: "M1",
      milestoneTitle: "Improve Performance",
      objective: "Optimize database queries",
    });
  });

  it("excludes backlog and completed milestones", () => {
    const roadmap = parseRoadmap(SAMPLE_ROADMAP);
    const pending = extractPendingObjectives(roadmap);

    // No objectives from B1 or DONE-1
    const hasBacklog = pending.some((p) => p.milestoneId === "B1");
    const hasCompleted = pending.some((p) => p.milestoneId === "DONE-1");

    expect(hasBacklog).toBe(false);
    expect(hasCompleted).toBe(false);
  });

  it("returns empty array when no pending objectives", () => {
    const content = `# Roadmap

## Active Milestones

### [M1] All Done
**Status:** in-progress

#### Objectives
- [x] Done 1
- [x] Done 2
`;

    const roadmap = parseRoadmap(content);
    const pending = extractPendingObjectives(roadmap);

    expect(pending).toHaveLength(0);
  });
});

describe("extractAllObjectives", () => {
  it("returns all objectives including completed", () => {
    const roadmap = parseRoadmap(SAMPLE_ROADMAP);
    const all = extractAllObjectives(roadmap);

    // M1 has 3, M2 has 2 = 5 total
    expect(all).toHaveLength(5);

    // Check completed objective is included
    const caching = all.find((o) => o.objective === "Add caching layer");
    expect(caching).toBeDefined();
    expect(caching?.completed).toBe(true);
  });

  it("includes completion status", () => {
    const roadmap = parseRoadmap(SAMPLE_ROADMAP);
    const all = extractAllObjectives(roadmap);

    const completed = all.filter((o) => o.completed);
    const pending = all.filter((o) => !o.completed);

    expect(completed).toHaveLength(1); // Only "Add caching layer"
    expect(pending).toHaveLength(4);
  });
});
