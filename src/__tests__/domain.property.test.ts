import { describe, expect, it } from "bun:test";
import fc from "fast-check";
import type { Item, Prd, Story } from "../schemas";
import {
  WORKFLOW_STATES,
  getNextState,
  getStateIndex,
  isTerminalState,
  validateTransition,
  applyStateTransition,
  allStoriesDone,
  hasPendingStories,
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

function makeFullyValidContext(): ValidationContext {
  return {
    hasResearchMd: true,
    hasPlanMd: true,
    prd: makePrd([makeStory({ status: "done" })]),
    hasPr: true,
    prMerged: true,
  };
}

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
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
    ...overrides,
  };
}

// Arbitrary for workflow states
const workflowStateArb = fc.constantFrom(...WORKFLOW_STATES);

describe("property-based state machine tests", () => {
  describe("monotonicity", () => {
    it("valid transitions only increase state index by exactly 1", () => {
      fc.assert(
        fc.property(workflowStateArb, workflowStateArb, (current, target) => {
          const ctx = makeFullyValidContext();
          const result = validateTransition(current, target, ctx);
          if (result.valid) {
            expect(getStateIndex(target)).toBe(getStateIndex(current) + 1);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("terminal state", () => {
    it("once done, no further transitions are valid", () => {
      fc.assert(
        fc.property(workflowStateArb, (target) => {
          const ctx = makeFullyValidContext();
          const result = validateTransition("done", target, ctx);
          expect(result.valid).toBe(false);
        }),
        { numRuns: 50 }
      );
    });

    it("isTerminalState is consistent with getNextState returning null", () => {
      fc.assert(
        fc.property(workflowStateArb, (state) => {
          const isTerminal = isTerminalState(state);
          const nextState = getNextState(state);
          expect(isTerminal).toBe(nextState === null);
        }),
        { numRuns: 50 }
      );
    });
  });

  describe("story invariants", () => {
    it("allStoriesDone ⇔ !hasPendingStories when stories exist", () => {
      // Generate 1-5 stories with random done/pending status
      const storyArb = fc.record({
        id: fc.string({ minLength: 1 }),
        title: fc.string({ minLength: 1 }),
        acceptance_criteria: fc.array(fc.string(), { minLength: 1 }),
        priority: fc.integer({ min: 1, max: 10 }),
        status: fc.constantFrom("pending" as const, "done" as const),
        notes: fc.string(),
      });
      
      const storiesArb = fc.array(storyArb, { minLength: 1, maxLength: 5 });

      fc.assert(
        fc.property(storiesArb, (stories) => {
          const prd = makePrd(stories as Story[]);
          
          const allDone = allStoriesDone(prd);
          const hasPending = hasPendingStories(prd);
          
          // When stories exist: allDone XOR hasPending must be true
          // (exactly one of them must be true, not both, not neither)
          // Actually: allDone means NO pending, hasPending means AT LEAST ONE pending
          // So: allDone ⇔ !hasPending
          expect(allDone).toBe(!hasPending);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("immutability", () => {
    it("applyStateTransition never mutates input", () => {
      // Generate items in non-terminal states
      const nonTerminalStateArb = fc.constantFrom(
        ...WORKFLOW_STATES.filter((s) => s !== "done")
      );

      fc.assert(
        fc.property(nonTerminalStateArb, (state) => {
          const item = makeItem({ state });
          
          // Deep freeze the item to detect mutations
          const frozenItem = Object.freeze({ ...item });
          const originalJson = JSON.stringify(frozenItem);
          
          // Create appropriate context for the transition
          let ctx: ValidationContext;
          switch (state) {
            case "raw":
              ctx = makeContext({ hasResearchMd: true });
              break;
            case "researched":
              ctx = makeContext({
                hasPlanMd: true,
                prd: makePrd([makeStory({ status: "pending" })]),
              });
              break;
            case "planned":
              ctx = makeContext({
                prd: makePrd([makeStory({ status: "pending" })]),
              });
              break;
            case "implementing":
              ctx = makeContext({
                prd: makePrd([makeStory({ status: "done" })]),
                hasPr: true,
              });
              break;
            case "in_pr":
              ctx = makeContext({ prMerged: true });
              break;
            default:
              ctx = makeContext();
          }
          
          applyStateTransition(frozenItem, ctx);
          
          // Verify original wasn't mutated
          expect(JSON.stringify(frozenItem)).toBe(originalJson);
        }),
        { numRuns: 50 }
      );
    });

    it("result item is a new object, not the input", () => {
      fc.assert(
        fc.property(fc.constant("raw"), () => {
          const item = makeItem({ state: "raw" });
          const ctx = makeContext({ hasResearchMd: true });
          
          const result = applyStateTransition(item, ctx);
          
          if ("nextItem" in result) {
            expect(result.nextItem).not.toBe(item);
          }
        }),
        { numRuns: 10 }
      );
    });
  });

  describe("transition ordering", () => {
    it("getStateIndex returns consecutive integers starting at 0", () => {
      WORKFLOW_STATES.forEach((state, expectedIndex) => {
        expect(getStateIndex(state)).toBe(expectedIndex);
      });
    });

    it("getNextState chain covers all states exactly once", () => {
      const visited: string[] = [];
      let current: typeof WORKFLOW_STATES[number] | null = "raw";
      
      while (current !== null) {
        visited.push(current);
        current = getNextState(current);
      }
      
      expect(visited).toEqual(WORKFLOW_STATES);
    });
  });
});
