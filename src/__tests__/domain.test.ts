import { describe, expect, it } from "bun:test";
import type { Item, Prd, Story } from "../schemas";
import {
  WORKFLOW_STATES,
  getNextState,
  getAllowedNextStates,
  isTerminalState,
  getStateIndex,
  canEnterResearched,
  canEnterPlanned,
  canEnterImplementing,
  canEnterInPr,
  canEnterDone,
  validateTransition,
  allStoriesDone,
  hasPendingStories,
  applyStateTransition,
  type ValidationContext,
} from "../domain";

function makeStory(overrides: Partial<Story> = {}): Story {
  return {
    id: "story-1",
    title: "Test Story",
    acceptance_criteria: ["AC1"],
    priority: 1,
    status: "pending",
    notes: "",
    ...overrides,
  };
}

function makePrd(stories: Story[]): Prd {
  return {
    schema_version: 1,
    id: "prd-1",
    branch_name: "wreckit/test",
    user_stories: stories,
  };
}

function makeContext(overrides: Partial<ValidationContext> = {}): ValidationContext {
  return {
    hasResearchMd: false,
    hasPlanMd: false,
    prd: null,
    hasPr: false,
    prMerged: false,
    ...overrides,
  };
}

describe("state machine", () => {
  describe("getNextState", () => {
    it.each([
      ["raw", "researched"],
      ["researched", "planned"],
      ["planned", "implementing"],
      ["implementing", "in_pr"],
      ["in_pr", "done"],
    ] as const)("returns %s -> %s", (current, expected) => {
      expect(getNextState(current)).toBe(expected);
    });

    it("returns null for done", () => {
      expect(getNextState("done")).toBeNull();
    });
  });

  describe("getAllowedNextStates", () => {
    it.each([
      ["raw", ["researched"]],
      ["researched", ["planned"]],
      ["planned", ["implementing"]],
      ["implementing", ["in_pr"]],
      ["in_pr", ["done"]],
      ["done", []],
    ] as const)("returns allowed states for %s", (current, expected) => {
      expect(getAllowedNextStates(current)).toEqual(expected);
    });
  });

  describe("isTerminalState", () => {
    it("returns true only for done", () => {
      expect(isTerminalState("done")).toBe(true);
    });

    it.each(["raw", "researched", "planned", "implementing", "in_pr"] as const)(
      "returns false for %s",
      (state) => {
        expect(isTerminalState(state)).toBe(false);
      }
    );
  });

  describe("getStateIndex", () => {
    it("returns correct index for each state", () => {
      WORKFLOW_STATES.forEach((state, index) => {
        expect(getStateIndex(state)).toBe(index);
      });
    });
  });
});

describe("validation", () => {
  describe("canEnterResearched", () => {
    it("returns valid when hasResearchMd is true", () => {
      expect(canEnterResearched({ hasResearchMd: true })).toEqual({ valid: true });
    });

    it("returns invalid when hasResearchMd is false", () => {
      const result = canEnterResearched({ hasResearchMd: false });
      expect(result.valid).toBe(false);
      expect(result.reason).toBeDefined();
    });
  });

  describe("canEnterPlanned", () => {
    it("returns valid when hasPlanMd and prd exist", () => {
      const prd = makePrd([makeStory()]);
      expect(canEnterPlanned({ hasPlanMd: true, prd })).toEqual({ valid: true });
    });

    it("returns invalid when hasPlanMd is false", () => {
      const prd = makePrd([makeStory()]);
      const result = canEnterPlanned({ hasPlanMd: false, prd });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("plan.md");
    });

    it("returns invalid when prd is null", () => {
      const result = canEnterPlanned({ hasPlanMd: true, prd: null });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("prd.json");
    });
  });

  describe("canEnterImplementing", () => {
    it("returns valid when prd has pending stories", () => {
      const prd = makePrd([makeStory({ status: "pending" })]);
      expect(canEnterImplementing({ prd })).toEqual({ valid: true });
    });

    it("returns invalid when prd is null", () => {
      const result = canEnterImplementing({ prd: null });
      expect(result.valid).toBe(false);
    });

    it("returns invalid when no pending stories", () => {
      const prd = makePrd([makeStory({ status: "done" })]);
      const result = canEnterImplementing({ prd });
      expect(result.valid).toBe(false);
    });
  });

  describe("canEnterInPr", () => {
    it("returns valid when all stories done and hasPr", () => {
      const prd = makePrd([makeStory({ status: "done" })]);
      expect(canEnterInPr({ prd, hasPr: true })).toEqual({ valid: true });
    });

    it("returns invalid when stories not all done", () => {
      const prd = makePrd([
        makeStory({ status: "done" }),
        makeStory({ status: "pending" }),
      ]);
      const result = canEnterInPr({ prd, hasPr: true });
      expect(result.valid).toBe(false);
    });

    it("returns invalid when hasPr is false", () => {
      const prd = makePrd([makeStory({ status: "done" })]);
      const result = canEnterInPr({ prd, hasPr: false });
      expect(result.valid).toBe(false);
    });
  });

  describe("canEnterDone", () => {
    it("returns valid when prMerged is true", () => {
      expect(canEnterDone({ prMerged: true })).toEqual({ valid: true });
    });

    it("returns invalid when prMerged is false", () => {
      const result = canEnterDone({ prMerged: false });
      expect(result.valid).toBe(false);
    });
  });
});

