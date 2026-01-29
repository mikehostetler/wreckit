import { describe, it, expect } from "bun:test";
import { PrdSchema } from "../schemas";

/**
 * Test suite for Gap 4: Schema Version Inconsistency
 *
 * Per 003-plan-phase.md:
 * - MCP tool submissions enforce `schema_version: 1` strictly
 * - Direct file writes should also enforce `schema_version: 1`
 *
 * This validates that the PrdSchema aligns with the MCP tool's strict validation.
 */
describe("PRD Schema Validation (Gap 4: Schema Version Inconsistency)", () => {
  describe("schema_version enforcement", () => {
    const basePrd = {
      schema_version: 1,
      id: "001-test",
      branch_name: "wreckit/001-test",
      user_stories: [
        {
          id: "US-001",
          title: "Test Story",
          acceptance_criteria: ["Criterion 1", "Criterion 2"],
          priority: 1,
          status: "pending",
          notes: "",
        },
      ],
    };

    it("accepts PRD with schema_version: 1", () => {
      const result = PrdSchema.safeParse(basePrd);
      expect(result.success).toBe(true);
    });

    it("rejects PRD with schema_version: 0", () => {
      const prd = { ...basePrd, schema_version: 0 };
      const result = PrdSchema.safeParse(prd);
      expect(result.success).toBe(false);
    });

    it("rejects PRD with schema_version: 2", () => {
      const prd = { ...basePrd, schema_version: 2 };
      const result = PrdSchema.safeParse(prd);
      expect(result.success).toBe(false);
    });

    it("rejects PRD with schema_version: 99", () => {
      const prd = { ...basePrd, schema_version: 99 };
      const result = PrdSchema.safeParse(prd);
      expect(result.success).toBe(false);
    });

    it("rejects PRD with schema_version as string", () => {
      const prd = { ...basePrd, schema_version: "1" };
      const result = PrdSchema.safeParse(prd);
      expect(result.success).toBe(false);
    });

    it("rejects PRD with missing schema_version", () => {
      const prd = {
        id: "001-test",
        branch_name: "wreckit/001-test",
        user_stories: [],
      };
      const result = PrdSchema.safeParse(prd);
      expect(result.success).toBe(false);
    });

    it("rejects PRD with null schema_version", () => {
      const prd = { ...basePrd, schema_version: null };
      const result = PrdSchema.safeParse(prd);
      expect(result.success).toBe(false);
    });
  });

  describe("alignment with MCP tool schema", () => {
    /**
     * The MCP save_prd tool in src/agent/mcp/wreckitMcpServer.ts uses:
     *   z.literal(1) for schema_version
     *
     * This ensures file validation matches MCP tool validation exactly.
     */

    it("accepts valid PRD that matches MCP tool expectations", () => {
      const validPrd = {
        schema_version: 1,
        id: "001-feature",
        branch_name: "wreckit/001-feature",
        user_stories: [
          {
            id: "US-001",
            title: "Core functionality",
            acceptance_criteria: [
              "Feature works when X",
              "Feature handles Y correctly",
            ],
            priority: 1,
            status: "pending" as const,
            notes: "Implementation notes here",
          },
          {
            id: "US-002",
            title: "Edge cases",
            acceptance_criteria: ["Handles empty input", "Handles null values"],
            priority: 2,
            status: "pending" as const,
            notes: "",
          },
        ],
      };

      const result = PrdSchema.safeParse(validPrd);
      expect(result.success).toBe(true);

      if (result.success) {
        // Verify the parsed data maintains schema_version: 1
        expect(result.data.schema_version).toBe(1);
        expect(result.data.user_stories).toHaveLength(2);
      }
    });
  });

  describe("error messages", () => {
    it("provides helpful error for wrong schema_version", () => {
      const prd = {
        schema_version: 2,
        id: "001-test",
        branch_name: "wreckit/001-test",
        user_stories: [],
      };

      const result = PrdSchema.safeParse(prd);
      expect(result.success).toBe(false);

      if (!result.success) {
        // The error should mention the literal value requirement
        const errorString = JSON.stringify(result.error);
        expect(errorString).toContain("1");
      }
    });
  });

  describe("real-world scenarios", () => {
    it("accepts minimal valid PRD", () => {
      const minimalPrd = {
        schema_version: 1,
        id: "001-minimal",
        branch_name: "wreckit/001-minimal",
        user_stories: [
          {
            id: "US-001",
            title: "Only story",
            acceptance_criteria: ["Must work"],
            priority: 1,
            status: "pending" as const,
            notes: "",
          },
        ],
      };

      const result = PrdSchema.safeParse(minimalPrd);
      expect(result.success).toBe(true);
    });

    it("accepts PRD with many stories", () => {
      const manyStories: Array<{
        id: string;
        title: string;
        acceptance_criteria: string[];
        priority: number;
        status: "pending" | "done";
        notes: string;
      }> = [];

      for (let i = 1; i <= 15; i++) {
        manyStories.push({
          id: `US-${String(i).padStart(3, "0")}`,
          title: `Story ${i}`,
          acceptance_criteria: [`Criterion ${i}-1`, `Criterion ${i}-2`],
          priority: Math.ceil(i / 5),
          status: "pending" as const,
          notes: "",
        });
      }

      const prd = {
        schema_version: 1,
        id: "001-many-stories",
        branch_name: "wreckit/001-many-stories",
        user_stories: manyStories,
      };

      const result = PrdSchema.safeParse(prd);
      expect(result.success).toBe(true);
    });

    it("rejects PRD from old schema version", () => {
      // Simulates a PRD created before schema_version: 1 was enforced
      const oldPrd = {
        schema_version: 0,
        id: "001-old",
        branch_name: "wreckit/001-old",
        user_stories: [
          {
            id: "US-001",
            title: "Old story",
            acceptance_criteria: ["Old criterion"],
            priority: 1,
            status: "pending" as const,
            notes: "",
          },
        ],
      };

      const result = PrdSchema.safeParse(oldPrd);
      expect(result.success).toBe(false);
    });

    it("rejects PRD from future schema version", () => {
      // Simulates a PRD created with a future schema version
      const futurePrd = {
        schema_version: 2,
        id: "001-future",
        branch_name: "wreckit/001-future",
        user_stories: [
          {
            id: "US-001",
            title: "Future story",
            acceptance_criteria: ["Future criterion"],
            priority: 1,
            status: "pending" as const,
            notes: "",
          },
        ],
      };

      const result = PrdSchema.safeParse(futurePrd);
      expect(result.success).toBe(false);
    });
  });
});
