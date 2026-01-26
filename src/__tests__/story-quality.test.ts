import { describe, it, expect } from "bun:test";
import {
  validateStoryQuality,
  verifyStoryCompletion,
  DEFAULT_STORY_QUALITY_OPTIONS,
  type StoryQualityOptions,
} from "../domain/validation";

describe("Story Quality Validation (Gap 3)", () => {
  describe("validateStoryQuality", () => {
    const defaultOptions: StoryQualityOptions = DEFAULT_STORY_QUALITY_OPTIONS;

    describe("story count validation", () => {
      it("passes with at least one story", () => {
        const prd = {
          user_stories: [
            {
              id: "US-001",
              title: "First Story",
              acceptance_criteria: ["Criterion 1", "Criterion 2"],
              priority: 1,
            },
          ],
        };

        const result = validateStoryQuality(prd, defaultOptions);
        expect(result.valid).toBe(true);
        expect(result.storyCount).toBe(1);
        expect(result.failedStoryCount).toBe(0);
        expect(result.errors).toEqual([]);
      });

      it("passes with multiple stories within limit", () => {
        const prd = {
          user_stories: Array.from({ length: 5 }, (_, i) => ({
            id: `US-${String(i + 1).padStart(3, "0")}`,
            title: `Story ${i + 1}`,
            acceptance_criteria: ["Criterion 1", "Criterion 2"],
            priority: (i % 4) + 1,
          })),
        };

        const result = validateStoryQuality(prd, defaultOptions);
        expect(result.valid).toBe(true);
        expect(result.storyCount).toBe(5);
      });

      it("fails with no stories", () => {
        const prd = { user_stories: [] };

        const result = validateStoryQuality(prd, defaultOptions);
        expect(result.valid).toBe(false);
        expect(result.storyCount).toBe(0);
        expect(
          result.errors.some((e) => e.includes("Insufficient stories")),
        ).toBe(true);
      });

      it("fails with too many stories", () => {
        const prd = {
          user_stories: Array.from({ length: 20 }, (_, i) => ({
            id: `US-${String(i + 1).padStart(3, "0")}`,
            title: `Story ${i + 1}`,
            acceptance_criteria: ["Criterion 1", "Criterion 2"],
            priority: 1,
          })),
        };

        const result = validateStoryQuality(prd, defaultOptions);
        expect(result.valid).toBe(false);
        expect(result.storyCount).toBe(20);
        expect(result.errors.some((e) => e.includes("Too many stories"))).toBe(
          true,
        );
      });

      it("allows custom story count limits", () => {
        const customOptions: StoryQualityOptions = {
          ...defaultOptions,
          minStories: 2,
          maxStories: 5,
        };

        const prd = {
          user_stories: [
            {
              id: "US-001",
              title: "Story 1",
              acceptance_criteria: ["C1", "C2"],
              priority: 1,
            },
          ],
        };

        const result = validateStoryQuality(prd, customOptions);
        expect(result.valid).toBe(false);
        expect(
          result.errors.some((e) => e.includes("required at least 2")),
        ).toBe(true);
      });
    });

    describe("story ID format validation", () => {
      it("passes with valid US-### format", () => {
        const prd = {
          user_stories: [
            {
              id: "US-001",
              title: "Valid Story",
              acceptance_criteria: ["C1", "C2"],
              priority: 1,
            },
            {
              id: "US-123",
              title: "Another Valid Story",
              acceptance_criteria: ["C1", "C2"],
              priority: 2,
            },
          ],
        };

        const result = validateStoryQuality(prd, defaultOptions);
        expect(result.valid).toBe(true);
      });

      it("fails with invalid story ID format", () => {
        const prd = {
          user_stories: [
            {
              id: "story-001",
              title: "Invalid Story",
              acceptance_criteria: ["C1", "C2"],
              priority: 1,
            },
          ],
        };

        const result = validateStoryQuality(prd, defaultOptions);
        expect(result.valid).toBe(false);
        expect(
          result.storyErrors[0].errors.some((e) => e.includes("US-###")),
        ).toBe(true);
      });

      it("fails with missing US prefix", () => {
        const prd = {
          user_stories: [
            {
              id: "001",
              title: "No Prefix Story",
              acceptance_criteria: ["C1", "C2"],
              priority: 1,
            },
          ],
        };

        const result = validateStoryQuality(prd, defaultOptions);
        expect(result.valid).toBe(false);
        expect(
          result.storyErrors[0].errors.some((e) => e.includes("US-###")),
        ).toBe(true);
      });

      it("allows disabling story ID format enforcement", () => {
        const customOptions: StoryQualityOptions = {
          ...defaultOptions,
          enforceStoryIdFormat: false,
        };

        const prd = {
          user_stories: [
            {
              id: "custom-story-id",
              title: "Custom ID Story",
              acceptance_criteria: ["C1", "C2"],
              priority: 1,
            },
          ],
        };

        const result = validateStoryQuality(prd, customOptions);
        expect(result.valid).toBe(true);
      });
    });

    describe("acceptance criteria validation", () => {
      it("passes with sufficient acceptance criteria", () => {
        const prd = {
          user_stories: [
            {
              id: "US-001",
              title: "Story With Criteria",
              acceptance_criteria: [
                "User can log in with valid credentials",
                "User sees error with invalid credentials",
                "User can reset password via email",
              ],
              priority: 1,
            },
          ],
        };

        const result = validateStoryQuality(prd, defaultOptions);
        expect(result.valid).toBe(true);
      });

      it("fails with insufficient acceptance criteria", () => {
        const prd = {
          user_stories: [
            {
              id: "US-001",
              title: "Story With One Criterion",
              acceptance_criteria: ["Only one criterion"],
              priority: 1,
            },
          ],
        };

        const result = validateStoryQuality(prd, defaultOptions);
        expect(result.valid).toBe(false);
        expect(
          result.storyErrors[0].errors.some((e) =>
            e.includes("acceptance criteria"),
          ),
        ).toBe(true);
      });

      it("fails with empty acceptance criteria array", () => {
        const prd = {
          user_stories: [
            {
              id: "US-001",
              title: "Story With No Criteria",
              acceptance_criteria: [],
              priority: 1,
            },
          ],
        };

        const result = validateStoryQuality(prd, defaultOptions);
        expect(result.valid).toBe(false);
        expect(
          result.storyErrors[0].errors.some((e) =>
            e.includes("acceptance criteria"),
          ),
        ).toBe(true);
      });

      it("fails with empty acceptance criteria strings", () => {
        const prd = {
          user_stories: [
            {
              id: "US-001",
              title: "Story With Empty Criteria",
              acceptance_criteria: ["Valid criterion", "", "  "],
              priority: 1,
            },
          ],
        };

        const result = validateStoryQuality(prd, defaultOptions);
        expect(result.valid).toBe(false);
        expect(
          result.storyErrors[0].errors.some((e) =>
            e.includes("empty acceptance criteria"),
          ),
        ).toBe(true);
      });

      it("allows custom minimum acceptance criteria", () => {
        const customOptions: StoryQualityOptions = {
          ...defaultOptions,
          minAcceptanceCriteria: 3,
        };

        const prd = {
          user_stories: [
            {
              id: "US-001",
              title: "Story With Two Criteria",
              acceptance_criteria: ["C1", "C2"],
              priority: 1,
            },
          ],
        };

        const result = validateStoryQuality(prd, customOptions);
        expect(result.valid).toBe(false);
        expect(
          result.storyErrors[0].errors.some((e) =>
            e.includes("required at least 3"),
          ),
        ).toBe(true);
      });
    });

    describe("priority range validation", () => {
      it("passes with priority in valid range (1-4)", () => {
        const prd = {
          user_stories: [
            {
              id: "US-001",
              title: "P1",
              acceptance_criteria: ["C1", "C2"],
              priority: 1,
            },
            {
              id: "US-002",
              title: "P2",
              acceptance_criteria: ["C1", "C2"],
              priority: 2,
            },
            {
              id: "US-003",
              title: "P3",
              acceptance_criteria: ["C1", "C2"],
              priority: 3,
            },
            {
              id: "US-004",
              title: "P4",
              acceptance_criteria: ["C1", "C2"],
              priority: 4,
            },
          ],
        };

        const result = validateStoryQuality(prd, defaultOptions);
        expect(result.valid).toBe(true);
      });

      it("fails with priority below minimum", () => {
        const prd = {
          user_stories: [
            {
              id: "US-001",
              title: "Zero Priority Story",
              acceptance_criteria: ["C1", "C2"],
              priority: 0,
            },
          ],
        };

        const result = validateStoryQuality(prd, defaultOptions);
        expect(result.valid).toBe(false);
        expect(
          result.storyErrors[0].errors.some((e) => e.includes("Priority")),
        ).toBe(true);
      });

      it("fails with priority above maximum", () => {
        const prd = {
          user_stories: [
            {
              id: "US-001",
              title: "High Priority Story",
              acceptance_criteria: ["C1", "C2"],
              priority: 5,
            },
          ],
        };

        const result = validateStoryQuality(prd, defaultOptions);
        expect(result.valid).toBe(false);
        expect(
          result.storyErrors[0].errors.some((e) => e.includes("Priority")),
        ).toBe(true);
      });

      it("fails with negative priority", () => {
        const prd = {
          user_stories: [
            {
              id: "US-001",
              title: "Negative Priority Story",
              acceptance_criteria: ["C1", "C2"],
              priority: -1,
            },
          ],
        };

        const result = validateStoryQuality(prd, defaultOptions);
        expect(result.valid).toBe(false);
        expect(
          result.storyErrors[0].errors.some((e) => e.includes("Priority")),
        ).toBe(true);
      });

      it("allows custom priority range", () => {
        const customOptions: StoryQualityOptions = {
          ...defaultOptions,
          minPriority: 1,
          maxPriority: 10,
        };

        const prd = {
          user_stories: [
            {
              id: "US-001",
              title: "Priority 10 Story",
              acceptance_criteria: ["C1", "C2"],
              priority: 10,
            },
          ],
        };

        const result = validateStoryQuality(prd, customOptions);
        expect(result.valid).toBe(true);
      });
    });

    describe("title validation", () => {
      it("passes with non-empty title", () => {
        const prd = {
          user_stories: [
            {
              id: "US-001",
              title: "Valid Title",
              acceptance_criteria: ["C1", "C2"],
              priority: 1,
            },
          ],
        };

        const result = validateStoryQuality(prd, defaultOptions);
        expect(result.valid).toBe(true);
      });

      it("fails with empty title", () => {
        const prd = {
          user_stories: [
            {
              id: "US-001",
              title: "",
              acceptance_criteria: ["C1", "C2"],
              priority: 1,
            },
          ],
        };

        const result = validateStoryQuality(prd, defaultOptions);
        expect(result.valid).toBe(false);
        expect(
          result.storyErrors[0].errors.some((e) => e.includes("title")),
        ).toBe(true);
      });

      it("fails with whitespace-only title", () => {
        const prd = {
          user_stories: [
            {
              id: "US-001",
              title: "   ",
              acceptance_criteria: ["C1", "C2"],
              priority: 1,
            },
          ],
        };

        const result = validateStoryQuality(prd, defaultOptions);
        expect(result.valid).toBe(false);
        expect(
          result.storyErrors[0].errors.some((e) => e.includes("title")),
        ).toBe(true);
      });
    });

    describe("multiple validation errors", () => {
      it("collects all errors from multiple stories", () => {
        const prd = {
          user_stories: [
            {
              id: "invalid-id",
              title: "",
              acceptance_criteria: ["Only one"],
              priority: 0,
            },
            {
              id: "US-002",
              title: "Valid Story",
              acceptance_criteria: ["C1", "C2"],
              priority: 2,
            },
            {
              id: "US-003",
              title: "Another Invalid",
              acceptance_criteria: [],
              priority: 5,
            },
          ],
        };

        const result = validateStoryQuality(prd, defaultOptions);
        expect(result.valid).toBe(false);
        expect(result.storyCount).toBe(3);
        expect(result.failedStoryCount).toBe(2);
        expect(result.storyErrors).toHaveLength(2);

        // First story has multiple errors
        const story1Errors = result.storyErrors.find(
          (e) => e.storyId === "invalid-id",
        );
        expect(story1Errors?.errors.length).toBeGreaterThan(1);

        // Third story has errors
        const story3Errors = result.storyErrors.find(
          (e) => e.storyId === "US-003",
        );
        expect(story3Errors?.errors.length).toBeGreaterThan(0);
      });

      it("includes story ID and title in error details", () => {
        const prd = {
          user_stories: [
            {
              id: "bad-id",
              title: "Bad Story",
              acceptance_criteria: ["C1"],
              priority: 1,
            },
          ],
        };

        const result = validateStoryQuality(prd, defaultOptions);
        expect(result.storyErrors[0].storyId).toBe("bad-id");
        expect(result.storyErrors[0].storyTitle).toBe("Bad Story");
        expect(result.errors[0]).toContain("bad-id");
        expect(result.errors[0]).toContain("Bad Story");
      });
    });

    describe("real-world examples", () => {
      it("validates a well-structured PRD", () => {
        const prd = {
          user_stories: [
            {
              id: "US-001",
              title: "User Registration",
              acceptance_criteria: [
                "User can register with email and password",
                "Password must be at least 8 characters",
                "Email verification is sent after registration",
              ],
              priority: 1,
            },
            {
              id: "US-002",
              title: "User Login",
              acceptance_criteria: [
                "User can log in with valid credentials",
                "Invalid credentials show error message",
                "Session persists across page refreshes",
              ],
              priority: 1,
            },
            {
              id: "US-003",
              title: "Password Reset",
              acceptance_criteria: [
                "User can request password reset via email",
                "Reset link expires after 24 hours",
                "User can set new password with valid link",
              ],
              priority: 2,
            },
          ],
        };

        const result = validateStoryQuality(prd, defaultOptions);
        expect(result.valid).toBe(true);
        expect(result.storyCount).toBe(3);
      });

      it("rejects a PRD with poor quality stories", () => {
        const prd = {
          user_stories: [
            {
              id: "story1",
              title: "Add auth",
              acceptance_criteria: ["Make it work"],
              priority: 1,
            },
            {
              id: "story2",
              title: "",
              acceptance_criteria: [],
              priority: 10,
            },
          ],
        };

        const result = validateStoryQuality(prd, defaultOptions);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThanOrEqual(2);
      });
    });

    describe("edge cases", () => {
      it("handles single story at boundary conditions", () => {
        const prd = {
          user_stories: [
            {
              id: "US-001",
              title: "Boundary Story",
              acceptance_criteria: ["C1", "C2"],
              priority: 1,
            },
          ],
        };

        const result = validateStoryQuality(prd, defaultOptions);
        expect(result.valid).toBe(true);
      });

      it("handles maximum allowed stories", () => {
        const prd = {
          user_stories: Array.from({ length: 15 }, (_, i) => ({
            id: `US-${String(i + 1).padStart(3, "0")}`,
            title: `Story ${i + 1}`,
            acceptance_criteria: ["C1", "C2"],
            priority: (i % 4) + 1,
          })),
        };

        const result = validateStoryQuality(prd, defaultOptions);
        expect(result.valid).toBe(true);
        expect(result.storyCount).toBe(15);
      });

      it("handles stories with exactly minimum acceptance criteria", () => {
        const prd = {
          user_stories: [
            {
              id: "US-001",
              title: "Minimum Criteria Story",
              acceptance_criteria: ["C1", "C2"],
              priority: 1,
            },
          ],
        };

        const result = validateStoryQuality(prd, defaultOptions);
        expect(result.valid).toBe(true);
      });

      it("handles stories at priority boundaries", () => {
        const prd = {
          user_stories: [
            {
              id: "US-001",
              title: "Min Priority",
              acceptance_criteria: ["C1", "C2"],
              priority: 1,
            },
            {
              id: "US-002",
              title: "Max Priority",
              acceptance_criteria: ["C1", "C2"],
              priority: 4,
            },
          ],
        };

        const result = validateStoryQuality(prd, defaultOptions);
        expect(result.valid).toBe(true);
      });
    });
  });

  describe("verifyStoryCompletion (Gap 1: Acceptance Criteria Verification)", () => {
    describe("with valid PRD and story", () => {
      it("returns valid when story has acceptance criteria", () => {
        const prd = {
          user_stories: [
            {
              id: "US-001",
              title: "Valid Story",
              acceptance_criteria: ["Criterion 1", "Criterion 2"],
              status: "pending",
            },
          ],
        };

        const result = verifyStoryCompletion("US-001", prd);
        expect(result.valid).toBe(true);
        expect(result.storyId).toBe("US-001");
        expect(result.warnings).toEqual([]);
        expect(result.errors).toEqual([]);
      });

      it("returns warning when story has no acceptance criteria", () => {
        const prd = {
          user_stories: [
            {
              id: "US-001",
              title: "No Criteria Story",
              acceptance_criteria: [],
              status: "pending",
            },
          ],
        };

        const result = verifyStoryCompletion("US-001", prd);
        expect(result.valid).toBe(true);
        expect(
          result.warnings.some((w) => w.includes("no acceptance criteria")),
        ).toBe(true);
      });

      it("returns warning when story has empty acceptance criteria", () => {
        const prd = {
          user_stories: [
            {
              id: "US-001",
              title: "Empty Criteria Story",
              acceptance_criteria: ["Valid", "", "  "],
              status: "pending",
            },
          ],
        };

        const result = verifyStoryCompletion("US-001", prd);
        expect(result.valid).toBe(true);
        expect(
          result.warnings.some((w) => w.includes("empty acceptance criteria")),
        ).toBe(true);
      });

      it("returns warning when story is already done", () => {
        const prd = {
          user_stories: [
            {
              id: "US-001",
              title: "Already Done Story",
              acceptance_criteria: ["C1", "C2"],
              status: "done",
            },
          ],
        };

        const result = verifyStoryCompletion("US-001", prd);
        expect(result.valid).toBe(true);
        expect(
          result.warnings.some((w) => w.includes("already marked as done")),
        ).toBe(true);
      });
    });

    describe("with invalid input", () => {
      it("returns error when PRD is null", () => {
        const result = verifyStoryCompletion("US-001", null);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes("PRD not loaded"))).toBe(
          true,
        );
      });

      it("returns error when story not found in PRD", () => {
        const prd = {
          user_stories: [
            {
              id: "US-001",
              title: "Story",
              acceptance_criteria: ["C1", "C2"],
              status: "pending",
            },
          ],
        };

        const result = verifyStoryCompletion("US-999", prd);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes("not found"))).toBe(true);
      });
    });

    describe("multiple warnings", () => {
      it("accumulates warnings from multiple issues", () => {
        const prd = {
          user_stories: [
            {
              id: "US-001",
              title: "Problem Story",
              acceptance_criteria: ["Valid", ""],
              status: "done",
            },
          ],
        };

        const result = verifyStoryCompletion("US-001", prd);
        expect(result.valid).toBe(true);
        expect(result.warnings.length).toBe(2);
        expect(
          result.warnings.some((w) => w.includes("empty acceptance criteria")),
        ).toBe(true);
        expect(
          result.warnings.some((w) => w.includes("already marked as done")),
        ).toBe(true);
      });
    });
  });
});