describe("validateTransition", () => {
  it("valid: raw -> researched with hasResearchMd", () => {
    const ctx = makeContext({ hasResearchMd: true });
    expect(validateTransition("raw", "researched", ctx)).toEqual({ valid: true });
  });

  it("invalid: raw -> researched without hasResearchMd", () => {
    const ctx = makeContext({ hasResearchMd: false });
    const result = validateTransition("raw", "researched", ctx);
    expect(result.valid).toBe(false);
  });

  it("invalid: skip states (raw -> planned)", () => {
    const prd = makePrd([makeStory()]);
    const ctx = makeContext({ hasResearchMd: true, hasPlanMd: true, prd });
    const result = validateTransition("raw", "planned", ctx);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("cannot transition");
  });

  it("invalid: backward transition (planned -> raw)", () => {
    const ctx = makeContext();
    const result = validateTransition("planned", "raw", ctx);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("cannot transition");
  });

  it("valid: full workflow progression", () => {
    const prdWithPending = makePrd([makeStory({ status: "pending" })]);
    const prdAllDone = makePrd([makeStory({ status: "done" })]);

    expect(
      validateTransition("raw", "researched", makeContext({ hasResearchMd: true }))
    ).toEqual({ valid: true });

    expect(
      validateTransition(
        "researched",
        "planned",
        makeContext({ hasPlanMd: true, prd: prdWithPending })
      )
    ).toEqual({ valid: true });

    expect(
      validateTransition(
        "planned",
        "implementing",
        makeContext({ prd: prdWithPending })
      )
    ).toEqual({ valid: true });

    expect(
      validateTransition(
        "implementing",
        "in_pr",
        makeContext({ prd: prdAllDone, hasPr: true })
      )
    ).toEqual({ valid: true });

    expect(
      validateTransition("in_pr", "done", makeContext({ prMerged: true }))
    ).toEqual({ valid: true });
  });
});

describe("helper functions", () => {
  describe("allStoriesDone", () => {
    it("returns false for null prd", () => {
      expect(allStoriesDone(null)).toBe(false);
    });

    it("returns false for empty stories", () => {
      expect(allStoriesDone(makePrd([]))).toBe(false);
    });

    it("returns false when some stories pending", () => {
      const prd = makePrd([
        makeStory({ status: "done" }),
        makeStory({ status: "pending" }),
      ]);
      expect(allStoriesDone(prd)).toBe(false);
    });

    it("returns true when all stories done", () => {
      const prd = makePrd([
        makeStory({ status: "done" }),
        makeStory({ status: "done" }),
      ]);
      expect(allStoriesDone(prd)).toBe(true);
    });
  });

  describe("hasPendingStories", () => {
    it("returns false for null prd", () => {
      expect(hasPendingStories(null)).toBe(false);
    });

    it("returns false when no pending stories", () => {
      const prd = makePrd([makeStory({ status: "done" })]);
      expect(hasPendingStories(prd)).toBe(false);
    });

    it("returns true when at least one pending story", () => {
      const prd = makePrd([
        makeStory({ status: "done" }),
        makeStory({ status: "pending" }),
      ]);
      expect(hasPendingStories(prd)).toBe(true);
    });
  });
});

