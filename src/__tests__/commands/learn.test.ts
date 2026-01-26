import { describe, it, expect, mock } from "bun:test";
import { mergeSkillConfigs, type LearnOptions } from "../../commands/learn";
import type { SkillConfig } from "../../schemas";
import { getAllowedToolsForPhase } from "../../agent/toolAllowlist";

describe("learn command", () => {
  describe("mergeSkillConfigs", () => {
    it("should return extracted config when no existing config", async () => {
      const extracted: SkillConfig = {
        phase_skills: {
          research: ["skill-1"],
          plan: ["skill-2"],
        },
        skills: [
          {
            id: "skill-1",
            name: "Skill 1",
            description: "Test skill 1",
            tools: ["Read"],
          },
          {
            id: "skill-2",
            name: "Skill 2",
            description: "Test skill 2",
            tools: ["Write"],
          },
        ],
      };

      const result = await mergeSkillConfigs(null, extracted, "append");
      expect(result).toEqual(extracted);
    });

    it("should append new skills to existing skills", async () => {
      const existing: SkillConfig = {
        phase_skills: {
          research: ["existing-skill"],
          plan: [],
        },
        skills: [
          {
            id: "existing-skill",
            name: "Existing Skill",
            description: "Existing skill",
            tools: ["Read"],
          },
        ],
      };

      const extracted: SkillConfig = {
        phase_skills: {
          research: ["new-skill"],
          plan: ["new-skill"],
        },
        skills: [
          {
            id: "new-skill",
            name: "New Skill",
            description: "New skill",
            tools: ["Grep"],
          },
        ],
      };

      const result = await mergeSkillConfigs(existing, extracted, "append");

      // Should have both skills
      expect(result.skills).toHaveLength(2);
      expect(result.skills.find(s => s.id === "existing-skill")).toBeDefined();
      expect(result.skills.find(s => s.id === "new-skill")).toBeDefined();

      // Should merge phase_skills
      expect(result.phase_skills.research).toEqual(["existing-skill", "new-skill"]);
      expect(result.phase_skills.plan).toEqual(["new-skill"]);
    });

    it("should not duplicate skills with same ID when appending", async () => {
      const existing: SkillConfig = {
        phase_skills: {
          research: ["skill-1"],
        },
        skills: [
          {
            id: "skill-1",
            name: "Skill 1",
            description: "Original",
            tools: ["Read"],
          },
        ],
      };

      const extracted: SkillConfig = {
        phase_skills: {
          research: ["skill-1"],
          plan: ["skill-1"],
        },
        skills: [
          {
            id: "skill-1",
            name: "Skill 1",
            description: "Updated",
            tools: ["Read", "Grep"],
          },
        ],
      };

      const result = await mergeSkillConfigs(existing, extracted, "append");

      // Should keep existing skill, not add duplicate
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0].description).toBe("Original"); // Kept existing
      expect(result.skills[0].tools).toEqual(["Read"]); // Kept existing

      // Should merge phase_skills (skill-1 added to plan)
      expect(result.phase_skills.research).toEqual(["skill-1"]);
      expect(result.phase_skills.plan).toEqual(["skill-1"]);
    });

    it("should replace all skills with replace strategy", async () => {
      const existing: SkillConfig = {
        phase_skills: {
          research: ["old-skill"],
        },
        skills: [
          {
            id: "old-skill",
            name: "Old Skill",
            description: "Old skill",
            tools: ["Read"],
          },
        ],
      };

      const extracted: SkillConfig = {
        phase_skills: {
          research: ["new-skill"],
        },
        skills: [
          {
            id: "new-skill",
            name: "New Skill",
            description: "New skill",
            tools: ["Write"],
          },
        ],
      };

      const result = await mergeSkillConfigs(existing, extracted, "replace");

      // Should only have new skill
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0].id).toBe("new-skill");
      expect(result.phase_skills).toEqual(extracted.phase_skills);
    });

    it("should merge complex phase_skills mappings", async () => {
      const existing: SkillConfig = {
        phase_skills: {
          research: ["skill-a", "skill-b"],
          plan: ["skill-c"],
        },
        skills: [
          { id: "skill-a", name: "A", description: "A", tools: ["Read"] },
          { id: "skill-b", name: "B", description: "B", tools: ["Grep"] },
          { id: "skill-c", name: "C", description: "C", tools: ["Write"] },
        ],
      };

      const extracted: SkillConfig = {
        phase_skills: {
          research: ["skill-d"],
          plan: ["skill-c", "skill-d"],
          implement: ["skill-e"],
        },
        skills: [
          { id: "skill-d", name: "D", description: "D", tools: ["Edit"] },
          { id: "skill-e", name: "E", description: "E", tools: ["Bash"] },
        ],
      };

      const result = await mergeSkillConfigs(existing, extracted, "append");

      // All skills should be present
      expect(result.skills).toHaveLength(5);

      // phase_skills should be merged
      expect(result.phase_skills.research).toEqual(["skill-a", "skill-b", "skill-d"]);
      expect(result.phase_skills.plan).toEqual(["skill-c", "skill-d"]);
      expect(result.phase_skills.implement).toEqual(["skill-e"]);
    });

    describe("ask strategy", () => {
      it("should fall back to append when not in TTY environment", async () => {
        const originalIsTTY = process.stdout.isTTY;
        Object.defineProperty(process.stdout, "isTTY", { value: false, configurable: true });

        try {
          const existing: SkillConfig = {
            phase_skills: {
              research: ["existing-skill"],
            },
            skills: [
              {
                id: "existing-skill",
                name: "Existing Skill",
                description: "Existing skill",
                tools: ["Read"],
              },
            ],
          };

          const extracted: SkillConfig = {
            phase_skills: {
              plan: ["new-skill"],
            },
            skills: [
              {
                id: "new-skill",
                name: "New Skill",
                description: "New skill",
                tools: ["Grep"],
              },
            ],
          };

          const result = await mergeSkillConfigs(existing, extracted, "ask");

          // Should behave like append (fallback)
          expect(result.skills).toHaveLength(2);
          expect(result.skills.find(s => s.id === "existing-skill")).toBeDefined();
          expect(result.skills.find(s => s.id === "new-skill")).toBeDefined();
          expect(result.phase_skills.research).toEqual(["existing-skill"]);
          expect(result.phase_skills.plan).toEqual(["new-skill"]);
        } finally {
          Object.defineProperty(process.stdout, "isTTY", { value: originalIsTTY, configurable: true });
        }
      });

      it("should detect TTY environment correctly", async () => {
        // This test verifies that isTTY is being checked
        // In actual CI/non-TTY, it falls back to append
        // In TTY, it would use interactive prompts (manual testing needed)
        const originalIsTTY = process.stdout.isTTY;

        try {
          // Test with TTY explicitly disabled
          Object.defineProperty(process.stdout, "isTTY", { value: false, configurable: true });

          const existing: SkillConfig = {
            phase_skills: { research: ["skill-1"] },
            skills: [{ id: "skill-1", name: "Skill 1", description: "Test", tools: ["Read"] }],
          };

          const extracted: SkillConfig = {
            phase_skills: { plan: ["skill-2"] },
            skills: [{ id: "skill-2", name: "Skill 2", description: "Test", tools: ["Grep"] }],
          };

          const result = await mergeSkillConfigs(existing, extracted, "ask");

          // Verify fallback behavior
          expect(result.skills).toHaveLength(2);
          expect(result.phase_skills.research).toEqual(["skill-1"]);
          expect(result.phase_skills.plan).toEqual(["skill-2"]);
        } finally {
          Object.defineProperty(process.stdout, "isTTY", { value: originalIsTTY, configurable: true });
        }
      });

      it("should handle non-TTY environments gracefully", async () => {
        // Verify that the function doesn't throw in non-TTY environments
        const originalIsTTY = process.stdout.isTTY;
        Object.defineProperty(process.stdout, "isTTY", { value: false, configurable: true });

        try {
          const existing: SkillConfig = {
            phase_skills: {
              research: ["conflict-skill"],
            },
            skills: [
              { id: "conflict-skill", name: "Conflict", description: "Test", tools: ["Read"] },
            ],
          };

          const extracted: SkillConfig = {
            phase_skills: {
              plan: ["conflict-skill"], // Same skill, different phase - would be a conflict in TTY
            },
            skills: [
              { id: "conflict-skill", name: "Conflict", description: "Test", tools: ["Read"] },
            ],
          };

          // Should not throw, should fall back to append
          const result = await mergeSkillConfigs(existing, extracted, "ask");

          // In append fallback, skill appears in both phases
          expect(result.phase_skills.research).toContain("conflict-skill");
          expect(result.phase_skills.plan).toContain("conflict-skill");
        } finally {
          Object.defineProperty(process.stdout, "isTTY", { value: originalIsTTY, configurable: true });
        }
      });
    });
  });

  describe("tool permission validation", () => {
    it("should identify tools allowed in research phase", () => {
      const allowedTools = getAllowedToolsForPhase("research");
      expect(allowedTools).toBeDefined();
      expect(allowedTools).toContain("Read");
      expect(allowedTools).toContain("Write");
      expect(allowedTools).toContain("Glob");
      expect(allowedTools).toContain("Grep");
    });

    it("should identify tools allowed in implement phase", () => {
      const allowedTools = getAllowedToolsForPhase("implement");
      expect(allowedTools).toBeDefined();
      expect(allowedTools).toContain("Read");
      expect(allowedTools).toContain("Write");
      expect(allowedTools).toContain("Edit");
      expect(allowedTools).toContain("Glob");
      expect(allowedTools).toContain("Grep");
      expect(allowedTools).toContain("Bash");
    });

    it("should identify tools allowed in learn phase", () => {
      const allowedTools = getAllowedToolsForPhase("learn");
      expect(allowedTools).toBeDefined();
      expect(allowedTools).toContain("Read");
      expect(allowedTools).toContain("Write");
      expect(allowedTools).toContain("Glob");
      expect(allowedTools).toContain("Grep");
      // Learn phase should not have Bash
      expect(allowedTools).not.toContain("Bash");
    });

    it("should allowlist learn phase with correct tools", () => {
      const allowedTools = getAllowedToolsForPhase("learn");
      expect(allowedTools).toEqual(expect.arrayContaining([
        "Read",
        "Write",
        "Glob",
        "Grep",
      ]));
      expect(allowedTools?.length).toBe(4);
    });
  });

  describe("LearnOptions type", () => {
    it("should accept valid options", () => {
      const options: LearnOptions = {
        item: "033",
        phase: "done",
        all: true,
        output: "/tmp/skills.json",
        merge: "append",
        review: false,
        dryRun: true,
        cwd: "/tmp",
        verbose: true,
      };
      expect(options).toBeDefined();
    });

    it("should accept options with only required fields", () => {
      const options: LearnOptions = {
        dryRun: false,
      };
      expect(options).toBeDefined();
    });

    it("should accept all merge strategies", () => {
      const append: LearnOptions = { merge: "append" };
      const replace: LearnOptions = { merge: "replace" };
      const ask: LearnOptions = { merge: "ask" };

      expect(append.merge).toBe("append");
      expect(replace.merge).toBe("replace");
      expect(ask.merge).toBe("ask");
    });
  });

  describe("SkillConfig schema compliance", () => {
    it("should accept valid skill config", () => {
      const config: SkillConfig = {
        phase_skills: {
          research: ["code-exploration"],
          plan: ["documentation-writer"],
        },
        skills: [
          {
            id: "code-exploration",
            name: "Code Exploration",
            description: "Read-only codebase analysis",
            tools: ["Read", "Glob", "Grep"],
            required_context: [
              {
                type: "git_status",
                description: "Current repository state",
              },
            ],
            mcp_servers: {},
          },
        ],
      };
      expect(config.phase_skills).toBeDefined();
      expect(config.skills).toBeDefined();
      expect(config.skills[0].id).toBe("code-exploration");
    });

    it("should accept skills without optional fields", () => {
      const config: SkillConfig = {
        phase_skills: {
          research: ["minimal-skill"],
        },
        skills: [
          {
            id: "minimal-skill",
            name: "Minimal Skill",
            description: "A minimal skill definition",
            tools: ["Read"],
          },
        ],
      };
      expect(config.skills[0].required_context).toBeUndefined();
      expect(config.skills[0].mcp_servers).toBeUndefined();
    });
  });
});
