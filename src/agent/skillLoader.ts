/**
 * Phase-Specific Skill Loading (Item 033)
 *
 * This module implements dynamic skill loading per phase with JIT context orchestration.
 * Skills define reusable capabilities (tools, MCP servers, context) that can be
 * composed for specific phases while respecting security boundaries.
 */

import type { SkillConfig, Skill, SkillContextRequirement } from "../schemas";
import { PHASE_TOOL_ALLOWLISTS } from "./toolAllowlist";

/**
 * Result of loading skills for a phase.
 * Contains merged tool allowlist, MCP servers, and context requirements.
 */
export interface SkillLoadResult {
  /**
   * Merged tool allowlist for the phase.
   * Intersection of phase tools and skill tools.
   * If undefined, no tool restrictions (all tools allowed).
   */
  allowedTools: string[] | undefined;

  /**
   * MCP servers to attach from skills.
   * Merged from all skills loaded for the phase.
   */
  mcpServers: Record<string, unknown>;

  /**
   * JIT context requirements from loaded skills.
   * These will be used to build context for prompts.
   */
  contextRequirements: SkillContextRequirement[];

  /**
   * IDs of skills that were successfully loaded for this phase.
   */
  loadedSkillIds: string[];
}

/**
 * Load skills for a specific phase.
 *
 * This function:
 * 1. Looks up skill IDs for the phase from config
 * 2. Resolves skill definitions from skill library
 * 3. Merges tool allowlists (intersection with phase tools)
 * 4. Aggregates MCP servers from all skills
 * 5. Collects context requirements for JIT loading
 *
 * Security: Skills cannot exceed phase tool permissions. The resulting
 * allowedTools is the intersection of phase tools and skill tools.
 *
 * @param phase - The workflow phase (e.g., "research", "implement")
 * @param skillConfig - Optional skill configuration from wreckit config
 * @returns Skill load result with merged tools, MCP servers, and context requirements
 */
export function loadSkillsForPhase(
  phase: string,
  skillConfig: SkillConfig | undefined,
): SkillLoadResult {
  // Default result if no skills configured
  if (!skillConfig) {
    return {
      allowedTools: PHASE_TOOL_ALLOWLISTS[phase],
      mcpServers: {},
      contextRequirements: [],
      loadedSkillIds: [],
    };
  }

  // Get skill IDs for this phase
  const skillIds = skillConfig.phase_skills[phase];
  if (!skillIds || skillIds.length === 0) {
    return {
      allowedTools: PHASE_TOOL_ALLOWLISTS[phase],
      mcpServers: {},
      contextRequirements: [],
      loadedSkillIds: [],
    };
  }

  // Resolve skill definitions
  const skills: Skill[] = [];
  for (const skillId of skillIds) {
    const skill = skillConfig.skills.find((s) => s.id === skillId);
    if (!skill) {
      // Unknown skill ID - skip with warning (could log here)
      continue;
    }
    skills.push(skill);
  }

  // Get phase tool allowlist (security boundary)
  const phaseTools = PHASE_TOOL_ALLOWLISTS[phase];

  // Merge skill tools (union of all skill tools)
  const skillTools = new Set<string>();
  for (const skill of skills) {
    for (const tool of skill.tools) {
      skillTools.add(tool);
    }
  }

  // Calculate allowed tools: intersection of phase tools and skill tools
  let allowedTools: string[] | undefined;
  if (phaseTools) {
    // Phase has restrictions: intersect with skill tools
    allowedTools = phaseTools.filter((tool) => skillTools.has(tool));
  } else {
    // Phase has no restrictions: use all skill tools
    // If no skills define tools, this is empty array (no tools allowed)
    // If no skills loaded, use undefined (no restrictions)
    if (skills.length > 0 && skillTools.size > 0) {
      allowedTools = Array.from(skillTools);
    } else {
      allowedTools = undefined; // No restrictions
    }
  }

  // Aggregate MCP servers from all skills
  const mcpServers: Record<string, unknown> = {};
  for (const skill of skills) {
    if (skill.mcp_servers) {
      Object.assign(mcpServers, skill.mcp_servers);
    }
  }

  // Collect context requirements from all skills
  const contextRequirements: SkillContextRequirement[] = [];
  for (const skill of skills) {
    if (skill.required_context) {
      contextRequirements.push(...skill.required_context);
    }
  }

  return {
    allowedTools,
    mcpServers,
    contextRequirements,
    loadedSkillIds: skills.map((s) => s.id),
  };
}
