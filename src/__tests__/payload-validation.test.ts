import { describe, expect, it } from "bun:test";
import {
  validatePayloadLimits,
  assertPayloadLimits,
  PAYLOAD_LIMITS,
  type PayloadValidationErrorDetails,
} from "../domain/validation";
import { PayloadValidationError } from "../errors";
import type { ParsedIdea } from "../domain/ideas";

describe("validatePayloadLimits", () => {
  describe("valid payloads", () => {
    it("accepts empty array", () => {
      const result = validatePayloadLimits([]);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("accepts single idea within limits", () => {
      const ideas: ParsedIdea[] = [
        {
          title: "Add dark mode",
          description: "Allow users to toggle between themes",
        },
      ];
      const result = validatePayloadLimits(ideas);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("accepts multiple ideas within all limits", () => {
      const ideas: ParsedIdea[] = Array.from({ length: 10 }, (_, i) => ({
        title: `Idea ${i}`,
        description: "A reasonable description",
        successCriteria: ["It works"],
      }));
      const result = validatePayloadLimits(ideas);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("accepts max ideas (50)", () => {
      const ideas: ParsedIdea[] = Array.from(
        { length: PAYLOAD_LIMITS.MAX_IDEAS },
        (_, i) => ({
          title: `Idea ${i}`,
          description: "Short description",
        }),
      );
      const result = validatePayloadLimits(ideas);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("accepts title at max length (120 chars)", () => {
      const ideas: ParsedIdea[] = [
        {
          title: "a".repeat(PAYLOAD_LIMITS.MAX_TITLE_LENGTH),
          description: "Description",
        },
      ];
      const result = validatePayloadLimits(ideas);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("accepts description at max length (2000 chars)", () => {
      const ideas: ParsedIdea[] = [
        {
          title: "Test",
          description: "a".repeat(PAYLOAD_LIMITS.MAX_DESCRIPTION_LENGTH),
        },
      ];
      const result = validatePayloadLimits(ideas);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("accepts max success criteria items (20)", () => {
      const ideas: ParsedIdea[] = [
        {
          title: "Test",
          description: "Description",
          successCriteria: Array.from(
            { length: PAYLOAD_LIMITS.MAX_SUCCESS_CRITERIA_ITEMS },
            (_, i) => `Criteria ${i}`,
          ),
        },
      ];
      const result = validatePayloadLimits(ideas);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("accepts ideas at total payload size limit (~100 KB)", () => {
      // Create ideas that are close to but under the limit
      const ideas: ParsedIdea[] = [];
      const ideaSize = 2000; // Approx size of one idea in bytes
      const numIdeas = Math.floor(
        (PAYLOAD_LIMITS.MAX_TOTAL_PAYLOAD_SIZE_BYTES - 1000) / ideaSize,
      );

      for (let i = 0; i < numIdeas; i++) {
        ideas.push({
          title: `Idea ${i}`.padEnd(100, "x"), // Add padding to increase size
          description: "x".repeat(500),
          successCriteria: ["Test"],
        });
      }

      const result = validatePayloadLimits(ideas);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("idea count violations", () => {
    it("rejects more than max ideas (50)", () => {
      const ideas: ParsedIdea[] = Array.from(
        { length: PAYLOAD_LIMITS.MAX_IDEAS + 1 },
        (_, i) => ({
          title: `Idea ${i}`,
          description: "Short",
        }),
      );
      const result = validatePayloadLimits(ideas);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Too many ideas");
      expect(result.errors[0]).toContain("51");
    });

    it("reports exact count in error message", () => {
      const ideas: ParsedIdea[] = Array.from({ length: 75 }, (_, i) => ({
        title: `Idea ${i}`,
        description: "Short",
      }));
      const result = validatePayloadLimits(ideas);
      expect(result.errors[0]).toContain("got 75");
    });
  });

  describe("title length violations", () => {
    it("rejects title exceeding 120 characters", () => {
      const ideas: ParsedIdea[] = [
        {
          title: "a".repeat(PAYLOAD_LIMITS.MAX_TITLE_LENGTH + 1),
          description: "Description",
        },
      ];
      const result = validatePayloadLimits(ideas);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Idea #1");
      expect(result.errors[0]).toContain("Title exceeds 120 characters");
      expect(result.errors[0]).toContain("121 characters");
    });

    it("reports multiple title violations", () => {
      const ideas: ParsedIdea[] = [
        { title: "a".repeat(150), description: "First" },
        { title: "b".repeat(200), description: "Second" },
      ];
      const result = validatePayloadLimits(ideas);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0]).toContain("Idea #1");
      expect(result.errors[1]).toContain("Idea #2");
    });
  });

  describe("description length violations", () => {
    it("rejects description exceeding 2000 characters", () => {
      const ideas: ParsedIdea[] = [
        {
          title: "Test",
          description: "a".repeat(PAYLOAD_LIMITS.MAX_DESCRIPTION_LENGTH + 1),
        },
      ];
      const result = validatePayloadLimits(ideas);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Idea #1");
      expect(result.errors[0]).toContain("Description exceeds 2000 characters");
      expect(result.errors[0]).toContain("2001 characters");
    });

    it("reports multiple description violations", () => {
      const ideas: ParsedIdea[] = [
        { title: "First", description: "a".repeat(2500) },
        { title: "Second", description: "b".repeat(3000) },
      ];
      const result = validatePayloadLimits(ideas);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0]).toContain("Idea #1");
      expect(result.errors[1]).toContain("Idea #2");
    });
  });

  describe("success criteria violations", () => {
    it("rejects success criteria exceeding 20 items", () => {
      const ideas: ParsedIdea[] = [
        {
          title: "Test",
          description: "Description",
          successCriteria: Array.from(
            { length: PAYLOAD_LIMITS.MAX_SUCCESS_CRITERIA_ITEMS + 1 },
            (_, i) => `Criteria ${i}`,
          ),
        },
      ];
      const result = validatePayloadLimits(ideas);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Idea #1");
      expect(result.errors[0]).toContain("Success criteria exceeds 20 items");
      expect(result.errors[0]).toContain("21 items");
    });

    it("reports multiple success criteria violations", () => {
      const ideas: ParsedIdea[] = [
        {
          title: "First",
          description: "Desc",
          successCriteria: Array.from({ length: 25 }, () => "x"),
        },
        {
          title: "Second",
          description: "Desc",
          successCriteria: Array.from({ length: 30 }, () => "y"),
        },
      ];
      const result = validatePayloadLimits(ideas);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0]).toContain("Idea #1");
      expect(result.errors[1]).toContain("Idea #2");
    });
  });

  describe("total payload size violations", () => {
    it("rejects payload exceeding 100 KB", () => {
      // Create a payload that exceeds 100 KB
      const ideas: ParsedIdea[] = [];
      const largeDescription = "x".repeat(3000); // Each idea is ~3KB

      // Create 35 ideas with 3KB each = ~105 KB total
      for (let i = 0; i < 35; i++) {
        ideas.push({
          title: `Very Large Idea Title With Lots of Padding ${i}`.repeat(10),
          description: largeDescription,
          successCriteria: ["Criteria 1", "Criteria 2", "Criteria 3"],
          problemStatement: "A".repeat(500),
          motivation: "B".repeat(500),
        });
      }

      const result = validatePayloadLimits(ideas);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes("Total payload size exceeds")),
      ).toBe(true);
      expect(result.errors.some((e) => e.includes("100 KB"))).toBe(true);
    });

    it("includes size in KB and bytes in error message", () => {
      const ideas: ParsedIdea[] = [];
      const largeDescription = "x".repeat(5000);

      for (let i = 0; i < 25; i++) {
        ideas.push({
          title: `Large Idea ${i}`.repeat(50),
          description: largeDescription,
        });
      }

      const result = validatePayloadLimits(ideas);
      const sizeError = result.errors.find((e) =>
        e.includes("Total payload size"),
      );
      expect(sizeError).toBeDefined();
      expect(sizeError).toMatch(/\d+\.\d+ KB/); // e.g., "123.45 KB"
      expect(sizeError).toMatch(/\d+ bytes/); // e.g., "123456 bytes"
    });
  });

  describe("multiple violations", () => {
    it("reports all violations together", () => {
      const ideas: ParsedIdea[] = [
        {
          title: "a".repeat(150), // Too long
          description: "b".repeat(2500), // Too long
          successCriteria: Array.from({ length: 25 }, () => "x"), // Too many
        },
      ];

      const result = validatePayloadLimits(ideas);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
      expect(result.errors.some((e) => e.includes("Title exceeds"))).toBe(true);
      expect(result.errors.some((e) => e.includes("Description exceeds"))).toBe(
        true,
      );
      expect(
        result.errors.some((e) => e.includes("Success criteria exceeds")),
      ).toBe(true);
    });

    it("reports violations across multiple ideas", () => {
      const ideas: ParsedIdea[] = [
        { title: "a".repeat(150), description: "First" }, // Title too long
        { title: "Second", description: "b".repeat(2500) }, // Description too long
        {
          title: "Third",
          description: "c".repeat(150),
          successCriteria: Array.from({ length: 25 }, () => "x"),
        }, // Success criteria too many
      ];

      const result = validatePayloadLimits(ideas);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
      expect(
        result.errors.filter((e) => e.includes("Idea #1")).length,
      ).toBeGreaterThanOrEqual(1);
      expect(
        result.errors.filter((e) => e.includes("Idea #2")).length,
      ).toBeGreaterThanOrEqual(1);
      expect(
        result.errors.filter((e) => e.includes("Idea #3")).length,
      ).toBeGreaterThanOrEqual(1);
    });
  });

  describe("edge cases", () => {
    it("handles ideas with optional fields missing", () => {
      const ideas: ParsedIdea[] = [
        {
          title: "Test",
          description: "Description",
          // No success criteria - should not cause error
        },
      ];
      const result = validatePayloadLimits(ideas);
      expect(result.valid).toBe(true);
    });

    it("handles empty strings in optional fields", () => {
      const ideas: ParsedIdea[] = [
        {
          title: "",
          description: "",
          successCriteria: [],
        },
      ];
      const result = validatePayloadLimits(ideas);
      expect(result.valid).toBe(true); // Empty title is technically within length limit
    });

    it("handles ideas with all optional fields", () => {
      const ideas: ParsedIdea[] = [
        {
          title: "Complete Idea",
          description: "Full description",
          problemStatement: "Problem",
          motivation: "Motivation",
          successCriteria: ["Criteria 1", "Criteria 2"],
          technicalConstraints: ["Constraint 1"],
          scope: {
            inScope: ["In scope"],
            outOfScope: ["Out of scope"],
          },
          priorityHint: "high",
          urgencyHint: "ASAP",
          suggestedSection: "frontend",
        },
      ];
      const result = validatePayloadLimits(ideas);
      expect(result.valid).toBe(true);
    });
  });
});

describe("assertPayloadLimits", () => {
  it("does not throw for valid payloads", () => {
    const ideas: ParsedIdea[] = [
      {
        title: "Valid idea",
        description: "Valid description",
      },
    ];
    expect(() => assertPayloadLimits(ideas)).not.toThrow();
  });

  it("throws PayloadValidationError for invalid payloads", () => {
    const ideas: ParsedIdea[] = Array.from(
      { length: PAYLOAD_LIMITS.MAX_IDEAS + 1 },
      (_, i) => ({
        title: `Idea ${i}`,
        description: "Short",
      }),
    );
    expect(() => assertPayloadLimits(ideas)).toThrow(PayloadValidationError);
  });

  it("includes all violations in error message", () => {
    const ideas: ParsedIdea[] = [
      {
        title: "a".repeat(150),
        description: "b".repeat(2500),
        successCriteria: Array.from({ length: 25 }, () => "x"),
      },
    ];

    try {
      assertPayloadLimits(ideas);
      expect(true).toBe(false); // Should have thrown
    } catch (error) {
      const err = error as PayloadValidationError;
      expect(err.message).toContain("Payload validation failed");
      expect(err.message).toContain("Title exceeds");
      expect(err.message).toContain("Description exceeds");
      expect(err.message).toContain("Success criteria exceeds");
    }
  });

  it("formats error message with bullet points", () => {
    const ideas: ParsedIdea[] = [
      { title: "a".repeat(150), description: "First" },
      { title: "Second", description: "b".repeat(2500) },
    ];

    try {
      assertPayloadLimits(ideas);
      expect(true).toBe(false); // Should have thrown
    } catch (error) {
      const err = error as PayloadValidationError;
      expect(err.message).toContain("  - "); // Bullet point prefix
    }
  });

  it("has correct error code", () => {
    const ideas: ParsedIdea[] = Array.from({ length: 100 }, (_, i) => ({
      title: `Idea ${i}`,
      description: "Short",
    }));

    try {
      assertPayloadLimits(ideas);
      expect(true).toBe(false); // Should have thrown
    } catch (error) {
      const err = error as PayloadValidationError;
      expect(err.code).toBe("PAYLOAD_VALIDATION");
    }
  });
});