describe("state machine edge cases", () => {
  it.each(WORKFLOW_STATES)("same-state transition is invalid: %s → %s", (s) => {
    const ctx = makeContext();
    expect(validateTransition(s, s, ctx).valid).toBe(false);
  });

  it("disallows all non-adjacent transitions", () => {
    for (const current of WORKFLOW_STATES) {
      for (const target of WORKFLOW_STATES) {
        if (target === getNextState(current)) continue;
        const ctx = makeContext({
          hasResearchMd: true,
          hasPlanMd: true,
          prd: makePrd([makeStory({ status: "done" })]),
          hasPr: true,
          prMerged: true,
        });
        expect(validateTransition(current, target, ctx).valid).toBe(false);
      }
    }
  });

  it("no transition from done is valid", () => {
    for (const target of WORKFLOW_STATES) {
      const ctx = makeContext({
        hasResearchMd: true,
        hasPlanMd: true,
        prd: makePrd([makeStory({ status: "done" })]),
        hasPr: true,
        prMerged: true,
      });
      expect(validateTransition("done", target, ctx).valid).toBe(false);
    }
  });
});

describe("applyStateTransition", () => {
  it("returns new item with updated state and updated_at", () => {
    const item: Item = {
      schema_version: 1,
      id: "test/001-test",
      title: "Test",
      section: "test",
      state: "raw",
      overview: "Test overview",
      branch: null,
      pr_url: null,
      pr_number: null,
      last_error: null,
      created_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-01-01T00:00:00.000Z",
    };
    const ctx = makeContext({ hasResearchMd: true });

    const result = applyStateTransition(item, ctx);

    expect("nextItem" in result).toBe(true);
    if ("nextItem" in result) {
      expect(result.nextItem.state).toBe("researched");
      expect(result.nextItem.updated_at).not.toBe(item.updated_at);
      // Original item unchanged
      expect(item.state).toBe("raw");
      expect(item.updated_at).toBe("2024-01-01T00:00:00.000Z");
    }
  });

  it("returns error for invalid transition", () => {
    const item: Item = {
      schema_version: 1,
      id: "test/001-test",
      title: "Test",
      section: "test",
      state: "raw",
      overview: "Test overview",
      branch: null,
      pr_url: null,
      pr_number: null,
      last_error: null,
      created_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-01-01T00:00:00.000Z",
    };
    const ctx = makeContext({ hasResearchMd: false }); // Missing requirement

    const result = applyStateTransition(item, ctx);

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("research.md");
    }
  });

  it("returns error for terminal state", () => {
    const item: Item = {
      schema_version: 1,
      id: "test/001-test",
      title: "Test",
      section: "test",
      state: "done",
      overview: "Test overview",
      branch: null,
      pr_url: null,
      pr_number: null,
      last_error: null,
      created_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-01-01T00:00:00.000Z",
    };
    const ctx = makeContext();

    const result = applyStateTransition(item, ctx);

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("terminal");
    }
  });

  it("never mutates the input item", () => {
    const item: Item = {
      schema_version: 1,
      id: "test/001-test",
      title: "Test",
      section: "test",
      state: "raw",
      overview: "Test overview",
      branch: null,
      pr_url: null,
      pr_number: null,
      last_error: null,
      created_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-01-01T00:00:00.000Z",
    };
    const originalState = item.state;
    const originalUpdatedAt = item.updated_at;
    const ctx = makeContext({ hasResearchMd: true });

    applyStateTransition(item, ctx);

    expect(item.state).toBe(originalState);
    expect(item.updated_at).toBe(originalUpdatedAt);
  });
});
